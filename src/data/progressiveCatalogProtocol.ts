import type {
  ProgressiveExoplanetManifest,
  ProgressiveExoplanetRecord,
  ProgressiveExoplanetSummary,
  ProgressiveHostSkyIndex,
} from './progressiveExoplanetCatalog'
import type {
  ProgressiveCatalogFilter,
  ProgressiveCatalogSort,
} from './progressiveCatalogSearch'
import type { CatalogOfflineStatus } from './catalogOfflineStore'

export type CatalogLoadSource = 'network' | 'offline-cache'

export interface CatalogReadyPayload {
  readonly manifest: ProgressiveExoplanetManifest
  readonly decodeMs: number
  readonly loadSource: CatalogLoadSource
  readonly offline: CatalogOfflineStatus
}

export interface CatalogQueryPayload {
  readonly results: readonly ProgressiveExoplanetSummary[]
  readonly totalMatches: number
  readonly queryMs: number
}

export interface CatalogDetailPayload {
  readonly record: ProgressiveExoplanetRecord
  readonly loadMs: number
  readonly fromMemoryCache: boolean
  readonly fromPersistentCache: boolean
  readonly cacheEntries: number
}

export interface CatalogHostSkyPayload {
  readonly index: ProgressiveHostSkyIndex
  readonly loadMs: number
  readonly fromMemoryCache: boolean
  readonly fromPersistentCache: boolean
  readonly offline: CatalogOfflineStatus
}

export interface CatalogOfflineProgressPayload {
  readonly completedChunks: number
  readonly totalChunks: number
  readonly storedBytes: number
  readonly totalBytes: number
}

export type CatalogWorkerRequest =
  | { readonly type: 'initialize'; readonly requestId: number }
  | {
      readonly type: 'query'
      readonly requestId: number
      readonly query: string
      readonly filters: readonly ProgressiveCatalogFilter[]
      readonly sort: ProgressiveCatalogSort
      readonly limit: number
    }
  | {
      readonly type: 'detail'
      readonly requestId: number
      readonly id: string
      readonly chunkId: number
    }
  | { readonly type: 'offline-status'; readonly requestId: number }
  | { readonly type: 'host-sky'; readonly requestId: number }
  | { readonly type: 'install-offline-pack'; readonly requestId: number }
  | { readonly type: 'remove-offline-pack'; readonly requestId: number }
  | { readonly type: 'cancel'; readonly requestId: number }

export type CatalogWorkerResponse =
  | {
      readonly type: 'ready'
      readonly requestId: number
      readonly payload: CatalogReadyPayload
    }
  | {
      readonly type: 'query-result'
      readonly requestId: number
      readonly payload: CatalogQueryPayload
    }
  | {
      readonly type: 'detail-result'
      readonly requestId: number
      readonly payload: CatalogDetailPayload
    }
  | {
      readonly type: 'offline-status'
      readonly requestId: number
      readonly payload: CatalogOfflineStatus
    }
  | {
      readonly type: 'host-sky-result'
      readonly requestId: number
      readonly payload: CatalogHostSkyPayload
    }
  | {
      readonly type: 'offline-progress'
      readonly requestId: number
      readonly payload: CatalogOfflineProgressPayload
    }
  | {
      readonly type: 'error'
      readonly requestId: number
      readonly message: string
      readonly recoverable: boolean
    }
