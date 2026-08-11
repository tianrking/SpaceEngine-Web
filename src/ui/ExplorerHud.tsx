import { useEffect, useId, useRef } from 'react'
import type { ChangeEvent } from 'react'
import {
  Aperture,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Clock3,
  Compass,
  Crosshair,
  Database,
  FastForward,
  Gauge,
  Globe2,
  HelpCircle,
  Home,
  LocateFixed,
  Map,
  Maximize2,
  Orbit,
  Pause,
  Play,
  Rewind,
  Search,
  Settings2,
  Sparkles,
  Telescope,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import './ExplorerHud.css'

export type WebGpuStatus =
  | 'active'
  | 'initializing'
  | 'fallback'
  | 'unavailable'

export type QualityPreset = 'performance' | 'balanced' | 'ultra'

export type NavigationTool =
  | 'home'
  | 'explore'
  | 'search'
  | 'locations'
  | 'bookmarks'
  | 'settings'

export type ExplorerOverlay = 'welcome' | 'quick-tour' | null

export interface CelestialMetric {
  label: string
  value: string
  unit?: string
}

export interface CelestialCoordinates {
  rightAscension: string
  declination: string
}

export interface SelectedCelestialObject {
  id: string
  name: string
  type: string
  designation?: string
  description?: string
  distance?: string
  coordinates?: CelestialCoordinates
  metrics?: CelestialMetric[]
}

export interface TopStatusBarProps {
  webGpuStatus: WebGpuStatus
  fps: number
  /** Current camera velocity in metres per second. */
  speed: number
  quality: QualityPreset
  cinematic: boolean
  onQualityChange?: (quality: QualityPreset) => void
  onToggleCinematic?: () => void
}

export interface NavigationRailProps {
  activeTool?: NavigationTool
  onToolChange?: (tool: NavigationTool) => void
}

export interface ObjectInspectorProps {
  selectedObject?: SelectedCelestialObject | null
  open?: boolean
  onToggle?: () => void
  onFocus?: () => void
  onClear?: () => void
}

export interface TimeControlsProps {
  simulationTime: Date | string
  timeScale: number
  paused?: boolean
  onTogglePause?: () => void
  onTimeScaleChange?: (timeScale: number) => void
  onResetTime?: () => void
}

export interface WelcomeOverlayProps {
  mode: Exclude<ExplorerOverlay, null>
  tourStep?: number
  onClose?: () => void
  onBeginExploring?: () => void
  onOpenQuickTour?: () => void
  onTourStepChange?: (step: number) => void
}

export interface ExplorerHudProps
  extends TopStatusBarProps,
    TimeControlsProps {
  selectedObject?: SelectedCelestialObject | null
  activeTool?: NavigationTool
  inspectorOpen?: boolean
  overlay?: ExplorerOverlay
  tourStep?: number
  className?: string
  onToolChange?: (tool: NavigationTool) => void
  onInspectorToggle?: () => void
  onFocusSelectedObject?: () => void
  onClearSelectedObject?: () => void
  onOverlayClose?: () => void
  onBeginExploring?: () => void
  onOpenQuickTour?: () => void
  onTourStepChange?: (step: number) => void
}

const GPU_STATUS: Record<
  WebGpuStatus,
  { label: string; detail: string }
> = {
  active: { label: 'WebGPU active', detail: 'Native compute' },
  initializing: { label: 'GPU starting', detail: 'Preparing pipeline' },
  fallback: { label: 'WebGL fallback', detail: 'Compatibility mode' },
  unavailable: { label: 'GPU unavailable', detail: 'Rendering paused' },
}

const QUALITY_LABELS: Record<QualityPreset, string> = {
  performance: 'Performance',
  balanced: 'Balanced',
  ultra: 'Ultra',
}

const TIME_SCALE_STEPS = [0.25, 0.5, 1, 10, 100, 1_000, 10_000]

const NAVIGATION_ITEMS: Array<{
  tool: NavigationTool
  label: string
  icon: LucideIcon
  separator?: boolean
}> = [
  { tool: 'home', label: 'Observation deck', icon: Home },
  { tool: 'explore', label: 'Explore', icon: Telescope },
  { tool: 'search', label: 'Search', icon: Search, separator: true },
  { tool: 'locations', label: 'Star map', icon: Map },
  { tool: 'bookmarks', label: 'Saved places', icon: Bookmark },
  { tool: 'settings', label: 'Settings', icon: Settings2, separator: true },
]

const TOUR_STEPS = [
  {
    eyebrow: '01 · Navigate',
    title: 'Move without boundaries',
    description:
      'Select a target, focus its orbit, then accelerate smoothly from planetary scale to interstellar space.',
    icon: Compass,
  },
  {
    eyebrow: '02 · Inspect',
    title: 'Read the universe',
    description:
      'Every selected body exposes physical properties, live coordinates and procedural classification in one place.',
    icon: Database,
  },
  {
    eyebrow: '03 · Capture',
    title: 'Compose the impossible',
    description:
      'Use cinematic mode to clear visual noise and frame eclipses, rings, atmospheres and deep-space vistas.',
    icon: Aperture,
  },
]

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hidden &&
      element.getAttribute('aria-hidden') !== 'true' &&
      !element.closest('[hidden], [aria-hidden="true"]'),
  )
}

