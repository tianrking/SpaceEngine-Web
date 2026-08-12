export const PROGRESSIVE_EXOPLANET_SCHEMA_VERSION = '2.0.0' as const
export const PROGRESSIVE_HOST_SKY_SCHEMA_VERSION = '1.0.0' as const
export const PROGRESSIVE_EXOPLANET_MANIFEST_URL =
  '/catalog/nasa-exoplanets/manifest.json' as const

export interface CatalogReference {
  readonly label: string
  readonly url: string | null
}

export interface CatalogMeasurement {
  readonly value: number | null
  readonly errorPlus: number | null
  readonly errorMinus: number | null
  readonly limit: number | null
  readonly unit: string
  readonly reference: CatalogReference | null
}

export interface ProgressiveExoplanetRecord {
  readonly id: string
  readonly name: string
  readonly host: string
  readonly externalIds: {
    readonly gaiaDr3: string | null
    readonly hd: string | null
    readonly hip: string | null
    readonly tic: string | null
  }
  readonly coordinates: {
    readonly frame: 'ICRS'
    readonly raDeg: number | null
    readonly decDeg: number | null
  }
  readonly measurements: Readonly<Record<string, CatalogMeasurement>>
  readonly hostStar: { readonly spectralType: string | null }
  readonly system: {
    readonly starCount: number | null
    readonly planetCount: number | null
    readonly moonCount: number | null
  }
  readonly discovery: {
    readonly year: number | null
    readonly publicationDate: string | null
    readonly method: string | null
    readonly locale: string | null
    readonly facility: string | null
    readonly instrument: string | null
    readonly telescope: string | null
    readonly reference: CatalogReference | null
  }
  readonly observationCounts: {
    readonly transmissionSpectra: number | null
    readonly emissionSpectra: number | null
    readonly directImagingSpectra: number | null
    readonly jwstTransmission: number | null
    readonly jwstEmission: number | null
    readonly jwstDirectImaging: number | null
    readonly jwstPhaseCurve: number | null
  }
  readonly flags: {
    readonly controversial: boolean
    readonly massProvenance: string | null
  }
}

export type ProgressiveSummaryTuple = readonly [
  id: string,
  name: string,
  host: string,
  distancePc: number | null,
  radiusEarth: number | null,
  massEarth: number | null,
  equilibriumTempK: number | null,
  stellarSpectralType: string | null,
  discoveryMethod: string | null,
  discoveryFacility: string | null,
  discoveryYear: number | null,
  chunkId: number,
]

export interface ProgressiveExoplanetSummary {
  readonly id: string
  readonly name: string
  readonly host: string
  readonly distancePc: number | null
  readonly radiusEarth: number | null
  readonly massEarth: number | null
  readonly equilibriumTempK: number | null
  readonly stellarSpectralType: string | null
  readonly discoveryMethod: string | null
  readonly discoveryFacility: string | null
  readonly discoveryYear: number | null
  readonly chunkId: number
}

export type ProgressiveHostSkyTuple = readonly [
  host: string,
  raDeg: number | null,
  decDeg: number | null,
  distancePc: number | null,
  gaiaMagnitude: number | null,
  stellarSpectralType: string | null,
  planetCount: number,
  starCount: number | null,
  gaiaDr3: string | null,
  conflictFields: string | null,
  representativePlanet: string,
]

export interface ProgressiveHostSkyIndex {
  readonly schemaVersion: typeof PROGRESSIVE_HOST_SKY_SCHEMA_VERSION
  readonly catalogRevision: string
  readonly coordinateFrame: 'ICRS'
  readonly columns: readonly string[]
  readonly provenance: {
    readonly selection: string
    readonly conflictPolicy: string
    readonly nullPolicy: string
  }
  readonly records: readonly ProgressiveHostSkyTuple[]
}

export interface CatalogAssetDescriptor {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
  readonly records: number
}

export interface CatalogChunkDescriptor extends CatalogAssetDescriptor {
  readonly id: number
  readonly firstName: string
  readonly lastName: string
}

