/// <reference types="node" />

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  CatalogMeasurement,
  ProgressiveDetailChunk,
  ProgressiveExoplanetRecord,
  ProgressiveSummaryTuple,
} from './progressiveExoplanetCatalog'
import {
  validateProgressiveDetailChunk,
  validateProgressiveManifest,
  validateProgressiveSearchIndex,
} from './progressiveExoplanetCatalog'
import {
  buildObservedSystemBundle,
  observedHostSummaries,
  prepareObservedHostIndex,
  streamObservedSystem,
} from './progressiveObservedSystem'

const publicRoot = resolve(process.cwd(), 'public')

async function readPublicJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(publicRoot, path.replace(/^\//, '')), 'utf8'))
}

async function realRelease() {
  const manifest = validateProgressiveManifest(
    await readPublicJson('/catalog/nasa-exoplanets/manifest.json'),
  )
  const index = validateProgressiveSearchIndex(
    await readPublicJson(manifest.searchIndex.path),
    manifest,
  )
  return { manifest, index }
}

describe('progressive observed host systems', () => {
  it('builds an exact-host index and rejects unknown or inexact hostnames without loading chunks', async () => {
    const { manifest, index } = await realRelease()
    const prepared = prepareObservedHostIndex(index)
    const loadCalls: number[] = []

    expect(observedHostSummaries(prepared, 'TRAPPIST-1')).toHaveLength(7)
    expect(observedHostSummaries(prepared, 'trappist-1')).toHaveLength(0)
    await expect(streamObservedSystem(
      manifest,
      prepared,
      'trappist-1',
      async (chunkId) => {
        loadCalls.push(chunkId)
        throw new Error('must not load')
      },
    )).rejects.toThrow('Unknown NASA host system: trappist-1')
    expect(loadCalls).toEqual([])
  })

  it('streams all seven TRAPPIST-1 planets from one unique verified detail chunk', async () => {
    const { manifest, index } = await realRelease()
    const prepared = prepareObservedHostIndex(index)
    const loadCalls: number[] = []
    const result = await streamObservedSystem(
      manifest,
      prepared,
      'TRAPPIST-1',
      async (chunkId) => {
        loadCalls.push(chunkId)
        const descriptor = manifest.chunks[chunkId]
        return validateProgressiveDetailChunk(
          await readPublicJson(descriptor.path),
          manifest,
          descriptor,
        )
      },
    )

    expect(result.chunkIds).toEqual([15])
    expect(loadCalls).toEqual([15])
    expect(result.system.planets.map(({ name }) => name)).toEqual([
      'TRAPPIST-1 b',
      'TRAPPIST-1 c',
      'TRAPPIST-1 d',
      'TRAPPIST-1 e',
      'TRAPPIST-1 f',
      'TRAPPIST-1 g',
      'TRAPPIST-1 h',
    ])
    expect(result.system.astrometry.cartesianPosition?.evidence).toBe('derived')
    expect(result.system.hostStar.measurements.stellarMassSolar.status).toBe('single')
    expect(result.system.provenance).toMatchObject({
      provider: 'NASA Exoplanet Archive',
      table: 'pscomppars',
      evidence: 'archive-composite',
      catalogRevision: manifest.catalogRevision,
    })
  })

  it('preserves nulls, errors, limits and references while exposing host conflicts', async () => {
    const { manifest, index } = await realRelease()
    const summaries = observedHostSummaries(prepareObservedHostIndex(index), 'TRAPPIST-1')
    const descriptor = manifest.chunks[summaries[0].chunkId]
    const chunk = validateProgressiveDetailChunk(
      await readPublicJson(descriptor.path),
      manifest,
      descriptor,
    )
    const records = structuredClone(
      chunk.records.filter(({ host }) => host === 'TRAPPIST-1'),
    ) as ProgressiveExoplanetRecord[]
    const originalOrbit = structuredClone(records[0].measurements.semiMajorAxisAu)

    const firstMeasurements = records[0].measurements as Record<string, CatalogMeasurement>
    const secondMeasurements = records[1].measurements as Record<string, CatalogMeasurement>
    firstMeasurements.stellarMassSolar = {
      value: 0.08,
      errorPlus: 0.001,
      errorMinus: -0.002,
      limit: 0,
      unit: 'M_sun',
      reference: { label: 'Mass source A', url: 'https://example.test/a' },
    }
    secondMeasurements.stellarMassSolar = {
      value: 0.09,
      errorPlus: null,
      errorMinus: null,
      limit: 1,
      unit: 'M_sun',
      reference: { label: 'Mass source B', url: 'https://example.test/b' },
    }
    for (const record of records) {
      const measurements = record.measurements as Record<string, CatalogMeasurement>
      measurements.stellarRadiusSolar = {
        value: null,
        errorPlus: null,
        errorMinus: null,
        limit: null,
        unit: 'R_sun',
        reference: null,
      }
    }
    const luminosity = structuredClone(firstMeasurements.stellarLuminosityLogSolar)
    firstMeasurements.stellarLuminosityLogSolar = {
      ...luminosity,
      reference: { label: 'Luminosity source A', url: 'https://example.test/luminosity-a' },
    }
    secondMeasurements.stellarLuminosityLogSolar = {
      ...luminosity,
      reference: { label: 'Luminosity source B', url: 'https://example.test/luminosity-b' },
    }
    firstMeasurements.inclinationDeg = {
      value: null,
      errorPlus: null,
      errorMinus: null,
      limit: null,
      unit: 'deg',
      reference: null,
    }

    const system = buildObservedSystemBundle(manifest, 'TRAPPIST-1', summaries, records)
    const mass = system.hostStar.measurements.stellarMassSolar
    expect(mass.status).toBe('conflict')
    expect(mass.selected).toBeNull()
    expect(mass.candidates[0]).toMatchObject({
      sourceField: 'st_mass',
      evidence: 'archive-composite',
      measurement: {
        value: 0.08,
        errorPlus: 0.001,
        errorMinus: -0.002,
        limit: 0,
        reference: { label: 'Mass source A', url: 'https://example.test/a' },
      },
    })
    expect(mass.candidates[1].measurement.limit).toBe(1)
    expect(system.hostStar.measurements.stellarRadiusSolar).toMatchObject({
      status: 'missing',
      selected: null,
    })
    const resolvedLuminosity = system.hostStar.measurements.stellarLuminosityLogSolar
    expect(resolvedLuminosity.status).toBe('single')
    expect(resolvedLuminosity.selected?.measurement.value).toBe(luminosity.value)
    expect(resolvedLuminosity.candidates.slice(0, 2).map(({ measurement }) =>
      measurement.reference?.label)).toEqual([
        'Luminosity source A',
        'Luminosity source B',
      ])
    expect(system.planets[0].orbit.semiMajorAxisAu).toEqual(originalOrbit)
    expect(system.planets[0].orbit.missingElements).toEqual(expect.arrayContaining([
      'inclinationDeg',
      'longitudeAscendingNodeDeg',
      'argumentPeriapsisDeg',
      'meanAnomalyAtEpochDeg',
    ]))
    expect(system.planets[0].orbit.renderAssumptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'inclinationDeg', evidence: 'illustrative' }),
      expect.objectContaining({ field: 'longitudeAscendingNodeDeg', evidence: 'illustrative' }),
      expect.objectContaining({ field: 'argumentPeriapsisDeg', evidence: 'illustrative' }),
      expect.objectContaining({ field: 'meanAnomalyAtEpochDeg', evidence: 'illustrative' }),
    ]))
  })

  it('deduplicates chunk requests, bounds concurrency and aborts after cancellation', async () => {
    const { manifest, index } = await realRelease()
    const source = index.records.find((tuple) => tuple[2] === 'TRAPPIST-1')
    if (!source) throw new Error('TRAPPIST-1 fixture is unavailable')
    const records = Array.from({ length: 5 }, (_, index) => {
      const tuple = [...source] as unknown[]
      tuple[0] = `test:${index}`
      tuple[1] = `Test ${index}`
      tuple[2] = 'Test Host'
      tuple[11] = index < 2 ? 0 : index < 4 ? 1 : 2
      return tuple as unknown as ProgressiveSummaryTuple
    })
    const prepared = prepareObservedHostIndex({ ...index, records })
    let active = 0
    let maximumActive = 0
    const pending = new Map<number, () => void>()
    const loadCalls: number[] = []
    const stream = streamObservedSystem(
      manifest,
      prepared,
      'Test Host',
      (chunkId) => new Promise<ProgressiveDetailChunk>((resolveChunk) => {
        loadCalls.push(chunkId)
        active += 1
        maximumActive = Math.max(maximumActive, active)
        pending.set(chunkId, () => {
          active -= 1
          resolveChunk({
            schemaVersion: manifest.schemaVersion,
            catalogRevision: manifest.catalogRevision,
            chunkId,
            records: [],
          })
        })
      }),
      { concurrency: 2 },
    )

    await Promise.resolve()
    expect(loadCalls).toEqual([0, 1])
    expect(maximumActive).toBe(2)
    pending.get(0)?.()
    await Promise.resolve()
    expect(loadCalls).toEqual([0, 1, 2])
    pending.get(1)?.()
    pending.get(2)?.()
    await expect(stream).rejects.toThrow(/missing test:0/)

    let cancelled = false
    const cancellation = streamObservedSystem(
      manifest,
      prepared,
      'Test Host',
      async (chunkId) => {
        cancelled = true
        return {
          schemaVersion: manifest.schemaVersion,
          catalogRevision: manifest.catalogRevision,
          chunkId,
          records: [],
        }
      },
      { isCancelled: () => cancelled },
    )
    await expect(cancellation).rejects.toMatchObject({ name: 'AbortError' })
  })
})
