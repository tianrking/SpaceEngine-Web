export const SUPPORTED_LOCALES = ['en', 'es', 'zh-TW', 'fr'] as const

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export interface LocaleOption {
  readonly code: AppLocale
  readonly label: string
  readonly htmlLang: string
  readonly intlLocale: string
  readonly ogLocale: string
  readonly manifestHref: string
}

export const DEFAULT_LOCALE: AppLocale = 'en'

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: 'en', label: 'English', htmlLang: 'en', intlLocale: 'en-US', ogLocale: 'en_US', manifestHref: '/site.webmanifest' },
  { code: 'es', label: 'Español', htmlLang: 'es', intlLocale: 'es-ES', ogLocale: 'es_ES', manifestHref: '/site.es.webmanifest' },
  {
    code: 'zh-TW',
    label: '繁體中文',
    htmlLang: 'zh-Hant',
    intlLocale: 'zh-Hant-TW',
    ogLocale: 'zh_TW',
    manifestHref: '/site.zh-TW.webmanifest',
  },
  { code: 'fr', label: 'Français', htmlLang: 'fr', intlLocale: 'fr-FR', ogLocale: 'fr_FR', manifestHref: '/site.fr.webmanifest' },
] as const

const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES)
const OPTION_LOOKUP = new Map(
  LOCALE_OPTIONS.map((option) => [option.code, option]),
)

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && LOCALE_SET.has(value)
}

export function localeOption(locale: string | undefined): LocaleOption {
  return OPTION_LOOKUP.get(isAppLocale(locale) ? locale : DEFAULT_LOCALE) ?? LOCALE_OPTIONS[0]
}
