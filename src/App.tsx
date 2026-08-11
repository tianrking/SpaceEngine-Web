import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Cpu, Layers3, LoaderCircle, Sparkles } from 'lucide-react'
import {
  ProductToolPanel,
  type ProductTelemetrySummary,
  type ProductTool,
} from './components/ProductToolPanel'
import { ShortcutHelpDialog } from './components/ShortcutHelpDialog'
import { SystemNavigator } from './components/SystemNavigator'
import { useSavedPlaces } from './components/useSavedPlaces'
import { ASTRONOMICAL_UNIT_METERS, formatDistance } from './domain'
import { BODY_LOOKUP, NAVIGATION_TARGETS, STAR } from './engine/catalog'
import type { CosmosEngine as CosmosEngineInstance } from './engine/CosmosEngine'
import type {
  CelestialBodyView,
  EngineCapabilities,
  EngineTelemetry,
  QualityLevel,
} from './engine/types'
import {
  ExplorerHud,
  type ExplorerOverlay,
  type NavigationTool,
  type QualityPreset,
  type SelectedCelestialObject,
  type WebGpuStatus,
} from './ui/ExplorerHud'
import './App.css'

const INITIAL_DATE = new Date(Date.UTC(2187, 2, 20, 14, 32, 0))

const INITIAL_TELEMETRY: EngineTelemetry = {
  backend: 'webgl2',
  fps: 0,
  frameTimeMs: 0,
  drawCalls: 0,
  triangles: 0,
  starCount: 0,
  cameraSpeed: 0,
  cameraAltitudeKm: null,
  simulationDate: INITIAL_DATE,
  timeScale: 1,
  quality: 'balanced',
  floatingOriginKm: [0, 0, 0],
}

const QUALITY_TO_ENGINE: Record<QualityPreset, QualityLevel> = {
  performance: 'battery',
  balanced: 'balanced',
  ultra: 'ultra',
}

const PRODUCT_TARGETS: readonly CelestialBodyView[] = NAVIGATION_TARGETS.flatMap(
  ({ id }) => {
    const target = BODY_LOOKUP.get(id)
    return target ? [target] : []
  },
)

const PRODUCT_TARGET_IDS = PRODUCT_TARGETS.map((target) => target.id)

