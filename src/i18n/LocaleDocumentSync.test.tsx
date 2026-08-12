// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocaleDocumentSync } from './LocaleDocumentSync'
import { i18n, setAppLocale } from './i18n'
import { LOCALE_STORAGE_KEY } from './localeStorage'

function metaContent(selector: string): string | null | undefined {
  return document.querySelector<HTMLMetaElement>(selector)?.getAttribute('content')
}

describe('locale document synchronization', () => {
  beforeEach(async () => {
    localStorage.clear()
    document.head.innerHTML = `
      <link rel="manifest" href="/site.webmanifest">
      <meta name="description" content="">
      <meta property="og:title" content="">
      <meta property="og:description" content="">
      <meta property="og:image:alt" content="">
      <meta property="og:locale" content="en_US">
      <meta name="twitter:title" content="">
      <meta name="twitter:description" content="">
      <meta name="twitter:image:alt" content="">
    `
    await setAppLocale('en')
  })

  afterEach(async () => {
    cleanup()
    localStorage.clear()
    await setAppLocale('en')
  })

  it('updates document language, title, and social metadata', async () => {
    render(<LocaleDocumentSync />)
    await setAppLocale('zh-TW')

    await waitFor(() => expect(document.documentElement.lang).toBe('zh-Hant'))
    expect(document.documentElement.dir).toBe('ltr')
    expect(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href')).toBe('/site.zh-TW.webmanifest')
    expect(document.title).toBe(i18n.t('meta.title', { ns: 'app' }))
    expect(metaContent('meta[name="description"]')).toBe(
      i18n.t('meta.description', { ns: 'app' }),
    )
    expect(metaContent('meta[property="og:title"]')).toBe(document.title)
    expect(metaContent('meta[property="og:description"]')).toBe(
      i18n.t('meta.description', { ns: 'app' }),
    )
    expect(metaContent('meta[property="og:image:alt"]')).toBe(
      i18n.t('meta.imageAlt', { ns: 'app' }),
    )
    expect(metaContent('meta[property="og:locale"]')).toBe('zh_TW')
    expect(metaContent('meta[name="twitter:title"]')).toBe(document.title)
    expect(metaContent('meta[name="twitter:description"]')).toBe(
      i18n.t('meta.description', { ns: 'app' }),
    )
    expect(metaContent('meta[name="twitter:image:alt"]')).toBe(
      i18n.t('meta.imageAlt', { ns: 'app' }),
    )
  })

  it('applies a valid locale preference changed in another tab', async () => {
    render(<LocaleDocumentSync />)

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: LOCALE_STORAGE_KEY,
        newValue: JSON.stringify({ version: 1, locale: 'es' }),
      }),
    )

    await waitFor(() => expect(i18n.resolvedLanguage).toBe('es'))
    expect(document.documentElement.lang).toBe('es')
  })
})
