import type {
  DisplaySettingRange,
  DisplaySettings,
  VisualCalibration,
} from './types'

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = Object.freeze({
  exposure: 1.08,
  orbitBrightness: 1,
  starfieldBrightness: 1,
})

export const DISPLAY_SETTING_RANGES: Readonly<
  Record<keyof DisplaySettings, DisplaySettingRange>
> = Object.freeze({
  exposure: Object.freeze({ min: 0.4, max: 2.2, step: 0.01 }),
  orbitBrightness: Object.freeze({ min: 0, max: 2.5, step: 0.05 }),
  starfieldBrightness: Object.freeze({ min: 0, max: 2, step: 0.05 }),
})

function clampSetting(
  candidate: number | undefined,
  fallback: number,
  range: DisplaySettingRange,
): number {
  if (candidate === undefined || Number.isNaN(candidate)) return fallback
  return Math.min(Math.max(candidate, range.min), range.max)
}

/**
 * Merges a partial update into a known-good baseline and clamps every value.
 * NaN is ignored so a malformed slider event cannot poison renderer state.
 */
export function normalizeDisplaySettings(
  update: Partial<DisplaySettings>,
  baseline: DisplaySettings = DEFAULT_DISPLAY_SETTINGS,
): DisplaySettings {
  return {
    exposure: clampSetting(
      update.exposure,
      baseline.exposure,
      DISPLAY_SETTING_RANGES.exposure,
    ),
    orbitBrightness: clampSetting(
      update.orbitBrightness,
      baseline.orbitBrightness,
      DISPLAY_SETTING_RANGES.orbitBrightness,
    ),
    starfieldBrightness: clampSetting(
      update.starfieldBrightness,
      baseline.starfieldBrightness,
      DISPLAY_SETTING_RANGES.starfieldBrightness,
    ),
  }
}

/** Maps one brightness control to mutable material color/opacity values. */
export function deriveVisualCalibration(
  brightness: number,
  baseOpacity: number,
): VisualCalibration {
  return {
    colorIntensity: Math.max(brightness, 0),
    opacity: Math.min(Math.max(baseOpacity * brightness, 0), 1),
  }
}
