import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
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
  CameraCenterState,
  CelestialBodyView,
  EngineCapabilities,
  EngineTelemetry,
  QualityLevel,
} from './engine/types'
import { localeOption } from './i18n'
import { localizedScienceNarrative } from './i18n/science'
import {
  ExplorerHud,
  type BodyCenteredCameraView,
  type BodyCenteredViewMode,
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

const INITIAL_CAMERA_CENTER: CameraCenterState = {
  mode: 'system',
  bodyId: null,
  transitioning: false,
  canReturn: false,
}

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
const MAIN_SEQUENCE_SUFFIX = / main-sequence star$/u

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

function focusNavigationTool(tool: NavigationTool): void {
  window.requestAnimationFrame(() => {
    document
      .querySelector<HTMLButtonElement>(
        `.se-nav-button[data-navigation-tool="${tool}"]`,
      )
      ?.focus()
  })
}

function localizeBodyClass(
  body: Pick<CelestialBodyView, 'bodyKind' | 'bodyClass'>,
  t: TFunction,
): string {
  if (body.bodyKind === 'star') {
    return t('body.class.star', {
      spectralType: body.bodyClass.replace(MAIN_SEQUENCE_SUFFIX, ''),
    })
  }
  const classKey: Readonly<Record<string, string>> = {
    'Lava world': 'lava',
    'Terrestrial world': 'terrestrial',
    'Ocean world': 'ocean',
    'Super-Earth': 'superEarth',
    'Neptunian world': 'neptunian',
    'Gas giant': 'gasGiant',
    'Ice giant': 'iceGiant',
    'Dwarf planet': 'dwarf',
    'Rocky moon': 'rockyMoon',
    'Icy moon': 'icyMoon',
    'Oceanic moon': 'oceanicMoon',
    'Volcanic moon': 'volcanicMoon',
  }
  const key = classKey[body.bodyClass]
  return key ? t(`body.class.${key}`) : body.bodyClass
}

function localizeHabitability(
  body: CelestialBodyView,
  t: TFunction,
): { label: string; summary: string } {
  const labelKey: Readonly<Record<string, string>> = {
    'Not applicable': 'notApplicable',
    'Insufficient data': 'insufficientData',
    'Non-surface world': 'nonSurfaceWorld',
    'Outside conservative HZ': 'outsideHz',
    'Habitable-zone orbit': 'withinHz',
    'Temperate candidate': 'temperateCandidate',
  }
  const key = labelKey[body.habitability.label]
  return key
    ? {
        label: t(`habitability.${key}.label`),
        summary: t(`habitability.${key}.summary`),
      }
    : body.habitability
}

function habitabilityTone(body: CelestialBodyView): CelestialStatusTone {
  if (body.habitability.tone === 'negative') return 'critical'
  return body.habitability.tone
}

function massMetric(
  body: CelestialBodyView,
  t: TFunction,
  locale: string,
): CelestialMetric {
  if (body.bodyKind === 'star') {
    return {
      label: t('metrics.mass'),
      value: (body.massEarths / 332_946).toLocaleString(locale, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }),
      unit: 'M☉',
    }
  }
  return {
    label: t('metrics.mass'),
    value: body.massEarths.toLocaleString(locale, {
      maximumFractionDigits: body.massEarths < 0.1 ? 3 : 2,
    }),
    unit: 'M⊕',
  }
}

function pressureDisplay(
  body: CelestialBodyView,
  t: TFunction,
  locale: string,
): string {
  if (body.surfacePressurePascals === null) return t('units.notModeled')
  if (body.surfacePressurePascals < 1_000) {
    return `${body.surfacePressurePascals.toLocaleString(locale)} Pa`
  }
  return `${(body.surfacePressurePascals / 100_000).toLocaleString(locale, {
    maximumFractionDigits: 2,
  })} bar`
}

