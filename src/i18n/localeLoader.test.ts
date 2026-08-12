import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { INTERFACE_NAMESPACES, loadLocalePack, validateLocalePack } from './localeLoader'
import { SUPPORTED_LOCALES } from './locale'

describe('lazy locale packs', () => {
  it('deduplicates the first concurrent request for an unloaded locale', async () => {
    const first = loadLocalePack('fr')
    const second = loadLocalePack('fr')
    expect(second).toBe(first)
    await first
  })

  it('loads and validates every authored test-mode pack', async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const pack = await loadLocalePack(locale)
      expect(pack.locale).toBe(locale)
      expect(Object.keys(pack.resources).toSorted()).toEqual(
        [...INTERFACE_NAMESPACES].toSorted(),
      )
      expect(Object.keys(pack.science)).toHaveLength(27)
    }
  })

  it('rejects mismatched and structurally incomplete packs', () => {
    expect(() =>
      validateLocalePack(
        { version: 1, locale: 'fr', resources: {}, science: {} },
        'en',
      ),
    ).toThrow(/identity mismatch/i)
    expect(() =>
      validateLocalePack(
        { version: 1, locale: 'en', resources: {}, science: {} },
        'en',
      ),
    ).toThrow(/namespaces/i)
  })

  it('validates every generated production pack with the runtime schema', async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const source = await readFile(
        new URL(`../../public/locales/${locale}.json`, import.meta.url),
        'utf8',
      )
      const pack = validateLocalePack(JSON.parse(source) as unknown, locale)
      expect(pack.locale).toBe(locale)
      expect(Object.keys(pack.science)).toHaveLength(27)
    }
  })
})
