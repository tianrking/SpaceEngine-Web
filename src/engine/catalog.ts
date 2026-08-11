import {
  ASTERIA_SYSTEM,
  ASTRONOMICAL_UNIT_METERS,
  deriveBodyPhysics,
  EARTH_MASS_KILOGRAMS,
  EARTH_RADIUS_METERS,
  flattenSystemBodies,
  JULIAN_DAY_SECONDS,
  STANDARD_GRAVITY_METERS_PER_SECOND_SQUARED,
} from '../domain'
import type {
  CelestialBody,
  ConservativeHabitabilityLabel,
  DataProvenance,
  DerivedBodyPhysics,
  KeplerOrbit,
  Moon,
  Planet,
  Star,
} from '../domain'
import type {
  CelestialBodyView,
  CelestialKind,
  HabitabilityView,
  NavigationTarget,
  OrbitView,
  ProvenanceView,
} from './types'

const RADIANS_TO_DEGREES = 180 / Math.PI
const DEFAULT_NOTICE =
  'Synthetic deterministic values for product and rendering validation; not an observed astronomical catalogue.'

const PLANET_CLASS_LABELS: Readonly<Record<Planet['planetClass'], string>> = {
  lava: 'Lava world',
  terrestrial: 'Terrestrial world',
  ocean: 'Ocean world',
  'super-earth': 'Super-Earth',
  neptunian: 'Neptunian world',
  'gas-giant': 'Gas giant',
  'ice-giant': 'Ice giant',
  dwarf: 'Dwarf planet',
}

const MOON_CLASS_LABELS: Readonly<Record<Moon['moonClass'], string>> = {
  rocky: 'Rocky moon',
  icy: 'Icy moon',
  oceanic: 'Oceanic moon',
  volcanic: 'Volcanic moon',
}

const HABITABILITY_COPY: Readonly<
  Record<ConservativeHabitabilityLabel, HabitabilityView>
> = {
  'not-applicable': {
    label: 'Not applicable',
    tone: 'neutral',
    summary: 'Surface habitability screening does not apply to a stellar photosphere.',
  },
  'insufficient-data': {
    label: 'Insufficient data',
    tone: 'neutral',
    summary: 'The deterministic model does not contain enough environmental data for screening.',
  },
  'non-surface-world': {
    label: 'Non-surface world',
    tone: 'negative',
    summary: 'This giant world has no conventionally accessible solid surface.',
  },
  'outside-conservative-habitable-zone': {
    label: 'Outside conservative HZ',
    tone: 'negative',
    summary: 'Its modeled stellar environment falls outside the conservative liquid-water zone.',
  },
  'within-conservative-habitable-zone': {
    label: 'Habitable-zone orbit',
    tone: 'caution',
    summary: 'The orbit passes a conservative flux screen; this is not evidence of habitability or life.',
  },
  'temperate-surface-candidate': {
    label: 'Temperate candidate',
    tone: 'positive',
    summary: 'Synthetic temperature, pressure, and stellar-flux values pass a conservative first screen.',
  },
}

