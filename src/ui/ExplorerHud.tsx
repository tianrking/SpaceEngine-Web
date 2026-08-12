import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Aperture,
  ArrowDownToLine,
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
  Undo2,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { LOCALE_OPTIONS, isAppLocale, localeOption } from '../i18n/locale'
import { setAppLocale } from '../i18n/i18n'
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

export type InspectorTab = 'overview' | 'physics' | 'orbit'

export type CelestialStatusTone =
  | 'neutral'
  | 'positive'
  | 'caution'
  | 'critical'
  | 'informational'

export interface CelestialClassification {
  label: string
  detail?: string
}

export interface CelestialProvenance {
  source: string
  method?: string
  confidence?: string
  reference?: string
}

export interface CelestialMetricSection {
  id: string
  title: string
  /** Defaults to the Physics tab when omitted. */
  tab?: InspectorTab
  summary?: string
  metrics: CelestialMetric[]
}

export interface CelestialAtmosphereComponent {
  species: string
  amount?: string
}

export interface CelestialAtmosphere {
  summary?: string
  pressure?: string
  composition?: CelestialAtmosphereComponent[]
}

export interface CelestialStatus {
  label: string
  detail?: string
  tone?: CelestialStatusTone
}

export interface CelestialHabitability {
  label: string
  /** Optional normalized score from 0 to 100. */
  score?: number
  summary?: string
  tone?: CelestialStatusTone
  factors?: CelestialMetric[]
}

export interface CelestialCoordinates {
  /** Supply observed/catalogued coordinates only; the HUD never synthesizes them. */
  rightAscension: string
  declination: string
}

export interface SelectedCelestialObject {
  id: string
  name: string
  type: string
  /** Set false when near-body camera approaches are invalid for this object. */
  closeApproachAvailable?: boolean
  designation?: string
  description?: string
  distance?: string
  coordinates?: CelestialCoordinates
  orbitSummary?: string
  metrics?: CelestialMetric[]
  classification?: CelestialClassification
  provenance?: CelestialProvenance
  quickFacts?: CelestialMetric[]
  metricSections?: CelestialMetricSection[]
  atmosphere?: CelestialAtmosphere
  habitability?: CelestialHabitability
  status?: CelestialStatus
}

export type BodyCenteredViewMode = 'orbit' | 'close-approach'
export type CameraFrameMode = 'system' | 'free'

export interface BodyCenteredCameraView {
  centeredObject: Pick<
    SelectedCelestialObject,
    'id' | 'name' | 'type' | 'designation'
  >
  mode: BodyCenteredViewMode
  /** True while the camera is travelling to the requested reference frame. */
  transitioning?: boolean
  /** Set false when a near-body approach is not valid for this body. */
  closeApproachAvailable?: boolean
  /** Optional human-readable destination for the return action. */
  previousViewLabel?: string
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
  /** `undefined` keeps legacy focus UI; `null` means a non-body camera frame. */
  cameraView?: BodyCenteredCameraView | null
  /** Identifies a non-body camera frame when `cameraView` is null. */
  cameraFrameMode?: CameraFrameMode
  /** Distinguishes a non-body frame transition from its settled state. */
  cameraFrameTransitioning?: boolean
  /** @deprecated Use `cameraFrameMode="system"` and `cameraFrameTransitioning`. */
  systemOverviewTransitioning?: boolean
  open?: boolean
  onToggle?: () => void
  onFocus?: () => void
  onCenterSelectedObject?: (mode: BodyCenteredViewMode) => void
  onCameraViewModeChange?: (mode: BodyCenteredViewMode) => void
  onReturnToPreviousView?: () => void
  onSystemOverview?: () => void
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
  /** `undefined` preserves legacy UI; `null` represents a non-body camera frame. */
  cameraView?: BodyCenteredCameraView | null
  /** Identifies a non-body camera frame when `cameraView` is null. */
  cameraFrameMode?: CameraFrameMode
  /** Distinguishes a non-body frame transition from its settled state. */
  cameraFrameTransitioning?: boolean
  /** @deprecated Use `cameraFrameMode="system"` and `cameraFrameTransitioning`. */
  systemOverviewTransitioning?: boolean
  overlay?: ExplorerOverlay
  tourStep?: number
  className?: string
  onToolChange?: (tool: NavigationTool) => void
  onInspectorToggle?: () => void
  onFocusSelectedObject?: () => void
  onCenterSelectedObject?: (mode: BodyCenteredViewMode) => void
  onCameraViewModeChange?: (mode: BodyCenteredViewMode) => void
  onReturnToPreviousView?: () => void
  onSystemOverview?: () => void
  onClearSelectedObject?: () => void
  onOverlayClose?: () => void
  onBeginExploring?: () => void
  onOpenQuickTour?: () => void
  onTourStepChange?: (step: number) => void
}

const QUALITY_PRESETS: QualityPreset[] = ['performance', 'balanced', 'ultra']

const TIME_SCALE_STEPS = [0.25, 0.5, 1, 10, 100, 1_000, 10_000]

const NAVIGATION_ITEMS: Array<{
  tool: NavigationTool
  icon: LucideIcon
  separator?: boolean
}> = [
  { tool: 'home', icon: Home },
  { tool: 'explore', icon: Telescope },
  { tool: 'search', icon: Search, separator: true },
  { tool: 'locations', icon: Map },
  { tool: 'bookmarks', icon: Bookmark },
  { tool: 'settings', icon: Settings2, separator: true },
]

const TOUR_STEPS = [
  {
    key: 'navigate',
    icon: Compass,
  },
  {
    key: 'inspect',
    icon: Database,
  },
  {
    key: 'capture',
    icon: Aperture,
  },
] as const

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

function formatSpeed(speed: number, intlLocale: string) {
  if (!Number.isFinite(speed)) return '—'

  const absoluteSpeed = Math.abs(speed)
  const speedOfLight = 299_792_458

  if (absoluteSpeed >= speedOfLight * 0.01) {
    return `${(absoluteSpeed / speedOfLight).toLocaleString(intlLocale, {
      maximumFractionDigits: 2,
    })} c`
  }

  if (absoluteSpeed >= 1_000) {
    return `${(absoluteSpeed / 1_000).toLocaleString(intlLocale, {
      maximumFractionDigits: absoluteSpeed < 100_000 ? 1 : 0,
    })} km/s`
  }

  return `${absoluteSpeed.toLocaleString(intlLocale, {
    maximumFractionDigits: 0,
  })} m/s`
}

