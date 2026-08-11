import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export const SAVED_PLACES_STORAGE_KEY = 'astral-surveyor.saved-places'
export const SAVED_PLACES_SCHEMA_VERSION = 1 as const

export interface SavedPlace {
  readonly targetId: string
  readonly savedAt: string
}

interface SavedPlacesDocument {
  readonly version: typeof SAVED_PLACES_SCHEMA_VERSION
  readonly places: readonly SavedPlace[]
}

export type SavedPlacesPersistence = 'local' | 'memory'

interface SavedPlacesState {
  readonly places: readonly SavedPlace[]
  readonly persistence: SavedPlacesPersistence
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSavedPlace(value: unknown): value is SavedPlace {
  if (!isRecord(value)) return false
  return (
    typeof value.targetId === 'string' &&
    typeof value.savedAt === 'string' &&
    !Number.isNaN(Date.parse(value.savedAt))
  )
}

export function decodeSavedPlaces(
  rawValue: string | null,
  validTargetIds: ReadonlySet<string>,
): readonly SavedPlace[] {
  if (!rawValue) return []

  try {
    const document: unknown = JSON.parse(rawValue)
    if (
      !isRecord(document) ||
      document.version !== SAVED_PLACES_SCHEMA_VERSION ||
      !Array.isArray(document.places)
    ) {
      return []
    }

    const seen = new Set<string>()
    const places: SavedPlace[] = []
    for (const candidate of document.places) {
      if (
        places.length >= 100 ||
        !isSavedPlace(candidate) ||
        !validTargetIds.has(candidate.targetId) ||
        seen.has(candidate.targetId)
      ) {
        continue
      }
      seen.add(candidate.targetId)
      places.push({ targetId: candidate.targetId, savedAt: candidate.savedAt })
    }
    return places
  } catch {
    return []
  }
}

export function encodeSavedPlaces(places: readonly SavedPlace[]): string {
  const document: SavedPlacesDocument = {
    version: SAVED_PLACES_SCHEMA_VERSION,
    places,
  }
  return JSON.stringify(document)
}

function readInitialState(validTargetIds: ReadonlySet<string>): SavedPlacesState {
  if (typeof window === 'undefined') return { places: [], persistence: 'memory' }

  try {
    return {
      places: decodeSavedPlaces(
        window.localStorage.getItem(SAVED_PLACES_STORAGE_KEY),
        validTargetIds,
      ),
      persistence: 'local',
    }
  } catch {
    return { places: [], persistence: 'memory' }
  }
}

export function useSavedPlaces(validIds: readonly string[]) {
  const validTargetIds = useMemo(() => new Set(validIds), [validIds])
  const [state, setState] = useState<SavedPlacesState>(() =>
    readInitialState(validTargetIds),
  )
  const placesRef = useRef(state.places)

  const commit = useCallback((places: readonly SavedPlace[]) => {
    placesRef.current = places
    let persistence: SavedPlacesPersistence = 'memory'
    try {
      window.localStorage.setItem(SAVED_PLACES_STORAGE_KEY, encodeSavedPlaces(places))
      persistence = 'local'
    } catch {
      // Private browsing or storage policy can reject writes; keep the in-memory copy usable.
    }
    setState({ places, persistence })
  }, [])

  const addPlace = useCallback(
    (targetId: string) => {
      if (
        !validTargetIds.has(targetId) ||
        placesRef.current.some((place) => place.targetId === targetId)
      ) {
        return
      }
      commit([
        ...placesRef.current,
        { targetId, savedAt: new Date().toISOString() },
      ])
    },
    [commit, validTargetIds],
  )

  const removePlace = useCallback(
    (targetId: string) => {
      const nextPlaces = placesRef.current.filter((place) => place.targetId !== targetId)
      if (nextPlaces.length !== placesRef.current.length) commit(nextPlaces)
    },
    [commit],
  )

  const clearPlaces = useCallback(() => commit([]), [commit])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SAVED_PLACES_STORAGE_KEY) return
      const places = decodeSavedPlaces(event.newValue, validTargetIds)
      placesRef.current = places
      setState({ places, persistence: 'local' })
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [validTargetIds])

  return {
    places: state.places,
    persistence: state.persistence,
    addPlace,
    removePlace,
    clearPlaces,
  }
}
