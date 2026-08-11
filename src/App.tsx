import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Cpu, Layers3, LoaderCircle, Sparkles } from 'lucide-react'
import { SystemNavigator } from './components/SystemNavigator'
import { ASTRONOMICAL_UNIT_METERS, formatDistance } from './domain'
import { NAVIGATION_TARGETS, STAR } from './engine/catalog'
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
          if (active) setTelemetry(nextTelemetry)
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
    engineRef.current?.setTimeScale(nextScale)
    setTelemetry((current) => ({ ...current, timeScale: nextScale }))
  }, [])

  const handleTogglePause = useCallback(() => {
    const nextScale = telemetry.timeScale === 0 ? previousTimeScaleRef.current : 0
    if (telemetry.timeScale !== 0) previousTimeScaleRef.current = telemetry.timeScale
    engineRef.current?.setTimeScale(nextScale)
    setTelemetry((current) => ({ ...current, timeScale: nextScale }))
  }, [telemetry.timeScale])

  const handleResetTime = useCallback(() => {
    previousTimeScaleRef.current = 1
    engineRef.current?.resetSimulationTime()
    setTelemetry((current) => ({ ...current, timeScale: 1, simulationDate: INITIAL_DATE }))
  }, [])

  const handleSelectTarget = useCallback((id: string) => {
    engineRef.current?.select(id)
  }, [])

  const handleFocusTarget = useCallback((id: string, surface = false) => {
    engineRef.current?.focusOn(id, surface)
  }, [])

  const handleToolChange = useCallback((tool: NavigationTool) => {
    setActiveTool(tool)
    if (tool === 'home') engineRef.current?.resetView()
    if (tool === 'search' || tool === 'locations') setCinematic(false)
  }, [])

  const handleBeginExploring = useCallback(() => {
    setOverlay(null)
    engineRef.current?.focusOn('pelagos')
  }, [])

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
        onOverlayClose={() => setOverlay(null)}
        onBeginExploring={handleBeginExploring}
        onOpenQuickTour={() => setOverlay('quick-tour')}
        onTourStepChange={setTourStep}
      />

      <SystemNavigator
        targets={NAVIGATION_TARGETS}
        selectedId={selectedBody?.id ?? null}
        hidden={cinematic}
        onSelect={handleSelectTarget}
        onFocus={handleFocusTarget}
      />

      <div className={`engine-metrics${cinematic ? ' is-hidden' : ''}`} aria-label="Render pipeline metrics">
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
