import { describe, expect, it } from 'vitest'
import { ASTERIA_SYSTEM } from './asteria'
import {
  ASTRONOMICAL_UNIT_METERS,
  GRAVITATIONAL_CONSTANT,
  IAU_NOMINAL_EARTH_EQUATORIAL_RADIUS_METERS,
  IAU_NOMINAL_EARTH_MASS_PARAMETER,
  IAU_NOMINAL_SOLAR_LUMINOSITY_WATTS,
  IAU_NOMINAL_SOLAR_MASS_PARAMETER,
  JULIAN_DAY_SECONDS,
  JULIAN_YEAR_SECONDS,
} from './constants'
import { orbitalPeriodSeconds } from './orbit'
import {
  apoapsisMeters,
  classifyConservativeHabitability,
  classifyTemperatureBand,
  conservativeHabitableZoneMeters,
  deriveBodyPhysics,
  deriveSystemPhysics,
  equilibriumTemperatureKelvin,
  escapeVelocityMetersPerSecond,
  meanDensityKgPerCubicMeter,
  meanOrbitalSpeedMetersPerSecond,
  periapsisMeters,
  stellarFluxWattsPerSquareMeter,
  surfaceGravityMetersPerSecondSquared,
  synodicPeriodSeconds,
} from './physics'
import type { KeplerOrbit } from './types'

const nominalEarthMass =
  IAU_NOMINAL_EARTH_MASS_PARAMETER / GRAVITATIONAL_CONSTANT

describe('physical scalar helpers', () => {
  it('derives nominal-Earth bulk density, gravity, and escape velocity', () => {
    expect(
      meanDensityKgPerCubicMeter(
        nominalEarthMass,
        IAU_NOMINAL_EARTH_EQUATORIAL_RADIUS_METERS,
      ),
    ).toBeCloseTo(5_495, 0)
    expect(
      surfaceGravityMetersPerSecondSquared(
        nominalEarthMass,
        IAU_NOMINAL_EARTH_EQUATORIAL_RADIUS_METERS,
      ),
    ).toBeCloseTo(9.798, 3)
    expect(
      escapeVelocityMetersPerSecond(
        nominalEarthMass,
        IAU_NOMINAL_EARTH_EQUATORIAL_RADIUS_METERS,
      ),
    ).toBeCloseTo(11_180, 0)
  })

  it('derives flux and uniformly redistributed equilibrium temperature', () => {
    const flux = stellarFluxWattsPerSquareMeter(
      IAU_NOMINAL_SOLAR_LUMINOSITY_WATTS,
      ASTRONOMICAL_UNIT_METERS,
    )

    expect(flux).toBeCloseTo(1_361.17, 1)
    expect(equilibriumTemperatureKelvin(flux, 0.3)).toBeCloseTo(254.6, 1)
  })

  it('computes ellipse endpoints and time-averaged orbital speed', () => {
    const solarMass = IAU_NOMINAL_SOLAR_MASS_PARAMETER / GRAVITATIONAL_CONSTANT
    const period = orbitalPeriodSeconds(ASTRONOMICAL_UNIT_METERS, solarMass)
    const orbit: KeplerOrbit = {
      semiMajorAxisMeters: ASTRONOMICAL_UNIT_METERS,
      eccentricity: 0.1,
      inclinationRadians: 0,
      longitudeOfAscendingNodeRadians: 0,
      argumentOfPeriapsisRadians: 0,
      meanAnomalyAtEpochRadians: 0,
      epochSeconds: 0,
      periodSeconds: period,
    }

    expect(periapsisMeters(orbit)).toBeCloseTo(ASTRONOMICAL_UNIT_METERS * 0.9, 2)
    expect(apoapsisMeters(orbit)).toBeCloseTo(ASTRONOMICAL_UNIT_METERS * 1.1, 2)
    expect(meanOrbitalSpeedMetersPerSecond(orbit)).toBeGreaterThan(29_600)
    expect(meanOrbitalSpeedMetersPerSecond(orbit)).toBeLessThan(29_900)
  })

  it('computes the Earth–Mars-like synodic period', () => {
    const synodicDays =
      synodicPeriodSeconds(
        JULIAN_YEAR_SECONDS,
        686.98 * JULIAN_DAY_SECONDS,
      ) / JULIAN_DAY_SECONDS

    expect(synodicDays).toBeCloseTo(779.9, 1)
    expect(synodicPeriodSeconds(10, 10)).toBe(Number.POSITIVE_INFINITY)
  })

  it('labels conservative HZ and temperature bands without claiming life', () => {
    const zone = conservativeHabitableZoneMeters(1)

    expect(zone.innerBoundaryMeters / ASTRONOMICAL_UNIT_METERS).toBeCloseTo(0.95, 2)
    expect(zone.outerBoundaryMeters / ASTRONOMICAL_UNIT_METERS).toBeCloseTo(1.68, 2)
    expect(classifyTemperatureBand(289)).toBe('temperate')
    expect(
      classifyConservativeHabitability({
        kind: 'planet',
        planetClass: 'ocean',
        withinConservativeHabitableZone: true,
        temperatureBand: 'temperate',
        surfacePressurePascals: 100_000,
      }),
    ).toBe('temperate-surface-candidate')
    expect(
      classifyConservativeHabitability({
        kind: 'planet',
        planetClass: 'gas-giant',
        withinConservativeHabitableZone: true,
        temperatureBand: 'temperate',
      }),
    ).toBe('non-surface-world')
  })

  it('rejects nonphysical scalar inputs', () => {
    expect(() => meanDensityKgPerCubicMeter(-1, 1)).toThrow(RangeError)
    expect(() => equilibriumTemperatureKelvin(1_000, 1.1)).toThrow(RangeError)
    expect(() => classifyTemperatureBand(0)).toThrow(RangeError)
  })
})

