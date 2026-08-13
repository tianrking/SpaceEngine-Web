import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import {
  Crosshair,
  Database,
  LocateFixed,
  Orbit,
  Rocket,
  SearchX,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  ProgressiveHostSkyIndex,
  ProgressiveHostSkyTuple,
} from '../data/progressiveExoplanetCatalog'
import { localeOption } from '../i18n'
import type {
  ExploreObservedUniverseHandler,
  ObservedNavigationState,
  OpenObservedSystemHandler,
} from './ProgressiveNasaCatalog'

const HOST = 0
const RA_DEG = 1
const DEC_DEG = 2
const DISTANCE_PC = 3
const GAIA_MAGNITUDE = 4
const SPECTRAL_TYPE = 5
const PLANET_COUNT = 6
const STAR_COUNT = 7
const GAIA_DR3 = 8
const CONFLICT_FIELDS = 9

interface SkyPoint {
  readonly record: ProgressiveHostSkyTuple
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly color: string
  readonly alpha: number
}

export interface ObservedSkyAtlasProps {
  readonly index: ProgressiveHostSkyIndex
  readonly filterQuery: string
  readonly loadMs: number
  readonly source: 'memory' | 'offline-storage' | 'network'
  readonly onOpenHost: (host: string) => void
  readonly onExploreObservedUniverse?: ExploreObservedUniverseHandler
  readonly onOpenObservedSystem?: OpenObservedSystemHandler
  readonly observedNavigationState?: ObservedNavigationState
}

const IDLE_NAVIGATION: ObservedNavigationState = { status: 'idle' }

