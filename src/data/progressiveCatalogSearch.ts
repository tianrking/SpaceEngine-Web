import type {
  ProgressiveExoplanetSummary,
  ProgressiveSearchIndex,
  ProgressiveSummaryTuple,
} from './progressiveExoplanetCatalog'
import { decodeProgressiveSummary } from './progressiveExoplanetCatalog'

export type ProgressiveCatalogFilter = 'nearby' | 'earth-size' | 'temperate' | 'recent'
export type ProgressiveCatalogSort = 'name' | 'distance' | 'discovery'

export interface ProgressiveCatalogQuery {
  readonly query: string
  readonly filters: readonly ProgressiveCatalogFilter[]
  readonly sort: ProgressiveCatalogSort
  readonly limit: number
}

export interface PreparedProgressiveIndex {
  readonly records: readonly ProgressiveSummaryTuple[]
  readonly searchBytes: Uint8Array<ArrayBuffer>
  readonly searchOffsets: Uint32Array<ArrayBuffer>
  readonly distanceOrder: Uint32Array<ArrayBuffer>
  readonly discoveryOrder: Uint32Array<ArrayBuffer>
}

export interface ProgressiveCatalogQueryResult {
  readonly totalMatches: number
  readonly results: readonly ProgressiveExoplanetSummary[]
}

const INDEX = {
  id: 0,
  name: 1,
  host: 2,
  distancePc: 3,
  radiusEarth: 4,
  massEarth: 5,
  equilibriumTempK: 6,
  stellarSpectralType: 7,
  discoveryMethod: 8,
  discoveryFacility: 9,
  discoveryYear: 10,
  chunkId: 11,
} as const

function normalizeSearchText(value: string): string {
  return value.normalize('NFKD').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim()
}

function searchableTuple(tuple: ProgressiveSummaryTuple): string {
  return normalizeSearchText(
    [
      tuple[INDEX.id],
      tuple[INDEX.name],
      tuple[INDEX.host],
      tuple[INDEX.stellarSpectralType],
      tuple[INDEX.discoveryMethod],
      tuple[INDEX.discoveryFacility],
    ]
      .filter((value): value is string => typeof value === 'string')
      .join('\u0000'),
  )
}

const searchTextEncoder = new TextEncoder()

function estimatedSearchCapacity(records: readonly ProgressiveSummaryTuple[]): number {
  let characters = 0
  for (const tuple of records) {
    for (const index of [
      INDEX.id,
      INDEX.name,
      INDEX.host,
      INDEX.stellarSpectralType,
      INDEX.discoveryMethod,
      INDEX.discoveryFacility,
    ] as const) {
      const value = tuple[index]
      if (typeof value === 'string') characters += value.length + 1
    }
  }
  return Math.max(1024, characters)
}

function growSearchBytes(
  current: Uint8Array<ArrayBuffer>,
  minimumCapacity: number,
): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(Math.max(minimumCapacity, Math.ceil(current.length * 1.5)))
  next.set(current)
  return next
}

function encodeSearchText(records: readonly ProgressiveSummaryTuple[]): {
  readonly bytes: Uint8Array<ArrayBuffer>
  readonly offsets: Uint32Array<ArrayBuffer>
} {
  let bytes: Uint8Array<ArrayBuffer> = new Uint8Array(estimatedSearchCapacity(records))
  const offsets = new Uint32Array(records.length + 1)
  let byteOffset = 0

  for (let index = 0; index < records.length; index += 1) {
    offsets[index] = byteOffset
    const text = searchableTuple(records[index])
    let characterOffset = 0
    while (characterOffset < text.length) {
      if (byteOffset === bytes.length) bytes = growSearchBytes(bytes, byteOffset + 4)
      const encoded = searchTextEncoder.encodeInto(
        text.slice(characterOffset),
        bytes.subarray(byteOffset),
      )
      if (encoded.read === 0) {
        bytes = growSearchBytes(bytes, byteOffset + Math.max(4, text.length * 3))
        continue
      }
      characterOffset += encoded.read
      byteOffset += encoded.written
    }
  }
  offsets[records.length] = byteOffset
  return { bytes: bytes.slice(0, byteOffset), offsets }
}

export function prepareProgressiveIndex(
  index: ProgressiveSearchIndex,
): PreparedProgressiveIndex {
  const encodedSearch = encodeSearchText(index.records)
  return {
    records: index.records,
    searchBytes: encodedSearch.bytes,
    searchOffsets: encodedSearch.offsets,
    distanceOrder: Uint32Array.from(index.orders.distance),
    discoveryOrder: Uint32Array.from(index.orders.discovery),
  }
}

function encodedSearchIncludes(
  prepared: PreparedProgressiveIndex,
  recordIndex: number,
  needle: Uint8Array<ArrayBuffer>,
): boolean {
  const start = prepared.searchOffsets[recordIndex]
  const end = prepared.searchOffsets[recordIndex + 1]
  const lastStart = end - needle.length
  const firstByte = needle[0]
  for (let offset = start; offset <= lastStart; offset += 1) {
    if (prepared.searchBytes[offset] !== firstByte) continue
    let needleOffset = 1
    while (
      needleOffset < needle.length &&
      prepared.searchBytes[offset + needleOffset] === needle[needleOffset]
    ) {
      needleOffset += 1
    }
    if (needleOffset === needle.length) return true
  }
  return false
}

function matchesFilters(
  tuple: ProgressiveSummaryTuple,
  filters: ReadonlySet<ProgressiveCatalogFilter>,
): boolean {
  const distance = tuple[INDEX.distancePc]
  const radius = tuple[INDEX.radiusEarth]
  const temperature = tuple[INDEX.equilibriumTempK]
  const discoveryYear = tuple[INDEX.discoveryYear]
  if (filters.has('nearby') && (distance === null || distance >= 25)) return false
  if (filters.has('earth-size') && (radius === null || radius > 1.8)) return false
  if (
    filters.has('temperate') &&
    (temperature === null || temperature < 180 || temperature > 320)
  ) {
    return false
  }
  if (filters.has('recent') && (discoveryYear === null || discoveryYear < 2020)) {
    return false
  }
  return true
}

export function queryProgressiveIndex(
  prepared: PreparedProgressiveIndex,
  request: ProgressiveCatalogQuery,
): ProgressiveCatalogQueryResult {
  const needle = normalizeSearchText(request.query)
  const encodedNeedle = needle ? searchTextEncoder.encode(needle) : null
  const filters = new Set(request.filters)
  const matches: ProgressiveSummaryTuple[] = []
  let totalMatches = 0
  const order =
    request.sort === 'distance'
      ? prepared.distanceOrder
      : request.sort === 'discovery'
        ? prepared.discoveryOrder
        : null

  for (let position = 0; position < prepared.records.length; position += 1) {
    const recordIndex = order?.[position] ?? position
    const tuple = prepared.records[recordIndex]
    if (!matchesFilters(tuple, filters)) continue
    if (encodedNeedle && !encodedSearchIncludes(prepared, recordIndex, encodedNeedle)) continue
    totalMatches += 1
    if (matches.length < request.limit) matches.push(tuple)
  }

  return {
    totalMatches,
    results: matches.slice(0, request.limit).map(decodeProgressiveSummary),
  }
}