function orbitalDistanceDisplay(
  body: CelestialBodyView,
  t: TFunction,
  locale: string,
): string {
  if (!body.orbit) return t('units.systemBarycenter')
  if (body.bodyKind === 'moon') {
    return t('units.fromParent', {
      distance: formatDistance(body.orbit.semiMajorAxisMeters, {
        locale,
        maximumFractionDigits: 1,
      }),
      parent: body.parentName ?? t('body.parentFallback'),
    })
  }
  return t('units.fromAsteria', {
    distance: body.distanceAu.toLocaleString(locale, {
      maximumFractionDigits: 3,
    }),
  })
}

function atmosphereSummary(body: CelestialBodyView, t: TFunction): string {
  if (body.bodyKind === 'star') return t('body.stellarPlasma')
  if (body.atmosphereComposition.length === 0) return t('body.noAtmosphere')
  return body.atmosphere
}

function orbitDistance(
  body: CelestialBodyView,
  locale: string,
  maximumFractionDigits: number,
): string {
  return formatDistance(body.orbit?.semiMajorAxisMeters ?? 0, {
    locale,
    maximumFractionDigits,
  })
}

function percentFraction(fraction: number, locale: string): string {
  const percentage = fraction * 100
  return `${percentage.toLocaleString(locale, {
    maximumFractionDigits: percentage < 10 ? 1 : 0,
  })}%`
}

