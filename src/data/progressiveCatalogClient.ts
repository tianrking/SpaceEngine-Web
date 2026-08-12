import type {
  CatalogDetailPayload,
  CatalogQueryPayload,
  CatalogReadyPayload,
  CatalogWorkerRequest,
  CatalogWorkerResponse,
} from './progressiveCatalogProtocol'
import type {
  ProgressiveCatalogFilter,
  ProgressiveCatalogSort,
} from './progressiveCatalogSearch'

type SuccessResponse = Exclude<CatalogWorkerResponse, { type: 'error' }>
type RequestWithoutId = CatalogWorkerRequest extends infer Request
  ? Request extends { readonly requestId: number }
    ? Omit<Request, 'requestId'>
    : never
  : never
type PendingRequest = {
  resolve: (response: SuccessResponse) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

const REQUEST_TIMEOUT_MS = 30_000

export class ProgressiveCatalogClient {
  readonly #worker: Worker
  readonly #pending = new Map<number, PendingRequest>()
  readonly #onFatalError: (() => void) | undefined
  #nextRequestId = 1
  #failed = false

  constructor(onFatalError?: () => void) {
    this.#onFatalError = onFatalError
    this.#worker = new Worker(new URL('./progressiveCatalog.worker.ts', import.meta.url), {
      type: 'module',
      name: 'astral-progressive-catalog',
    })
    this.#worker.addEventListener('message', this.#handleMessage)
    this.#worker.addEventListener('error', this.#handleWorkerError)
  }

  readonly #handleMessage = (event: MessageEvent<CatalogWorkerResponse>) => {
    const response = event.data
    const pending = this.#pending.get(response.requestId)
    if (!pending) return
    clearTimeout(pending.timeout)
    this.#pending.delete(response.requestId)
    if (response.type === 'error') pending.reject(new Error(response.message))
    else pending.resolve(response)
  }

  readonly #handleWorkerError = () => {
    if (this.#failed) return
    this.#failed = true
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('The catalogue worker stopped unexpectedly.'))
    }
    this.#pending.clear()
    this.#onFatalError?.()
  }

  #request<T extends SuccessResponse>(
    request: RequestWithoutId,
    expectedType: T['type'],
  ): { requestId: number; promise: Promise<T['payload']> } {
    const requestId = this.#nextRequestId
    this.#nextRequestId += 1
    if (this.#failed) {
      return {
        requestId,
        promise: Promise.reject(new Error('The catalogue worker is unavailable. Retry to restart it.')),
      }
    }
    const promise = new Promise<T['payload']>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(requestId)
        this.#worker.postMessage({ type: 'cancel', requestId } satisfies CatalogWorkerRequest)
        reject(new Error('Catalogue request timed out.'))
      }, REQUEST_TIMEOUT_MS)
      this.#pending.set(requestId, {
        resolve: (response) => {
          if (response.type !== expectedType) {
            reject(new Error(`Unexpected catalogue response: ${response.type}`))
            return
          }
          resolve(response.payload as T['payload'])
        },
        reject,
        timeout,
      })
      this.#worker.postMessage({ ...request, requestId } as CatalogWorkerRequest)
    })
    return { requestId, promise }
  }

  initialize(): Promise<CatalogReadyPayload> {
    return this.#request<Extract<SuccessResponse, { type: 'ready' }>>(
      { type: 'initialize' },
      'ready',
    ).promise
  }

  query(input: {
    query: string
    filters: readonly ProgressiveCatalogFilter[]
    sort: ProgressiveCatalogSort
    limit: number
  }): { requestId: number; promise: Promise<CatalogQueryPayload> } {
    return this.#request<Extract<SuccessResponse, { type: 'query-result' }>>(
      { type: 'query', ...input },
      'query-result',
    )
  }

  detail(id: string, chunkId: number): {
    requestId: number
    promise: Promise<CatalogDetailPayload>
  } {
    return this.#request<Extract<SuccessResponse, { type: 'detail-result' }>>(
      { type: 'detail', id, chunkId },
      'detail-result',
    )
  }

  cancel(requestId: number): void {
    const pending = this.#pending.get(requestId)
    if (pending) {
      clearTimeout(pending.timeout)
      pending.reject(new DOMException('Catalogue request cancelled', 'AbortError'))
      this.#pending.delete(requestId)
    }
    this.#worker.postMessage({ type: 'cancel', requestId } satisfies CatalogWorkerRequest)
  }

  dispose(): void {
    this.#worker.terminate()
    this.#handleWorkerError()
  }
}

let sharedClient: ProgressiveCatalogClient | null = null

export function getProgressiveCatalogClient(): ProgressiveCatalogClient {
  if (!sharedClient) {
    const client = new ProgressiveCatalogClient(() => {
      if (sharedClient === client) sharedClient = null
    })
    sharedClient = client
  }
  return sharedClient
}
