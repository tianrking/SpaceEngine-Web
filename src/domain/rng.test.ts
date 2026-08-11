import { describe, expect, it } from 'vitest'
import { createSeededRng, hashSeed } from './rng'

describe('seeded RNG', () => {
  it('replays exactly for the same seed', () => {
    const first = createSeededRng('Asteria')
    const second = createSeededRng('Asteria')

    expect(Array.from({ length: 12 }, () => first.nextUint32())).toEqual(
      Array.from({ length: 12 }, () => second.nextUint32()),
    )
  })

  it('gives distinct streams to distinct typed seeds', () => {
    expect(hashSeed('42')).not.toBe(hashSeed(42))
    expect(createSeededRng('alpha').next()).not.toBe(createSeededRng('beta').next())
  })

  it('forks independently of parent consumption', () => {
    const parent = createSeededRng('catalogue')
    const before = parent.fork('terrain')
    parent.next()
    parent.next()
    const after = parent.fork('terrain')

    expect(before.shuffle([1, 2, 3, 4, 5])).toEqual(after.shuffle([1, 2, 3, 4, 5]))
  })

  it('keeps integer results inside half-open bounds', () => {
    const rng = createSeededRng(12345)
    const samples = Array.from({ length: 2_000 }, () => rng.integer(-3, 7))

    expect(Math.min(...samples)).toBe(-3)
    expect(Math.max(...samples)).toBe(6)
  })
})