function toHudObject(
  body: CelestialBodyView,
  t: TFunction,
  locale: string,
  language: string,
): SelectedCelestialObject {
  const localizedClass = localizeBodyClass(body, t)
  const habitability = localizeHabitability(body, t)
  const narrative = localizedScienceNarrative(body, language)
  const physicalMetrics: CelestialMetric[] = [
    massMetric(body, t, locale),
    {
      label: t('metrics.meanRadius'),
      value: body.radiusKm.toLocaleString(locale),
      unit: 'km',
    },
    {
      label: t('metrics.meanDensity'),
      value: body.densityKgPerCubicMeter.toLocaleString(locale, {
        maximumFractionDigits: 0,
      }),
      unit: 'kg/m³',
    },
    {
      label: t('metrics.referenceGravity'),
      value: body.surfaceGravityMetersPerSecondSquared.toLocaleString(locale, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }),
      unit: 'm/s²',
    },
    {
      label: t('metrics.earthGravity'),
      value: body.gravityG.toLocaleString(locale, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }),
      unit: 'g',
    },
    {
      label: t('metrics.escapeVelocity'),
      value: body.escapeVelocityKmPerSecond.toLocaleString(locale, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }),
      unit: 'km/s',
    },
    {
      label: t('metrics.siderealRotation'),
      value: Math.abs(body.rotationPeriodHours).toLocaleString(locale, {
        maximumFractionDigits: 2,
      }),
      unit: body.rotationPeriodHours < 0 ? t('units.retrogradeHours') : 'h',
    },
    {
      label: t('metrics.axialTilt'),
      value: body.axialTiltDegrees.toLocaleString(locale, {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      }),
      unit: '°',
    },
  ]

  const climateMetrics: CelestialMetric[] = [
    {
      label: t('metrics.meanTemperature'),
      value: body.temperatureK.toLocaleString(locale, {
        maximumFractionDigits: 1,
      }),
      unit: 'K',
    },
    ...(body.equilibriumTemperatureK !== null
      ? [{
          label: t('metrics.equilibriumTemperature'),
          value: body.equilibriumTemperatureK.toLocaleString(locale, {
            maximumFractionDigits: 1,
            minimumFractionDigits: 1,
          }),
          unit: 'K',
        }]
      : []),
    ...(body.greenhouseDeltaK !== null
      ? [{
          label: t('metrics.greenhouseOffset'),
          value: body.greenhouseDeltaK.toLocaleString(locale, {
            maximumFractionDigits: 1,
            minimumFractionDigits: 1,
          }),
          unit: 'K',
        }]
      : []),
    {
      label: t('metrics.bondAlbedo'),
      value: body.albedo.toLocaleString(locale, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }),
    },
    ...(body.bodyKind !== 'star'
      ? [{
          label: t('metrics.referencePressure'),
          value: pressureDisplay(body, t, locale),
        }]
      : []),
    ...(body.internalHeatFluxWattsPerSquareMeter !== null
      ? [{
          label: t('metrics.internalHeatFlux'),
          value: body.internalHeatFluxWattsPerSquareMeter.toLocaleString(locale, {
            maximumFractionDigits: 3,
            minimumFractionDigits: 3,
          }),
          unit: 'W/m²',
        }]
      : []),
  ]

  const orbitMetrics: CelestialMetric[] = body.orbit
    ? [
        {
          label: t('metrics.semiMajorAxis'),
          value:
            body.bodyKind === 'moon'
              ? orbitDistance(body, locale, 1)
              : body.distanceAu.toLocaleString(locale, {
                  maximumFractionDigits: 3,
                  minimumFractionDigits: 3,
                }),
          unit: body.bodyKind === 'moon' ? undefined : 'AU',
        },
        {
          label: t('metrics.orbitalPeriod'),
          value: body.orbit.periodDays.toLocaleString(locale, {
            maximumFractionDigits: 2,
          }),
          unit: t('units.days'),
        },
        {
          label: t('metrics.eccentricity'),
          value: body.orbit.eccentricity.toLocaleString(locale, {
            maximumFractionDigits: 3,
            minimumFractionDigits: 3,
          }),
        },
        {
          label: t('metrics.inclination'),
          value: body.orbit.inclinationDegrees.toLocaleString(locale, {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
          }),
          unit: '°',
        },
        {
          label: t('metrics.periapsis'),
          value: formatDistance(body.orbit.periapsisMeters, {
            locale,
            maximumFractionDigits: 2,
          }),
        },
        {
          label: t('metrics.apoapsis'),
          value: formatDistance(body.orbit.apoapsisMeters, {
            locale,
            maximumFractionDigits: 2,
          }),
        },
        {
          label: t('metrics.meanOrbitalSpeed'),
          value: body.orbit.meanVelocityKmPerSecond.toLocaleString(locale, {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
          }),
          unit: 'km/s',
        },
        {
          label: t('metrics.stellarFlux'),
          value: body.orbit.stellarFluxSolar.toLocaleString(locale, {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
          }),
          unit: 'S⊕',
        },
      ]
    : []

  const metricSections: CelestialMetricSection[] = [
    {
      id: 'climate',
      title:
        body.bodyKind === 'star'
          ? t('sections.stellarEnvironment')
          : t('sections.climateModel'),
      tab: 'overview',
      summary:
        body.bodyKind === 'star'
          ? t('sections.stellarSummary')
          : t('sections.climateSummary'),
      metrics: climateMetrics,
    },
    {
      id: 'physical',
      title: t('sections.bulkProperties'),
      tab: 'physics',
      summary: t('sections.physicsSummary'),
      metrics: physicalMetrics,
    },
    ...(orbitMetrics.length > 0
      ? [{
          id: 'orbit',
          title: t('sections.keplerianSolution'),
          tab: 'orbit' as const,
          summary: t('sections.twoBodyEpoch'),
          metrics: orbitMetrics,
        }]
      : []),
  ]

  return {
    id: body.id,
    name: body.name,
    type: localizedClass,
    designation: body.designation,
    closeApproachAvailable: body.bodyKind !== 'star',
    description: narrative.description,
    distance: orbitalDistanceDisplay(body, t, locale),
    orbitSummary: body.orbit
      ? t('body.orbitSummary', {
          parent: body.parentName ?? t('units.systemBarycenter'),
        })
      : undefined,
    classification: {
      label: localizedClass,
      detail:
        body.bodyKind === 'moon'
          ? t('body.naturalSatelliteOf', {
              parent: body.parentName ?? t('body.parentFallback'),
            })
          : body.bodyKind === 'planet'
            ? t('body.nasaAlignedClass')
            : t('body.syntheticPrimary'),
    },
    status: {
      label: t('body.syntheticStatus'),
      detail: t('body.syntheticDescription'),
      tone: 'informational',
    },
    quickFacts: [
      {
        label: t('metrics.radius'),
        value: body.radiusKm.toLocaleString(locale),
        unit: 'km',
      },
      massMetric(body, t, locale),
      {
        label: t('metrics.temperature'),
        value: body.temperatureK.toLocaleString(locale),
        unit: 'K',
      },
      {
        label: t('metrics.gravity'),
        value: body.gravityG.toLocaleString(locale, {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        }),
        unit: 'g',
      },
    ],
    metricSections,
    atmosphere: {
      summary: atmosphereSummary(body, t),
      pressure:
        body.bodyKind === 'star'
          ? undefined
          : pressureDisplay(body, t, locale),
      composition: body.atmosphereComposition.map(({ species, fraction }) => ({
        species,
        amount: percentFraction(fraction, locale),
      })),
    },
    habitability: {
      label: habitability.label,
      summary: habitability.summary,
      tone: habitabilityTone(body),
      factors: body.orbit
        ? [
            {
              label: t('metrics.stellarFlux'),
              value: body.orbit.stellarFluxSolar.toLocaleString(locale, {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              }),
              unit: 'S⊕',
            },
            {
              label: t('metrics.equilibriumTemperature'),
              value:
                body.equilibriumTemperatureK?.toLocaleString(locale, {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1,
                }) ?? '—',
              unit: 'K',
            },
          ]
        : undefined,
    },
    provenance: {
      source: t('body.syntheticSource'),
      method: t('body.syntheticMethod'),
      confidence: t('body.syntheticConfidence'),
      reference: t('body.modelReference', {
        version: body.provenance.modelVersion,
        seedPart: body.provenance.seed
          ? t('body.seedReference', { seed: body.provenance.seed })
          : '',
      }),
    },
  }
}