export interface ProgressiveExoplanetManifest {
  readonly schemaVersion: typeof PROGRESSIVE_EXOPLANET_SCHEMA_VERSION
  readonly catalogId: 'nasa-exoplanets'
  readonly catalogRevision: string
  readonly retrievedAt: string
  readonly publishedAt: string
  readonly recordCount: number
  readonly hostCount: number
  readonly source: {
    readonly provider: 'NASA Exoplanet Archive'
    readonly table: 'pscomppars'
    readonly tapEndpoint: string
    readonly requestUrl: string
    readonly query: string
    readonly documentationUrl: string
    readonly acknowledgementUrl: string
    readonly product: string
  }
  readonly provenance: {
    readonly scope: string
    readonly nullPolicy: string
    readonly compositePolicy: string
    readonly sort: string
    readonly rightsStatus: string
  }
  readonly performance: {
    readonly detailChunkSize: number
    readonly chunkCount: number
    readonly resultPageSize: number
  }
  readonly searchIndex: CatalogAssetDescriptor
  readonly hostSkyIndex: CatalogAssetDescriptor
  readonly chunks: readonly CatalogChunkDescriptor[]
}

export interface ProgressiveSearchIndex {
  readonly schemaVersion: typeof PROGRESSIVE_EXOPLANET_SCHEMA_VERSION
  readonly catalogRevision: string
  readonly columns: readonly string[]
  readonly orders: {
    readonly distance: readonly number[]
    readonly discovery: readonly number[]
  }
  readonly records: readonly ProgressiveSummaryTuple[]
}

export interface ProgressiveDetailChunk {
  readonly schemaVersion: typeof PROGRESSIVE_EXOPLANET_SCHEMA_VERSION
  readonly catalogRevision: string
  readonly chunkId: number
  readonly records: readonly ProgressiveExoplanetRecord[]
}

type UnknownRecord = Record<string, unknown>

const EXPECTED_INDEX_COLUMNS = [
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
] as const

const EXPECTED_HOST_SKY_COLUMNS = [
  'host',
  'raDeg',
  'decDeg',
  'distancePc',
  'gaiaMagnitude',
  'stellarSpectralType',
  'planetCount',
  'starCount',
  'gaiaDr3',
  'conflictFields',
  'representativePlanet',
] as const

