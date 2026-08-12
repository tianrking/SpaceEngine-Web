import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LOCALE_STORAGE_KEY, decodeStoredLocale } from './localeStorage'
import { localeOption } from './locale'
import { setAppLocale } from './i18n'

function setMetaContent(selector: string, content: string): void {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', content)
}

export function LocaleDocumentSync() {
  const { t, i18n } = useTranslation('app')
  const locale = localeOption(i18n.resolvedLanguage)

  useEffect(() => {
    document.documentElement.lang = locale.htmlLang
    document.documentElement.dir = 'ltr'
    document.title = t('meta.title')
    document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
      ?.setAttribute('href', locale.manifestHref)
    const description = t('meta.description')
    setMetaContent('meta[name="description"]', description)
    setMetaContent('meta[property="og:title"]', t('meta.title'))
    setMetaContent('meta[property="og:description"]', description)
    setMetaContent('meta[property="og:image:alt"]', t('meta.imageAlt'))
    setMetaContent('meta[property="og:locale"]', locale.ogLocale)
    setMetaContent('meta[name="twitter:title"]', t('meta.title'))
    setMetaContent('meta[name="twitter:description"]', description)
    setMetaContent('meta[name="twitter:image:alt"]', t('meta.imageAlt'))
  }, [locale.htmlLang, locale.manifestHref, locale.ogLocale, t])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LOCALE_STORAGE_KEY) return
      const nextLocale = decodeStoredLocale(event.newValue)
      if (nextLocale && nextLocale !== i18n.resolvedLanguage) {
        void setAppLocale(nextLocale)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [i18n])

  return null
}
