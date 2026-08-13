import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import type { ProgressiveHostSkyIndex } from '../data/progressiveExoplanetCatalog'
import type { ObservedSystemBundle } from '../data/progressiveObservedSystem'
import {
  UNKNOWN_DISTANCE_SHELL_RADIUS,
  OBSERVED_HOST_BASE_OPACITY,
  buildObservedHostPoints,
  buildObservedSystemRenderModel,
  clearObservedSelectionState,
  icrsDirection,
  observedCameraDistance,
  observedDistanceToDisplayRadius,
  observedHostId,
  observedHostCanOpen,
  observedHostVisualCalibration,
  observedOrbitVisualRadius,
  observedNavigationCommand,
  observedObjectSupportsViewMode,
  observedPlanetId,
  observedPlanetVisualRadius,
  observedStarId,
  shouldStartObservedCentering,
} from './observedScene'
import { shouldDisposeSceneObjectGeometry } from './CosmosEngine'

describe('observed scene math and identity', () => {
  it('preserves Three.js shared sprite geometry when retiring a scene branch', () => {
    const sprite = new THREE.Sprite(new THREE.SpriteNodeMaterial())
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicNodeMaterial())

    expect(shouldDisposeSceneObjectGeometry(sprite)).toBe(false)
    expect(shouldDisposeSceneObjectGeometry(mesh)).toBe(true)

    sprite.material.dispose()
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

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
    expect(observedHostCanOpen(points[0])).toBe(true)
    expect(observedHostCanOpen(points[1])).toBe(false)
  })

  it('maps observed host brightness through the shared starfield control', () => {
    expect(observedHostVisualCalibration(0)).toEqual({ colorIntensity: 0, opacity: 0 })
    expect(observedHostVisualCalibration(1)).toEqual({
      colorIntensity: 1,
      opacity: OBSERVED_HOST_BASE_OPACITY,
    })
    expect(observedHostVisualCalibration(2)).toEqual({ colorIntensity: 2, opacity: 1 })
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

  it('routes observed keyboard navigation away from hidden Asteria state', () => {
    expect(observedNavigationCommand('KeyG', {
      mode: 'observed-universe', selectedObservedId: 'observed-host:Known',
    })).toEqual({ type: 'observed-center', id: 'observed-host:Known', mode: 'orbit' })
    expect(observedNavigationCommand('KeyG', {
      mode: 'observed-universe', selectedObservedId: 'observed-host:Known', closeRequested: true,
    })).toEqual({ type: 'ignore' })
    expect(observedNavigationCommand('KeyG', {
      mode: 'observed-system', selectedObservedId: 'observed-planet:Known', closeRequested: true,
    })).toEqual({ type: 'observed-center', id: 'observed-planet:Known', mode: 'close' })
    expect(observedNavigationCommand('KeyG', {
      mode: 'observed-system', selectedObservedId: 'observed-star:Known', closeRequested: true,
    })).toEqual({ type: 'ignore' })
    expect(observedNavigationCommand('KeyG', {
      mode: 'observed-universe', selectedObservedId: null,
    })).toEqual({ type: 'ignore' })
    expect(observedNavigationCommand('Backspace', {
      mode: 'observed-system', selectedObservedId: 'observed-star:Known',
    })).toEqual({ type: 'ignore' })
    expect(observedNavigationCommand('Digit0', {
      mode: 'observed-system', selectedObservedId: null,
    })).toEqual({ type: 'observed-local-overview' })
    expect(observedNavigationCommand('Backspace', {
      mode: 'asteria', selectedObservedId: null,
    })).toEqual({ type: 'asteria-history' })
    expect(observedNavigationCommand('KeyG', {
      mode: 'asteria', selectedObservedId: null,
    })).toEqual({ type: 'asteria-center', mode: 'orbit' })
    expect(observedObjectSupportsViewMode(
      'observed-universe', 'observed-host:Known', 'close',
    )).toBe(false)
    expect(observedObjectSupportsViewMode(
      'observed-system', 'observed-star:Known', 'close',
    )).toBe(false)
    expect(observedObjectSupportsViewMode(
      'observed-system', 'observed-planet:Known', 'close',
    )).toBe(true)
  })

  it('plans safe observed orbit and close views without restarting an identical view', () => {
    const close = observedCameraDistance(2, 'close')
    const orbit = observedCameraDistance(2, 'orbit')
    expect(close).toBeGreaterThanOrEqual(2 * 1.35)
    expect(close).toBeLessThan(orbit)
    expect(orbit).toBe(2 * 4.2)
    expect(() => observedCameraDistance(0, 'close')).toThrow(/positive/)

    const centered = { centeredObjectId: 'observed-planet:Known', centeredViewMode: 'orbit' } as const
    expect(shouldStartObservedCentering(centered, 'observed-planet:Known', 'orbit')).toBe(false)
    expect(shouldStartObservedCentering(centered, 'observed-planet:Known', 'close')).toBe(true)
    expect(shouldStartObservedCentering(centered, 'observed-star:Known', 'orbit')).toBe(true)
  })

  it('clears observed selection without conflating it with camera centering', () => {
    expect(clearObservedSelectionState({
      mode: 'observed-system',
      activeHost: 'Known',
      activeSystemId: 'system-known',
      selectedObjectId: 'observed-planet:Known%20b',
      selectedHost: 'Known',
      centeredObjectId: 'observed-star:system-known',
      centeredViewMode: 'close',
      transitioning: true,
    })).toEqual({
      mode: 'observed-system',
      activeHost: 'Known',
      activeSystemId: 'system-known',
      selectedObjectId: null,
      selectedHost: null,
      centeredObjectId: 'observed-star:system-known',
      centeredViewMode: 'close',
      transitioning: true,
    })
  })
})
