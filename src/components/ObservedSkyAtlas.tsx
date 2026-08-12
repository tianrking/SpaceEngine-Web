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
import { Crosshair, Database, Orbit, SearchX, Sparkles } from 'lucide-react'
import type {
  ProgressiveHostSkyIndex,
  ProgressiveHostSkyTuple,
} from '../data/progressiveExoplanetCatalog'

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

interface ObservedSkyAtlasProps {
  readonly index: ProgressiveHostSkyIndex
  readonly filterQuery: string
  readonly loadMs: number
  readonly source: 'memory' | 'offline-storage' | 'network'
  readonly onOpenHost: (host: string) => void
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

function displayDistance(value: number | null): string {
  if (value === null) return 'Not reported'
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} pc`
}

function displayRightAscension(value: number | null): string {
  if (value === null) return 'Not reported'
  const totalHours = value / 15
  const hours = Math.floor(totalHours)
  const minutes = Math.floor((totalHours - hours) * 60)
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
}

function displayDeclination(value: number | null): string {
  if (value === null) return 'Not reported'
  const sign = value < 0 ? '−' : '+'
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute)
  const minutes = Math.floor((absolute - degrees) * 60)
  return `${sign}${String(degrees).padStart(2, '0')}° ${String(minutes).padStart(2, '0')}′`
}

function sourceLabel(source: ObservedSkyAtlasProps['source']): string {
  if (source === 'memory') return 'Worker memory'
  if (source === 'offline-storage') return 'Offline storage'
  return 'Verified network asset'
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
}: ObservedSkyAtlasProps) {
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
    context.fillText('ICRS · RA increases ←', 8, size.height - 17)
  }, [hoveredHost, points, selected, size.height, size.width])

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
          <span><Sparkles size={12} aria-hidden="true" /> Observed host sky</span>
          <h3 id="observed-sky-title">ICRS discovery atlas</h3>
        </div>
        <div className="observed-sky-atlas__runtime">
          <span>{records.length.toLocaleString()} / {index.records.length.toLocaleString()} hosts</span>
          <span>{loadMs.toFixed(1)} ms · {sourceLabel(source)}</span>
        </div>
      </header>

      {records.length > 0 ? (
        <>
          <div className="observed-sky-atlas__canvas-wrap">
            <canvas
              ref={canvasRef}
              tabIndex={0}
              role="img"
              aria-describedby="observed-sky-instructions"
              aria-label={`Interactive ICRS map of ${records.length.toLocaleString()} NASA exoplanet host systems`}
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
            Select a point, or focus the map and use arrow keys. Press Enter to open the host’s
            verified planet records. Point size encodes known planets; colour follows reported
            spectral class when available. This is a discovery map of confirmed planet hosts,
            not a statistically complete census of nearby stars.
          </p>

          {selected ? (
            <article className="observed-sky-selection" aria-live="polite">
              <div className="observed-sky-selection__heading">
                <span><Crosshair size={12} aria-hidden="true" /> Observed host</span>
                <strong>{selected[HOST]}</strong>
                <small>
                  {selected[SPECTRAL_TYPE] ?? 'Spectral type not consistently reported'}
                  {' · '}{selected[PLANET_COUNT]} confirmed planet{selected[PLANET_COUNT] === 1 ? '' : 's'}
                </small>
              </div>
              <dl>
                <div><dt>Right ascension</dt><dd>{displayRightAscension(selected[RA_DEG])}</dd></div>
                <div><dt>Declination</dt><dd>{displayDeclination(selected[DEC_DEG])}</dd></div>
                <div><dt>Distance</dt><dd>{displayDistance(selected[DISTANCE_PC])}</dd></div>
                <div>
                  <dt>Gaia G</dt>
                  <dd>{selected[GAIA_MAGNITUDE]?.toFixed(2) ?? 'Not reported'}</dd>
                </div>
                <div><dt>System stars</dt><dd>{selected[STAR_COUNT] ?? 'Not reported'}</dd></div>
                <div><dt>Coordinate frame</dt><dd>ICRS</dd></div>
              </dl>
              {selected[GAIA_DR3] ? (
                <p className="observed-sky-selection__identity">
                  <Database size={11} aria-hidden="true" /> <code>{selected[GAIA_DR3]}</code>
                </p>
              ) : null}
              {selected[CONFLICT_FIELDS] ? (
                <p className="observed-sky-selection__quality">
                  Composite rows disagree on {selected[CONFLICT_FIELDS]}; the conflicting summary
                  field is intentionally omitted.
                </p>
              ) : null}
              <button type="button" onClick={() => onOpenHost(selected[HOST])}>
                <Orbit size={13} aria-hidden="true" /> Open verified system records
              </button>
            </article>
          ) : null}
        </>
      ) : (
        <div className="observed-sky-atlas__empty" role="status">
          <SearchX size={18} aria-hidden="true" />
          <strong>No observed host matches this search</strong>
          <p>Clear or shorten the host name to restore the atlas.</p>
        </div>
      )}
    </section>
  )
})

export default ObservedSkyAtlas
