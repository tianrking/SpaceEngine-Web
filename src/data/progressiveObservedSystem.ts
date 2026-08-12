import type {
  CatalogMeasurement,
  ProgressiveDetailChunk,
  ProgressiveExoplanetManifest,
  ProgressiveExoplanetRecord,
  ProgressiveSearchIndex,
  ProgressiveSummaryTuple,
} from './progressiveExoplanetCatalog'
import { decodeProgressiveSummary } from './progressiveExoplanetCatalog'

export const OBSERVED_SYSTEM_SCHEMA_VERSION = '1.0.0' as const

export type ObservedEvidenceClass =
  | 'archive-composite'
  | 'derived'
  | 'illustrative'

export type HostStellarMeasurementKey =
  | 'stellarMassSolar'
  | 'stellarRadiusSolar'
  | 'stellarTeffK'
  | 'stellarLuminosityLogSolar'

export type ObservedOrbitElement =
  | 'semiMajorAxisAu'
  | 'orbitalPeriodDays'
  | 'eccentricity'
  | 'inclinationDeg'
  | 'transitMidpointDays'
  | 'longitudeAscendingNodeDeg'
  | 'argumentPeriapsisDeg'
  | 'meanAnomalyAtEpochDeg'

export interface ObservedMeasurementCandidate {
  readonly planetId: string
  readonly planetName: string
  readonly sourceField: string
  readonly evidence: 'archive-composite'
  readonly measurement: CatalogMeasurement
}

export interface HostMeasurementResolution {
  readonly status: 'single' | 'missing' | 'conflict'
  /**
   * Present only when every reported scientific payload is identical. References may
   * differ and remain preserved in candidates; selected is a representative value.
   */
  readonly selected: ObservedMeasurementCandidate | null
  /** Includes null candidates so the archive's missingness remains inspectable. */
  readonly candidates: readonly ObservedMeasurementCandidate[]
}

export interface ObservedRenderAssumption {
  readonly field:
    | 'inclinationDeg'
    | 'eccentricity'
    | 'longitudeAscendingNodeDeg'
    | 'argumentPeriapsisDeg'
    | 'meanAnomalyAtEpochDeg'
  readonly value: number
  readonly unit: 'deg' | 'dimensionless'
  readonly evidence: 'illustrative'
  readonly seed: string
  readonly reason: string
}

export interface ObservedPlanetOrbit {
  readonly semiMajorAxisAu: CatalogMeasurement
  readonly orbitalPeriodDays: CatalogMeasurement
  readonly eccentricity: CatalogMeasurement
  readonly inclinationDeg: CatalogMeasurement
  readonly transitMidpointDays: CatalogMeasurement
  readonly missingElements: readonly ObservedOrbitElement[]
  readonly renderAssumptions: readonly ObservedRenderAssumption[]
}

export interface ObservedPlanetBundle {
  readonly id: string
  readonly name: string
  readonly host: string
  readonly evidence: 'archive-composite'
  /** The validated archive row, including every null, error, limit, unit and reference. */
  readonly record: ProgressiveExoplanetRecord
  readonly orbit: ObservedPlanetOrbit
}

export interface DerivedIcrsPosition {
  readonly xPc: number
  readonly yPc: number
  readonly zPc: number
  readonly evidence: 'derived'
  readonly method: 'ICRS spherical coordinates to right-handed Cartesian parsecs'
  readonly inputs: readonly ['raDeg', 'decDeg', 'distancePc']
}

