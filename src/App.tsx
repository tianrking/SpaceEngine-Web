import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Cpu, Layers3, LoaderCircle, Sparkles } from 'lucide-react'
import {
  ProductToolPanel,
  type ObservedNavigationState,
  type ProductTelemetrySummary,
  type ProductTool,
} from './components/ProductToolPanel'
import { ShortcutHelpDialog } from './components/ShortcutHelpDialog'
import { SystemNavigator } from './components/SystemNavigator'
import { useDisplaySettings } from './components/useDisplaySettings'
import { useSavedPlaces } from './components/useSavedPlaces'
import {
  EARTH_MASS_KILOGRAMS,
  EARTH_RADIUS_METERS,
  formatDistance,
  SOLAR_MASS_KILOGRAMS,
  SOLAR_RADIUS_METERS,
} from './domain'
import type { ProgressiveHostSkyIndex } from './data/progressiveExoplanetCatalog'
import type { ProgressiveCatalogClient } from './data/progressiveCatalogClient'
import type {
  HostMeasurementResolution,
  ObservedPlanetBundle,
  ObservedSystemBundle,
} from './data/progressiveObservedSystem'
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
  ObservedSceneState,
  ObservedSelection,
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

const INITIAL_OBSERVED_SCENE: ObservedSceneState = {
  mode: 'asteria',
  activeHost: null,
  activeSystemId: null,
  selectedObjectId: null,
  selectedHost: null,
  centeredObjectId: null,
  centeredViewMode: null,
  transitioning: false,
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

function isHierarchyNavigationControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest(
    'button, a[href], dialog, [role="button"], [role="dialog"]',
  ) !== null
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

function measurementValue(
  resolution: HostMeasurementResolution,
): number | null {
  return resolution.status === 'single'
    ? resolution.selected?.measurement.value ?? null
    : null
}

function catalogueMetric(
  label: string,
  value: number | null,
  locale: string,
  unit?: string,
  maximumFractionDigits = 2,
): CelestialMetric {
  return {
    label,
    value: value === null
      ? '—'
      : value.toLocaleString(locale, { maximumFractionDigits }),
    unit,
  }
}

function observedHostHudObject(
  selection: Extract<ObservedSelection, { kind: 'host' }>,
  t: TFunction,
  locale: string,
): SelectedCelestialObject {
  return {
    id: selection.id,
    name: selection.host,
    type: t('observed.hostType'),
    designation: selection.gaiaDr3 ?? t('observed.noGaiaDesignation'),
    closeApproachAvailable: false,
    distance: selection.distancePc === null
      ? t('observed.skyOnlyDistance')
      : `${selection.distancePc.toLocaleString(locale, { maximumFractionDigits: 3 })} pc`,
    coordinates: {
      rightAscension: `${selection.raDeg.toLocaleString(locale, { maximumFractionDigits: 5 })}°`,
      declination: `${selection.decDeg.toLocaleString(locale, { maximumFractionDigits: 5 })}°`,
    },
    description: selection.skyOnly
      ? t('observed.hostSkyOnlyDescription')
      : t('observed.hostDescription'),
    classification: {
      label: selection.spectralType ?? t('observed.spectralMissing'),
      detail: t('observed.confirmedHost'),
    },
    status: {
      label: selection.skyOnly ? t('observed.skyOnly') : t('observed.threeDimensional'),
      detail: selection.skyOnly
        ? t('observed.distanceRequired')
        : t('observed.logDistanceNotice'),
      tone: selection.skyOnly ? 'caution' : 'positive',
    },
    quickFacts: [
      catalogueMetric(t('observed.distance'), selection.distancePc, locale, 'pc', 3),
      catalogueMetric(t('observed.confirmedPlanets'), selection.planetCount, locale, undefined, 0),
      catalogueMetric(t('observed.systemStars'), selection.starCount, locale, undefined, 0),
    ],
    metricSections: [{
      id: 'observed-coordinate-frame',
      title: t('observed.coordinateFrame'),
      tab: 'overview',
      summary: t('observed.icrsSummary'),
      metrics: [
        catalogueMetric(t('observed.rightAscension'), selection.raDeg, locale, '°', 5),
        catalogueMetric(t('observed.declination'), selection.decDeg, locale, '°', 5),
      ],
    }],
    provenance: {
      source: t('observed.nasaSource'),
      method: t('observed.hostMethod'),
      confidence: selection.skyOnly ? t('observed.directionOnly') : t('observed.archiveComposite'),
      reference: selection.gaiaDr3 ?? undefined,
    },
  }
}

function observedSystemObject(
  bundle: ObservedSystemBundle,
  selection: Extract<ObservedSelection, { kind: 'star' | 'planet' }>,
): { planet: ObservedPlanetBundle | null } {
  return {
    planet: selection.kind === 'planet'
      ? bundle.planets.find(({ id }) => id === selection.sourceId) ?? null
      : null,
  }
}

function observedSystemHudObject(
  bundle: ObservedSystemBundle,
  selection: Extract<ObservedSelection, { kind: 'star' | 'planet' }>,
  t: TFunction,
  locale: string,
): SelectedCelestialObject {
  const { planet } = observedSystemObject(bundle, selection)
  const record = planet?.record
  const measurements = record?.measurements
  const stellar = bundle.hostStar.measurements
  const mass = selection.kind === 'star'
    ? measurementValue(stellar.stellarMassSolar)
    : measurements?.massEarth?.value ?? null
  const radius = selection.kind === 'star'
    ? measurementValue(stellar.stellarRadiusSolar)
    : measurements?.radiusEarth?.value ?? null
  const temperature = selection.kind === 'star'
    ? measurementValue(stellar.stellarTeffK)
    : measurements?.equilibriumTempK?.value ?? null
  const orbitMetrics: CelestialMetric[] = planet
    ? [
        catalogueMetric(t('metrics.semiMajorAxis'), planet.orbit.semiMajorAxisAu.value, locale, 'AU', 4),
        catalogueMetric(t('metrics.orbitalPeriod'), planet.orbit.orbitalPeriodDays.value, locale, t('units.days'), 3),
        catalogueMetric(t('metrics.eccentricity'), planet.orbit.eccentricity.value, locale, undefined, 4),
        catalogueMetric(t('metrics.inclination'), planet.orbit.inclinationDeg.value, locale, '°', 3),
      ]
    : []
  const reference = planet?.orbit.semiMajorAxisAu.reference ??
    planet?.record.discovery.reference ?? null

  return {
    id: selection.id,
    name: selection.name,
    type: selection.kind === 'star'
      ? t('observed.hostStarType')
      : t('observed.exoplanetType'),
    designation: selection.kind === 'star'
      ? bundle.host
      : record?.externalIds.gaiaDr3 ?? planet?.name,
    closeApproachAvailable: selection.kind === 'planet',
    distance: t('observed.withinHost', { host: bundle.host }),
    description: selection.kind === 'star'
      ? t('observed.starDescription')
      : t('observed.planetDescription'),
    orbitSummary: planet
      ? t('observed.illustrativeOrbitSummary', {
          count: planet.orbit.renderAssumptions.length,
        })
      : undefined,
    classification: {
      label: selection.kind === 'star'
        ? bundle.hostStar.spectralTypes.join(' / ') || t('observed.spectralMissing')
        : t('observed.confirmedExoplanet'),
      detail: t('observed.archiveComposite'),
    },
    status: {
      label: selection.illustrativeAssumptionCount > 0
        ? t('observed.mixedEvidence')
        : t('observed.archiveComposite'),
      detail: selection.illustrativeAssumptionCount > 0
        ? t('observed.assumptionNotice', { count: selection.illustrativeAssumptionCount })
        : t('observed.observedValuesNotice'),
      tone: selection.illustrativeAssumptionCount > 0 ? 'caution' : 'informational',
    },
    quickFacts: [
      catalogueMetric(
        t('metrics.mass'),
        mass,
        locale,
        selection.kind === 'star' ? 'M☉' : 'M⊕',
        3,
      ),
      catalogueMetric(
        t('metrics.radius'),
        radius,
        locale,
        selection.kind === 'star' ? 'R☉' : 'R⊕',
        3,
      ),
      catalogueMetric(
        selection.kind === 'star' ? t('observed.effectiveTemperature') : t('metrics.equilibriumTemperature'),
        temperature,
        locale,
        'K',
        1,
      ),
    ],
    metricSections: [
      {
        id: 'observed-physical',
        title: t('sections.bulkProperties'),
        tab: 'physics',
        summary: t('observed.nullPreservingSummary'),
        metrics: [
          catalogueMetric(
            t('observed.massKilograms'),
            mass === null ? null : mass * (
              selection.kind === 'star' ? SOLAR_MASS_KILOGRAMS : EARTH_MASS_KILOGRAMS
            ),
            locale,
            'kg',
            3,
          ),
          catalogueMetric(
            t('observed.radiusKilometers'),
            radius === null ? null : radius * (
              selection.kind === 'star' ? SOLAR_RADIUS_METERS : EARTH_RADIUS_METERS
            ) / 1_000,
            locale,
            'km',
            1,
          ),
        ],
      },
      ...(orbitMetrics.length > 0
        ? [{
            id: 'observed-orbit',
            title: t('sections.keplerianSolution'),
            tab: 'orbit' as const,
            summary: t('observed.orbitEvidenceSummary'),
            metrics: orbitMetrics,
          }]
        : []),
    ],
    provenance: {
      source: t('observed.nasaSource'),
      method: t('observed.compositeMethod'),
      confidence: t('observed.archiveComposite'),
      reference: reference?.label ?? bundle.provenance.catalogRevision,
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
  const observedHostIndexRef = useRef<ProgressiveHostSkyIndex | null>(null)
  const observedUniverseRequestRef = useRef(0)
  const observedSystemRequestRef = useRef<{
    client: ProgressiveCatalogClient
    requestId: number
    host: string
  } | null>(null)
  const observedSystemLoadRef = useRef<{
    host: string
    promise: Promise<ObservedSystemBundle>
  } | null>(null)
  const openObservedSystemRef = useRef<(host: string) => void>(() => undefined)
  const observedSelectionCacheRef = useRef(new Map<string, ObservedSelection>())
  const observedCenteredSelectionRef = useRef<ObservedSelection | null>(null)
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY)
  const [cameraCenter, setCameraCenter] = useState(INITIAL_CAMERA_CENTER)
  const [observedScene, setObservedScene] = useState(INITIAL_OBSERVED_SCENE)
  const [observedSelection, setObservedSelection] = useState<ObservedSelection | null>(null)
  const [observedSystem, setObservedSystem] = useState<ObservedSystemBundle | null>(null)
  const [observedNavigationState, setObservedNavigationState] =
    useState<ObservedNavigationState>({ status: 'idle' })
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

  const cancelObservedRequest = useCallback(() => {
    observedUniverseRequestRef.current += 1
    const pending = observedSystemRequestRef.current
    if (pending) pending.client.cancel(pending.requestId)
    observedSystemRequestRef.current = null
    observedSystemLoadRef.current = null
  }, [])

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
            setObservedSelection(null)
            setObservedSystem(null)
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
        onObservedSelection: (selection) => {
          if (active) {
            observedSelectionCacheRef.current.set(selection.id, selection)
            setObservedSelection(selection)
            setSelectedBody(null)
            setInspectorOpen(true)
          }
        },
        onObservedSelectionCleared: () => {
          if (active) setObservedSelection(null)
        },
        onObservedHostOpen: (hostName) => {
          if (active) openObservedSystemRef.current(hostName)
        },
        onObservedSceneChange: (nextObservedScene) => {
          if (active) {
            if (nextObservedScene.centeredObjectId) {
              observedCenteredSelectionRef.current =
                observedSelectionCacheRef.current.get(nextObservedScene.centeredObjectId) ??
                observedCenteredSelectionRef.current
            } else {
              observedCenteredSelectionRef.current = null
            }
            setObservedScene(nextObservedScene)
          }
        },
        onError: () => {
          if (active) setEngineFailed(true)
        },
      })
      host
        .querySelector<HTMLCanvasElement>('canvas')
        ?.setAttribute('aria-label', initialViewportLabelRef.current)
      await engine.init()
      if (!active) return
      engineRef.current = engine
      engine.setDisplaySettings(displaySettingsRef.current)
    }

    void bootEngine().catch(() => {
      if (active) setEngineFailed(true)
    })

    return () => {
      active = false
      const pending = observedSystemRequestRef.current
      if (pending) pending.client.cancel(pending.requestId)
      observedSystemRequestRef.current = null
      observedSystemLoadRef.current = null
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

  const hudObject = useMemo(() => {
    if (observedSelection?.kind === 'host') {
      return observedHostHudObject(
        observedSelection,
        t,
        resolvedLocale.intlLocale,
      )
    }
    if (observedSelection && observedSystem && observedSystem.host === observedSelection.host) {
      return observedSystemHudObject(
        observedSystem,
        observedSelection,
        t,
        resolvedLocale.intlLocale,
      )
    }
    return selectedBody
      ? toHudObject(
          selectedBody,
          t,
          resolvedLocale.intlLocale,
          resolvedLocale.code,
        )
      : null
  }, [
    observedSelection,
    observedSystem,
    resolvedLocale.code,
    resolvedLocale.intlLocale,
    selectedBody,
    t,
  ])

  const cameraView = useMemo<BodyCenteredCameraView | null>(() => {
    if (observedScene.mode !== 'asteria' && observedScene.centeredObjectId) {
      const centered = observedCenteredSelectionRef.current?.id ===
        observedScene.centeredObjectId
        ? observedCenteredSelectionRef.current
        : observedSelectionCacheRef.current.get(observedScene.centeredObjectId)
      if (centered) {
        const name = centered.kind === 'host' ? centered.host : centered.name
        const type = centered.kind === 'host'
          ? t('observed.hostType')
          : centered.kind === 'star'
            ? t('observed.hostStarType')
            : t('observed.exoplanetType')
        return {
          centeredObject: {
            id: centered.id,
            name,
            type,
            designation: centered.kind === 'host'
              ? centered.gaiaDr3 ?? undefined
              : centered.kind === 'star'
                ? centered.host
                : centered.name,
          },
          mode: observedScene.centeredViewMode === 'close'
            ? 'close-approach'
            : 'orbit',
          transitioning: observedScene.transitioning,
          closeApproachAvailable: centered.kind === 'planet',
          previousViewLabel: observedScene.mode === 'observed-system'
            ? t('observed.observedUniverse')
            : t('observed.universeOverview'),
        }
      }
    }
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
  }, [cameraCenter, observedScene, t])

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

  const focusViewport = useCallback(() => {
    window.requestAnimationFrame(() => {
      viewportRef.current?.querySelector<HTMLCanvasElement>('canvas')?.focus()
    })
  }, [])

  const showAsteriaScene = useCallback(() => {
    cancelObservedRequest()
    engineRef.current?.showAsteriaSystem()
    observedCenteredSelectionRef.current = null
    setObservedSelection(null)
    setObservedSystem(null)
    setObservedNavigationState({ status: 'idle' })
    setActiveTool('explore')
    setCinematic(false)
    focusViewport()
  }, [cancelObservedRequest, focusViewport])

  const handleSelectTarget = useCallback((id: string) => {
    const body = BODY_LOOKUP.get(id)
    if (!body) return
    if (observedScene.mode !== 'asteria') showAsteriaScene()
    setObservedSelection(null)
    setObservedSystem(null)
    setSelectedBody(body)
    setInspectorOpen(true)
    engineRef.current?.select(id)
  }, [observedScene.mode, showAsteriaScene])

  const handleExploreObservedUniverse = useCallback(
    async (index: ProgressiveHostSkyIndex, focusHost?: string) => {
      const activeEngine = engineRef.current
      if (!activeEngine) {
        setObservedNavigationState({
          status: 'error',
          target: 'universe',
          ...(focusHost ? { host: focusHost } : {}),
        })
        return
      }
      const navigationRequest = observedUniverseRequestRef.current + 1
      observedUniverseRequestRef.current = navigationRequest
      const pending = observedSystemRequestRef.current
      if (pending) pending.client.cancel(pending.requestId)
      observedSystemRequestRef.current = null
      observedSystemLoadRef.current = null
      setObservedNavigationState({
        status: 'loading',
        target: 'universe',
        ...(focusHost ? { host: focusHost } : {}),
      })
      try {
        observedHostIndexRef.current = index
        observedCenteredSelectionRef.current = null
        setSelectedBody(null)
        setObservedSystem(null)
        if (!focusHost) setObservedSelection(null)
        activeEngine.showObservedUniverse(index, focusHost)
        if (observedUniverseRequestRef.current !== navigationRequest) return
        setObservedNavigationState({
          status: 'success',
          target: 'universe',
          ...(focusHost ? { host: focusHost } : {}),
        })
        setActiveTool('explore')
        setCinematic(false)
        focusViewport()
      } catch {
        setObservedNavigationState({
          status: 'error',
          target: 'universe',
          ...(focusHost ? { host: focusHost } : {}),
        })
      }
    },
    [focusViewport],
  )

  const handleOpenObservedSystem = useCallback(async (hostName: string) => {
    const inFlight = observedSystemLoadRef.current
    if (inFlight?.host === hostName) {
      await inFlight.promise.catch(() => undefined)
      return
    }
    const navigationRequest = observedUniverseRequestRef.current + 1
    observedUniverseRequestRef.current = navigationRequest
    const activeEngine = engineRef.current
    if (!activeEngine) {
      setObservedNavigationState({ status: 'error', target: 'system', host: hostName })
      return
    }
    const previous = observedSystemRequestRef.current
    if (previous) previous.client.cancel(previous.requestId)
    setObservedNavigationState({ status: 'loading', target: 'system', host: hostName })
    try {
      const { getProgressiveCatalogClient } = await import(
        './data/progressiveCatalogClient'
      )
      if (observedUniverseRequestRef.current !== navigationRequest) return
      const client = getProgressiveCatalogClient()
      if (!observedHostIndexRef.current) {
        const hostSkyRequest = client.hostSky()
        observedSystemRequestRef.current = {
          client,
          requestId: hostSkyRequest.requestId,
          host: hostName,
        }
        const { index } = await hostSkyRequest.promise
        if (
          observedSystemRequestRef.current?.requestId !== hostSkyRequest.requestId ||
          observedUniverseRequestRef.current !== navigationRequest
        ) return
        observedHostIndexRef.current = index
        activeEngine.showObservedUniverse(index, hostName)
      }
      const request = client.system(hostName)
      observedSystemRequestRef.current = {
        client,
        requestId: request.requestId,
        host: hostName,
      }
      const systemPromise = request.promise.then(({ system }) => system)
      observedSystemLoadRef.current = { host: hostName, promise: systemPromise }
      const system = await systemPromise
      if (
        observedSystemRequestRef.current?.requestId !== request.requestId ||
        observedUniverseRequestRef.current !== navigationRequest
      ) return
      observedSystemRequestRef.current = null
      observedSystemLoadRef.current = null
      if (system.astrometry.cartesianPosition === null) {
        throw new Error('Observed system has no finite three-dimensional distance.')
      }
      setSelectedBody(null)
      setObservedSystem(system)
      observedCenteredSelectionRef.current = null
      activeEngine.loadObservedSystem(system)
      setObservedNavigationState({ status: 'success', target: 'system', host: hostName })
      setActiveTool('explore')
      setCinematic(false)
      focusViewport()
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (observedUniverseRequestRef.current !== navigationRequest) return
      observedSystemRequestRef.current = null
      observedSystemLoadRef.current = null
      setObservedNavigationState({ status: 'error', target: 'system', host: hostName })
    }
  }, [focusViewport])

  openObservedSystemRef.current = (hostName: string) => {
    void handleOpenObservedSystem(hostName)
  }

  const ensureObservedUniverse = useCallback(async (focusHost?: string) => {
    const existing = observedHostIndexRef.current
    if (existing) {
      await handleExploreObservedUniverse(existing, focusHost)
      return
    }
    const navigationRequest = observedUniverseRequestRef.current + 1
    observedUniverseRequestRef.current = navigationRequest
    setObservedNavigationState({
      status: 'loading',
      target: 'universe',
      ...(focusHost ? { host: focusHost } : {}),
    })
    try {
      const { getProgressiveCatalogClient } = await import(
        './data/progressiveCatalogClient'
      )
      if (observedUniverseRequestRef.current !== navigationRequest) return
      const client = getProgressiveCatalogClient()
      const request = client.hostSky()
      observedSystemRequestRef.current = {
        client,
        requestId: request.requestId,
        host: focusHost ?? '',
      }
      const payload = await request.promise
      if (
        observedUniverseRequestRef.current !== navigationRequest ||
        observedSystemRequestRef.current?.requestId !== request.requestId
      ) return
      observedSystemRequestRef.current = null
      observedSystemLoadRef.current = null
      await handleExploreObservedUniverse(payload.index, focusHost)
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (observedUniverseRequestRef.current !== navigationRequest) return
      observedSystemRequestRef.current = null
      observedSystemLoadRef.current = null
      setObservedNavigationState({
        status: 'error',
        target: 'universe',
        ...(focusHost ? { host: focusHost } : {}),
      })
    }
  }, [handleExploreObservedUniverse])

  const handleOpenObservedUniverse = useCallback(() => {
    void ensureObservedUniverse()
  }, [ensureObservedUniverse])

  const handleCenterTarget = useCallback((id: string, mode: BodyCenteredViewMode) => {
    if (BODY_LOOKUP.has(id)) {
      if (observedScene.mode !== 'asteria') showAsteriaScene()
      const centered = engineRef.current?.centerOnBody(
        id,
        mode === 'close-approach' ? 'close' : 'orbit',
      )
      if (!centered) return
      setActiveTool('explore')
      focusViewport()
      return
    }
    if (observedScene.mode !== 'asteria') {
      const observedMode = mode === 'close-approach' ? 'close' : 'orbit'
      const centered = engineRef.current?.centerOnObservedObject(id, observedMode)
      if (!centered) return
      setActiveTool('explore')
      focusViewport()
      return
    }
  }, [focusViewport, observedScene.mode, showAsteriaScene])

  const handleFocusTarget = useCallback((id: string, surface = false) => {
    handleCenterTarget(id, surface ? 'close-approach' : 'orbit')
  }, [handleCenterTarget])

  const handleCameraViewModeChange = useCallback((mode: BodyCenteredViewMode) => {
    if (observedScene.mode !== 'asteria') {
      if (observedScene.centeredObjectId) {
        handleCenterTarget(observedScene.centeredObjectId, mode)
      }
      return
    }
    if (cameraCenter.bodyId) handleCenterTarget(cameraCenter.bodyId, mode)
  }, [cameraCenter.bodyId, handleCenterTarget, observedScene])

  const handleReturnToPreviousView = useCallback(() => {
    if (observedScene.mode === 'observed-system') {
      cancelObservedRequest()
      void ensureObservedUniverse(observedScene.activeHost ?? undefined)
      return
    }
    if (observedScene.mode === 'observed-universe') {
      showAsteriaScene()
      return
    }
    if (engineRef.current?.returnToPreviousView()) focusViewport()
  }, [cancelObservedRequest, ensureObservedUniverse, focusViewport, observedScene, showAsteriaScene])

  const handleSystemOverview = useCallback(() => {
    cancelObservedRequest()
    setObservedNavigationState({ status: 'idle' })
    if (observedScene.mode === 'observed-system') {
      engineRef.current?.showSystemOverview()
      setActiveTool('explore')
      focusViewport()
      return
    }
    engineRef.current?.showSystemOverview()
    setActiveTool('explore')
    focusViewport()
  }, [cancelObservedRequest, focusViewport, observedScene])

  const handleClearSelection = useCallback(() => {
    if (observedScene.mode !== 'asteria') {
      setObservedSelection(null)
      engineRef.current?.clearObservedSelection()
      return
    }
    setSelectedBody(null)
    engineRef.current?.clearSelection()
  }, [observedScene.mode])

  const handleOpenSearch = useCallback(() => {
    cancelObservedRequest()
    setObservedNavigationState({ status: 'idle' })
    setOverlay(null)
    setCinematic(false)
    setActiveTool('search')
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [cancelObservedRequest])

  const handleToolChange = useCallback((tool: NavigationTool) => {
    setOverlay(null)
    if (tool === 'home') {
      if (observedScene.mode === 'asteria') engineRef.current?.showSystemOverview()
      else showAsteriaScene()
      setActiveTool('explore')
      focusViewport()
      return
    }
    if (tool === 'search') {
      handleOpenSearch()
      return
    }
    if (observedSystemRequestRef.current) {
      cancelObservedRequest()
      setObservedNavigationState({ status: 'idle' })
    }
    setActiveTool(tool)
    if (tool !== 'explore') setCinematic(false)
  }, [cancelObservedRequest, focusViewport, handleOpenSearch, observedScene.mode, showAsteriaScene])

  const handleResetView = useCallback(() => {
    cancelObservedRequest()
    engineRef.current?.resetView()
    observedCenteredSelectionRef.current = null
    setObservedSelection(null)
    setObservedSystem(null)
    setObservedNavigationState({ status: 'idle' })
    setCinematic(false)
    setActiveTool('explore')
    focusViewport()
  }, [cancelObservedRequest, focusViewport])

  const handleOpenQuickTour = useCallback(() => {
    overlayReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setCinematic(false)
    setTourStep(0)
    setOverlay('quick-tour')
  }, [])

  const handleCloseTool = useCallback(() => {
    cancelObservedRequest()
    setObservedNavigationState({ status: 'idle' })
    setActiveTool('explore')
    searchInputRef.current?.blur()
    focusNavigationTool('explore')
  }, [cancelObservedRequest])
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
    if (observedScene.mode !== 'asteria') {
      showAsteriaScene()
    } else {
      engineRef.current?.focusOn('pelagos')
    }
    focusViewport()
  }, [focusViewport, observedScene.mode, showAsteriaScene])

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
      const observedHierarchyKey =
        event.code === 'Backspace' ||
        event.code === 'Digit0' ||
        event.code === 'Numpad0'
      if (observedHierarchyKey && observedScene.mode !== 'asteria') {
        const hierarchyNavigationBlocked =
          overlay !== null ||
          shortcutsOpen ||
          toProductTool(activeTool) !== null ||
          isHierarchyNavigationControl(event.target)
        if (hierarchyNavigationBlocked) {
          event.preventDefault()
          event.stopImmediatePropagation()
          return
        }
        if (event.repeat) return
        event.preventDefault()
        event.stopImmediatePropagation()
        if (event.code === 'Backspace') handleReturnToPreviousView()
        else handleSystemOverview()
      } else if (event.key === '/') {
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
    handleReturnToPreviousView,
    handleSystemOverview,
    observedScene.mode,
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
          observedScene.mode === 'observed-universe'
            ? 'observed-universe'
            : observedScene.mode === 'observed-system'
              ? 'observed-system'
              : cameraCenter.mode === 'free'
                ? 'free'
                : cameraCenter.mode === 'system'
                  ? 'system'
                  : undefined
        }
        cameraFrameName={
          observedScene.mode === 'observed-system'
            ? observedScene.activeHost ?? undefined
            : undefined
        }
        cameraFrameCount={
          observedScene.mode !== 'asteria'
            ? observedHostIndexRef.current?.records.length
            : undefined
        }
        cameraFrameTransitioning={
          observedScene.mode !== 'asteria'
            ? observedScene.transitioning
            : cameraCenter.mode === 'free' || cameraCenter.mode === 'system'
              ? cameraCenter.transitioning
              : undefined
        }
        cameraHierarchyNavigationStatus={
          observedScene.mode === 'observed-system' &&
          observedNavigationState.status !== 'idle' &&
          observedNavigationState.target === 'universe'
            ? observedNavigationState.status === 'loading'
              ? 'loading'
              : observedNavigationState.status === 'error'
                ? 'error'
                : 'idle'
            : 'idle'
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
          if (hudObject) handleFocusTarget(hudObject.id)
        }}
        onCenterSelectedObject={(mode) => {
          if (hudObject) handleCenterTarget(hudObject.id, mode)
        }}
        onCameraViewModeChange={handleCameraViewModeChange}
        onReturnToPreviousView={
          observedScene.mode !== 'asteria' || cameraCenter.canReturn
            ? handleReturnToPreviousView
            : undefined
        }
        onSystemOverview={handleSystemOverview}
        onOpenAsteriaSystem={
          observedScene.mode !== 'asteria' ? showAsteriaScene : undefined
        }
        onOpenObservedUniverse={
          observedScene.mode === 'asteria' ? handleOpenObservedUniverse : undefined
        }
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
        hidden={
          observedScene.mode !== 'asteria' ||
          cinematic ||
          overlay !== null ||
          activeTool !== 'explore'
        }
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
          onExploreObservedUniverse={handleExploreObservedUniverse}
          onOpenObservedSystem={handleOpenObservedSystem}
          observedNavigationState={observedNavigationState}
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
