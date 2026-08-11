import { describe, expect, it } from 'vitest'
import {
  ASTERIA_SYSTEM,
  deriveBodyPhysics,
  findBodyById,
  flattenSystemBodies,
} from '../domain'
import {
  BODY_LOOKUP,
  CATALOG_BODIES,
  NAVIGATION_TARGETS,
  RENDER_BODIES,
  STAR,
} from './catalog'

const canonicalPlanetIds = [
  'cinder',
  'aurelia',
  'pelagos',
  'viridia',
  'orison',
  'caelora',
  'erebus',
  'nyx',
] as const

function expectPositiveFinite(value: number): void {
  expect(Number.isFinite(value)).toBe(true)
  expect(value).toBeGreaterThan(0)
}

describe('engine catalogue adapter', () => {
  it('adapts every canonical domain body exactly once', () => {
    const domainBodies = flattenSystemBodies(ASTERIA_SYSTEM)
    const ids = CATALOG_BODIES.map(({ id }) => id)
    const planetIds = CATALOG_BODIES
      .filter(({ bodyKind }) => bodyKind === 'planet')
      .map(({ id }) => id)
    const moonCount = ASTERIA_SYSTEM.planets.reduce(
      (total, planet) => total + planet.moons.length,
      0,
    )

    expect(ids).toHaveLength(domainBodies.length)
    expect(new Set(ids).size).toBe(ids.length)
    expect(BODY_LOOKUP.size).toBe(ids.length)
    expect(planetIds).toEqual(canonicalPlanetIds)
    expect(CATALOG_BODIES.filter(({ bodyKind }) => bodyKind === 'star')).toHaveLength(1)
    expect(CATALOG_BODIES.filter(({ bodyKind }) => bodyKind === 'moon')).toHaveLength(moonCount)
    expect(STAR.id).toBe(ASTERIA_SYSTEM.primaryStar.id)
  })

  it('keeps navigation concise while rendering every planet and moon', () => {
    expect(NAVIGATION_TARGETS).toHaveLength(ASTERIA_SYSTEM.planets.length + 1)
    expect(
      NAVIGATION_TARGETS.some(({ id }) => BODY_LOOKUP.get(id)?.bodyKind === 'moon'),
    ).toBe(false)
    expect(NAVIGATION_TARGETS.map(({ id }) => id)).toEqual([
      ASTERIA_SYSTEM.primaryStar.id,
      ...canonicalPlanetIds,
    ])

    expect(RENDER_BODIES).toHaveLength(CATALOG_BODIES.length - 1)
    expect(RENDER_BODIES.every(({ bodyKind }) => bodyKind !== 'star')).toBe(true)
    for (const body of RENDER_BODIES) {
      expect(body.parentId).not.toBeNull()
      expect(BODY_LOOKUP.has(body.parentId ?? '')).toBe(true)
      expectPositiveFinite(body.renderRadius)
      expectPositiveFinite(body.orbitRadius)
      expectPositiveFinite(body.orbitScale)
      if (body.bodyKind === 'moon') {
        expect(body.renderRadius).toBeGreaterThanOrEqual(0.18)
        expect(body.renderRadius).toBeLessThanOrEqual(0.62)
      } else {
        expect(body.renderRadius).toBeGreaterThanOrEqual(0.55)
        expect(body.renderRadius).toBeLessThanOrEqual(2.8)
      }
    }

    const orison = RENDER_BODIES.find(({ id }) => id === 'orison')
    expect(orison).toMatchObject({
      bodyKind: 'planet',
      kind: 'gas-giant',
      hasRings: true,
    })
  })

  it('publishes finite physical and environmental values', () => {
    for (const body of CATALOG_BODIES) {
      expectPositiveFinite(body.radiusKm)
      expectPositiveFinite(body.massKilograms)
      expectPositiveFinite(body.massEarths)
      expectPositiveFinite(body.densityKgPerCubicMeter)
      expectPositiveFinite(body.temperatureK)
      expectPositiveFinite(body.surfaceGravityMetersPerSecondSquared)
      expectPositiveFinite(body.gravityG)
      expectPositiveFinite(body.escapeVelocityKmPerSecond)
      expect(Number.isFinite(body.rotationPeriodHours)).toBe(true)
      expect(body.rotationPeriodHours).not.toBe(0)
      expect(Number.isFinite(body.axialTiltDegrees)).toBe(true)
      expect(body.facts.length).toBeGreaterThan(0)
      expect(body.provenance.notice.length).toBeGreaterThan(0)

      if (body.bodyKind === 'star') {
        expect(body.orbit).toBeNull()
        expect(body.parentId).toBeNull()
        continue
      }

      expect(body.parentId).not.toBeNull()
      expect(body.parentName).not.toBeNull()
      expect(body.orbit).not.toBeNull()
      const orbit = body.orbit
      if (!orbit) throw new Error(`Missing orbit for ${body.id}`)
      expectPositiveFinite(orbit.semiMajorAxisMeters)
      expectPositiveFinite(orbit.stellarDistanceAu)
      expectPositiveFinite(orbit.periodDays)
      expectPositiveFinite(orbit.periapsisMeters)
      expectPositiveFinite(orbit.apoapsisMeters)
      expectPositiveFinite(orbit.meanVelocityKmPerSecond)
      expectPositiveFinite(orbit.stellarFluxWattsPerSquareMeter)
      expectPositiveFinite(orbit.stellarFluxSolar)
      expect(orbit.eccentricity).toBeGreaterThanOrEqual(0)
      expect(orbit.eccentricity).toBeLessThan(1)
      expect(Number.isFinite(orbit.inclinationDegrees)).toBe(true)
      expect(body.surfacePressurePascals).not.toBeNull()
      expect(body.surfacePressurePascals).toBeGreaterThanOrEqual(0)
      for (const constituent of body.atmosphereComposition) {
        expect(constituent.species.length).toBeGreaterThan(0)
        expect(constituent.fraction).toBeGreaterThanOrEqual(0)
        expect(constituent.fraction).toBeLessThanOrEqual(1)
      }
    }
  })

  it('uses domain physics rather than a duplicate display-value table', () => {
    for (const id of ['asteria', 'pelagos', 'orison', 'nyx']) {
      const source = findBodyById(ASTERIA_SYSTEM, id)
      const physics = deriveBodyPhysics(ASTERIA_SYSTEM, id)
      const view = BODY_LOOKUP.get(id)
      expect(source).toBeDefined()
      expect(physics).toBeDefined()
      expect(view).toBeDefined()
      if (!source || !physics || !view) continue

      expect(view.radiusKm).toBeCloseTo(source.radiusMeters / 1_000, 8)
      expect(view.massKilograms).toBe(source.massKilograms)
      expect(view.densityKgPerCubicMeter).toBeCloseTo(
        physics.meanDensityKgPerCubicMeter,
        8,
      )
      expect(view.surfaceGravityMetersPerSecondSquared).toBeCloseTo(
        physics.surfaceGravityMetersPerSecondSquared,
        8,
      )
      expect(view.escapeVelocityKmPerSecond).toBeCloseTo(
        physics.escapeVelocityMetersPerSecond / 1_000,
        8,
      )
    }
  })
})