export interface ObservedSystemBundle {
  readonly schemaVersion: typeof OBSERVED_SYSTEM_SCHEMA_VERSION
  readonly id: string
  readonly host: string
  readonly evidence: 'archive-composite'
  readonly astrometry: {
    readonly frame: 'ICRS'
    readonly raDeg: number | null
    readonly decDeg: number | null
    readonly distancePc: HostMeasurementResolution
    readonly cartesianPosition: DerivedIcrsPosition | null
    readonly sourceFields: readonly ['ra', 'dec', 'sy_dist']
  }
  readonly hostStar: {
    readonly spectralTypes: readonly string[]
    readonly measurements: Readonly<Record<HostStellarMeasurementKey, HostMeasurementResolution>>
  }
  readonly planets: readonly ObservedPlanetBundle[]
  readonly provenance: {
    readonly provider: 'NASA Exoplanet Archive'
    readonly table: 'pscomppars'
    readonly product: string
    readonly catalogRevision: string
    readonly retrievedAt: string
    readonly publishedAt: string
    readonly requestUrl: string
    readonly query: string
    readonly documentationUrl: string
    readonly acknowledgementUrl: string
    readonly nullPolicy: string
    readonly compositePolicy: string
    readonly rightsStatus: string
    readonly evidence: 'archive-composite'
  }
}

export interface PreparedObservedHostIndex {
  readonly recordsByExactHost: ReadonlyMap<string, readonly ProgressiveSummaryTuple[]>
}

export interface ObservedSystemStreamResult {
  readonly system: ObservedSystemBundle
  readonly chunkIds: readonly number[]
}

export interface ObservedSystemStreamOptions {
  readonly concurrency?: number
  readonly isCancelled?: () => boolean
}

const STELLAR_SOURCE_FIELDS: Readonly<Record<HostStellarMeasurementKey, string>> = {
  stellarMassSolar: 'st_mass',
  stellarRadiusSolar: 'st_rad',
  stellarTeffK: 'st_teff',
  stellarLuminosityLogSolar: 'st_lum',
}

const ALWAYS_ILLUSTRATIVE_ORBIT_FIELDS = [
  'longitudeAscendingNodeDeg',
  'argumentPeriapsisDeg',
  'meanAnomalyAtEpochDeg',
] as const

function cancelledError(): DOMException {
  return new DOMException('Catalogue request cancelled', 'AbortError')
}

function assertActive(isCancelled: () => boolean): void {
  if (isCancelled()) throw cancelledError()
}

function stableUnitInterval(seed: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0x1_0000_0000
}

function illustrativeAssumption(
  revision: string,
  planetId: string,
  field: ObservedRenderAssumption['field'],
): ObservedRenderAssumption {
  const seed = `${revision}:${planetId}:${field}`
  const fraction = stableUnitInterval(seed)
  const isEccentricity = field === 'eccentricity'
  return {
    field,
    value: isEccentricity ? 0 : fraction * 360,
    unit: isEccentricity ? 'dimensionless' : 'deg',
    evidence: 'illustrative',
    seed,
    reason: 'The NASA archive composite does not report this element; the value is for deterministic rendering only.',
  }
}

function planetOrbit(
  manifest: ProgressiveExoplanetManifest,
  record: ProgressiveExoplanetRecord,
): ObservedPlanetOrbit {
  const measurements = record.measurements
  const missingElements: ObservedOrbitElement[] = []
  for (const key of [
    'semiMajorAxisAu',
    'orbitalPeriodDays',
    'eccentricity',
    'inclinationDeg',
    'transitMidpointDays',
  ] as const) {
    if (measurements[key].value === null) missingElements.push(key)
  }
  missingElements.push(...ALWAYS_ILLUSTRATIVE_ORBIT_FIELDS)

  const renderAssumptions: ObservedRenderAssumption[] = ALWAYS_ILLUSTRATIVE_ORBIT_FIELDS.map(
    (field) => illustrativeAssumption(manifest.catalogRevision, record.id, field),
  )
  if (measurements.inclinationDeg.value === null) {
    renderAssumptions.push(
      illustrativeAssumption(manifest.catalogRevision, record.id, 'inclinationDeg'),
    )
  }
  if (measurements.eccentricity.value === null) {
    renderAssumptions.push(
      illustrativeAssumption(manifest.catalogRevision, record.id, 'eccentricity'),
    )
  }

  return {
    semiMajorAxisAu: measurements.semiMajorAxisAu,
    orbitalPeriodDays: measurements.orbitalPeriodDays,
    eccentricity: measurements.eccentricity,
    inclinationDeg: measurements.inclinationDeg,
    transitMidpointDays: measurements.transitMidpointDays,
    missingElements,
    renderAssumptions,
  }
}

