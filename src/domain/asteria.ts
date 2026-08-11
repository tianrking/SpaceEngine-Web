import {
  ASTRONOMICAL_UNIT_METERS,
  GRAVITATIONAL_CONSTANT,
  IAU_NOMINAL_EARTH_EQUATORIAL_RADIUS_METERS,
  IAU_NOMINAL_EARTH_MASS_PARAMETER,
  IAU_NOMINAL_JUPITER_EQUATORIAL_RADIUS_METERS,
  IAU_NOMINAL_JUPITER_MASS_PARAMETER,
  IAU_NOMINAL_SOLAR_MASS_PARAMETER,
  IAU_NOMINAL_SOLAR_RADIUS_METERS,
  JULIAN_DAY_SECONDS,
  TAU,
} from './constants'
import { orbitalPeriodSeconds } from './orbit'
import { createSeededRng, type Seed, type SeededRng } from './rng'
import type {
  Atmosphere,
  DataProvenance,
  KeplerOrbit,
  Moon,
  MoonClass,
  Planet,
  PlanetClass,
  RingSystem,
  StarSystem,
  SurfaceProfile,
} from './types'

const EARTH_NOMINAL_MASS_KILOGRAMS =
  IAU_NOMINAL_EARTH_MASS_PARAMETER / GRAVITATIONAL_CONSTANT
const JUPITER_NOMINAL_MASS_KILOGRAMS =
  IAU_NOMINAL_JUPITER_MASS_PARAMETER / GRAVITATIONAL_CONSTANT
const SOLAR_NOMINAL_MASS_KILOGRAMS =
  IAU_NOMINAL_SOLAR_MASS_PARAMETER / GRAVITATIONAL_CONSTANT
const degrees = (value: number): number => (value * Math.PI) / 180

interface SurfaceSpec {
  readonly baseColor: string
  readonly detailColor: string
  readonly roughness: number
  readonly elevationScaleMeters: number
  readonly noiseOctaves?: number
}

interface ClimateSpec {
  readonly meanSurfaceTemperatureKelvin: number
  readonly greenhouseDeltaKelvin: number
  readonly internalHeatFluxWattsPerSquareMeter: number
}

