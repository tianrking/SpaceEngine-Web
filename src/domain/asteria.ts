import {
  ASTRONOMICAL_UNIT_METERS,
  EARTH_MASS_KILOGRAMS,
  EARTH_RADIUS_METERS,
  JUPITER_MASS_KILOGRAMS,
  JUPITER_RADIUS_METERS,
  JULIAN_DAY_SECONDS,
  SOLAR_MASS_KILOGRAMS,
  SOLAR_RADIUS_METERS,
  TAU,
} from './constants'
import { orbitalPeriodSeconds } from './orbit'
import { createSeededRng, type Seed, type SeededRng } from './rng'
import type {
  Atmosphere,
  KeplerOrbit,
  Moon,
  MoonClass,
  Planet,
  PlanetClass,
  RingSystem,
  StarSystem,
  SurfaceProfile,
} from './types'

const degrees = (value: number): number => (value * Math.PI) / 180

interface SurfaceSpec {
  readonly baseColor: string
  readonly detailColor: string
  readonly roughness: number
  readonly elevationScaleMeters: number
  readonly noiseOctaves?: number
}

interface MoonSpec {
  readonly id: string
  readonly name: string
  readonly moonClass: MoonClass
  readonly radiusMeters: number
  readonly massKilograms: number
  readonly semiMajorAxisMeters: number
  readonly eccentricity: number
  readonly inclinationDegrees: number
  readonly rotationPeriodDays: number
  readonly color: string
  readonly albedo: number
  readonly description: string
  readonly surface: SurfaceSpec
  readonly atmosphere?: Atmosphere
}

interface RingSpec {
  readonly innerRadiusFactor: number
  readonly outerRadiusFactor: number
  readonly thicknessMeters: number
  readonly inclinationDegrees: number
  readonly color: string
  readonly opacity: number
}

interface PlanetSpec {
  readonly id: string
  readonly name: string
  readonly planetClass: PlanetClass
  readonly radiusMeters: number
  readonly massKilograms: number
  readonly semiMajorAxisAu: number
  readonly eccentricity: number
  readonly inclinationDegrees: number
  readonly rotationPeriodHours: number
  readonly axialTiltDegrees: number
  readonly color: string
  readonly albedo: number
  readonly description: string
  readonly surface: SurfaceSpec
  readonly atmosphere?: Atmosphere
  readonly rings?: RingSpec
  readonly moons?: readonly MoonSpec[]
}

function makeSurface(
  rng: SeededRng,
  bodyId: string,
  spec: SurfaceSpec,
): SurfaceProfile {
  return {
    ...spec,
    noiseOctaves: spec.noiseOctaves ?? 6,
    proceduralSeed: rng.fork(`${bodyId}:surface`).seed,
  }
}

function makeOrbit(
  rng: SeededRng,
  label: string,
  semiMajorAxisMeters: number,
  eccentricity: number,
  inclinationRadians: number,
  primaryMassKilograms: number,
  orbitingMassKilograms: number,
  epochSeconds: number,
): KeplerOrbit {
  const orbitRng = rng.fork(`${label}:orbit`)
  return {
    semiMajorAxisMeters,
    eccentricity,
    inclinationRadians,
    longitudeOfAscendingNodeRadians: orbitRng.range(0, TAU),
    argumentOfPeriapsisRadians: orbitRng.range(0, TAU),
    meanAnomalyAtEpochRadians: orbitRng.range(0, TAU),
    epochSeconds,
    periodSeconds: orbitalPeriodSeconds(
      semiMajorAxisMeters,
      primaryMassKilograms,
      orbitingMassKilograms,
    ),
  }
}

