/// <reference lib="webworker" />

import {
  CatalogOfflineStore,
  unsupportedCatalogOfflineStatus,
  type CatalogOfflineStatus,
} from './catalogOfflineStore'
import {
  fetchProgressiveAsset,
  loadProgressiveDetailChunk,
  loadProgressiveHostSkyIndex,
  loadProgressiveManifest,
  loadProgressiveSearchIndex,
  validateProgressiveDetailChunk,
  validateProgressiveHostSkyIndex,
  validateProgressiveSearchIndex,
  verifyProgressiveAssetBytes,
  type ProgressiveDetailChunk,
  type ProgressiveExoplanetManifest,
  type ProgressiveHostSkyIndex,
  type ProgressiveSearchIndex,
} from './progressiveExoplanetCatalog'
import {
  prepareProgressiveIndex,
  queryProgressiveIndex,
  type PreparedProgressiveIndex,
} from './progressiveCatalogSearch'
import {
  prepareObservedHostIndex,
  streamObservedSystem,
  type PreparedObservedHostIndex,
} from './progressiveObservedSystem'
import type {
  CatalogLoadSource,
  CatalogWorkerRequest,
  CatalogWorkerResponse,
} from './progressiveCatalogProtocol'

interface WorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<CatalogWorkerRequest>) => void,
  ): void
  postMessage(message: CatalogWorkerResponse): void
}

interface ReadyCatalog {
  readonly manifest: ProgressiveExoplanetManifest
  readonly readyMs: number
  readonly prepareMs: number
  readonly loadSource: CatalogLoadSource
  readonly offline: CatalogOfflineStatus
}

interface CancellableRequest {
  cancelled: boolean
  readonly controllers: Set<AbortController>
}

const scope = self as unknown as WorkerScope
const DETAIL_CACHE_LIMIT = 2
const PERSISTENT_DETAIL_CACHE_LIMIT = 4
const SYSTEM_LOAD_CONCURRENCY = 2
const OFFLINE_INSTALL_CONCURRENCY = 2
const MANIFEST_TIMEOUT_MS = 12_000

let manifest: ProgressiveExoplanetManifest | null = null
let preparedIndex: PreparedProgressiveIndex | null = null
let preparedHostIndex: PreparedObservedHostIndex | null = null
let hostSkyIndex: ProgressiveHostSkyIndex | null = null
let initialization: Promise<ReadyCatalog> | null = null
let persistentStorageAvailable = true
const offlineStore = new CatalogOfflineStore()
const chunkCache = new Map<number, ProgressiveDetailChunk>()
const detailRequests = new Map<number, CancellableRequest>()
const systemRequests = new Map<number, CancellableRequest>()
const skyRequests = new Map<number, CancellableRequest>()
const installRequests = new Map<number, CancellableRequest>()

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'The catalogue worker could not complete the request.'
}

function post(message: CatalogWorkerResponse): void {
  scope.postMessage(message)
}

async function optionalStorage<T>(
  operation: () => Promise<T>,
  fallback: T,
): Promise<T> {
  if (!persistentStorageAvailable || !offlineStore.supported) return fallback
  try {
    return await operation()
  } catch {
    persistentStorageAvailable = false
    return fallback
  }
}

async function offlineStatus(
  activeManifest: ProgressiveExoplanetManifest,
): Promise<CatalogOfflineStatus> {
  return optionalStorage(
    () => offlineStore.status(activeManifest),
    unsupportedCatalogOfflineStatus(activeManifest),
  )
}

