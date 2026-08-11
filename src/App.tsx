import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Cpu, Layers3, LoaderCircle, Sparkles } from 'lucide-react'
import {
  ProductToolPanel,
  type ProductTelemetrySummary,
  type ProductTool,
} from './components/ProductToolPanel'
import { ShortcutHelpDialog } from './components/ShortcutHelpDialog'
import { SystemNavigator } from './components/SystemNavigator'
import { useDisplaySettings } from './components/useDisplaySettings'
import { useSavedPlaces } from './components/useSavedPlaces'
import { formatDistance } from './domain'
import {
  BODY_LOOKUP,
  CATALOG_BODIES,
  NAVIGATION_TARGETS,
  STAR,
} from './engine/catalog'
import type { CosmosEngine as CosmosEngineInstance } from './engine/CosmosEngine'
import type {
  CelestialBodyView,
  EngineCapabilities,
  EngineTelemetry,
  QualityLevel,
} from './engine/types'
import {
  ExplorerHud,
  type CelestialMetric,
  type CelestialMetricSection,
  type CelestialStatusTone,
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

const PRODUCT_TARGETS: readonly CelestialBodyView[] = CATALOG_BODIES

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

function massMetric(body: CelestialBodyView): CelestialMetric {
  if (body.bodyKind === 'star') {
    return {
      label: 'Mass',
      value: (body.massEarths / 332_946).toFixed(2),
      unit: 'M☉',
    }
  }
  return {
    label: 'Mass',
    value: body.massEarths.toLocaleString(undefined, {
      maximumFractionDigits: body.massEarths < 0.1 ? 3 : 2,
    }),
    unit: 'M⊕',
  }
}

function pressureDisplay(body: CelestialBodyView): string {
  if (body.surfacePressurePascals === null) return 'Not modeled'
  if (body.surfacePressurePascals < 1_000) {
    return `${body.surfacePressurePascals.toLocaleString()} Pa`
  }
  return `${(body.surfacePressurePascals / 100_000).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} bar`
}

function orbitalDistanceDisplay(body: CelestialBodyView): string {
  if (!body.orbit) return 'System barycenter'
  if (body.bodyKind === 'moon') {
    return `${formatDistance(body.orbit.semiMajorAxisMeters, {
      maximumFractionDigits: 1,
    })} from ${body.parentName ?? 'parent'}`
  }
  return `${body.distanceAu.toLocaleString(undefined, {
    maximumFractionDigits: 3,
  })} AU from Asteria`
}

function habitabilityTone(body: CelestialBodyView): CelestialStatusTone {
  if (body.habitability.tone === 'negative') return 'critical'
  return body.habitability.tone
}

function percentFraction(fraction: number): string {
  const percentage = fraction * 100
  return `${percentage.toLocaleString(undefined, {
    maximumFractionDigits: percentage < 10 ? 1 : 0,
  })}%`
}

function toHudObject(body: CelestialBodyView): SelectedCelestialObject {
  const physicalMetrics: CelestialMetric[] = [
    massMetric(body),
    { label: 'Mean radius', value: body.radiusKm.toLocaleString(), unit: 'km' },
    {
      label: 'Mean density',
      value: body.densityKgPerCubicMeter.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      }),
      unit: 'kg/m³',
    },
    {
      label: 'Reference gravity',
      value: body.surfaceGravityMetersPerSecondSquared.toFixed(2),
      unit: 'm/s²',
    },
    { label: 'Earth gravity', value: body.gravityG.toFixed(2), unit: 'g' },
    {
      label: 'Escape velocity',
      value: body.escapeVelocityKmPerSecond.toFixed(2),
      unit: 'km/s',
    },
    {
      label: 'Sidereal rotation',
      value: Math.abs(body.rotationPeriodHours).toLocaleString(undefined, {
        maximumFractionDigits: 2,
      }),
      unit: body.rotationPeriodHours < 0 ? 'h retrograde' : 'h',
    },
    {
      label: 'Axial tilt',
      value: body.axialTiltDegrees.toFixed(1),
      unit: '°',
    },
  ]

  const climateMetrics: CelestialMetric[] = [
    {
      label: 'Mean temperature',
      value: body.temperatureK.toLocaleString(undefined, {
        maximumFractionDigits: 1,
      }),
      unit: 'K',
    },
    ...(body.equilibriumTemperatureK !== null
      ? [{
          label: 'Equilibrium temperature',
          value: body.equilibriumTemperatureK.toFixed(1),
          unit: 'K',
        }]
      : []),
    ...(body.greenhouseDeltaK !== null
      ? [{
          label: 'Greenhouse offset',
          value: body.greenhouseDeltaK.toFixed(1),
          unit: 'K',
        }]
      : []),
    { label: 'Bond albedo', value: body.albedo.toFixed(2) },
    ...(body.bodyKind !== 'star'
      ? [{ label: 'Reference pressure', value: pressureDisplay(body) }]
      : []),
    ...(body.internalHeatFluxWattsPerSquareMeter !== null
      ? [{
          label: 'Internal heat flux',
          value: body.internalHeatFluxWattsPerSquareMeter.toFixed(3),
          unit: 'W/m²',
        }]
      : []),
  ]

  const orbitMetrics: CelestialMetric[] = body.orbit
    ? [
        {
          label: 'Semi-major axis',
          value:
            body.bodyKind === 'moon'
              ? formatDistance(body.orbit.semiMajorAxisMeters, {
                  maximumFractionDigits: 1,
                })
              : body.distanceAu.toFixed(3),
          unit: body.bodyKind === 'moon' ? undefined : 'AU',
        },
        {
          label: 'Orbital period',
          value: body.orbit.periodDays.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          }),
          unit: 'days',
        },
        { label: 'Eccentricity', value: body.orbit.eccentricity.toFixed(3) },
        {
          label: 'Inclination',
          value: body.orbit.inclinationDegrees.toFixed(2),
          unit: '°',
        },
        {
          label: 'Periapsis',
          value: formatDistance(body.orbit.periapsisMeters, {
            maximumFractionDigits: 2,
          }),
        },
        {
          label: 'Apoapsis',
          value: formatDistance(body.orbit.apoapsisMeters, {
            maximumFractionDigits: 2,
          }),
        },
        {
          label: 'Mean orbital speed',
          value: body.orbit.meanVelocityKmPerSecond.toFixed(2),
          unit: 'km/s',
        },
        {
          label: 'Stellar flux',
          value: body.orbit.stellarFluxSolar.toFixed(2),
          unit: 'S⊕',
        },
      ]
    : []

  const metricSections: CelestialMetricSection[] = [
    {
      id: 'climate',
      title: body.bodyKind === 'star' ? 'Stellar environment' : 'Climate model',
      tab: 'overview',
      summary:
        body.bodyKind === 'star'
          ? 'Photospheric reference values for the synthetic primary star.'
          : 'Temperature and pressure are scenario inputs; radiative equilibrium and flux are derived.',
      metrics: climateMetrics,
    },
    {
      id: 'physical',
      title: 'Bulk properties',
      tab: 'physics',
      metrics: physicalMetrics,
    },
    ...(orbitMetrics.length > 0
      ? [{
          id: 'orbit',
          title: 'Keplerian solution',
          tab: 'orbit' as const,
          summary: 'Two-body osculating elements at the simulation epoch.',
          metrics: orbitMetrics,
        }]
      : []),
  ]

  return {
    id: body.id,
    name: body.name,
    type: body.bodyClass,
    designation: body.designation,
    description: body.description,
    distance: orbitalDistanceDisplay(body),
    orbitSummary: body.orbit
      ? `Deterministic Keplerian orbit around ${body.parentName ?? 'the system barycenter'}; visual distances are logarithmically compressed.`
      : undefined,
    classification: {
      label: body.bodyClass,
      detail:
        body.bodyKind === 'moon'
          ? `Natural satellite of ${body.parentName ?? 'an Asteria world'}`
          : body.bodyKind === 'planet'
            ? 'NASA-aligned exoplanet class · fictional Asteria catalogue'
            : 'Synthetic G-class primary star',
    },
    status: {
      label: 'Synthetic model',
      detail: body.provenance.notice,
      tone: 'informational',
    },
    quickFacts: [
      { label: 'Radius', value: body.radiusKm.toLocaleString(), unit: 'km' },
      massMetric(body),
      { label: 'Temperature', value: body.temperatureK.toLocaleString(), unit: 'K' },
      { label: 'Gravity', value: body.gravityG.toFixed(2), unit: 'g' },
    ],
    metricSections,
    atmosphere: {
      summary: body.atmosphere,
      pressure:
        body.bodyKind === 'star' ? undefined : pressureDisplay(body),
      composition: body.atmosphereComposition.map(({ species, fraction }) => ({
        species,
        amount: percentFraction(fraction),
      })),
    },
    habitability: {
      label: body.habitability.label,
      summary: body.habitability.summary,
      tone: habitabilityTone(body),
      factors: body.orbit
        ? [
            {
              label: 'Stellar flux',
              value: body.orbit.stellarFluxSolar.toFixed(2),
              unit: 'S⊕',
            },
            {
              label: 'Equilibrium temperature',
              value: body.equilibriumTemperatureK?.toFixed(1) ?? '—',
              unit: 'K',
            },
          ]
        : undefined,
    },
    provenance: {
      source: body.provenance.generator,
      method: 'Curated scenario inputs · equation-derived physics',
      confidence: body.provenance.origin === 'synthetic' ? 'Synthetic' : 'Catalogue',
      reference: `model ${body.provenance.modelVersion}${body.provenance.seed ? ` · seed ${body.provenance.seed}` : ''}`,
    },
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
    displaySettings,
    setDisplaySettings,
    resetDisplaySettings,
  } = useDisplaySettings()
  const displaySettingsRef = useRef(displaySettings)
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
      engine.setDisplaySettings(displaySettingsRef.current)
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

  useEffect(() => {
    displaySettingsRef.current = displaySettings
    engineRef.current?.setDisplaySettings(displaySettings)
  }, [displaySettings])

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
          displayCalibration={displaySettings}
          onDisplayCalibrationChange={setDisplaySettings}
          onResetDisplayCalibration={resetDisplaySettings}
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
