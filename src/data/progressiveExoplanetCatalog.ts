export const PROGRESSIVE_EXOPLANET_SCHEMA_VERSION = '2.0.0' as const
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
  readonly chunks: readonly CatalogChunkDescriptor[]
}

export interface ProgressiveSearchIndex {
  readonly schemaVersion: typeof PROGRESSIVE_EXOPLANET_SCHEMA_VERSION
  readonly catalogRevision: string
  readonly columns: readonly string[]
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
  if (input.searchIndex.records !== input.recordCount) {
    throw new TypeError('Search-index record count must match manifest recordCount')
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
  if (!isRecord(input.provenance) || !isRecord(input.performance)) {
    throw new TypeError('Manifest provenance and performance are required')
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
  const ids = new Set<string>()
  input.records.forEach((tuple, index) => {
    assertSummaryTuple(tuple, index, manifest.chunks.length)
    const id = tuple[0] as string
    if (ids.has(id)) throw new TypeError(`Duplicate search-index id: ${id}`)
    ids.add(id)
  })
  return input as unknown as ProgressiveSearchIndex
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
    if (!isRecord(record.measurements)) {
      throw new TypeError(`records[${index}].measurements must be an object`)
    }
    if (ids.has(record.id)) throw new TypeError(`Duplicate chunk id: ${record.id}`)
    ids.add(record.id)
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

async function fetchVerifiedJson(
  descriptor: CatalogAssetDescriptor,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(descriptor.path, { signal, cache: 'force-cache' })
  if (!response.ok) throw new Error(`Catalogue asset failed (${response.status})`)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength !== descriptor.bytes) {
    throw new Error(`Catalogue asset size mismatch for ${descriptor.path}`)
  }
  if ((await sha256Hex(bytes)) !== descriptor.sha256) {
    throw new Error(`Catalogue asset integrity mismatch for ${descriptor.path}`)
  }
  return JSON.parse(new TextDecoder().decode(bytes))
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
): Promise<ProgressiveSearchIndex> {
  return validateProgressiveSearchIndex(
    await fetchVerifiedJson(manifest.searchIndex, signal),
    manifest,
  )
}

export async function loadProgressiveDetailChunk(
  manifest: ProgressiveExoplanetManifest,
  chunkId: number,
  signal?: AbortSignal,
): Promise<ProgressiveDetailChunk> {
  const descriptor = manifest.chunks[chunkId]
  if (!descriptor) throw new RangeError(`Unknown catalogue chunk: ${chunkId}`)
  return validateProgressiveDetailChunk(
    await fetchVerifiedJson(descriptor, signal),
    manifest,
    descriptor,
  )
}
