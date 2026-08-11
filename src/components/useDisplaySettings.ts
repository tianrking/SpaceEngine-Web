import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_DISPLAY_SETTINGS,
  normalizeDisplaySettings,
} from '../engine/displaySettings'
import type { DisplaySettings } from '../engine/types'

export const DISPLAY_SETTINGS_STORAGE_KEY = 'astral-surveyor.display-settings'
export const DISPLAY_SETTINGS_SCHEMA_VERSION = 1 as const

interface DisplaySettingsDocument {
  readonly version: typeof DISPLAY_SETTINGS_SCHEMA_VERSION
  readonly settings: DisplaySettings
}

export type DisplaySettingsPersistence = 'local' | 'memory'

interface DisplaySettingsState {
  readonly settings: DisplaySettings
  readonly persistence: DisplaySettingsPersistence
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function decodeDisplaySettings(rawValue: string | null): DisplaySettings {
  if (!rawValue) return DEFAULT_DISPLAY_SETTINGS

  try {
    const document: unknown = JSON.parse(rawValue)
    if (
      !isRecord(document) ||
      document.version !== DISPLAY_SETTINGS_SCHEMA_VERSION ||
      !isRecord(document.settings)
    ) {
      return DEFAULT_DISPLAY_SETTINGS
    }

    return normalizeDisplaySettings({
      exposure: finiteNumber(document.settings.exposure),
      orbitBrightness: finiteNumber(document.settings.orbitBrightness),
      starfieldBrightness: finiteNumber(document.settings.starfieldBrightness),
    })
  } catch {
    return DEFAULT_DISPLAY_SETTINGS
  }
}

export function encodeDisplaySettings(settings: DisplaySettings): string {
  const document: DisplaySettingsDocument = {
    version: DISPLAY_SETTINGS_SCHEMA_VERSION,
    settings: normalizeDisplaySettings(settings),
  }
  return JSON.stringify(document)
}

function readInitialState(): DisplaySettingsState {
  if (typeof window === 'undefined') {
    return { settings: DEFAULT_DISPLAY_SETTINGS, persistence: 'memory' }
  }

  try {
    return {
      settings: decodeDisplaySettings(
        window.localStorage.getItem(DISPLAY_SETTINGS_STORAGE_KEY),
      ),
      persistence: 'local',
    }
  } catch {
    return { settings: DEFAULT_DISPLAY_SETTINGS, persistence: 'memory' }
  }
}

export function useDisplaySettings() {
  const [state, setState] = useState<DisplaySettingsState>(readInitialState)
  const settingsRef = useRef(state.settings)

  const setDisplaySettings = useCallback((settings: DisplaySettings) => {
    const normalized = normalizeDisplaySettings(settings, settingsRef.current)
    settingsRef.current = normalized
    setState((current) => ({ ...current, settings: normalized }))
  }, [])

  const resetDisplaySettings = useCallback(() => {
    settingsRef.current = DEFAULT_DISPLAY_SETTINGS
    setState((current) => ({ ...current, settings: DEFAULT_DISPLAY_SETTINGS }))
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      let persistence: DisplaySettingsPersistence = 'memory'
      try {
        window.localStorage.setItem(
          DISPLAY_SETTINGS_STORAGE_KEY,
          encodeDisplaySettings(settingsRef.current),
        )
        persistence = 'local'
      } catch {
        // Storage policies can reject writes; the in-memory controls remain usable.
      }
      setState((current) =>
        current.persistence === persistence ? current : { ...current, persistence },
      )
    }, 120)

    return () => window.clearTimeout(timeout)
  }, [state.settings])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== DISPLAY_SETTINGS_STORAGE_KEY) return
      const settings = decodeDisplaySettings(event.newValue)
      settingsRef.current = settings
      setState({ settings, persistence: 'local' })
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return {
    displaySettings: state.settings,
    persistence: state.persistence,
    setDisplaySettings,
    resetDisplaySettings,
  }
}