const EXPECTED_MEASUREMENT_KEYS = [
  'distancePc',
  'parallaxMas',
  'properMotionMasYr',
  'radiusEarth',
  'massEarth',
  'densityGcm3',
  'orbitalPeriodDays',
  'semiMajorAxisAu',
  'eccentricity',
  'inclinationDeg',
  'transitMidpointDays',
  'transitDurationHours',
  'transitDepthPercent',
  'radialVelocityAmplitudeMs',
  'equilibriumTempK',
  'insolationEarth',
  'transmissionMetric',
  'emissionMetric',
  'stellarTeffK',
  'stellarRadiusSolar',
  'stellarMassSolar',
  'stellarAgeGyr',
  'stellarMetallicityDex',
  'stellarLuminosityLogSolar',
  'stellarRotationDays',
  'gaiaMagnitude',
] as const

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`)
  }
}

function assertPositiveInteger(value: unknown, field: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new TypeError(`${field} must be a positive integer`)
  }
}

function assertNullableFinite(value: unknown, field: string): void {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new TypeError(`${field} must be finite or null`)
  }
}

function assertNullableString(value: unknown, field: string): void {
  if (value !== null && typeof value !== 'string') {
    throw new TypeError(`${field} must be a string or null`)
  }
}

function assertNullableNonNegativeInteger(value: unknown, field: string): void {
  if (value !== null && (!Number.isInteger(value) || Number(value) < 0)) {
    throw new TypeError(`${field} must be a non-negative integer or null`)
  }
}

function assertHttpUrl(value: unknown, field: string): void {
  assertNonEmptyString(value, field)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError(`${field} must be an absolute URL`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError(`${field} must use HTTP or HTTPS`)
  }
}

function assertReference(value: unknown, field: string): void {
  if (value === null) return
  if (!isRecord(value)) throw new TypeError(`${field} must be an object or null`)
  assertNonEmptyString(value.label, `${field}.label`)
  if (value.url !== null) assertHttpUrl(value.url, `${field}.url`)
}

function assertMeasurement(value: unknown, field: string): void {
  if (!isRecord(value)) throw new TypeError(`${field} must be an object`)
  for (const scalar of ['value', 'errorPlus', 'errorMinus', 'limit'] as const) {
    assertNullableFinite(value[scalar], `${field}.${scalar}`)
  }
  assertNonEmptyString(value.unit, `${field}.unit`)
  assertReference(value.reference, `${field}.reference`)
}

function assertAssetDescriptor(value: unknown, field: string): asserts value is CatalogAssetDescriptor {
  if (!isRecord(value)) throw new TypeError(`${field} must be an object`)
  assertNonEmptyString(value.path, `${field}.path`)
  if (!value.path.startsWith('/catalog/nasa-exoplanets/releases/')) {
    throw new TypeError(`${field}.path must stay inside the catalogue release root`)
  }
  if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw new TypeError(`${field}.sha256 must be a lowercase SHA-256 digest`)
  }
  assertPositiveInteger(value.bytes, `${field}.bytes`)
  assertPositiveInteger(value.records, `${field}.records`)
}

export function validateProgressiveManifest(input: unknown): ProgressiveExoplanetManifest {
  if (!isRecord(input)) throw new TypeError('Catalogue manifest must be an object')
  if (input.schemaVersion !== PROGRESSIVE_EXOPLANET_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported catalogue schema: ${String(input.schemaVersion)}`)
  }
  if (input.catalogId !== 'nasa-exoplanets') {
    throw new TypeError('Manifest catalogId must be nasa-exoplanets')
  }
  assertNonEmptyString(input.catalogRevision, 'catalogRevision')
  assertNonEmptyString(input.retrievedAt, 'retrievedAt')
  assertNonEmptyString(input.publishedAt, 'publishedAt')
  if (!Number.isFinite(Date.parse(input.retrievedAt))) {
    throw new TypeError('retrievedAt must be an ISO date')
  }
  if (!Number.isFinite(Date.parse(input.publishedAt))) {
    throw new TypeError('publishedAt must be an ISO date')
  }
  assertPositiveInteger(input.recordCount, 'recordCount')
  assertPositiveInteger(input.hostCount, 'hostCount')
  assertAssetDescriptor(input.searchIndex, 'searchIndex')
  assertAssetDescriptor(input.hostSkyIndex, 'hostSkyIndex')
  if (input.searchIndex.records !== input.recordCount) {
    throw new TypeError('Search-index record count must match manifest recordCount')
  }
  if (input.hostSkyIndex.records !== input.hostCount) {
    throw new TypeError('Host-sky record count must match manifest hostCount')
  }
  if (!Array.isArray(input.chunks) || input.chunks.length === 0) {
    throw new TypeError('chunks must be a non-empty array')
  }
  let chunkRecords = 0
  input.chunks.forEach((chunk, index) => {
    assertAssetDescriptor(chunk, `chunks[${index}]`)
    if (!isRecord(chunk) || chunk.id !== index) {
      throw new TypeError(`chunks[${index}].id must be contiguous`)
    }
    assertNonEmptyString(chunk.firstName, `chunks[${index}].firstName`)
    assertNonEmptyString(chunk.lastName, `chunks[${index}].lastName`)
    chunkRecords += chunk.records as number
  })
  if (chunkRecords !== input.recordCount) {
    throw new TypeError('Chunk record total must match manifest recordCount')
  }
  if (!isRecord(input.source) || input.source.provider !== 'NASA Exoplanet Archive') {
    throw new TypeError('Manifest source must identify NASA Exoplanet Archive')
  }
  if (input.source.table !== 'pscomppars') {
    throw new TypeError('Manifest source table must be pscomppars')
  }
  for (const field of ['tapEndpoint', 'requestUrl', 'documentationUrl', 'acknowledgementUrl'] as const) {
    assertHttpUrl(input.source[field], `source.${field}`)
  }
  for (const field of ['query', 'product'] as const) {
    assertNonEmptyString(input.source[field], `source.${field}`)
  }
  if (!isRecord(input.provenance) || !isRecord(input.performance)) {
    throw new TypeError('Manifest provenance and performance are required')
  }
  for (const field of ['scope', 'nullPolicy', 'compositePolicy', 'sort', 'rightsStatus'] as const) {
    assertNonEmptyString(input.provenance[field], `provenance.${field}`)
  }
  for (const field of ['detailChunkSize', 'chunkCount', 'resultPageSize'] as const) {
    assertPositiveInteger(input.performance[field], `performance.${field}`)
  }
  if (input.performance.chunkCount !== input.chunks.length) {
    throw new TypeError('performance.chunkCount must match the chunk descriptors')
  }
  const releaseRoot = `/catalog/nasa-exoplanets/releases/${input.catalogRevision}/`
  const descriptors = [input.searchIndex, input.hostSkyIndex, ...input.chunks]
  const paths = new Set<string>()
  for (const descriptor of descriptors) {
    if (!descriptor.path.startsWith(releaseRoot)) {
      throw new TypeError('Catalogue asset path must match catalogRevision')
    }
    if (paths.has(descriptor.path)) throw new TypeError('Catalogue asset paths must be unique')
    paths.add(descriptor.path)
  }
  return input as unknown as ProgressiveExoplanetManifest
}

