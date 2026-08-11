import {
  ASTRONOMICAL_UNIT_METERS,
  GRAVITATIONAL_CONSTANT,
  IAU_NOMINAL_SOLAR_LUMINOSITY_WATTS,
  STEFAN_BOLTZMANN_CONSTANT,
} from './constants'
import { findBodyById } from './system'
import type {
  CelestialBody,
  KeplerOrbit,
  Moon,
  Planet,
  PlanetClass,
  StarSystem,
} from './types'

/** Approximate Solar-equivalent conservative HZ flux boundaries. */
export const CONSERVATIVE_HZ_INNER_FLUX_SOLAR = 1.107
export const CONSERVATIVE_HZ_OUTER_FLUX_SOLAR = 0.356

export type TemperatureBand =
  | 'cryogenic'
  | 'frozen'
  | 'temperate'
  | 'warm'
  | 'hot'
  | 'ultrahot'

export type ConservativeHabitabilityLabel =
  | 'not-applicable'
  | 'insufficient-data'
  | 'non-surface-world'
  | 'outside-conservative-habitable-zone'
  | 'within-conservative-habitable-zone'
  | 'temperate-surface-candidate'

export interface ConservativeHabitableZone {
  readonly innerBoundaryMeters: number
  readonly outerBoundaryMeters: number
  readonly innerFluxSolar: number
  readonly outerFluxSolar: number
}

export interface DerivedOrbitPhysics {
  readonly periapsisMeters: number
  readonly apoapsisMeters: number
  readonly meanOrbitalSpeedMetersPerSecond: number
}

export interface DerivedStellarEnvironment {
  readonly stellarDistanceMeters: number
  readonly fluxWattsPerSquareMeter: number
  readonly fluxSolar: number
  readonly equilibriumTemperatureKelvin: number
  readonly conservativeHabitableZone: ConservativeHabitableZone
  readonly withinConservativeHabitableZone: boolean
  readonly temperatureBand: TemperatureBand
}

export interface DerivedBodyPhysics {
  readonly bodyId: string
  readonly kind: CelestialBody['kind']
  readonly meanDensityKgPerCubicMeter: number
  readonly surfaceGravityMetersPerSecondSquared: number
  readonly escapeVelocityMetersPerSecond: number
  readonly orbit?: DerivedOrbitPhysics
  readonly stellarEnvironment?: DerivedStellarEnvironment
  readonly habitabilityLabel: ConservativeHabitabilityLabel
}

function requirePositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number`)
  }
}

export function meanDensityKgPerCubicMeter(
  massKilograms: number,
  radiusMeters: number,
): number {
  requirePositiveFinite(massKilograms, 'Mass')
  requirePositiveFinite(radiusMeters, 'Radius')
  return massKilograms / ((4 / 3) * Math.PI * radiusMeters ** 3)
}

export function surfaceGravityMetersPerSecondSquared(
  massKilograms: number,
  radiusMeters: number,
): number {
  requirePositiveFinite(massKilograms, 'Mass')
  requirePositiveFinite(radiusMeters, 'Radius')
  return (GRAVITATIONAL_CONSTANT * massKilograms) / radiusMeters ** 2
}

export function escapeVelocityMetersPerSecond(
  massKilograms: number,
  radiusMeters: number,
): number {
  return Math.sqrt(2 * surfaceGravityMetersPerSecondSquared(massKilograms, radiusMeters) * radiusMeters)
}

export function periapsisMeters(orbit: KeplerOrbit): number {
  return orbit.semiMajorAxisMeters * (1 - orbit.eccentricity)
}

export function apoapsisMeters(orbit: KeplerOrbit): number {
  return orbit.semiMajorAxisMeters * (1 + orbit.eccentricity)
}

/** Time-averaged speed: Ramanujan ellipse circumference divided by orbital period. */
export function meanOrbitalSpeedMetersPerSecond(orbit: KeplerOrbit): number {
  requirePositiveFinite(orbit.semiMajorAxisMeters, 'Semi-major axis')
  requirePositiveFinite(orbit.periodSeconds, 'Orbital period')
  if (
    !Number.isFinite(orbit.eccentricity) ||
    orbit.eccentricity < 0 ||
    orbit.eccentricity >= 1
  ) {
    throw new RangeError('Elliptic eccentricity must satisfy 0 <= e < 1')
  }

  const semiMajor = orbit.semiMajorAxisMeters
  const semiMinor = semiMajor * Math.sqrt(1 - orbit.eccentricity ** 2)
  const h = ((semiMajor - semiMinor) / (semiMajor + semiMinor)) ** 2
  const circumference =
    Math.PI *
    (semiMajor + semiMinor) *
    (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
  return circumference / orbit.periodSeconds
}

export function stellarFluxWattsPerSquareMeter(
  luminosityWatts: number,
  distanceMeters: number,
): number {
  requirePositiveFinite(luminosityWatts, 'Luminosity')
  requirePositiveFinite(distanceMeters, 'Distance')
  return luminosityWatts / (4 * Math.PI * distanceMeters ** 2)
}

/** Uniformly redistributed black-body equilibrium temperature. */
export function equilibriumTemperatureKelvin(
  fluxWattsPerSquareMeter: number,
  bondAlbedo: number,
  emissivity = 1,
): number {
  requirePositiveFinite(fluxWattsPerSquareMeter, 'Stellar flux')
  if (!Number.isFinite(bondAlbedo) || bondAlbedo < 0 || bondAlbedo > 1) {
    throw new RangeError('Bond albedo must satisfy 0 <= A <= 1')
  }
  if (!Number.isFinite(emissivity) || emissivity <= 0 || emissivity > 1) {
    throw new RangeError('Emissivity must satisfy 0 < emissivity <= 1')
  }
  return (
    (fluxWattsPerSquareMeter * (1 - bondAlbedo)) /
    (4 * STEFAN_BOLTZMANN_CONSTANT * emissivity)
  ) ** 0.25
}

export function synodicPeriodSeconds(
  firstOrbitalPeriodSeconds: number,
  secondOrbitalPeriodSeconds: number,
): number {
  requirePositiveFinite(firstOrbitalPeriodSeconds, 'First orbital period')
  requirePositiveFinite(secondOrbitalPeriodSeconds, 'Second orbital period')
  const frequencyDifference = Math.abs(
    1 / firstOrbitalPeriodSeconds - 1 / secondOrbitalPeriodSeconds,
  )
  return frequencyDifference === 0 ? Number.POSITIVE_INFINITY : 1 / frequencyDifference
}

export function conservativeHabitableZoneMeters(
  luminositySolar: number,
): ConservativeHabitableZone {
  requirePositiveFinite(luminositySolar, 'Solar-relative luminosity')
  return {
    innerBoundaryMeters:
      Math.sqrt(luminositySolar / CONSERVATIVE_HZ_INNER_FLUX_SOLAR) *
      ASTRONOMICAL_UNIT_METERS,
    outerBoundaryMeters:
      Math.sqrt(luminositySolar / CONSERVATIVE_HZ_OUTER_FLUX_SOLAR) *
      ASTRONOMICAL_UNIT_METERS,
    innerFluxSolar: CONSERVATIVE_HZ_INNER_FLUX_SOLAR,
    outerFluxSolar: CONSERVATIVE_HZ_OUTER_FLUX_SOLAR,
  }
}

export function classifyTemperatureBand(temperatureKelvin: number): TemperatureBand {
  requirePositiveFinite(temperatureKelvin, 'Temperature')
  if (temperatureKelvin < 100) return 'cryogenic'
  if (temperatureKelvin < 240) return 'frozen'
  if (temperatureKelvin <= 320) return 'temperate'
  if (temperatureKelvin <= 400) return 'warm'
  if (temperatureKelvin <= 700) return 'hot'
  return 'ultrahot'
}

interface HabitabilityInput {
  readonly kind: CelestialBody['kind']
  readonly planetClass?: PlanetClass
  readonly withinConservativeHabitableZone?: boolean
  readonly temperatureBand?: TemperatureBand
  readonly surfacePressurePascals?: number
}

export function classifyConservativeHabitability({
  kind,
  planetClass,
  withinConservativeHabitableZone,
  temperatureBand,
  surfacePressurePascals,
}: HabitabilityInput): ConservativeHabitabilityLabel {
  if (kind === 'star') return 'not-applicable'
  if (
    planetClass === 'gas-giant' ||
    planetClass === 'ice-giant' ||
    planetClass === 'neptunian'
  ) {
    return 'non-surface-world'
  }
  if (withinConservativeHabitableZone === undefined || !temperatureBand) {
    return 'insufficient-data'
  }
  if (!withinConservativeHabitableZone) {
    return 'outside-conservative-habitable-zone'
  }
  if (
    temperatureBand === 'temperate' &&
    surfacePressurePascals !== undefined &&
    surfacePressurePascals >= 1_000
  ) {
    return 'temperate-surface-candidate'
  }
  return 'within-conservative-habitable-zone'
}

function parentPlanetForMoon(system: StarSystem, moon: Moon): Planet | undefined {
  return system.planets.find((planet) => planet.id === moon.parentId)
}

function orbitAroundStar(system: StarSystem, body: Planet | Moon): KeplerOrbit | undefined {
  if (body.kind === 'planet') return body.orbit
  return parentPlanetForMoon(system, body)?.orbit
}

export function deriveBodyPhysics(
  system: StarSystem,
  bodyId: string,
): DerivedBodyPhysics | undefined {
  const body = findBodyById(system, bodyId)
  if (!body) return undefined

  const base = {
    bodyId: body.id,
    kind: body.kind,
    meanDensityKgPerCubicMeter: meanDensityKgPerCubicMeter(
      body.massKilograms,
      body.radiusMeters,
    ),
    surfaceGravityMetersPerSecondSquared: surfaceGravityMetersPerSecondSquared(
      body.massKilograms,
      body.radiusMeters,
    ),
    escapeVelocityMetersPerSecond: escapeVelocityMetersPerSecond(
      body.massKilograms,
      body.radiusMeters,
    ),
  } as const

  if (body.kind === 'star') {
    return { ...base, habitabilityLabel: 'not-applicable' }
  }

  const ownOrbit: DerivedOrbitPhysics = {
    periapsisMeters: periapsisMeters(body.orbit),
    apoapsisMeters: apoapsisMeters(body.orbit),
    meanOrbitalSpeedMetersPerSecond: meanOrbitalSpeedMetersPerSecond(body.orbit),
  }
  const stellarOrbit = orbitAroundStar(system, body)
  if (!stellarOrbit) {
    return { ...base, orbit: ownOrbit, habitabilityLabel: 'insufficient-data' }
  }

  const luminosityWatts =
    system.primaryStar.luminositySolar * IAU_NOMINAL_SOLAR_LUMINOSITY_WATTS
  const stellarDistanceMeters = stellarOrbit.semiMajorAxisMeters
  const fluxWattsPerSquareMeter = stellarFluxWattsPerSquareMeter(
    luminosityWatts,
    stellarDistanceMeters,
  )
  const fluxSolar =
    stellarFluxWattsPerSquareMeter(
      IAU_NOMINAL_SOLAR_LUMINOSITY_WATTS,
      ASTRONOMICAL_UNIT_METERS,
    )
  const equilibriumTemperature = equilibriumTemperatureKelvin(
    fluxWattsPerSquareMeter,
    body.albedo,
  )
  const representativeTemperature =
    body.meanSurfaceTemperatureKelvin ?? equilibriumTemperature
  const temperatureBand = classifyTemperatureBand(representativeTemperature)
  const conservativeHabitableZone = conservativeHabitableZoneMeters(
    system.primaryStar.luminositySolar,
  )
  const withinConservativeHabitableZone =
    stellarDistanceMeters >= conservativeHabitableZone.innerBoundaryMeters &&
    stellarDistanceMeters <= conservativeHabitableZone.outerBoundaryMeters
  const habitabilityLabel = classifyConservativeHabitability({
    kind: body.kind,
    planetClass: body.kind === 'planet' ? body.planetClass : undefined,
    withinConservativeHabitableZone,
    temperatureBand,
    surfacePressurePascals: body.atmosphere?.surfacePressurePascals,
  })

  return {
    ...base,
    orbit: ownOrbit,
    stellarEnvironment: {
      stellarDistanceMeters,
      fluxWattsPerSquareMeter,
      fluxSolar: fluxWattsPerSquareMeter / fluxSolar,
      equilibriumTemperatureKelvin: equilibriumTemperature,
      conservativeHabitableZone,
      withinConservativeHabitableZone,
      temperatureBand,
    },
    habitabilityLabel,
  }
}

export function deriveSystemPhysics(system: StarSystem): DerivedBodyPhysics[] {
  const bodyIds = [
    system.primaryStar.id,
    ...system.planets.flatMap((planet) => [
      planet.id,
      ...planet.moons.map((moon) => moon.id),
    ]),
  ]
  return bodyIds.flatMap((bodyId) => {
    const derived = deriveBodyPhysics(system, bodyId)
    return derived ? [derived] : []
  })
}
