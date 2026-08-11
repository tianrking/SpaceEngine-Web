import type { Seed } from './rng'

/** Cartesian coordinates in SI metres unless a field explicitly says otherwise. */
export interface Vector3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface KeplerOrbit {
  /** Semi-major axis in metres. */
  readonly semiMajorAxisMeters: number
  /** Elliptic orbit eccentricity: 0 <= e < 1. */
  readonly eccentricity: number
  readonly inclinationRadians: number
  readonly longitudeOfAscendingNodeRadians: number
  readonly argumentOfPeriapsisRadians: number
  readonly meanAnomalyAtEpochRadians: number
  /** Absolute simulation time associated with the mean anomaly. */
  readonly epochSeconds: number
  readonly periodSeconds: number
}

export interface OrbitalState {
  readonly positionMeters: Vector3
  readonly velocityMetersPerSecond: Vector3
  readonly radiusMeters: number
  readonly eccentricAnomalyRadians: number
  readonly trueAnomalyRadians: number
}

export type CelestialBodyKind = 'star' | 'planet' | 'moon'

export type PlanetClass =
  | 'lava'
  | 'terrestrial'
  | 'ocean'
  | 'gas-giant'
  | 'ice-giant'
  | 'dwarf'

export type MoonClass = 'rocky' | 'icy' | 'oceanic' | 'volcanic'

export interface Atmosphere {
  readonly surfacePressurePascals: number
  readonly scaleHeightMeters: number
  /** Normalized volume fractions; trace constituents may be omitted. */
  readonly composition: Readonly<Record<string, number>>
  readonly rayleighColor: string
  readonly mieCoefficient: number
}

export interface RingSystem {
  readonly innerRadiusMeters: number
  readonly outerRadiusMeters: number
  readonly thicknessMeters: number
  readonly inclinationRadians: number
  readonly color: string
  readonly opacity: number
  readonly proceduralSeed: Seed
}

export interface SurfaceProfile {
  readonly baseColor: string
  readonly detailColor: string
  readonly roughness: number
  readonly elevationScaleMeters: number
  readonly noiseOctaves: number
  readonly proceduralSeed: Seed
}

interface CelestialBodyBase {
  readonly id: string
  readonly name: string
  readonly kind: CelestialBodyKind
  readonly radiusMeters: number
  readonly massKilograms: number
  /** Sidereal rotation period. A negative value denotes retrograde rotation. */
  readonly rotationPeriodSeconds: number
  readonly axialTiltRadians: number
  readonly albedo: number
  readonly color: string
  readonly description: string
}

export interface Star extends CelestialBodyBase {
  readonly kind: 'star'
  readonly spectralType: string
  readonly luminositySolar: number
  readonly temperatureKelvin: number
  readonly coronaColor: string
}

interface OrbitingBodyBase extends CelestialBodyBase {
  readonly parentId: string
  readonly orbit: KeplerOrbit
  readonly surface: SurfaceProfile
  readonly atmosphere?: Atmosphere
}

export interface Moon extends OrbitingBodyBase {
  readonly kind: 'moon'
  readonly moonClass: MoonClass
}

export interface Planet extends OrbitingBodyBase {
  readonly kind: 'planet'
  readonly planetClass: PlanetClass
  readonly rings?: RingSystem
  readonly moons: readonly Moon[]
}

export type OrbitingBody = Planet | Moon
export type CelestialBody = Star | Planet | Moon

export interface StarSystem {
  readonly id: string
  readonly name: string
  readonly seed: Seed
  readonly epochSeconds: number
  readonly primaryStar: Star
  readonly planets: readonly Planet[]
}
