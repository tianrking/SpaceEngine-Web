import { indexedDB as fakeIndexedDb } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { CatalogOfflineStore } from './catalogOfflineStore'
import type {
  CatalogAssetDescriptor,
  CatalogChunkDescriptor,
  ProgressiveExoplanetManifest,
} from './progressiveExoplanetCatalog'

Object.defineProperty(globalThis, 'indexedDB', {
  configurable: true,
  value: fakeIndexedDb,
})

function descriptor(path: string, bytes: number): CatalogAssetDescriptor {
  return { path, bytes, records: 1, sha256: 'a'.repeat(64) }
}

function manifestFixture(revision: string): ProgressiveExoplanetManifest {
  const root = `/catalog/nasa-exoplanets/releases/${revision}`
  const chunks: CatalogChunkDescriptor[] = [0, 1].map((id) => ({
    ...descriptor(`${root}/chunks/detail-${id}.json`, id + 3),
    id,
    firstName: `Planet ${id}`,
    lastName: `Planet ${id}`,
  }))
  return {
    schemaVersion: '2.0.0',
    catalogId: 'nasa-exoplanets',
    catalogRevision: revision,
    retrievedAt: '2026-08-12T00:00:00.000Z',
    publishedAt: '2026-08-12T00:00:00.000Z',
    recordCount: 2,
    hostCount: 2,
    source: {
      provider: 'NASA Exoplanet Archive',
      table: 'pscomppars',
      tapEndpoint: 'https://example.test/tap',
      requestUrl: 'https://example.test/query',
      query: 'select * from pscomppars',
      documentationUrl: 'https://example.test/docs',
      acknowledgementUrl: 'https://example.test/credits',
      product: 'Fixture',
    },
    provenance: {
      scope: 'Fixture',
      nullPolicy: 'Null',
      compositePolicy: 'Composite',
      sort: 'Name',
      rightsStatus: 'test-only',
    },
    performance: { detailChunkSize: 1, chunkCount: 2, resultPageSize: 20 },
    searchIndex: descriptor(`${root}/search-index.json`, 2),
    hostSkyIndex: descriptor(`${root}/host-sky-index.json`, 4),
    chunks,
  }
}

function bytes(length: number, value: number): ArrayBuffer {
  return Uint8Array.from({ length }, () => value).buffer
}

describe('catalogue IndexedDB release store', () => {
  it('atomically activates and restores a cached catalogue core', async () => {
    const store = new CatalogOfflineStore(`catalog-core-${crypto.randomUUID()}`)
    const manifest = manifestFixture('release-a')
    const indexBytes = bytes(manifest.searchIndex.bytes, 7)

    await store.activateRelease(manifest, indexBytes)
    const active = await store.activeRelease()
    const status = await store.status(manifest)

    expect(active?.manifest.catalogRevision).toBe('release-a')
    expect(new Uint8Array(active?.indexBytes ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array(indexBytes),
    )
    expect(status).toMatchObject({
      coreCached: true,
      skyCached: false,
      packInstalled: false,
      detailChunksCached: 0,
      rollbackRevision: null,
    })
    store.close()
  })

  it('marks a full pack ready only after every descriptor is present', async () => {
    const store = new CatalogOfflineStore(`catalog-pack-${crypto.randomUUID()}`)
    const manifest = manifestFixture('release-pack')
    await store.activateRelease(manifest, bytes(manifest.searchIndex.bytes, 1))
    await store.putAsset(
      manifest.catalogRevision,
      manifest.chunks[0],
      bytes(manifest.chunks[0].bytes, 2),
      'detail',
    )

    expect((await store.markPackReady(manifest)).packInstalled).toBe(false)

    await store.putAsset(
      manifest.catalogRevision,
      manifest.hostSkyIndex,
      bytes(manifest.hostSkyIndex.bytes, 4),
      'sky',
    )

    await store.putAsset(
      manifest.catalogRevision,
      manifest.chunks[1],
      bytes(manifest.chunks[1].bytes, 3),
      'detail',
    )
    const installed = await store.markPackReady(manifest)
    expect(installed).toMatchObject({
      packInstalled: true,
      skyCached: true,
      detailChunksCached: 2,
      detailChunksTotal: 2,
      storedBytes: 13,
    })

    const removed = await store.clearPack(manifest)
    expect(removed).toMatchObject({
      coreCached: true,
      skyCached: false,
      packInstalled: false,
      detailChunksCached: 0,
      storedBytes: 2,
    })
    store.close()
  })

  it('retains the previous release pointer for rollback', async () => {
    const store = new CatalogOfflineStore(`catalog-rollback-${crypto.randomUUID()}`)
    const first = manifestFixture('release-one')
    const second = manifestFixture('release-two')
    await store.activateRelease(first, bytes(first.searchIndex.bytes, 1))
    await store.activateRelease(second, bytes(second.searchIndex.bytes, 2))

    expect(await store.status(second)).toMatchObject({
      revision: 'release-two',
      rollbackRevision: 'release-one',
    })
    store.close()
  })

  it('rejects a cached asset when its descriptor no longer matches', async () => {
    const store = new CatalogOfflineStore(`catalog-integrity-${crypto.randomUUID()}`)
    const manifest = manifestFixture('release-integrity')
    const original = manifest.chunks[0]
    await store.putAsset(
      manifest.catalogRevision,
      original,
      bytes(original.bytes, 5),
      'detail',
    )

    expect(await store.asset({ ...original, sha256: 'b'.repeat(64) })).toBeNull()
    expect(await store.asset(original)).toBeNull()
    store.close()
  })
})
