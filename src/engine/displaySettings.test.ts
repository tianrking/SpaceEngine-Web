import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTING_RANGES,
  deriveVisualCalibration,
  normalizeDisplaySettings,
} from './displaySettings'

describe('display settings normalization', () => {
  it('publishes stable product defaults and UI ranges', () => {
    expect(DEFAULT_DISPLAY_SETTINGS).toEqual({
      exposure: 1.08,
      orbitBrightness: 1,
      starfieldBrightness: 1,
    })
    expect(DISPLAY_SETTING_RANGES.exposure).toEqual({ min: 0.4, max: 2.2, step: 0.01 })
    expect(DISPLAY_SETTING_RANGES.orbitBrightness.min).toBe(0)
    expect(DISPLAY_SETTING_RANGES.starfieldBrightness.min).toBe(0)
    expect(Object.isFrozen(DEFAULT_DISPLAY_SETTINGS)).toBe(true)
    expect(Object.isFrozen(DISPLAY_SETTING_RANGES.exposure)).toBe(true)
  })

  it('merges partial updates without mutating the baseline', () => {
    const baseline = {
      exposure: 0.9,
      orbitBrightness: 0.8,
      starfieldBrightness: 1.2,
    }

    expect(normalizeDisplaySettings({ orbitBrightness: 1.45 }, baseline)).toEqual({
      exposure: 0.9,
      orbitBrightness: 1.45,
      starfieldBrightness: 1.2,
    })
    expect(baseline).toEqual({
      exposure: 0.9,
      orbitBrightness: 0.8,
      starfieldBrightness: 1.2,
    })
  })

  it('clamps out-of-range and infinite values while ignoring NaN', () => {
    expect(
      normalizeDisplaySettings({
        exposure: Number.POSITIVE_INFINITY,
        orbitBrightness: -10,
        starfieldBrightness: Number.NaN,
      }),
    ).toEqual({
      exposure: DISPLAY_SETTING_RANGES.exposure.max,
      orbitBrightness: DISPLAY_SETTING_RANGES.orbitBrightness.min,
      starfieldBrightness: DEFAULT_DISPLAY_SETTINGS.starfieldBrightness,
    })
  })

  it('derives mutable material intensity and bounded opacity', () => {
    expect(deriveVisualCalibration(1, 0.15)).toEqual({
      colorIntensity: 1,
      opacity: 0.15,
    })
    expect(deriveVisualCalibration(2.5, 0.5)).toEqual({
      colorIntensity: 2.5,
      opacity: 1,
    })
    expect(deriveVisualCalibration(-1, 0.8)).toEqual({
      colorIntensity: 0,
      opacity: 0,
    })
  })
})
