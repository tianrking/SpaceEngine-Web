/// <reference types="node" />

import { beforeAll, describe, expect, it } from 'vitest'
import type {
  ProgressiveSearchIndex,
  ProgressiveSummaryTuple,
} from './progressiveExoplanetCatalog'
import {
  prepareProgressiveIndex,
  queryProgressiveIndex,
  type PreparedProgressiveIndex,
  type ProgressiveCatalogQuery,
} from './progressiveCatalogSearch'

const SYNTHETIC_RECORD_COUNT = 100_000
const BENCHMARK_SAMPLE_COUNT = 31
const SEARCH_P95_BUDGET_MS = 50

interface ScaleMetrics {
  readonly prepareMs: number
  readonly heapDeltaMiB: number
  readonly auxiliaryIndexMiB: number
}

function padded(value: number): string {
  return value.toString().padStart(6, '0')
}

function createSyntheticScaleIndex(): ProgressiveSearchIndex {
  const records: ProgressiveSummaryTuple[] = new Array(SYNTHETIC_RECORD_COUNT)
  const distanceOrder: number[] = new Array(SYNTHETIC_RECORD_COUNT)
  const discoveryOrder: number[] = new Array(SYNTHETIC_RECORD_COUNT)

  for (let index = 0; index < SYNTHETIC_RECORD_COUNT; index += 1) {
    const serial = padded(index)
    const hostSerial = padded(Math.floor(index / 4))
    records[index] = [
      `synthetic-scale-${serial}`,
      `Benchmark Planet ${serial}`,
      `Benchmark Host ${hostSerial}`,
      0.1 + index * 0.002,
      0.6 + (index % 30) * 0.1,
      0.4 + (index % 400) * 0.05,
      150 + (index % 280),
      ['M4 V', 'K2 V', 'G2 V', 'F8 V'][index % 4],
      ['Transit', 'Radial Velocity', 'Imaging'][index % 3],
      `Scale Observatory ${index % 8}`,
      1990 + (index % 36),
      Math.floor(index / 400),
    ]
    distanceOrder[index] = index
    discoveryOrder[index] = SYNTHETIC_RECORD_COUNT - index - 1
  }

  return {
    schemaVersion: '2.0.0',
    catalogRevision: 'synthetic-scale-100k-v1',
    columns: [
      'id',
      'name',
      'host',
      'distancePc',
      'radiusEarth',
      'massEarth',
      'equilibriumTempK',
      'stellarSpectralType',
      'discoveryMethod',
      'discoveryFacility',
      'discoveryYear',
      'chunkId',
    ],
    orders: { distance: distanceOrder, discovery: discoveryOrder },
    records,
  }
}

function p95(samples: readonly number[]): number {
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1]
}

function measureQueries(
  prepared: PreparedProgressiveIndex,
  requests: readonly ProgressiveCatalogQuery[],
): number {
  for (let index = 0; index < 7; index += 1) {
    queryProgressiveIndex(prepared, requests[index % requests.length])
  }

  const samples: number[] = []
  for (let index = 0; index < BENCHMARK_SAMPLE_COUNT; index += 1) {
    const started = performance.now()
    queryProgressiveIndex(prepared, requests[index % requests.length])
    samples.push(performance.now() - started)
  }
  return p95(samples)
}

describe('progressive catalogue 100k architecture benchmark', () => {
  let prepared: PreparedProgressiveIndex
  let metrics: ScaleMetrics

  beforeAll(() => {
    const fixture = createSyntheticScaleIndex()
    const heapBefore = process.memoryUsage().heapUsed
    const started = performance.now()
    prepared = prepareProgressiveIndex(fixture)
    metrics = {
      prepareMs: performance.now() - started,
      heapDeltaMiB: (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024),
      auxiliaryIndexMiB: (
        prepared.searchBytes.byteLength +
        prepared.searchOffsets.byteLength +
        prepared.distanceOrder.byteLength +
        prepared.discoveryOrder.byteLength
      ) / (1024 * 1024),
    }
  })

  it('keeps the scale fixture explicitly synthetic and structurally complete', () => {
    expect(prepared.records).toHaveLength(SYNTHETIC_RECORD_COUNT)
    expect(prepared.searchOffsets).toHaveLength(SYNTHETIC_RECORD_COUNT + 1)
    expect(prepared.distanceOrder).toHaveLength(SYNTHETIC_RECORD_COUNT)
    expect(prepared.discoveryOrder).toHaveLength(SYNTHETIC_RECORD_COUNT)
    expect(prepared.records.every((tuple) => tuple[0].startsWith('synthetic-scale-'))).toBe(true)
    expect(metrics.auxiliaryIndexMiB).toBeLessThan(24)
  })

  it('meets the warm exact identity/name p95 budget at 100k summaries', () => {
    const exactP95 = measureQueries(prepared, [
      { query: 'synthetic-scale-054321', filters: [], sort: 'name', limit: 20 },
      { query: 'Benchmark Planet 087654', filters: [], sort: 'name', limit: 20 },
      { query: 'Benchmark Host 013580', filters: [], sort: 'name', limit: 20 },
    ])

    const result = queryProgressiveIndex(prepared, {
      query: 'Benchmark Planet 054321',
      filters: [],
      sort: 'name',
      limit: 20,
    })
    expect(result.totalMatches).toBe(1)
    expect(result.results[0]?.id).toBe('synthetic-scale-054321')
    expect(exactP95).toBeLessThan(SEARCH_P95_BUDGET_MS)

    console.info(
      `[catalog-scale] fixture=100000 status=synthetic cache=warm ` +
      `prepare=${metrics.prepareMs.toFixed(1)}ms heap-delta=${metrics.heapDeltaMiB.toFixed(1)}MiB ` +
      `aux-index=${metrics.auxiliaryIndexMiB.toFixed(1)}MiB ` +
      `exact-name-p95=${exactP95.toFixed(2)}ms budget=${SEARCH_P95_BUDGET_MS}ms ` +
      `runtime=node-${process.versions.node} platform=${process.platform}-${process.arch}`,
    )
  })

  it('keeps mixed filtering and ordered scans within the same interaction budget', () => {
    const mixedP95 = measureQueries(prepared, [
      { query: 'Scale Observatory 3', filters: ['recent'], sort: 'discovery', limit: 40 },
      { query: '', filters: ['nearby', 'earth-size'], sort: 'distance', limit: 40 },
      { query: 'Transit', filters: ['temperate'], sort: 'name', limit: 40 },
    ])
    expect(mixedP95).toBeLessThan(SEARCH_P95_BUDGET_MS)
    console.info(
      `[catalog-scale] fixture=100000 status=synthetic cache=warm ` +
      `mixed-filter-p95=${mixedP95.toFixed(2)}ms budget=${SEARCH_P95_BUDGET_MS}ms`,
    )
  })
})