function measurementSignature(measurement: CatalogMeasurement): string {
  return JSON.stringify([
    measurement.value,
    measurement.errorPlus,
    measurement.errorMinus,
    measurement.limit,
    measurement.unit,
  ])
}

function resolveHostMeasurement(
  planets: readonly ProgressiveExoplanetRecord[],
  key: string,
  sourceField: string,
): HostMeasurementResolution {
  const candidates = planets.map<ObservedMeasurementCandidate>((planet) => ({
    planetId: planet.id,
    planetName: planet.name,
    sourceField,
    evidence: 'archive-composite',
    measurement: planet.measurements[key],
  }))
  const reported = candidates.filter(({ measurement }) => measurement.value !== null)
  if (reported.length === 0) return { status: 'missing', selected: null, candidates }
  const unique = new Map(
    reported.map((candidate) => [measurementSignature(candidate.measurement), candidate]),
  )
  if (unique.size > 1) return { status: 'conflict', selected: null, candidates }
  return { status: 'single', selected: unique.values().next().value ?? null, candidates }
}

function exactNullableHostValue(
  planets: readonly ProgressiveExoplanetRecord[],
  host: string,
  field: string,
  select: (record: ProgressiveExoplanetRecord) => number | null,
): number | null {
  const values = planets.map(select).filter((value): value is number => value !== null)
  const unique = new Set(values)
  if (unique.size > 1) throw new Error(`Conflicting ${field} values for NASA host: ${host}`)
  return values[0] ?? null
}

function derivedPosition(
  raDeg: number | null,
  decDeg: number | null,
  distancePc: number | null,
): DerivedIcrsPosition | null {
  if (raDeg === null || decDeg === null || distancePc === null) return null
  const ra = raDeg * Math.PI / 180
  const dec = decDeg * Math.PI / 180
  const planar = distancePc * Math.cos(dec)
  return {
    xPc: planar * Math.cos(ra),
    yPc: planar * Math.sin(ra),
    zPc: distancePc * Math.sin(dec),
    evidence: 'derived',
    method: 'ICRS spherical coordinates to right-handed Cartesian parsecs',
    inputs: ['raDeg', 'decDeg', 'distancePc'],
  }
}

export function prepareObservedHostIndex(
  index: ProgressiveSearchIndex,
): PreparedObservedHostIndex {
  const mutable = new Map<string, ProgressiveSummaryTuple[]>()
  for (const tuple of index.records) {
    const records = mutable.get(tuple[2]) ?? []
    records.push(tuple)
    mutable.set(tuple[2], records)
  }
  return { recordsByExactHost: mutable }
}

export function observedHostSummaries(
  prepared: PreparedObservedHostIndex,
  exactHost: string,
) {
  return (prepared.recordsByExactHost.get(exactHost) ?? []).map(decodeProgressiveSummary)
}