export interface RenderBody extends CelestialBodyView {
  readonly keplerOrbit: KeplerOrbit
  readonly renderRadius: number
  readonly orbitRadius: number
  readonly orbitScale: number
  readonly rotationHours: number
  readonly axialTiltRadians: number
  readonly isGasWorld: boolean
  readonly hasClouds: boolean
  readonly atmosphereColor: string | null
  readonly atmosphereOpacity: number
  readonly atmosphereScale: number
  readonly hasRings: boolean
  readonly ringColor: string | null
  readonly ringInnerRatio: number
  readonly ringOuterRatio: number
  readonly ringInclinationRadians: number
  readonly ringOpacity: number
  readonly surfaceRoughness: number
  readonly surfaceDisplacement: number
  readonly palette: readonly [string, string, string, string]
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function normalizeHex(value: string): string {
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(value)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  return /^#[\da-f]{6}$/i.test(value) ? value : '#8aa5b8'
}

function mixHex(leftValue: string, rightValue: string, amount: number): string {
  const left = Number.parseInt(normalizeHex(leftValue).slice(1), 16)
  const right = Number.parseInt(normalizeHex(rightValue).slice(1), 16)
  const mixChannel = (shift: number): number =>
    Math.round(
      ((left >> shift) & 0xff) * (1 - amount) +
        ((right >> shift) & 0xff) * amount,
    )
  return `#${[16, 8, 0]
    .map((shift) => mixChannel(shift).toString(16).padStart(2, '0'))
    .join('')}`
}

function presentationKind(body: CelestialBody): CelestialKind {
  if (body.kind === 'star') return 'star'
  if (body.kind === 'moon') {
    if (body.moonClass === 'oceanic') return 'oceanic'
    if (body.moonClass === 'volcanic') return 'desert'
    return 'terrestrial'
  }
  if (body.planetClass === 'ocean') return 'oceanic'
  if (body.planetClass === 'gas-giant') return 'gas-giant'
  if (body.planetClass === 'ice-giant' || body.planetClass === 'neptunian') {
    return 'ice-giant'
  }
  if (body.planetClass === 'lava' || body.planetClass === 'dwarf') return 'desert'
  return 'terrestrial'
}

function classLabel(body: CelestialBody): string {
  if (body.kind === 'star') return `${body.spectralType} main-sequence star`
  return body.kind === 'planet'
    ? PLANET_CLASS_LABELS[body.planetClass]
    : MOON_CLASS_LABELS[body.moonClass]
}

function fallbackDesignation(body: CelestialBody): string {
  if (body.kind === 'star') return `AE-0001 A · ${body.spectralType}`
  if (body.kind === 'planet') {
    const index = ASTERIA_SYSTEM.planets.findIndex((candidate) => candidate.id === body.id)
    const suffix = String.fromCharCode('b'.charCodeAt(0) + Math.max(index, 0))
    return `AE-0001 ${suffix} · ${classLabel(body)}`
  }
  const parent = ASTERIA_SYSTEM.planets.find((candidate) => candidate.id === body.parentId)
  const index = parent?.moons.findIndex((candidate) => candidate.id === body.id) ?? 0
  return `${parent?.name ?? 'Asteria'} ${toRoman(index + 1)} · ${classLabel(body)}`
}

function toRoman(value: number): string {
  const symbols: readonly [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let remaining = Math.max(1, Math.floor(value))
  let result = ''
  for (const [amount, symbol] of symbols) {
    while (remaining >= amount) {
      result += symbol
      remaining -= amount
    }
  }
  return result
}

function provenanceFor(body: CelestialBody): ProvenanceView {
  const provenance: DataProvenance =
    body.provenance ??
    ASTERIA_SYSTEM.provenance ?? {
      origin: 'synthetic',
      generator: 'Asteria deterministic catalogue',
      modelVersion: '1',
      seed: ASTERIA_SYSTEM.seed,
      notice: DEFAULT_NOTICE,
    }
  return {
    origin: provenance.origin,
    generator: provenance.generator,
    modelVersion: provenance.modelVersion,
    seed: provenance.seed === undefined ? null : String(provenance.seed),
    notice: provenance.notice,
    references: provenance.references ?? [],
  }
}

function compositionFor(body: CelestialBody) {
  if (body.kind === 'star' || !body.atmosphere) return []
  return Object.entries(body.atmosphere.composition)
    .map(([species, fraction]) => ({ species, fraction }))
    .sort((left, right) => right.fraction - left.fraction)
}

function atmosphereLabel(body: CelestialBody): string {
  if (body.kind === 'star') return 'Hydrogen–helium stellar plasma'
  const composition = compositionFor(body)
  if (composition.length === 0) return 'No persistent atmosphere'
  return composition
    .slice(0, 4)
    .map(({ species, fraction }) => {
      const percentage = fraction * 100
      return `${species} ${percentage >= 10 ? percentage.toFixed(0) : percentage.toFixed(1)}%`
    })
    .join(' · ')
}

function orbitView(body: Exclude<CelestialBody, Star>, physics: DerivedBodyPhysics): OrbitView {
  const environment = physics.stellarEnvironment
  const derivedOrbit = physics.orbit
  if (!environment || !derivedOrbit) {
    throw new Error(`Missing derived orbital physics for ${body.id}`)
  }
  return {
    semiMajorAxisMeters: body.orbit.semiMajorAxisMeters,
    stellarDistanceAu: environment.stellarDistanceMeters / ASTRONOMICAL_UNIT_METERS,
    eccentricity: body.orbit.eccentricity,
    inclinationDegrees: body.orbit.inclinationRadians * RADIANS_TO_DEGREES,
    periodDays: body.orbit.periodSeconds / JULIAN_DAY_SECONDS,
    periapsisMeters: derivedOrbit.periapsisMeters,
    apoapsisMeters: derivedOrbit.apoapsisMeters,
    meanVelocityKmPerSecond: derivedOrbit.meanOrbitalSpeedMetersPerSecond / 1_000,
    stellarFluxWattsPerSquareMeter: environment.fluxWattsPerSquareMeter,
    stellarFluxSolar: environment.fluxSolar,
  }
}

function derivedFacts(body: CelestialBody, physics: DerivedBodyPhysics): readonly string[] {
  if (body.interestingFacts && body.interestingFacts.length > 0) return body.interestingFacts
  const facts = [
    `Mean density ${Math.round(physics.meanDensityKgPerCubicMeter).toLocaleString()} kg/m³.`,
    `Escape velocity ${(physics.escapeVelocityMetersPerSecond / 1_000).toFixed(2)} km/s.`,
  ]
  if (physics.orbit) {
    facts.push(`Mean orbital speed ${(physics.orbit.meanOrbitalSpeedMetersPerSecond / 1_000).toFixed(2)} km/s.`)
  }
  return facts
}

function toView(body: CelestialBody, bodyById: ReadonlyMap<string, CelestialBody>): CelestialBodyView {
  const physics = deriveBodyPhysics(ASTERIA_SYSTEM, body.id)
  if (!physics) throw new Error(`Unable to derive physics for ${body.id}`)
  const parentId = body.kind === 'star' ? null : body.parentId
  const parentName = parentId ? bodyById.get(parentId)?.name ?? null : null
  const orbit = body.kind === 'star' ? null : orbitView(body, physics)
  const provenance = provenanceFor(body)
  const equilibriumTemperatureK = physics.stellarEnvironment?.equilibriumTemperatureKelvin ?? null
  const temperatureK =
    body.kind === 'star'
      ? body.temperatureKelvin
      : body.meanSurfaceTemperatureKelvin ?? equilibriumTemperatureK ?? 0
  const atmosphereComposition = compositionFor(body)
  const accent =
    body.kind === 'star'
      ? body.coronaColor
      : body.atmosphere?.rayleighColor ??
        (body.kind === 'planet' ? body.rings?.color : undefined) ??
        mixHex(body.color, '#ffffff', 0.32)

  return {
    id: body.id,
    name: body.name,
    designation: body.catalogueDesignation ?? fallbackDesignation(body),
    kind: presentationKind(body),
    bodyKind: body.kind,
    bodyClass: classLabel(body),
    parentId,
    parentName,
    description: body.description,
    radiusKm: body.radiusMeters / 1_000,
    massKilograms: body.massKilograms,
    massEarths: body.massKilograms / EARTH_MASS_KILOGRAMS,
    densityKgPerCubicMeter: physics.meanDensityKgPerCubicMeter,
    temperatureK,
    equilibriumTemperatureK,
    greenhouseDeltaK: body.kind === 'star' ? null : body.greenhouseDeltaKelvin ?? null,
    internalHeatFluxWattsPerSquareMeter:
      body.kind === 'star' ? null : body.internalHeatFluxWattsPerSquareMeter ?? null,
    surfaceGravityMetersPerSecondSquared: physics.surfaceGravityMetersPerSecondSquared,
    gravityG:
      physics.surfaceGravityMetersPerSecondSquared /
      STANDARD_GRAVITY_METERS_PER_SECOND_SQUARED,
    escapeVelocityKmPerSecond: physics.escapeVelocityMetersPerSecond / 1_000,
    orbitalPeriodDays: orbit?.periodDays ?? 0,
    distanceAu: orbit?.stellarDistanceAu ?? 0,
    orbit,
    rotationPeriodHours: body.rotationPeriodSeconds / 3_600,
    axialTiltDegrees: body.axialTiltRadians * RADIANS_TO_DEGREES,
    albedo: body.albedo,
    atmosphere: atmosphereLabel(body),
    surfacePressurePascals:
      body.kind === 'star' ? null : body.atmosphere?.surfacePressurePascals ?? 0,
    atmosphereComposition,
    discovered: `${provenance.generator} · model ${provenance.modelVersion}`,
    provenance,
    facts: derivedFacts(body, physics),
    habitability: HABITABILITY_COPY[physics.habitabilityLabel],
    color: body.color,
    accent,
  }
}

function visualRadius(body: Exclude<CelestialBody, Star>): number {
  if (body.kind === 'moon') {
    return clamp(0.34 * (body.radiusMeters / 1_000_000) ** 0.45, 0.18, 0.62)
  }
  return clamp(0.9 * (body.radiusMeters / EARTH_RADIUS_METERS) ** 0.45, 0.55, 2.8)
}

function planetOrbitRadius(stellarDistanceAu: number): number {
  return 12 + Math.log1p(stellarDistanceAu * 2) * 23
}

function moonOrbitRadius(body: Moon, parent: Planet, parentRenderRadius: number): number {
  const physicalRatio = body.orbit.semiMajorAxisMeters / parent.radiusMeters
  return parentRenderRadius * (2.4 + Math.log1p(physicalRatio) * 0.9)
}

function paletteFor(body: Exclude<CelestialBody, Star>): readonly [string, string, string, string] {
  const base = body.surface.baseColor
  const detail = body.surface.detailColor
  return [
    mixHex(base, '#020611', 0.62),
    base,
    mixHex(base, detail, 0.52),
    mixHex(detail, '#ffffff', 0.24),
  ]
}

const DOMAIN_BODIES = flattenSystemBodies(ASTERIA_SYSTEM)
const DOMAIN_BODY_LOOKUP = new Map(DOMAIN_BODIES.map((body) => [body.id, body] as const))

export const CATALOG_BODIES: readonly CelestialBodyView[] = DOMAIN_BODIES.map((body) =>
  toView(body, DOMAIN_BODY_LOOKUP),
)

export const BODY_LOOKUP: ReadonlyMap<string, CelestialBodyView> = new Map(
  CATALOG_BODIES.map((body) => [body.id, body] as const),
)

const STAR_VIEW = BODY_LOOKUP.get(ASTERIA_SYSTEM.primaryStar.id)
if (!STAR_VIEW) throw new Error('Asteria primary star is missing from the engine catalogue')
export const STAR: CelestialBodyView = STAR_VIEW

const RENDER_RADIUS_BY_ID = new Map(
  DOMAIN_BODIES.flatMap((body) =>
    body.kind === 'star' ? [] : [[body.id, visualRadius(body)] as const],
  ),
)

export const RENDER_BODIES: readonly RenderBody[] = DOMAIN_BODIES.flatMap((body) => {
  if (body.kind === 'star') return []
  const view = BODY_LOOKUP.get(body.id)
  if (!view) throw new Error(`Missing view for render body ${body.id}`)
  const renderRadius = RENDER_RADIUS_BY_ID.get(body.id)
  if (renderRadius === undefined) throw new Error(`Missing visual radius for ${body.id}`)
  const parent = DOMAIN_BODY_LOOKUP.get(body.parentId)
  if (!parent) throw new Error(`Missing parent ${body.parentId} for ${body.id}`)
  const orbitRadius =
    body.kind === 'planet'
      ? planetOrbitRadius(view.distanceAu)
      : moonOrbitRadius(
          body,
          parent as Planet,
          RENDER_RADIUS_BY_ID.get(parent.id) ?? 1,
        )
  const pressure = body.atmosphere?.surfacePressurePascals ?? 0
  const pressureBlend = pressure > 0 ? clamp(Math.log10(pressure + 1) / 7, 0, 1) : 0
  const rings = body.kind === 'planet' ? body.rings : undefined
  const isGasWorld =
    body.kind === 'planet' &&
    (body.planetClass === 'gas-giant' ||
      body.planetClass === 'ice-giant' ||
      body.planetClass === 'neptunian')

  return [{
    ...view,
    keplerOrbit: body.orbit,
    renderRadius,
    orbitRadius,
    orbitScale: orbitRadius / body.orbit.semiMajorAxisMeters,
    rotationHours: body.rotationPeriodSeconds / 3_600,
    axialTiltRadians: body.axialTiltRadians,
    isGasWorld,
    hasClouds:
      body.kind === 'planet' &&
      !isGasWorld &&
      pressure >= 20_000,
    atmosphereColor: body.atmosphere?.rayleighColor ?? null,
    atmosphereOpacity: body.atmosphere ? 0.035 + pressureBlend * 0.11 : 0,
    atmosphereScale: body.atmosphere ? 1.035 + pressureBlend * 0.055 : 1,
    hasRings: rings !== undefined,
    ringColor: rings?.color ?? null,
    ringInnerRatio: rings ? rings.innerRadiusMeters / body.radiusMeters : 0,
    ringOuterRatio: rings ? rings.outerRadiusMeters / body.radiusMeters : 0,
    ringInclinationRadians: rings?.inclinationRadians ?? 0,
    ringOpacity: rings?.opacity ?? 0,
    surfaceRoughness: body.surface.roughness,
    surfaceDisplacement: clamp(body.surface.elevationScaleMeters / body.radiusMeters, 0, 0.018),
    palette: paletteFor(body),
  }]
})

export const NAVIGATION_TARGETS: readonly NavigationTarget[] = [
  ASTERIA_SYSTEM.primaryStar,
  ...ASTERIA_SYSTEM.planets,
].map((body) => {
  const view = BODY_LOOKUP.get(body.id)
  if (!view || view.bodyKind === 'moon') {
    throw new Error(`Invalid navigation target ${body.id}`)
  }
  return {
    id: view.id,
    name: view.name,
    kind: view.kind,
    bodyKind: view.bodyKind,
    bodyClass: view.bodyClass,
    color: view.color,
  }
})
