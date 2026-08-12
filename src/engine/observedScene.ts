import type { ProgressiveHostSkyIndex, ProgressiveHostSkyTuple } from '../data/progressiveExoplanetCatalog'
import type {
  ObservedPlanetBundle,
  ObservedRenderAssumption,
  ObservedSystemBundle,
} from '../data/progressiveObservedSystem'

export const OBSERVED_HOST_ID_PREFIX = 'observed-host:' as const
export const OBSERVED_STAR_ID_PREFIX = 'observed-star:' as const
export const OBSERVED_PLANET_ID_PREFIX = 'observed-planet:' as const

export const HOST_SKY_TUPLE = Object.freeze({
  host: 0,
  raDeg: 1,
  decDeg: 2,
  distancePc: 3,
  gaiaMagnitude: 4,
  spectralType: 5,
  planetCount: 6,
  starCount: 7,
  gaiaDr3: 8,
  conflictFields: 9,
  representativePlanet: 10,
} as const)

export interface CartesianPoint {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface ObservedHostPoint {
  readonly id: string
  readonly host: string
  readonly position: CartesianPoint
  readonly displayDistance: number
  readonly distancePc: number | null
  readonly raDeg: number
  readonly decDeg: number
  readonly skyOnly: boolean
  readonly gaiaMagnitude: number | null
  readonly spectralType: string | null
  readonly planetCount: number
  readonly starCount: number | null
  readonly gaiaDr3: string | null
}

export interface ObservedPlanetRenderModel {
  readonly id: string
  readonly sourceId: string
  readonly name: string
  readonly radius: number
  readonly orbitRadius: number
  readonly eccentricity: number
  readonly inclinationRadians: number
  readonly ascendingNodeRadians: number
  readonly periapsisRadians: number
  readonly phaseRadians: number
  readonly periodDays: number | null
  readonly staticOrbit: boolean
  readonly radiusEarth: number | null
  readonly assumptions: readonly ObservedRenderAssumption[]
}

export interface ObservedSystemRenderModel {
  readonly id: string
  readonly host: string
  readonly starId: string
  readonly starRadius: number
  readonly starTemperatureKelvin: number | null
  readonly planets: readonly ObservedPlanetRenderModel[]
}

export const UNKNOWN_DISTANCE_SHELL_RADIUS = 940
const OBSERVED_DISTANCE_MIN_RADIUS = 72
const OBSERVED_DISTANCE_LOG_SCALE = 162
const EARTH_RADIUS_MIN = 0.34
const EARTH_RADIUS_MAX = 1.72

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`)
}

/** ICRS direction in a right-handed render frame: +Y is celestial north. */
export function icrsDirection(raDeg: number, decDeg: number): CartesianPoint {
  assertFinite(raDeg, 'Right ascension')
  assertFinite(decDeg, 'Declination')
  if (raDeg < 0 || raDeg >= 360) throw new RangeError('Right ascension is out of range')
  if (decDeg < -90 || decDeg > 90) throw new RangeError('Declination is out of range')
  const ra = raDeg * Math.PI / 180
  const dec = decDeg * Math.PI / 180
  const planar = Math.cos(dec)
  return {
    x: planar * Math.cos(ra),
    y: Math.sin(dec),
    z: planar * Math.sin(ra),
  }
}

/** Monotonic visual transform; physical parsecs remain in the selection payload. */
export function observedDistanceToDisplayRadius(distancePc: number): number {
  if (!Number.isFinite(distancePc) || distancePc <= 0) {
    throw new RangeError('Observed distance must be positive and finite')
  }
  return OBSERVED_DISTANCE_MIN_RADIUS + Math.log1p(distancePc) * OBSERVED_DISTANCE_LOG_SCALE
}

export function observedHostId(host: string): string {
  if (host.length === 0) throw new TypeError('Observed hostname must not be empty')
  return `${OBSERVED_HOST_ID_PREFIX}${encodeURIComponent(host)}`
}

export function observedStarId(systemId: string): string {
  if (systemId.length === 0) throw new TypeError('Observed system id must not be empty')
  return `${OBSERVED_STAR_ID_PREFIX}${encodeURIComponent(systemId)}`
}

export function observedPlanetId(sourceId: string): string {
  if (sourceId.length === 0) throw new TypeError('Observed planet id must not be empty')
  return `${OBSERVED_PLANET_ID_PREFIX}${encodeURIComponent(sourceId)}`
}

export function buildObservedHostPoints(index: ProgressiveHostSkyIndex): readonly ObservedHostPoint[] {
  return index.records.map((tuple) => observedHostPoint(tuple))
}

function observedHostPoint(tuple: ProgressiveHostSkyTuple): ObservedHostPoint {
  const host = tuple[HOST_SKY_TUPLE.host]
  const raDeg = tuple[HOST_SKY_TUPLE.raDeg]
  const decDeg = tuple[HOST_SKY_TUPLE.decDeg]
  if (raDeg === null || decDeg === null) {
    throw new TypeError(`Observed host ${host} is missing its ICRS direction`)
  }
  const direction = icrsDirection(raDeg, decDeg)
  const distancePc = tuple[HOST_SKY_TUPLE.distancePc]
  const skyOnly = distancePc === null
  const displayDistance = skyOnly
    ? UNKNOWN_DISTANCE_SHELL_RADIUS
    : observedDistanceToDisplayRadius(distancePc)
  return {
    id: observedHostId(host),
    host,
    position: {
      x: direction.x * displayDistance,
      y: direction.y * displayDistance,
      z: direction.z * displayDistance,
    },
    displayDistance,
    distancePc,
    raDeg,
    decDeg,
    skyOnly,
    gaiaMagnitude: tuple[HOST_SKY_TUPLE.gaiaMagnitude],
    spectralType: tuple[HOST_SKY_TUPLE.spectralType],
    planetCount: tuple[HOST_SKY_TUPLE.planetCount],
    starCount: tuple[HOST_SKY_TUPLE.starCount],
    gaiaDr3: tuple[HOST_SKY_TUPLE.gaiaDr3],
  }
}

function measurementValue(planet: ObservedPlanetBundle, key: string): number | null {
  return planet.record.measurements[key]?.value ?? null
}

function assumptionValue(
  planet: ObservedPlanetBundle,
  field: ObservedRenderAssumption['field'],
  fallback: number,
): number {
  return planet.orbit.renderAssumptions.find((assumption) => assumption.field === field)?.value ?? fallback
}

export function observedPlanetVisualRadius(radiusEarth: number | null): number {
  if (radiusEarth === null || !Number.isFinite(radiusEarth) || radiusEarth <= 0) return 0.72
  return Math.min(
    EARTH_RADIUS_MAX,
    Math.max(EARTH_RADIUS_MIN, 0.58 * radiusEarth ** 0.38),
  )
}

export function observedOrbitVisualRadius(semiMajorAxisAu: number | null, index: number): number {
  if (!Number.isInteger(index) || index < 0) throw new RangeError('Planet index must be non-negative')
  if (semiMajorAxisAu === null || !Number.isFinite(semiMajorAxisAu) || semiMajorAxisAu <= 0) {
    return 12 + index * 7
  }
  return 9 + Math.log1p(semiMajorAxisAu * 4) * 15 + index * 1.8
}

function degreesToRadians(value: number): number {
  return value * Math.PI / 180
}

export function buildObservedSystemRenderModel(
  bundle: ObservedSystemBundle,
): ObservedSystemRenderModel {
  const stellarRadius = bundle.hostStar.measurements.stellarRadiusSolar.selected?.measurement.value ?? null
  const stellarTemperature = bundle.hostStar.measurements.stellarTeffK.selected?.measurement.value ?? null
  return {
    id: bundle.id,
    host: bundle.host,
    starId: observedStarId(bundle.id),
    starRadius: stellarRadius === null
      ? 3.1
      : Math.min(5.2, Math.max(2.2, 3.1 * stellarRadius ** 0.32)),
    starTemperatureKelvin: stellarTemperature,
    planets: bundle.planets.map((planet, index) => {
      const semiMajorAxisAu = planet.orbit.semiMajorAxisAu.value
      const periodDays = planet.orbit.orbitalPeriodDays.value
      const eccentricity = planet.orbit.eccentricity.value ?? assumptionValue(planet, 'eccentricity', 0)
      const inclination = planet.orbit.inclinationDeg.value ?? assumptionValue(planet, 'inclinationDeg', 0)
      return {
        id: observedPlanetId(planet.id),
        sourceId: planet.id,
        name: planet.name,
        radius: observedPlanetVisualRadius(measurementValue(planet, 'radiusEarth')),
        orbitRadius: observedOrbitVisualRadius(semiMajorAxisAu, index),
        eccentricity: Math.min(0.94, Math.max(0, eccentricity)),
        inclinationRadians: degreesToRadians(inclination),
        ascendingNodeRadians: degreesToRadians(
          assumptionValue(planet, 'longitudeAscendingNodeDeg', 0),
        ),
        periapsisRadians: degreesToRadians(assumptionValue(planet, 'argumentPeriapsisDeg', 0)),
        phaseRadians: degreesToRadians(assumptionValue(planet, 'meanAnomalyAtEpochDeg', 0)),
        periodDays: periodDays !== null && Number.isFinite(periodDays) && periodDays > 0
          ? periodDays
          : null,
        staticOrbit: periodDays === null || !Number.isFinite(periodDays) || periodDays <= 0,
        radiusEarth: measurementValue(planet, 'radiusEarth'),
        assumptions: planet.orbit.renderAssumptions,
      }
    }),
  }
}
