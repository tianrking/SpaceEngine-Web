import { describe, expect, it } from 'vitest'
import {
  cameraRelativeHighLow,
  reconstructHighLow,
  splitFloat64,
  splitVector3,
} from './precision'

describe('GPU high/low precision helpers', () => {
  it('emits values representable as f32', () => {
    const split = splitFloat64(12_345_678_901.2345)

    expect(Math.fround(split.high)).toBe(split.high)
    expect(Math.fround(split.low)).toBe(split.low)
    expect(Math.abs(split.high + split.low - 12_345_678_901.2345)).toBeLessThan(0.001)
  })

  it('splits all vector components', () => {
    const split = splitVector3({ x: 1e12 + 0.25, y: -3e10 - 0.5, z: 7.75 })
    const reconstructed = reconstructHighLow(split)

    expect(reconstructed.x).toBeCloseTo(1e12 + 0.25, 3)
    expect(reconstructed.y).toBeCloseTo(-3e10 - 0.5, 3)
    expect(reconstructed.z).toBe(7.75)
  })

  it('preserves local offsets after a camera-relative transform', () => {
    const camera = { x: 1e16, y: -1e16, z: 4e15 }
    const world = { x: 1e16 + 4_096, y: -1e16 + 8_192, z: 4e15 - 2_048 }
    const reconstructed = reconstructHighLow(cameraRelativeHighLow(world, camera))

    expect(reconstructed).toEqual({ x: 4_096, y: 8_192, z: -2_048 })
  })
})