function formatTimeScale(timeScale: number, intlLocale: string) {
  if (!Number.isFinite(timeScale)) return '1×'
  if (timeScale === 0) return '0×'
  if (timeScale < 1) {
    return `${new Intl.NumberFormat(intlLocale, {
      maximumFractionDigits: 2,
    }).format(timeScale)}×`
  }
  return `${timeScale.toLocaleString(intlLocale)}×`
}

function formatFps(fps: number, intlLocale: string) {
  return Number.isFinite(fps)
    ? Math.max(0, Math.round(fps)).toLocaleString(intlLocale)
    : '—'
}

function formatSimulationTime(
  simulationTime: Date | string,
  formatter: Intl.DateTimeFormat,
  unavailable: string,
) {
  if (typeof simulationTime === 'string') return simulationTime
  if (Number.isNaN(simulationTime.getTime())) return unavailable

  return `${formatter.format(simulationTime)} UTC`
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
  const { t, i18n } = useTranslation('hud')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  const gpuStatus = {
    label: t(`status.gpu.${webGpuStatus}Label`),
    detail: t(`status.gpu.${webGpuStatus}Detail`),
  }

  const handleQualityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onQualityChange?.(event.target.value as QualityPreset)
  }

  return (
    <div
      className="se-topbar"
      role="region"
      aria-label={t('status.region')}
      tabIndex={-1}
    >
      <div className="se-brand">
        <span className="se-brand__mark" aria-hidden="true">
          <Orbit size={21} strokeWidth={1.6} />
        </span>
        <span className="se-brand__copy">
          <strong>{t('brand.name')}</strong>
          <small>{t('brand.tagline')}</small>
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

        <div className="se-readout" title={t('status.fpsTitle')}>
          <span>FPS</span>
          <strong>{formatFps(fps, intlLocale)}</strong>
        </div>

        <div className="se-readout se-readout--speed" title={t('status.cameraVelocity')}>
          <Gauge size={15} aria-hidden="true" />
          <strong>{formatSpeed(speed, intlLocale)}</strong>
        </div>

        <label className="se-quality" title={t('status.renderingQuality')}>
          <CircleGauge size={15} aria-hidden="true" />
          <span className="se-sr-only">{t('status.renderingQuality')}</span>
          <select
            value={quality}
            onChange={handleQualityChange}
            disabled={!onQualityChange}
            aria-label={t('status.renderingQuality')}
          >
            {QUALITY_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {t(`status.quality.${preset}`)}
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
          aria-label={t(
            cinematic ? 'status.cinematicDisable' : 'status.cinematicEnable',
          )}
          aria-pressed={cinematic}
          onClick={onToggleCinematic}
          disabled={!onToggleCinematic}
          title={t('status.cinematicTitle')}
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
  const { t } = useTranslation('hud')

  return (
    <nav className="se-nav-rail" aria-label={t('navigation.region')}>
      {NAVIGATION_ITEMS.map(({ tool, icon: Icon, separator }) => {
        const label = t(`navigation.${tool}`)
        return (
        <button
          className={joinClassNames(
            'se-nav-button',
            tool === activeTool && 'is-active',
            separator && 'has-separator',
          )}
          key={tool}
          type="button"
          data-navigation-tool={tool}
          aria-label={label}
          aria-current={tool === activeTool ? 'page' : undefined}
          onClick={() => onToolChange?.(tool)}
          disabled={!onToolChange}
          title={label}
        >
          <Icon size={19} strokeWidth={1.7} />
          <span>{label}</span>
        </button>
        )
      })}
    </nav>
  )
}

function EmptyInspector() {
  const { t } = useTranslation('hud')

  return (
    <div className="se-inspector-empty">
      <span className="se-inspector-empty__reticle" aria-hidden="true">
        <Crosshair size={29} strokeWidth={1.2} />
      </span>
      <div>
        <strong>{t('inspector.emptyTitle')}</strong>
        <p>{t('inspector.emptyDescription')}</p>
      </div>
      <div className="se-key-hint" aria-label={t('inspector.searchShortcut')}>
        <kbd>/</kbd>
        <span>{t('inspector.openSearch')}</span>
      </div>
    </div>
  )
}

const INSPECTOR_TABS: InspectorTab[] = ['overview', 'physics', 'orbit']

interface InspectorMetricGridProps {
  metrics: CelestialMetric[]
  compact?: boolean
}

function InspectorMetricGrid({
  metrics,
  compact = false,
}: InspectorMetricGridProps) {
  return (
    <dl
      className={joinClassNames(
        'se-science-metric-grid',
        compact && 'is-compact',
      )}
    >
      {metrics.map((metric, index) => (
        <div key={`${metric.label}-${metric.value}-${index}`}>
          <dt>{metric.label}</dt>
          <dd>
            <span>{metric.value}</span>
            {metric.unit && <small>{metric.unit}</small>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

interface InspectorMetricSectionProps {
  section: CelestialMetricSection
  headingId: string
}

function InspectorMetricSection({
  section,
  headingId,
}: InspectorMetricSectionProps) {
  const { i18n } = useTranslation('hud')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  if (section.metrics.length === 0 && !section.summary) return null

  return (
    <section className="se-science-section" aria-labelledby={headingId}>
      <div className="se-science-section__heading">
        <span className="se-section-label" id={headingId}>
          {section.title}
        </span>
        {section.metrics.length > 0 && (
          <span aria-hidden="true">
            {section.metrics.length.toLocaleString(intlLocale, {
              minimumIntegerDigits: 2,
              useGrouping: false,
            })}
          </span>
        )}
      </div>
      {section.summary && (
        <p className="se-science-section__summary">{section.summary}</p>
      )}
      {section.metrics.length > 0 && (
        <InspectorMetricGrid metrics={section.metrics} />
      )}
    </section>
  )
}

function InspectorTabEmpty({ children }: { children: string }) {
  return (
    <div className="se-inspector-tab-empty">
      <Orbit size={20} strokeWidth={1.3} aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}

function statusClass(tone: CelestialStatusTone | undefined) {
  return `is-${tone ?? 'neutral'}`
}

interface InspectorOverviewProps {
  object: SelectedCelestialObject
  quickFacts: CelestialMetric[]
  sections: CelestialMetricSection[]
  idBase: string
}

function InspectorOverview({
  object,
  quickFacts,
  sections,
  idBase,
}: InspectorOverviewProps) {
  const { t, i18n } = useTranslation('hud')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  const atmosphere = object.atmosphere
  const habitability = object.habitability
  const provenance = object.provenance
  const habitabilityScore =
    typeof habitability?.score === 'number' &&
    Number.isFinite(habitability.score)
      ? Math.min(100, Math.max(0, habitability.score))
      : null

  return (
    <>
      {(object.classification || object.status?.detail) && (
        <section
          className="se-science-identity"
          aria-labelledby={
            object.classification ? `${idBase}-classification` : undefined
          }
          aria-label={object.classification ? undefined : t('inspector.objectStatus')}
        >
          {object.classification && (
            <div>
              <span className="se-section-label" id={`${idBase}-classification`}>
                {t('inspector.classification')}
              </span>
              <strong>{object.classification.label}</strong>
              {object.classification.detail && (
                <small>{object.classification.detail}</small>
              )}
            </div>
          )}
          {object.status?.detail && (
            <p className="se-science-identity__status">{object.status.detail}</p>
          )}
        </section>
      )}

      {quickFacts.length > 0 && (
        <section
          className="se-science-section"
          aria-labelledby={`${idBase}-quick-facts`}
        >
          <div className="se-science-section__heading">
            <span className="se-section-label" id={`${idBase}-quick-facts`}>
              {t('inspector.quickFacts')}
            </span>
          </div>
          <InspectorMetricGrid metrics={quickFacts} compact />
        </section>
      )}

      {sections.map((section, index) => (
        <InspectorMetricSection
          key={section.id}
          section={section}
          headingId={`${idBase}-overview-${index}`}
        />
      ))}

      {atmosphere && (
        <section
          className="se-science-section se-atmosphere"
          aria-labelledby={`${idBase}-atmosphere`}
        >
          <div className="se-science-section__heading">
            <span className="se-section-label" id={`${idBase}-atmosphere`}>
              {t('inspector.atmosphere')}
            </span>
            {atmosphere.pressure && <span>{atmosphere.pressure}</span>}
          </div>
          {atmosphere.summary && (
            <p className="se-science-section__summary">{atmosphere.summary}</p>
          )}
          {atmosphere.composition && atmosphere.composition.length > 0 && (
            <ul
              className="se-atmosphere__composition"
              aria-label={t('inspector.atmosphereComposition')}
            >
              {atmosphere.composition.map((component, index) => (
                <li key={`${component.species}-${component.amount ?? index}`}>
                  <span>{component.species}</span>
                  {component.amount && <strong>{component.amount}</strong>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {habitability && (
        <section
          className="se-science-section se-habitability"
          aria-labelledby={`${idBase}-habitability`}
        >
          <div className="se-habitability__heading">
            <span className="se-section-label" id={`${idBase}-habitability`}>
              {t('inspector.habitability')}
            </span>
            <span
              className={joinClassNames(
                'se-science-status',
                statusClass(habitability.tone),
              )}
            >
              {habitability.label}
            </span>
          </div>
          {habitabilityScore !== null && (
            <div className="se-habitability__score">
              <meter
                min="0"
                max="100"
                value={habitabilityScore}
                aria-label={t('inspector.habitabilityScore', {
                  score: habitabilityScore.toLocaleString(intlLocale),
                })}
              />
              <strong>
                {Math.round(habitabilityScore).toLocaleString(intlLocale)} / 100
              </strong>
            </div>
          )}
          {habitability.summary && (
            <p className="se-science-section__summary">{habitability.summary}</p>
          )}
          {habitability.factors && habitability.factors.length > 0 && (
            <InspectorMetricGrid metrics={habitability.factors} compact />
          )}
        </section>
      )}

      {object.description && (
        <p className="se-object-description">{object.description}</p>
      )}

      {provenance && (
        <section
          className="se-provenance"
          aria-labelledby={`${idBase}-provenance`}
        >
          <Database size={15} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <span className="se-section-label" id={`${idBase}-provenance`}>
              {t('inspector.provenance')}
            </span>
            <strong>{provenance.source}</strong>
            {(provenance.method || provenance.confidence) && (
              <small>
                {[provenance.method, provenance.confidence]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            )}
            {provenance.reference && <code>{provenance.reference}</code>}
          </div>
        </section>
      )}
    </>
  )
}

interface CameraContextBarProps {
  cameraView: BodyCenteredCameraView | null
  cameraFrameMode: CameraFrameMode
  cameraFrameTransitioning: boolean
  onCameraViewModeChange?: (mode: BodyCenteredViewMode) => void
  onReturnToPreviousView?: () => void
  onSystemOverview?: () => void
}

function CameraContextBar({
  cameraView,
  cameraFrameMode,
  cameraFrameTransitioning,
  onCameraViewModeChange,
  onReturnToPreviousView,
  onSystemOverview,
}: CameraContextBarProps) {
  const { t, i18n } = useTranslation('hud')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  const cameraModeLabel = (mode: BodyCenteredViewMode) =>
    t(mode === 'orbit' ? 'camera.orbitTracking' : 'camera.closeApproach')
  const closeApproachAvailable =
    cameraView?.closeApproachAvailable !== false
  const transitioning = cameraView
    ? cameraView.transitioning === true
    : cameraFrameTransitioning
  const freeFlight = !cameraView && cameraFrameMode === 'free'
  const previousViewLabel =
    cameraView?.previousViewLabel?.trim() || t('camera.previousViewFallback')
  const centeredDesignation = cameraView?.centeredObject.designation?.trim()
  const cameraModeDetail = cameraView
    ? transitioning
      ? t('camera.preparingMode', {
          mode: cameraModeLabel(cameraView.mode).toLocaleLowerCase(intlLocale),
        })
      : cameraModeLabel(cameraView.mode)
    : freeFlight
      ? t('camera.bodyTrackingUnlocked')
      : t('camera.systemUnlocked')

  const cameraAnnouncement = cameraView
    ? transitioning
      ? t('camera.centerOn', { name: cameraView.centeredObject.name })
      : t('camera.centeredAnnouncement', {
          name: cameraView.centeredObject.name,
          mode: cameraModeLabel(cameraView.mode),
        })
    : freeFlight
      ? transitioning
        ? t('camera.returnFree')
        : t('camera.freeFlight')
      : transitioning
        ? t('camera.returnSystem')
        : t('camera.systemOverview')

  return (
    <>
      <span
        className="se-sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {cameraAnnouncement}
      </span>
      <section
        className={joinClassNames(
          'se-camera-context-bar',
          !cameraView && 'is-system',
        )}
        aria-label={
          cameraView
            ? t('camera.bodyControls')
            : freeFlight
              ? t('camera.freeControls')
              : t('camera.systemControls')
        }
        aria-busy={transitioning || undefined}
      >
        <div className="se-camera-context-bar__identity" key="identity">
          {cameraView ? (
            <Crosshair size={18} strokeWidth={1.6} aria-hidden="true" />
          ) : freeFlight ? (
            <Compass size={18} strokeWidth={1.6} aria-hidden="true" />
          ) : (
            <Maximize2 size={18} strokeWidth={1.6} aria-hidden="true" />
          )}
          <p>
            <span>{t('camera.reference')}</span>
            <strong>
              {cameraView
                ? transitioning
                  ? t('camera.centerOnEllipsis', {
                      name: cameraView.centeredObject.name,
                    })
                  : t('camera.centeredOn', {
                      name: cameraView.centeredObject.name,
                    })
                : transitioning
                  ? freeFlight
                    ? t('camera.returnFreeEllipsis')
                    : t('camera.returnSystemEllipsis')
                  : freeFlight
                    ? t('camera.freeFlight')
                    : t('camera.systemOverview')}
            </strong>
            <small>
              {[centeredDesignation, cameraModeDetail]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </p>
        </div>

        {cameraView ? (
          <div
            className="se-camera-mode-switch"
            role="group"
            aria-label={t('camera.viewModeFor', {
              name: cameraView.centeredObject.name,
            })}
            key="modes"
          >
            <button
              type="button"
              aria-pressed={cameraView.mode === 'orbit'}
              onClick={() => onCameraViewModeChange?.('orbit')}
              disabled={
                transitioning ||
                !onCameraViewModeChange ||
                cameraView.mode === 'orbit'
              }
              title={
                cameraView.mode === 'orbit'
                  ? t('camera.currentOrbit')
                  : t('camera.trackOrbit')
              }
            >
              <Orbit size={15} aria-hidden="true" />
              <span>{t('camera.orbit')}</span>
              <kbd aria-hidden="true">G</kbd>
            </button>
            <button
              type="button"
              aria-pressed={cameraView.mode === 'close-approach'}
              onClick={() => onCameraViewModeChange?.('close-approach')}
              disabled={
                transitioning ||
                !onCameraViewModeChange ||
                !closeApproachAvailable ||
                cameraView.mode === 'close-approach'
              }
              title={
                cameraView.mode === 'close-approach'
                  ? t('camera.currentClose')
                  : closeApproachAvailable
                    ? t('camera.moveClose')
                    : t('camera.closeUnavailable')
              }
            >
              <ArrowDownToLine size={15} aria-hidden="true" />
              <span>{t('camera.closeApproach')}</span>
              <kbd aria-hidden="true">⇧G</kbd>
            </button>
          </div>
        ) : null}

        <div className="se-camera-context-bar__actions" key="actions">
          <button
            data-camera-history-action="true"
            type="button"
            onClick={onReturnToPreviousView}
            disabled={transitioning || !onReturnToPreviousView}
            aria-label={t('camera.returnTo', { view: previousViewLabel })}
            title={t('camera.returnToTitle', { view: previousViewLabel })}
          >
            <Undo2 size={15} aria-hidden="true" />
            <span>{t('camera.previousView')}</span>
          </button>
          <button
            type="button"
            onClick={onSystemOverview}
            disabled={
              transitioning ||
              !onSystemOverview ||
              (!cameraView && !freeFlight)
            }
            title={
              !cameraView && !freeFlight
                ? t('camera.currentSystem')
                : t('camera.returnSystemTitle')
            }
          >
            <Maximize2 size={15} aria-hidden="true" />
            <span>{t('camera.systemOverview')}</span>
          </button>
        </div>
      </section>
    </>
  )
}

export function ObjectInspector({
  selectedObject,
  cameraView,
  cameraFrameMode,
  cameraFrameTransitioning,
  systemOverviewTransitioning,
  open = true,
  onToggle,
  onFocus,
  onCenterSelectedObject,
  onCameraViewModeChange,
  onReturnToPreviousView,
  onSystemOverview,
  onClear,
}: ObjectInspectorProps) {
  const { t } = useTranslation('hud')
  const contentId = useId()
  const tabIdBase = useId()
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview')

  useEffect(() => {
    setActiveTab('overview')
  }, [selectedObject?.id])

  const handleTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % INSPECTOR_TABS.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex =
        (currentIndex - 1 + INSPECTOR_TABS.length) % INSPECTOR_TABS.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = INSPECTOR_TABS.length - 1
    }

    if (nextIndex === null) return
    event.preventDefault()
    const nextTab = INSPECTOR_TABS[nextIndex]
    setActiveTab(nextTab)
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(nextIndex)
      .focus()
  }

  const quickFacts = selectedObject
    ? (selectedObject.quickFacts ??
      [
        ...(selectedObject.distance
          ? [{ label: t('inspector.distance'), value: selectedObject.distance }]
          : []),
        ...(selectedObject.metrics ?? []),
      ].slice(0, 4))
    : []
  const overviewSections =
    selectedObject?.metricSections?.filter((section) => section.tab === 'overview') ?? []
  const physicsSections = selectedObject
    ? [
        ...(selectedObject.metrics && selectedObject.metrics.length > 0
          ? [
              {
                id: 'legacy-physical-profile',
                title: t('inspector.physicalProfile'),
                tab: 'physics' as const,
                metrics: selectedObject.metrics,
              },
            ]
          : []),
        ...(selectedObject.metricSections?.filter(
          (section) => (section.tab ?? 'physics') === 'physics',
        ) ?? []),
      ]
    : []
  const orbitSections =
    selectedObject?.metricSections?.filter((section) => section.tab === 'orbit') ?? []
  const observedPosition: CelestialMetric[] = selectedObject
    ? [
        ...(selectedObject.distance
          ? [{ label: t('inspector.distance'), value: selectedObject.distance }]
          : []),
        ...(selectedObject.coordinates
          ? [
              {
                label: t('inspector.rightAscension'),
                value: selectedObject.coordinates.rightAscension,
              },
              {
                label: t('inspector.declination'),
                value: selectedObject.coordinates.declination,
              },
            ]
          : []),
      ]
    : []
  const cameraAware =
    cameraView !== undefined ||
    cameraFrameMode !== undefined ||
    cameraFrameTransitioning !== undefined ||
    systemOverviewTransitioning !== undefined ||
    Boolean(
      onCenterSelectedObject ||
        onCameraViewModeChange ||
        onReturnToPreviousView ||
        onSystemOverview,
    )
  const cameraTargetsSelection = Boolean(
    selectedObject && cameraView?.centeredObject.id === selectedObject.id,
  )
  const resolvedFrameTransitioning =
    cameraFrameTransitioning ?? systemOverviewTransitioning ?? false
  const resolvedCameraFrameMode = cameraFrameMode ?? 'system'
  const cameraTransitioning = cameraView
    ? cameraView.transitioning === true
    : resolvedFrameTransitioning
  const freeFlight = !cameraView && resolvedCameraFrameMode === 'free'
  const selectedIsCentered = cameraTargetsSelection && !cameraTransitioning
  const closeApproachAvailable =
    selectedObject?.closeApproachAvailable !== false &&
    (!selectedIsCentered || cameraView?.closeApproachAvailable !== false)
  const canOrbit = selectedIsCentered
    ? Boolean(onCameraViewModeChange || onCenterSelectedObject || onFocus)
    : Boolean(onCenterSelectedObject || onFocus)
  const canCloseApproach = selectedIsCentered
    ? Boolean(onCameraViewModeChange || onCenterSelectedObject)
    : Boolean(onCenterSelectedObject)
  const orbitIsCurrent =
    selectedIsCentered && cameraView?.mode === 'orbit'
  const closeApproachIsCurrent =
    selectedIsCentered && cameraView?.mode === 'close-approach'
  const orbitIsTransitioning =
    cameraTargetsSelection &&
    cameraTransitioning &&
    cameraView?.mode === 'orbit'
  const closeApproachIsTransitioning =
    cameraTargetsSelection &&
    cameraTransitioning &&
    cameraView?.mode === 'close-approach'

  const handleOrbitSelected = () => {
    if (selectedIsCentered && onCameraViewModeChange) {
      onCameraViewModeChange('orbit')
    } else if (onCenterSelectedObject) {
      onCenterSelectedObject('orbit')
    } else {
      onFocus?.()
    }
  }

  const handleCloseApproachSelected = () => {
    if (selectedIsCentered && onCameraViewModeChange) {
      onCameraViewModeChange('close-approach')
    } else {
      onCenterSelectedObject?.('close-approach')
    }
  }

  return (
    <aside
      className={joinClassNames('se-inspector', !open && 'is-collapsed')}
      aria-label={t('inspector.region')}
    >
      <button
        className="se-inspector__collapse"
        type="button"
        aria-label={t(open ? 'inspector.collapse' : 'inspector.open')}
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
              <span className="se-panel-heading__eyebrow">
                {t('inspector.eyebrow')}
              </span>
              <strong>{t('inspector.telemetry')}</strong>
            </div>
            {selectedObject && (
              <button
                className="se-quiet-button"
                type="button"
                aria-label={t('inspector.clear')}
                onClick={onClear}
                disabled={!onClear}
                title={t('inspector.clearTitle')}
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
                <div className="se-object-title__meta">
                  <span className="se-object-title__type">
                    <Globe2 size={14} aria-hidden="true" />
                    {selectedObject.type}
                  </span>
                  {selectedObject.status && (
                    <span
                      className={joinClassNames(
                        'se-science-status',
                        statusClass(selectedObject.status.tone),
                      )}
                    >
                      {selectedObject.status.label}
                    </span>
                  )}
                </div>
                <h2>{selectedObject.name}</h2>
                {selectedObject.designation && (
                  <p>{selectedObject.designation}</p>
                )}
                {cameraAware && (
                  <div
                    className="se-object-view-states"
                    aria-label={t('inspector.stateLabel')}
                  >
                    <span className="is-selected">
                      <Crosshair size={11} aria-hidden="true" />{' '}
                      {t('inspector.selected')}
                    </span>
                    {selectedIsCentered && (
                      <span className="is-centered">
                        <LocateFixed size={11} aria-hidden="true" />{' '}
                        {t('inspector.centered')}
                      </span>
                    )}
                    {cameraView &&
                      !cameraTargetsSelection &&
                      !cameraTransitioning && (
                        <span
                          className="is-centered"
                          title={t('inspector.cameraCenteredTitle', {
                            name: cameraView.centeredObject.name,
                          })}
                        >
                          <LocateFixed size={11} aria-hidden="true" />
                          {t('inspector.centeredOn', {
                            name: cameraView.centeredObject.name,
                          })}
                        </span>
                      )}
                    {cameraTargetsSelection && cameraTransitioning && (
                      <span className="is-transitioning">
                        <Crosshair size={11} aria-hidden="true" />{' '}
                        {t('inspector.centering')}
                      </span>
                    )}
                    {cameraView &&
                      !cameraTargetsSelection &&
                      cameraTransitioning && (
                        <span
                          className="is-transitioning"
                          title={t('inspector.cameraCenteringTitle', {
                            name: cameraView.centeredObject.name,
                          })}
                        >
                          <Crosshair size={11} aria-hidden="true" />
                          {t('inspector.centeringOn', {
                            name: cameraView.centeredObject.name,
                          })}
                        </span>
                      )}
                  </div>
                )}
              </div>

              {cameraAware ? (
                <>
                  <dl className="se-object-camera-context">
                    <div>
                      <dt>{t('camera.selected')}</dt>
                      <dd>{selectedObject.name}</dd>
                    </div>
                    <div>
                      <dt>{t('camera.camera')}</dt>
                      <dd>
                        {cameraView ? (
                          <>
                            {cameraTransitioning
                              ? t('camera.centerOnEllipsis', {
                                  name: cameraView.centeredObject.name,
                                })
                              : t('camera.centeredOn', {
                                  name: cameraView.centeredObject.name,
                                })}
                            <small>
                              {cameraTransitioning
                                ? t('camera.transitionInProgress')
                                : t(
                                    cameraView.mode === 'orbit'
                                      ? 'camera.orbitTracking'
                                      : 'camera.closeApproach',
                                  )}
                            </small>
                          </>
                        ) : (
                          <>
                            {cameraTransitioning
                              ? freeFlight
                                ? t('camera.returnFreeEllipsis')
                                : t('camera.returnSystemEllipsis')
                              : freeFlight
                                ? t('camera.freeFlight')
                                : cameraFrameMode === 'system' ||
                                    systemOverviewTransitioning === false
                                  ? t('camera.systemOverview')
                                  : t('camera.systemFrame')}
                            <small>
                              {cameraTransitioning
                                ? t('camera.transitionInProgress')
                                : freeFlight
                                  ? t('camera.bodyTrackingUnlocked')
                                  : t('camera.notLocked')}
                            </small>
                          </>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div
                    className="se-inspector-camera-actions"
                    role="group"
                    aria-label={t('camera.centerCameraOn', {
                      name: selectedObject.name,
                    })}
                    aria-busy={cameraTransitioning || undefined}
                  >
                    <button
                      data-camera-focus-return="true"
                      type="button"
                      aria-pressed={
                        orbitIsCurrent
                      }
                      onClick={handleOrbitSelected}
                      disabled={
                        !canOrbit ||
                        cameraTransitioning ||
                        orbitIsCurrent
                      }
                      title={t('camera.orbitSelectedTitle')}
                    >
                      <Orbit size={16} aria-hidden="true" />
                      <span>
                        <strong>
                          {orbitIsCurrent
                            ? t('camera.currentView')
                            : orbitIsTransitioning
                              ? `${t('inspector.centering')}…`
                              : t('camera.orbit')}
                        </strong>
                        <small>
                          {orbitIsCurrent
                            ? t('camera.orbitTracking')
                            : orbitIsTransitioning
                              ? selectedObject.name
                              : t('camera.trackSelected')}
                        </small>
                      </span>
                      <kbd aria-hidden="true">G</kbd>
                    </button>
                    <button
                      type="button"
                      aria-pressed={
                        closeApproachIsCurrent
                      }
                      onClick={handleCloseApproachSelected}
                      disabled={
                        !canCloseApproach ||
                        !closeApproachAvailable ||
                        cameraTransitioning ||
                        closeApproachIsCurrent
                      }
                      title={
                        closeApproachAvailable
                          ? t('camera.closeSelectedTitle')
                          : t('camera.closeUnavailable')
                      }
                    >
                      <ArrowDownToLine size={16} aria-hidden="true" />
                      <span>
                        <strong>
                          {closeApproachIsCurrent
                            ? t('camera.currentView')
                            : closeApproachIsTransitioning
                              ? `${t('inspector.centering')}…`
                              : t('camera.closeApproach')}
                        </strong>
                        <small>
                          {closeApproachIsCurrent
                            ? t('camera.closeApproach')
                            : closeApproachIsTransitioning
                              ? selectedObject.name
                              : t('camera.nearBodyInspection')}
                        </small>
                      </span>
                      <kbd aria-hidden="true">⇧G</kbd>
                    </button>
                  </div>
                </>
              ) : (
                <button
                  className="se-primary-action"
                  type="button"
                  onClick={onFocus}
                  disabled={!onFocus}
                >
                  <LocateFixed size={17} />
                  {t('inspector.centerTarget')}
                  <span aria-hidden="true">G</span>
                </button>
              )}

              <div
                className="se-inspector-tabs"
                role="tablist"
                aria-label={t('inspector.tabsLabel')}
              >
                {INSPECTOR_TABS.map((tab, index) => (
                  <button
                    key={tab}
                    id={`${tabIdBase}-${tab}-tab`}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    aria-controls={`${tabIdBase}-${tab}-panel`}
                    tabIndex={activeTab === tab ? 0 : -1}
                    onClick={() => setActiveTab(tab)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                  >
                    {t(`inspector.tabs.${tab}`)}
                  </button>
                ))}
              </div>

              <div
                className="se-inspector-tab-panel"
                id={`${tabIdBase}-overview-panel`}
                role="tabpanel"
                aria-labelledby={`${tabIdBase}-overview-tab`}
                tabIndex={0}
                hidden={activeTab !== 'overview'}
              >
                <InspectorOverview
                  object={selectedObject}
                  quickFacts={quickFacts}
                  sections={overviewSections}
                  idBase={`${tabIdBase}-overview`}
                />
              </div>

              <div
                className="se-inspector-tab-panel"
                id={`${tabIdBase}-physics-panel`}
                role="tabpanel"
                aria-labelledby={`${tabIdBase}-physics-tab`}
                tabIndex={0}
                hidden={activeTab !== 'physics'}
              >
                {physicsSections.length > 0 ? (
                  physicsSections.map((section, index) => (
                    <InspectorMetricSection
                      key={section.id}
                      section={section}
                      headingId={`${tabIdBase}-physics-${index}`}
                    />
                  ))
                ) : (
                  <InspectorTabEmpty>
                    {t('inspector.noPhysics')}
                  </InspectorTabEmpty>
                )}
              </div>

              <div
                className="se-inspector-tab-panel"
                id={`${tabIdBase}-orbit-panel`}
                role="tabpanel"
                aria-labelledby={`${tabIdBase}-orbit-tab`}
                tabIndex={0}
                hidden={activeTab !== 'orbit'}
              >
                {selectedObject.orbitSummary && (
                  <p className="se-orbit-summary">{selectedObject.orbitSummary}</p>
                )}
                {observedPosition.length > 0 && (
                  <section
                    className="se-science-section"
                    aria-labelledby={`${tabIdBase}-observed-position`}
                  >
                    <div className="se-science-section__heading">
                      <span
                        className="se-section-label"
                        id={`${tabIdBase}-observed-position`}
                      >
                        {t('inspector.referenceDistance')}
                      </span>
                    </div>
                    <InspectorMetricGrid metrics={observedPosition} />
                  </section>
                )}
                {orbitSections.map((section, index) => (
                  <InspectorMetricSection
                    key={section.id}
                    section={section}
                    headingId={`${tabIdBase}-orbit-${index}`}
                  />
                ))}
                {!selectedObject.orbitSummary &&
                  observedPosition.length === 0 &&
                  orbitSections.length === 0 && (
                    <InspectorTabEmpty>
                      {t('inspector.noOrbit')}
                    </InspectorTabEmpty>
                  )}
              </div>
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
  const { t, i18n } = useTranslation('hud')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  const simulationTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(intlLocale, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'UTC',
    }),
    [intlLocale],
  )

  return (
    <section className="se-time-controls" aria-label={t('time.region')}>
      <div className="se-time-controls__date">
        <Clock3 size={15} aria-hidden="true" />
        <div>
          <span>{t('time.label')}</span>
          <strong>
            {formatSimulationTime(
              simulationTime,
              simulationTimeFormatter,
              t('time.unavailable'),
            )}
          </strong>
        </div>
      </div>

      <div className="se-time-controls__transport">
        <button
          className="se-transport-button"
          type="button"
          aria-label={t('time.decrease')}
          onClick={() =>
            onTimeScaleChange?.(adjacentTimeScale(timeScale, -1))
          }
          disabled={!onTimeScaleChange}
          title={t('time.decrease')}
        >
          <Rewind size={17} />
        </button>
        <button
          className="se-transport-button se-transport-button--primary"
          type="button"
          aria-label={t(paused ? 'time.resume' : 'time.pause')}
          aria-pressed={paused}
          onClick={onTogglePause}
          disabled={!onTogglePause}
        >
          {paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} />}
        </button>
        <button
          className="se-transport-button"
          type="button"
          aria-label={t('time.increase')}
          onClick={() => onTimeScaleChange?.(adjacentTimeScale(timeScale, 1))}
          disabled={!onTimeScaleChange}
          title={t('time.increase')}
        >
          <FastForward size={17} />
        </button>
      </div>

      <div className="se-time-controls__scale">
        <span>{t('time.scale')}</span>
        <strong aria-live="polite">
          {paused ? t('time.paused') : formatTimeScale(timeScale, intlLocale)}
        </strong>
      </div>

      <button
        className="se-icon-button se-time-controls__reset"
        type="button"
        aria-label={t('time.reset')}
        onClick={onResetTime}
        disabled={!onResetTime}
        title={t('time.realTime')}
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
  const { t } = useTranslation('hud')

  return (
    <div className="se-welcome-card">
      <OverlayLocaleSelect />
      <button
        className="se-overlay-close"
        type="button"
        aria-label={t('welcome.close')}
        onClick={onClose}
        disabled={!onClose}
      >
        <X size={18} />
      </button>

      <div className="se-welcome-card__mark" aria-hidden="true">
        <Orbit size={42} strokeWidth={1.15} />
        <span />
      </div>
      <div className="se-welcome-card__eyebrow">{t('welcome.eyebrow')}</div>
      <h1 id={titleId}>{t('welcome.title')}</h1>
      <p className="se-welcome-card__lede" id={descriptionId}>
        {t('welcome.description')}
      </p>

      <div
        className="se-capabilities"
        role="group"
        aria-label={t('welcome.capabilities')}
      >
        <div>
          <Maximize2 size={17} aria-hidden="true" />
          <span>
            <strong>{t('welcome.navigationTitle')}</strong>
            {t('welcome.navigationDetail')}
          </span>
        </div>
        <div>
          <Sparkles size={17} aria-hidden="true" />
          <span>
            <strong>{t('welcome.worldsTitle')}</strong>
            {t('welcome.worldsDetail')}
          </span>
        </div>
        <div>
          <Zap size={17} aria-hidden="true" />
          <span>
            <strong>{t('welcome.gpuTitle')}</strong>
            {t('welcome.gpuDetail')}
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
          {t('welcome.begin')}
          <ChevronRight size={18} />
        </button>
        <button
          className="se-welcome-secondary"
          type="button"
          onClick={onOpenQuickTour}
          disabled={!onOpenQuickTour}
        >
          <HelpCircle size={17} />
          {t('welcome.tour')}
        </button>
      </div>

      <small className="se-welcome-card__note">
        {t('welcome.note')}
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
  const { t, i18n } = useTranslation('hud')
  const normalizedStep = Number.isFinite(tourStep) ? Math.trunc(tourStep) : 0
  const safeStep = Math.min(Math.max(0, normalizedStep), TOUR_STEPS.length - 1)
  const current = TOUR_STEPS[safeStep]
  const currentEyebrow = t(`tour.steps.${current.key}Eyebrow`)
  const currentTitle = t(`tour.steps.${current.key}Title`)
  const currentDescription = t(`tour.steps.${current.key}Description`)
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
          <span>{t('tour.fieldGuide')}</span>
          <div className="se-tour-card__topline-actions">
            <OverlayLocaleSelect />
            <button
              className="se-quiet-button"
              type="button"
              aria-label={t('tour.close')}
              onClick={onClose}
              disabled={!onClose}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="se-tour-card__step">{currentEyebrow}</div>
        <h2 id={titleId}>{currentTitle}</h2>
        <p id={descriptionId}>{currentDescription}</p>

        <div className="se-tour-progress" aria-label={t('tour.progress')}>
          {TOUR_STEPS.map((step, index) => (
            <button
              className={joinClassNames(index === safeStep && 'is-active')}
              key={step.key}
              type="button"
              aria-label={t('tour.goToStep', {
                step: (index + 1).toLocaleString(
                  localeOption(i18n.resolvedLanguage).intlLocale,
                ),
              })}
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
            {t('tour.back')}
          </button>
          {isLastStep ? (
            <button
              className="se-welcome-primary"
              type="button"
              onClick={onBeginExploring}
              disabled={!onBeginExploring}
            >
              {t('tour.enter')}
              <ChevronRight size={17} />
            </button>
          ) : (
            <button
              className="se-welcome-primary"
              type="button"
              onClick={() => onTourStepChange?.(safeStep + 1)}
              disabled={!onTourStepChange}
            >
              {t('tour.next')}
              <ChevronRight size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function OverlayLocaleSelect() {
  const { t, i18n } = useTranslation('hud')
  const locale = localeOption(i18n.resolvedLanguage).code

  const handleLocaleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextLocale = event.currentTarget.value
    if (isAppLocale(nextLocale)) void setAppLocale(nextLocale)
  }

  return (
    <label className="se-overlay-locale" title={t('locale.label')}>
      <Globe2 size={14} aria-hidden="true" />
      <span className="se-sr-only">{t('locale.label')}</span>
      <select
        value={locale}
        onChange={handleLocaleChange}
        aria-label={t('locale.label')}
      >
        {LOCALE_OPTIONS.map((option) => (
          <option key={option.code} value={option.code} lang={option.htmlLang}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
  cameraView,
  cameraFrameMode,
  cameraFrameTransitioning,
  systemOverviewTransitioning,
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
  onCenterSelectedObject,
  onCameraViewModeChange,
  onReturnToPreviousView,
  onSystemOverview,
  onClearSelectedObject,
  onTogglePause,
  onTimeScaleChange,
  onResetTime,
  onOverlayClose,
  onBeginExploring,
  onOpenQuickTour,
  onTourStepChange,
}: ExplorerHudProps) {
  const hudRef = useRef<HTMLDivElement>(null)
  const resolvedCameraFrameMode = cameraFrameMode ?? 'system'
  const resolvedCameraFrameTransitioning =
    cameraFrameTransitioning ?? systemOverviewTransitioning ?? false
  const previousCameraViewRef = useRef(cameraView)
  const previousCameraFrameTransitioningRef = useRef(
    resolvedCameraFrameTransitioning,
  )
  const cameraFocusReturnRef = useRef<HTMLElement | null>(null)
  const showCameraContext =
    cameraView !== undefined &&
    (cameraView !== null ||
      cameraFrameMode !== undefined ||
      resolvedCameraFrameTransitioning ||
      Boolean(onReturnToPreviousView))

  const rememberCameraFocusTarget = useCallback(() => {
    cameraFocusReturnRef.current =
      hudRef.current?.querySelector<HTMLElement>(
        '[data-camera-focus-return="true"]',
      ) ??
      hudRef.current?.querySelector<HTMLElement>(
        '.se-nav-button.is-active:not(:disabled)',
      ) ??
      null
  }, [])

  const handleReturnToPreviousView = useCallback(() => {
    rememberCameraFocusTarget()
    onReturnToPreviousView?.()
  }, [onReturnToPreviousView, rememberCameraFocusTarget])

  const handleSystemOverview = useCallback(() => {
    rememberCameraFocusTarget()
    onSystemOverview?.()
  }, [onSystemOverview, rememberCameraFocusTarget])

  useEffect(() => {
    const previousCameraView = previousCameraViewRef.current
    const previousCameraFrameTransitioning =
      previousCameraFrameTransitioningRef.current
    previousCameraViewRef.current = cameraView
    previousCameraFrameTransitioningRef.current =
      resolvedCameraFrameTransitioning

    const enteredSettledFrame = Boolean(
      previousCameraView &&
        cameraView === null &&
        !resolvedCameraFrameTransitioning,
    )
    const frameTransitionSettled =
      cameraView === null &&
      previousCameraFrameTransitioning &&
      !resolvedCameraFrameTransitioning
    const bodyTransitionSettled = Boolean(
      cameraView &&
        previousCameraView?.transitioning &&
        !cameraView.transitioning,
    )
    if (
      !cameraFocusReturnRef.current ||
      (!enteredSettledFrame &&
        !frameTransitionSettled &&
        !bodyTransitionSettled)
    ) {
      return
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      if (
        canRestoreFocus(activeElement) &&
        !hudRef.current?.contains(activeElement)
      ) {
        cameraFocusReturnRef.current = null
        return
      }
      const focusTarget =
        hudRef.current?.querySelector<HTMLElement>(
          '[data-camera-history-action="true"]:not(:disabled)',
        ) ??
        hudRef.current?.querySelector<HTMLElement>(
          '[data-camera-focus-return="true"]:not(:disabled)',
        ) ??
        hudRef.current?.querySelector<HTMLElement>(
          '.se-nav-button.is-active:not(:disabled)',
        ) ??
        cameraFocusReturnRef.current
      cameraFocusReturnRef.current = null
      if (canRestoreFocus(focusTarget)) {
        focusTarget?.focus({ preventScroll: true })
      }
    })
    return () => window.cancelAnimationFrame(animationFrame)
  }, [cameraView, resolvedCameraFrameTransitioning])

  return (
    <div
      ref={hudRef}
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
            cameraView={cameraView}
            cameraFrameMode={cameraFrameMode}
            cameraFrameTransitioning={cameraFrameTransitioning}
            systemOverviewTransitioning={systemOverviewTransitioning}
            open={inspectorOpen}
            onToggle={onInspectorToggle}
            onFocus={onFocusSelectedObject}
            onCenterSelectedObject={onCenterSelectedObject}
            onCameraViewModeChange={onCameraViewModeChange}
            onReturnToPreviousView={
              onReturnToPreviousView
                ? handleReturnToPreviousView
                : undefined
            }
            onSystemOverview={
              onSystemOverview ? handleSystemOverview : undefined
            }
            onClear={onClearSelectedObject}
          />

          {showCameraContext && (
            <CameraContextBar
              cameraView={cameraView ?? null}
              cameraFrameMode={resolvedCameraFrameMode}
              cameraFrameTransitioning={resolvedCameraFrameTransitioning}
              onCameraViewModeChange={onCameraViewModeChange}
              onReturnToPreviousView={
                onReturnToPreviousView
                  ? handleReturnToPreviousView
                  : undefined
              }
              onSystemOverview={
                onSystemOverview ? handleSystemOverview : undefined
              }
            />
          )}

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
