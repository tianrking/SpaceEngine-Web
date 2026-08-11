export const EXOPLANET_CATALOG_SCHEMA_VERSION = '1.0.0' as const
export const NEARBY_EXOPLANET_COUNT = 128 as const

export interface ExoplanetRecord {
  readonly name: string
  readonly host: string
  readonly distancePc: number
  readonly raDeg: number | null
  readonly decDeg: number | null
  readonly radiusEarth: number
  readonly massEarth: number
  readonly orbitalPeriodDays: number
  readonly semiMajorAxisAu: number
  readonly eccentricity: number | null
  readonly equilibriumTempK: number | null
  readonly insolationEarth: number | null
  readonly stellarSpectralType: string | null
  readonly stellarTeffK: number | null
  readonly stellarRadiusSolar: number | null
  readonly stellarMassSolar: number | null
  readonly systemStarCount: number | null
  readonly systemPlanetCount: number | null
  readonly discoveryYear: number | null
  readonly discoveryMethod: string | null
  readonly discoveryFacility: string | null
}

export interface ExoplanetCatalogSource {
  readonly provider: 'NASA Exoplanet Archive'
  readonly table: 'pscomppars'
  readonly tapEndpoint: string
  readonly requestUrl: string
  readonly query: string
  readonly documentationUrl: string
}

export interface ExoplanetCatalogProvenance {
  readonly catalogueScope: string
  readonly selection: string
  readonly numericConversion: string
  readonly nullPolicy: string
  readonly sort: string
}

export interface ExoplanetCatalogMetadata {
  readonly schemaVersion: typeof EXOPLANET_CATALOG_SCHEMA_VERSION
  readonly retrievedAt: string
  readonly recordCount: number
  readonly source: ExoplanetCatalogSource
  readonly units: Readonly<Record<string, string>>
  readonly provenance: ExoplanetCatalogProvenance
}

export interface ExoplanetCatalog {
  readonly metadata: ExoplanetCatalogMetadata
  readonly planets: readonly ExoplanetRecord[]
}

type UnknownRecord = Record<string, unknown>

const REQUIRED_POSITIVE_FIELDS = [
  'distancePc',
  'radiusEarth',
  'massEarth',
  'orbitalPeriodDays',
  'semiMajorAxisAu',
] as const

const OPTIONAL_NUMBER_FIELDS = [
  'raDeg',
  'decDeg',
  'eccentricity',
  'equilibriumTempK',
  'insolationEarth',
  'stellarTeffK',
  'stellarRadiusSolar',
  'stellarMassSolar',
  'systemStarCount',
  'systemPlanetCount',
  'discoveryYear',
] as const

const OPTIONAL_STRING_FIELDS = [
  'stellarSpectralType',
  'discoveryMethod',
  'discoveryFacility',
] as const

const REQUIRED_UNIT_FIELDS = [
  ...REQUIRED_POSITIVE_FIELDS,
  'raDeg',
  'decDeg',
  'eccentricity',
  'equilibriumTempK',
  'insolationEarth',
  'stellarTeffK',
  'stellarRadiusSolar',
  'stellarMassSolar',
  'systemStarCount',
  'systemPlanetCount',
  'discoveryYear',
] as const

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertString(record: UnknownRecord, field: string, context: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${context}.${field} must be a non-empty string`)
  }
  return value
}

function assertFiniteNumber(
  record: UnknownRecord,
  field: string,
  context: string,
): number {
  const value = record[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${context}.${field} must be finite`)
  }
  return value
}

function assertNullableNumber(record: UnknownRecord, field: string, context: string): void {
  const value = record[field]
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new TypeError(`${context}.${field} must be finite or null`)
  }
}

function assertNullableString(record: UnknownRecord, field: string, context: string): void {
  const value = record[field]
  if (value !== null && typeof value !== 'string') {
    throw new TypeError(`${context}.${field} must be a string or null`)
  }
}

