import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  DatabaseZap,
  HardDriveDownload,
  List,
  MapPinned,
  ExternalLink,
  LocateFixed,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PROGRESSIVE_EXOPLANET_RELEASE } from '../data/generated/progressiveExoplanetRelease'
import type { ProgressiveCatalogClient } from '../data/progressiveCatalogClient'
import type {
  CatalogMeasurement,
  ProgressiveExoplanetManifest,
  ProgressiveExoplanetSummary,
  ProgressiveHostSkyIndex,
} from '../data/progressiveExoplanetCatalog'
import type {
  ProgressiveCatalogFilter,
  ProgressiveCatalogSort,
} from '../data/progressiveCatalogSearch'
import type {
  CatalogDetailPayload,
  CatalogHostSkyPayload,
  CatalogLoadSource,
  CatalogOfflineProgressPayload,
  CatalogQueryPayload,
} from '../data/progressiveCatalogProtocol'
import type { CatalogOfflineStatus } from '../data/catalogOfflineStore'
import { localeOption } from '../i18n'

export const NASA_ARCHIVE_RECORD_COUNT = PROGRESSIVE_EXOPLANET_RELEASE.recordCount

const RESULTS_PAGE_SIZE = 20

const CATALOG_FILTERS: readonly ProgressiveCatalogFilter[] = [
  'nearby', 'earth-size', 'temperate', 'recent',
] as const

const CATALOG_SORTS: readonly ProgressiveCatalogSort[] = ['name', 'distance', 'discovery'] as const

let clientModulePromise: Promise<typeof import('../data/progressiveCatalogClient')> | null = null
let skyAtlasModulePromise: Promise<typeof import('./ObservedSkyAtlas')> | null = null

function requestSkyAtlasModule(): Promise<typeof import('./ObservedSkyAtlas')> {
  skyAtlasModulePromise ??= import('./ObservedSkyAtlas').catch((error: unknown) => {
    skyAtlasModulePromise = null
    throw error
  })
  return skyAtlasModulePromise
}

const LazyObservedSkyAtlas = lazy(requestSkyAtlasModule)

function requestCatalogClient(): Promise<ProgressiveCatalogClient> {
  clientModulePromise ??= import('../data/progressiveCatalogClient').catch((error: unknown) => {
      clientModulePromise = null
      throw error
    })
  return clientModulePromise.then(({ getProgressiveCatalogClient }) =>
    getProgressiveCatalogClient(),
  )
}

function displayNumber(
  value: number | null,
  unit: string,
  maximumFractionDigits: number,
  intlLocale: string,
  notReported: string,
): string {
  if (value === null || !Number.isFinite(value)) return notReported
  return `${value.toLocaleString(intlLocale, { maximumFractionDigits })}${unit}`
}