function canRestoreFocus(element: HTMLElement | null) {
  if (!element || element === document.body || !element.isConnected) return false
  if (element.matches(':disabled')) return false
  if (element.getAttribute('aria-disabled') === 'true') return false

  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function formatSpeed(speed: number) {
  if (!Number.isFinite(speed)) return '—'

  const absoluteSpeed = Math.abs(speed)
  const speedOfLight = 299_792_458

  if (absoluteSpeed >= speedOfLight * 0.01) {
    return `${(absoluteSpeed / speedOfLight).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })} c`
  }

  if (absoluteSpeed >= 1_000) {
    return `${(absoluteSpeed / 1_000).toLocaleString(undefined, {
      maximumFractionDigits: absoluteSpeed < 100_000 ? 1 : 0,
    })} km/s`
  }

  return `${absoluteSpeed.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })} m/s`
}

function formatTimeScale(timeScale: number) {
  if (!Number.isFinite(timeScale)) return '1×'
  if (timeScale === 0) return '0×'
  if (timeScale < 1) {
    return `${timeScale.toFixed(2).replace(/\.?0+$/, '')}×`
  }
  return `${timeScale.toLocaleString()}×`
}

function formatFps(fps: number) {
  return Number.isFinite(fps) ? Math.max(0, Math.round(fps)) : '—'
}

function formatSimulationTime(simulationTime: Date | string) {
  if (typeof simulationTime === 'string') return simulationTime
  if (Number.isNaN(simulationTime.getTime())) return 'Time unavailable'

  return simulationTime
    .toISOString()
    .replace('T', ' · ')
    .replace(/\.\d{3}Z$/, ' UTC')
}

function adjacentTimeScale(current: number, direction: -1 | 1) {
  if (direction > 0) {
    return TIME_SCALE_STEPS.find((step) => step > current) ?? TIME_SCALE_STEPS.at(-1)!
  }

  return (
    [...TIME_SCALE_STEPS].reverse().find((step) => step < current) ??
    TIME_SCALE_STEPS[0]
  )
}

export function TopStatusBar({
  webGpuStatus,
  fps,
  speed,
  quality,
  cinematic,
  onQualityChange,
  onToggleCinematic,
}: TopStatusBarProps) {
  const gpuStatus = GPU_STATUS[webGpuStatus]

  const handleQualityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onQualityChange?.(event.target.value as QualityPreset)
  }

  return (
    <div
      className="se-topbar"
      role="region"
      aria-label="Simulation status"
      tabIndex={-1}
    >
      <div className="se-brand">
        <span className="se-brand__mark" aria-hidden="true">
          <Orbit size={21} strokeWidth={1.6} />
        </span>
        <span className="se-brand__copy">
          <strong>Astral Surveyor</strong>
          <small>Universe observatory</small>
        </span>
      </div>

      <div className="se-topbar__telemetry">
        <div
          className={joinClassNames(
            'se-gpu-status',
            `se-gpu-status--${webGpuStatus}`,
          )}
          title={gpuStatus.detail}
          role="status"
          aria-label={`${gpuStatus.label}. ${gpuStatus.detail}`}
        >
          <span className="se-gpu-status__dot" aria-hidden="true" />
          <span aria-hidden="true">{gpuStatus.label}</span>
        </div>

        <div className="se-readout" title="Rendered frames per second">
          <span>FPS</span>
          <strong>{formatFps(fps)}</strong>
        </div>

        <div className="se-readout se-readout--speed" title="Camera velocity">
          <Gauge size={15} aria-hidden="true" />
          <strong>{formatSpeed(speed)}</strong>
        </div>

        <label className="se-quality" title="Rendering quality">
          <CircleGauge size={15} aria-hidden="true" />
          <span className="se-sr-only">Rendering quality</span>
          <select
            value={quality}
            onChange={handleQualityChange}
            disabled={!onQualityChange}
            aria-label="Rendering quality"
          >
            {(Object.keys(QUALITY_LABELS) as QualityPreset[]).map((preset) => (
              <option key={preset} value={preset}>
                {QUALITY_LABELS[preset]}
              </option>
            ))}
          </select>
        </label>

        <button
          className={joinClassNames(
            'se-icon-button',
            cinematic && 'is-active',
          )}
          type="button"
          aria-label={`${cinematic ? 'Disable' : 'Enable'} cinematic mode`}
          aria-pressed={cinematic}
          onClick={onToggleCinematic}
          disabled={!onToggleCinematic}
          title="Cinematic mode"
        >
          <Aperture size={18} />
        </button>
      </div>
    </div>
  )
}

