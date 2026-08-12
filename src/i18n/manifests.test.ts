import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { LOCALE_OPTIONS } from './locale'

interface LocalizedManifest {
  readonly name?: unknown
  readonly lang?: unknown
  readonly description?: unknown
  readonly start_url?: unknown
}

describe('localized web app manifests', () => {
  it.each(LOCALE_OPTIONS)(
    'ships a valid manifest for $label',
    async ({ htmlLang, manifestHref }) => {
      const source = await readFile(
        new URL(`../../public${manifestHref}`, import.meta.url),
        'utf8',
      )
      const manifest = JSON.parse(source) as LocalizedManifest
      expect(manifest.name).toBe('Astral Surveyor')
      expect(manifest.lang).toBe(htmlLang)
      expect(manifest.start_url).toBe('/')
      expect(typeof manifest.description).toBe('string')
      expect((manifest.description as string).trim()).not.toBe('')
    },
  )
})
