import type {
  ProgressiveExoplanetManifest,
  ProgressiveExoplanetRecord,
  ProgressiveExoplanetSummary,
} from './progressiveExoplanetCatalog'
import type {
  ProgressiveCatalogFilter,
  ProgressiveCatalogSort,
} from './progressiveCatalogSearch'

export interface CatalogReadyPayload {
  readonly manifest: ProgressiveExoplanetManifest
  readonly decodeMs: number
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
  readonly cacheEntries: number
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
      readonly type: 'error'
      readonly requestId: number
      readonly message: string
      readonly recoverable: boolean
    }
