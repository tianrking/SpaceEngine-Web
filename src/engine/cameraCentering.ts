import type { CameraCenterState, CameraViewMode } from './types'

export type BodyCameraViewMode = Exclude<CameraViewMode, 'system'>

export interface CameraPoint {
  readonly x: number
  readonly y: number
  readonly z: number
}

const MINIMUM_ABSOLUTE_DISTANCE = 0.025
const MINIMUM_RADIUS_FACTOR = 1.22
const CLOSE_RADIUS_FACTOR = 1.7
const ORBIT_RADIUS_FACTOR = 4.2

function assertVisualRadius(visualRadius: number): void {
  if (!Number.isFinite(visualRadius) || visualRadius <= 0) {
    throw new RangeError('Visual radius must be positive and finite')
  }
}

export function minimumCameraDistance(visualRadius: number): number {
  assertVisualRadius(visualRadius)
  return Math.max(visualRadius * MINIMUM_RADIUS_FACTOR, MINIMUM_ABSOLUTE_DISTANCE)
}

export function enclosingVisualRadius(
  renderRadius: number,
  ringOuterRatio: number | null = null,
): number {
  assertVisualRadius(renderRadius)
  if (ringOuterRatio === null) return renderRadius
  if (!Number.isFinite(ringOuterRatio) || ringOuterRatio <= 0) {
    throw new RangeError('Ring outer ratio must be positive and finite')
  }
  return renderRadius * Math.max(ringOuterRatio, 1)
}

export function cameraDistanceForMode(
  visualRadius: number,
  mode: BodyCameraViewMode,
): number {
  assertVisualRadius(visualRadius)
  const factor = mode === 'close' ? CLOSE_RADIUS_FACTOR : ORBIT_RADIUS_FACTOR
  return Math.max(visualRadius * factor, minimumCameraDistance(visualRadius))
}

export function trackingTranslation(
  previousCenter: CameraPoint,
  currentCenter: CameraPoint,
): CameraPoint {
  return {
    x: currentCenter.x - previousCenter.x,
    y: currentCenter.y - previousCenter.y,
    z: currentCenter.z - previousCenter.z,
  }
}

export function smoothFlightProgress(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(elapsedMs)) return elapsedMs > 0 ? 1 : 0
  if (!Number.isFinite(durationMs) || durationMs <= 0) return elapsedMs >= 0 ? 1 : 0
  const progress = Math.min(Math.max(elapsedMs / durationMs, 0), 1)
  return progress * progress * (3 - 2 * progress)
}

export function beginBodyCentering(
  bodyId: string,
  mode: BodyCameraViewMode,
  canReturn: boolean,
): CameraCenterState {
  if (bodyId.length === 0) throw new TypeError('Centered body id must not be empty')
  return { mode, bodyId, transitioning: true, canReturn }
}

export function beginSystemOverview(canReturn: boolean): CameraCenterState {
  return { mode: 'system', bodyId: null, transitioning: true, canReturn }
}

export function completeCameraCentering(
  state: CameraCenterState,
): CameraCenterState {
  return state.transitioning ? { ...state, transitioning: false } : state
}

export function appendBoundedCameraHistory<T>(
  history: readonly T[],
  view: T,
  limit = 8,
): readonly T[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('Camera history limit must be a positive integer')
  }
  return [...history, view].slice(-limit)
}

export function shouldPushCameraHistory(
  current: CameraCenterState,
  nextBodyId: string | null,
  nextMode: CameraViewMode,
): boolean {
  return !(
    !current.transitioning &&
    current.bodyId === nextBodyId &&
    current.mode === nextMode
  )
}

/** Manual input commits the current pose as a free system-frame view without moving it. */
export function interruptCameraCentering(
  state: CameraCenterState,
  canReturn: boolean,
): CameraCenterState {
  return state.transitioning
    ? { mode: 'system', bodyId: null, transitioning: false, canReturn }
    : state
}