function App() {
  const { t, i18n } = useTranslation('app')
  const resolvedLocale = localeOption(i18n.resolvedLanguage)
  const viewportRef = useRef<HTMLDivElement>(null)
  const initialViewportLabelRef = useRef(t('engine.viewportLabel'))
  initialViewportLabelRef.current = t('engine.viewportLabel')
  const engineRef = useRef<CosmosEngineInstance | null>(null)
  const previousTimeScaleRef = useRef(1)
  const currentTimeScaleRef = useRef(1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const overlayReturnFocusRef = useRef<HTMLElement | null>(null)
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY)
  const [cameraCenter, setCameraCenter] = useState(INITIAL_CAMERA_CENTER)
  const [capabilities, setCapabilities] = useState<EngineCapabilities | null>(null)
  const [selectedBody, setSelectedBody] = useState<CelestialBodyView | null>(STAR)
  const [overlay, setOverlay] = useState<ExplorerOverlay>('welcome')
  const [tourStep, setTourStep] = useState(0)
  const [quality, setQuality] = useState<QualityPreset>('balanced')
  const [cinematic, setCinematic] = useState(false)
  const [activeTool, setActiveTool] = useState<NavigationTool>('explore')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [engineFailed, setEngineFailed] = useState(false)
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
        onSelectionCleared: () => {
          if (active) setSelectedBody(null)
        },
        onCameraCenterChange: (nextCameraCenter) => {
          if (active) setCameraCenter(nextCameraCenter)
        },
        onError: () => {
          if (active) setEngineFailed(true)
        },
      })
      host
        .querySelector<HTMLCanvasElement>('canvas')
        ?.setAttribute('aria-label', initialViewportLabelRef.current)
      engineRef.current = engine
      await engine.init()
      engine.setDisplaySettings(displaySettingsRef.current)
    }

    void bootEngine().catch(() => {
      if (active) setEngineFailed(true)
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

  useEffect(() => {
    viewportRef.current
      ?.querySelector<HTMLCanvasElement>('canvas')
      ?.setAttribute('aria-label', t('engine.viewportLabel'))
  }, [capabilities, t])

  const hudObject = useMemo(
    () => selectedBody
      ? toHudObject(
          selectedBody,
          t,
          resolvedLocale.intlLocale,
          resolvedLocale.code,
        )
      : null,
    [resolvedLocale.code, resolvedLocale.intlLocale, selectedBody, t],
  )

  const cameraView = useMemo<BodyCenteredCameraView | null>(() => {
    if (
      cameraCenter.bodyId === null ||
      (cameraCenter.mode !== 'orbit' && cameraCenter.mode !== 'close')
    ) return null
    const centeredBody = BODY_LOOKUP.get(cameraCenter.bodyId)
    if (!centeredBody) return null
    return {
      centeredObject: {
        id: centeredBody.id,
        name: centeredBody.name,
        type: localizeBodyClass(centeredBody, t),
        designation: centeredBody.designation,
      },
      mode: cameraCenter.mode === 'close' ? 'close-approach' : 'orbit',
      transitioning: cameraCenter.transitioning,
      closeApproachAvailable: centeredBody.bodyKind !== 'star',
      previousViewLabel: t('body.previousCameraFrame'),
    }
  }, [cameraCenter, t])

  const webGpuStatus: WebGpuStatus = engineFailed
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

  const focusViewport = useCallback(() => {
    window.requestAnimationFrame(() => {
      viewportRef.current?.querySelector<HTMLCanvasElement>('canvas')?.focus()
    })
  }, [])

  const handleCenterTarget = useCallback((id: string, mode: BodyCenteredViewMode) => {
    const centered = engineRef.current?.centerOnBody(
      id,
      mode === 'close-approach' ? 'close' : 'orbit',
    )
    if (!centered) return
    setActiveTool('explore')
    focusViewport()
  }, [focusViewport])

  const handleFocusTarget = useCallback((id: string, surface = false) => {
    handleCenterTarget(id, surface ? 'close-approach' : 'orbit')
  }, [handleCenterTarget])

  const handleCameraViewModeChange = useCallback((mode: BodyCenteredViewMode) => {
    if (cameraCenter.bodyId) handleCenterTarget(cameraCenter.bodyId, mode)
  }, [cameraCenter.bodyId, handleCenterTarget])

  const handleReturnToPreviousView = useCallback(() => {
    if (engineRef.current?.returnToPreviousView()) focusViewport()
  }, [focusViewport])

  const handleSystemOverview = useCallback(() => {
    engineRef.current?.showSystemOverview()
    setActiveTool('explore')
    focusViewport()
  }, [focusViewport])

  const handleClearSelection = useCallback(() => {
    setSelectedBody(null)
    engineRef.current?.clearSelection()
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
      engineRef.current?.showSystemOverview()
      setActiveTool('explore')
      focusViewport()
      return
    }
    if (tool === 'search') {
      handleOpenSearch()
      return
    }
    setActiveTool(tool)
    if (tool !== 'explore') setCinematic(false)
  }, [focusViewport, handleOpenSearch])

  const handleResetView = useCallback(() => {
    engineRef.current?.resetView()
    setCinematic(false)
    setActiveTool('explore')
    focusViewport()
  }, [focusViewport])

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
    focusViewport()
  }, [focusViewport])

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
          return
        }
        if (engineRef.current?.cancelCameraTransition()) {
          event.preventDefault()
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
  const localizedProductTargets = useMemo(
    () => PRODUCT_TARGETS.map((target) => {
      const bodyClass = localizeBodyClass(target, t)
      const habitability = localizeHabitability(target, t)
      const narrative = localizedScienceNarrative(
        target,
        resolvedLocale.code,
      )
      return {
        ...target,
        bodyClass,
        description: narrative.description,
        atmosphere: atmosphereSummary(target, t),
        facts: narrative.facts,
        habitability: {
          ...target.habitability,
          ...habitability,
        },
      }
    }),
    [resolvedLocale.code, t],
  )
  const localizedNavigationTargets = useMemo(
    () => NAVIGATION_TARGETS.map((target) => ({
      ...target,
      bodyClass: localizeBodyClass(target, t),
    })),
    [t],
  )
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
        cameraView={cameraView}
        cameraFrameMode={
          cameraCenter.mode === 'free'
            ? 'free'
            : cameraCenter.mode === 'system'
              ? 'system'
              : undefined
        }
        cameraFrameTransitioning={
          cameraCenter.mode === 'free' || cameraCenter.mode === 'system'
            ? cameraCenter.transitioning
            : undefined
        }
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
        onCenterSelectedObject={(mode) => {
          if (selectedBody) handleCenterTarget(selectedBody.id, mode)
        }}
        onCameraViewModeChange={handleCameraViewModeChange}
        onReturnToPreviousView={
          cameraCenter.canReturn ? handleReturnToPreviousView : undefined
        }
        onSystemOverview={handleSystemOverview}
        onClearSelectedObject={handleClearSelection}
        onTogglePause={handleTogglePause}
        onTimeScaleChange={handleTimeScaleChange}
        onResetTime={handleResetTime}
        onOverlayClose={handleCloseOverlay}
        onBeginExploring={handleBeginExploring}
        onOpenQuickTour={handleOpenQuickTour}
        onTourStepChange={setTourStep}
      />

      <SystemNavigator
        targets={localizedNavigationTargets}
        selectedId={selectedBody?.id ?? null}
        centeredId={cameraCenter.bodyId}
        centeredViewMode={
          cameraCenter.mode === 'close'
            ? 'close-approach'
            : cameraCenter.mode === 'orbit'
              ? 'orbit'
              : undefined
        }
        centeredTransitioning={cameraCenter.transitioning}
        hidden={cinematic || overlay !== null || activeTool !== 'explore'}
        onSelect={handleSelectTarget}
        onFocus={handleFocusTarget}
      />

      {productTool && !cinematic && overlay === null ? (
        <ProductToolPanel
          tool={productTool}
          targets={localizedProductTargets}
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
        aria-label={t('renderMetrics.region')}
        aria-hidden={cinematic || overlay !== null}
      >
        <span title={t('renderMetrics.starsTitle')}>
          <Sparkles size={13} /> {telemetry.starCount > 0
            ? t('renderMetrics.stars', {
                count: Math.round(telemetry.starCount / 1000).toLocaleString(
                  resolvedLocale.intlLocale,
                ),
              })
            : t('renderMetrics.pending')}
        </span>
        <span title={t('renderMetrics.drawsTitle')}>
          <Layers3 size={13} /> {t('renderMetrics.draws', {
            count: telemetry.drawCalls.toLocaleString(resolvedLocale.intlLocale),
          })}
        </span>
        <span title={t('renderMetrics.backendTitle')}>
          <Cpu size={13} /> {capabilities?.computeStarfield
            ? t('renderMetrics.gpuCompute')
            : t('renderMetrics.cpuFallback')}
        </span>
      </div>

      {capabilities === null && !engineFailed ? (
        <div className="engine-loader" role="status" aria-live="polite">
          <LoaderCircle size={16} />
          {t('engine.loading')}
        </div>
      ) : null}

      {engineFailed ? (
        <section className="engine-error" role="alert">
          <AlertTriangle size={22} />
          <div>
            <strong>{t('engine.errorTitle')}</strong>
            <p>{t('engine.errorDetail')}</p>
            <small>{t('engine.errorAdvice')}</small>
            <button type="button" onClick={() => window.location.reload()}>
              {t('engine.retry')}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  )
}

export default App
