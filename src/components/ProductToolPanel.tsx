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
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
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
import { LOCALE_OPTIONS, localeOption, setAppLocale } from '../i18n'
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

const PANEL_ICONS = {
  search: Search,
  locations: MapIcon,
  bookmarks: Bookmark,
  settings: CircleGauge,
} as const

type CatalogFilter = 'all' | 'planets' | 'moons' | 'temperate'

const CATALOG_FILTERS: ReadonlyArray<{
  readonly id: CatalogFilter
}> = [
  { id: 'all' },
  { id: 'planets' },
  { id: 'moons' },
  { id: 'temperate' },
]

type SearchSource = 'simulation' | 'nasa'
type DisplayCalibrationKey = keyof DisplayCalibration

interface DisplayCalibrationControlDefinition {
  readonly key: DisplayCalibrationKey
  readonly min: number
  readonly max: number
  readonly step: number
  readonly format: 'multiplier' | 'percent'
  readonly icon: LucideIcon
}

const DISPLAY_CALIBRATION_CONTROLS: readonly DisplayCalibrationControlDefinition[] = [
  {
    key: 'exposure',
    ...DISPLAY_SETTING_RANGES.exposure,
    format: 'multiplier',
    icon: CircleGauge,
  },
  {
    key: 'orbitBrightness',
    ...DISPLAY_SETTING_RANGES.orbitBrightness,
    format: 'percent',
    icon: Orbit,
  },
  {
    key: 'starfieldBrightness',
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
  intlLocale: string,
) {
  return control.format === 'multiplier'
    ? `${value.toLocaleString(intlLocale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}×`
    : value.toLocaleString(intlLocale, {
        style: 'percent',
        maximumFractionDigits: 0,
      })
}

function isDefaultCalibration(calibration: Readonly<DisplayCalibration>) {
  return DISPLAY_CALIBRATION_CONTROLS.every(
    (control) =>
      Math.abs(
        calibration[control.key] - DEFAULT_DISPLAY_CALIBRATION[control.key],
      ) < control.step / 2,
  )
}

function distanceLabel(
  target: CelestialBodyView,
  intlLocale: string,
  t: TFunction<'tools'>,
): string {
  if (target.bodyKind === 'star') return t('common.systemOrigin')
  if (target.bodyKind === 'moon' && target.orbit) {
    return `${Math.round(target.orbit.semiMajorAxisMeters / 1_000).toLocaleString(intlLocale)} km`
  }
  return `${target.distanceAu.toLocaleString(intlLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} AU`
}

function bodyRoleLabel(
  target: CelestialBodyView,
  t: TFunction<'tools'>,
): string {
  if (target.bodyKind === 'star') return t('common.primaryStar')
  return target.bodyClass
}

function massLabel(target: CelestialBodyView, intlLocale: string): string {
  if (target.bodyKind === 'star') {
    return `${(target.massEarths / 332_946).toLocaleString(intlLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} M☉`
  }
  const digits = target.massEarths < 0.1 ? 3 : target.massEarths < 10 ? 2 : 1
  return `${target.massEarths.toLocaleString(intlLocale, {
    maximumFractionDigits: digits,
  })} M⊕`
}

function pressureLabel(
  target: CelestialBodyView,
  intlLocale: string,
  t: TFunction<'tools'>,
): string {
  if (target.surfacePressurePascals === null) return t('common.noModel')
  const bars = target.surfacePressurePascals / 100_000
  if (bars < 0.01) {
    return `${target.surfacePressurePascals.toLocaleString(intlLocale)} Pa`
  }
  return `${bars.toLocaleString(intlLocale, { maximumFractionDigits: 2 })} bar`
}

function filterTargets(
  targets: readonly CelestialBodyView[],
  query: string,
  filter: CatalogFilter = 'all',
  intlLocale = 'en-US',
): readonly CelestialBodyView[] {
  const needle = query.trim().toLocaleLowerCase(intlLocale)
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
    ].some((value) => value.toLocaleLowerCase(intlLocale).includes(needle))
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
  const { t, i18n } = useTranslation('tools')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  const inputId = useId()
  const [source, setSource] = useState<SearchSource>('simulation')
  const [query, setQuery] = useState('')
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all')
  const deferredQuery = useDeferredValue(query)
  const results = useMemo(
    () => filterTargets(targets, deferredQuery, catalogFilter, intlLocale),
    [catalogFilter, deferredQuery, intlLocale, targets],
  )
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(intlLocale),
    [intlLocale],
  )
  const formattedTargetCount = numberFormatter.format(targets.length)
  const formattedNasaCount = numberFormatter.format(NASA_ARCHIVE_RECORD_COUNT)

  return (
    <div className="product-search">
      <div
        className="product-source-switch"
        role="group"
        aria-label={t('search.sourceLabel')}
      >
        <button
          type="button"
          data-source="simulation"
          aria-pressed={source === 'simulation'}
          aria-label={t('search.simulationSourceAria', {
            count: formattedTargetCount,
          })}
          onClick={() => setSource('simulation')}
        >
          <Sparkles size={14} aria-hidden="true" />
          <span>{t('search.simulationSource')}</span>
          <strong aria-hidden="true">· {formattedTargetCount}</strong>
        </button>
        <button
          type="button"
          data-source="nasa"
          aria-pressed={source === 'nasa'}
          aria-label={t('search.nasaSourceAria', {
            count: formattedNasaCount,
          })}
          onClick={() => setSource('nasa')}
        >
          <Archive size={14} aria-hidden="true" />
          <span>{t('search.nasaSource')}</span>
          <strong aria-hidden="true">· {formattedNasaCount}</strong>
        </button>
      </div>

      {source === 'simulation' ? (
        <div className="product-simulation-search">
          <label htmlFor={inputId}>{t('search.inputLabel')}</label>
          <div className="product-search__field">
            <Search size={17} aria-hidden="true" />
            <input
              ref={searchInputRef}
              id={inputId}
              type="search"
              value={query}
              placeholder={t('search.placeholder')}
              autoComplete="off"
              spellCheck="false"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                const firstMatch = filterTargets(
                  targets,
                  event.currentTarget.value,
                  catalogFilter,
                  intlLocale,
                )[0]
                if (firstMatch) onSelect(firstMatch.id)
              }}
            />
            {query ? (
              <button
                type="button"
                aria-label={t('search.clear')}
                onClick={() => setQuery('')}
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </div>

          <div
            className="product-catalog-filters"
            role="group"
            aria-label={t('search.filterLabel')}
          >
            {CATALOG_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={catalogFilter === filter.id}
                onClick={() => setCatalogFilter(filter.id)}
              >
                {t(`search.filters.${filter.id}`)}
              </button>
            ))}
          </div>

          <p className="product-search__status" role="status" aria-live="polite">
            {t('search.indexedStatus', {
              visible: numberFormatter.format(results.length),
              total: formattedTargetCount,
            })}
          </p>

          {results.length > 0 ? (
            <ul
              className="product-target-list"
              aria-label={t('search.resultsLabel')}
            >
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
                          {target.parentName
                            ? ` · ${t('common.parentSystem', {
                                parent: target.parentName,
                              })}`
                            : ''}
                        </small>
                      </span>
                      <span className="product-target-row__distance">
                        {distanceLabel(target, intlLocale, t)}
                      </span>
                    </button>
                    <button
                      className="product-target-row__focus"
                      type="button"
                      aria-label={t('common.centerOrbit', {
                        name: target.name,
                      })}
                      title={t('common.centerOrbit', { name: target.name })}
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
              <strong>{t('search.emptyTitle')}</strong>
              <p>{t('search.emptyHelp')}</p>
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
  const { t, i18n } = useTranslation('tools')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(intlLocale),
    [intlLocale],
  )
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
          <small>{t('locations.syntheticSystem')}</small>
          <strong>
            {t('common.planetsAndMoons', {
              planets: numberFormatter.format(planetCount),
              moons: numberFormatter.format(moonCount),
            })}
          </strong>
        </div>
        <span>
          <Sparkles size={14} aria-hidden="true" />{' '}
          {t('common.bodies', { count: numberFormatter.format(targets.length) })}
        </span>
      </div>

      <div
        className="product-orbit-map"
        role="group"
        aria-label={t('locations.mapLabel')}
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
              aria-label={t('common.selectBody', {
                name: target.name,
                role: bodyRoleLabel(target, t),
              })}
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
              <small>{bodyRoleLabel(selected, t)}</small>
              <h3>{selected.name}</h3>
              <p>{selected.designation}</p>
            </div>
            <strong>{distanceLabel(selected, intlLocale, t)}</strong>
          </header>
          <div className="product-science-badges">
            <span>{t('locations.physicsDerived')}</span>
            <span className={`is-${selected.habitability.tone}`}>
              {selected.habitability.label}
            </span>
          </div>
          <p>{selected.description}</p>
          <dl className="product-location-card__science-grid">
            <div><dt>{t('locations.metrics.mass')}</dt><dd>{massLabel(selected, intlLocale)}</dd></div>
            <div><dt>{t('locations.metrics.meanRadius')}</dt><dd>{selected.radiusKm.toLocaleString(intlLocale)} km</dd></div>
            <div><dt>{t('locations.metrics.meanDensity')}</dt><dd>{selected.densityKgPerCubicMeter.toLocaleString(intlLocale, { maximumFractionDigits: 0 })} kg/m³</dd></div>
            <div><dt>{t('locations.metrics.gravity')}</dt><dd>{selected.gravityG.toLocaleString(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g</dd></div>
            <div><dt>{t('locations.metrics.escapeVelocity')}</dt><dd>{selected.escapeVelocityKmPerSecond.toLocaleString(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km/s</dd></div>
            <div><dt>{t('locations.metrics.meanTemperature')}</dt><dd>{selected.temperatureK.toLocaleString(intlLocale)} K</dd></div>
            <div><dt>{t('locations.metrics.referencePressure')}</dt><dd>{pressureLabel(selected, intlLocale, t)}</dd></div>
            <div><dt>{t('locations.metrics.rotation')}</dt><dd>{Math.abs(selected.rotationPeriodHours).toLocaleString(intlLocale, { maximumFractionDigits: 1 })} h{selected.rotationPeriodHours < 0 ? ` ${t('common.retrograde')}` : ''}</dd></div>
            {selected.orbit ? (
              <>
                <div><dt>{t('locations.metrics.orbitalPeriod')}</dt><dd>{selected.orbit.periodDays.toLocaleString(intlLocale, { maximumFractionDigits: 2 })} {t('common.days')}</dd></div>
                <div><dt>{t('locations.metrics.eccentricity')}</dt><dd>{selected.orbit.eccentricity.toLocaleString(intlLocale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</dd></div>
              </>
            ) : null}
          </dl>
          {selected.facts.length > 0 ? (
            <ul
              className="product-location-card__facts"
              aria-label={t('locations.factsLabel', { name: selected.name })}
            >
              {selected.facts.slice(0, 2).map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
          ) : null}
          <button type="button" className="product-primary-action" onClick={() => onFocus(selected.id)}>
            <LocateFixed size={16} aria-hidden="true" />{' '}
            {t('locations.center', { name: selected.name })}
          </button>
        </article>
      ) : null}

      {satellites.length > 0 ? (
        <section className="product-satellite-list" aria-labelledby="satellites-heading">
          <div className="product-section-heading">
            <span id="satellites-heading">
              {t('locations.satellites', {
                count: numberFormatter.format(satellites.length),
              })}
            </span>
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
                  <span>{distanceLabel(moon, intlLocale, t)}</span>
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
  const { t, i18n } = useTranslation('tools')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(intlLocale),
    [intlLocale],
  )
  const savedDate = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [intlLocale],
  )
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
          {persistence === 'local'
            ? t('bookmarks.storedDevice')
            : t('bookmarks.memoryOnly')}
          <small>
            {t('bookmarks.schemaStatus', {
              count: numberFormatter.format(savedPlaces.length),
              limit: numberFormatter.format(100),
            })}
          </small>
        </span>
        {persistence === 'local' ? (
          <Check size={14} aria-label={t('bookmarks.storageAvailable')} />
        ) : null}
      </div>

      {selected ? (
        <section
          className="product-current-place"
          aria-label={t('bookmarks.currentBodyLabel')}
        >
          <div>
            <span
              className="product-body-swatch"
              style={{ '--body-color': selected.color } as CSSProperties}
              aria-hidden="true"
            />
            <span><small>{t('bookmarks.currentTarget')}</small><strong>{selected.name}</strong></span>
          </div>
          {selectedIsSaved ? (
            <button type="button" onClick={() => onRemove(selected.id)}>
              <Trash2 size={15} aria-hidden="true" /> {t('bookmarks.remove')}
            </button>
          ) : (
            <button type="button" onClick={() => onSave(selected.id)}>
              <BookmarkCheck size={15} aria-hidden="true" /> {t('bookmarks.savePlace')}
            </button>
          )}
        </section>
      ) : (
        <p className="product-inline-note">{t('bookmarks.selectBeforeSaving')}</p>
      )}

      {savedTargets.length > 0 ? (
        <div className="product-saved-list">
          <div className="product-section-heading">
            <span>{t('bookmarks.savedDestinations')}</span>
            <button type="button" onClick={onClearSaved}>{t('bookmarks.clearAll')}</button>
          </div>
          {savedTargets.map(({ place, target }) => (
            <article key={target.id}>
              <button
                type="button"
                aria-label={t('common.centerOrbit', { name: target.name })}
                title={t('common.centerOrbit', { name: target.name })}
                onClick={() => onFocus(target.id)}
              >
                <span
                  className="product-body-swatch"
                  style={{ '--body-color': target.color } as CSSProperties}
                  aria-hidden="true"
                />
                <span>
                  <strong>{target.name}</strong>
                  <time dateTime={place.savedAt}>
                    {t('bookmarks.savedAt', {
                      date: savedDate.format(new Date(place.savedAt)),
                    })}
                  </time>
                </span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t('bookmarks.removeSavedAria', {
                  name: target.name,
                })}
                title={t('bookmarks.removeTitle', { name: target.name })}
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
          <strong>{t('bookmarks.emptyTitle')}</strong>
          <p>{t('bookmarks.emptyHelp')}</p>
        </div>
      )}
    </div>
  )
})

interface DisplayCalibrationControlProps {
  control: DisplayCalibrationControlDefinition
  value: number
  disabled: boolean
  intlLocale: string
  onChange: (key: DisplayCalibrationKey, value: number) => void
}

const DisplayCalibrationControl = memo(function DisplayCalibrationControl({
  control,
  value,
  disabled,
  intlLocale,
  onChange,
}: DisplayCalibrationControlProps) {
  const { t } = useTranslation('tools')
  const inputId = useId()
  const descriptionId = `${inputId}-description`
  const formattedValue = formatCalibrationValue(control, value, intlLocale)
  const progress = ((value - control.min) / (control.max - control.min)) * 100
  const Icon = control.icon

  return (
    <div className="product-calibration-control">
      <div className="product-calibration-control__header">
        <span className="product-calibration-control__icon" aria-hidden="true">
          <Icon size={15} strokeWidth={1.6} />
        </span>
        <label htmlFor={inputId}>
          <strong>
            {t(`settings.calibration.controls.${control.key}.label`)}
          </strong>
          <small id={descriptionId}>
            {t(`settings.calibration.controls.${control.key}.description`)}
          </small>
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
        <span>{formatCalibrationValue(control, control.min, intlLocale)}</span>
        <span>{formatCalibrationValue(control, control.max, intlLocale)}</span>
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
  const { t, i18n } = useTranslation('tools')
  const activeLocale = localeOption(i18n.resolvedLanguage)
  const intlLocale = activeLocale.intlLocale
  const languageId = useId()
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(intlLocale),
    [intlLocale],
  )
  const compactNumber = useMemo(
    () =>
      new Intl.NumberFormat(intlLocale, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    [intlLocale],
  )
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
  const localizedFloatingOrigin = telemetry?.floatingOriginKm
    .split(',')
    .map((coordinate) => {
      const value = Number(coordinate.trim())
      return Number.isFinite(value)
        ? value.toLocaleString(intlLocale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })
        : coordinate.trim()
    })
    .join(', ')

  return (
    <div className="product-settings">
      <section
        className="product-language-settings"
        aria-labelledby="language-heading"
      >
        <div className="product-section-heading">
          <span id="language-heading">{t('settings.language.heading')}</span>
        </div>
        <label htmlFor={languageId}>{t('settings.language.label')}</label>
        <select
          id={languageId}
          value={activeLocale.code}
          onChange={(event) => {
            const nextLocale = LOCALE_OPTIONS.find(
              (option) => option.code === event.currentTarget.value,
            )
            if (nextLocale) void setAppLocale(nextLocale.code)
          }}
        >
          {LOCALE_OPTIONS.map((option) => (
            <option
              key={option.code}
              value={option.code}
              lang={option.htmlLang}
            >
              {option.label}
            </option>
          ))}
        </select>
        <small>{t('settings.language.help')}</small>
      </section>

      <section aria-labelledby="science-model-heading">
        <div className="product-section-heading">
          <span id="science-model-heading">{t('settings.science.heading')}</span>
          <Database size={14} aria-hidden="true" />
        </div>
        <dl className="product-diagnostic-grid">
          <div><dt>{t('settings.science.catalogue')}</dt><dd>{t('common.bodies', { count: numberFormatter.format(targets.length) })}</dd></div>
          <div><dt>{t('settings.science.worlds')}</dt><dd>{numberFormatter.format(planetCount)} + {numberFormatter.format(moonCount)} {t('search.filters.moons').toLocaleLowerCase(intlLocale)}</dd></div>
          <div><dt>{t('settings.science.internalUnits')}</dt><dd>SI / f64</dd></div>
          <div><dt>{t('settings.science.orbitModel')}</dt><dd>{t('settings.science.keplerian')}</dd></div>
          <div><dt>{t('settings.science.constants')}</dt><dd>IAU 2015</dd></div>
          <div><dt>{t('settings.science.provenance')}</dt><dd>{t('settings.science.syntheticDerived')}</dd></div>
        </dl>
        <p className="product-inline-note">
          {t('settings.science.note')}
        </p>
      </section>

      <section
        className="product-display-calibration"
        aria-labelledby="display-calibration-heading"
      >
        <div className="product-section-heading">
          <span id="display-calibration-heading">{t('settings.calibration.heading')}</span>
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
            {t('settings.calibration.reset')}
          </button>
        </div>
        <p className="product-calibration-intro">
          {t('settings.calibration.intro')}
        </p>
        <div className="product-calibration-controls">
          {DISPLAY_CALIBRATION_CONTROLS.map((control) => (
            <DisplayCalibrationControl
              key={control.key}
              control={control}
              value={calibration[control.key]}
              disabled={calibrationDisabled}
              intlLocale={intlLocale}
              onChange={handleCalibrationChange}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="runtime-heading">
        <div className="product-section-heading">
          <span id="runtime-heading">{t('settings.runtime.heading')}</span>
          <Cpu size={14} aria-hidden="true" />
        </div>
        <dl className="product-diagnostic-grid">
          <div><dt>{t('settings.runtime.backend')}</dt><dd>{capabilities?.backend.toUpperCase() ?? t('settings.runtime.starting')}</dd></div>
          <div><dt>{t('settings.runtime.adapter')}</dt><dd>{capabilities?.adapterName ?? t('settings.runtime.browserDefault')}</dd></div>
          <div><dt>WebGPU</dt><dd>{capabilities ? (capabilities.webgpuAvailable ? t('settings.runtime.available') : t('settings.runtime.unavailable')) : t('settings.runtime.checking')}</dd></div>
          <div><dt>{t('settings.runtime.computeStars')}</dt><dd>{capabilities ? (capabilities.computeStarfield ? t('settings.runtime.enabled') : t('settings.runtime.cpuFallback')) : t('settings.runtime.checking')}</dd></div>
          <div><dt>{t('settings.runtime.logDepth')}</dt><dd>{capabilities ? (capabilities.logarithmicDepth ? t('settings.runtime.enabled') : t('settings.runtime.disabled')) : t('settings.runtime.checking')}</dd></div>
          <div><dt>{t('settings.runtime.maxTexture')}</dt><dd>{capabilities?.maxTextureDimension2D ? `${numberFormatter.format(capabilities.maxTextureDimension2D)} px` : t('settings.runtime.unknown')}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="telemetry-heading">
        <div className="product-section-heading">
          <span id="telemetry-heading">{t('settings.telemetry.heading')}</span>
          <Gauge size={14} aria-hidden="true" />
        </div>
        {telemetry ? (
          <dl className="product-telemetry-grid">
            <div><dt>{t('settings.telemetry.frameRate')}</dt><dd>{numberFormatter.format(Math.round(telemetry.fps))} <small>fps</small></dd></div>
            <div><dt>{t('settings.telemetry.frameTime')}</dt><dd>{telemetry.frameTimeMs.toLocaleString(intlLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <small>ms</small></dd></div>
            <div><dt>{t('settings.telemetry.drawCalls')}</dt><dd>{numberFormatter.format(telemetry.drawCalls)}</dd></div>
            <div><dt>{t('settings.telemetry.triangles')}</dt><dd>{compactNumber.format(telemetry.triangles)}</dd></div>
            <div><dt>{t('settings.telemetry.starField')}</dt><dd>{compactNumber.format(telemetry.starCount)}</dd></div>
            <div><dt>{t('settings.telemetry.quality')}</dt><dd>{t(`settings.telemetry.qualityLevels.${telemetry.quality}`)}</dd></div>
          </dl>
        ) : (
          <p className="product-inline-note">{t('settings.telemetry.pending')}</p>
        )}
        {telemetry ? (
          <p className="product-origin-readout">
            {t('settings.telemetry.floatingOrigin', {
              distance: localizedFloatingOrigin,
            })}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="actions-heading">
        <div className="product-section-heading">
          <span id="actions-heading">{t('settings.utilities.heading')}</span>
        </div>
        <div className="product-settings-actions">
          <button type="button" onClick={onResetView}>
            <RefreshCcw size={17} aria-hidden="true" />
            <span><strong>{t('settings.utilities.resetTitle')}</strong><small>{t('settings.utilities.resetHelp')}</small></span>
          </button>
          <button type="button" onClick={onOpenQuickTour}>
            <Orbit size={17} aria-hidden="true" />
            <span><strong>{t('settings.utilities.tourTitle')}</strong><small>{t('settings.utilities.tourHelp')}</small></span>
          </button>
          <button type="button" onClick={onOpenShortcuts}>
            <Keyboard size={17} aria-hidden="true" />
            <span><strong>{t('settings.utilities.shortcutsTitle')}</strong><small>{t('settings.utilities.shortcutsHelp')}</small></span>
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
  const { t } = useTranslation('tools')
  const headingId = useId()
  const title = t(`panel.${tool}.title`)
  const Icon = PANEL_ICONS[tool]

  return (
    <aside className="product-tool-panel" aria-labelledby={headingId}>
      <header className="product-tool-panel__header">
        <span className="product-tool-panel__icon" aria-hidden="true"><Icon size={18} /></span>
        <div>
          <small>{t(`panel.${tool}.eyebrow`)}</small>
          <h2 id={headingId}>{title}</h2>
        </div>
        <button
          type="button"
          aria-label={t('panel.close', { title })}
          onClick={onClose}
        >
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
        <span><kbd>Esc</kbd> {t('footer.explore')}</span>
        <span><kbd>?</kbd> {t('footer.shortcuts')}</span>
      </footer>
    </aside>
  )
}

export const ProductToolPanel = memo(ProductToolPanelComponent)