describe('system-aware physical derivation', () => {
  it('handles star, planet, moon, and unknown ids', () => {
    const star = deriveBodyPhysics(ASTERIA_SYSTEM, 'asteria')
    const pelagos = deriveBodyPhysics(ASTERIA_SYSTEM, 'pelagos')
    const neris = deriveBodyPhysics(ASTERIA_SYSTEM, 'pelagos-neris')

    expect(star?.habitabilityLabel).toBe('not-applicable')
    expect(star?.orbit).toBeUndefined()
    expect(pelagos?.habitabilityLabel).toBe('temperate-surface-candidate')
    expect(pelagos?.stellarEnvironment?.withinConservativeHabitableZone).toBe(true)
    expect(neris?.habitabilityLabel).toBe('within-conservative-habitable-zone')
    expect(neris?.stellarEnvironment?.stellarDistanceMeters).toBe(
      pelagos?.stellarEnvironment?.stellarDistanceMeters,
    )
    expect(deriveBodyPhysics(ASTERIA_SYSTEM, 'missing')).toBeUndefined()
  })

  it('labels giant planets as non-surface worlds', () => {
    const orison = deriveBodyPhysics(ASTERIA_SYSTEM, 'orison')
    const caelora = deriveBodyPhysics(ASTERIA_SYSTEM, 'caelora')

    expect(orison?.habitabilityLabel).toBe('non-surface-world')
    expect(caelora?.habitabilityLabel).toBe('non-surface-world')
    expect(orison?.meanDensityKgPerCubicMeter).toBeGreaterThan(800)
  })

  it('derives exactly one record per catalogue body', () => {
    const derived = deriveSystemPhysics(ASTERIA_SYSTEM)
    const expectedCount =
      1 +
      ASTERIA_SYSTEM.planets.length +
      ASTERIA_SYSTEM.planets.reduce(
        (total, planet) => total + planet.moons.length,
        0,
      )

    expect(derived).toHaveLength(expectedCount)
    expect(new Set(derived.map((entry) => entry.bodyId)).size).toBe(expectedCount)
  })
})