export function buildObservedSystemBundle(
  manifest: ProgressiveExoplanetManifest,
  exactHost: string,
  summaries: readonly ReturnType<typeof decodeProgressiveSummary>[],
  records: readonly ProgressiveExoplanetRecord[],
): ObservedSystemBundle {
  if (!exactHost) throw new TypeError('Observed system host must be a non-empty exact hostname')
  if (summaries.length === 0) throw new Error(`Unknown NASA host system: ${exactHost}`)

  const recordById = new Map<string, ProgressiveExoplanetRecord>()
  for (const record of records) {
    if (record.host !== exactHost) continue
    if (recordById.has(record.id)) throw new Error(`Duplicate planet in NASA host system: ${record.id}`)
    recordById.set(record.id, record)
  }
  const orderedRecords = summaries.map(({ id, host }) => {
    if (host !== exactHost) throw new Error(`Mismatched host summary for NASA system: ${host}`)
    const record = recordById.get(id)
    if (!record) throw new Error(`Incomplete NASA host system ${exactHost}: missing ${id}`)
    return record
  })
  if (recordById.size !== orderedRecords.length) {
    throw new Error(`NASA host system ${exactHost} contains unexpected detail records`)
  }

  const raDeg = exactNullableHostValue(
    orderedRecords,
    exactHost,
    'right ascension',
    ({ coordinates }) => coordinates.raDeg,
  )
  const decDeg = exactNullableHostValue(
    orderedRecords,
    exactHost,
    'declination',
    ({ coordinates }) => coordinates.decDeg,
  )
  const distancePc = resolveHostMeasurement(orderedRecords, 'distancePc', 'sy_dist')
  const distanceValue = distancePc.status === 'single'
    ? distancePc.selected?.measurement.value ?? null
    : null
  const measurements = Object.fromEntries(
    (Object.keys(STELLAR_SOURCE_FIELDS) as HostStellarMeasurementKey[]).map((key) => [
      key,
      resolveHostMeasurement(orderedRecords, key, STELLAR_SOURCE_FIELDS[key]),
    ]),
  ) as Record<HostStellarMeasurementKey, HostMeasurementResolution>

  return {
    schemaVersion: OBSERVED_SYSTEM_SCHEMA_VERSION,
    id: `nea:host:${encodeURIComponent(exactHost)}`,
    host: exactHost,
    evidence: 'archive-composite',
    astrometry: {
      frame: 'ICRS',
      raDeg,
      decDeg,
      distancePc,
      cartesianPosition: derivedPosition(raDeg, decDeg, distanceValue),
      sourceFields: ['ra', 'dec', 'sy_dist'],
    },
    hostStar: {
      spectralTypes: [...new Set(
        orderedRecords
          .map(({ hostStar }) => hostStar.spectralType)
          .filter((value): value is string => value !== null),
      )],
      measurements,
    },
    planets: orderedRecords.map((record) => ({
      id: record.id,
      name: record.name,
      host: record.host,
      evidence: 'archive-composite',
      record,
      orbit: planetOrbit(manifest, record),
    })),
    provenance: {
      provider: manifest.source.provider,
      table: manifest.source.table,
      product: manifest.source.product,
      catalogRevision: manifest.catalogRevision,
      retrievedAt: manifest.retrievedAt,
      publishedAt: manifest.publishedAt,
      requestUrl: manifest.source.requestUrl,
      query: manifest.source.query,
      documentationUrl: manifest.source.documentationUrl,
      acknowledgementUrl: manifest.source.acknowledgementUrl,
      nullPolicy: manifest.provenance.nullPolicy,
      compositePolicy: manifest.provenance.compositePolicy,
      rightsStatus: manifest.provenance.rightsStatus,
      evidence: 'archive-composite',
    },
  }
}

export async function streamObservedSystem(
  manifest: ProgressiveExoplanetManifest,
  prepared: PreparedObservedHostIndex,
  exactHost: string,
  loadChunk: (chunkId: number) => Promise<ProgressiveDetailChunk>,
  options: ObservedSystemStreamOptions = {},
): Promise<ObservedSystemStreamResult> {
  const summaries = observedHostSummaries(prepared, exactHost)
  if (summaries.length === 0) throw new Error(`Unknown NASA host system: ${exactHost}`)
  const chunkIds = [...new Set(summaries.map(({ chunkId }) => chunkId))].sort((a, b) => a - b)
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 2), chunkIds.length))
  const isCancelled = options.isCancelled ?? (() => false)
  const chunks = new Map<number, ProgressiveDetailChunk>()
  let nextChunk = 0

  const loadNext = async (): Promise<void> => {
    while (true) {
      assertActive(isCancelled)
      const index = nextChunk
      nextChunk += 1
      const chunkId = chunkIds[index]
      if (chunkId === undefined) return
      const chunk = await loadChunk(chunkId)
      assertActive(isCancelled)
      chunks.set(chunkId, chunk)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => loadNext()))
  assertActive(isCancelled)

  const expectedIds = new Set(summaries.map(({ id }) => id))
  const records = chunkIds.flatMap((chunkId) =>
    (chunks.get(chunkId)?.records ?? []).filter(
      ({ id, host }) => host === exactHost && expectedIds.has(id),
    ),
  )
  return {
    system: buildObservedSystemBundle(manifest, exactHost, summaries, records),
    chunkIds,
  }
}
