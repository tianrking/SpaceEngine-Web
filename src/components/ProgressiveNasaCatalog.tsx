import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
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
  ExternalLink,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react'
import { PROGRESSIVE_EXOPLANET_RELEASE } from '../data/generated/progressiveExoplanetRelease'
import type { ProgressiveCatalogClient } from '../data/progressiveCatalogClient'
import type {
  CatalogMeasurement,
  ProgressiveExoplanetManifest,
  ProgressiveExoplanetSummary,
} from '../data/progressiveExoplanetCatalog'
import type {
  ProgressiveCatalogFilter,
  ProgressiveCatalogSort,
} from '../data/progressiveCatalogSearch'
import type {
  CatalogDetailPayload,
  CatalogLoadSource,
  CatalogOfflineProgressPayload,
  CatalogQueryPayload,
} from '../data/progressiveCatalogProtocol'
import type { CatalogOfflineStatus } from '../data/catalogOfflineStore'

export const NASA_ARCHIVE_RECORD_COUNT = PROGRESSIVE_EXOPLANET_RELEASE.recordCount

const RESULTS_PAGE_SIZE = 20
const NOT_REPORTED = 'Not reported'

const CATALOG_FILTERS: ReadonlyArray<{
  readonly id: ProgressiveCatalogFilter
  readonly label: string
  readonly qualifier: string
}> = [
  { id: 'nearby', label: 'Nearby', qualifier: '< 25 pc' },
  { id: 'earth-size', label: 'Earth-size', qualifier: '≤ 1.8 R⊕' },
  { id: 'temperate', label: 'Temperate', qualifier: '180–320 K' },
  { id: 'recent', label: 'Recent', qualifier: '≥ 2020' },
]

const CATALOG_SORTS: ReadonlyArray<{
  readonly id: ProgressiveCatalogSort
  readonly label: string
}> = [
  { id: 'name', label: 'Name' },
  { id: 'distance', label: 'Nearest' },
  { id: 'discovery', label: 'Newest' },
]

const snapshotDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

let clientModulePromise: Promise<typeof import('../data/progressiveCatalogClient')> | null = null

