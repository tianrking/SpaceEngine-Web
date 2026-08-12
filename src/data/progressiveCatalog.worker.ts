/// <reference lib="webworker" />

import {
  CatalogOfflineStore,
  unsupportedCatalogOfflineStatus,
  type CatalogOfflineStatus,
} from './catalogOfflineStore'
import {
  fetchProgressiveAsset,
  loadProgressiveDetailChunk,
  loadProgressiveManifest,
  loadProgressiveSearchIndex,
  validateProgressiveDetailChunk,
  validateProgressiveSearchIndex,
  verifyProgressiveAssetBytes,
  type ProgressiveDetailChunk,
  type ProgressiveExoplanetManifest,
  type ProgressiveSearchIndex,
} from './progressiveExoplanetCatalog'
import {
  prepareProgressiveIndex,
  queryProgressiveIndex,
  type PreparedProgressiveIndex,
} from './progressiveCatalogSearch'
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
  readonly decodeMs: number
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
const OFFLINE_INSTALL_CONCURRENCY = 2
const MANIFEST_TIMEOUT_MS = 12_000

let manifest: ProgressiveExoplanetManifest | null = null
let preparedIndex: PreparedProgressiveIndex | null = null
let initialization: Promise<ReadyCatalog> | null = null
let persistentStorageAvailable = true
const offlineStore = new CatalogOfflineStore()
const chunkCache = new Map<number, ProgressiveDetailChunk>()
const detailRequests = new Map<number, CancellableRequest>()
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
    preparedIndex = prepareProgressiveIndex(release.index)
    return {
      manifest: release.manifest,
      decodeMs: performance.now() - started,
      loadSource,
      offline: await offlineStatus(release.manifest),
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

async function handleDetail(request: Extract<CatalogWorkerRequest, { type: 'detail' }>) {
  const state: CancellableRequest = { cancelled: false, controllers: new Set() }
  detailRequests.set(request.requestId, state)
  try {
    const ready = await initialize()
    if (state.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
    const started = performance.now()
    let chunk = chunkCache.get(request.chunkId)
    const fromMemoryCache = chunk !== undefined
    let fromPersistentCache = false
    if (!chunk) {
      chunk = await persistentDetail(ready.manifest, request.chunkId) ?? undefined
      fromPersistentCache = chunk !== undefined
    }
    if (!chunk) chunk = await networkDetail(ready.manifest, request.chunkId, state)
    if (state.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
    rememberChunk(chunk)
    const record = chunk.records.find(({ id }) => id === request.id)
    if (!record) throw new Error(`Catalogue record not found: ${request.id}`)
    post({
      type: 'detail-result',
      requestId: request.requestId,
      payload: {
        record,
        loadMs: performance.now() - started,
        fromMemoryCache,
        fromPersistentCache,
        cacheEntries: chunkCache.size,
      },
    })
  } finally {
    detailRequests.delete(request.requestId)
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
  const descriptors = ready.manifest.chunks
  const totalBytes = descriptors.reduce((total, descriptor) => total + descriptor.bytes, 0)
  let nextIndex = 0
  let completedChunks = 0
  let storedBytes = 0

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

  try {
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
  const state = detailRequests.get(requestId) ?? installRequests.get(requestId)
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