function toProductTool(tool: NavigationTool): ProductTool | null {
  return tool === 'search' ||
    tool === 'locations' ||
    tool === 'bookmarks' ||
    tool === 'settings'
    ? tool
    : null
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

const NAVIGATION_TOOL_LABELS: Record<NavigationTool, string> = {
  home: 'Observation deck',
  explore: 'Explore',
  search: 'Search',
  locations: 'Star map',
  bookmarks: 'Saved places',
  settings: 'Settings',
}

function focusNavigationTool(tool: NavigationTool): void {
  const label = NAVIGATION_TOOL_LABELS[tool]
  window.requestAnimationFrame(() => {
    document
      .querySelector<HTMLButtonElement>(`.se-nav-button[aria-label="${label}"]`)
      ?.focus()
  })
}

function coordinatesFor(body: CelestialBodyView) {
  const seed = body.id.split('').reduce((total, character) => total + character.charCodeAt(0), 0)
  const hours = seed % 24
  const minutes = (seed * 7) % 60
  const degrees = (seed % 121) - 60
  const arcMinutes = (seed * 11) % 60
  return {
    rightAscension: `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`,
    declination: `${degrees >= 0 ? '+' : '−'}${String(Math.abs(degrees)).padStart(2, '0')}° ${String(arcMinutes).padStart(2, '0')}′`,
  }
}

function toHudObject(body: CelestialBodyView): SelectedCelestialObject {
  return {
    id: body.id,
    name: body.name,
    type: body.kind.replace('-', ' '),
    designation: body.designation,
    description: body.description,
    distance:
      body.id === STAR.id
        ? 'System barycenter'
        : formatDistance(body.distanceAu * ASTRONOMICAL_UNIT_METERS, {
            maximumFractionDigits: 2,
          }),
    coordinates: coordinatesFor(body),
    metrics: [
      { label: 'Mean radius', value: body.radiusKm.toLocaleString(), unit: 'km' },
      { label: 'Mass', value: body.massEarths.toLocaleString(undefined, { maximumFractionDigits: 2 }), unit: 'M⊕' },
      { label: 'Temperature', value: body.temperatureK.toLocaleString(), unit: 'K' },
      { label: 'Surface gravity', value: body.gravityG.toFixed(2), unit: 'g' },
      ...(body.orbitalPeriodDays > 0
        ? [{ label: 'Orbital period', value: body.orbitalPeriodDays.toLocaleString(), unit: 'days' }]
        : []),
    ],
  }
}

function App() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<CosmosEngineInstance | null>(null)
  const previousTimeScaleRef = useRef(1)
  const currentTimeScaleRef = useRef(1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const overlayReturnFocusRef = useRef<HTMLElement | null>(null)
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY)
  const [capabilities, setCapabilities] = useState<EngineCapabilities | null>(null)
  const [selectedBody, setSelectedBody] = useState<CelestialBodyView | null>(STAR)
  const [overlay, setOverlay] = useState<ExplorerOverlay>('welcome')
  const [tourStep, setTourStep] = useState(0)
  const [quality, setQuality] = useState<QualityPreset>('balanced')
  const [cinematic, setCinematic] = useState(false)
  const [activeTool, setActiveTool] = useState<NavigationTool>('explore')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const {
    places: savedPlaces,
    persistence: savedPlacesPersistence,
    addPlace,
    removePlace,
    clearPlaces,
  } = useSavedPlaces(PRODUCT_TARGET_IDS)

  useEffect(() => {
    const host = viewportRef.current
    if (!host) return

    let active = true
    let engine: CosmosEngineInstance | null = null

    const bootEngine = async () => {
      const { CosmosEngine } = await import('./engine/CosmosEngine')
      if (!active) return
      engine = new CosmosEngine(host, {
        onReady: (nextCapabilities) => {
          if (active) setCapabilities(nextCapabilities)
        },
        onTelemetry: (nextTelemetry) => {
          if (active) {
            currentTimeScaleRef.current = nextTelemetry.timeScale
            setTelemetry(nextTelemetry)
          }
        },
        onSelection: (body) => {
          if (active) {
            setSelectedBody(body)
            setInspectorOpen(true)
          }
        },
        onError: (error) => {
          if (active) setEngineError(error.message)
        },
      })
      engineRef.current = engine
      await engine.init()
    }

    void bootEngine().catch((reason: unknown) => {
      if (active) setEngineError(reason instanceof Error ? reason.message : String(reason))
    })

    return () => {
      active = false
      engineRef.current = null
      engine?.dispose()
    }
  }, [])

  const hudObject = useMemo(
    () => (selectedBody ? toHudObject(selectedBody) : null),
    [selectedBody],
  )

  const webGpuStatus: WebGpuStatus = engineError
    ? 'unavailable'
    : capabilities === null
      ? 'initializing'
      : capabilities.backend === 'webgpu'
        ? 'active'
        : 'fallback'

  const handleQualityChange = useCallback((nextQuality: QualityPreset) => {
    setQuality(nextQuality)
    engineRef.current?.setQuality(QUALITY_TO_ENGINE[nextQuality])
  }, [])

  const handleTimeScaleChange = useCallback((nextScale: number) => {
    if (nextScale !== 0) previousTimeScaleRef.current = nextScale
    currentTimeScaleRef.current = nextScale
    engineRef.current?.setTimeScale(nextScale)
    setTelemetry((current) => ({ ...current, timeScale: nextScale }))
  }, [])

  const handleTogglePause = useCallback(() => {
    const currentScale = currentTimeScaleRef.current
    const nextScale = currentScale === 0 ? previousTimeScaleRef.current : 0
    if (currentScale !== 0) previousTimeScaleRef.current = currentScale
    currentTimeScaleRef.current = nextScale
    engineRef.current?.setTimeScale(nextScale)
    setTelemetry((current) => ({ ...current, timeScale: nextScale }))
  }, [])

  const handleResetTime = useCallback(() => {
    previousTimeScaleRef.current = 1
    currentTimeScaleRef.current = 1
    engineRef.current?.resetSimulationTime()
    setTelemetry((current) => ({ ...current, timeScale: 1, simulationDate: INITIAL_DATE }))
  }, [])

  const handleSelectTarget = useCallback((id: string) => {
    const body = BODY_LOOKUP.get(id)
    if (body) {
      setSelectedBody(body)
      setInspectorOpen(true)
    }
    engineRef.current?.select(id)
  }, [])

  const handleFocusTarget = useCallback((id: string, surface = false) => {
    engineRef.current?.focusOn(id, surface)
    setActiveTool('explore')
  }, [])

  const handleOpenSearch = useCallback(() => {
    setOverlay(null)
    setCinematic(false)
    setActiveTool('search')
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [])

  const handleToolChange = useCallback((tool: NavigationTool) => {
    setOverlay(null)
    if (tool === 'home') {
      engineRef.current?.resetView()
      setActiveTool('explore')
      return
    }
    if (tool === 'search') {
      handleOpenSearch()
      return
    }
    setActiveTool(tool)
    if (tool !== 'explore') setCinematic(false)
  }, [handleOpenSearch])

  const handleResetView = useCallback(() => {
    engineRef.current?.resetView()
    setCinematic(false)
    setActiveTool('explore')
  }, [])

  const handleOpenQuickTour = useCallback(() => {
    overlayReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setCinematic(false)
    setTourStep(0)
    setOverlay('quick-tour')
  }, [])

  const handleCloseTool = useCallback(() => {
    setActiveTool('explore')
    searchInputRef.current?.blur()
    focusNavigationTool('explore')
  }, [])
  const handleCloseOverlay = useCallback(() => {
    const returnFocusTo = overlayReturnFocusRef.current
    overlayReturnFocusRef.current = null
    setOverlay(null)
    window.requestAnimationFrame(() => {
      if (returnFocusTo?.isConnected) returnFocusTo.focus()
      else focusNavigationTool(activeTool)
    })
  }, [activeTool])
  const handleOpenShortcuts = useCallback(() => setShortcutsOpen(true), [])
  const handleCloseShortcuts = useCallback(() => setShortcutsOpen(false), [])

  const handleBeginExploring = useCallback(() => {
    setOverlay(null)
    setActiveTool('explore')
    engineRef.current?.focusOn('pelagos')
  }, [])

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const editable = isEditableTarget(event.target)

      if (event.key === 'Escape') {
        if (shortcutsOpen) {
          event.preventDefault()
          setShortcutsOpen(false)
          return
        }
        if (overlay !== null) {
          event.preventDefault()
          handleCloseOverlay()
          return
        }
        if (toProductTool(activeTool) !== null) {
          event.preventDefault()
          handleCloseTool()
        }
        return
      }

      if (editable || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === '/') {
        event.preventDefault()
        handleOpenSearch()
      } else if (event.key === '?') {
        event.preventDefault()
        setShortcutsOpen(true)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [
    activeTool,
    handleCloseOverlay,
    handleCloseTool,
    handleOpenSearch,
    overlay,
    shortcutsOpen,
  ])

  const productTool = toProductTool(activeTool)
  const settingsTelemetry = useMemo<ProductTelemetrySummary | null>(
    () => activeTool === 'settings'
      ? {
          backend: telemetry.backend,
          fps: telemetry.fps,
          frameTimeMs: telemetry.frameTimeMs,
          drawCalls: telemetry.drawCalls,
          triangles: telemetry.triangles,
          starCount: telemetry.starCount,
          quality: telemetry.quality,
          floatingOriginKm: telemetry.floatingOriginKm
            .map((coordinate) => coordinate.toFixed(1))
            .join(', '),
        }
      : null,
    [
      activeTool,
      telemetry.backend,
      telemetry.drawCalls,
      telemetry.floatingOriginKm,
      telemetry.fps,
      telemetry.frameTimeMs,
      telemetry.quality,
      telemetry.starCount,
      telemetry.triangles,
    ],
  )

  return (
    <main className={`app-shell${cinematic ? ' is-cinematic' : ''}`}>
      <div ref={viewportRef} className="universe-viewport" />

      <ExplorerHud
        selectedObject={hudObject}
        webGpuStatus={webGpuStatus}
        fps={telemetry.fps}
        speed={telemetry.cameraSpeed}
        timeScale={telemetry.timeScale}
        simulationTime={telemetry.simulationDate}
        quality={quality}
        cinematic={cinematic}
        overlay={overlay}
        tourStep={tourStep}
        activeTool={activeTool}
        inspectorOpen={inspectorOpen}
        paused={telemetry.timeScale === 0}
        onQualityChange={handleQualityChange}
        onToggleCinematic={() => setCinematic((current) => !current)}
        onToolChange={handleToolChange}
        onInspectorToggle={() => setInspectorOpen((current) => !current)}
        onFocusSelectedObject={() => {
          if (selectedBody) handleFocusTarget(selectedBody.id)
        }}
        onClearSelectedObject={() => setSelectedBody(null)}
        onTogglePause={handleTogglePause}
        onTimeScaleChange={handleTimeScaleChange}
        onResetTime={handleResetTime}
        onOverlayClose={handleCloseOverlay}
        onBeginExploring={handleBeginExploring}
        onOpenQuickTour={handleOpenQuickTour}
        onTourStepChange={setTourStep}
      />

      <SystemNavigator
        targets={NAVIGATION_TARGETS}
        selectedId={selectedBody?.id ?? null}
        hidden={cinematic || overlay !== null || activeTool !== 'explore'}
        onSelect={handleSelectTarget}
        onFocus={handleFocusTarget}
      />

      {productTool && !cinematic && overlay === null ? (
        <ProductToolPanel
          tool={productTool}
          targets={PRODUCT_TARGETS}
          selectedId={selectedBody?.id ?? null}
          savedPlaces={savedPlaces}
          persistence={savedPlacesPersistence}
          capabilities={capabilities}
          telemetry={settingsTelemetry}
          searchInputRef={searchInputRef}
          onSelect={handleSelectTarget}
          onFocus={handleFocusTarget}
          onSave={addPlace}
          onRemove={removePlace}
          onClearSaved={clearPlaces}
          onClose={handleCloseTool}
          onResetView={handleResetView}
          onOpenQuickTour={handleOpenQuickTour}
          onOpenShortcuts={handleOpenShortcuts}
        />
      ) : null}

      <ShortcutHelpDialog open={shortcutsOpen} onClose={handleCloseShortcuts} />

      <div
        className={`engine-metrics${cinematic || overlay !== null ? ' is-hidden' : ''}`}
        role="region"
        aria-label="Render pipeline metrics"
        aria-hidden={cinematic || overlay !== null}
      >
        <span title="Procedural stars in the current render graph">
          <Sparkles size={13} /> {telemetry.starCount > 0 ? `${Math.round(telemetry.starCount / 1000)}K` : '—'} stars
        </span>
        <span title="Draw calls in the last rendered frame">
          <Layers3 size={13} /> {telemetry.drawCalls} draws
        </span>
        <span title="Active renderer backend">
          <Cpu size={13} /> {capabilities?.computeStarfield ? 'GPU compute' : 'CPU fallback'}
        </span>
      </div>

      {capabilities === null && !engineError ? (
        <div className="engine-loader" role="status" aria-live="polite">
          <LoaderCircle size={16} />
          Compiling universe pipelines
        </div>
      ) : null}

      {engineError ? (
        <section className="engine-error" role="alert">
          <AlertTriangle size={22} />
          <div>
            <strong>Renderer initialization failed</strong>
            <p>{engineError}</p>
            <small>Try a current Chrome or Edge build with hardware acceleration enabled.</small>
          </div>
        </section>
      ) : null}
    </main>
  )
}

export default App