function assertSummaryTuple(tuple: unknown, index: number, chunkCount: number): void {
  if (!Array.isArray(tuple) || tuple.length !== EXPECTED_INDEX_COLUMNS.length) {
    throw new TypeError(`records[${index}] must contain ${EXPECTED_INDEX_COLUMNS.length} fields`)
  }
  for (const [fieldIndex, field] of ['id', 'name', 'host'].entries()) {
    assertNonEmptyString(tuple[fieldIndex], `records[${index}].${field}`)
  }
  for (const fieldIndex of [3, 4, 5, 6, 10]) {
    assertNullableFinite(tuple[fieldIndex], `records[${index}][${fieldIndex}]`)
  }
  for (const fieldIndex of [7, 8, 9]) {
    if (tuple[fieldIndex] !== null && typeof tuple[fieldIndex] !== 'string') {
      throw new TypeError(`records[${index}][${fieldIndex}] must be a string or null`)
    }
  }
  const chunkId = tuple[11]
  if (!Number.isInteger(chunkId) || chunkId < 0 || chunkId >= chunkCount) {
    throw new TypeError(`records[${index}].chunkId is out of range`)
  }
}

export function validateProgressiveSearchIndex(
  input: unknown,
  manifest: ProgressiveExoplanetManifest,
): ProgressiveSearchIndex {
  if (!isRecord(input)) throw new TypeError('Search index must be an object')
  if (
    input.schemaVersion !== manifest.schemaVersion ||
    input.catalogRevision !== manifest.catalogRevision
  ) {
    throw new TypeError('Search index is incompatible with the active manifest')
  }
  if (
    !Array.isArray(input.columns) ||
    input.columns.join('\u0000') !== EXPECTED_INDEX_COLUMNS.join('\u0000')
  ) {
    throw new TypeError('Search index columns do not match the application schema')
  }
  if (!Array.isArray(input.records) || input.records.length !== manifest.recordCount) {
    throw new TypeError('Search index record count does not match the manifest')
  }
  if (!isRecord(input.orders)) throw new TypeError('Search index orders are required')
  for (const orderName of ['distance', 'discovery'] as const) {
    const order = input.orders[orderName]
    if (!Array.isArray(order) || order.length !== manifest.recordCount) {
      throw new TypeError(`Search index ${orderName} order must cover every record`)
    }
    const seen = new Uint8Array(manifest.recordCount)
    for (const position of order) {
      if (!Number.isInteger(position) || position < 0 || position >= manifest.recordCount) {
        throw new TypeError(`Search index ${orderName} order contains an invalid position`)
      }
      if (seen[position] === 1) {
        throw new TypeError(`Search index ${orderName} order contains a duplicate position`)
      }
      seen[position] = 1
    }
  }
  const ids = new Set<string>()
  input.records.forEach((tuple, index) => {
    assertSummaryTuple(tuple, index, manifest.chunks.length)
    const id = tuple[0] as string
    if (ids.has(id)) throw new TypeError(`Duplicate search-index id: ${id}`)
    ids.add(id)
  })
  for (const [orderName, valueIndex, direction] of [
    ['distance', 3, 'ascending'],
    ['discovery', 10, 'descending'],
  ] as const) {
    const order = input.orders[orderName] as number[]
    for (let index = 1; index < order.length; index += 1) {
      const previousPosition = order[index - 1]
      const position = order[index]
      const previous = input.records[previousPosition][valueIndex] as number | null
      const current = input.records[position][valueIndex] as number | null
      const invalidNullOrder = previous === null && current !== null
      const invalidValueOrder =
        previous !== null &&
        current !== null &&
        (direction === 'ascending' ? previous > current : previous < current)
      if (invalidNullOrder || invalidValueOrder) {
        throw new TypeError(`Search index ${orderName} order is not sorted`)
      }
    }
  }
  return input as unknown as ProgressiveSearchIndex
}

