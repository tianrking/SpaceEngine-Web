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
  readonly byName: readonly PreparedProgressiveRecord[]
  readonly byDistance: readonly PreparedProgressiveRecord[]
  readonly byDiscovery: readonly PreparedProgressiveRecord[]
}

interface PreparedProgressiveRecord {
  readonly tuple: ProgressiveSummaryTuple
  readonly searchText: string
  readonly nameRank: number
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

export function prepareProgressiveIndex(
  index: ProgressiveSearchIndex,
): PreparedProgressiveIndex {
  const records = [...index.records]
  const byName = records.map((tuple, nameRank) => ({
    tuple,
    searchText: searchableTuple(tuple),
    nameRank,
  }))
  return {
    byName,
    byDistance: index.orders.distance.map((position) => byName[position]),
    byDiscovery: index.orders.discovery.map((position) => byName[position]),
  }
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
  const filters = new Set(request.filters)
  const matches: ProgressiveSummaryTuple[] = []
  let totalMatches = 0
  const records =
    request.sort === 'distance'
      ? prepared.byDistance
      : request.sort === 'discovery'
        ? prepared.byDiscovery
        : prepared.byName

  for (const record of records) {
    const { tuple } = record
    if (!matchesFilters(tuple, filters)) continue
    if (needle && !record.searchText.includes(needle)) continue
    totalMatches += 1
    if (matches.length < request.limit) matches.push(tuple)
  }

  return {
    totalMatches,
    results: matches.slice(0, request.limit).map(decodeProgressiveSummary),
  }
}
