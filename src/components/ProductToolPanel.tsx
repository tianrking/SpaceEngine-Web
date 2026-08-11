import {
  memo,
  useDeferredValue,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import {
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
} from 'lucide-react'
import type { CelestialBodyView, EngineCapabilities } from '../engine/types'
import type { SavedPlace, SavedPlacesPersistence } from './useSavedPlaces'

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

interface ProductToolPanelProps {
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
}

const KIND_LABELS: Record<CelestialBodyView['kind'], string> = {
  star: 'Main-sequence star',
  terrestrial: 'Terrestrial world',
  oceanic: 'Ocean world',
  desert: 'Desert world',
  'gas-giant': 'Gas giant',
  'ice-giant': 'Ice giant',
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

function distanceLabel(target: CelestialBodyView): string {
  return target.id === 'asteria' ? 'System origin' : `${target.distanceAu.toFixed(2)} AU`
}

function filterTargets(
  targets: readonly CelestialBodyView[],
  query: string,
): readonly CelestialBodyView[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return targets
  return targets.filter((target) =>
    [target.name, target.designation, target.kind, target.description, target.atmosphere]
      .some((value) => value.toLocaleLowerCase().includes(needle)),
  )
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
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const results = useMemo(
    () => filterTargets(targets, deferredQuery),
    [deferredQuery, targets],
  )

  return (
    <div className="product-search">
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
            const firstMatch = filterTargets(targets, event.currentTarget.value)[0]
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

      <p className="product-search__status" role="status" aria-live="polite">
        {results.length} {results.length === 1 ? 'destination' : 'destinations'} found
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
                    <small>{target.designation}</small>
                  </span>
                  <span className="product-target-row__distance">{distanceLabel(target)}</span>
                </button>
                <button
                  className="product-target-row__focus"
                  type="button"
                  aria-label={`Focus ${target.name}`}
                  title={`Focus ${target.name}`}
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

  return (
    <div className="product-locations">
      <div className="product-system-summary">
        <div>
          <small>Procedural system</small>
          <strong>{targets.length} indexed bodies</strong>
        </div>
        <span><Sparkles size={14} aria-hidden="true" /> Seed 7A51E2</span>
      </div>

      <div
        className="product-orbit-map"
        role="img"
        aria-label="Schematic map of the Asteria system"
      >
        <span className="product-orbit-map__axis" aria-hidden="true" />
        {targets.slice(1).map((target, index) => (
          <span
            key={`${target.id}-orbit`}
            className="product-orbit-map__ring"
            style={{ '--orbit-size': `${56 + index * 38}px` } as CSSProperties}
            aria-hidden="true"
          />
        ))}
        {targets.map((target, index) => {
          const selectedTarget = selectedId === target.id
          const pointStyle = {
            '--map-angle': `${index * 137.5 - 40}deg`,
            '--map-radius': `${index === 0 ? 0 : 28 + index * 19}px`,
            '--body-color': target.color,
          } as CSSProperties
          return (
            <button
              key={target.id}
              className={`product-map-point${index === 0 ? ' is-star' : ''}${selectedTarget ? ' is-selected' : ''}`}
              style={pointStyle}
              type="button"
              aria-label={`Select ${target.name}, ${KIND_LABELS[target.kind]}`}
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
              <small>{KIND_LABELS[selected.kind]}</small>
              <h3>{selected.name}</h3>
              <p>{selected.designation}</p>
            </div>
            <strong>{distanceLabel(selected)}</strong>
          </header>
          <p>{selected.description}</p>
          <dl>
            <div><dt>Atmosphere</dt><dd>{selected.atmosphere}</dd></div>
            <div><dt>Mean radius</dt><dd>{selected.radiusKm.toLocaleString()} km</dd></div>
            <div><dt>Temperature</dt><dd>{selected.temperatureK.toLocaleString()} K</dd></div>
          </dl>
          <button type="button" className="product-primary-action" onClick={() => onFocus(selected.id)}>
            <LocateFixed size={16} aria-hidden="true" /> Focus {selected.name}
          </button>
        </article>
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
              <button type="button" onClick={() => onFocus(target.id)}>
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

interface SettingsToolProps {
  capabilities: EngineCapabilities | null
  telemetry: ProductTelemetrySummary | null
  onResetView: () => void
  onOpenQuickTour: () => void
  onOpenShortcuts: () => void
}

const SettingsTool = memo(function SettingsTool({
  capabilities,
  telemetry,
  onResetView,
  onOpenQuickTour,
  onOpenShortcuts,
}: SettingsToolProps) {
  return (
    <div className="product-settings">
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
            capabilities={capabilities}
            telemetry={telemetry}
            onResetView={onResetView}
            onOpenQuickTour={onOpenQuickTour}
            onOpenShortcuts={onOpenShortcuts}
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
