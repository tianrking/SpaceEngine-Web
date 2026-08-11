export type Seed = string | number | bigint

export interface SeededRng {
  readonly seed: string
  /** Uniform floating point sample in [0, 1). */
  next(): number
  nextUint32(): number
  range(minInclusive: number, maxExclusive: number): number
  integer(minInclusive: number, maxExclusive: number): number
  chance(probability: number): boolean
  pick<T>(values: readonly T[]): T
  shuffle<T>(values: readonly T[]): T[]
  /** Creates a stable child stream without consuming the parent stream. */
  fork(label: Seed): SeededRng
}

const UINT32_RANGE = 0x1_0000_0000

function canonicalSeed(seed: Seed): string {
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) {
      throw new RangeError('Numeric seeds must be finite')
    }
    return `number:${Object.is(seed, -0) ? '-0' : String(seed)}`
  }

  return `${typeof seed}:${String(seed)}`
}

/** xmur3-style 32-bit string hash. */
export function hashSeed(seed: Seed): number {
  const value = canonicalSeed(seed)
  let hash = 1_779_033_703 ^ value.length

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3_432_918_353)
    hash = (hash << 13) | (hash >>> 19)
  }

  hash = Math.imul(hash ^ (hash >>> 16), 2_246_822_507)
  hash = Math.imul(hash ^ (hash >>> 13), 3_266_489_909)
  return (hash ^ (hash >>> 16)) >>> 0
}

/**
 * Small, deterministic PRNG intended for content generation, not cryptography.
 * The implementation uses a Mulberry32 state transition and is stable across JS engines.
 */
export function createSeededRng(seed: Seed): SeededRng {
  const normalizedSeed = canonicalSeed(seed)
  let state = hashSeed(normalizedSeed)

  const nextUint32 = (): number => {
    state = (state + 0x6d2b_79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return (mixed ^ (mixed >>> 14)) >>> 0
  }

  const next = (): number => nextUint32() / UINT32_RANGE

  return {
    seed: normalizedSeed,
    next,
    nextUint32,
    range(minInclusive, maxExclusive) {
      if (
        !Number.isFinite(minInclusive) ||
        !Number.isFinite(maxExclusive) ||
        maxExclusive <= minInclusive
      ) {
        throw new RangeError('range requires finite bounds with max > min')
      }
      return minInclusive + next() * (maxExclusive - minInclusive)
    },
    integer(minInclusive, maxExclusive) {
      if (
        !Number.isSafeInteger(minInclusive) ||
        !Number.isSafeInteger(maxExclusive) ||
        maxExclusive <= minInclusive
      ) {
        throw new RangeError('integer requires safe integer bounds with max > min')
      }

      const span = maxExclusive - minInclusive
      if (span > UINT32_RANGE) {
        throw new RangeError('integer range cannot exceed 2^32')
      }

      const rejectionLimit = UINT32_RANGE - (UINT32_RANGE % span)
      let sample = nextUint32()
      while (sample >= rejectionLimit) sample = nextUint32()
      return minInclusive + (sample % span)
    },
    chance(probability) {
      if (probability < 0 || probability > 1 || !Number.isFinite(probability)) {
        throw new RangeError('chance probability must be between 0 and 1')
      }
      return next() < probability
    },
    pick<T>(values: readonly T[]): T {
      if (values.length === 0) throw new RangeError('Cannot pick from an empty array')
      return values[Math.floor(next() * values.length)] as T
    },
    shuffle<T>(values: readonly T[]): T[] {
      const result = [...values]
      for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(next() * (index + 1))
        const previous = result[index] as T
        result[index] = result[swapIndex] as T
        result[swapIndex] = previous
      }
      return result
    },
    fork(label) {
      return createSeededRng(`${normalizedSeed}/fork/${canonicalSeed(label)}`)
    },
  }
}
