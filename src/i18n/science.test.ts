import { describe, expect, it } from 'vitest'
import { CATALOG_BODIES } from '../engine/catalog'
import { SUPPORTED_LOCALES } from './locale'
import {
  SCIENCE_BODY_IDS,
  scienceResources,
  type ScienceBodyId,
} from './namespaces/science'
import { localizedScienceNarrative, registerScienceNarratives } from './science'

const canonicalById = new Map(
  CATALOG_BODIES.map((body) => [body.id, body] as const),
)
const sortedCatalogueIds = CATALOG_BODIES.map(({ id }) => id).toSorted()
const sortedScienceIds = [...SCIENCE_BODY_IDS].toSorted()

describe('Asteria scientific narrative translations', () => {
  for (const locale of SUPPORTED_LOCALES) {
    registerScienceNarratives(locale, scienceResources[locale])
  }

  it('covers the exact 27-body canonical catalogue in every locale', () => {
    expect(CATALOG_BODIES).toHaveLength(27)
    expect(
      CATALOG_BODIES.filter(({ bodyKind }) => bodyKind === 'star'),
    ).toHaveLength(1)
    expect(
      CATALOG_BODIES.filter(({ bodyKind }) => bodyKind === 'planet'),
    ).toHaveLength(8)
    expect(
      CATALOG_BODIES.filter(({ bodyKind }) => bodyKind === 'moon'),
    ).toHaveLength(18)
    expect(sortedScienceIds).toEqual(sortedCatalogueIds)

    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(scienceResources[locale]).toSorted()).toEqual(
        sortedCatalogueIds,
      )
    }
  })

  it('preserves every canonical English description and fact verbatim', () => {
    for (const body of CATALOG_BODIES) {
      const narrative = scienceResources.en[body.id as ScienceBodyId]
      expect(narrative.description).toBe(body.description)
      expect(narrative.facts).toEqual(body.facts)
    }
  })

  it('provides complete authored translations with matching fact counts', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const bodyId of SCIENCE_BODY_IDS) {
        const canonical = canonicalById.get(bodyId)
        expect(canonical).toBeDefined()

        const narrative = scienceResources[locale][bodyId]
        expect(narrative.description.trim().length).toBeGreaterThan(0)
        expect(narrative.facts).toHaveLength(canonical?.facts.length ?? 0)
        expect(narrative.facts.every((fact) => fact.trim().length > 0)).toBe(true)

        if (locale !== 'en' && canonical) {
          expect(narrative.description).not.toBe(canonical.description)
          for (const [index, fact] of narrative.facts.entries()) {
            expect(fact).not.toBe(canonical.facts[index])
          }
        }
      }
    }
  })

  it('falls back safely for unknown bodies and unsupported locales', () => {
    const unknownBody = {
      id: 'future-body',
      description: 'Canonical future description.',
      facts: ['Canonical future fact.'],
    }
    const asteria = canonicalById.get('asteria')
    expect(asteria).toBeDefined()

    expect(localizedScienceNarrative(unknownBody, 'fr')).toEqual({
      description: unknownBody.description,
      facts: unknownBody.facts,
    })
    expect(localizedScienceNarrative(asteria!, 'de')).toEqual({
      description: asteria!.description,
      facts: asteria!.facts,
    })
  })
})
