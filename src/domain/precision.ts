import type { Vector3 } from './types'

export interface HighLowScalar {
  readonly high: number
  readonly low: number
}

export interface HighLowVector3 {
  readonly high: Vector3
  readonly low: Vector3
}

/** Encodes an f64 as two exactly f32-representable values for GPU reconstruction. */
export function splitFloat64(value: number): HighLowScalar {
  if (!Number.isFinite(value)) throw new RangeError('Cannot split a non-finite value')
  const high = Math.fround(value)
  return { high, low: Math.fround(value - high) }
}

export function splitVector3(vector: Vector3): HighLowVector3 {
  const x = splitFloat64(vector.x)
  const y = splitFloat64(vector.y)
  const z = splitFloat64(vector.z)

  return {
    high: { x: x.high, y: y.high, z: z.high },
    low: { x: x.low, y: y.low, z: z.low },
  }
}

export function subtractVector3(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  }
}

/**
 * CPU camera-relative transform followed by high/low encoding. Feed both vectors
 * as vec3<f32> and reconstruct with `relativeHigh + relativeLow` in WGSL/GLSL.
 */
export function cameraRelativeHighLow(
  worldPosition: Vector3,
  cameraWorldPosition: Vector3,
): HighLowVector3 {
  return splitVector3(subtractVector3(worldPosition, cameraWorldPosition))
}

export function reconstructHighLow(value: HighLowVector3): Vector3 {
  return {
    x: value.high.x + value.low.x,
    y: value.high.y + value.low.y,
    z: value.high.z + value.low.z,
  }
}