function makeMoon(
  rng: SeededRng,
  spec: MoonSpec,
  parentId: string,
  parentMassKilograms: number,
  epochSeconds: number,
): Moon {
  return {
    id: spec.id,
    name: spec.name,
    kind: 'moon',
    moonClass: spec.moonClass,
    parentId,
    radiusMeters: spec.radiusMeters,
    massKilograms: spec.massKilograms,
    rotationPeriodSeconds: spec.rotationPeriodDays * JULIAN_DAY_SECONDS,
    axialTiltRadians: 0,
    albedo: spec.albedo,
    color: spec.color,
    description: spec.description,
    surface: makeSurface(rng, spec.id, spec.surface),
    atmosphere: spec.atmosphere,
    orbit: makeOrbit(
      rng,
      spec.id,
      spec.semiMajorAxisMeters,
      spec.eccentricity,
      degrees(spec.inclinationDegrees),
      parentMassKilograms,
      spec.massKilograms,
      epochSeconds,
    ),
  }
}

function makePlanet(
  rng: SeededRng,
  spec: PlanetSpec,
  starMassKilograms: number,
  epochSeconds: number,
): Planet {
  const moons = (spec.moons ?? []).map((moon) =>
    makeMoon(rng, moon, spec.id, spec.massKilograms, epochSeconds),
  )
  const rings: RingSystem | undefined = spec.rings
    ? {
        innerRadiusMeters: spec.radiusMeters * spec.rings.innerRadiusFactor,
        outerRadiusMeters: spec.radiusMeters * spec.rings.outerRadiusFactor,
        thicknessMeters: spec.rings.thicknessMeters,
        inclinationRadians: degrees(spec.rings.inclinationDegrees),
        color: spec.rings.color,
        opacity: spec.rings.opacity,
        proceduralSeed: rng.fork(`${spec.id}:rings`).seed,
      }
    : undefined

  return {
    id: spec.id,
    name: spec.name,
    kind: 'planet',
    planetClass: spec.planetClass,
    parentId: 'asteria',
    radiusMeters: spec.radiusMeters,
    massKilograms: spec.massKilograms,
    rotationPeriodSeconds: spec.rotationPeriodHours * 3_600,
    axialTiltRadians: degrees(spec.axialTiltDegrees),
    albedo: spec.albedo,
    color: spec.color,
    description: spec.description,
    surface: makeSurface(rng, spec.id, spec.surface),
    atmosphere: spec.atmosphere,
    rings,
    moons,
    orbit: makeOrbit(
      rng,
      spec.id,
      spec.semiMajorAxisAu * ASTRONOMICAL_UNIT_METERS,
      spec.eccentricity,
      degrees(spec.inclinationDegrees),
      starMassKilograms,
      spec.massKilograms,
      epochSeconds,
    ),
  }
}

const thinCarbonAtmosphere: Atmosphere = {
  surfacePressurePascals: 680,
  scaleHeightMeters: 10_800,
  composition: { CO2: 0.96, N2: 0.027, Ar: 0.013 },
  rayleighColor: '#c97c58',
  mieCoefficient: 0.006,
}

const aureliaAtmosphere: Atmosphere = {
  surfacePressurePascals: 84_000,
  scaleHeightMeters: 7_900,
  composition: { N2: 0.77, O2: 0.21, Ar: 0.012, CO2: 0.008 },
  rayleighColor: '#74a9e8',
  mieCoefficient: 0.0032,
}

const pelagosAtmosphere: Atmosphere = {
  surfacePressurePascals: 132_000,
  scaleHeightMeters: 9_600,
  composition: { N2: 0.72, O2: 0.24, H2O: 0.025, Ar: 0.015 },
  rayleighColor: '#6ab8ff',
  mieCoefficient: 0.0045,
}

