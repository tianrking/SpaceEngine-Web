import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from './locale'

const LOCALE_STORAGE_KEY = 'astral-surveyor.locale'
const LOCALE_STORAGE_VERSION = 1

interface StoredLocalePreference {
  readonly version: typeof LOCALE_STORAGE_VERSION
  readonly locale: AppLocale
}

export function decodeStoredLocale(value: string | null): AppLocale | null {
  if (value === null) return null
  try {
    const parsed = JSON.parse(value) as Partial<StoredLocalePreference>
    return parsed.version === LOCALE_STORAGE_VERSION && isAppLocale(parsed.locale)
      ? parsed.locale
      : null
  } catch {
    return null
  }
}

export function readStoredLocale(storage?: Pick<Storage, 'getItem'>): AppLocale {
  if (!storage) return DEFAULT_LOCALE
  try {
    return decodeStoredLocale(storage.getItem(LOCALE_STORAGE_KEY)) ?? DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

export function writeStoredLocale(
  locale: AppLocale,
  storage?: Pick<Storage, 'setItem'>,
): void {
  if (!storage) return
  try {
    const preference: StoredLocalePreference = {
      version: LOCALE_STORAGE_VERSION,
      locale,
    }
    storage.setItem(LOCALE_STORAGE_KEY, JSON.stringify(preference))
  } catch {
    // Language switching must remain usable when storage is unavailable.
  }
}

export { LOCALE_STORAGE_KEY, LOCALE_STORAGE_VERSION }