export function NavigationRail({
  activeTool = 'explore',
  onToolChange,
}: NavigationRailProps) {
  return (
    <nav className="se-nav-rail" aria-label="Universe navigation">
      {NAVIGATION_ITEMS.map(({ tool, label, icon: Icon, separator }) => (
        <button
          className={joinClassNames(
            'se-nav-button',
            tool === activeTool && 'is-active',
            separator && 'has-separator',
          )}
          key={tool}
          type="button"
          aria-label={label}
          aria-current={tool === activeTool ? 'page' : undefined}
          onClick={() => onToolChange?.(tool)}
          disabled={!onToolChange}
          title={label}
        >
          <Icon size={19} strokeWidth={1.7} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

function EmptyInspector() {
  return (
    <div className="se-inspector-empty">
      <span className="se-inspector-empty__reticle" aria-hidden="true">
        <Crosshair size={29} strokeWidth={1.2} />
      </span>
      <div>
        <strong>No target selected</strong>
        <p>Choose a world, star or deep-space object to inspect it.</p>
      </div>
      <div className="se-key-hint" aria-label="Keyboard shortcut: slash">
        <kbd>/</kbd>
        <span>Open universal search</span>
      </div>
    </div>
  )
}

export function ObjectInspector({
  selectedObject,
  open = true,
  onToggle,
  onFocus,
  onClear,
}: ObjectInspectorProps) {
  const contentId = useId()

  return (
    <aside
      className={joinClassNames('se-inspector', !open && 'is-collapsed')}
      aria-label="Selected object inspector"
    >
      <button
        className="se-inspector__collapse"
        type="button"
        aria-label={open ? 'Collapse object inspector' : 'Open object inspector'}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
        disabled={!onToggle}
      >
        {open ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
      </button>

      {open && (
        <div className="se-inspector__content" id={contentId}>
          <div className="se-panel-heading">
            <div>
              <span className="se-panel-heading__eyebrow">Object analysis</span>
              <strong>Live telemetry</strong>
            </div>
            {selectedObject && (
              <button
                className="se-quiet-button"
                type="button"
                aria-label="Clear selected object"
                onClick={onClear}
                disabled={!onClear}
                title="Clear selection"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {!selectedObject ? (
            <EmptyInspector />
          ) : (
            <>
              <div className="se-object-title">
                <span className="se-object-title__type">
                  <Globe2 size={14} aria-hidden="true" />
                  {selectedObject.type}
                </span>
                <h2>{selectedObject.name}</h2>
                {selectedObject.designation && (
                  <p>{selectedObject.designation}</p>
                )}
              </div>

              <button
                className="se-primary-action"
                type="button"
                onClick={onFocus}
                disabled={!onFocus}
              >
                <LocateFixed size={17} />
                Focus target
                <span aria-hidden="true">F</span>
              </button>

              {(selectedObject.distance || selectedObject.coordinates) && (
                <dl className="se-position-grid">
                  {selectedObject.distance && (
                    <div>
                      <dt>Distance</dt>
                      <dd>{selectedObject.distance}</dd>
                    </div>
                  )}
                  {selectedObject.coordinates && (
                    <>
                      <div>
                        <dt>Right ascension</dt>
                        <dd>{selectedObject.coordinates.rightAscension}</dd>
                      </div>
                      <div>
                        <dt>Declination</dt>
                        <dd>{selectedObject.coordinates.declination}</dd>
                      </div>
                    </>
                  )}
                </dl>
              )}

              {selectedObject.metrics && selectedObject.metrics.length > 0 && (
                <section className="se-metrics" aria-labelledby="metrics-heading">
                  <div className="se-section-label" id="metrics-heading">
                    Physical profile
                  </div>
                  <dl>
                    {selectedObject.metrics.map((metric) => (
                      <div key={`${metric.label}-${metric.value}`}>
                        <dt>{metric.label}</dt>
                        <dd>
                          {metric.value}
                          {metric.unit && <small>{metric.unit}</small>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {selectedObject.description && (
                <p className="se-object-description">
                  {selectedObject.description}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  )
}

export function TimeControls({
  simulationTime,
  timeScale,
  paused = false,
  onTogglePause,
  onTimeScaleChange,
  onResetTime,
}: TimeControlsProps) {
  return (
    <section className="se-time-controls" aria-label="Simulation time controls">
      <div className="se-time-controls__date">
        <Clock3 size={15} aria-hidden="true" />
        <div>
          <span>Simulation time</span>
          <strong>{formatSimulationTime(simulationTime)}</strong>
        </div>
      </div>

      <div className="se-time-controls__transport">
        <button
          className="se-transport-button"
          type="button"
          aria-label="Decrease time scale"
          onClick={() =>
            onTimeScaleChange?.(adjacentTimeScale(timeScale, -1))
          }
          disabled={!onTimeScaleChange}
          title="Decrease time scale"
        >
          <Rewind size={17} />
        </button>
        <button
          className="se-transport-button se-transport-button--primary"
          type="button"
          aria-label={paused ? 'Resume simulation' : 'Pause simulation'}
          aria-pressed={paused}
          onClick={onTogglePause}
          disabled={!onTogglePause}
        >
          {paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} />}
        </button>
        <button
          className="se-transport-button"
          type="button"
          aria-label="Increase time scale"
          onClick={() => onTimeScaleChange?.(adjacentTimeScale(timeScale, 1))}
          disabled={!onTimeScaleChange}
          title="Increase time scale"
        >
          <FastForward size={17} />
        </button>
      </div>

      <div className="se-time-controls__scale">
        <span>Time scale</span>
        <strong aria-live="polite">
          {paused ? 'Paused' : formatTimeScale(timeScale)}
        </strong>
      </div>

      <button
        className="se-icon-button se-time-controls__reset"
        type="button"
        aria-label="Reset simulation time"
        onClick={onResetTime}
        disabled={!onResetTime}
        title="Return to real time"
      >
        <Clock3 size={17} />
      </button>
    </section>
  )
}

function WelcomePanel({
  titleId,
  descriptionId,
  onClose,
  onBeginExploring,
  onOpenQuickTour,
}: Pick<
  WelcomeOverlayProps,
  'onClose' | 'onBeginExploring' | 'onOpenQuickTour'
> & { titleId: string; descriptionId: string }) {
  return (
    <div className="se-welcome-card">
      <button
        className="se-overlay-close"
        type="button"
        aria-label="Close welcome screen"
        onClick={onClose}
        disabled={!onClose}
      >
        <X size={18} />
      </button>

      <div className="se-welcome-card__mark" aria-hidden="true">
        <Orbit size={42} strokeWidth={1.15} />
        <span />
      </div>
      <div className="se-welcome-card__eyebrow">
        WebGPU universe simulator
      </div>
      <h1 id={titleId}>Every horizon is reachable.</h1>
      <p className="se-welcome-card__lede" id={descriptionId}>
        Cross astronomical scales, study procedural worlds and descend from
        deep space to the surface without breaking the journey.
      </p>

      <div className="se-capabilities" role="group" aria-label="Core capabilities">
        <div>
          <Maximize2 size={17} aria-hidden="true" />
          <span>
            <strong>Seamless scale</strong>
            Orbit to terrain
          </span>
        </div>
        <div>
          <Sparkles size={17} aria-hidden="true" />
          <span>
            <strong>Living worlds</strong>
            Procedural detail
          </span>
        </div>
        <div>
          <Zap size={17} aria-hidden="true" />
          <span>
            <strong>GPU native</strong>
            Compute driven
          </span>
        </div>
      </div>

      <div className="se-welcome-card__actions">
        <button
          className="se-welcome-primary"
          type="button"
          onClick={onBeginExploring}
          disabled={!onBeginExploring}
        >
          Begin exploration
          <ChevronRight size={18} />
        </button>
        <button
          className="se-welcome-secondary"
          type="button"
          onClick={onOpenQuickTour}
          disabled={!onOpenQuickTour}
        >
          <HelpCircle size={17} />
          Take the 30-second tour
        </button>
      </div>

      <small className="se-welcome-card__note">
        Mouse + keyboard recommended · Touch controls supported
      </small>
    </div>
  )
}

function QuickTourPanel({
  titleId,
  descriptionId,
  tourStep = 0,
  onClose,
  onBeginExploring,
  onTourStepChange,
}: Pick<
  WelcomeOverlayProps,
  'tourStep' | 'onClose' | 'onBeginExploring' | 'onTourStepChange'
> & { titleId: string; descriptionId: string }) {
  const normalizedStep = Number.isFinite(tourStep) ? Math.trunc(tourStep) : 0
  const safeStep = Math.min(Math.max(0, normalizedStep), TOUR_STEPS.length - 1)
  const current = TOUR_STEPS[safeStep]
  const CurrentIcon = current.icon
  const isLastStep = safeStep === TOUR_STEPS.length - 1

  return (
    <div className="se-tour-card">
      <div className="se-tour-card__visual" aria-hidden="true">
        <span className="se-tour-card__orbit se-tour-card__orbit--outer" />
        <span className="se-tour-card__orbit se-tour-card__orbit--inner" />
        <CurrentIcon size={38} strokeWidth={1.2} />
      </div>

      <div className="se-tour-card__content">
        <div className="se-tour-card__topline">
          <span>Field guide</span>
          <button
            className="se-quiet-button"
            type="button"
            aria-label="Close quick tour"
            onClick={onClose}
            disabled={!onClose}
          >
            <X size={17} />
          </button>
        </div>

        <div className="se-tour-card__step">{current.eyebrow}</div>
        <h2 id={titleId}>{current.title}</h2>
        <p id={descriptionId}>{current.description}</p>

        <div className="se-tour-progress" aria-label="Tour progress">
          {TOUR_STEPS.map((step, index) => (
            <button
              className={joinClassNames(index === safeStep && 'is-active')}
              key={step.eyebrow}
              type="button"
              aria-label={`Go to tour step ${index + 1}`}
              aria-current={index === safeStep ? 'step' : undefined}
              onClick={() => onTourStepChange?.(index)}
              disabled={!onTourStepChange}
            />
          ))}
        </div>

        <div className="se-tour-card__actions">
          <button
            className="se-welcome-secondary"
            type="button"
            onClick={() => onTourStepChange?.(Math.max(0, safeStep - 1))}
            disabled={safeStep === 0 || !onTourStepChange}
          >
            <ChevronLeft size={17} />
            Back
          </button>
          {isLastStep ? (
            <button
              className="se-welcome-primary"
              type="button"
              onClick={onBeginExploring}
              disabled={!onBeginExploring}
            >
              Enter universe
              <ChevronRight size={17} />
            </button>
          ) : (
            <button
              className="se-welcome-primary"
              type="button"
              onClick={() => onTourStepChange?.(safeStep + 1)}
              disabled={!onTourStepChange}
            >
              Next
              <ChevronRight size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function WelcomeOverlay({
  mode,
  tourStep,
  onClose,
  onBeginExploring,
  onOpenQuickTour,
  onTourStepChange,
}: WelcomeOverlayProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const hudRoot = dialogRef.current?.closest('.se-hud')
    const getFocusFallback = () =>
      hudRoot?.querySelector<HTMLElement>(
        '.se-topbar .se-icon-button:not([disabled])',
      ) ??
      hudRoot?.querySelector<HTMLElement>('.se-topbar select:not([disabled])') ??
      hudRoot?.querySelector<HTMLElement>('.se-topbar') ??
      null

    return () => {
      const returnTarget = canRestoreFocus(previouslyFocusedElement)
        ? previouslyFocusedElement
        : getFocusFallback()
      if (canRestoreFocus(returnTarget)) {
        returnTarget?.focus({ preventScroll: true })
      }
    }
  }, [])

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true })
  }, [mode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        onClose?.()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements(dialog)
      if (focusableElements.length === 0) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        dialog.focus({ preventScroll: true })
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements.at(-1)!
      const activeElement = document.activeElement
      const activeIndex = focusableElements.findIndex(
        (element) => element === activeElement,
      )
      const nextElement = event.shiftKey
        ? activeIndex <= 0
          ? lastElement
          : focusableElements[activeIndex - 1]
        : activeIndex < 0 || activeIndex === focusableElements.length - 1
          ? firstElement
          : focusableElements[activeIndex + 1]

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      nextElement.focus({ preventScroll: true })
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      className="se-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
    >
      <div className="se-overlay__scrim" aria-hidden="true" />
      {mode === 'welcome' ? (
        <WelcomePanel
          titleId={titleId}
          descriptionId={descriptionId}
          onClose={onClose}
          onBeginExploring={onBeginExploring}
          onOpenQuickTour={onOpenQuickTour}
        />
      ) : (
        <QuickTourPanel
          titleId={titleId}
          descriptionId={descriptionId}
          tourStep={tourStep}
          onClose={onClose}
          onBeginExploring={onBeginExploring}
          onTourStepChange={onTourStepChange}
        />
      )}
    </div>
  )
}

export function ExplorerHud({
  selectedObject,
  webGpuStatus,
  fps,
  speed,
  timeScale,
  simulationTime,
  quality,
  cinematic,
  overlay = null,
  tourStep = 0,
  activeTool = 'explore',
  inspectorOpen = true,
  paused = false,
  className,
  onQualityChange,
  onToggleCinematic,
  onToolChange,
  onInspectorToggle,
  onFocusSelectedObject,
  onClearSelectedObject,
  onTogglePause,
  onTimeScaleChange,
  onResetTime,
  onOverlayClose,
  onBeginExploring,
  onOpenQuickTour,
  onTourStepChange,
}: ExplorerHudProps) {
  return (
    <div
      className={joinClassNames(
        'se-hud',
        cinematic && 'se-hud--cinematic',
        className,
      )}
    >
      <TopStatusBar
        webGpuStatus={webGpuStatus}
        fps={fps}
        speed={speed}
        quality={quality}
        cinematic={cinematic}
        onQualityChange={onQualityChange}
        onToggleCinematic={onToggleCinematic}
      />

      {!cinematic && (
        <>
          <NavigationRail activeTool={activeTool} onToolChange={onToolChange} />

          <ObjectInspector
            selectedObject={selectedObject}
            open={inspectorOpen}
            onToggle={onInspectorToggle}
            onFocus={onFocusSelectedObject}
            onClear={onClearSelectedObject}
          />

          <TimeControls
            simulationTime={simulationTime}
            timeScale={timeScale}
            paused={paused}
            onTogglePause={onTogglePause}
            onTimeScaleChange={onTimeScaleChange}
            onResetTime={onResetTime}
          />
        </>
      )}

      {overlay && (
        <WelcomeOverlay
          mode={overlay}
          tourStep={tourStep}
          onClose={onOverlayClose}
          onBeginExploring={onBeginExploring}
          onOpenQuickTour={onOpenQuickTour}
          onTourStepChange={onTourStepChange}
        />
      )}
    </div>
  )
}

export default ExplorerHud
