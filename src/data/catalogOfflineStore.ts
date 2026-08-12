import type {
  CatalogAssetDescriptor,
  ProgressiveExoplanetManifest,
} from './progressiveExoplanetCatalog'

const DATABASE_NAME = 'astral-surveyor-catalogue'
const DATABASE_VERSION = 1
const ASSET_STORE = 'assets'
const META_STORE = 'metadata'
const ACTIVE_RELEASE_KEY = 'active-release'
const PREVIOUS_RELEASE_KEY = 'previous-release'
const OFFLINE_PACK_KEY = 'offline-pack'

interface StoredAsset {
  readonly path: string
  readonly revision: string
  readonly sha256: string
  readonly bytes: number
  readonly kind: 'index' | 'detail'
  readonly payload: ArrayBuffer
  readonly cachedAt: string
  readonly lastAccessedAt: string
}

interface StoredRelease {
  readonly key: typeof ACTIVE_RELEASE_KEY | typeof PREVIOUS_RELEASE_KEY
  readonly manifest: ProgressiveExoplanetManifest
  readonly activatedAt: string
}

interface StoredOfflinePack {
  readonly key: typeof OFFLINE_PACK_KEY
  readonly revision: string
  readonly installedAt: string
  readonly storedBytes: number
  readonly chunkCount: number
}

type StoredMetadata = StoredRelease | StoredOfflinePack

export interface CachedCatalogRelease {
  readonly manifest: ProgressiveExoplanetManifest
  readonly indexBytes: ArrayBuffer
  readonly activatedAt: string
}

export interface CatalogOfflineStatus {
  readonly supported: boolean
  readonly coreCached: boolean
  readonly packInstalled: boolean
  readonly revision: string
  readonly detailChunksCached: number
  readonly detailChunksTotal: number
  readonly storedBytes: number
  readonly installedAt: string | null
  readonly rollbackRevision: string | null
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB request failed.')),
      { once: true },
    )
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.')),
      { once: true },
    )
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')),
      { once: true },
    )
  })
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION)
    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      if (!database.objectStoreNames.contains(ASSET_STORE)) {
        const assets = database.createObjectStore(ASSET_STORE, { keyPath: 'path' })
        assets.createIndex('revision', 'revision', { unique: false })
        assets.createIndex('kind', 'kind', { unique: false })
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: 'key' })
      }
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('Catalogue IndexedDB could not be opened.')),
      { once: true },
    )
    request.addEventListener(
      'blocked',
      () => reject(new Error('Catalogue IndexedDB upgrade is blocked by another tab.')),
      { once: true },
    )
  })
}

function descriptorMatches(asset: StoredAsset, descriptor: CatalogAssetDescriptor): boolean {
  return (
    asset.path === descriptor.path &&
    asset.sha256 === descriptor.sha256 &&
    asset.bytes === descriptor.bytes &&
    asset.payload.byteLength === descriptor.bytes
  )
}

export class CatalogOfflineStore {
  readonly #databaseName: string
  #databasePromise: Promise<IDBDatabase> | null = null

  constructor(databaseName = DATABASE_NAME) {
    this.#databaseName = databaseName
  }

  get supported(): boolean {
    return typeof indexedDB !== 'undefined'
  }