function assertHostSkyTuple(tuple: unknown, index: number): void {
  if (!Array.isArray(tuple) || tuple.length !== EXPECTED_HOST_SKY_COLUMNS.length) {
    throw new TypeError(
      `records[${index}] must contain ${EXPECTED_HOST_SKY_COLUMNS.length} host fields`,
    )
  }
  assertNonEmptyString(tuple[0], `records[${index}].host`)
  assertNullableFinite(tuple[1], `records[${index}].raDeg`)
  assertNullableFinite(tuple[2], `records[${index}].decDeg`)
  assertNullableFinite(tuple[3], `records[${index}].distancePc`)
  assertNullableFinite(tuple[4], `records[${index}].gaiaMagnitude`)
  assertNullableString(tuple[5], `records[${index}].stellarSpectralType`)
  assertPositiveInteger(tuple[6], `records[${index}].planetCount`)
  assertNullableNonNegativeInteger(tuple[7], `records[${index}].starCount`)
  assertNullableString(tuple[8], `records[${index}].gaiaDr3`)
  assertNullableString(tuple[9], `records[${index}].conflictFields`)
  assertNonEmptyString(tuple[10], `records[${index}].representativePlanet`)
  if (tuple[1] !== null && (Number(tuple[1]) < 0 || Number(tuple[1]) >= 360)) {
    throw new TypeError(`records[${index}].raDeg is out of range`)
  }
  if (tuple[2] !== null && (Number(tuple[2]) < -90 || Number(tuple[2]) > 90)) {
    throw new TypeError(`records[${index}].decDeg is out of range`)
  }
  if (tuple[3] !== null && Number(tuple[3]) <= 0) {
    throw new TypeError(`records[${index}].distancePc must be positive or null`)
  }
}

export function validateProgressiveHostSkyIndex(
  input: unknown,
  manifest: ProgressiveExoplanetManifest,
): ProgressiveHostSkyIndex {
  if (!isRecord(input)) throw new TypeError('Host-sky index must be an object')
  if (
    input.schemaVersion !== PROGRESSIVE_HOST_SKY_SCHEMA_VERSION ||
    input.catalogRevision !== manifest.catalogRevision ||
    input.coordinateFrame !== 'ICRS'
  ) {
    throw new TypeError('Host-sky index is incompatible with the active manifest')
  }
  if (
    !Array.isArray(input.columns) ||
    input.columns.join('\u0000') !== EXPECTED_HOST_SKY_COLUMNS.join('\u0000')
  ) {
    throw new TypeError('Host-sky columns do not match the application schema')
  }
  if (!isRecord(input.provenance)) {
    throw new TypeError('Host-sky provenance is required')
  }
  for (const field of ['selection', 'conflictPolicy', 'nullPolicy'] as const) {
    assertNonEmptyString(input.provenance[field], `provenance.${field}`)
  }
  if (!Array.isArray(input.records) || input.records.length !== manifest.hostCount) {
    throw new TypeError('Host-sky record count does not match the manifest')
  }
  const hosts = new Set<string>()
  let previousHost: string | null = null
  for (const [index, tuple] of input.records.entries()) {
    assertHostSkyTuple(tuple, index)
    const host = (tuple as unknown[])[0] as string
    if (hosts.has(host)) throw new TypeError(`Duplicate host-sky identity: ${host}`)
    if (previousHost !== null && previousHost.localeCompare(host, 'en', {
      sensitivity: 'base',
      numeric: true,
    }) > 0) {
      throw new TypeError('Host-sky records are not sorted by host name')
    }
    hosts.add(host)
    previousHost = host
  }
  return input as unknown as ProgressiveHostSkyIndex
}