async function networkRelease(): Promise<{
  manifest: ProgressiveExoplanetManifest
  index: ProgressiveSearchIndex
}> {
  const nextManifest = await loadProgressiveManifest(
    AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
  )
  const cachedBytes = await optionalStorage(
    () => offlineStore.asset(nextManifest.searchIndex),
    null,
  )
  if (cachedBytes) {
    try {
      const index = await loadProgressiveSearchIndex(
        nextManifest,
        undefined,
        cachedBytes,
      )
      await optionalStorage(
        () => offlineStore.activateRelease(nextManifest, cachedBytes),
        undefined,
      )
      return { manifest: nextManifest, index }
    } catch {
      // A corrupt cached core is ignored and replaced by the verified network asset.
    }
  }
  const fetched = await fetchProgressiveAsset(nextManifest.searchIndex)
  const index = validateProgressiveSearchIndex(fetched.value, nextManifest)
  await optionalStorage(
    () => offlineStore.activateRelease(nextManifest, fetched.bytes),
    undefined,
  )
  return { manifest: nextManifest, index }
}

async function cachedRelease(): Promise<{
  manifest: ProgressiveExoplanetManifest
  index: ProgressiveSearchIndex
}> {
  const cached = await optionalStorage(() => offlineStore.activeRelease(), null)
  if (!cached) throw new Error('No verified offline catalogue core is installed yet.')
  return {
    manifest: cached.manifest,
    index: await loadProgressiveSearchIndex(
      cached.manifest,
      undefined,
      cached.indexBytes,
    ),
  }
}

async function initialize(): Promise<ReadyCatalog> {
  initialization ??= (async () => {
    const started = performance.now()
    let release: Awaited<ReturnType<typeof networkRelease>>
    let loadSource: CatalogLoadSource = 'network'
    try {
      release = await networkRelease()
    } catch (networkError: unknown) {
      try {
        release = await cachedRelease()
        loadSource = 'offline-cache'
      } catch {
        throw networkError
      }
    }
    manifest = release.manifest
    const prepareStarted = performance.now()
    preparedIndex = prepareProgressiveIndex(release.index)
    preparedHostIndex = prepareObservedHostIndex(release.index)
    const prepareMs = performance.now() - prepareStarted
    const offline = await offlineStatus(release.manifest)
    return {
      manifest: release.manifest,
      readyMs: performance.now() - started,
      prepareMs,
      loadSource,
      offline,
    }
  })().catch((error: unknown) => {
    initialization = null
    throw error
  })
  return initialization
}

function rememberChunk(chunk: ProgressiveDetailChunk): void {
  chunkCache.delete(chunk.chunkId)
  chunkCache.set(chunk.chunkId, chunk)
  while (chunkCache.size > DETAIL_CACHE_LIMIT) {
    const oldest = chunkCache.keys().next().value
    if (oldest === undefined) break
    chunkCache.delete(oldest)
  }
}

async function persistentDetail(
  activeManifest: ProgressiveExoplanetManifest,
  chunkId: number,
): Promise<ProgressiveDetailChunk | null> {
  const descriptor = activeManifest.chunks[chunkId]
  if (!descriptor) throw new RangeError(`Unknown catalogue chunk: ${chunkId}`)
  const bytes = await optionalStorage(() => offlineStore.asset(descriptor), null)
  if (!bytes) return null
  try {
    return await loadProgressiveDetailChunk(activeManifest, chunkId, undefined, bytes)
  } catch {
    return null
  }
}

