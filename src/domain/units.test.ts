import { describe, expect, it } from 'vitest'
import {
  ASTRONOMICAL_UNIT_METERS,
  LIGHT_YEAR_METERS,
  SPEED_OF_LIGHT_METERS_PER_SECOND,
} from './constants'
import { formatDistance, formatSpeed, selectDistanceUnit } from './units'

describe('astronomical unit formatting', () => {
  it('selects readable units across scale transitions', () => {
    expect(formatDistance(860)).toBe('860 m')
    expect(formatDistance(384_400_000)).toBe('384400 km')
    expect(formatDistance(ASTRONOMICAL_UNIT_METERS)).toBe('1 AU')
    expect(formatDistance(LIGHT_YEAR_METERS)).toBe('1 ly')
  })

  it('supports an explicit distance unit and precision', () => {
    expect(
      formatDistance(ASTRONOMICAL_UNIT_METERS * 1.23456, {
        unit: 'AU',
        maximumFractionDigits: 3,
      }),
    ).toBe('1.235 AU')
  })

  it('selects velocity units including fractions of light speed', () => {
    expect(formatSpeed(42)).toBe('42 m/s')
    expect(formatSpeed(29_780)).toBe('29.78 km/s')
    expect(formatSpeed(SPEED_OF_LIGHT_METERS_PER_SECOND * 0.25)).toBe('0.25 c')
  })

  it('uses magnitude when selecting a unit for negative coordinates', () => {
    expect(selectDistanceUnit(-ASTRONOMICAL_UNIT_METERS)).toBe('AU')
  })
})
