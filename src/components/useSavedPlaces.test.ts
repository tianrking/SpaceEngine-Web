import { describe, expect, it } from 'vitest'
import {
  decodeSavedPlaces,
  encodeSavedPlaces,
  SAVED_PLACES_SCHEMA_VERSION,
  type SavedPlace,
} from './useSavedPlaces'

const validIds = new Set(['asteria', 'pelagos', 'orison'])

describe('saved places persistence schema', () => {
  it('round-trips a versioned, minimal document', () => {
    const places: readonly SavedPlace[] = [
      { targetId: 'pelagos', savedAt: '2026-08-11T08:30:00.000Z' },
    ]

    const encoded = encodeSavedPlaces(places)

    expect(JSON.parse(encoded)).toEqual({
      version: SAVED_PLACES_SCHEMA_VERSION,
      places,
    })
    expect(decodeSavedPlaces(encoded, validIds)).toEqual(places)
  })

  it('rejects unsupported schema versions and malformed JSON', () => {
    expect(
      decodeSavedPlaces(JSON.stringify({ version: 99, places: [] }), validIds),
    ).toEqual([])
    expect(decodeSavedPlaces('{not-json', validIds)).toEqual([])
  })

  it('filters unknown bodies, malformed entries, and duplicate target ids', () => {
    const decoded = decodeSavedPlaces(
      JSON.stringify({
        version: SAVED_PLACES_SCHEMA_VERSION,
        places: [
          { targetId: 'pelagos', savedAt: '2026-08-11T08:30:00.000Z' },
          { targetId: 'pelagos', savedAt: '2026-08-12T08:30:00.000Z' },
          { targetId: 'unknown', savedAt: '2026-08-11T08:30:00.000Z' },
          { targetId: 'orison', savedAt: 'not-a-date' },
        ],
      }),
      validIds,
    )

    expect(decoded).toEqual([
      { targetId: 'pelagos', savedAt: '2026-08-11T08:30:00.000Z' },
    ])
  })
})
