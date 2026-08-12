import type { CelestialBodyView } from '../engine/types'
import { isAppLocale, type AppLocale } from './locale'
import type { ScienceNarrativeResource } from './localeLoader'

export type ScienceNarrative = ScienceNarrativeResource

type CanonicalNarrative = Pick<
  CelestialBodyView,
  'id' | 'description' | 'facts'
>

const scienceRegistry = new Map<
  AppLocale,
  Readonly<Record<string, ScienceNarrative>>
>()

export function registerScienceNarratives(
  locale: AppLocale,
  narratives: Readonly<Record<string, ScienceNarrative>>,
): void {
  scienceRegistry.set(locale, narratives)
}

/**
 * Resolves authored scientific copy without coupling catalogue presentation to React.
 * Unknown bodies and locales retain their canonical catalogue narrative verbatim.
 */
export function localizedScienceNarrative(
  body: CanonicalNarrative,
  locale: AppLocale | string | undefined,
): ScienceNarrative {
  if (!isAppLocale(locale)) {
    return {
      description: body.description,
      facts: body.facts,
    }
  }

  return scienceRegistry.get(locale)?.[body.id] ?? {
    description: body.description,
    facts: body.facts,
  }
}
