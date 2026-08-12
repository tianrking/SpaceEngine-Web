/// <reference lib="webworker" />

import {
  loadProgressiveDetailChunk,
  loadProgressiveManifest,
  loadProgressiveSearchIndex,
  type ProgressiveDetailChunk,
  type ProgressiveExoplanetManifest,
} from './progressiveExoplanetCatalog'
import {
  prepareProgressiveIndex,
  queryProgressiveIndex,
  type PreparedProgressiveIndex,
} from './progressiveCatalogSearch'
import type {
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

const scope = self as unknown as WorkerScope
const DETAIL_CACHE_LIMIT = 2
let manifest: ProgressiveExoplanetManifest | null = null
let preparedIndex: PreparedProgressiveIndex | null = null
let initialization: Promise<{ manifest: ProgressiveExoplanetManifest; decodeMs: number }> | null =
  null
const chunkCache = new Map<number, ProgressiveDetailChunk>()
const detailRequests = new Map<
  number,
  { cancelled: boolean; controller: AbortController | null }
>()

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'The catalogue worker could not complete the request.'
}

function post(message: CatalogWorkerResponse): void {
  scope.postMessage(message)
}

async function initialize(): Promise<{
  manifest: ProgressiveExoplanetManifest
  decodeMs: number
}> {
  initialization ??= (async () => {
    const started = performance.now()
    const nextManifest = await loadProgressiveManifest()
    const index = await loadProgressiveSearchIndex(nextManifest)
    manifest = nextManifest
    preparedIndex = prepareProgressiveIndex(index)
    return { manifest: nextManifest, decodeMs: performance.now() - started }
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

async function handleDetail(request: Extract<CatalogWorkerRequest, { type: 'detail' }>) {
  const state = { cancelled: false, controller: null as AbortController | null }
  detailRequests.set(request.requestId, state)
  try {
    const ready = await initialize()
    if (state.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
    const started = performance.now()
    let chunk = chunkCache.get(request.chunkId)
    const fromMemoryCache = chunk !== undefined
    if (!chunk) {
      const controller = new AbortController()
      state.controller = controller
      chunk = await loadProgressiveDetailChunk(
        ready.manifest,
        request.chunkId,
        controller.signal,
      )
      if (state.cancelled) throw new DOMException('Catalogue request cancelled', 'AbortError')
      rememberChunk(chunk)
    } else {
      rememberChunk(chunk)
    }
    const record = chunk.records.find(({ id }) => id === request.id)
    if (!record) throw new Error(`Catalogue record not found: ${request.id}`)
    post({
      type: 'detail-result',
      requestId: request.requestId,
      payload: {
        record,
        loadMs: performance.now() - started,
        fromMemoryCache,
        cacheEntries: chunkCache.size,
      },
    })
  } finally {
    detailRequests.delete(request.requestId)
  }
}

scope.addEventListener('message', (event) => {
  const request = event.data
  if (request.type === 'cancel') {
    const detail = detailRequests.get(request.requestId)
    if (detail) {
      detail.cancelled = true
      detail.controller?.abort()
    }
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
