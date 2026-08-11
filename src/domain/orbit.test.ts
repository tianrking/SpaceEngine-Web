import { describe, expect, it } from 'vitest'
import {
  ASTRONOMICAL_UNIT_METERS,
  JULIAN_YEAR_SECONDS,
  SOLAR_MASS_KILOGRAMS,
} from './constants'
import {
  orbitalPeriodSeconds,
  orbitalStateAtTime,
  positionAtTime,
  solveEccentricAnomaly,
} from './orbit'
import type { KeplerOrbit } from './types'

const circularOrbit: KeplerOrbit = {
  semiMajorAxisMeters: 1_000,
  eccentricity: 0,
  inclinationRadians: 0,
  longitudeOfAscendingNodeRadians: 0,
  argumentOfPeriapsisRadians: 0,
  meanAnomalyAtEpochRadians: 0,
  epochSeconds: 0,
  periodSeconds: 100,
}

describe('Kepler orbital mechanics', () => {
  it('places a circular orbit at exact quarter-period quadrants', () => {
    const start = positionAtTime(circularOrbit, 0)
    const quarter = positionAtTime(circularOrbit, 25)

    expect(start.x).toBeCloseTo(1_000, 10)
    expect(start.y).toBeCloseTo(0, 10)
    expect(quarter.x).toBeCloseTo(0, 10)
    expect(quarter.y).toBeCloseTo(1_000, 10)
    expect(quarter.z).toBe(0)
  })

  it('returns a consistent circular velocity', () => {
    const state = orbitalStateAtTime(circularOrbit, 0)

    expect(state.radiusMeters).toBeCloseTo(1_000, 10)
    expect(state.velocityMetersPerSecond.x).toBeCloseTo(0, 10)
    expect(state.velocityMetersPerSecond.y).toBeCloseTo(20 * Math.PI, 10)
  })

  it('solves the elliptic Kepler equation to numerical tolerance', () => {
    const meanAnomaly = 2.1
    const eccentricity = 0.73
    const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, eccentricity)

    expect(
      eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly),
    ).toBeCloseTo(meanAnomaly, 12)
  })

  it('derives an Earth-like period around a solar mass', () => {
    const period = orbitalPeriodSeconds(
      ASTRONOMICAL_UNIT_METERS,
      SOLAR_MASS_KILOGRAMS,
    )

    expect(period / JULIAN_YEAR_SECONDS).toBeCloseTo(1, 3)
  })

  it('is periodic at arbitrarily selected epochs', () => {
    const orbit = { ...circularOrbit, epochSeconds: 44_000, periodSeconds: 137.5 }
    const first = positionAtTime(orbit, 44_019.25)
    const next = positionAtTime(orbit, 44_019.25 + orbit.periodSeconds)

    expect(next.x).toBeCloseTo(first.x, 9)
    expect(next.y).toBeCloseTo(first.y, 9)
    expect(next.z).toBeCloseTo(first.z, 9)
  })
})
