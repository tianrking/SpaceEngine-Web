import {
  memo,
  useCallback,
  useDeferredValue,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import {
  Archive,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronRight,
  CircleGauge,
  Cpu,
  Database,
  Gauge,
  Keyboard,
  LocateFixed,
  Map as MapIcon,
  Orbit,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTING_RANGES,
  normalizeDisplaySettings,
} from '../engine/displaySettings'
import type {
  CelestialBodyView,
  DisplaySettings,
  EngineCapabilities,
} from '../engine/types'
import type { SavedPlace, SavedPlacesPersistence } from './useSavedPlaces'
import {
  NASA_ARCHIVE_RECORD_COUNT,
  ProgressiveNasaCatalog,
} from './ProgressiveNasaCatalog'

export type ProductTool = 'search' | 'locations' | 'bookmarks' | 'settings'

export interface ProductTelemetrySummary {
  readonly backend: string
  readonly fps: number
  readonly frameTimeMs: number
  readonly drawCalls: number
  readonly triangles: number
  readonly starCount: number
  readonly quality: string
  readonly floatingOriginKm: string
}

/** Public UI alias for the renderer-owned visual calibration contract. */
export type DisplayCalibration = DisplaySettings

/** Backwards-compatible UI export, sourced from the renderer's canonical defaults. */
export const DEFAULT_DISPLAY_CALIBRATION = DEFAULT_DISPLAY_SETTINGS

export interface ProductToolPanelProps {
  tool: ProductTool
  targets: readonly CelestialBodyView[]
  selectedId: string | null
  savedPlaces: readonly SavedPlace[]
  persistence: SavedPlacesPersistence
  capabilities: EngineCapabilities | null
  telemetry: ProductTelemetrySummary | null
  searchInputRef: RefObject<HTMLInputElement | null>
  onSelect: (id: string) => void
  onFocus: (id: string) => void
  onSave: (id: string) => void
  onRemove: (id: string) => void
  onClearSaved: () => void
  onClose: () => void
  onResetView: () => void
  onOpenQuickTour: () => void
  onOpenShortcuts: () => void
  displayCalibration?: Readonly<DisplayCalibration>
  onDisplayCalibrationChange?: (calibration: DisplayCalibration) => void
  onResetDisplayCalibration?: () => void
}

const PANEL_COPY = {
  search: { eyebrow: 'Universal index', title: 'Search', icon: Search },
  locations: { eyebrow: 'Asteria · AE-0001', title: 'Star map', icon: MapIcon },
  bookmarks: { eyebrow: 'Local catalogue', title: 'Saved places', icon: Bookmark },
  settings: { eyebrow: 'Runtime diagnostics', title: 'Settings', icon: CircleGauge },
} as const

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const savedDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

type CatalogFilter = 'all' | 'planets' | 'moons' | 'temperate'

const CATALOG_FILTERS: ReadonlyArray<{
  readonly id: CatalogFilter
  readonly label: string
}> = [
  { id: 'all', label: 'All' },
  { id: 'planets', label: 'Planets' },
  { id: 'moons', label: 'Moons' },
  { id: 'temperate', label: 'Temperate' },
]

type SearchSource = 'simulation' | 'nasa'
type DisplayCalibrationKey = keyof DisplayCalibration

interface DisplayCalibrationControlDefinition {
  readonly key: DisplayCalibrationKey
  readonly label: string
  readonly description: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly format: 'multiplier' | 'percent'
  readonly icon: LucideIcon
}

const DISPLAY_CALIBRATION_CONTROLS: readonly DisplayCalibrationControlDefinition[] = [
  {
    key: 'exposure',
    label: 'Exposure',
    description: 'Adjust scene luminance before tone mapping.',
    ...DISPLAY_SETTING_RANGES.exposure,
    format: 'multiplier',
    icon: CircleGauge,
  },
  {
    key: 'orbitBrightness',
    label: 'Orbit brightness',
    description: 'Balance orbital guides against the rendered scene.',
    ...DISPLAY_SETTING_RANGES.orbitBrightness,
    format: 'percent',
    icon: Orbit,
  },
  {
    key: 'starfieldBrightness',
    label: 'Starfield brightness',
    description: 'Tune background-star luminance for the display.',
    ...DISPLAY_SETTING_RANGES.starfieldBrightness,
    format: 'percent',
    icon: Sparkles,
  },
]

function normalizeDisplayCalibration(
  calibration: Readonly<DisplayCalibration>,
): DisplayCalibration {
  return normalizeDisplaySettings(calibration)
}

function formatCalibrationValue(
  control: DisplayCalibrationControlDefinition,
  value: number,
) {
  return control.format === 'multiplier'
    ? `${value.toFixed(2)}×`
    : `${Math.round(value * 100)}%`
}

function isDefaultCalibration(calibration: Readonly<DisplayCalibration>) {
  return DISPLAY_CALIBRATION_CONTROLS.every(
    (control) =>
      Math.abs(
        calibration[control.key] - DEFAULT_DISPLAY_CALIBRATION[control.key],
      ) < control.step / 2,
  )
}

function distanceLabel(target: CelestialBodyView): string {
  if (target.bodyKind === 'star') return 'System origin'
  if (target.bodyKind === 'moon' && target.orbit) {
    return `${Math.round(target.orbit.semiMajorAxisMeters / 1_000).toLocaleString()} km`
  }
  return `${target.distanceAu.toFixed(2)} AU`
}

function bodyRoleLabel(target: CelestialBodyView): string {
  if (target.bodyKind === 'star') return 'Primary star'
  if (target.bodyKind === 'moon') return `${target.bodyClass} moon`
  return target.bodyClass
}

function massLabel(target: CelestialBodyView): string {
  if (target.bodyKind === 'star') {
    return `${(target.massEarths / 332_946).toFixed(2)} M☉`
  }
  const digits = target.massEarths < 0.1 ? 3 : target.massEarths < 10 ? 2 : 1
  return `${target.massEarths.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  })} M⊕`
}

function pressureLabel(target: CelestialBodyView): string {
  if (target.surfacePressurePascals === null) return 'No model'
  const bars = target.surfacePressurePascals / 100_000
  if (bars < 0.01) return `${target.surfacePressurePascals.toLocaleString()} Pa`
  return `${bars.toLocaleString(undefined, { maximumFractionDigits: 2 })} bar`
}

function filterTargets(
  targets: readonly CelestialBodyView[],
  query: string,
  filter: CatalogFilter = 'all',
): readonly CelestialBodyView[] {
  const needle = query.trim().toLocaleLowerCase()
  return targets.filter((target) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'planets' && target.bodyKind === 'planet') ||
      (filter === 'moons' && target.bodyKind === 'moon') ||
      (filter === 'temperate' && target.habitability.tone === 'positive')
    if (!matchesFilter) return false
    if (!needle) return true
    return [
      target.name,
      target.designation,
      target.bodyKind,
      target.bodyClass,
      target.parentName ?? '',
      target.description,
      target.atmosphere,
      ...target.facts,
    ].some((value) => value.toLocaleLowerCase().includes(needle))
  })
}

