/// <reference types="node" />

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  decodeProgressiveSummary,
  validateProgressiveDetailChunk,
  validateProgressiveHostSkyIndex,
  validateProgressiveManifest,
  validateProgressiveSearchIndex,
} from './progressiveExoplanetCatalog'

const publicRoot = resolve(process.cwd(), 'public')

async function readPublicJson(path: string): Promise<{ bytes: Buffer; value: unknown }> {
  const bytes = await readFile(resolve(publicRoot, path.replace(/^\//, '')))
  return { bytes, value: JSON.parse(bytes.toString('utf8')) }
}

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

describe('progressive NASA exoplanet catalogue', () => {
  it('validates the real release manifest and all content hashes', async () => {
    const manifestFile = await readPublicJson('/catalog/nasa-exoplanets/manifest.json')
    const manifest = validateProgressiveManifest(manifestFile.value)

    expect(manifest.recordCount).toBeGreaterThan(6_000)
    expect(manifest.hostCount).toBeGreaterThan(4_000)
    expect(manifest.performance.chunkCount).toBe(manifest.chunks.length)

    for (const descriptor of [
      manifest.searchIndex,
      manifest.hostSkyIndex,
      ...manifest.chunks,
    ]) {
      const asset = await readPublicJson(descriptor.path)
      expect(asset.bytes.byteLength).toBe(descriptor.bytes)
      expect(digest(asset.bytes)).toBe(descriptor.sha256)
    }
  })

  it('validates one real ICRS sky record per observed host system', async () => {
    const manifest = validateProgressiveManifest(
      (await readPublicJson('/catalog/nasa-exoplanets/manifest.json')).value,
    )
    const sky = validateProgressiveHostSkyIndex(
      (await readPublicJson(manifest.hostSkyIndex.path)).value,
      manifest,
    )

    expect(sky.coordinateFrame).toBe('ICRS')
    expect(sky.records).toHaveLength(manifest.hostCount)
    expect(new Set(sky.records.map(([host]) => host)).size).toBe(manifest.hostCount)
    expect(sky.records.every(([, ra, dec]) => ra !== null && dec !== null)).toBe(true)
    expect(sky.records.some(([host]) => host === 'Proxima Cen')).toBe(true)
    expect(sky.records.filter((tuple) => tuple[9] !== null)).toHaveLength(7)
  })

  it('validates and decodes every searchable real record', async () => {
    const manifest = validateProgressiveManifest(
      (await readPublicJson('/catalog/nasa-exoplanets/manifest.json')).value,
    )
    const index = validateProgressiveSearchIndex(
      (await readPublicJson(manifest.searchIndex.path)).value,
      manifest,
    )
    const summaries = index.records.map(decodeProgressiveSummary)

    expect(summaries).toHaveLength(manifest.recordCount)
    expect(new Set(summaries.map(({ id }) => id)).size).toBe(manifest.recordCount)
    expect(summaries.some(({ name }) => name === 'Proxima Cen b')).toBe(true)
    expect(summaries.some(({ name }) => name === '51 Peg b')).toBe(true)
    expect(summaries.every(({ chunkId }) => manifest.chunks[chunkId] !== undefined)).toBe(
      true,
    )
  })

  it('validates every detail chunk and preserves rich measurements', async () => {
    const manifest = validateProgressiveManifest(
      (await readPublicJson('/catalog/nasa-exoplanets/manifest.json')).value,
    )
    let total = 0
    let proximaFound = false
    for (const descriptor of manifest.chunks) {
      const chunk = validateProgressiveDetailChunk(
        (await readPublicJson(descriptor.path)).value,
        manifest,
        descriptor,
      )
      total += chunk.records.length
      const proxima = chunk.records.find(({ name }) => name === 'Proxima Cen b')
      if (proxima) {
        proximaFound = true
        expect(proxima.coordinates.frame).toBe('ICRS')
        expect(proxima.measurements.orbitalPeriodDays.value).toBeGreaterThan(0)
        expect(proxima.measurements.radiusEarth.reference).not.toBeNull()
      }
    }
    expect(total).toBe(manifest.recordCount)
    expect(proximaFound).toBe(true)
  })

  it('rejects a manifest that escapes the immutable catalogue root', async () => {
    const source = (await readPublicJson('/catalog/nasa-exoplanets/manifest.json'))
      .value as Record<string, unknown>
    const manifest = structuredClone(source) as {
      searchIndex: { path: string }
    }
    manifest.searchIndex.path = '/untrusted/index.json'
    expect(() => validateProgressiveManifest(manifest)).toThrow(/release root/)
  })

  it('rejects a search index whose precomputed order is not sorted', async () => {
    const manifest = validateProgressiveManifest(
      (await readPublicJson('/catalog/nasa-exoplanets/manifest.json')).value,
    )
    const source = (await readPublicJson(manifest.searchIndex.path)).value
    const index = structuredClone(source) as {
      orders: { distance: number[] }
    }
    const last = index.orders.distance.length - 1
    const firstPosition = index.orders.distance[0]
    index.orders.distance[0] = index.orders.distance[last]
    index.orders.distance[last] = firstPosition
    expect(() => validateProgressiveSearchIndex(index, manifest)).toThrow(/not sorted/)
  })

  it('rejects corrupt scientific measurements before they reach the UI', async () => {
    const manifest = validateProgressiveManifest(
      (await readPublicJson('/catalog/nasa-exoplanets/manifest.json')).value,
    )
    const descriptor = manifest.chunks[0]
    const source = (await readPublicJson(descriptor.path)).value
    const chunk = structuredClone(source) as {
      records: Array<{ measurements: { radiusEarth: { value: number } } }>
    }
    chunk.records[0].measurements.radiusEarth.value = Number.NaN
    expect(() => validateProgressiveDetailChunk(chunk, manifest, descriptor)).toThrow(
      /radiusEarth.value/,
    )
  })
})