function assertPlanet(value: unknown, index: number): asserts value is ExoplanetRecord {
  const context = `planets[${index}]`
  if (!isRecord(value)) throw new TypeError(`${context} must be an object`)
  assertString(value, 'name', context)
  assertString(value, 'host', context)
  for (const field of REQUIRED_POSITIVE_FIELDS) {
    const numeric = assertFiniteNumber(value, field, context)
    if (numeric <= 0) throw new RangeError(`${context}.${field} must be positive`)
  }
  for (const field of OPTIONAL_NUMBER_FIELDS) {
    assertNullableNumber(value, field, context)
  }
  for (const field of OPTIONAL_STRING_FIELDS) {
    assertNullableString(value, field, context)
  }
}

function assertMetadata(value: unknown): asserts value is ExoplanetCatalogMetadata {
  if (!isRecord(value)) throw new TypeError('metadata must be an object')
  if (value.schemaVersion !== EXOPLANET_CATALOG_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported exoplanet schema version: ${String(value.schemaVersion)}`)
  }
  const retrievedAt = assertString(value, 'retrievedAt', 'metadata')
  if (!Number.isFinite(Date.parse(retrievedAt))) {
    throw new TypeError('metadata.retrievedAt must be an ISO date')
  }
  if (assertFiniteNumber(value, 'recordCount', 'metadata') !== NEARBY_EXOPLANET_COUNT) {
    throw new RangeError(`metadata.recordCount must be ${NEARBY_EXOPLANET_COUNT}`)
  }
  if (!isRecord(value.source)) throw new TypeError('metadata.source must be an object')
  if (value.source.provider !== 'NASA Exoplanet Archive') {
    throw new TypeError('metadata.source.provider must identify NASA Exoplanet Archive')
  }
  if (value.source.table !== 'pscomppars') {
    throw new TypeError('metadata.source.table must be pscomppars')
  }
  for (const field of [
    'tapEndpoint',
    'requestUrl',
    'query',
    'documentationUrl',
  ]) {
    assertString(value.source, field, 'metadata.source')
  }
  const requestUrl = new URL(value.source.requestUrl as string)
  if (
    requestUrl.hostname !== 'exoplanetarchive.ipac.caltech.edu' ||
    requestUrl.searchParams.get('query') !== value.source.query ||
    requestUrl.searchParams.get('format') !== 'json'
  ) {
    throw new TypeError('metadata.source.requestUrl must reproduce the official JSON query')
  }
  if (!isRecord(value.units)) throw new TypeError('metadata.units must be an object')
  for (const field of REQUIRED_UNIT_FIELDS) {
    assertString(value.units, field, 'metadata.units')
  }
  if (!isRecord(value.provenance)) {
    throw new TypeError('metadata.provenance must be an object')
  }
  for (const field of [
    'catalogueScope',
    'selection',
    'numericConversion',
    'nullPolicy',
    'sort',
  ]) {
    assertString(value.provenance, field, 'metadata.provenance')
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function comparePlanets(left: ExoplanetRecord, right: ExoplanetRecord): number {
  return (
    left.distancePc - right.distancePc ||
    compareText(left.host, right.host) ||
    compareText(left.name, right.name)
  )
}

export function validateExoplanetCatalog(input: unknown): ExoplanetCatalog {
  if (!isRecord(input)) throw new TypeError('Exoplanet catalog must be an object')
  assertMetadata(input.metadata)
  if (!Array.isArray(input.planets)) throw new TypeError('planets must be an array')
  if (input.planets.length !== NEARBY_EXOPLANET_COUNT) {
    throw new RangeError(`planets must contain ${NEARBY_EXOPLANET_COUNT} records`)
  }

  const names = new Set<string>()
  for (const [index, planet] of input.planets.entries()) {
    assertPlanet(planet, index)
    if (names.has(planet.name)) throw new TypeError(`Duplicate planet name: ${planet.name}`)
    names.add(planet.name)
    if (index > 0 && comparePlanets(input.planets[index - 1], planet) > 0) {
      throw new TypeError('planets must use deterministic nearby-distance sorting')
    }
  }

  return input as unknown as ExoplanetCatalog
}

export async function loadNearbyExoplanetCatalog(): Promise<ExoplanetCatalog> {
  const snapshot = await import('./generated/nearby-exoplanets-128.json')
  return validateExoplanetCatalog(snapshot.default)
}