export function validateProgressiveDetailChunk(
  input: unknown,
  manifest: ProgressiveExoplanetManifest,
  descriptor: CatalogChunkDescriptor,
): ProgressiveDetailChunk {
  if (!isRecord(input)) throw new TypeError('Detail chunk must be an object')
  if (
    input.schemaVersion !== manifest.schemaVersion ||
    input.catalogRevision !== manifest.catalogRevision ||
    input.chunkId !== descriptor.id
  ) {
    throw new TypeError('Detail chunk is incompatible with its manifest descriptor')
  }
  if (!Array.isArray(input.records) || input.records.length !== descriptor.records) {
    throw new TypeError('Detail chunk record count does not match its descriptor')
  }
  const ids = new Set<string>()
  for (const [index, record] of input.records.entries()) {
    if (!isRecord(record)) throw new TypeError(`records[${index}] must be an object`)
    assertNonEmptyString(record.id, `records[${index}].id`)
    assertNonEmptyString(record.name, `records[${index}].name`)
    assertNonEmptyString(record.host, `records[${index}].host`)
    if (!isRecord(record.externalIds)) {
      throw new TypeError(`records[${index}].externalIds must be an object`)
    }
    for (const field of ['gaiaDr3', 'hd', 'hip', 'tic'] as const) {
      assertNullableString(record.externalIds[field], `records[${index}].externalIds.${field}`)
    }
    if (!isRecord(record.coordinates) || record.coordinates.frame !== 'ICRS') {
      throw new TypeError(`records[${index}].coordinates must use the ICRS frame`)
    }
    assertNullableFinite(record.coordinates.raDeg, `records[${index}].coordinates.raDeg`)
    assertNullableFinite(record.coordinates.decDeg, `records[${index}].coordinates.decDeg`)
    if (
      record.coordinates.raDeg !== null &&
      (Number(record.coordinates.raDeg) < 0 || Number(record.coordinates.raDeg) >= 360)
    ) {
      throw new TypeError(`records[${index}].coordinates.raDeg is out of range`)
    }
    if (
      record.coordinates.decDeg !== null &&
      (Number(record.coordinates.decDeg) < -90 || Number(record.coordinates.decDeg) > 90)
    ) {
      throw new TypeError(`records[${index}].coordinates.decDeg is out of range`)
    }
    if (!isRecord(record.measurements)) {
      throw new TypeError(`records[${index}].measurements must be an object`)
    }
    for (const key of EXPECTED_MEASUREMENT_KEYS) {
      assertMeasurement(record.measurements[key], `records[${index}].measurements.${key}`)
    }
    if (!isRecord(record.hostStar)) {
      throw new TypeError(`records[${index}].hostStar must be an object`)
    }
    assertNullableString(record.hostStar.spectralType, `records[${index}].hostStar.spectralType`)
    if (!isRecord(record.system)) {
      throw new TypeError(`records[${index}].system must be an object`)
    }
    for (const field of ['starCount', 'planetCount', 'moonCount'] as const) {
      assertNullableNonNegativeInteger(record.system[field], `records[${index}].system.${field}`)
    }
    if (!isRecord(record.discovery)) {
      throw new TypeError(`records[${index}].discovery must be an object`)
    }
    assertNullableNonNegativeInteger(record.discovery.year, `records[${index}].discovery.year`)
    for (const field of [
      'publicationDate',
      'method',
      'locale',
      'facility',
      'instrument',
      'telescope',
    ] as const) {
      assertNullableString(record.discovery[field], `records[${index}].discovery.${field}`)
    }
    assertReference(record.discovery.reference, `records[${index}].discovery.reference`)
    if (!isRecord(record.observationCounts)) {
      throw new TypeError(`records[${index}].observationCounts must be an object`)
    }
    for (const field of [
      'transmissionSpectra',
      'emissionSpectra',
      'directImagingSpectra',
      'jwstTransmission',
      'jwstEmission',
      'jwstDirectImaging',
      'jwstPhaseCurve',
    ] as const) {
      assertNullableNonNegativeInteger(
        record.observationCounts[field],
        `records[${index}].observationCounts.${field}`,
      )
    }
    if (!isRecord(record.flags) || typeof record.flags.controversial !== 'boolean') {
      throw new TypeError(`records[${index}].flags must contain a controversial boolean`)
    }
    assertNullableString(record.flags.massProvenance, `records[${index}].flags.massProvenance`)
    if (ids.has(record.id)) throw new TypeError(`Duplicate chunk id: ${record.id}`)
    ids.add(record.id)
  }
  if (
    (input.records[0] as UnknownRecord).name !== descriptor.firstName ||
    (input.records.at(-1) as UnknownRecord).name !== descriptor.lastName
  ) {
    throw new TypeError('Detail chunk boundaries do not match its descriptor')
  }
  return input as unknown as ProgressiveDetailChunk
}