const planetSpecs: readonly PlanetSpec[] = [
  {
    id: 'cinder',
    name: 'Cinder',
    planetClass: 'lava',
    radiusMeters: EARTH_RADIUS_METERS * 0.48,
    massKilograms: EARTH_MASS_KILOGRAMS * 0.19,
    semiMajorAxisAu: 0.31,
    eccentricity: 0.11,
    inclinationDegrees: 3.4,
    rotationPeriodHours: 42.3,
    axialTiltDegrees: 2.1,
    color: '#b94a2d',
    albedo: 0.12,
    description: 'A tidally heated iron-rich world crossed by incandescent lava basins.',
    surface: {
      baseColor: '#552217',
      detailColor: '#ff7a28',
      roughness: 0.86,
      elevationScaleMeters: 8_500,
      noiseOctaves: 7,
    },
    atmosphere: thinCarbonAtmosphere,
  },
  {
    id: 'aurelia',
    name: 'Aurelia',
    planetClass: 'terrestrial',
    radiusMeters: EARTH_RADIUS_METERS * 0.94,
    massKilograms: EARTH_MASS_KILOGRAMS * 0.84,
    semiMajorAxisAu: 0.73,
    eccentricity: 0.026,
    inclinationDegrees: 1.2,
    rotationPeriodHours: 26.1,
    axialTiltDegrees: 18.7,
    color: '#c9a667',
    albedo: 0.31,
    description: 'A warm continental planet with broad salt deserts and seasonal cloud decks.',
    surface: {
      baseColor: '#b78c50',
      detailColor: '#6f7441',
      roughness: 0.78,
      elevationScaleMeters: 10_200,
    },
    atmosphere: aureliaAtmosphere,
  },
  {
    id: 'pelagos',
    name: 'Pelagos',
    planetClass: 'ocean',
    radiusMeters: EARTH_RADIUS_METERS * 1.16,
    massKilograms: EARTH_MASS_KILOGRAMS * 1.34,
    semiMajorAxisAu: 1.09,
    eccentricity: 0.018,
    inclinationDegrees: 0.6,
    rotationPeriodHours: 19.8,
    axialTiltDegrees: 24.2,
    color: '#257cb6',
    albedo: 0.38,
    description: 'A temperate ocean world whose island arcs trace active plate boundaries.',
    surface: {
      baseColor: '#155b88',
      detailColor: '#4aa59c',
      roughness: 0.42,
      elevationScaleMeters: 7_200,
    },
    atmosphere: pelagosAtmosphere,
    moons: [
      {
        id: 'pelagos-neris',
        name: 'Neris',
        moonClass: 'oceanic',
        radiusMeters: 1_940_000,
        massKilograms: 1.9e22,
        semiMajorAxisMeters: 412_000_000,
        eccentricity: 0.021,
        inclinationDegrees: 4.1,
        rotationPeriodDays: 15.7,
        color: '#a9c7ce',
        albedo: 0.56,
        description: 'An ice-shelled moon with a global subsurface ocean.',
        surface: {
          baseColor: '#8cabb4',
          detailColor: '#e4f3f5',
          roughness: 0.62,
          elevationScaleMeters: 1_100,
        },
      },
    ],
  },
  {
    id: 'brontes',
    name: 'Brontes',
    planetClass: 'gas-giant',
    radiusMeters: JUPITER_RADIUS_METERS * 0.98,
    massKilograms: JUPITER_MASS_KILOGRAMS * 0.76,
    semiMajorAxisAu: 4.72,
    eccentricity: 0.047,
    inclinationDegrees: 1.5,
    rotationPeriodHours: 9.4,
    axialTiltDegrees: 4.8,
    color: '#d09a68',
    albedo: 0.49,
    description: 'A banded gas giant with a long-lived polar storm and a dusty ring complex.',
    surface: {
      baseColor: '#c88755',
      detailColor: '#f0c493',
      roughness: 0.2,
      elevationScaleMeters: 0,
      noiseOctaves: 8,
    },
    atmosphere: {
      surfacePressurePascals: 10_000_000,
      scaleHeightMeters: 27_000,
      composition: { H2: 0.88, He: 0.11, CH4: 0.01 },
      rayleighColor: '#e6b37d',
      mieCoefficient: 0.018,
    },
    rings: {
      innerRadiusFactor: 1.34,
      outerRadiusFactor: 2.62,
      thicknessMeters: 1_200,
      inclinationDegrees: 0.3,
      color: '#b99a78',
      opacity: 0.58,
    },
    moons: [
      {
        id: 'brontes-ember',
        name: 'Ember',
        moonClass: 'volcanic',
        radiusMeters: 1_680_000,
        massKilograms: 7.8e22,
        semiMajorAxisMeters: 226_000_000,
        eccentricity: 0.009,
        inclinationDegrees: 0.3,
        rotationPeriodDays: 1.74,
        color: '#d79b44',
        albedo: 0.61,
        description: 'A resonantly heated volcanic moon resurfaced by sulfurous flows.',
        surface: {
          baseColor: '#c17a2d',
          detailColor: '#f1d061',
          roughness: 0.7,
          elevationScaleMeters: 5_400,
        },
      },
      {
        id: 'brontes-ione',
        name: 'Ione',
        moonClass: 'icy',
        radiusMeters: 2_340_000,
        massKilograms: 1.2e23,
        semiMajorAxisMeters: 467_000_000,
        eccentricity: 0.004,
        inclinationDegrees: 0.7,
        rotationPeriodDays: 4.92,
        color: '#dce5e9',
        albedo: 0.72,
        description: 'A bright, cratered ice moon cut by young tectonic scarps.',
        surface: {
          baseColor: '#cbd8de',
          detailColor: '#edf5f6',
          roughness: 0.66,
          elevationScaleMeters: 3_200,
        },
      },
      {
        id: 'brontes-orison',
        name: 'Orison',
        moonClass: 'rocky',
        radiusMeters: 2_720_000,
        massKilograms: 1.56e23,
        semiMajorAxisMeters: 912_000_000,
        eccentricity: 0.016,
        inclinationDegrees: 1.1,
        rotationPeriodDays: 13.4,
        color: '#9c8f83',
        albedo: 0.24,
        description: 'The outer major moon of Brontes, marked by a giant ancient impact basin.',
        surface: {
          baseColor: '#82766d',
          detailColor: '#b8aa9d',
          roughness: 0.9,
          elevationScaleMeters: 11_000,
        },
      },
    ],
  },
  {
    id: 'caelora',
    name: 'Caelora',
    planetClass: 'ice-giant',
    radiusMeters: 25_240_000,
    massKilograms: 1.09e26,
    semiMajorAxisAu: 9.38,
    eccentricity: 0.033,
    inclinationDegrees: 2.2,
    rotationPeriodHours: -16.8,
    axialTiltDegrees: 76.4,
    color: '#70b9c6',
    albedo: 0.51,
    description: 'A cyan ice giant rotating nearly on its side beneath a methane-rich haze.',
    surface: {
      baseColor: '#4c9faf',
      detailColor: '#91d2d8',
      roughness: 0.24,
      elevationScaleMeters: 0,
    },
    atmosphere: {
      surfacePressurePascals: 8_000_000,
      scaleHeightMeters: 21_500,
      composition: { H2: 0.79, He: 0.18, CH4: 0.03 },
      rayleighColor: '#72c8da',
      mieCoefficient: 0.012,
    },
    rings: {
      innerRadiusFactor: 1.55,
      outerRadiusFactor: 2.18,
      thicknessMeters: 500,
      inclinationDegrees: 0.8,
      color: '#7c8f91',
      opacity: 0.32,
    },
    moons: [
      {
        id: 'caelora-mistral',
        name: 'Mistral',
        moonClass: 'icy',
        radiusMeters: 1_090_000,
        massKilograms: 4.1e21,
        semiMajorAxisMeters: 181_000_000,
        eccentricity: 0.008,
        inclinationDegrees: 2.7,
        rotationPeriodDays: 3.2,
        color: '#b4cbd0',
        albedo: 0.65,
        description: 'A shepherd moon that sculpts the sharp outer edge of Caelora’s rings.',
        surface: {
          baseColor: '#a3bcc1',
          detailColor: '#d8e7e9',
          roughness: 0.74,
          elevationScaleMeters: 2_900,
        },
      },
      {
        id: 'caelora-pale',
        name: 'Pale',
        moonClass: 'rocky',
        radiusMeters: 1_730_000,
        massKilograms: 1.7e22,
        semiMajorAxisMeters: 523_000_000,
        eccentricity: 0.052,
        inclinationDegrees: 11.3,
        rotationPeriodDays: 16.1,
        color: '#989a98',
        albedo: 0.18,
        description: 'A captured outer moon on an inclined, mildly eccentric orbit.',
        surface: {
          baseColor: '#777b7a',
          detailColor: '#b3b4ae',
          roughness: 0.93,
          elevationScaleMeters: 8_600,
        },
      },
    ],
  },
  {
    id: 'nyx',
    name: 'Nyx',
    planetClass: 'dwarf',
    radiusMeters: 1_260_000,
    massKilograms: 1.7e22,
    semiMajorAxisAu: 18.7,
    eccentricity: 0.19,
    inclinationDegrees: 13.8,
    rotationPeriodHours: 101.4,
    axialTiltDegrees: 31.2,
    color: '#675d72',
    albedo: 0.17,
    description: 'A remote dwarf world with nitrogen frost, dark tholins, and a binary-like moon.',
    surface: {
      baseColor: '#51485b',
      detailColor: '#958299',
      roughness: 0.88,
      elevationScaleMeters: 6_200,
    },
    moons: [
      {
        id: 'nyx-shade',
        name: 'Shade',
        moonClass: 'icy',
        radiusMeters: 540_000,
        massKilograms: 1.2e21,
        semiMajorAxisMeters: 43_000_000,
        eccentricity: 0.024,
        inclinationDegrees: 7.8,
        rotationPeriodDays: 19.3,
        color: '#8c8790',
        albedo: 0.29,
        description: 'Nyx’s oversized companion, mutually tidally locked with the dwarf planet.',
        surface: {
          baseColor: '#77727d',
          detailColor: '#aaa4ad',
          roughness: 0.91,
          elevationScaleMeters: 3_100,
        },
      },
    ],
  },
]