interface MoonSpec extends ClimateSpec {
  readonly id: string
  readonly name: string
  readonly catalogueDesignation: string
  readonly moonClass: MoonClass
  readonly radiusMeters: number
  readonly massKilograms: number
  readonly semiMajorAxisMeters: number
  readonly eccentricity: number
  readonly inclinationDegrees: number
  readonly color: string
  readonly albedo: number
  readonly description: string
  readonly interestingFacts: readonly string[]
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

interface PlanetSpec extends ClimateSpec {
  readonly id: string
  readonly name: string
  readonly catalogueDesignation: string
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
  readonly interestingFacts: readonly string[]
  readonly surface: SurfaceSpec
  readonly atmosphere?: Atmosphere
  readonly rings?: RingSpec
  readonly moons?: readonly MoonSpec[]
}

function makeProvenance(seed: Seed): DataProvenance {
  return {
    origin: 'synthetic',
    generator: 'Astral Surveyor deterministic Asteria model',
    modelVersion: '2.0.0',
    seed,
    notice:
      'Synthetic educational data generated for this simulation; it is not an observed astronomical catalogue.',
    references: [
      'IAU 2015 Resolution B3 nominal conversion constants',
      'Two-body Keplerian approximation; values selected for physical plausibility',
    ],
  }
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
  provenance: DataProvenance,
): Moon {
  const orbit = makeOrbit(
    rng,
    spec.id,
    spec.semiMajorAxisMeters,
    spec.eccentricity,
    degrees(spec.inclinationDegrees),
    parentMassKilograms,
    spec.massKilograms,
    epochSeconds,
  )
  return {
    id: spec.id,
    name: spec.name,
    catalogueDesignation: spec.catalogueDesignation,
    kind: 'moon',
    moonClass: spec.moonClass,
    parentId,
    radiusMeters: spec.radiusMeters,
    massKilograms: spec.massKilograms,
    rotationPeriodSeconds: orbit.periodSeconds,
    axialTiltRadians: 0,
    albedo: spec.albedo,
    color: spec.color,
    description: spec.description,
    provenance,
    interestingFacts: spec.interestingFacts,
    surface: makeSurface(rng, spec.id, spec.surface),
    atmosphere: spec.atmosphere,
    meanSurfaceTemperatureKelvin: spec.meanSurfaceTemperatureKelvin,
    greenhouseDeltaKelvin: spec.greenhouseDeltaKelvin,
    internalHeatFluxWattsPerSquareMeter: spec.internalHeatFluxWattsPerSquareMeter,
    orbit,
  }
}

function makePlanet(
  rng: SeededRng,
  spec: PlanetSpec,
  starMassKilograms: number,
  epochSeconds: number,
  provenance: DataProvenance,
): Planet {
  const moons = (spec.moons ?? []).map((moon) =>
    makeMoon(
      rng,
      moon,
      spec.id,
      spec.massKilograms,
      epochSeconds,
      provenance,
    ),
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
    catalogueDesignation: spec.catalogueDesignation,
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
    provenance,
    interestingFacts: spec.interestingFacts,
    surface: makeSurface(rng, spec.id, spec.surface),
    atmosphere: spec.atmosphere,
    meanSurfaceTemperatureKelvin: spec.meanSurfaceTemperatureKelvin,
    greenhouseDeltaKelvin: spec.greenhouseDeltaKelvin,
    internalHeatFluxWattsPerSquareMeter: spec.internalHeatFluxWattsPerSquareMeter,
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
  surfacePressurePascals: 410_000,
  scaleHeightMeters: 12_400,
  composition: { N2: 0.91, CO2: 0.075, Ar: 0.015 },
  rayleighColor: '#d8ae73',
  mieCoefficient: 0.012,
}

const pelagosAtmosphere: Atmosphere = {
  surfacePressurePascals: 132_000,
  scaleHeightMeters: 9_600,
  composition: { N2: 0.76, O2: 0.21, H2O: 0.02, Ar: 0.01 },
  rayleighColor: '#6ab8ff',
  mieCoefficient: 0.0045,
}

const viridiaAtmosphere: Atmosphere = {
  surfacePressurePascals: 168_000,
  scaleHeightMeters: 8_700,
  composition: { N2: 0.74, O2: 0.235, H2O: 0.015, Ar: 0.01 },
  rayleighColor: '#75b7dd',
  mieCoefficient: 0.0052,
}

const planetSpecs: readonly PlanetSpec[] = [
  {
    id: 'cinder',
    name: 'Cinder',
    catalogueDesignation: 'AE-0001 b',
    planetClass: 'lava',
    radiusMeters: IAU_NOMINAL_EARTH_EQUATORIAL_RADIUS_METERS * 0.48,
    massKilograms: EARTH_NOMINAL_MASS_KILOGRAMS * 0.19,
    semiMajorAxisAu: 0.31,
    eccentricity: 0.11,
    inclinationDegrees: 3.4,
    rotationPeriodHours: 42.3,
    axialTiltDegrees: 2.1,
    color: '#b94a2d',
    albedo: 0.12,
    meanSurfaceTemperatureKelvin: 760,
    greenhouseDeltaKelvin: 28,
    internalHeatFluxWattsPerSquareMeter: 0.19,
    description: 'A synthetic iron-rich lava planet crossed by incandescent volcanic basins.',
    interestingFacts: [
      'Its eccentric orbit drives a large seasonal change in received flux.',
      'The tenuous carbon atmosphere cannot efficiently redistribute dayside heat.',
      'A compact volcanic moon, Scoria, remains well inside Cinder\'s prograde stability limit.',
    ],
    surface: {
      baseColor: '#552217',
      detailColor: '#ff7a28',
      roughness: 0.86,
      elevationScaleMeters: 8_500,
      noiseOctaves: 7,
    },
    atmosphere: thinCarbonAtmosphere,
    moons: [
      {
        id: 'cinder-scoria',
        name: 'Scoria',
        catalogueDesignation: 'AE-0001 b I',
        moonClass: 'volcanic',
        radiusMeters: 410_000,
        massKilograms: 9.15e20,
        semiMajorAxisMeters: 92_000_000,
        eccentricity: 0.021,
        inclinationDegrees: 4.6,
        color: '#8f4b34',
        albedo: 0.11,
        meanSurfaceTemperatureKelvin: 535,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.11,
        description: 'A synthetic scorched volcanic moon with dark silicate plains.',
        interestingFacts: [
          'Weak tidal flexing sustains isolated volcanic centers in the synthetic model.',
        ],
        surface: {
          baseColor: '#4b2923',
          detailColor: '#d16a38',
          roughness: 0.92,
          elevationScaleMeters: 4_600,
          noiseOctaves: 7,
        },
      },
    ],
  },
  {
    id: 'aurelia',
    name: 'Aurelia',
    catalogueDesignation: 'AE-0001 c',
    planetClass: 'terrestrial',
    radiusMeters: IAU_NOMINAL_EARTH_EQUATORIAL_RADIUS_METERS * 0.94,
    massKilograms: EARTH_NOMINAL_MASS_KILOGRAMS * 0.84,
    semiMajorAxisAu: 0.73,
    eccentricity: 0.026,
    inclinationDegrees: 1.2,
    rotationPeriodHours: 26.1,
    axialTiltDegrees: 18.7,
    color: '#c9a667',
    albedo: 0.31,
    meanSurfaceTemperatureKelvin: 352,
    greenhouseDeltaKelvin: 44,
    internalHeatFluxWattsPerSquareMeter: 0.075,
    description: 'A synthetic warm terrestrial planet with salt deserts and dense amber skies.',
    interestingFacts: [
      'High surface pressure stabilizes transient polar brines.',
      'Its single moon is massive enough to moderate long-term obliquity changes.',
    ],
    surface: {
      baseColor: '#b78c50',
      detailColor: '#6f7441',
      roughness: 0.78,
      elevationScaleMeters: 10_200,
    },
    atmosphere: aureliaAtmosphere,
    moons: [
      {
        id: 'aurelia-cyra',
        name: 'Cyra',
        catalogueDesignation: 'AE-0001 c I',
        moonClass: 'rocky',
        radiusMeters: 1_080_000,
        massKilograms: 1.55e22,
        semiMajorAxisMeters: 191_000_000,
        eccentricity: 0.013,
        inclinationDegrees: 2.4,
        color: '#a89b87',
        albedo: 0.23,
        meanSurfaceTemperatureKelvin: 321,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.028,
        description: 'A synthetic, synchronously rotating silicate moon.',
        interestingFacts: ['A broad far-side basin records the system’s early bombardment.'],
        surface: {
          baseColor: '#81766a',
          detailColor: '#c0b19c',
          roughness: 0.9,
          elevationScaleMeters: 6_400,
        },
      },
    ],
  },
  {
    id: 'pelagos',
    name: 'Pelagos',
    catalogueDesignation: 'AE-0001 d',
    planetClass: 'ocean',
    radiusMeters: IAU_NOMINAL_EARTH_EQUATORIAL_RADIUS_METERS * 1.16,
    massKilograms: EARTH_NOMINAL_MASS_KILOGRAMS * 1.34,
    semiMajorAxisAu: 1.09,
    eccentricity: 0.018,
    inclinationDegrees: 0.6,
    rotationPeriodHours: 19.8,
    axialTiltDegrees: 24.2,
    color: '#257cb6',
    albedo: 0.38,
    meanSurfaceTemperatureKelvin: 289,
    greenhouseDeltaKelvin: 43,
    internalHeatFluxWattsPerSquareMeter: 0.091,
    description: 'A synthetic temperate ocean planet with volcanic archipelagos and active plates.',
    interestingFacts: [
      'The climate model places Pelagos inside Asteria’s conservative habitable zone.',
      'No biosignature is claimed; all environmental values are generated for simulation.',
    ],
    surface: {
      baseColor: '#155b88',
      detailColor: '#4aa59c',
      roughness: 0.42,
      elevationScaleMeters: 7_200,
    },
    atmosphere: pelagosAtmosphere,
    moons: [
      {
        id: 'pelagos-tethra',
        name: 'Tethra',
        catalogueDesignation: 'AE-0001 d I',
        moonClass: 'rocky',
        radiusMeters: 720_000,
        massKilograms: 4e21,
        semiMajorAxisMeters: 116_000_000,
        eccentricity: 0.008,
        inclinationDegrees: 1.3,
        color: '#7f827f',
        albedo: 0.19,
        meanSurfaceTemperatureKelvin: 263,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.12,
        description: 'A compact synthetic inner moon shaped by weak tidal heating.',
        interestingFacts: ['Tethra clears a narrow lane through Pelagos’s faint dust torus.'],
        surface: {
          baseColor: '#666a68',
          detailColor: '#9da09b',
          roughness: 0.92,
          elevationScaleMeters: 4_300,
        },
      },
      {
        id: 'pelagos-neris',
        name: 'Neris',
        catalogueDesignation: 'AE-0001 d II',
        moonClass: 'oceanic',
        radiusMeters: 1_940_000,
        massKilograms: 3.8e22,
        semiMajorAxisMeters: 412_000_000,
        eccentricity: 0.021,
        inclinationDegrees: 4.1,
        color: '#a9c7ce',
        albedo: 0.56,
        meanSurfaceTemperatureKelvin: 258,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.085,
        description: 'A synthetic ice-shelled moon with a modeled subsurface ocean.',
        interestingFacts: [
          'Weak tidal flexing can maintain liquid water beneath the ice shell.',
          'Subsurface water is a model inference, not an observation or life claim.',
        ],
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
    id: 'viridia',
    name: 'Viridia',
    catalogueDesignation: 'AE-0001 e',
    planetClass: 'super-earth',
    radiusMeters: IAU_NOMINAL_EARTH_EQUATORIAL_RADIUS_METERS * 1.28,
    massKilograms: EARTH_NOMINAL_MASS_KILOGRAMS * 2.18,
    semiMajorAxisAu: 1.47,
    eccentricity: 0.031,
    inclinationDegrees: 1.1,
    rotationPeriodHours: 31.6,
    axialTiltDegrees: 12.4,
    color: '#4b9d73',
    albedo: 0.34,
    meanSurfaceTemperatureKelvin: 281,
    greenhouseDeltaKelvin: 59,
    internalHeatFluxWattsPerSquareMeter: 0.11,
    description: 'A synthetic cool super-Earth with shallow seas and basaltic green continents.',
    interestingFacts: [
      'Viridia sits in the outer half of the conservative habitable zone.',
      'Its higher gravity produces a compact but comparatively dense atmosphere.',
    ],
    surface: {
      baseColor: '#235d4b',
      detailColor: '#76a46f',
      roughness: 0.69,
      elevationScaleMeters: 12_600,
    },
    atmosphere: viridiaAtmosphere,
    moons: [
      {
        id: 'viridia-luma',
        name: 'Luma',
        catalogueDesignation: 'AE-0001 e I',
        moonClass: 'icy',
        radiusMeters: 1_510_000,
        massKilograms: 1.8e22,
        semiMajorAxisMeters: 318_000_000,
        eccentricity: 0.012,
        inclinationDegrees: 3.2,
        color: '#c5c9bf',
        albedo: 0.48,
        meanSurfaceTemperatureKelvin: 207,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.041,
        description: 'A synthetic volatile-rich moon with bright young ray systems.',
        interestingFacts: ['Luma is synchronously locked to Viridia.'],
        surface: {
          baseColor: '#aeb4ae',
          detailColor: '#e2e6dc',
          roughness: 0.78,
          elevationScaleMeters: 4_900,
        },
      },
    ],
  },
  {
    id: 'orison',
    name: 'Orison',
    catalogueDesignation: 'AE-0001 f',
    planetClass: 'gas-giant',
    radiusMeters: IAU_NOMINAL_JUPITER_EQUATORIAL_RADIUS_METERS * 0.92,
    massKilograms: JUPITER_NOMINAL_MASS_KILOGRAMS * 0.78,
    semiMajorAxisAu: 4.72,
    eccentricity: 0.047,
    inclinationDegrees: 1.5,
    rotationPeriodHours: 9.4,
    axialTiltDegrees: 4.8,
    color: '#c08d6e',
    albedo: 0.49,
    meanSurfaceTemperatureKelvin: 132,
    greenhouseDeltaKelvin: 0,
    internalHeatFluxWattsPerSquareMeter: 5.1,
    description: 'A synthetic banded gas giant encircled by a broad silicate-and-ice ring system.',
    interestingFacts: [
      'The quoted radius, pressure and temperature refer to the one-bar level, not a solid surface.',
      'Five major moons occupy a stable resonant architecture in this simplified model.',
    ],
    surface: {
      baseColor: '#8e5d47',
      detailColor: '#edc09c',
      roughness: 0.2,
      elevationScaleMeters: 0,
      noiseOctaves: 8,
    },
    atmosphere: {
      surfacePressurePascals: 100_000,
      scaleHeightMeters: 27_000,
      composition: { H2: 0.89, He: 0.105, CH4: 0.005 },
      rayleighColor: '#e6b37d',
      mieCoefficient: 0.018,
    },
    rings: {
      innerRadiusFactor: 1.34,
      outerRadiusFactor: 2.62,
      thicknessMeters: 1_200,
      inclinationDegrees: 0.3,
      color: '#d6b89e',
      opacity: 0.58,
    },
    moons: [
      {
        id: 'orison-ember',
        name: 'Ember',
        catalogueDesignation: 'AE-0001 f I',
        moonClass: 'volcanic',
        radiusMeters: 1_680_000,
        massKilograms: 7.8e22,
        semiMajorAxisMeters: 232_000_000,
        eccentricity: 0.009,
        inclinationDegrees: 0.3,
        color: '#d79b44',
        albedo: 0.61,
        meanSurfaceTemperatureKelvin: 137,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 2.6,
        description: 'A synthetic resonantly heated volcanic moon with sulfur-rich plains.',
        interestingFacts: ['Localized volcanic vents greatly exceed the listed global mean temperature.'],
        surface: {
          baseColor: '#c17a2d',
          detailColor: '#f1d061',
          roughness: 0.7,
          elevationScaleMeters: 5_400,
        },
      },
      {
        id: 'orison-ione',
        name: 'Ione',
        catalogueDesignation: 'AE-0001 f II',
        moonClass: 'icy',
        radiusMeters: 2_340_000,
        massKilograms: 1.2e23,
        semiMajorAxisMeters: 471_000_000,
        eccentricity: 0.004,
        inclinationDegrees: 0.7,
        color: '#dce5e9',
        albedo: 0.72,
        meanSurfaceTemperatureKelvin: 104,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.13,
        description: 'A synthetic bright ice moon cut by young tectonic scarps.',
        interestingFacts: ['A deep internal ocean is thermally plausible in the synthetic model.'],
        surface: {
          baseColor: '#cbd8de',
          detailColor: '#edf5f6',
          roughness: 0.66,
          elevationScaleMeters: 3_200,
        },
      },
      {
        id: 'orison-lyric',
        name: 'Lyric',
        catalogueDesignation: 'AE-0001 f III',
        moonClass: 'oceanic',
        radiusMeters: 2_610_000,
        massKilograms: 1.48e23,
        semiMajorAxisMeters: 764_000_000,
        eccentricity: 0.007,
        inclinationDegrees: 0.9,
        color: '#b9d1d4',
        albedo: 0.64,
        meanSurfaceTemperatureKelvin: 108,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.095,
        description: 'A synthetic differentiated ice moon with modeled briny layers.',
        interestingFacts: ['Its induced-field signature is simulated, not measured.'],
        surface: {
          baseColor: '#9db8bf',
          detailColor: '#dcebed',
          roughness: 0.61,
          elevationScaleMeters: 2_500,
        },
      },
      {
        id: 'orison-kestrel',
        name: 'Kestrel',
        catalogueDesignation: 'AE-0001 f IV',
        moonClass: 'rocky',
        radiusMeters: 1_430_000,
        massKilograms: 3.5e22,
        semiMajorAxisMeters: 1_210_000_000,
        eccentricity: 0.019,
        inclinationDegrees: 2.1,
        color: '#8e8177',
        albedo: 0.2,
        meanSurfaceTemperatureKelvin: 118,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.022,
        description: 'A synthetic dark rocky moon with a heavily cratered surface.',
        interestingFacts: ['Kestrel shepherds the diffuse outer E ring.'],
        surface: {
          baseColor: '#6f665f',
          detailColor: '#aa9b8f',
          roughness: 0.94,
          elevationScaleMeters: 8_100,
        },
      },
      {
        id: 'orison-morrow',
        name: 'Morrow',
        catalogueDesignation: 'AE-0001 f V',
        moonClass: 'icy',
        radiusMeters: 2_720_000,
        massKilograms: 1.56e23,
        semiMajorAxisMeters: 1_910_000_000,
        eccentricity: 0.016,
        inclinationDegrees: 1.1,
        color: '#9c9790',
        albedo: 0.31,
        meanSurfaceTemperatureKelvin: 115,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.032,
        description: 'A synthetic outer moon marked by a giant ancient impact basin.',
        interestingFacts: ['Morrow is the outermost regular major moon in the model.'],
        surface: {
          baseColor: '#827c75',
          detailColor: '#b8b0a5',
          roughness: 0.9,
          elevationScaleMeters: 11_000,
        },
      },
    ],
  },
  {
    id: 'caelora',
    name: 'Caelora',
    catalogueDesignation: 'AE-0001 g',
    planetClass: 'neptunian',
    radiusMeters: 25_240_000,
    massKilograms: 1.09e26,
    semiMajorAxisAu: 9.38,
    eccentricity: 0.033,
    inclinationDegrees: 2.2,
    rotationPeriodHours: -16.8,
    axialTiltDegrees: 76.4,
    color: '#70b9c6',
    albedo: 0.51,
    meanSurfaceTemperatureKelvin: 88,
    greenhouseDeltaKelvin: 0,
    internalHeatFluxWattsPerSquareMeter: 0.35,
    description: 'A synthetic cyan Neptunian planet rotating nearly on its side beneath methane haze.',
    interestingFacts: [
      'Its extreme obliquity produces decades-long synthetic seasons.',
      'The quoted climate values refer to the one-bar atmospheric level.',
    ],
    surface: {
      baseColor: '#4c9faf',
      detailColor: '#91d2d8',
      roughness: 0.24,
      elevationScaleMeters: 0,
    },
    atmosphere: {
      surfacePressurePascals: 100_000,
      scaleHeightMeters: 21_500,
      composition: { H2: 0.8, He: 0.18, CH4: 0.02 },
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
        catalogueDesignation: 'AE-0001 g I',
        moonClass: 'icy',
        radiusMeters: 1_090_000,
        massKilograms: 6.5e21,
        semiMajorAxisMeters: 146_000_000,
        eccentricity: 0.008,
        inclinationDegrees: 2.7,
        color: '#b4cbd0',
        albedo: 0.65,
        meanSurfaceTemperatureKelvin: 67,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.08,
        description: 'A synthetic icy shepherd moon at the edge of Caelora’s rings.',
        interestingFacts: ['Its resonances maintain the ring system’s sharp outer edge.'],
        surface: {
          baseColor: '#a3bcc1',
          detailColor: '#d8e7e9',
          roughness: 0.74,
          elevationScaleMeters: 2_900,
        },
      },
      {
        id: 'caelora-serein',
        name: 'Serein',
        catalogueDesignation: 'AE-0001 g II',
        moonClass: 'icy',
        radiusMeters: 1_420_000,
        massKilograms: 1.5e22,
        semiMajorAxisMeters: 274_000_000,
        eccentricity: 0.011,
        inclinationDegrees: 1.4,
        color: '#aebfc4',
        albedo: 0.58,
        meanSurfaceTemperatureKelvin: 69,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.055,
        description: 'A synthetic ice moon with smooth resurfaced plains.',
        interestingFacts: ['Sparse crater counts imply recent cryovolcanic resurfacing in the model.'],
        surface: {
          baseColor: '#91a8ae',
          detailColor: '#d3e1e3',
          roughness: 0.67,
          elevationScaleMeters: 2_100,
        },
      },
      {
        id: 'caelora-pale',
        name: 'Pale',
        catalogueDesignation: 'AE-0001 g III',
        moonClass: 'rocky',
        radiusMeters: 1_730_000,
        massKilograms: 5.8e22,
        semiMajorAxisMeters: 523_000_000,
        eccentricity: 0.052,
        inclinationDegrees: 11.3,
        color: '#989a98',
        albedo: 0.18,
        meanSurfaceTemperatureKelvin: 76,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.026,
        description: 'A synthetic captured moon on an inclined, mildly eccentric orbit.',
        interestingFacts: ['Pale likely formed elsewhere in the generated system.'],
        surface: {
          baseColor: '#777b7a',
          detailColor: '#b3b4ae',
          roughness: 0.93,
          elevationScaleMeters: 8_600,
        },
      },
      {
        id: 'caelora-vanta',
        name: 'Vanta',
        catalogueDesignation: 'AE-0001 g IV',
        moonClass: 'rocky',
        radiusMeters: 940_000,
        massKilograms: 9e21,
        semiMajorAxisMeters: 972_000_000,
        eccentricity: 0.087,
        inclinationDegrees: 19.6,
        color: '#5e6265',
        albedo: 0.11,
        meanSurfaceTemperatureKelvin: 79,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.014,
        description: 'A synthetic dark outer irregular moon.',
        interestingFacts: ['Vanta’s orbit is the most inclined among Caelora’s modeled moons.'],
        surface: {
          baseColor: '#464b4e',
          detailColor: '#74797b',
          roughness: 0.96,
          elevationScaleMeters: 7_200,
        },
      },
    ],
  },
  {
    id: 'erebus',
    name: 'Erebus',
    catalogueDesignation: 'AE-0001 h',
    planetClass: 'ice-giant',
    radiusMeters: 22_100_000,
    massKilograms: 7.6e25,
    semiMajorAxisAu: 17.6,
    eccentricity: 0.071,
    inclinationDegrees: 4.9,
    rotationPeriodHours: 18.6,
    axialTiltDegrees: 29.1,
    color: '#536e91',
    albedo: 0.43,
    meanSurfaceTemperatureKelvin: 63,
    greenhouseDeltaKelvin: 0,
    internalHeatFluxWattsPerSquareMeter: 0.14,
    description: 'A synthetic compact ice giant with a deep indigo hydrogen-methane atmosphere.',
    interestingFacts: [
      'Erebus radiates modest residual formation heat.',
      'Its narrow charcoal rings are optically thin in the synthetic model.',
    ],
    surface: {
      baseColor: '#354c6f',
      detailColor: '#718baa',
      roughness: 0.25,
      elevationScaleMeters: 0,
    },
    atmosphere: {
      surfacePressurePascals: 100_000,
      scaleHeightMeters: 19_800,
      composition: { H2: 0.78, He: 0.19, CH4: 0.03 },
      rayleighColor: '#587ba9',
      mieCoefficient: 0.01,
    },
    rings: {
      innerRadiusFactor: 1.62,
      outerRadiusFactor: 1.94,
      thicknessMeters: 220,
      inclinationDegrees: 1.1,
      color: '#626d78',
      opacity: 0.2,
    },
    moons: [
      {
        id: 'erebus-rime',
        name: 'Rime',
        catalogueDesignation: 'AE-0001 h I',
        moonClass: 'icy',
        radiusMeters: 1_210_000,
        massKilograms: 9e21,
        semiMajorAxisMeters: 168_000_000,
        eccentricity: 0.006,
        inclinationDegrees: 1.8,
        color: '#b4c1ca',
        albedo: 0.62,
        meanSurfaceTemperatureKelvin: 43,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.044,
        description: 'A synthetic bright inner ice moon.',
        interestingFacts: ['Rime exchanges dust with Erebus’s narrow rings.'],
        surface: {
          baseColor: '#9dabaf',
          detailColor: '#dce5e8',
          roughness: 0.75,
          elevationScaleMeters: 2_700,
        },
      },
      {
        id: 'erebus-noctis',
        name: 'Noctis',
        catalogueDesignation: 'AE-0001 h II',
        moonClass: 'rocky',
        radiusMeters: 1_650_000,
        massKilograms: 5e22,
        semiMajorAxisMeters: 486_000_000,
        eccentricity: 0.038,
        inclinationDegrees: 8.4,
        color: '#696c72',
        albedo: 0.14,
        meanSurfaceTemperatureKelvin: 50,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.019,
        description: 'A synthetic, dark silicate-rich outer moon.',
        interestingFacts: ['Noctis may be a captured remnant of an early planetesimal disk.'],
        surface: {
          baseColor: '#505359',
          detailColor: '#83868c',
          roughness: 0.95,
          elevationScaleMeters: 9_200,
        },
      },
    ],
  },
  {
    id: 'nyx',
    name: 'Nyx',
    catalogueDesignation: 'AE-0001 i',
    planetClass: 'neptunian',
    radiusMeters: 19_300_000,
    massKilograms: 5.2e25,
    semiMajorAxisAu: 29.4,
    eccentricity: 0.12,
    inclinationDegrees: 8.8,
    rotationPeriodHours: 22.1,
    axialTiltDegrees: 41.5,
    color: '#514f79',
    albedo: 0.37,
    meanSurfaceTemperatureKelvin: 49,
    greenhouseDeltaKelvin: 0,
    internalHeatFluxWattsPerSquareMeter: 0.07,
    description: 'A synthetic remote Neptunian planet with violet haze and a faint dusty ring.',
    interestingFacts: [
      'Nyx completes one orbit in roughly one and a half Earth centuries.',
      'The one-bar atmosphere is modeled as hydrogen, helium and methane.',
    ],
    surface: {
      baseColor: '#39365f',
      detailColor: '#73719b',
      roughness: 0.26,
      elevationScaleMeters: 0,
    },
    atmosphere: {
      surfacePressurePascals: 100_000,
      scaleHeightMeters: 18_100,
      composition: { H2: 0.76, He: 0.2, CH4: 0.04 },
      rayleighColor: '#6763a1',
      mieCoefficient: 0.009,
    },
    rings: {
      innerRadiusFactor: 1.48,
      outerRadiusFactor: 1.82,
      thicknessMeters: 150,
      inclinationDegrees: 0.6,
      color: '#77748e',
      opacity: 0.16,
    },
    moons: [
      {
        id: 'nyx-wisp',
        name: 'Wisp',
        catalogueDesignation: 'AE-0001 i I',
        moonClass: 'icy',
        radiusMeters: 810_000,
        massKilograms: 2.8e21,
        semiMajorAxisMeters: 132_000_000,
        eccentricity: 0.011,
        inclinationDegrees: 2.2,
        color: '#a29eae',
        albedo: 0.44,
        meanSurfaceTemperatureKelvin: 34,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.031,
        description: 'A synthetic small ice moon embedded near Nyx’s dust ring.',
        interestingFacts: ['Wisp supplies fine particles to the ring through micrometeoroid impacts.'],
        surface: {
          baseColor: '#8a8797',
          detailColor: '#c1bdc9',
          roughness: 0.82,
          elevationScaleMeters: 2_600,
        },
      },
      {
        id: 'nyx-shade',
        name: 'Shade',
        catalogueDesignation: 'AE-0001 i II',
        moonClass: 'icy',
        radiusMeters: 1_540_000,
        massKilograms: 1.9e22,
        semiMajorAxisMeters: 391_000_000,
        eccentricity: 0.024,
        inclinationDegrees: 7.8,
        color: '#8c8790',
        albedo: 0.29,
        meanSurfaceTemperatureKelvin: 37,
        greenhouseDeltaKelvin: 0,
        internalHeatFluxWattsPerSquareMeter: 0.018,
        description: 'A synthetic oversized outer companion synchronously locked to Nyx.',
        interestingFacts: ['Shade and Nyx orbit a barycenter that remains inside Nyx.'],
        surface: {
          baseColor: '#77727d',
          detailColor: '#aaa4ad',
          roughness: 0.91,
          elevationScaleMeters: 5_100,
        },
      },
    ],
  },
]

export const ASTERIA_DEFAULT_SEED = 'asteria-catalogue-v2'
export const ASTERIA_EPOCH_SECONDS = 0

/** Builds a fresh synthetic catalogue; the seed controls phases and procedural surfaces. */
export function createAsteriaSystem(seed: Seed = ASTERIA_DEFAULT_SEED): StarSystem {
  const rng = createSeededRng(seed)
  const provenance = makeProvenance(seed)
  const starMassKilograms = SOLAR_NOMINAL_MASS_KILOGRAMS * 1.04

  return {
    id: 'asteria-system',
    name: 'Asteria',
    seed,
    epochSeconds: ASTERIA_EPOCH_SECONDS,
    provenance,
    primaryStar: {
      id: 'asteria',
      name: 'Asteria',
      catalogueDesignation: 'AE-0001 A',
      kind: 'star',
      radiusMeters: IAU_NOMINAL_SOLAR_RADIUS_METERS * 1.03,
      massKilograms: starMassKilograms,
      rotationPeriodSeconds: 24.8 * JULIAN_DAY_SECONDS,
      axialTiltRadians: degrees(6.4),
      albedo: 1,
      color: '#fff2d2',
      description: 'A synthetic G1 V analogue used as the deterministic system primary.',
      provenance,
      interestingFacts: [
        'Its radius, temperature and luminosity are mutually consistent to model precision.',
        'Asteria is fictional and must not be presented as an observed star.',
      ],
      spectralType: 'G1 V',
      luminositySolar: 1.16,
      temperatureKelvin: 5_890,
      coronaColor: '#ffd89a',
    },
    planets: planetSpecs.map((spec) =>
      makePlanet(
        rng,
        spec,
        starMassKilograms,
        ASTERIA_EPOCH_SECONDS,
        provenance,
      ),
    ),
  }
}

/** Canonical ready-to-render synthetic catalogue. */
export const ASTERIA_SYSTEM: StarSystem = createAsteriaSystem()
