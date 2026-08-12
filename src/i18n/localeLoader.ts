import type { Resource } from 'i18next'
import type { AppLocale } from './locale'
import { LOCALE_PACK_VERSION, LOCALE_RUNTIME_CACHE } from './localePackVersion'

export { LOCALE_PACK_VERSION, LOCALE_RUNTIME_CACHE }
export const INTERFACE_NAMESPACES = ['app', 'hud', 'nasa', 'tools'] as const

export type InterfaceNamespace = (typeof INTERFACE_NAMESPACES)[number]

export interface ScienceNarrativeResource {
  readonly description: string
  readonly facts: readonly string[]
}

export interface LocalePack {
  readonly version: typeof LOCALE_PACK_VERSION
  readonly locale: AppLocale
  readonly resources: Readonly<Record<InterfaceNamespace, Resource>>
  readonly science: Readonly<Record<string, ScienceNarrativeResource>>
}

const packPromises = new Map<AppLocale, Promise<LocalePack>>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTranslationTree(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (!isRecord(value)) return false
  const entries = Object.values(value)
  return entries.length > 0 && entries.every(isTranslationTree)
}

function isScienceNarrative(value: unknown): value is ScienceNarrativeResource {
  if (!isRecord(value)) return false
  return (
    typeof value.description === 'string' &&
    value.description.trim().length > 0 &&
    Array.isArray(value.facts) &&
    value.facts.every(
      (fact) => typeof fact === 'string' && fact.trim().length > 0,
    )
  )
}

export function validateLocalePack(
  value: unknown,
  expectedLocale: AppLocale,
): LocalePack {
  if (!isRecord(value)) throw new TypeError('Locale pack must be an object')
  if (value.version !== LOCALE_PACK_VERSION) {
    throw new TypeError(`Unsupported locale pack version for ${expectedLocale}`)
  }
  if (value.locale !== expectedLocale) {
    throw new TypeError(`Locale pack identity mismatch for ${expectedLocale}`)
  }
  if (!isRecord(value.resources)) {
    throw new TypeError(`Locale pack resources are missing for ${expectedLocale}`)
  }
  const resourceKeys = Object.keys(value.resources).toSorted()
  if (resourceKeys.join('\0') !== [...INTERFACE_NAMESPACES].toSorted().join('\0')) {
    throw new TypeError(`Locale pack namespaces are invalid for ${expectedLocale}`)
  }
  for (const namespace of INTERFACE_NAMESPACES) {
    if (!isTranslationTree(value.resources[namespace])) {
      throw new TypeError(
        `Locale pack namespace ${namespace} is invalid for ${expectedLocale}`,
      )
    }
  }
  if (!isRecord(value.science)) {
    throw new TypeError(`Locale pack science narratives are missing for ${expectedLocale}`)
  }
  const scienceNarratives = Object.values(value.science)
  if (
    scienceNarratives.length === 0 ||
    !scienceNarratives.every(isScienceNarrative)
  ) {
    throw new TypeError(`Locale pack science narratives are invalid for ${expectedLocale}`)
  }

  return value as unknown as LocalePack
}

async function loadAuthoredPack(locale: AppLocale): Promise<LocalePack> {
  const [app, hud, nasa, tools, science] = await Promise.all([
    import('./namespaces/app'),
    import('./namespaces/hud'),
    import('./namespaces/nasa'),
    import('./namespaces/tools'),
    import('./namespaces/science'),
  ])
  return validateLocalePack(
    {
      version: LOCALE_PACK_VERSION,
      locale,
      resources: {
        app: app.appResources[locale],
        hud: hud.hudResources[locale],
        nasa: nasa.nasaResources[locale],
        tools: tools.toolsResources[locale],
      },
      science: science.scienceResources[locale],
    },
    locale,
  )
}

function localePackUrl(locale: AppLocale): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}locales/${encodeURIComponent(locale)}.json`
}

async function fetchLocalePack(locale: AppLocale): Promise<LocalePack> {
  const url = localePackUrl(locale)
  const response = await fetch(url, {
    cache: 'no-cache',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Locale pack ${locale} returned HTTP ${response.status}`)
  }
  const cacheResponse = response.clone()
  const value = await response.json()
  const pack = validateLocalePack(value, locale)

  // Locale bootstrap precedes service-worker registration. Seed CacheStorage here
  // so the selected pack is available on the very next offline launch.
  if ('caches' in globalThis) {
    try {
      const cache = await caches.open(LOCALE_RUNTIME_CACHE)
      await cache.put(url, cacheResponse)
    } catch {
      // Storage quotas and private-mode policy must not block a valid locale.
    }
  }

  return pack
}

function requestLocalePack(locale: AppLocale): Promise<LocalePack> {
  if (import.meta.env.MODE === 'test') return loadAuthoredPack(locale)
  return fetchLocalePack(locale)
}

/** Loads and validates one locale, deduplicating concurrent requests. */
export function loadLocalePack(locale: AppLocale): Promise<LocalePack> {
  const cached = packPromises.get(locale)
  if (cached) return cached

  const pending = requestLocalePack(locale).catch((error: unknown) => {
    packPromises.delete(locale)
    throw error
  })
  packPromises.set(locale, pending)
  return pending
}

export function clearLocalePackRequestForTests(locale: AppLocale): void {
  if (import.meta.env.MODE === 'test') packPromises.delete(locale)
}