function requestCatalogClient(): Promise<ProgressiveCatalogClient> {
  clientModulePromise ??= import('../data/progressiveCatalogClient').catch((error: unknown) => {
      clientModulePromise = null
      throw error
    })
  return clientModulePromise.then(({ getProgressiveCatalogClient }) =>
    getProgressiveCatalogClient(),
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'The progressive catalogue could not complete the request.'
}

function displayNumber(
  value: number | null,
  unit = '',
  maximumFractionDigits = 2,
): string {
  if (value === null || !Number.isFinite(value)) return NOT_REPORTED
  return `${value.toLocaleString('en-US', { maximumFractionDigits })}${unit}`
}

function displayBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB'] as const
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** exponent).toLocaleString('en-US', {
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
): { value: string; uncertainty: string | null; missing: boolean } {
  if (!measurement || measurement.value === null) {
    return { value: NOT_REPORTED, uncertainty: null, missing: true }
  }
  const prefix = measurement.limit === 1 ? '≤ ' : measurement.limit === -1 ? '≥ ' : ''
  const unit = displayUnitLabel(measurement.unit)
  const suffix = unit ? ` ${unit}` : ''
  const uncertainty =
    measurement.errorPlus === null && measurement.errorMinus === null
      ? null
      : `+${displayNumber(measurement.errorPlus, '', maximumFractionDigits)} / −${displayNumber(
          measurement.errorMinus === null ? null : Math.abs(measurement.errorMinus),
          '',
          maximumFractionDigits,
        )}${suffix}`
  return {
    value: `${prefix}${displayNumber(measurement.value, '', maximumFractionDigits)}${suffix}`,
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
  const formatted = formatMeasurement(measurement, maximumFractionDigits)
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
            aria-label={`Open source reference for ${label}`}
          >
            Source · {referenceLabel} <ExternalLink size={10} aria-hidden="true" />
          </a>
        ) : referenceLabel ? (
          <small className="product-nasa-measurement-source" title={referenceLabel}>
            Source · {referenceLabel}
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
  const missing = value === null || value === ''
  return (
    <div>
      <dt>{label}</dt>
      <dd className={missing ? 'is-missing' : undefined}>
        <span>{missing ? NOT_REPORTED : `${value}${unit}`}</span>
        {referenceUrl ? (
          <a
            href={referenceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open source reference for ${label}`}
          >
            Source <ExternalLink size={10} aria-hidden="true" />
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
}

const ProgressiveRecordDetail = memo(function ProgressiveRecordDetail({
  id,
  labelledBy,
  detail,
  manifest,
}: ProgressiveRecordDetailProps) {
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

  return (
    <div id={id} className="product-nasa-detail" role="region" aria-labelledby={labelledBy}>
      <div className="product-nasa-detail__runtime" role="status">
        <ShieldCheck size={12} aria-hidden="true" /> Verified content hash
        <span>·</span>
        {detail.fromMemoryCache
          ? 'Memory cache'
          : detail.fromPersistentCache
            ? 'Offline storage'
            : 'Network'}
        <span>·</span>
        {detail.loadMs.toFixed(1)} ms
      </div>

      <DetailSection title="Position & identity">
        <TextRow label="Distance" value={displayNumber(m.distancePc?.value ?? null, ' pc', 3)} />
        <TextRow label="Right ascension" value={displayNumber(record.coordinates.raDeg, '°', 5)} />
        <TextRow label="Declination" value={displayNumber(record.coordinates.decDeg, '°', 5)} />
        <TextRow label="Reference frame" value={record.coordinates.frame} />
        <TextRow label="Gaia DR3" value={record.externalIds.gaiaDr3} />
        <TextRow label="TIC" value={record.externalIds.tic} />
      </DetailSection>

      <DetailSection title="Planet">
        <MeasurementRow label="Radius" measurement={m.radiusEarth} />
        <MeasurementRow label="Mass" measurement={m.massEarth} />
        <MeasurementRow label="Density" measurement={m.densityGcm3} />
        <TextRow label="Mass basis" value={record.flags.massProvenance} />
        <TextRow label="Controversial flag" value={record.flags.controversial ? 'Flagged' : 'No'} />
      </DetailSection>

      <DetailSection title="Orbit & transit">
        <MeasurementRow label="Period" measurement={m.orbitalPeriodDays} />
        <MeasurementRow label="Semi-major axis" measurement={m.semiMajorAxisAu} maximumFractionDigits={4} />
        <MeasurementRow label="Eccentricity" measurement={m.eccentricity} maximumFractionDigits={4} />
        <MeasurementRow label="Inclination" measurement={m.inclinationDeg} />
        <MeasurementRow label="Transit duration" measurement={m.transitDurationHours} />
        <MeasurementRow label="Transit depth" measurement={m.transitDepthPercent} />
        <MeasurementRow label="RV amplitude" measurement={m.radialVelocityAmplitudeMs} />
      </DetailSection>

      <DetailSection title="Climate & observing value">
        <MeasurementRow label="Equilibrium temp." measurement={m.equilibriumTempK} maximumFractionDigits={0} />
        <MeasurementRow label="Insolation" measurement={m.insolationEarth} />
        <MeasurementRow label="Transmission metric" measurement={m.transmissionMetric} />
        <MeasurementRow label="Emission metric" measurement={m.emissionMetric} />
        <TextRow label="Transmission spectra" value={observedCount(record.observationCounts.transmissionSpectra)} />
        <TextRow label="Emission spectra" value={observedCount(record.observationCounts.emissionSpectra)} />
        <TextRow label="JWST observations" value={observedCount(jwstObservations)} />
      </DetailSection>

      <DetailSection title="Host star">
        <TextRow label="Spectral type" value={record.hostStar.spectralType} />
        <MeasurementRow label="Effective temp." measurement={m.stellarTeffK} maximumFractionDigits={0} />
        <MeasurementRow label="Radius" measurement={m.stellarRadiusSolar} />
        <MeasurementRow label="Mass" measurement={m.stellarMassSolar} />
        <MeasurementRow label="Age" measurement={m.stellarAgeGyr} />
        <MeasurementRow label="Metallicity" measurement={m.stellarMetallicityDex} />
        <MeasurementRow label="Luminosity" measurement={m.stellarLuminosityLogSolar} />
        <MeasurementRow label="Gaia magnitude" measurement={m.gaiaMagnitude} />
      </DetailSection>

      <DetailSection title="Discovery & system">
        <TextRow label="Year" value={record.discovery.year} />
        <TextRow label="Method" value={record.discovery.method} />
        <TextRow label="Facility" value={record.discovery.facility} />
        <TextRow label="Instrument" value={record.discovery.instrument} />
        <TextRow label="Telescope" value={record.discovery.telescope} />
        <TextRow label="Known planets" value={record.system.planetCount} />
        <TextRow label="System stars" value={record.system.starCount} />
        <TextRow
          label="Discovery paper"
          value={
            record.discovery.reference
              ? decodeReferenceText(record.discovery.reference.label)
              : null
          }
          referenceUrl={record.discovery.reference?.url}
        />
      </DetailSection>

      <section className="product-nasa-provenance" aria-labelledby={`${id}-provenance`}>
        <h3 id={`${id}-provenance`}>Data integrity & provenance</h3>
        <p>
          <strong>{manifest.source.provider}</strong>
          {' · '}
          {manifest.source.product}
          {' · '}
          release {manifest.catalogRevision}
        </p>
        <p>{manifest.provenance.compositePolicy}</p>
        <p>{manifest.provenance.nullPolicy}</p>
        <p>
          Retrieved{' '}
          <time dateTime={manifest.retrievedAt}>
            {snapshotDate.format(new Date(manifest.retrievedAt))}
          </time>
          . This observed archive record is inspectable but is not yet a flyable rendered
          system.
        </p>
        <div className="product-nasa-provenance__links">
          <a href={manifest.source.requestUrl} target="_blank" rel="noreferrer">
            Reproducible source query <ExternalLink size={12} aria-hidden="true" />
          </a>
          <a href={manifest.source.documentationUrl} target="_blank" rel="noreferrer">
            Column definitions <ExternalLink size={12} aria-hidden="true" />
          </a>
          <a href={manifest.source.acknowledgementUrl} target="_blank" rel="noreferrer">
            Data credits <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  )
})

interface ProgressiveNasaCatalogProps {
  searchInputRef: RefObject<HTMLInputElement | null>
}

type OfflineOperation =
  | { readonly status: 'idle' }
  | { readonly status: 'installing'; readonly progress: CatalogOfflineProgressPayload }
  | { readonly status: 'removing' }
  | { readonly status: 'error'; readonly message: string }

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
  const totalPackBytes = offline.storedBytes > 0 && offline.packInstalled
    ? offline.storedBytes
    : null
  return (
    <section className="product-offline-pack" aria-label="Offline catalogue pack">
      <div className="product-offline-pack__summary">
        <span className={offline.packInstalled ? 'is-ready' : undefined}>
          {loadSource === 'offline-cache' ? (
            <WifiOff size={12} aria-hidden="true" />
          ) : offline.packInstalled ? (
            <DatabaseZap size={12} aria-hidden="true" />
          ) : (
            <HardDriveDownload size={12} aria-hidden="true" />
          )}
          {loadSource === 'offline-cache'
            ? 'Running from verified offline core'
            : offline.packInstalled
              ? 'Full research pack ready'
              : offline.coreCached
                ? 'Search core cached'
                : 'Browser storage optional'}
        </span>
        <small>
          {offline.packInstalled
            ? `${offline.detailChunksCached}/${offline.detailChunksTotal} chunks · ${displayBytes(totalPackBytes ?? offline.storedBytes)}`
            : offline.supported
              ? `${offline.detailChunksCached}/${offline.detailChunksTotal} detail chunks cached`
              : 'IndexedDB unavailable'}
        </small>
      </div>

      {operation.status === 'installing' ? (
        <div className="product-offline-pack__progress" role="status" aria-live="polite">
          <progress
            max={operation.progress.totalChunks}
            value={operation.progress.completedChunks}
            aria-label="Offline pack installation progress"
          />
          <span>
            Verifying chunk {operation.progress.completedChunks}/{operation.progress.totalChunks}
            {' · '}{displayBytes(operation.progress.storedBytes)} / {displayBytes(operation.progress.totalBytes)}
          </span>
        </div>
      ) : null}

      {operation.status === 'error' ? (
        <p className="product-offline-pack__error" role="alert">
          <AlertTriangle size={12} aria-hidden="true" /> {operation.message}
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
            {operation.status === 'removing' ? 'Removing pack…' : 'Remove offline detail pack'}
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
            {operation.status === 'installing' ? 'Installing verified pack…' : 'Install full offline pack'}
          </button>
        )
      ) : null}
      <p>
        The app shell and search core are cached after first use. The optional pack keeps all
        scientific details in this browser; interrupted installs never replace the last complete
        release.
      </p>
    </section>
  )
})

type CatalogueState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | {
      readonly status: 'ready'
      readonly manifest: ProgressiveExoplanetManifest
      readonly decodeMs: number
      readonly loadSource: CatalogLoadSource
      readonly offline: CatalogOfflineStatus
    }

type DetailState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly id: string }
  | { readonly status: 'error'; readonly id: string; readonly message: string }
  | { readonly status: 'ready'; readonly id: string; readonly detail: CatalogDetailPayload }

export const ProgressiveNasaCatalog = memo(function ProgressiveNasaCatalog({
  searchInputRef,
}: ProgressiveNasaCatalogProps) {
  const inputId = useId()
  const resultId = useId()
  const [catalogue, setCatalogue] = useState<CatalogueState>({ status: 'loading' })
  const [retryToken, setRetryToken] = useState(0)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<readonly ProgressiveCatalogFilter[]>([])
  const [sort, setSort] = useState<ProgressiveCatalogSort>('name')
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE)
  const [queryResult, setQueryResult] = useState<CatalogQueryPayload | null>(null)
  const [queryBusy, setQueryBusy] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' })
  const [offlineOperation, setOfflineOperation] = useState<OfflineOperation>({ status: 'idle' })
  const queryRequest = useRef<number | null>(null)
  const detailRequest = useRef<number | null>(null)
  const offlineRequest = useRef<number | null>(null)
  const deferredQuery = useDeferredValue(query)
  const filterKey = filters.join('|')

  useEffect(() => {
    let active = true
    setCatalogue({ status: 'loading' })
    void requestCatalogClient()
      .then((client) => client.initialize())
      .then(
        ({ manifest, decodeMs, loadSource, offline }) => {
          if (active) setCatalogue({ status: 'ready', manifest, decodeMs, loadSource, offline })
        },
        (error: unknown) => {
          if (active) setCatalogue({ status: 'error', message: errorMessage(error) })
        },
      )
    return () => {
      active = false
    }
  }, [retryToken])

  useEffect(() => {
    if (catalogue.status !== 'ready') return
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
          setQueryError(errorMessage(error))
          setQueryBusy(false)
        },
      )
    })
    return () => {
      active = false
    }
  }, [catalogue.status, deferredQuery, filterKey, filters, sort, visibleCount])

  useEffect(
    () => () => {
      void requestCatalogClient().then((client) => {
        if (queryRequest.current !== null) client.cancel(queryRequest.current)
        if (detailRequest.current !== null) client.cancel(detailRequest.current)
        if (offlineRequest.current !== null) client.cancel(offlineRequest.current)
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
              setDetailState({ status: 'error', id: summary.id, message: errorMessage(error) })
            },
          )
        },
        (error: unknown) => {
          setDetailState({ status: 'error', id: summary.id, message: errorMessage(error) })
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
            setOfflineOperation({ status: 'error', message: errorMessage(error) })
          },
        )
      },
      (error: unknown) => {
        setOfflineOperation({ status: 'error', message: errorMessage(error) })
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
      (error: unknown) => {
        setOfflineOperation({ status: 'error', message: errorMessage(error) })
      },
    )
  }, [updateOfflineStatus])

  if (catalogue.status === 'loading') {
    return (
      <div className="product-nasa-async-state">
        <p className="product-nasa-async-state__announcement" role="status" aria-live="polite">
          Loading the progressive NASA catalogue
        </p>
        <div className="product-nasa-load-state" aria-busy="true">
          <RefreshCcw className="is-spinning" size={20} aria-hidden="true" />
          <strong>Verifying the full archive index</strong>
          <p>Loading a content-addressed search index in a dedicated Worker.</p>
        </div>
      </div>
    )
  }

  if (catalogue.status === 'error') {
    return (
      <div className="product-nasa-load-state is-error" role="alert">
        <AlertTriangle size={21} aria-hidden="true" />
        <strong>Archive unavailable</strong>
        <p>{catalogue.message}</p>
        <button type="button" onClick={() => setRetryToken((token) => token + 1)}>
          <RefreshCcw size={13} aria-hidden="true" /> Retry verified load
        </button>
      </div>
    )
  }

  const { manifest } = catalogue
  const results = queryResult?.results ?? []
  const totalMatches = queryResult?.totalMatches ?? 0

  return (
    <div className="product-nasa-search">
      <section className="product-catalog-release" aria-label="Catalogue release status">
        <div className="product-catalog-release__status">
          <span><ShieldCheck size={12} aria-hidden="true" /> Asset hashes verified</span>
          <span>{catalogue.decodeMs.toFixed(0)} ms worker decode</span>
          <span>Snapshot {snapshotDate.format(new Date(manifest.retrievedAt))}</span>
        </div>
        <strong>{manifest.recordCount.toLocaleString()} confirmed planets</strong>
        <p>
          {manifest.hostCount.toLocaleString()} host systems · {manifest.chunks.length} immutable
          detail chunks · release {manifest.catalogRevision}
        </p>
        <div className="product-catalog-release__budget">
          <Boxes size={12} aria-hidden="true" /> Search stays in the Worker; scientific detail
          loads only when a record is expanded.
        </div>
      </section>

      <OfflinePackControl
        offline={catalogue.offline}
        loadSource={catalogue.loadSource}
        operation={offlineOperation}
        onInstall={installOfflinePack}
        onRemove={removeOfflinePack}
      />

      <label htmlFor={inputId}>Search the complete NASA Exoplanet Archive</label>
      <div className="product-search__field">
        <Search size={17} aria-hidden="true" />
        <input
          ref={searchInputRef}
          id={inputId}
          type="search"
          value={query}
          placeholder="Planet, host, spectral type, method…"
          autoComplete="off"
          spellCheck="false"
          onChange={(event) => updateQuery(event.target.value)}
        />
        {query ? (
          <button type="button" aria-label="Clear NASA archive search" onClick={() => updateQuery('')}>
            <X size={15} aria-hidden="true" />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>

      <div className="product-catalog-controls">
        <div className="product-catalog-filters" role="group" aria-label="NASA archive filters">
          {CATALOG_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={filters.includes(filter.id)}
              aria-label={`${filter.label}, ${filter.qualifier}`}
              onClick={() => toggleFilter(filter.id)}
            >
              {filter.label} <span>{filter.qualifier}</span>
            </button>
          ))}
        </div>
        <label className="product-catalog-sort">
          <span>Sort</span>
          <select
            value={sort}
            aria-label="Sort NASA archive results"
            onChange={(event) => changeSort(event.target.value as ProgressiveCatalogSort)}
          >
            {CATALOG_SORTS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="product-search__status" role="status" aria-live="polite" aria-atomic="true">
        {queryBusy && !queryResult ? 'Searching verified index…' : null}
        {queryResult ? (
          <>
            NASA full archive · Showing {results.length.toLocaleString()} of{' '}
            {totalMatches.toLocaleString()} matches · {queryResult.queryMs.toFixed(1)} ms
            {queryBusy ? ' · Updating…' : ''}
          </>
        ) : null}
      </p>

      {queryError ? (
        <div className="product-nasa-inline-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" /> {queryError}
        </div>
      ) : null}

      {queryResult && results.length > 0 ? (
        <>
          <ul className="product-nasa-list" aria-label="NASA archive results">
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
                        <span className="product-nasa-badge">Observed</span>
                        <span className="product-nasa-badge is-composite">Archive composite</span>
                        {summary.discoveryYear ? (
                          <span className="product-nasa-badge is-year">{summary.discoveryYear}</span>
                        ) : null}
                      </span>
                      <span className="product-nasa-record__identity">
                        <span>
                          <strong>{summary.name}</strong>
                          <small>{summary.host} host system</small>
                        </span>
                        <ChevronDown size={16} aria-hidden="true" />
                      </span>
                      <span className="product-nasa-record__summary" aria-hidden="true">
                        <span>{displayNumber(summary.distancePc, ' pc', 1)}</span>
                        <span>{displayNumber(summary.radiusEarth, ' R⊕', 2)}</span>
                        <span>{displayNumber(summary.massEarth, ' M⊕', 2)}</span>
                      </span>
                    </button>
                    {expanded && detailState.status === 'loading' && detailState.id === summary.id ? (
                      <div id={detailId} className="product-nasa-detail-loading" role="status">
                        <RefreshCcw className="is-spinning" size={14} aria-hidden="true" />
                        Fetching and verifying one scientific detail chunk…
                      </div>
                    ) : null}
                    {expanded && detailState.status === 'error' && detailState.id === summary.id ? (
                      <div id={detailId} className="product-nasa-detail-loading is-error" role="alert">
                        <AlertTriangle size={14} aria-hidden="true" />
                        <span>{detailState.message}</span>
                        <button type="button" onClick={() => requestDetail(summary)}>
                          <RefreshCcw size={12} aria-hidden="true" /> Retry detail
                        </button>
                      </div>
                    ) : null}
                    {expanded && detailState.status === 'ready' && detailState.id === summary.id ? (
                      <ProgressiveRecordDetail
                        id={detailId}
                        labelledBy={triggerId}
                        detail={detailState.detail}
                        manifest={manifest}
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
                  Load {Math.min(RESULTS_PAGE_SIZE, totalMatches - results.length)} more
                  <ChevronRight size={14} aria-hidden="true" />
                </>
              ) : (
                <>All {totalMatches.toLocaleString()} matching records shown</>
              )}
            </button>
          ) : null}
        </>
      ) : null}

      {queryResult && results.length === 0 ? (
        <div className="product-empty-state">
          <CircleHelp size={23} aria-hidden="true" />
          <strong>No matching archive records</strong>
          <p>Remove a filter or search by planet, host, method, or facility.</p>
        </div>
      ) : null}
    </div>
  )
})
