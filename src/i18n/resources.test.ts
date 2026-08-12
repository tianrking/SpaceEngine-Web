import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES, type AppLocale } from './locale'
import { appResources } from './namespaces/app'
import { hudResources } from './namespaces/hud'
import { nasaResources } from './namespaces/nasa'
import { SCIENCE_BODY_IDS, scienceResources } from './namespaces/science'
import { toolsResources } from './namespaces/tools'

type ResourceTree = Readonly<Record<string, unknown>>

const namespaces = {
  app: appResources,
  hud: hudResources,
  nasa: nasaResources,
  tools: toolsResources,
} as const

function flattenResource(
  value: unknown,
  prefix = '',
  leaves = new Map<string, string>(),
): Map<string, string> {
  if (typeof value === 'string') {
    leaves.set(prefix, value)
    return leaves
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Translation resource at "${prefix}" must be a string or object`)
  }

  for (const [key, child] of Object.entries(value as ResourceTree)) {
    flattenResource(child, prefix ? `${prefix}.${key}` : key, leaves)
  }
  return leaves
}

function interpolationVariables(value: string): string[] {
  return [...value.matchAll(/{{\s*([\w.]+)\s*}}/g)]
    .map((match) => match[1])
    .toSorted()
}

describe('internationalization resources', () => {
  it.each(Object.entries(namespaces))(
    '%s has the exact English key set in every locale',
    (_namespace, resources) => {
      const english = flattenResource(resources.en)
      const englishKeys = [...english.keys()].sort()

      for (const locale of SUPPORTED_LOCALES) {
        const localized = flattenResource(resources[locale as AppLocale])
        expect([...localized.keys()].sort(), locale).toEqual(englishKeys)
        for (const [key, translation] of localized) {
          expect(translation.trim(), `${locale}:${key}`).not.toBe('')
        }
      }
    },
  )

  it('ships the four intentional product locales only', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'es', 'zh-TW', 'fr'])
    for (const resources of Object.values(namespaces)) {
      expect(Object.keys(resources).sort()).toEqual([...SUPPORTED_LOCALES].sort())
    }
    expect(Object.keys(scienceResources).sort()).toEqual([...SUPPORTED_LOCALES].sort())
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(scienceResources[locale]).sort()).toEqual(
        [...SCIENCE_BODY_IDS].sort(),
      )
    }
  })

  it('covers every observed-universe descriptor used by App with matching variables', () => {
    const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
    const usedKeys = [...appSource.matchAll(/t\(['"]observed\.([^'"]+)['"]/g)]
      .map((match) => match[1])
      .toSorted()
    const englishKeys = Object.keys(appResources.en.observed).toSorted()

    expect([...new Set(usedKeys)]).toEqual(englishKeys)
    for (const locale of SUPPORTED_LOCALES) {
      const resources = appResources[locale].observed
      expect(Object.keys(resources).toSorted(), locale).toEqual(englishKeys)
      for (const key of englishKeys) {
        expect(
          interpolationVariables(resources[key as keyof typeof resources]),
          `${locale}:observed.${key}`,
        ).toEqual(interpolationVariables(appResources.en.observed[key as keyof typeof appResources.en.observed]))
      }
    }
  })
})
