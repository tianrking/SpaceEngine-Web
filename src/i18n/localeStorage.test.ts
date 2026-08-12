import { describe, expect, it, vi } from 'vitest'
import {
  decodeStoredLocale,
  readStoredLocale,
  writeStoredLocale,
} from './localeStorage'

describe('locale preference storage', () => {
  it('defaults to English when no valid preference exists', () => {
    expect(readStoredLocale()).toBe('en')
    expect(decodeStoredLocale(null)).toBeNull()
    expect(decodeStoredLocale('{broken')).toBeNull()
    expect(decodeStoredLocale('{"version":2,"locale":"fr"}')).toBeNull()
    expect(decodeStoredLocale('{"version":1,"locale":"de"}')).toBeNull()
  })

  it.each(['en', 'es', 'zh-TW', 'fr'] as const)(
    'round-trips supported locale %s',
    (locale) => {
      const setItem = vi.fn()
      writeStoredLocale(locale, { setItem })
      const stored = setItem.mock.calls[0]?.[1] as string
      expect(decodeStoredLocale(stored)).toBe(locale)
      expect(readStoredLocale({ getItem: () => stored })).toBe(locale)
    },
  )

  it('fails open when storage is unavailable', () => {
    expect(
      readStoredLocale({
        getItem: () => {
          throw new Error('denied')
        },
      }),
    ).toBe('en')
    expect(() =>
      writeStoredLocale('fr', {
        setItem: () => {
          throw new Error('denied')
        },
      }),
    ).not.toThrow()
  })
})
