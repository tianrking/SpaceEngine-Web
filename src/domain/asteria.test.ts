import { describe, expect, it } from 'vitest'
import { createAsteriaSystem } from './asteria'
import { meanDensityKgPerCubicMeter } from './physics'
import { bodyPositionAtTime, findBodyById, flattenSystemBodies } from './system'

const CANONICAL_PLANET_IDS = [
  'cinder',
  'aurelia',
  'pelagos',
  'viridia',
  'orison',
  'caelora',
  'erebus',
  'nyx',
] as const

describe('Asteria catalogue', () => {
  it('is deterministic for a seed and varies orbital phases across seeds', () => {
    const first = createAsteriaSystem('catalogue-test')
    const replay = createAsteriaSystem('catalogue-test')
    const alternate = createAsteriaSystem('alternate-test')

    expect(replay).toEqual(first)
    expect(alternate.planets[0]?.orbit.meanAnomalyAtEpochRadians).not.toBe(
      first.planets[0]?.orbit.meanAnomalyAtEpochRadians,
    )
  })

  it('contains the canonical eight planets and eighteen moons', () => {
    const system = createAsteriaSystem()
    const moonCount = system.planets.reduce(
      (total, planet) => total + planet.moons.length,
      0,
    )
    const orison = system.planets.find((planet) => planet.id === 'orison')

    expect(system.primaryStar.id).toBe('asteria')
    expect(system.planets.map((planet) => planet.id)).toEqual(CANONICAL_PLANET_IDS)
    expect(moonCount).toBe(18)
    expect(flattenSystemBodies(system)).toHaveLength(27)
    expect(findBodyById(system, 'cinder-scoria')?.kind).toBe('moon')
    expect(findBodyById(system, 'pelagos-neris')?.kind).toBe('moon')
    expect(orison?.planetClass).toBe('gas-giant')
    expect(orison?.rings).toBeDefined()
  })

  it('marks every entry as synthetic and gives it useful context', () => {
    const system = createAsteriaSystem('provenance-test')

    expect(system.provenance?.origin).toBe('synthetic')
    for (const body of flattenSystemBodies(system)) {
      expect(body.provenance?.origin).toBe('synthetic')
      expect(body.provenance?.notice.toLowerCase()).toContain('not an observed')
      expect(body.interestingFacts?.length).toBeGreaterThan(0)
      expect(body.catalogueDesignation).toMatch(/^AE-0001/)
    }
  })

  it('uses non-crossing planetary orbits and stable moon scales', () => {
    const system = createAsteriaSystem('stability-test')
    let previousApoapsis = 0

    for (const planet of system.planets) {
      const periapsis =
        planet.orbit.semiMajorAxisMeters * (1 - planet.orbit.eccentricity)
      const apoapsis =
        planet.orbit.semiMajorAxisMeters * (1 + planet.orbit.eccentricity)
      expect(periapsis).toBeGreaterThan(previousApoapsis)
      previousApoapsis = apoapsis

      const hillRadiusAtPeriapsis =
        periapsis *
        (planet.massKilograms / (3 * system.primaryStar.massKilograms)) ** (1 / 3)
      const innerSafeRadius = planet.rings?.outerRadiusMeters ?? planet.radiusMeters * 2
      for (const moon of planet.moons) {
        expect(moon.orbit.semiMajorAxisMeters * (1 - moon.orbit.eccentricity)).toBeGreaterThan(
          innerSafeRadius,
        )
        expect(moon.orbit.semiMajorAxisMeters * (1 + moon.orbit.eccentricity)).toBeLessThan(
          hillRadiusAtPeriapsis * 0.5,
        )
        expect(moon.rotationPeriodSeconds).toBeCloseTo(moon.orbit.periodSeconds, 10)
      }
    }
  })

  it('keeps densities, atmospheres, climates and rings in plausible ranges', () => {
    const system = createAsteriaSystem('physical-range-test')

    for (const planet of system.planets) {
      const density = meanDensityKgPerCubicMeter(
        planet.massKilograms,
        planet.radiusMeters,
      )
      expect(density).toBeGreaterThan(300)
      expect(density).toBeLessThan(12_000)
      expect(planet.meanSurfaceTemperatureKelvin).toBeGreaterThan(0)
      expect(planet.greenhouseDeltaKelvin).toBeGreaterThanOrEqual(0)
      expect(planet.internalHeatFluxWattsPerSquareMeter).toBeGreaterThanOrEqual(0)

      if (planet.atmosphere) {
        const compositionTotal = Object.values(planet.atmosphere.composition)
          .reduce((total, fraction) => total + fraction, 0)
        expect(compositionTotal).toBeCloseTo(1, 8)
      }
      if (planet.rings) {
        expect(planet.rings.innerRadiusMeters).toBeGreaterThan(planet.radiusMeters)
        expect(planet.rings.outerRadiusMeters).toBeGreaterThan(
          planet.rings.innerRadiusMeters,
        )
      }

      for (const moon of planet.moons) {
        const moonDensity = meanDensityKgPerCubicMeter(
          moon.massKilograms,
          moon.radiusMeters,
        )
        expect(moonDensity).toBeGreaterThan(800)
        expect(moonDensity).toBeLessThan(6_000)
      }
    }
  })

  it('flattens and looks up every nested moon without duplicate ids', () => {
    const system = createAsteriaSystem()
    const flattened = flattenSystemBodies(system)

    expect(findBodyById(system, 'orison-ione')?.name).toBe('Ione')
    expect(new Set(flattened.map((body) => body.id)).size).toBe(flattened.length)
    expect(flattened.length).toBeGreaterThanOrEqual(21)
  })

  it('resolves moon positions into the star-system coordinate frame', () => {
    const system = createAsteriaSystem('position-test')
    const planetPosition = bodyPositionAtTime(system, 'pelagos', 123_456)
    const moonPosition = bodyPositionAtTime(system, 'pelagos-neris', 123_456)
    const moon = findBodyById(system, 'pelagos-neris')

    expect(planetPosition).toBeDefined()
    expect(moonPosition).toBeDefined()
    expect(moon?.kind).toBe('moon')
    if (!planetPosition || !moonPosition || moon?.kind !== 'moon') return

    const separation = Math.hypot(
      moonPosition.x - planetPosition.x,
      moonPosition.y - planetPosition.y,
      moonPosition.z - planetPosition.z,
    )
    expect(separation).toBeGreaterThan(
      moon.orbit.semiMajorAxisMeters * (1 - moon.orbit.eccentricity) * 0.999,
    )
    expect(separation).toBeLessThan(
      moon.orbit.semiMajorAxisMeters * (1 + moon.orbit.eccentricity) * 1.001,
    )
  })
})