  async #database(): Promise<IDBDatabase> {
    if (!this.supported) throw new Error('IndexedDB is unavailable in this browser.')
    this.#databasePromise ??= openDatabase(this.#databaseName).catch((error: unknown) => {
      this.#databasePromise = null
      throw error
    })
    return this.#databasePromise
  }

  async #metadata<T extends StoredMetadata>(key: T['key']): Promise<T | null> {
    const database = await this.#database()
    const transaction = database.transaction(META_STORE, 'readonly')
    const value = await requestResult(
      transaction.objectStore(META_STORE).get(key) as IDBRequest<T | undefined>,
    )
    await transactionComplete(transaction)
    return value ?? null
  }

  async activateRelease(
    manifest: ProgressiveExoplanetManifest,
    indexBytes: ArrayBuffer,
  ): Promise<void> {
    const current = await this.#metadata<StoredRelease>(ACTIVE_RELEASE_KEY)
    const database = await this.#database()
    const transaction = database.transaction([ASSET_STORE, META_STORE], 'readwrite')
    const now = new Date().toISOString()
    const assets = transaction.objectStore(ASSET_STORE)
    const metadata = transaction.objectStore(META_STORE)
    assets.put({
      path: manifest.searchIndex.path,
      revision: manifest.catalogRevision,
      sha256: manifest.searchIndex.sha256,
      bytes: manifest.searchIndex.bytes,
      kind: 'index',
      payload: indexBytes,
      cachedAt: now,
      lastAccessedAt: now,
    } satisfies StoredAsset)
    if (current && current.manifest.catalogRevision !== manifest.catalogRevision) {
      metadata.put({ ...current, key: PREVIOUS_RELEASE_KEY } satisfies StoredRelease)
    }
    metadata.put({
      key: ACTIVE_RELEASE_KEY,
      manifest,
      activatedAt: now,
    } satisfies StoredRelease)
    await transactionComplete(transaction)
  }

  async activeRelease(): Promise<CachedCatalogRelease | null> {
    const release = await this.#metadata<StoredRelease>(ACTIVE_RELEASE_KEY)
    if (!release) return null
    const indexBytes = await this.asset(release.manifest.searchIndex)
    if (!indexBytes) return null
    return {
      manifest: release.manifest,
      indexBytes,
      activatedAt: release.activatedAt,
    }
  }

  async asset(descriptor: CatalogAssetDescriptor): Promise<ArrayBuffer | null> {
    const database = await this.#database()
    const read = database.transaction(ASSET_STORE, 'readonly')
    const stored = await requestResult(
      read.objectStore(ASSET_STORE).get(descriptor.path) as IDBRequest<StoredAsset | undefined>,
    )
    await transactionComplete(read)
    if (!stored) return null
    if (!descriptorMatches(stored, descriptor)) {
      const remove = database.transaction(ASSET_STORE, 'readwrite')
      remove.objectStore(ASSET_STORE).delete(descriptor.path)
      await transactionComplete(remove)
      return null
    }
    const update = database.transaction(ASSET_STORE, 'readwrite')
    update.objectStore(ASSET_STORE).put({
      ...stored,
      lastAccessedAt: new Date().toISOString(),
    } satisfies StoredAsset)
    await transactionComplete(update)
    return stored.payload.slice(0)
  }

  async putAsset(
    revision: string,
    descriptor: CatalogAssetDescriptor,
    bytes: ArrayBuffer,
    kind: StoredAsset['kind'],
  ): Promise<void> {
    const database = await this.#database()
    const transaction = database.transaction(ASSET_STORE, 'readwrite')
    const now = new Date().toISOString()
    transaction.objectStore(ASSET_STORE).put({
      path: descriptor.path,
      revision,
      sha256: descriptor.sha256,
      bytes: descriptor.bytes,
      kind,
      payload: bytes,
      cachedAt: now,
      lastAccessedAt: now,
    } satisfies StoredAsset)
    await transactionComplete(transaction)
  }

  async markPackReady(manifest: ProgressiveExoplanetManifest): Promise<CatalogOfflineStatus> {
    const database = await this.#database()
    const transaction = database.transaction(META_STORE, 'readwrite')
    transaction.objectStore(META_STORE).put({
      key: OFFLINE_PACK_KEY,
      revision: manifest.catalogRevision,
      installedAt: new Date().toISOString(),
      storedBytes: manifest.searchIndex.bytes +
        manifest.chunks.reduce((total, descriptor) => total + descriptor.bytes, 0),
      chunkCount: manifest.chunks.length,
    } satisfies StoredOfflinePack)
    await transactionComplete(transaction)
    return this.status(manifest)
  }

  async clearPack(manifest: ProgressiveExoplanetManifest): Promise<CatalogOfflineStatus> {
    const database = await this.#database()
    const transaction = database.transaction([ASSET_STORE, META_STORE], 'readwrite')
    const assets = transaction.objectStore(ASSET_STORE)
    for (const descriptor of manifest.chunks) assets.delete(descriptor.path)
    transaction.objectStore(META_STORE).delete(OFFLINE_PACK_KEY)
    await transactionComplete(transaction)
    return this.status(manifest)
  }

  async pruneRuntimeDetails(
    manifest: ProgressiveExoplanetManifest,
    keep = 4,
  ): Promise<void> {
    const pack = await this.#metadata<StoredOfflinePack>(OFFLINE_PACK_KEY)
    if (pack?.revision === manifest.catalogRevision) return
    const database = await this.#database()
    const read = database.transaction(ASSET_STORE, 'readonly')
    const stored = await requestResult(
      read.objectStore(ASSET_STORE).getAll() as IDBRequest<StoredAsset[]>,
    )
    await transactionComplete(read)
    const stale = stored
      .filter(
        (asset) => asset.revision === manifest.catalogRevision && asset.kind === 'detail',
      )
      .sort((left, right) => right.lastAccessedAt.localeCompare(left.lastAccessedAt))
      .slice(keep)
    if (stale.length === 0) return
    const remove = database.transaction(ASSET_STORE, 'readwrite')
    for (const asset of stale) remove.objectStore(ASSET_STORE).delete(asset.path)
    await transactionComplete(remove)
  }

  async status(manifest: ProgressiveExoplanetManifest): Promise<CatalogOfflineStatus> {
    const [release, previous, pack] = await Promise.all([
      this.#metadata<StoredRelease>(ACTIVE_RELEASE_KEY),
      this.#metadata<StoredRelease>(PREVIOUS_RELEASE_KEY),
      this.#metadata<StoredOfflinePack>(OFFLINE_PACK_KEY),
    ])
    const database = await this.#database()
    const transaction = database.transaction(ASSET_STORE, 'readonly')
    const stored = await requestResult(
      transaction.objectStore(ASSET_STORE).getAll() as IDBRequest<StoredAsset[]>,
    )
    await transactionComplete(transaction)
    const currentPaths = new Set(manifest.chunks.map(({ path }) => path))
    const details = stored.filter((asset) => currentPaths.has(asset.path))
    return {
      supported: true,
      coreCached:
        release?.manifest.catalogRevision === manifest.catalogRevision &&
        stored.some((asset) => asset.path === manifest.searchIndex.path),
      packInstalled:
        pack?.revision === manifest.catalogRevision &&
        pack.chunkCount === manifest.chunks.length &&
        details.length === manifest.chunks.length,
      revision: manifest.catalogRevision,
      detailChunksCached: details.length,
      detailChunksTotal: manifest.chunks.length,
      storedBytes:
        stored
          .filter(
            (asset) =>
              asset.revision === manifest.catalogRevision &&
              (asset.kind === 'index' || currentPaths.has(asset.path)),
          )
          .reduce((total, asset) => total + asset.bytes, 0),
      installedAt: pack?.revision === manifest.catalogRevision ? pack.installedAt : null,
      rollbackRevision: previous?.manifest.catalogRevision ?? null,
    }
  }

  close(): void {
    void this.#databasePromise?.then((database) => database.close())
    this.#databasePromise = null
  }
}

export function unsupportedCatalogOfflineStatus(
  manifest: ProgressiveExoplanetManifest,
): CatalogOfflineStatus {
  return {
    supported: false,
    coreCached: false,
    packInstalled: false,
    revision: manifest.catalogRevision,
    detailChunksCached: 0,
    detailChunksTotal: manifest.chunks.length,
    storedBytes: 0,
    installedAt: null,
    rollbackRevision: null,
  }
}
