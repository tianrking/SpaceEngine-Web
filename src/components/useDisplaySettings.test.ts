import { describe, expect, it } from 'vitest'
import { DEFAULT_DISPLAY_SETTINGS } from '../engine/displaySettings'
import {
  decodeDisplaySettings,
  DISPLAY_SETTINGS_SCHEMA_VERSION,
  encodeDisplaySettings,
} from './useDisplaySettings'

describe('display settings persistence schema', () => {
  it('round-trips a versioned, minimal document', () => {
    const settings = {
      exposure: 1.24,
      orbitBrightness: 1.5,
      starfieldBrightness: 0.8,
    }

    const encoded = encodeDisplaySettings(settings)

    expect(JSON.parse(encoded)).toEqual({
      version: DISPLAY_SETTINGS_SCHEMA_VERSION,
      settings,
    })
    expect(decodeDisplaySettings(encoded)).toEqual(settings)
  })

  it('rejects unsupported versions and malformed JSON', () => {
    expect(
      decodeDisplaySettings(JSON.stringify({ version: 99, settings: {} })),
    ).toEqual(DEFAULT_DISPLAY_SETTINGS)
    expect(decodeDisplaySettings('{not-json')).toEqual(DEFAULT_DISPLAY_SETTINGS)
  })

  it('clamps finite values and replaces malformed fields with defaults', () => {
    expect(
      decodeDisplaySettings(
        JSON.stringify({
          version: DISPLAY_SETTINGS_SCHEMA_VERSION,
          settings: {
            exposure: 99,
            orbitBrightness: -1,
            starfieldBrightness: 'bright',
          },
        }),
      ),
    ).toEqual({
      exposure: 2.2,
      orbitBrightness: 0,
      starfieldBrightness: DEFAULT_DISPLAY_SETTINGS.starfieldBrightness,
    })
  })
})