export const ASTERIA_DEFAULT_SEED = 'asteria-catalogue-v1'
export const ASTERIA_EPOCH_SECONDS = 0

/** Builds a fresh deterministic Asteria catalogue; the seed controls orbital phases and noise. */
export function createAsteriaSystem(seed: Seed = ASTERIA_DEFAULT_SEED): StarSystem {
  const rng = createSeededRng(seed)
  const starMassKilograms = SOLAR_MASS_KILOGRAMS * 1.04

  return {
    id: 'asteria-system',
    name: 'Asteria',
    seed,
    epochSeconds: ASTERIA_EPOCH_SECONDS,
    primaryStar: {
      id: 'asteria',
      name: 'Asteria',
      kind: 'star',
      radiusMeters: SOLAR_RADIUS_METERS * 1.08,
      massKilograms: starMassKilograms,
      rotationPeriodSeconds: 24.8 * JULIAN_DAY_SECONDS,
      axialTiltRadians: degrees(6.4),
      albedo: 1,
      color: '#fff2d2',
      description: 'A stable, slightly metal-rich G1 V main-sequence star.',
      spectralType: 'G1 V',
      luminositySolar: 1.16,
      temperatureKelvin: 5_940,
      coronaColor: '#ffd89a',
    },
    planets: planetSpecs.map((spec) =>
      makePlanet(rng, spec, starMassKilograms, ASTERIA_EPOCH_SECONDS),
    ),
  }
}

/** Canonical ready-to-render catalogue. Call createAsteriaSystem for an isolated copy. */
export const ASTERIA_SYSTEM: StarSystem = createAsteriaSystem()
