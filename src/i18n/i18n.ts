import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  INTERFACE_NAMESPACES,
  loadLocalePack,
  type LocalePack,
} from './localeLoader'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type AppLocale } from './locale'
import { readStoredLocale, writeStoredLocale } from './localeStorage'
import { registerScienceNarratives } from './science'

function browserStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export interface LocaleActivationDependencies {
  readonly load: (locale: AppLocale) => Promise<LocalePack>
  readonly install: (pack: LocalePack) => void
  readonly change: (locale: AppLocale) => Promise<unknown>
  readonly persist: (locale: AppLocale) => void
}

export async function activateRuntimeLocale(
  locale: AppLocale,
  dependencies: LocaleActivationDependencies,
): Promise<boolean> {
  try {
    const pack = await dependencies.load(locale)
    dependencies.install(pack)
    await dependencies.change(pack.locale)
    dependencies.persist(pack.locale)
    return true
  } catch {
    return false
  }
}

void i18n.use(initReactI18next).init({
  resources: {},
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES,
  defaultNS: 'app',
  fallbackNS: 'app',
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
})

let initializationPromise: Promise<AppLocale> | undefined
let languageRequest = 0

function installLocalePack(pack: LocalePack): void {
  for (const namespace of INTERFACE_NAMESPACES) {
    i18n.addResourceBundle(
      pack.locale,
      namespace,
      pack.resources[namespace],
      true,
      true,
    )
  }
  registerScienceNarratives(pack.locale, pack.science)
}

async function loadWithEnglishFallback(locale: AppLocale): Promise<LocalePack> {
  try {
    return await loadLocalePack(locale)
  } catch (error: unknown) {
    if (locale === DEFAULT_LOCALE) throw error
    console.warn(`Unable to load locale ${locale}; falling back to English.`, error)
    return loadLocalePack(DEFAULT_LOCALE)
  }
}

async function activateLocale(locale: AppLocale, request: number): Promise<AppLocale> {
  const pack = await loadWithEnglishFallback(locale)
  installLocalePack(pack)
  if (request !== languageRequest) return pack.locale
  await i18n.changeLanguage(pack.locale)
  return pack.locale
}

async function activateRequestedLocale(
  locale: AppLocale,
  request: number,
): Promise<boolean> {
  return activateRuntimeLocale(locale, {
    load: loadLocalePack,
    install: installLocalePack,
    change: async (activeLocale) => {
      if (request !== languageRequest) return
      await i18n.changeLanguage(activeLocale)
    },
    persist: (activeLocale) => {
      if (request === languageRequest) {
        writeStoredLocale(activeLocale, browserStorage())
      }
    },
  })
}

/** Loads the stored locale before the React tree is mounted. */
export function initializeAppLocale(): Promise<AppLocale> {
  if (initializationPromise) return initializationPromise
  const requestedLocale = readStoredLocale(browserStorage())
  const request = ++languageRequest
  initializationPromise = activateLocale(requestedLocale, request).then(
    (activeLocale) => {
      if (activeLocale !== requestedLocale) {
        writeStoredLocale(activeLocale, browserStorage())
      }
      return activeLocale
    },
    (error: unknown) => {
      initializationPromise = undefined
      throw error
    },
  )
  return initializationPromise
}

/** Loads a locale on demand, then atomically persists and activates it. */
export async function setAppLocale(locale: AppLocale): Promise<void> {
  const request = ++languageRequest
  const activated = await activateRequestedLocale(locale, request)
  if (!activated) {
    if (request === languageRequest) {
      console.warn(`Unable to switch to locale ${locale}; keeping the current language.`)
    }
    return
  }
}

export { i18n }