export function decodeProgressiveSummary(
  tuple: ProgressiveSummaryTuple,
): ProgressiveExoplanetSummary {
  return {
    id: tuple[0],
    name: tuple[1],
    host: tuple[2],
    distancePc: tuple[3],
    radiusEarth: tuple[4],
    massEarth: tuple[5],
    equilibriumTempK: tuple[6],
    stellarSpectralType: tuple[7],
    discoveryMethod: tuple[8],
    discoveryFacility: tuple[9],
    discoveryYear: tuple[10],
    chunkId: tuple[11],
  }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyProgressiveAssetBytes(
  descriptor: CatalogAssetDescriptor,
  bytes: ArrayBuffer,
): Promise<unknown> {
  if (bytes.byteLength !== descriptor.bytes) {
    throw new Error(`Catalogue asset size mismatch for ${descriptor.path}`)
  }
  if ((await sha256Hex(bytes)) !== descriptor.sha256) {
    throw new Error(`Catalogue asset integrity mismatch for ${descriptor.path}`)
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

export interface VerifiedProgressiveAsset {
  readonly bytes: ArrayBuffer
  readonly value: unknown
}

export async function fetchProgressiveAsset(
  descriptor: CatalogAssetDescriptor,
  signal?: AbortSignal,
): Promise<VerifiedProgressiveAsset> {
  const response = await fetch(descriptor.path, { signal, cache: 'force-cache' })
  if (!response.ok) throw new Error(`Catalogue asset failed (${response.status})`)
  const bytes = await response.arrayBuffer()
  return { bytes, value: await verifyProgressiveAssetBytes(descriptor, bytes) }
}

export async function loadProgressiveManifest(
  signal?: AbortSignal,
): Promise<ProgressiveExoplanetManifest> {
  const response = await fetch(PROGRESSIVE_EXOPLANET_MANIFEST_URL, {
    signal,
    cache: 'no-cache',
  })
  if (!response.ok) throw new Error(`Catalogue manifest failed (${response.status})`)
  return validateProgressiveManifest(await response.json())
}

export async function loadProgressiveSearchIndex(
  manifest: ProgressiveExoplanetManifest,
  signal?: AbortSignal,
  cachedBytes?: ArrayBuffer,
): Promise<ProgressiveSearchIndex> {
  const value = cachedBytes
    ? await verifyProgressiveAssetBytes(manifest.searchIndex, cachedBytes)
    : (await fetchProgressiveAsset(manifest.searchIndex, signal)).value
  return validateProgressiveSearchIndex(
    value,
    manifest,
  )
}

export async function loadProgressiveHostSkyIndex(
  manifest: ProgressiveExoplanetManifest,
  signal?: AbortSignal,
  cachedBytes?: ArrayBuffer,
): Promise<ProgressiveHostSkyIndex> {
  const value = cachedBytes
    ? await verifyProgressiveAssetBytes(manifest.hostSkyIndex, cachedBytes)
    : (await fetchProgressiveAsset(manifest.hostSkyIndex, signal)).value
  return validateProgressiveHostSkyIndex(value, manifest)
}

export async function loadProgressiveDetailChunk(
  manifest: ProgressiveExoplanetManifest,
  chunkId: number,
  signal?: AbortSignal,
  cachedBytes?: ArrayBuffer,
): Promise<ProgressiveDetailChunk> {
  const descriptor = manifest.chunks[chunkId]
  if (!descriptor) throw new RangeError(`Unknown catalogue chunk: ${chunkId}`)
  const value = cachedBytes
    ? await verifyProgressiveAssetBytes(descriptor, cachedBytes)
    : (await fetchProgressiveAsset(descriptor, signal)).value
  return validateProgressiveDetailChunk(
    value,
    manifest,
    descriptor,
  )
}
