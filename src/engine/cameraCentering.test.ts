import { describe, expect, it } from 'vitest'
import {
  appendBoundedCameraHistory,
  beginBodyCentering,
  beginFreeCameraFrame,
  beginSystemOverview,
  cameraDistanceForMode,
  cameraLodReferenceId,
  completeCameraCentering,
  enclosingVisualRadius,
  minimumCameraDistance,
  recoverInterruptedRestoreTarget,
  interruptCameraCentering,
  shouldPushCameraHistory,
  shouldPushRedirectedCameraHistory,
  smoothFlightProgress,
  shouldPreserveBodyScale,
  trackingTranslation,
} from './cameraCentering'

describe('camera centering state and geometry', () => {
  it('derives safe close and orbit distances from every visual radius', () => {
    for (const radius of [0.18, 1, 3.4]) {
      const minimum = minimumCameraDistance(radius)
      const close = cameraDistanceForMode(radius, 'close')
      const orbit = cameraDistanceForMode(radius, 'orbit')
      expect(minimum).toBeGreaterThan(radius)
      expect(close).toBeGreaterThanOrEqual(minimum)
      expect(orbit).toBeGreaterThan(close)
    }
    expect(() => cameraDistanceForMode(0, 'orbit')).toThrow(/Visual radius/)
  })

  it('frames ring systems by their outer edge rather than the planet surface', () => {
    const planetRadius = 2.4
    const ringedRadius = enclosingVisualRadius(planetRadius, 2.35)
    expect(ringedRadius).toBeCloseTo(5.64)
    expect(cameraDistanceForMode(ringedRadius, 'close')).toBeGreaterThan(ringedRadius)
    expect(minimumCameraDistance(ringedRadius)).toBeGreaterThan(ringedRadius)
    expect(enclosingVisualRadius(planetRadius)).toBe(planetRadius)
  })

  it('preserves a relative camera pose by applying body-center translation', () => {
    const delta = trackingTranslation(
      { x: 12, y: -4, z: 8 },
      { x: 18.5, y: -1, z: -2 },
    )
    expect(delta).toEqual({ x: 6.5, y: 3, z: -10 })
  })

  it('uses bounded smoothstep transition progress', () => {
    expect(smoothFlightProgress(-20, 1_000)).toBe(0)
    expect(smoothFlightProgress(0, 1_000)).toBe(0)
    expect(smoothFlightProgress(500, 1_000)).toBeCloseTo(0.5)
    expect(smoothFlightProgress(1_000, 1_000)).toBe(1)
    expect(smoothFlightProgress(5_000, 1_000)).toBe(1)
  })

  it('transitions between body-centered and system states explicitly', () => {
    const orbiting = beginBodyCentering('pelagos-neris', 'orbit', true)
    expect(orbiting).toEqual({
      mode: 'orbit',
      bodyId: 'pelagos-neris',
      transitioning: true,
      canReturn: true,
    })
    expect(completeCameraCentering(orbiting).transitioning).toBe(false)
    expect(beginSystemOverview(false)).toEqual({
      mode: 'system',
      bodyId: null,
      transitioning: true,
      canReturn: false,
    })
    expect(beginFreeCameraFrame(true)).toEqual({
      mode: 'free',
      bodyId: null,
      transitioning: false,
      canReturn: true,
    })
  })

  it('retains a bounded stack of immediately previous views', () => {
    let history: readonly number[] = []
    for (let view = 1; view <= 12; view += 1) {
      history = appendBoundedCameraHistory(history, view, 8)
    }
    expect(history).toEqual([5, 6, 7, 8, 9, 10, 11, 12])
    expect(() => appendBoundedCameraHistory(history, 13, 0)).toThrow(/history limit/)
  })

  it('does not duplicate completed same-view history entries', () => {
    const current = {
      mode: 'orbit' as const,
      bodyId: 'orison',
      transitioning: false,
      canReturn: true,
    }
    expect(shouldPushCameraHistory(current, 'orison', 'orbit')).toBe(false)
    expect(shouldPushCameraHistory(current, 'orison', 'close')).toBe(true)
    expect(shouldPushCameraHistory({ ...current, transitioning: true }, 'orison', 'orbit')).toBe(true)
  })

  it('interrupts a transition as a stationary free view', () => {
    expect(
      interruptCameraCentering(
        { mode: 'close', bodyId: 'ione', transitioning: true, canReturn: true },
        true,
      ),
    ).toEqual({ mode: 'free', bodyId: null, transitioning: false, canReturn: true })
  })

  it('preserves free and system as distinct null-body frames', () => {
    const free = beginFreeCameraFrame(false, true)
    const system = beginSystemOverview(false)
    expect(free.bodyId).toBeNull()
    expect(system.bodyId).toBeNull()
    expect(free.mode).toBe('free')
    expect(system.mode).toBe('system')
    expect(completeCameraCentering(free)).toEqual({
      mode: 'free',
      bodyId: null,
      transitioning: false,
      canReturn: false,
    })
  })

  it('redirects an active flight without recording a ghost history entry', () => {
    const transitioning = beginBodyCentering('pelagos', 'orbit', true)
    expect(
      shouldPushRedirectedCameraHistory(true, transitioning, 'ione', 'orbit'),
    ).toBe(false)
    const interruptedFree = interruptCameraCentering(transitioning, true)
    expect(
      shouldPushRedirectedCameraHistory(false, interruptedFree, 'ione', 'orbit'),
    ).toBe(true)
  })

  it('keeps centered and selected bodies distinct for visual LOD', () => {
    expect(cameraLodReferenceId('orison', 'nyx')).toBe('orison')
    expect(cameraLodReferenceId(null, 'nyx')).toBe('nyx')
    expect(shouldPreserveBodyScale('orison', 'orison', 'nyx')).toBe(true)
    expect(shouldPreserveBodyScale('nyx', 'orison', 'nyx')).toBe(true)
    expect(shouldPreserveBodyScale('cinder', 'orison', 'nyx')).toBe(false)
  })

  it('recovers a cancelled restore target unless Back explicitly consumes it', () => {
    const older = ['system', 'pelagos']
    expect(
      recoverInterruptedRestoreTarget(older, 'ione', false, 8),
    ).toEqual(['system', 'pelagos', 'ione'])
    expect(
      recoverInterruptedRestoreTarget(older, 'ione', true, 8),
    ).toEqual(older)
    expect(recoverInterruptedRestoreTarget(older, null, false, 8)).toEqual(older)
  })
})
