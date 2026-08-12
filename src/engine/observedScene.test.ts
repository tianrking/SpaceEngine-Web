import { describe, expect, it } from 'vitest'
import type { ProgressiveHostSkyIndex } from '../data/progressiveExoplanetCatalog'
import type { ObservedSystemBundle } from '../data/progressiveObservedSystem'
import {
  UNKNOWN_DISTANCE_SHELL_RADIUS,
  buildObservedHostPoints,
  buildObservedSystemRenderModel,
  icrsDirection,
  observedDistanceToDisplayRadius,
  observedHostId,
  observedOrbitVisualRadius,
  observedPlanetId,
  observedPlanetVisualRadius,
  observedStarId,
} from './observedScene'

describe('observed scene math and identity', () => {
  it('converts ICRS directions into the right-handed render frame', () => {
    expect(icrsDirection(0, 0)).toEqual({ x: 1, y: 0, z: 0 })
    const east = icrsDirection(90, 0)
    expect(east.x).toBeCloseTo(0, 12)
    expect(east.y).toBeCloseTo(0, 12)
    expect(east.z).toBeCloseTo(1, 12)
    const north = icrsDirection(123, 90)
    expect(north.x).toBeCloseTo(0, 12)
    expect(north.y).toBeCloseTo(1, 12)
    expect(north.z).toBeCloseTo(0, 12)
  })

  it('uses a monotonic logarithmic distance transform', () => {
    const distances = [1, 10, 100, 1_000].map(observedDistanceToDisplayRadius)
    expect(distances[0]).toBeLessThan(distances[1])
    expect(distances[1]).toBeLessThan(distances[2])
    expect(distances[2]).toBeLessThan(distances[3])
    expect(distances[3] - distances[2]).toBeLessThan(1_000 - 100)
    expect(() => observedDistanceToDisplayRadius(0)).toThrow(/positive/)
  })

  it('keeps null-distance hosts on an explicit sky-only shell', () => {
    const index = {
      schemaVersion: '1.0.0',
      catalogRevision: 'test',
      coordinateFrame: 'ICRS',
      columns: [],
      provenance: { selection: 'test', conflictPolicy: 'test', nullPolicy: 'test' },
      records: [
        ['Known', 0, 0, 10, 6, 'G2 V', 1, 1, null, null, 'Known b'],
        ['Direction only', 90, 0, null, null, null, 1, null, null, null, 'Direction only b'],
      ],
    } satisfies ProgressiveHostSkyIndex
    const points = buildObservedHostPoints(index)
    expect(points[0].skyOnly).toBe(false)
    expect(points[1]).toMatchObject({ skyOnly: true, distancePc: null })
    expect(points[1]).toMatchObject({ raDeg: 90, decDeg: 0 })
    expect(points[1].displayDistance).toBe(UNKNOWN_DISTANCE_SHELL_RADIUS)
  })

  it('mints stable namespaces that cannot collide with Asteria ids', () => {
    expect(observedHostId('TRAPPIST-1')).toBe('observed-host:TRAPPIST-1')
    expect(observedStarId('nea:host:TRAPPIST-1')).toContain('observed-star:')
    expect(observedPlanetId('nea:pscomppars:TRAPPIST-1 e')).toContain('observed-planet:')
    for (const id of [observedHostId('pelagos'), observedStarId('asteria'), observedPlanetId('nyx')]) {
      expect(['asteria', 'pelagos', 'nyx']).not.toContain(id)
    }
  })

  it('bounds visual scale and keeps a deterministic null-orbit fallback', () => {
    expect(observedPlanetVisualRadius(null)).toBeGreaterThan(0)
    expect(observedPlanetVisualRadius(0.1)).toBeLessThan(observedPlanetVisualRadius(10))
    expect(observedPlanetVisualRadius(10_000)).toBeLessThanOrEqual(1.72)
    expect(observedOrbitVisualRadius(null, 2)).toBe(26)
    expect(observedOrbitVisualRadius(0.1, 0)).toBeLessThan(observedOrbitVisualRadius(10, 0))
  })

  it('maps observed and illustrative values without erasing assumptions', () => {
    const measurement = (value: number | null) => ({
      value, errorPlus: null, errorMinus: null, limit: null, unit: 'test', reference: null,
    })
    const assumptions = [
      { field: 'longitudeAscendingNodeDeg', value: 45, unit: 'deg', evidence: 'illustrative', seed: 'node', reason: 'test' },
      { field: 'argumentPeriapsisDeg', value: 90, unit: 'deg', evidence: 'illustrative', seed: 'peri', reason: 'test' },
      { field: 'meanAnomalyAtEpochDeg', value: 180, unit: 'deg', evidence: 'illustrative', seed: 'phase', reason: 'test' },
      { field: 'inclinationDeg', value: 12, unit: 'deg', evidence: 'illustrative', seed: 'inclination', reason: 'test' },
      { field: 'eccentricity', value: 0, unit: 'dimensionless', evidence: 'illustrative', seed: 'eccentricity', reason: 'test' },
    ] as const
    const bundle = {
      id: 'nea:host:Example',
      host: 'Example',
      hostStar: {
        spectralTypes: ['G2 V'],
        measurements: {
          stellarMassSolar: { status: 'single', selected: null, candidates: [] },
          stellarRadiusSolar: { status: 'single', selected: { measurement: measurement(1.1) }, candidates: [] },
          stellarTeffK: { status: 'single', selected: { measurement: measurement(5_800) }, candidates: [] },
          stellarLuminosityLogSolar: { status: 'single', selected: null, candidates: [] },
        },
      },
      planets: [{
        id: 'nea:planet:b', name: 'Example b',
        record: { measurements: { radiusEarth: measurement(1.2) } },
        orbit: {
          semiMajorAxisAu: measurement(0.5), orbitalPeriodDays: measurement(null),
          eccentricity: measurement(null), inclinationDeg: measurement(null),
          renderAssumptions: assumptions,
        },
      }],
    } as unknown as ObservedSystemBundle
    const model = buildObservedSystemRenderModel(bundle)
    expect(model.planets[0]).toMatchObject({
      staticOrbit: true,
      eccentricity: 0,
      periodDays: null,
      assumptions,
    })
    expect(model.planets[0].inclinationRadians).toBeCloseTo(12 * Math.PI / 180)
    expect(model.planets[0].phaseRadians).toBeCloseTo(Math.PI)
  })
})