function displayBytes(value: number, intlLocale: string): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB'] as const
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** exponent).toLocaleString(intlLocale, {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  })} ${units[exponent]}`
}

function displayUnit(unit: string): string {
  const replacements: Readonly<Record<string, string>> = {
    R_earth: 'R⊕',
    M_earth: 'M⊕',
    R_sun: 'R☉',
    M_sun: 'M☉',
    S_earth: 'S⊕',
    dimensionless: '',
    percent: '%',
    'log10(L_sun)': 'log L☉',
  }
  return replacements[unit] ?? unit
}

function displayUnitLabel(unit: string): string {
  const replacements: Readonly<Record<string, string>> = {
    day: 'd',
    hour: 'h',
    au: 'AU',
  }
  return replacements[unit] ?? displayUnit(unit)
}

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
  Aacute: 'Á',
  Ouml: 'Ö',
  Scaron: 'Š',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  iacute: 'í',
  ntilde: 'ñ',
  oacute: 'ó',
  ograve: 'ò',
  ouml: 'ö',
  plusmn: '±',
  scaron: 'š',
  uacute: 'ú',
  uuml: 'ü',
  yacute: 'ý',
}

function decodeReferenceText(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    let codePoint: number | null = null
    if (token.startsWith('#x')) {
      codePoint = Number.parseInt(token.slice(2), 16)
    } else if (token.startsWith('#')) {
      codePoint = Number.parseInt(token.slice(1), 10)
    }
    if (codePoint !== null) {
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity
    }
    return HTML_ENTITIES[token] ?? entity
  })
}

function formatMeasurement(
  measurement: CatalogMeasurement | undefined,
  maximumFractionDigits: number,
  intlLocale: string,
  notReported: string,
): { value: string; uncertainty: string | null; missing: boolean } {
  if (!measurement || measurement.value === null) {
    return { value: notReported, uncertainty: null, missing: true }
  }
  const prefix = measurement.limit === 1 ? '≤ ' : measurement.limit === -1 ? '≥ ' : ''
  const unit = displayUnitLabel(measurement.unit)
  const suffix = unit ? ` ${unit}` : ''
  const uncertainty =
    measurement.errorPlus === null && measurement.errorMinus === null
      ? null
       : `+${displayNumber(measurement.errorPlus, '', maximumFractionDigits, intlLocale, notReported)} / −${displayNumber(
          measurement.errorMinus === null ? null : Math.abs(measurement.errorMinus),
          '',
          maximumFractionDigits,
          intlLocale,
          notReported,
        )}${suffix}`
  return {
    value: `${prefix}${displayNumber(measurement.value, '', maximumFractionDigits, intlLocale, notReported)}${suffix}`,
    uncertainty,
    missing: false,
  }
}

interface MeasurementRowProps {
  label: string
  measurement: CatalogMeasurement | undefined
  maximumFractionDigits?: number
}

const MeasurementRow = memo(function MeasurementRow({
  label,
  measurement,
  maximumFractionDigits = 2,
}: MeasurementRowProps) {
  const { t, i18n } = useTranslation('nasa')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  const formatted = formatMeasurement(
    measurement,
    maximumFractionDigits,
    intlLocale,
    t('common.notReported'),
  )
  const referenceLabel = measurement?.reference
    ? decodeReferenceText(measurement.reference.label)
    : null
  return (
    <div>
      <dt>{label}</dt>
      <dd className={formatted.missing ? 'is-missing' : undefined}>
        <span>{formatted.value}</span>
        {formatted.uncertainty ? <small>{formatted.uncertainty}</small> : null}
        {measurement?.reference?.url && referenceLabel ? (
          <a
            className="product-nasa-measurement-source"
            href={measurement.reference.url}
            target="_blank"
            rel="noreferrer"
            title={referenceLabel}
            aria-label={t('common.openSourceFor', { label })}
          >
            {t('common.source')} · {referenceLabel} <ExternalLink size={10} aria-hidden="true" />
          </a>
        ) : referenceLabel ? (
          <small className="product-nasa-measurement-source" title={referenceLabel}>
            {t('common.source')} · {referenceLabel}
          </small>
        ) : null}
      </dd>
    </div>
  )
})

interface TextRowProps {
  label: string
  value: string | number | null
  unit?: string
  referenceUrl?: string | null
}

const TextRow = memo(function TextRow({
  label,
  value,
  unit = '',
  referenceUrl,
}: TextRowProps) {
  const { t } = useTranslation('nasa')
  const missing = value === null || value === ''
  return (
    <div>
      <dt>{label}</dt>
      <dd className={missing ? 'is-missing' : undefined}>
        <span>{missing ? t('common.notReported') : `${value}${unit}`}</span>
        {referenceUrl ? (
          <a
            href={referenceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t('common.openSourceFor', { label })}
          >
            {t('common.source')} <ExternalLink size={10} aria-hidden="true" />
          </a>
        ) : null}
      </dd>
    </div>
  )
})

interface DetailSectionProps {
  title: string
  children: ReactNode
}

const DetailSection = memo(function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <section className="product-nasa-detail__group">
      <h3>{title}</h3>
      <dl>{children}</dl>
    </section>
  )
})

interface ProgressiveRecordDetailProps {
  id: string
  labelledBy: string
  detail: CatalogDetailPayload
  manifest: ProgressiveExoplanetManifest
  onOpenObservedSystem?: (host: string) => void | Promise<void>
  observedNavigationState?: ObservedNavigationState
}

const ProgressiveRecordDetail = memo(function ProgressiveRecordDetail({
  id,
  labelledBy,
  detail,
  manifest,
  onOpenObservedSystem,
  observedNavigationState = IDLE_OBSERVED_NAVIGATION,
}: ProgressiveRecordDetailProps) {
  const { t, i18n } = useTranslation('nasa')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  const notReported = t('common.notReported')
  const snapshotDate = useMemo(() => new Intl.DateTimeFormat(intlLocale, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }), [intlLocale])
  const { record } = detail
  const m = record.measurements
  const jwstObservations = [
    record.observationCounts.jwstTransmission,
    record.observationCounts.jwstEmission,
    record.observationCounts.jwstDirectImaging,
    record.observationCounts.jwstPhaseCurve,
  ].reduce<number>((sum, value) => sum + (value ?? 0), 0)
  const observedCount = (value: number | null): number | null =>
    value === null || value === 0 ? null : value
  const distanceReported = m.distancePc?.value !== null && m.distancePc?.value !== undefined
  const navigationBusy = observedNavigationState.status === 'loading'
  const openingThisSystem =
    navigationBusy &&
    observedNavigationState.target === 'system' &&
    observedNavigationState.host === record.host

  return (
    <div id={id} className="product-nasa-detail" role="region" aria-labelledby={labelledBy}>
      <div className="product-nasa-detail__runtime" role="status">
        <ShieldCheck size={12} aria-hidden="true" /> {t('detail.verifiedHash')}
        <span>·</span>
        {detail.fromMemoryCache
          ? t('detail.memoryCache')
          : detail.fromPersistentCache
            ? t('detail.offlineStorage')
            : t('detail.network')}
        <span>·</span>
        {detail.loadMs.toLocaleString(intlLocale, { maximumFractionDigits: 1 })} ms
      </div>

      {onOpenObservedSystem ? (
        <div className="product-nasa-detail__navigation">
          <button
            type="button"
            disabled={!distanceReported}
            aria-disabled={navigationBusy || undefined}
            aria-busy={openingThisSystem || undefined}
            title={!distanceReported ? t('navigation.skyOnlyTitle') : undefined}
            onClick={() => {
              if (!navigationBusy) {
                invokeObservedNavigation(onOpenObservedSystem, record.host)
              }
            }}
          >
            {openingThisSystem ? (
              <RefreshCcw className="is-spinning" size={13} aria-hidden="true" />
            ) : (
              <LocateFixed size={13} aria-hidden="true" />
            )}
            {t(!distanceReported
              ? 'navigation.skyOnly'
              : openingThisSystem
                ? 'navigation.openingSystem'
                : 'navigation.openSystem3d', { host: record.host })}
          </button>
          {!distanceReported ? <small>{t('navigation.distanceRequired')}</small> : null}
        </div>
      ) : null}

      <DetailSection title={t('detail.positionIdentity')}>
        <TextRow label={t('detail.distance')} value={displayNumber(m.distancePc?.value ?? null, ' pc', 3, intlLocale, notReported)} />
        <TextRow label={t('detail.rightAscension')} value={displayNumber(record.coordinates.raDeg, '°', 5, intlLocale, notReported)} />
        <TextRow label={t('detail.declination')} value={displayNumber(record.coordinates.decDeg, '°', 5, intlLocale, notReported)} />
        <TextRow label={t('detail.referenceFrame')} value={record.coordinates.frame} />
        <TextRow label="Gaia DR3" value={record.externalIds.gaiaDr3} />
        <TextRow label="TIC" value={record.externalIds.tic} />
      </DetailSection>

      <DetailSection title={t('detail.planet')}>
        <MeasurementRow label={t('detail.radius')} measurement={m.radiusEarth} />
        <MeasurementRow label={t('detail.mass')} measurement={m.massEarth} />
        <MeasurementRow label={t('detail.density')} measurement={m.densityGcm3} />
        <TextRow label={t('detail.massBasis')} value={record.flags.massProvenance} />
        <TextRow label={t('detail.controversialFlag')} value={record.flags.controversial ? t('common.yesFlagged') : t('common.no')} />
      </DetailSection>

      <DetailSection title={t('detail.orbitTransit')}>
        <MeasurementRow label={t('detail.period')} measurement={m.orbitalPeriodDays} />
        <MeasurementRow label={t('detail.semiMajorAxis')} measurement={m.semiMajorAxisAu} maximumFractionDigits={4} />
        <MeasurementRow label={t('detail.eccentricity')} measurement={m.eccentricity} maximumFractionDigits={4} />
        <MeasurementRow label={t('detail.inclination')} measurement={m.inclinationDeg} />
        <MeasurementRow label={t('detail.transitDuration')} measurement={m.transitDurationHours} />
        <MeasurementRow label={t('detail.transitDepth')} measurement={m.transitDepthPercent} />
        <MeasurementRow label={t('detail.rvAmplitude')} measurement={m.radialVelocityAmplitudeMs} />
      </DetailSection>

      <DetailSection title={t('detail.climateObserving')}>
        <MeasurementRow label={t('detail.equilibriumTemperature')} measurement={m.equilibriumTempK} maximumFractionDigits={0} />
        <MeasurementRow label={t('detail.insolation')} measurement={m.insolationEarth} />
        <MeasurementRow label={t('detail.transmissionMetric')} measurement={m.transmissionMetric} />
        <MeasurementRow label={t('detail.emissionMetric')} measurement={m.emissionMetric} />
        <TextRow label={t('detail.transmissionSpectra')} value={observedCount(record.observationCounts.transmissionSpectra)} />
        <TextRow label={t('detail.emissionSpectra')} value={observedCount(record.observationCounts.emissionSpectra)} />
        <TextRow label={t('detail.jwstObservations')} value={observedCount(jwstObservations)} />
      </DetailSection>

      <DetailSection title={t('detail.hostStar')}>
        <TextRow label={t('detail.spectralType')} value={record.hostStar.spectralType} />
        <MeasurementRow label={t('detail.effectiveTemperature')} measurement={m.stellarTeffK} maximumFractionDigits={0} />
        <MeasurementRow label={t('detail.radius')} measurement={m.stellarRadiusSolar} />
        <MeasurementRow label={t('detail.mass')} measurement={m.stellarMassSolar} />
        <MeasurementRow label={t('detail.age')} measurement={m.stellarAgeGyr} />
        <MeasurementRow label={t('detail.metallicity')} measurement={m.stellarMetallicityDex} />
        <MeasurementRow label={t('detail.luminosity')} measurement={m.stellarLuminosityLogSolar} />
        <MeasurementRow label={t('detail.gaiaMagnitude')} measurement={m.gaiaMagnitude} />
      </DetailSection>

      <DetailSection title={t('detail.discoverySystem')}>
        <TextRow label={t('detail.year')} value={record.discovery.year} />
        <TextRow label={t('detail.method')} value={record.discovery.method} />
        <TextRow label={t('detail.facility')} value={record.discovery.facility} />
        <TextRow label={t('detail.instrument')} value={record.discovery.instrument} />
        <TextRow label={t('detail.telescope')} value={record.discovery.telescope} />
        <TextRow label={t('detail.knownPlanets')} value={record.system.planetCount} />
        <TextRow label={t('detail.systemStars')} value={record.system.starCount} />
        <TextRow
          label={t('detail.discoveryPaper')}
          value={
            record.discovery.reference
              ? decodeReferenceText(record.discovery.reference.label)
              : null
          }
          referenceUrl={record.discovery.reference?.url}
        />
      </DetailSection>

      <section className="product-nasa-provenance" aria-labelledby={`${id}-provenance`}>
        <h3 id={`${id}-provenance`}>{t('detail.integrityTitle')}</h3>
        <p>
          <strong>{manifest.source.provider}</strong>
          {' · '}
          {manifest.source.product}
          {' · '}
          {t('detail.release', { revision: manifest.catalogRevision })}
        </p>
        <p>{t('detail.compositePolicy')}</p>
        <p>{t('detail.nullPolicy')}</p>
        <p>{t('detail.retrievedNotice', {
          date: snapshotDate.format(new Date(manifest.retrievedAt)),
        })}</p>
        <div className="product-nasa-provenance__links">
          <a href={manifest.source.requestUrl} target="_blank" rel="noreferrer">
            {t('detail.reproducibleQuery')} <ExternalLink size={12} aria-hidden="true" />
          </a>
          <a href={manifest.source.documentationUrl} target="_blank" rel="noreferrer">
            {t('detail.columnDefinitions')} <ExternalLink size={12} aria-hidden="true" />
          </a>
          <a href={manifest.source.acknowledgementUrl} target="_blank" rel="noreferrer">
            {t('detail.dataCredits')} <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  )
})

export type ObservedNavigationState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'loading' | 'success' | 'error'
      readonly target: 'universe' | 'system'
      readonly host?: string
    }

export type ExploreObservedUniverseHandler = (
  index: ProgressiveHostSkyIndex,
  focusHost?: string,
) => void | Promise<void>

export type OpenObservedSystemHandler = (host: string) => void | Promise<void>

const IDLE_OBSERVED_NAVIGATION: ObservedNavigationState = { status: 'idle' }

function invokeObservedNavigation<T extends readonly unknown[]>(
  callback: (...args: T) => void | Promise<void>,
  ...args: T
): void {
  try {
    void Promise.resolve(callback(...args)).catch(() => undefined)
  } catch {
    // The owner reports navigation failures through `observedNavigationState`.
  }
}

const ObservedNavigationStatus = memo(function ObservedNavigationStatus({
  state,
}: {
  readonly state: ObservedNavigationState
}) {
  const { t } = useTranslation('nasa')
  if (state.status === 'idle') return null
  const target = state.target === 'system' && state.host
    ? t('navigation.systemTarget', { host: state.host })
    : t('navigation.universeTarget')
  return (
    <p
      className={`product-observed-navigation-status is-${state.status}`}
      role={state.status === 'error' ? 'alert' : 'status'}
      aria-live={state.status === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {state.status === 'loading' ? (
        <RefreshCcw className="is-spinning" size={12} aria-hidden="true" />
      ) : state.status === 'error' ? (
        <AlertTriangle size={12} aria-hidden="true" />
      ) : (
        <ShieldCheck size={12} aria-hidden="true" />
      )}
      {t(`navigation.${state.status}`, { target })}
    </p>
  )
})

export interface ProgressiveNasaCatalogProps {
  searchInputRef: RefObject<HTMLInputElement | null>
  onExploreObservedUniverse?: ExploreObservedUniverseHandler
  onOpenObservedSystem?: OpenObservedSystemHandler
  observedNavigationState?: ObservedNavigationState
}

type OfflineOperation =
  | { readonly status: 'idle' }
  | { readonly status: 'installing'; readonly progress: CatalogOfflineProgressPayload }
  | { readonly status: 'removing' }
  | { readonly status: 'error' }

interface OfflinePackControlProps {
  readonly offline: CatalogOfflineStatus
  readonly loadSource: CatalogLoadSource
  readonly operation: OfflineOperation
  readonly onInstall: () => void
  readonly onRemove: () => void
}

const OfflinePackControl = memo(function OfflinePackControl({
  offline,
  loadSource,
  operation,
  onInstall,
  onRemove,
}: OfflinePackControlProps) {
  const { t, i18n } = useTranslation('nasa')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  return (
    <section className="product-offline-pack" aria-label={t('offline.region')}>
      <div className="product-offline-pack__summary">
        <span className={offline.packInstalled ? 'is-ready' : undefined}>
          {offline.packInstalled ? (
            <DatabaseZap size={12} aria-hidden="true" />
          ) : loadSource === 'offline-cache' ? (
            <WifiOff size={12} aria-hidden="true" />
          ) : (
            <HardDriveDownload size={12} aria-hidden="true" />
          )}
          {offline.packInstalled
            ? t('offline.fullReady')
            : loadSource === 'offline-cache'
              ? t('offline.verifiedCore')
              : offline.coreCached
                ? t('offline.coreCached')
                : t('offline.optional')}
        </span>
        <small>
          {offline.packInstalled
            ? t('offline.installedSummary', {
                cached: offline.detailChunksCached.toLocaleString(intlLocale),
                total: offline.detailChunksTotal.toLocaleString(intlLocale),
                bytes: displayBytes(offline.storedBytes, intlLocale),
              })
            : offline.supported
              ? t('offline.availableSummary', {
                  cached: offline.detailChunksCached.toLocaleString(intlLocale),
                  total: offline.detailChunksTotal.toLocaleString(intlLocale),
                  atlas: t(offline.skyCached ? 'offline.cached' : 'offline.onDemand'),
                })
              : t('offline.unavailable')}
        </small>
      </div>

      {operation.status === 'installing' ? (
        <div className="product-offline-pack__progress" role="status" aria-live="polite">
          <progress
            max={operation.progress.totalChunks}
            value={operation.progress.completedChunks}
            aria-label={t('offline.progress')}
          />
          <span>
            {operation.progress.completedChunks === 0
              ? t('offline.verifyingAtlas')
              : t('offline.verifyingDetail', {
                  completed: operation.progress.completedChunks.toLocaleString(intlLocale),
                  total: operation.progress.totalChunks.toLocaleString(intlLocale),
                })}
            {' · '}{displayBytes(operation.progress.storedBytes, intlLocale)} / {displayBytes(operation.progress.totalBytes, intlLocale)}
          </span>
        </div>
      ) : null}

      {operation.status === 'error' ? (
        <p className="product-offline-pack__error" role="alert">
          <AlertTriangle size={12} aria-hidden="true" /> {t('load.fallbackError')}
        </p>
      ) : null}

      {offline.supported ? (
        offline.packInstalled ? (
          <button
            type="button"
            disabled={operation.status === 'removing'}
            onClick={onRemove}
          >
            {operation.status === 'removing' ? (
              <RefreshCcw className="is-spinning" size={12} aria-hidden="true" />
            ) : (
              <Trash2 size={12} aria-hidden="true" />
            )}
            {t(operation.status === 'removing' ? 'offline.removing' : 'offline.remove')}
          </button>
        ) : (
          <button
            type="button"
            disabled={operation.status === 'installing'}
            onClick={onInstall}
          >
            {operation.status === 'installing' ? (
              <RefreshCcw className="is-spinning" size={12} aria-hidden="true" />
            ) : (
              <HardDriveDownload size={12} aria-hidden="true" />
            )}
            {t(operation.status === 'installing' ? 'offline.installing' : 'offline.install')}
          </button>
        )
      ) : null}
      <p>
        {t('offline.explanation')}
      </p>
    </section>
  )
})

type CatalogueState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready'
      readonly manifest: ProgressiveExoplanetManifest
      readonly readyMs: number
      readonly prepareMs: number
      readonly loadSource: CatalogLoadSource
      readonly offline: CatalogOfflineStatus
    }

type DetailState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly id: string }
  | { readonly status: 'error'; readonly id: string }
  | { readonly status: 'ready'; readonly id: string; readonly detail: CatalogDetailPayload }

type CatalogViewMode = 'records' | 'sky'

type HostSkyState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly payload: CatalogHostSkyPayload }

export const ProgressiveNasaCatalog = memo(function ProgressiveNasaCatalog({
  searchInputRef,
  onExploreObservedUniverse,
  onOpenObservedSystem,
  observedNavigationState = IDLE_OBSERVED_NAVIGATION,
}: ProgressiveNasaCatalogProps) {
  const { t, i18n } = useTranslation('nasa')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  const snapshotDate = useMemo(() => new Intl.DateTimeFormat(intlLocale, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }), [intlLocale])
  const inputId = useId()
  const resultId = useId()
  const [catalogue, setCatalogue] = useState<CatalogueState>({ status: 'loading' })
  const [retryToken, setRetryToken] = useState(0)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<readonly ProgressiveCatalogFilter[]>([])
  const [sort, setSort] = useState<ProgressiveCatalogSort>('name')
  const [viewMode, setViewMode] = useState<CatalogViewMode>('records')
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE)
  const [queryResult, setQueryResult] = useState<CatalogQueryPayload | null>(null)
  const [queryBusy, setQueryBusy] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' })
  const [offlineOperation, setOfflineOperation] = useState<OfflineOperation>({ status: 'idle' })
  const [hostSkyState, setHostSkyState] = useState<HostSkyState>({ status: 'idle' })
  const queryRequest = useRef<number | null>(null)
  const detailRequest = useRef<number | null>(null)
  const offlineRequest = useRef<number | null>(null)
  const hostSkyRequest = useRef<number | null>(null)
  const deferredQuery = useDeferredValue(query)
  const filterKey = filters.join('|')

  useEffect(() => {
    let active = true
    setCatalogue({ status: 'loading' })
    void requestCatalogClient()
      .then((client) => client.initialize())
      .then(
        ({ manifest, readyMs, prepareMs, loadSource, offline }) => {
          if (active) {
            setCatalogue({ status: 'ready', manifest, readyMs, prepareMs, loadSource, offline })
          }
        },
        () => {
          if (active) setCatalogue({ status: 'error' })
        },
      )
    return () => {
      active = false
    }
  }, [retryToken])

  useEffect(() => {
    if (catalogue.status !== 'ready' || viewMode !== 'records') return
    let active = true
    setQueryBusy(true)
    setQueryError(null)
    void requestCatalogClient().then((client) => {
      if (!active) return
      if (queryRequest.current !== null) client.cancel(queryRequest.current)
      const request = client.query({
        query: deferredQuery,
        filters,
        sort,
        limit: visibleCount,
      })
      queryRequest.current = request.requestId
      void request.promise.then(
        (result) => {
          if (!active) return
          queryRequest.current = null
          setQueryResult(result)
          setQueryBusy(false)
        },
        (error: unknown) => {
          if (!active || (error instanceof DOMException && error.name === 'AbortError')) return
          queryRequest.current = null
          setQueryError('catalog-request-failed')
          setQueryBusy(false)
        },
      )
    })
    return () => {
      active = false
    }
  }, [catalogue.status, deferredQuery, filterKey, filters, sort, viewMode, visibleCount])

  useEffect(
    () => () => {
      void requestCatalogClient().then((client) => {
        if (queryRequest.current !== null) client.cancel(queryRequest.current)
        if (detailRequest.current !== null) client.cancel(detailRequest.current)
        if (offlineRequest.current !== null) client.cancel(offlineRequest.current)
        if (hostSkyRequest.current !== null) client.cancel(hostSkyRequest.current)
      })
    },
    [],
  )

  const resetResultState = useCallback(() => {
    setVisibleCount(RESULTS_PAGE_SIZE)
    setExpandedId(null)
    setDetailState({ status: 'idle' })
    const requestId = detailRequest.current
    if (requestId !== null) {
      detailRequest.current = null
      void requestCatalogClient().then((client) => client.cancel(requestId))
    }
  }, [])

  const updateQuery = useCallback(
    (value: string) => {
      setQuery(value)
      resetResultState()
    },
    [resetResultState],
  )

  const toggleFilter = useCallback(
    (filter: ProgressiveCatalogFilter) => {
      setFilters((current) =>
        current.includes(filter)
          ? current.filter((candidate) => candidate !== filter)
          : [...current, filter],
      )
      resetResultState()
    },
    [resetResultState],
  )

  const changeSort = useCallback(
    (nextSort: ProgressiveCatalogSort) => {
      setSort(nextSort)
      resetResultState()
    },
    [resetResultState],
  )

  const requestDetail = useCallback((summary: ProgressiveExoplanetSummary) => {
      setExpandedId(summary.id)
      setDetailState({ status: 'loading', id: summary.id })
      void requestCatalogClient().then(
        (client) => {
          if (detailRequest.current !== null) client.cancel(detailRequest.current)
          const request = client.detail(summary.id, summary.chunkId)
          detailRequest.current = request.requestId
          void request.promise.then(
            (detail) => {
              if (detailRequest.current !== request.requestId) return
              detailRequest.current = null
              setDetailState({ status: 'ready', id: summary.id, detail })
            },
            (error: unknown) => {
              if (error instanceof DOMException && error.name === 'AbortError') return
              if (detailRequest.current !== request.requestId) return
              detailRequest.current = null
              setDetailState({ status: 'error', id: summary.id })
            },
          )
        },
        () => {
          setDetailState({ status: 'error', id: summary.id })
        },
      )
    }, [])

  const toggleDetail = useCallback(
    (summary: ProgressiveExoplanetSummary) => {
      if (expandedId === summary.id) {
        const requestId = detailRequest.current
        if (requestId !== null) {
          detailRequest.current = null
          void requestCatalogClient().then((client) => client.cancel(requestId))
        }
        setExpandedId(null)
        setDetailState({ status: 'idle' })
        return
      }
      requestDetail(summary)
    },
    [expandedId, requestDetail],
  )

  const updateOfflineStatus = useCallback((offline: CatalogOfflineStatus) => {
    setCatalogue((current) =>
      current.status === 'ready' ? { ...current, offline } : current,
    )
  }, [])

  const showHostSky = useCallback(() => {
    setViewMode('sky')
    resetResultState()
    const activeQuery = queryRequest.current
    if (activeQuery !== null) {
      queryRequest.current = null
      setQueryBusy(false)
      void requestCatalogClient().then((client) => client.cancel(activeQuery))
    }
    void requestSkyAtlasModule().catch(() => undefined)
    if (hostSkyState.status === 'ready' || hostSkyRequest.current !== null) return
    setHostSkyState({ status: 'loading' })
    void requestCatalogClient().then(
      (client) => {
        const request = client.hostSky()
        hostSkyRequest.current = request.requestId
        void request.promise.then(
          (payload) => {
            if (hostSkyRequest.current !== request.requestId) return
            hostSkyRequest.current = null
            updateOfflineStatus(payload.offline)
            setHostSkyState({ status: 'ready', payload })
          },
          (error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') return
            if (hostSkyRequest.current !== request.requestId) return
            hostSkyRequest.current = null
            setHostSkyState({ status: 'error' })
          },
        )
      },
      () => {
        hostSkyRequest.current = null
        setHostSkyState({ status: 'error' })
      },
    )
  }, [hostSkyState.status, resetResultState, updateOfflineStatus])

  const openHostRecords = useCallback(
    (host: string) => {
      setQuery(host)
      setFilters([])
      setSort('name')
      setViewMode('records')
      resetResultState()
      requestAnimationFrame(() => searchInputRef.current?.focus())
    },
    [resetResultState, searchInputRef],
  )

  const installOfflinePack = useCallback(() => {
    const emptyProgress: CatalogOfflineProgressPayload = {
      completedChunks: 0,
      totalChunks: PROGRESSIVE_EXOPLANET_RELEASE.chunkCount,
      storedBytes: 0,
      totalBytes: 0,
    }
    setOfflineOperation({ status: 'installing', progress: emptyProgress })
    void navigator.storage?.persist?.().catch(() => false)
    void requestCatalogClient().then(
      (client) => {
        const request = client.installOfflinePack((progress) => {
          if (offlineRequest.current !== request.requestId) return
          setOfflineOperation({ status: 'installing', progress })
        })
        offlineRequest.current = request.requestId
        void request.promise.then(
          (offline) => {
            if (offlineRequest.current !== request.requestId) return
            offlineRequest.current = null
            updateOfflineStatus(offline)
            setOfflineOperation({ status: 'idle' })
          },
          (error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') return
            if (offlineRequest.current !== request.requestId) return
            offlineRequest.current = null
            setOfflineOperation({ status: 'error' })
          },
        )
      },
      () => {
        setOfflineOperation({ status: 'error' })
      },
    )
  }, [updateOfflineStatus])

  const removeOfflinePack = useCallback(() => {
    setOfflineOperation({ status: 'removing' })
    void requestCatalogClient().then((client) => client.removeOfflinePack()).then(
      (offline) => {
        updateOfflineStatus(offline)
        setOfflineOperation({ status: 'idle' })
      },
      () => {
        setOfflineOperation({ status: 'error' })
      },
    )
  }, [updateOfflineStatus])

  if (catalogue.status === 'loading') {
    return (
      <div className="product-nasa-async-state">
        <p className="product-nasa-async-state__announcement" role="status" aria-live="polite">
          {t('load.announcement')}
        </p>
        <div className="product-nasa-load-state" aria-busy="true">
          <RefreshCcw className="is-spinning" size={20} aria-hidden="true" />
          <strong>{t('load.verifyingIndex')}</strong>
          <p>{t('load.workerIndex')}</p>
        </div>
      </div>
    )
  }

  if (catalogue.status === 'error') {
    return (
      <div className="product-nasa-load-state is-error" role="alert">
        <AlertTriangle size={21} aria-hidden="true" />
        <strong>{t('load.unavailable')}</strong>
        <p>{t('load.fallbackError')}</p>
        <button type="button" onClick={() => setRetryToken((token) => token + 1)}>
          <RefreshCcw size={13} aria-hidden="true" /> {t('load.retry')}
        </button>
      </div>
    )
  }

  const { manifest } = catalogue
  const results = queryResult?.results ?? []
  const totalMatches = queryResult?.totalMatches ?? 0

  return (
    <div className="product-nasa-search">
      <section className="product-catalog-release" aria-label={t('release.region')}>
        <div className="product-catalog-release__status">
          <span><ShieldCheck size={12} aria-hidden="true" /> {t('release.hashesVerified')}</span>
          <span>
            {t('release.timings', {
              prepare: catalogue.prepareMs.toLocaleString(intlLocale, { maximumFractionDigits: 0 }),
              ready: catalogue.readyMs.toLocaleString(intlLocale, { maximumFractionDigits: 0 }),
            })}
          </span>
          <span>{t('release.snapshot', { date: snapshotDate.format(new Date(manifest.retrievedAt)) })}</span>
        </div>
        <strong>{t('release.planets', { count: manifest.recordCount.toLocaleString(intlLocale) })}</strong>
        <p>
          {t('release.inventory', {
            hosts: manifest.hostCount.toLocaleString(intlLocale),
            chunks: manifest.chunks.length.toLocaleString(intlLocale),
            revision: manifest.catalogRevision,
          })}
        </p>
        <div className="product-catalog-release__budget">
          <Boxes size={12} aria-hidden="true" /> {t('release.budget')}
        </div>
      </section>

      <OfflinePackControl
        offline={catalogue.offline}
        loadSource={catalogue.loadSource}
        operation={offlineOperation}
        onInstall={installOfflinePack}
        onRemove={removeOfflinePack}
      />

      <div className="product-catalog-view-switch" role="group" aria-label={t('search.viewGroup')}>
        <button
          type="button"
          aria-pressed={viewMode === 'records'}
          onClick={() => setViewMode('records')}
        >
          <List size={13} aria-hidden="true" /> {t('search.recordsView')}
        </button>
        <button
          type="button"
          aria-pressed={viewMode === 'sky'}
          onClick={showHostSky}
        >
          <MapPinned size={13} aria-hidden="true" /> {t('search.skyView')}
        </button>
      </div>

      <ObservedNavigationStatus state={observedNavigationState} />

      <label htmlFor={inputId}>
        {viewMode === 'sky'
          ? t('search.skyLabel')
          : t('search.recordsLabel')}
      </label>
      <div className="product-search__field">
        <Search size={17} aria-hidden="true" />
        <input
          ref={searchInputRef}
          id={inputId}
          type="search"
          value={query}
          placeholder={viewMode === 'sky'
            ? t('search.skyPlaceholder')
            : t('search.recordsPlaceholder')}
          autoComplete="off"
          spellCheck="false"
          onChange={(event) => updateQuery(event.target.value)}
        />
        {query ? (
          <button type="button" aria-label={t('search.clear')} onClick={() => updateQuery('')}>
            <X size={15} aria-hidden="true" />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>

      {viewMode === 'records' ? (
        <>
      <div className="product-catalog-controls">
        <div className="product-catalog-filters" role="group" aria-label={t('search.filtersGroup')}>
          {CATALOG_FILTERS.map((filter) => {
            const label = t(`filters.${filter === 'earth-size' ? 'earthSize' : filter}`)
            const qualifier = t(`filters.${filter === 'earth-size' ? 'earthSizeQualifier' : `${filter}Qualifier`}`)
            return (
            <button
              key={filter}
              type="button"
              aria-pressed={filters.includes(filter)}
              aria-label={`${label}, ${qualifier}`}
              onClick={() => toggleFilter(filter)}
            >
              {label} <span>{qualifier}</span>
            </button>
            )
          })}
        </div>
        <label className="product-catalog-sort">
          <span>{t('search.sort')}</span>
          <select
            value={sort}
            aria-label={t('search.sortLabel')}
            onChange={(event) => changeSort(event.target.value as ProgressiveCatalogSort)}
          >
            {CATALOG_SORTS.map((option) => (
              <option key={option} value={option}>{t(`sorts.${option}`)}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="product-search__status" role="status" aria-live="polite" aria-atomic="true">
        {queryBusy && !queryResult ? t('search.searching') : null}
        {queryResult ? (
          <>
            {t('search.resultStatus', {
              shown: results.length.toLocaleString(intlLocale),
              total: totalMatches.toLocaleString(intlLocale),
              ms: queryResult.queryMs.toLocaleString(intlLocale, { maximumFractionDigits: 1 }),
            })}
            {queryBusy ? t('search.updating') : ''}
          </>
        ) : null}
      </p>

      {queryError ? (
        <div className="product-nasa-inline-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" /> {t('load.fallbackError')}
        </div>
      ) : null}

      {queryResult && results.length > 0 ? (
        <>
          <ul className="product-nasa-list" aria-label={t('search.resultsLabel')}>
            {results.map((summary) => {
              const expanded = expandedId === summary.id
              const recordId = `${resultId}-${encodeURIComponent(summary.id)}`
              const triggerId = `${recordId}-trigger`
              const detailId = `${recordId}-detail`
              return (
                <li key={summary.id} className={expanded ? 'is-expanded' : undefined}>
                  <article className="product-nasa-record">
                    <button
                      id={triggerId}
                      className="product-nasa-record__toggle"
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={detailId}
                      onClick={() => toggleDetail(summary)}
                    >
                      <span className="product-nasa-record__topline">
                        <span className="product-nasa-badge">{t('search.observed')}</span>
                        <span className="product-nasa-badge is-composite">{t('search.composite')}</span>
                        {summary.discoveryYear ? (
                          <span className="product-nasa-badge is-year">{summary.discoveryYear}</span>
                        ) : null}
                      </span>
                      <span className="product-nasa-record__identity">
                        <span>
                          <strong>{summary.name}</strong>
                          <small>{t('search.hostSystem', { host: summary.host })}</small>
                        </span>
                        <ChevronDown size={16} aria-hidden="true" />
                      </span>
                      <span className="product-nasa-record__summary" aria-hidden="true">
                        <span>{displayNumber(summary.distancePc, ' pc', 1, intlLocale, t('common.notReported'))}</span>
                        <span>{displayNumber(summary.radiusEarth, ' R⊕', 2, intlLocale, t('common.notReported'))}</span>
                        <span>{displayNumber(summary.massEarth, ' M⊕', 2, intlLocale, t('common.notReported'))}</span>
                      </span>
                    </button>
                    {expanded && detailState.status === 'loading' && detailState.id === summary.id ? (
                      <div id={detailId} className="product-nasa-detail-loading" role="status">
                        <RefreshCcw className="is-spinning" size={14} aria-hidden="true" />
                        {t('load.fetchingDetail')}
                      </div>
                    ) : null}
                    {expanded && detailState.status === 'error' && detailState.id === summary.id ? (
                      <div id={detailId} className="product-nasa-detail-loading is-error" role="alert">
                        <AlertTriangle size={14} aria-hidden="true" />
                        <span>{t('load.fallbackError')}</span>
                        <button type="button" onClick={() => requestDetail(summary)}>
                          <RefreshCcw size={12} aria-hidden="true" /> {t('common.retryDetail')}
                        </button>
                      </div>
                    ) : null}
                    {expanded && detailState.status === 'ready' && detailState.id === summary.id ? (
                      <ProgressiveRecordDetail
                        id={detailId}
                        labelledBy={triggerId}
                        detail={detailState.detail}
                        manifest={manifest}
                        onOpenObservedSystem={onOpenObservedSystem}
                        observedNavigationState={observedNavigationState}
                      />
                    ) : null}
                  </article>
                </li>
              )
            })}
          </ul>
          {totalMatches > RESULTS_PAGE_SIZE ? (
            <button
              className="product-nasa-load-more"
              type="button"
              aria-disabled={results.length >= totalMatches || queryBusy}
              onClick={() => {
                if (results.length >= totalMatches || queryBusy) return
                setVisibleCount((count) => count + RESULTS_PAGE_SIZE)
              }}
            >
              {results.length < totalMatches ? (
                <>
                  {t('search.loadMore', {
                    count: Math.min(RESULTS_PAGE_SIZE, totalMatches - results.length).toLocaleString(intlLocale),
                  })}
                  <ChevronRight size={14} aria-hidden="true" />
                </>
              ) : (
                <>{t('search.allShown', { count: totalMatches.toLocaleString(intlLocale) })}</>
              )}
            </button>
          ) : null}
        </>
      ) : null}

      {queryResult && results.length === 0 ? (
        <div className="product-empty-state">
          <CircleHelp size={23} aria-hidden="true" />
          <strong>{t('search.empty')}</strong>
          <p>{t('search.emptyHint')}</p>
        </div>
      ) : null}
        </>
      ) : hostSkyState.status === 'ready' ? (
        <Suspense
          fallback={(
            <div className="product-nasa-load-state" aria-busy="true">
              <RefreshCcw className="is-spinning" size={18} aria-hidden="true" />
              <strong>{t('load.preparingCanvas')}</strong>
            </div>
          )}
        >
          <LazyObservedSkyAtlas
            index={hostSkyState.payload.index}
            filterQuery={deferredQuery}
            loadMs={hostSkyState.payload.loadMs}
            source={hostSkyState.payload.fromMemoryCache
              ? 'memory'
              : hostSkyState.payload.fromPersistentCache
                ? 'offline-storage'
                : 'network'}
            onOpenHost={openHostRecords}
            onExploreObservedUniverse={onExploreObservedUniverse}
            onOpenObservedSystem={onOpenObservedSystem}
            observedNavigationState={observedNavigationState}
          />
        </Suspense>
      ) : hostSkyState.status === 'error' ? (
        <div className="product-nasa-load-state is-error" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <strong>{t('load.skyUnavailable')}</strong>
          <p>{t('load.fallbackError')}</p>
          <button type="button" onClick={showHostSky}>
            <RefreshCcw size={13} aria-hidden="true" /> {t('load.retryAtlas')}
          </button>
        </div>
      ) : (
        <div className="product-nasa-load-state" aria-busy="true">
          <RefreshCcw className="is-spinning" size={20} aria-hidden="true" />
          <strong>{t('load.loadingCoordinates')}</strong>
          <p>{t('load.decodingCoordinates')}</p>
        </div>
      )}
    </div>
  )
})
