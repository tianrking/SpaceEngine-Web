/// <reference types="node" />

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  validateProgressiveManifest,
  validateProgressiveSearchIndex,
  type ProgressiveSearchIndex,
} from './progressiveExoplanetCatalog'
import {
  prepareProgressiveIndex,
  queryProgressiveIndex,
} from './progressiveCatalogSearch'

async function loadRealIndex() {
  const root = resolve(process.cwd(), 'public')
  const manifest = validateProgressiveManifest(
    JSON.parse(
      await readFile(resolve(root, 'catalog/nasa-exoplanets/manifest.json'), 'utf8'),
    ),
  )
  const index = validateProgressiveSearchIndex(
    JSON.parse(await readFile(resolve(root, manifest.searchIndex.path.slice(1)), 'utf8')),
    manifest,
  )
  return { manifest, prepared: prepareProgressiveIndex(index) }
}

describe('progressive catalogue worker search', () => {
  it('preserves case-insensitive Unicode-normalized substring semantics in the packed index', () => {
    const index: ProgressiveSearchIndex = {
      schemaVersion: '2.0.0',
      catalogRevision: 'unicode-search-test',
      columns: [],
      orders: { distance: [0], discovery: [0] },
      records: [[
        'unicode-1',
        'Étoile β b',
        'Étoile β',
        10,
        1,
        1,
        260,
        'G2 V',
        'Transit',
        'Observatoire test',
        2025,
        0,
      ]],
    }
    const result = queryProgressiveIndex(prepareProgressiveIndex(index), {
      query: 'E\u0301TOILE Β',
      filters: [],
      sort: 'name',
      limit: 20,
    })
    expect(result.totalMatches).toBe(1)
    expect(result.results[0]?.id).toBe('unicode-1')
  })

  it('searches the complete real index by planet, host, method and facility', async () => {
    const { prepared } = await loadRealIndex()
    for (const query of ['Proxima Cen b', 'Proxima Cen', 'Transit', 'Kepler']) {
      const result = queryProgressiveIndex(prepared, {
        query,
        filters: [],
        sort: 'name',
        limit: 20,
      })
      expect(result.totalMatches).toBeGreaterThan(0)
      expect(result.results.length).toBeLessThanOrEqual(20)
    }
  })

  it('applies scientific filters without accepting missing measurements', async () => {
    const { prepared } = await loadRealIndex()
    const nearby = queryProgressiveIndex(prepared, {
      query: '',
      filters: ['nearby'],
      sort: 'distance',
      limit: 10_000,
    })
    expect(nearby.results.every(({ distancePc }) => distancePc !== null && distancePc < 25)).toBe(
      true,
    )
    const combined = queryProgressiveIndex(prepared, {
      query: '',
      filters: ['earth-size', 'temperate'],
      sort: 'name',
      limit: 10_000,
    })
    expect(
      combined.results.every(
        ({ radiusEarth, equilibriumTempK }) =>
          radiusEarth !== null &&
          radiusEarth <= 1.8 &&
          equilibriumTempK !== null &&
          equilibriumTempK >= 180 &&
          equilibriumTempK <= 320,
      ),
    ).toBe(true)
  })

  it('keeps a complete-index query within the documented 50 ms search budget', async () => {
    const { manifest, prepared } = await loadRealIndex()
    const samples: number[] = []
    for (let index = 0; index < 5; index += 1) {
      queryProgressiveIndex(prepared, {
        query: 'warmup',
        filters: [],
        sort: index % 2 === 0 ? 'name' : 'distance',
        limit: 40,
      })
    }
    for (let index = 0; index < 25; index += 1) {
      const started = performance.now()
      queryProgressiveIndex(prepared, {
        query: index % 2 === 0 ? 'Kepler' : '',
        filters: index % 3 === 0 ? ['temperate'] : [],
        sort: index % 2 === 0 ? 'name' : 'distance',
        limit: 40,
      })
      samples.push(performance.now() - started)
    }
    samples.sort((left, right) => left - right)
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1]
    expect(manifest.recordCount).toBeGreaterThan(6_000)
    expect(p95).toBeLessThan(50)
  })
})