async function networkDetail(
  activeManifest: ProgressiveExoplanetManifest,
  chunkId: number,
  request: CancellableRequest,
): Promise<ProgressiveDetailChunk> {
  const descriptor = activeManifest.chunks[chunkId]
  if (!descriptor) throw new RangeError(`Unknown catalogue chunk: ${chunkId}`)
  const controller = new AbortController()
  request.controllers.add(controller)
  try {
    const fetched = await fetchProgressiveAsset(descriptor, controller.signal)
    if (request.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
    const chunk = validateProgressiveDetailChunk(
      fetched.value,
      activeManifest,
      descriptor,
    )
    await optionalStorage(
      () =>
        offlineStore.putAsset(
          activeManifest.catalogRevision,
          descriptor,
          fetched.bytes,
          'detail',
        ),
      undefined,
    )
    await optionalStorage(
      () => offlineStore.pruneRuntimeDetails(activeManifest, PERSISTENT_DETAIL_CACHE_LIMIT),
      undefined,
    )
    return chunk
  } finally {
    request.controllers.delete(controller)
  }
}

interface LoadedDetailChunk {
  readonly chunk: ProgressiveDetailChunk
  readonly source: 'memory' | 'persistent' | 'network'
}

async function ensureDetailChunk(
  activeManifest: ProgressiveExoplanetManifest,
  chunkId: number,
  request: CancellableRequest,
): Promise<LoadedDetailChunk> {
  const memory = chunkCache.get(chunkId)
  if (memory) return { chunk: memory, source: 'memory' }
  const persistent = await persistentDetail(activeManifest, chunkId)
  if (request.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
  if (persistent) {
    rememberChunk(persistent)
    return { chunk: persistent, source: 'persistent' }
  }
  const network = await networkDetail(activeManifest, chunkId, request)
  if (request.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
  rememberChunk(network)
  return { chunk: network, source: 'network' }
}

async function persistentHostSky(
  activeManifest: ProgressiveExoplanetManifest,
): Promise<ProgressiveHostSkyIndex | null> {
  const bytes = await optionalStorage(
    () => offlineStore.asset(activeManifest.hostSkyIndex),
    null,
  )
  if (!bytes) return null
  try {
    return await loadProgressiveHostSkyIndex(activeManifest, undefined, bytes)
  } catch {
    return null
  }
}

async function networkHostSky(
  activeManifest: ProgressiveExoplanetManifest,
  request: CancellableRequest,
): Promise<ProgressiveHostSkyIndex> {
  const controller = new AbortController()
  request.controllers.add(controller)
  try {
    const fetched = await fetchProgressiveAsset(
      activeManifest.hostSkyIndex,
      controller.signal,
    )
    if (request.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
    const index = validateProgressiveHostSkyIndex(fetched.value, activeManifest)
    await optionalStorage(
      () =>
        offlineStore.putAsset(
          activeManifest.catalogRevision,
          activeManifest.hostSkyIndex,
          fetched.bytes,
          'sky',
        ),
      undefined,
    )
    return index
  } finally {
    request.controllers.delete(controller)
  }
}

async function ensureHostSky(
  activeManifest: ProgressiveExoplanetManifest,
  request: CancellableRequest,
): Promise<{
  index: ProgressiveHostSkyIndex
  fromMemoryCache: boolean
  fromPersistentCache: boolean
}> {
  if (hostSkyIndex) {
    return { index: hostSkyIndex, fromMemoryCache: true, fromPersistentCache: false }
  }
  const persistent = await persistentHostSky(activeManifest)
  if (persistent) {
    hostSkyIndex = persistent
    return { index: persistent, fromMemoryCache: false, fromPersistentCache: true }
  }
  const network = await networkHostSky(activeManifest, request)
  hostSkyIndex = network
  return { index: network, fromMemoryCache: false, fromPersistentCache: false }
}

async function ensureStoredHostSky(
  activeManifest: ProgressiveExoplanetManifest,
  request: CancellableRequest,
): Promise<ProgressiveHostSkyIndex> {
  const stored = await offlineStore.asset(activeManifest.hostSkyIndex)
  if (stored) {
    try {
      const index = await loadProgressiveHostSkyIndex(
        activeManifest,
        undefined,
        stored,
      )
      hostSkyIndex = index
      return index
    } catch {
      // The descriptor-aware store removes mismatches; fetch a verified replacement.
    }
  }
  const index = await networkHostSky(activeManifest, request)
  hostSkyIndex = index
  return index
}

async function handleHostSky(
  request: Extract<CatalogWorkerRequest, { type: 'host-sky' }>,
): Promise<void> {
  const state: CancellableRequest = { cancelled: false, controllers: new Set() }
  skyRequests.set(request.requestId, state)
  try {
    const ready = await initialize()
    if (state.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
    const started = performance.now()
    const loaded = await ensureHostSky(ready.manifest, state)
    if (state.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
    post({
      type: 'host-sky-result',
      requestId: request.requestId,
      payload: {
        index: loaded.index,
        loadMs: performance.now() - started,
        fromMemoryCache: loaded.fromMemoryCache,
        fromPersistentCache: loaded.fromPersistentCache,
        offline: await offlineStatus(ready.manifest),
      },
    })
  } finally {
    skyRequests.delete(request.requestId)
  }
}

async function handleDetail(request: Extract<CatalogWorkerRequest, { type: 'detail' }>) {
  const state: CancellableRequest = { cancelled: false, controllers: new Set() }
  detailRequests.set(request.requestId, state)
  try {
    const ready = await initialize()
    if (state.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
    const started = performance.now()
    const loaded = await ensureDetailChunk(ready.manifest, request.chunkId, state)
    if (state.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
    const record = loaded.chunk.records.find(({ id }) => id === request.id)
    if (!record) throw new Error(`Catalogue record not found: ${request.id}`)
    post({
      type: 'detail-result',
      requestId: request.requestId,
      payload: {
        record,
        loadMs: performance.now() - started,
        fromMemoryCache: loaded.source === 'memory',
        fromPersistentCache: loaded.source === 'persistent',
        cacheEntries: chunkCache.size,
      },
    })
  } finally {
    detailRequests.delete(request.requestId)
  }
}

async function handleSystem(request: Extract<CatalogWorkerRequest, { type: 'system' }>) {
  const state: CancellableRequest = { cancelled: false, controllers: new Set() }
  systemRequests.set(request.requestId, state)
  try {
    const ready = await initialize()
    if (!preparedHostIndex) throw new Error('Catalogue host index is unavailable')
    if (state.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
    const started = performance.now()
    let chunksFromMemoryCache = 0
    let chunksFromPersistentCache = 0
    let chunksFromNetwork = 0
    const streamed = await streamObservedSystem(
      ready.manifest,
      preparedHostIndex,
      request.host,
      async (chunkId) => {
        const loaded = await ensureDetailChunk(ready.manifest, chunkId, state)
        if (loaded.source === 'memory') chunksFromMemoryCache += 1
        else if (loaded.source === 'persistent') chunksFromPersistentCache += 1
        else chunksFromNetwork += 1
        return loaded.chunk
      },
      {
        concurrency: SYSTEM_LOAD_CONCURRENCY,
        isCancelled: () => state.cancelled,
      },
    )
    if (state.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
    post({
      type: 'system-result',
      requestId: request.requestId,
      payload: {
        system: streamed.system,
        loadMs: performance.now() - started,
        chunkIds: streamed.chunkIds,
        chunksFromMemoryCache,
        chunksFromPersistentCache,
        chunksFromNetwork,
        cacheEntries: chunkCache.size,
      },
    })
  } finally {
    systemRequests.delete(request.requestId)
  }
}

async function handleOfflineInstall(
  request: Extract<CatalogWorkerRequest, { type: 'install-offline-pack' }>,
): Promise<void> {
  const ready = await initialize()
  if (!persistentStorageAvailable || !offlineStore.supported) {
    throw new Error('Persistent offline storage is unavailable in this browser.')
  }
  const currentStatus = await offlineStore.status(ready.manifest)
  if (currentStatus.packInstalled) {
    post({ type: 'offline-status', requestId: request.requestId, payload: currentStatus })
    return
  }

  const state: CancellableRequest = { cancelled: false, controllers: new Set() }
  installRequests.set(request.requestId, state)
  try {
    const descriptors = ready.manifest.chunks
    const totalBytes = ready.manifest.hostSkyIndex.bytes +
      descriptors.reduce((total, descriptor) => total + descriptor.bytes, 0)
    let nextIndex = 0
    let completedChunks = 0
    await ensureStoredHostSky(ready.manifest, state)
    if (state.cancelled) throw new DOMException('Offline installation cancelled', 'AbortError')
    let storedBytes = ready.manifest.hostSkyIndex.bytes
    post({
      type: 'offline-progress',
      requestId: request.requestId,
      payload: {
        completedChunks,
        totalChunks: descriptors.length,
        storedBytes,
        totalBytes,
      },
    })

    const installNext = async (): Promise<void> => {
      while (true) {
        if (state.cancelled) throw new DOMException('Offline installation cancelled', 'AbortError')
        const index = nextIndex
        nextIndex += 1
        const descriptor = descriptors[index]
        if (!descriptor) return
        let bytes = await offlineStore.asset(descriptor)
        if (bytes) {
          try {
            await verifyProgressiveAssetBytes(descriptor, bytes)
          } catch {
            bytes = null
          }
        }
        if (!bytes) {
          const controller = new AbortController()
          state.controllers.add(controller)
          try {
            const fetched = await fetchProgressiveAsset(descriptor, controller.signal)
            bytes = fetched.bytes
            await offlineStore.putAsset(
              ready.manifest.catalogRevision,
              descriptor,
              bytes,
              'detail',
            )
          } finally {
            state.controllers.delete(controller)
          }
        }
        if (state.cancelled) throw new DOMException('Offline installation cancelled', 'AbortError')
        completedChunks += 1
        storedBytes += descriptor.bytes
        post({
          type: 'offline-progress',
          requestId: request.requestId,
          payload: { completedChunks, totalChunks: descriptors.length, storedBytes, totalBytes },
        })
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(OFFLINE_INSTALL_CONCURRENCY, descriptors.length) },
        () => installNext(),
      ),
    )
    const status = await offlineStore.markPackReady(ready.manifest)
    post({ type: 'offline-status', requestId: request.requestId, payload: status })
  } finally {
    installRequests.delete(request.requestId)
  }
}

function cancelRequest(requestId: number): void {
  const state = detailRequests.get(requestId) ??
    systemRequests.get(requestId) ??
    skyRequests.get(requestId) ??
    installRequests.get(requestId)
  if (!state) return
  state.cancelled = true
  for (const controller of state.controllers) controller.abort()
  state.controllers.clear()
}

scope.addEventListener('message', (event) => {
  const request = event.data
  if (request.type === 'cancel') {
    cancelRequest(request.requestId)
    return
  }

  void (async () => {
    try {
      if (request.type === 'initialize') {
        post({ type: 'ready', requestId: request.requestId, payload: await initialize() })
        return
      }
      if (request.type === 'query') {
        await initialize()
        if (!preparedIndex || !manifest) throw new Error('Catalogue index is unavailable')
        const started = performance.now()
        const result = queryProgressiveIndex(preparedIndex, request)
        post({
          type: 'query-result',
          requestId: request.requestId,
          payload: { ...result, queryMs: performance.now() - started },
        })
        return
      }
      if (request.type === 'offline-status') {
        const ready = await initialize()
        post({
          type: 'offline-status',
          requestId: request.requestId,
          payload: await offlineStatus(ready.manifest),
        })
        return
      }
      if (request.type === 'host-sky') {
        await handleHostSky(request)
        return
      }
      if (request.type === 'system') {
        await handleSystem(request)
        return
      }
      if (request.type === 'install-offline-pack') {
        await handleOfflineInstall(request)
        return
      }
      if (request.type === 'remove-offline-pack') {
        const ready = await initialize()
        if (!persistentStorageAvailable || !offlineStore.supported) {
          throw new Error('Persistent offline storage is unavailable in this browser.')
        }
        chunkCache.clear()
        hostSkyIndex = null
        post({
          type: 'offline-status',
          requestId: request.requestId,
          payload: await offlineStore.clearPack(ready.manifest),
        })
        return
      }
      await handleDetail(request)
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      post({
        type: 'error',
        requestId: request.requestId,
        message: errorMessage(error),
        recoverable: true,
      })
    }
  })()
})