interface SearchToolProps {
  targets: readonly CelestialBodyView[]
  selectedId: string | null
  searchInputRef: RefObject<HTMLInputElement | null>
  onSelect: (id: string) => void
  onFocus: (id: string) => void
}

const SearchTool = memo(function SearchTool({
  targets,
  selectedId,
  searchInputRef,
  onSelect,
  onFocus,
}: SearchToolProps) {
  const inputId = useId()
  const [source, setSource] = useState<SearchSource>('simulation')
  const [query, setQuery] = useState('')
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all')
  const deferredQuery = useDeferredValue(query)
  const results = useMemo(
    () => filterTargets(targets, deferredQuery, catalogFilter),
    [catalogFilter, deferredQuery, targets],
  )

  return (
    <div className="product-search">
      <div className="product-source-switch" role="group" aria-label="Catalogue source">
        <button
          type="button"
          data-source="simulation"
          aria-pressed={source === 'simulation'}
          aria-label={`Asteria simulation, ${targets.length} bodies`}
          onClick={() => setSource('simulation')}
        >
          <Sparkles size={14} aria-hidden="true" />
          <span>Asteria simulation</span>
          <strong aria-hidden="true">· {targets.length}</strong>
        </button>
        <button
          type="button"
          data-source="nasa"
          aria-pressed={source === 'nasa'}
          aria-label={`NASA Exoplanet Archive, ${NASA_ARCHIVE_RECORD_COUNT} records`}
          onClick={() => setSource('nasa')}
        >
          <Archive size={14} aria-hidden="true" />
          <span>NASA archive</span>
          <strong aria-hidden="true">· {NASA_ARCHIVE_RECORD_COUNT}</strong>
        </button>
      </div>

      {source === 'simulation' ? (
        <div className="product-simulation-search">
          <label htmlFor={inputId}>Search the Asteria catalogue</label>
          <div className="product-search__field">
            <Search size={17} aria-hidden="true" />
            <input
              ref={searchInputRef}
              id={inputId}
              type="search"
              value={query}
              placeholder="Name, designation, class…"
              autoComplete="off"
              spellCheck="false"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                const firstMatch = filterTargets(
                  targets,
                  event.currentTarget.value,
                  catalogFilter,
                )[0]
                if (firstMatch) onSelect(firstMatch.id)
              }}
            />
            {query ? (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                <X size={15} aria-hidden="true" />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </div>

          <div
            className="product-catalog-filters"
            role="group"
            aria-label="Catalogue filters"
          >
            {CATALOG_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={catalogFilter === filter.id}
                onClick={() => setCatalogFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <p className="product-search__status" role="status" aria-live="polite">
            {results.length} of {targets.length} indexed bodies
          </p>

          {results.length > 0 ? (
            <ul className="product-target-list" aria-label="Search results">
              {results.map((target) => {
                const selected = selectedId === target.id
                return (
                  <li
                    key={target.id}
                    className={`product-target-row${selected ? ' is-selected' : ''}`}
                  >
                    <button
                      className="product-target-row__select"
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelect(target.id)}
                    >
                      <span
                        className="product-body-swatch"
                        style={{ '--body-color': target.color } as CSSProperties}
                        aria-hidden="true"
                      />
                      <span>
                        <strong>{target.name}</strong>
                        <small>
                          {target.designation}
                          {target.parentName ? ` · ${target.parentName} system` : ''}
                        </small>
                      </span>
                      <span className="product-target-row__distance">
                        {distanceLabel(target)}
                      </span>
                    </button>
                    <button
                      className="product-target-row__focus"
                      type="button"
                      aria-label={`Center on ${target.name} in orbit view`}
                      title={`Center on ${target.name} in orbit view`}
                      onClick={() => onFocus(target.id)}
                    >
                      <LocateFixed size={16} aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="product-empty-state">
              <Search size={23} aria-hidden="true" />
              <strong>No matching destinations</strong>
              <p>Try a planet name, catalogue code, or class such as “giant”.</p>
            </div>
          )}
        </div>
      ) : (
        <ProgressiveNasaCatalog searchInputRef={searchInputRef} />
      )}
    </div>
  )
})

interface LocationsToolProps {
  targets: readonly CelestialBodyView[]
  selectedId: string | null
  onSelect: (id: string) => void
  onFocus: (id: string) => void
}

const LocationsTool = memo(function LocationsTool({
  targets,
  selectedId,
  onSelect,
  onFocus,
}: LocationsToolProps) {
  const selected = targets.find((target) => target.id === selectedId) ?? targets[0]
  const primaryTargets = useMemo(
    () => targets.filter((target) => target.bodyKind !== 'moon'),
    [targets],
  )
  const selectedPlanetId =
    selected?.bodyKind === 'planet'
      ? selected.id
      : selected?.bodyKind === 'moon'
        ? selected.parentId
        : null
  const satellites = useMemo(
    () =>
      selectedPlanetId
        ? targets.filter(
            (target) =>
              target.bodyKind === 'moon' && target.parentId === selectedPlanetId,
          )
        : [],
    [selectedPlanetId, targets],
  )
  const planetCount = targets.filter((target) => target.bodyKind === 'planet').length
  const moonCount = targets.filter((target) => target.bodyKind === 'moon').length

  return (
    <div className="product-locations">
      <div className="product-system-summary">
        <div>
          <small>Physics-backed synthetic system</small>
          <strong>{planetCount} planets · {moonCount} moons</strong>
        </div>
        <span><Sparkles size={14} aria-hidden="true" /> {targets.length} bodies</span>
      </div>

      <div
        className="product-orbit-map"
        role="group"
        aria-label="Schematic map of the Asteria system"
      >
        <span className="product-orbit-map__axis" aria-hidden="true" />
        {primaryTargets.slice(1).map((target, index) => (
          <span
            key={`${target.id}-orbit`}
            className="product-orbit-map__ring"
            style={{ '--orbit-size': `${52 + index * 34}px` } as CSSProperties}
            aria-hidden="true"
          />
        ))}
        {primaryTargets.map((target, index) => {
          const selectedTarget =
            selectedId === target.id ||
            (selected?.bodyKind === 'moon' && selected.parentId === target.id)
          const pointStyle = {
            '--map-angle': `${index * 137.5 - 40}deg`,
            '--map-radius': `${index === 0 ? 0 : 24 + index * 17}px`,
            '--body-color': target.color,
          } as CSSProperties
          return (
            <button
              key={target.id}
              className={`product-map-point${index === 0 ? ' is-star' : ''}${selectedTarget ? ' is-selected' : ''}`}
              style={pointStyle}
              type="button"
              aria-label={`Select ${target.name}, ${bodyRoleLabel(target)}`}
              aria-pressed={selectedTarget}
              onClick={() => onSelect(target.id)}
            >
              <span>{target.name}</span>
            </button>
          )
        })}
      </div>

      {selected ? (
        <article className="product-location-card">
          <header>
            <span
              className="product-body-swatch is-large"
              style={{ '--body-color': selected.color } as CSSProperties}
              aria-hidden="true"
            />
            <div>
              <small>{bodyRoleLabel(selected)}</small>
              <h3>{selected.name}</h3>
              <p>{selected.designation}</p>
            </div>
            <strong>{distanceLabel(selected)}</strong>
          </header>
          <div className="product-science-badges">
            <span>Physics derived</span>
            <span className={`is-${selected.habitability.tone}`}>
              {selected.habitability.label}
            </span>
          </div>
          <p>{selected.description}</p>
          <dl className="product-location-card__science-grid">
            <div><dt>Mass</dt><dd>{massLabel(selected)}</dd></div>
            <div><dt>Mean radius</dt><dd>{selected.radiusKm.toLocaleString()} km</dd></div>
            <div><dt>Mean density</dt><dd>{selected.densityKgPerCubicMeter.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg/m³</dd></div>
            <div><dt>Gravity</dt><dd>{selected.gravityG.toFixed(2)} g</dd></div>
            <div><dt>Escape velocity</dt><dd>{selected.escapeVelocityKmPerSecond.toFixed(2)} km/s</dd></div>
            <div><dt>Mean temperature</dt><dd>{selected.temperatureK.toLocaleString()} K</dd></div>
            <div><dt>Reference pressure</dt><dd>{pressureLabel(selected)}</dd></div>
            <div><dt>Rotation</dt><dd>{Math.abs(selected.rotationPeriodHours).toLocaleString(undefined, { maximumFractionDigits: 1 })} h{selected.rotationPeriodHours < 0 ? ' retrograde' : ''}</dd></div>
            {selected.orbit ? (
              <>
                <div><dt>Orbital period</dt><dd>{selected.orbit.periodDays.toLocaleString(undefined, { maximumFractionDigits: 2 })} days</dd></div>
                <div><dt>Eccentricity</dt><dd>{selected.orbit.eccentricity.toFixed(3)}</dd></div>
              </>
            ) : null}
          </dl>
          {selected.facts.length > 0 ? (
            <ul className="product-location-card__facts" aria-label={`${selected.name} facts`}>
              {selected.facts.slice(0, 2).map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
          ) : null}
          <button type="button" className="product-primary-action" onClick={() => onFocus(selected.id)}>
            <LocateFixed size={16} aria-hidden="true" /> Center on {selected.name}
          </button>
        </article>
      ) : null}

      {satellites.length > 0 ? (
        <section className="product-satellite-list" aria-labelledby="satellites-heading">
          <div className="product-section-heading">
            <span id="satellites-heading">Satellite system · {satellites.length}</span>
            <Orbit size={14} aria-hidden="true" />
          </div>
          <ul>
            {satellites.map((moon) => (
              <li key={moon.id}>
                <button
                  type="button"
                  aria-pressed={selectedId === moon.id}
                  onClick={() => onSelect(moon.id)}
                >
                  <span
                    className="product-body-swatch"
                    style={{ '--body-color': moon.color } as CSSProperties}
                    aria-hidden="true"
                  />
                  <span><strong>{moon.name}</strong><small>{moon.bodyClass}</small></span>
                  <span>{distanceLabel(moon)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
})

interface BookmarksToolProps {
  targets: readonly CelestialBodyView[]
  selectedId: string | null
  savedPlaces: readonly SavedPlace[]
  persistence: SavedPlacesPersistence
  onFocus: (id: string) => void
  onSave: (id: string) => void
  onRemove: (id: string) => void
  onClearSaved: () => void
}

const BookmarksTool = memo(function BookmarksTool({
  targets,
  selectedId,
  savedPlaces,
  persistence,
  onFocus,
  onSave,
  onRemove,
  onClearSaved,
}: BookmarksToolProps) {
  const targetMap = useMemo(
    () => new Map(targets.map((target) => [target.id, target] as const)),
    [targets],
  )
  const selected = selectedId ? targetMap.get(selectedId) : undefined
  const selectedIsSaved = selected
    ? savedPlaces.some((place) => place.targetId === selected.id)
    : false
  const savedTargets = savedPlaces.flatMap((place) => {
    const target = targetMap.get(place.targetId)
    return target ? [{ place, target }] : []
  })

  return (
    <div className="product-bookmarks">
      <div className="product-storage-status">
        <Database size={14} aria-hidden="true" />
        <span>
          {persistence === 'local' ? 'Stored on this device' : 'Memory only'}
          <small>Schema v1 · {savedPlaces.length}/100 places</small>
        </span>
        {persistence === 'local' ? <Check size={14} aria-label="Local storage available" /> : null}
      </div>

      {selected ? (
        <section className="product-current-place" aria-label="Current celestial body">
          <div>
            <span
              className="product-body-swatch"
              style={{ '--body-color': selected.color } as CSSProperties}
              aria-hidden="true"
            />
            <span><small>Current target</small><strong>{selected.name}</strong></span>
          </div>
          {selectedIsSaved ? (
            <button type="button" onClick={() => onRemove(selected.id)}>
              <Trash2 size={15} aria-hidden="true" /> Remove
            </button>
          ) : (
            <button type="button" onClick={() => onSave(selected.id)}>
              <BookmarkCheck size={15} aria-hidden="true" /> Save place
            </button>
          )}
        </section>
      ) : (
        <p className="product-inline-note">Select a body before saving a place.</p>
      )}

      {savedTargets.length > 0 ? (
        <div className="product-saved-list">
          <div className="product-section-heading">
            <span>Saved destinations</span>
            <button type="button" onClick={onClearSaved}>Clear all</button>
          </div>
          {savedTargets.map(({ place, target }) => (
            <article key={target.id}>
              <button
                type="button"
                aria-label={`Center on ${target.name} in orbit view`}
                title={`Center on ${target.name} in orbit view`}
                onClick={() => onFocus(target.id)}
              >
                <span
                  className="product-body-swatch"
                  style={{ '--body-color': target.color } as CSSProperties}
                  aria-hidden="true"
                />
                <span>
                  <strong>{target.name}</strong>
                  <time dateTime={place.savedAt}>Saved {savedDate.format(new Date(place.savedAt))}</time>
                </span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${target.name} from saved places`}
                title={`Remove ${target.name}`}
                onClick={() => onRemove(target.id)}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="product-empty-state">
          <Bookmark size={24} aria-hidden="true" />
          <strong>No saved places yet</strong>
          <p>Save the current world to build a personal observing itinerary.</p>
        </div>
      )}
    </div>
  )
})

interface DisplayCalibrationControlProps {
  control: DisplayCalibrationControlDefinition
  value: number
  disabled: boolean
  onChange: (key: DisplayCalibrationKey, value: number) => void
}

const DisplayCalibrationControl = memo(function DisplayCalibrationControl({
  control,
  value,
  disabled,
  onChange,
}: DisplayCalibrationControlProps) {
  const inputId = useId()
  const descriptionId = `${inputId}-description`
  const formattedValue = formatCalibrationValue(control, value)
  const progress = ((value - control.min) / (control.max - control.min)) * 100
  const Icon = control.icon

  return (
    <div className="product-calibration-control">
      <div className="product-calibration-control__header">
        <span className="product-calibration-control__icon" aria-hidden="true">
          <Icon size={15} strokeWidth={1.6} />
        </span>
        <label htmlFor={inputId}>
          <strong>{control.label}</strong>
          <small id={descriptionId}>{control.description}</small>
        </label>
        <output htmlFor={inputId}>{formattedValue}</output>
      </div>
      <input
        id={inputId}
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        disabled={disabled}
        aria-describedby={descriptionId}
        aria-valuetext={formattedValue}
        style={{ '--calibration-progress': `${progress}%` } as CSSProperties}
        onChange={(event) =>
          onChange(control.key, Number(event.currentTarget.value))
        }
      />
      <div className="product-calibration-control__scale" aria-hidden="true">
        <span>{formatCalibrationValue(control, control.min)}</span>
        <span>{formatCalibrationValue(control, control.max)}</span>
      </div>
    </div>
  )
})

interface SettingsToolProps {
  targets: readonly CelestialBodyView[]
  capabilities: EngineCapabilities | null
  telemetry: ProductTelemetrySummary | null
  onResetView: () => void
  onOpenQuickTour: () => void
  onOpenShortcuts: () => void
  displayCalibration?: Readonly<DisplayCalibration>
  onDisplayCalibrationChange?: (calibration: DisplayCalibration) => void
  onResetDisplayCalibration?: () => void
}

const SettingsTool = memo(function SettingsTool({
  targets,
  capabilities,
  telemetry,
  onResetView,
  onOpenQuickTour,
  onOpenShortcuts,
  displayCalibration,
  onDisplayCalibrationChange,
  onResetDisplayCalibration,
}: SettingsToolProps) {
  const [fallbackCalibration, setFallbackCalibration] =
    useState<DisplayCalibration>(() => ({ ...DEFAULT_DISPLAY_CALIBRATION }))
  const isCalibrationControlled = displayCalibration !== undefined
  const calibration = useMemo(
    () =>
      normalizeDisplayCalibration(displayCalibration ?? fallbackCalibration),
    [displayCalibration, fallbackCalibration],
  )
  const calibrationDisabled =
    isCalibrationControlled && !onDisplayCalibrationChange
  const calibrationIsDefault = isDefaultCalibration(calibration)

  const handleCalibrationChange = useCallback(
    (key: DisplayCalibrationKey, value: number) => {
      const nextCalibration = normalizeDisplayCalibration({
        ...calibration,
        [key]: value,
      })
      if (!isCalibrationControlled) setFallbackCalibration(nextCalibration)
      onDisplayCalibrationChange?.(nextCalibration)
    },
    [calibration, isCalibrationControlled, onDisplayCalibrationChange],
  )

  const handleCalibrationReset = useCallback(() => {
    const defaults = { ...DEFAULT_DISPLAY_CALIBRATION }
    if (!isCalibrationControlled) setFallbackCalibration(defaults)
    if (onResetDisplayCalibration) onResetDisplayCalibration()
    else onDisplayCalibrationChange?.(defaults)
  }, [
    isCalibrationControlled,
    onDisplayCalibrationChange,
    onResetDisplayCalibration,
  ])

  const planetCount = targets.filter((target) => target.bodyKind === 'planet').length
  const moonCount = targets.filter((target) => target.bodyKind === 'moon').length

  return (
    <div className="product-settings">
      <section aria-labelledby="science-model-heading">
        <div className="product-section-heading">
          <span id="science-model-heading">Scientific model</span>
          <Database size={14} aria-hidden="true" />
        </div>
        <dl className="product-diagnostic-grid">
          <div><dt>Catalogue</dt><dd>{targets.length} bodies</dd></div>
          <div><dt>Worlds</dt><dd>{planetCount} + {moonCount} moons</dd></div>
          <div><dt>Internal units</dt><dd>SI / f64</dd></div>
          <div><dt>Orbit model</dt><dd>Keplerian</dd></div>
          <div><dt>Constants</dt><dd>IAU 2015</dd></div>
          <div><dt>Provenance</dt><dd>Synthetic + derived</dd></div>
        </dl>
        <p className="product-inline-note">
          Catalogue assumptions and equation-derived measurements are labelled separately.
          Climate labels are exploration heuristics, not biosignature claims.
        </p>
      </section>

      <section
        className="product-display-calibration"
        aria-labelledby="display-calibration-heading"
      >
        <div className="product-section-heading">
          <span id="display-calibration-heading">Display calibration</span>
          <button
            className="product-calibration-reset"
            type="button"
            disabled={
              calibrationIsDefault ||
              (isCalibrationControlled &&
                !onResetDisplayCalibration &&
                !onDisplayCalibrationChange)
            }
            onClick={handleCalibrationReset}
          >
            <RefreshCcw size={12} aria-hidden="true" />
            Reset
          </button>
        </div>
        <p className="product-calibration-intro">
          Match scene contrast and guide visibility to this display. Values are
          normalized and can be restored without changing simulation data.
        </p>
        <div className="product-calibration-controls">
          {DISPLAY_CALIBRATION_CONTROLS.map((control) => (
            <DisplayCalibrationControl
              key={control.key}
              control={control}
              value={calibration[control.key]}
              disabled={calibrationDisabled}
              onChange={handleCalibrationChange}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="runtime-heading">
        <div className="product-section-heading">
          <span id="runtime-heading">Renderer capabilities</span>
          <Cpu size={14} aria-hidden="true" />
        </div>
        <dl className="product-diagnostic-grid">
          <div><dt>Backend</dt><dd>{capabilities?.backend.toUpperCase() ?? 'Starting…'}</dd></div>
          <div><dt>Adapter</dt><dd>{capabilities?.adapterName ?? 'Browser default'}</dd></div>
          <div><dt>WebGPU</dt><dd>{capabilities ? (capabilities.webgpuAvailable ? 'Available' : 'Unavailable') : 'Checking…'}</dd></div>
          <div><dt>Compute stars</dt><dd>{capabilities ? (capabilities.computeStarfield ? 'Enabled' : 'CPU fallback') : 'Checking…'}</dd></div>
          <div><dt>Log depth</dt><dd>{capabilities ? (capabilities.logarithmicDepth ? 'Enabled' : 'Disabled') : 'Checking…'}</dd></div>
          <div><dt>Max texture</dt><dd>{capabilities?.maxTextureDimension2D ? `${capabilities.maxTextureDimension2D}px` : 'Unknown'}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="telemetry-heading">
        <div className="product-section-heading">
          <span id="telemetry-heading">Live telemetry</span>
          <Gauge size={14} aria-hidden="true" />
        </div>
        {telemetry ? (
          <dl className="product-telemetry-grid">
            <div><dt>Frame rate</dt><dd>{Math.round(telemetry.fps)} <small>fps</small></dd></div>
            <div><dt>Frame time</dt><dd>{telemetry.frameTimeMs.toFixed(1)} <small>ms</small></dd></div>
            <div><dt>Draw calls</dt><dd>{telemetry.drawCalls}</dd></div>
            <div><dt>Triangles</dt><dd>{compactNumber.format(telemetry.triangles)}</dd></div>
            <div><dt>Star field</dt><dd>{compactNumber.format(telemetry.starCount)}</dd></div>
            <div><dt>Quality</dt><dd>{telemetry.quality}</dd></div>
          </dl>
        ) : (
          <p className="product-inline-note">Telemetry becomes available after the renderer starts.</p>
        )}
        {telemetry ? (
          <p className="product-origin-readout">Floating origin · {telemetry.floatingOriginKm} km</p>
        ) : null}
      </section>

      <section aria-labelledby="actions-heading">
        <div className="product-section-heading">
          <span id="actions-heading">Utilities</span>
        </div>
        <div className="product-settings-actions">
          <button type="button" onClick={onResetView}>
            <RefreshCcw size={17} aria-hidden="true" />
            <span><strong>Reset observation deck</strong><small>Restore the default camera and target</small></span>
          </button>
          <button type="button" onClick={onOpenQuickTour}>
            <Orbit size={17} aria-hidden="true" />
            <span><strong>Open quick tour</strong><small>Replay the three-step flight introduction</small></span>
          </button>
          <button type="button" onClick={onOpenShortcuts}>
            <Keyboard size={17} aria-hidden="true" />
            <span><strong>Keyboard guide</strong><small>Review navigation and interface shortcuts</small></span>
          </button>
        </div>
      </section>
    </div>
  )
})

function ProductToolPanelComponent({
  tool,
  targets,
  selectedId,
  savedPlaces,
  persistence,
  capabilities,
  telemetry,
  searchInputRef,
  onSelect,
  onFocus,
  onSave,
  onRemove,
  onClearSaved,
  onClose,
  onResetView,
  onOpenQuickTour,
  onOpenShortcuts,
  displayCalibration,
  onDisplayCalibrationChange,
  onResetDisplayCalibration,
}: ProductToolPanelProps) {
  const headingId = useId()
  const copy = PANEL_COPY[tool]
  const Icon = copy.icon

  return (
    <aside className="product-tool-panel" aria-labelledby={headingId}>
      <header className="product-tool-panel__header">
        <span className="product-tool-panel__icon" aria-hidden="true"><Icon size={18} /></span>
        <div>
          <small>{copy.eyebrow}</small>
          <h2 id={headingId}>{copy.title}</h2>
        </div>
        <button type="button" aria-label={`Close ${copy.title}`} onClick={onClose}>
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="product-tool-panel__content">
        {tool === 'search' ? (
          <SearchTool
            targets={targets}
            selectedId={selectedId}
            searchInputRef={searchInputRef}
            onSelect={onSelect}
            onFocus={onFocus}
          />
        ) : tool === 'locations' ? (
          <LocationsTool
            targets={targets}
            selectedId={selectedId}
            onSelect={onSelect}
            onFocus={onFocus}
          />
        ) : tool === 'bookmarks' ? (
          <BookmarksTool
            targets={targets}
            selectedId={selectedId}
            savedPlaces={savedPlaces}
            persistence={persistence}
            onFocus={onFocus}
            onSave={onSave}
            onRemove={onRemove}
            onClearSaved={onClearSaved}
          />
        ) : (
          <SettingsTool
            targets={targets}
            capabilities={capabilities}
            telemetry={telemetry}
            onResetView={onResetView}
            onOpenQuickTour={onOpenQuickTour}
            onOpenShortcuts={onOpenShortcuts}
            displayCalibration={displayCalibration}
            onDisplayCalibrationChange={onDisplayCalibrationChange}
            onResetDisplayCalibration={onResetDisplayCalibration}
          />
        )}
      </div>

      <footer className="product-tool-panel__footer">
        <span><kbd>Esc</kbd> Explore</span>
        <span><kbd>?</kbd> Shortcuts</span>
      </footer>
    </aside>
  )
}

export const ProductToolPanel = memo(ProductToolPanelComponent)