function invokeNavigation<T extends readonly unknown[]>(
  callback: (...args: T) => void | Promise<void>,
  ...args: T
): void {
  try {
    void Promise.resolve(callback(...args)).catch(() => undefined)
  } catch {
    // The owner reports navigation failures through `observedNavigationState`.
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function spectralColor(spectralType: string | null): string {
  const spectralClass = spectralType?.trim().charAt(0).toUpperCase()
  return {
    O: '#7fa9ff',
    B: '#9dbdff',
    A: '#c9dcff',
    F: '#f4f0dc',
    G: '#ffe2a1',
    K: '#ffae69',
    M: '#ff756f',
  }[spectralClass ?? ''] ?? '#72d8d0'
}

function pointAlpha(distancePc: number | null): number {
  if (distancePc === null) return 0.42
  return clamp(0.94 - Math.log10(distancePc + 1) * 0.18, 0.34, 0.9)
}

function displayDistance(value: number | null, intlLocale: string, notReported: string): string {
  if (value === null) return notReported
  return `${value.toLocaleString(intlLocale, { maximumFractionDigits: 1 })} pc`
}

function displayRightAscension(value: number | null, notReported: string): string {
  if (value === null) return notReported
  const totalHours = value / 15
  const hours = Math.floor(totalHours)
  const minutes = Math.floor((totalHours - hours) * 60)
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
}

function displayDeclination(value: number | null, notReported: string): string {
  if (value === null) return notReported
  const sign = value < 0 ? '−' : '+'
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute)
  const minutes = Math.floor((absolute - degrees) * 60)
  return `${sign}${String(degrees).padStart(2, '0')}° ${String(minutes).padStart(2, '0')}′`
}

function nearestPoint(
  points: readonly SkyPoint[],
  x: number,
  y: number,
  maximumDistance = 16,
): SkyPoint | null {
  let nearest: SkyPoint | null = null
  let nearestSquared = maximumDistance ** 2
  for (const point of points) {
    const distanceSquared = (point.x - x) ** 2 + (point.y - y) ** 2
    if (distanceSquared <= nearestSquared) {
      nearest = point
      nearestSquared = distanceSquared
    }
  }
  return nearest
}

export const ObservedSkyAtlas = memo(function ObservedSkyAtlas({
  index,
  filterQuery,
  loadMs,
  source,
  onOpenHost,
  onExploreObservedUniverse,
  onOpenObservedSystem,
  observedNavigationState = IDLE_NAVIGATION,
}: ObservedSkyAtlasProps) {
  const { t, i18n } = useTranslation('nasa')
  const intlLocale = localeOption(i18n.resolvedLanguage).intlLocale
  const notReported = t('common.notReported')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pointerFrame = useRef<number | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [selectedHost, setSelectedHost] = useState<string | null>(null)
  const [hoveredHost, setHoveredHost] = useState<string | null>(null)
  const normalizedQuery = filterQuery.trim().toLocaleLowerCase('en-US')
  const records = useMemo(
    () => index.records.filter((record) =>
      record[RA_DEG] !== null &&
      record[DEC_DEG] !== null &&
      (!normalizedQuery || record[HOST].toLocaleLowerCase('en-US').includes(normalizedQuery))),
    [index.records, normalizedQuery],
  )
  const nearestRecord = useMemo(
    () => records.reduce<ProgressiveHostSkyTuple | null>((nearest, record) => {
      if (record[DISTANCE_PC] === null) return nearest
      if (nearest === null || nearest[DISTANCE_PC] === null) return record
      return Number(record[DISTANCE_PC]) < Number(nearest[DISTANCE_PC]) ? record : nearest
    }, null) ?? records[0] ?? null,
    [records],
  )
  const selected = records.find((record) => record[HOST] === selectedHost) ?? nearestRecord
  const navigationBusy = observedNavigationState.status === 'loading'
  const exploringUniverse =
    navigationBusy && observedNavigationState.target === 'universe'
  const openingSelectedSystem = Boolean(
    selected &&
    navigationBusy &&
    observedNavigationState.target === 'system' &&
    observedNavigationState.host === selected[HOST],
  )

  const points = useMemo<readonly SkyPoint[]>(() => {
    if (size.width === 0 || size.height === 0) return []
    return records.map((record) => ({
      record,
      x: (1 - Number(record[RA_DEG]) / 360) * size.width,
      y: ((90 - Number(record[DEC_DEG])) / 180) * size.height,
      radius: 1.15 + Math.min(Math.log2(record[PLANET_COUNT] + 1), 3) * 0.36,
      color: spectralColor(record[SPECTRAL_TYPE]),
      alpha: pointAlpha(record[DISTANCE_PC]),
    }))
  }, [records, size.height, size.width])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.round(entry.contentRect.width))
      const height = Math.max(1, Math.round(entry.contentRect.height))
      setSize((current) => current.width === width && current.height === height
        ? current
        : { width, height })
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return
    const context = canvas.getContext('2d')
    if (!context) return
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(size.width * pixelRatio)
    canvas.height = Math.round(size.height * pixelRatio)
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, size.width, size.height)

    const background = context.createRadialGradient(
      size.width * 0.56,
      size.height * 0.45,
      0,
      size.width * 0.5,
      size.height * 0.5,
      size.width * 0.72,
    )
    background.addColorStop(0, '#091820')
    background.addColorStop(0.55, '#050e14')
    background.addColorStop(1, '#020609')
    context.fillStyle = background
    context.fillRect(0, 0, size.width, size.height)

    context.lineWidth = 1
    context.font = '8px ui-monospace, SFMono-Regular, Consolas, monospace'
    context.textBaseline = 'top'
    for (let ra = 0; ra <= 360; ra += 30) {
      const x = (1 - ra / 360) * size.width
      context.strokeStyle = ra % 90 === 0 ? 'rgba(111, 207, 196, .16)' : 'rgba(111, 207, 196, .075)'
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, size.height)
      context.stroke()
      if (ra > 0 && ra < 360 && ra % 60 === 0) {
        context.fillStyle = 'rgba(136, 189, 193, .46)'
        context.fillText(`${Math.round(ra / 15)}h`, x + 4, 6)
      }
    }
    for (let dec = -60; dec <= 60; dec += 30) {
      const y = ((90 - dec) / 180) * size.height
      context.strokeStyle = dec === 0 ? 'rgba(255, 190, 122, .24)' : 'rgba(111, 207, 196, .08)'
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(size.width, y)
      context.stroke()
      context.fillStyle = 'rgba(136, 189, 193, .42)'
      context.fillText(`${dec > 0 ? '+' : ''}${dec}°`, 5, y + 4)
    }

    for (const point of points) {
      context.globalAlpha = point.alpha
      context.fillStyle = point.color
      context.beginPath()
      context.arc(point.x, point.y, point.radius, 0, Math.PI * 2)
      context.fill()
    }
    context.globalAlpha = 1

    for (const [host, ringColor, ringRadius] of [
      [selected?.[HOST] ?? null, '#ffbe79', 6],
      [hoveredHost, '#8ff3e5', 4.5],
    ] as const) {
      if (!host) continue
      const point = points.find((candidate) => candidate.record[HOST] === host)
      if (!point) continue
      context.strokeStyle = ringColor
      context.lineWidth = 1
      context.beginPath()
      context.arc(point.x, point.y, ringRadius, 0, Math.PI * 2)
      context.stroke()
    }

    context.fillStyle = 'rgba(173, 221, 220, .58)'
    context.fillText(t('atlas.axisHint'), 8, size.height - 17)
  }, [hoveredHost, points, selected, size.height, size.width, t])

  useEffect(
    () => () => {
      if (pointerFrame.current !== null) cancelAnimationFrame(pointerFrame.current)
    },
    [],
  )

  const pointFromPointer = (event: MouseEvent<HTMLCanvasElement>): SkyPoint | null => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return nearestPoint(
      points,
      (event.clientX - bounds.left) * (size.width / bounds.width),
      (event.clientY - bounds.top) * (size.height / bounds.height),
    )
  }

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const clientX = event.clientX
    const clientY = event.clientY
    const canvas = event.currentTarget
    if (pointerFrame.current !== null) cancelAnimationFrame(pointerFrame.current)
    pointerFrame.current = requestAnimationFrame(() => {
      pointerFrame.current = null
      const bounds = canvas.getBoundingClientRect()
      const point = nearestPoint(
        points,
        (clientX - bounds.left) * (size.width / bounds.width),
        (clientY - bounds.top) * (size.height / bounds.height),
      )
      setHoveredHost((current) => current === point?.record[HOST]
        ? current
        : point?.record[HOST] ?? null)
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (records.length === 0) return
    const currentIndex = Math.max(0, records.findIndex((record) => record[HOST] === selected?.[HOST]))
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % records.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + records.length) % records.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = records.length - 1
    else if (event.key === 'Enter' && selected) {
      event.preventDefault()
      onOpenHost(selected[HOST])
      return
    } else return
    event.preventDefault()
    setSelectedHost(records[nextIndex][HOST])
  }

  return (
    <section className="observed-sky-atlas" aria-labelledby="observed-sky-title">
      <header>
        <div>
          <span><Sparkles size={12} aria-hidden="true" /> {t('atlas.eyebrow')}</span>
          <h3 id="observed-sky-title">{t('atlas.title')}</h3>
        </div>
        <div className="observed-sky-atlas__runtime">
          <span>{t('atlas.hosts', {
            visible: records.length.toLocaleString(intlLocale),
            total: index.records.length.toLocaleString(intlLocale),
          })}</span>
          <span>{t('atlas.runtime', {
            ms: loadMs.toLocaleString(intlLocale, { maximumFractionDigits: 1 }),
            source: t(source === 'memory'
              ? 'atlas.sourceMemory'
              : source === 'offline-storage'
                ? 'atlas.sourceOffline'
                : 'atlas.sourceNetwork'),
          })}</span>
        </div>
      </header>

      {onExploreObservedUniverse ? (
        <button
          className="observed-sky-atlas__explore"
          type="button"
          aria-disabled={navigationBusy || undefined}
          aria-busy={exploringUniverse || undefined}
          onClick={() => {
            if (!navigationBusy) invokeNavigation(onExploreObservedUniverse, index)
          }}
        >
          {exploringUniverse ? (
            <Rocket className="is-spinning" size={14} aria-hidden="true" />
          ) : (
            <Sparkles size={14} aria-hidden="true" />
          )}
          <span>
            <strong>{t(exploringUniverse ? 'navigation.openingUniverse' : 'navigation.explore3d')}</strong>
            <small>{t('navigation.explore3dDetail', { count: index.records.length.toLocaleString(intlLocale) })}</small>
          </span>
        </button>
      ) : null}

      {records.length > 0 ? (
        <>
          <div className="observed-sky-atlas__canvas-wrap">
            <canvas
              ref={canvasRef}
              tabIndex={0}
              role="img"
              aria-describedby="observed-sky-instructions"
              aria-label={t('atlas.canvasLabel', {
                count: records.length.toLocaleString(intlLocale),
              })}
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHoveredHost(null)}
              onClick={(event) => {
                const point = pointFromPointer(event)
                if (point) setSelectedHost(point.record[HOST])
              }}
              onKeyDown={handleKeyDown}
            />
            {hoveredHost ? <span className="observed-sky-atlas__hover">{hoveredHost}</span> : null}
          </div>
          <p id="observed-sky-instructions" className="observed-sky-atlas__instructions">
            {t('atlas.instructions')}
          </p>

          {selected ? (
            <article className="observed-sky-selection" aria-live="polite">
              <div className="observed-sky-selection__heading">
                <span><Crosshair size={12} aria-hidden="true" /> {t('atlas.observedHost')}</span>
                <strong>{selected[HOST]}</strong>
                <small>
                  {selected[SPECTRAL_TYPE] ?? t('atlas.spectralMissing')}
                  {' · '}{t(
                    selected[PLANET_COUNT] === 1
                      ? 'atlas.planetCount_one'
                      : 'atlas.planetCount_other',
                    { count: selected[PLANET_COUNT] },
                  )}
                </small>
              </div>
              <dl>
                <div><dt>{t('atlas.rightAscension')}</dt><dd>{displayRightAscension(selected[RA_DEG], notReported)}</dd></div>
                <div><dt>{t('atlas.declination')}</dt><dd>{displayDeclination(selected[DEC_DEG], notReported)}</dd></div>
                <div><dt>{t('atlas.distance')}</dt><dd>{displayDistance(selected[DISTANCE_PC], intlLocale, notReported)}</dd></div>
                <div>
                  <dt>Gaia G</dt>
                  <dd>{selected[GAIA_MAGNITUDE]?.toLocaleString(intlLocale, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }) ?? notReported}</dd>
                </div>
                <div><dt>{t('atlas.systemStars')}</dt><dd>{selected[STAR_COUNT]?.toLocaleString(intlLocale) ?? notReported}</dd></div>
                <div><dt>{t('atlas.coordinateFrame')}</dt><dd>ICRS</dd></div>
              </dl>
              {selected[GAIA_DR3] ? (
                <p className="observed-sky-selection__identity">
                  <Database size={11} aria-hidden="true" /> <code>{selected[GAIA_DR3]}</code>
                </p>
              ) : null}
              {selected[CONFLICT_FIELDS] ? (
                <p className="observed-sky-selection__quality">
                  {t('atlas.conflict', { fields: selected[CONFLICT_FIELDS] })}
                </p>
              ) : null}
              <div className="observed-sky-selection__actions">
                {onExploreObservedUniverse ? (
                  <button
                    type="button"
                    aria-disabled={navigationBusy || undefined}
                    aria-busy={
                      exploringUniverse && observedNavigationState.host === selected[HOST]
                        ? true
                        : undefined
                    }
                    onClick={() => {
                      if (!navigationBusy) {
                        invokeNavigation(onExploreObservedUniverse, index, selected[HOST])
                      }
                    }}
                  >
                    <LocateFixed size={13} aria-hidden="true" />
                    {t('navigation.locateSky3d')}
                  </button>
                ) : null}
                {onOpenObservedSystem ? (
                  <button
                    className="is-primary"
                    type="button"
                    disabled={selected[DISTANCE_PC] === null}
                    aria-disabled={navigationBusy || undefined}
                    aria-busy={openingSelectedSystem || undefined}
                    title={selected[DISTANCE_PC] === null
                      ? t('navigation.skyOnlyTitle')
                      : undefined}
                    onClick={() => {
                      if (!navigationBusy) {
                        invokeNavigation(onOpenObservedSystem, selected[HOST])
                      }
                    }}
                  >
                    <Rocket size={13} aria-hidden="true" />
                    {t(selected[DISTANCE_PC] === null
                      ? 'navigation.skyOnly'
                      : openingSelectedSystem
                        ? 'navigation.openingSystem'
                        : 'navigation.flySystem', { host: selected[HOST] })}
                  </button>
                ) : null}
                <button type="button" onClick={() => onOpenHost(selected[HOST])}>
                  <Orbit size={13} aria-hidden="true" /> {t('atlas.open')}
                </button>
              </div>
              {selected[DISTANCE_PC] === null && onOpenObservedSystem ? (
                <small className="observed-sky-selection__sky-only">
                  {t('navigation.distanceRequired')}
                </small>
              ) : null}
            </article>
          ) : null}
        </>
      ) : (
        <div className="observed-sky-atlas__empty" role="status">
          <SearchX size={18} aria-hidden="true" />
          <strong>{t('atlas.empty')}</strong>
          <p>{t('atlas.emptyHint')}</p>
        </div>
      )}
    </section>
  )
})

export default ObservedSkyAtlas
