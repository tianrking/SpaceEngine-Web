import {
  ASTRONOMICAL_UNIT_METERS,
  LIGHT_YEAR_METERS,
  PARSEC_METERS,
  SPEED_OF_LIGHT_METERS_PER_SECOND,
} from './constants'

export type DistanceUnit = 'auto' | 'm' | 'km' | 'AU' | 'ly' | 'pc'
export type SpeedUnit = 'auto' | 'm/s' | 'km/s' | 'c'

export interface FormatUnitOptions<Unit extends string> {
  readonly unit?: Unit
  readonly maximumFractionDigits?: number
  readonly locale?: string
}

const distanceScale: Readonly<Record<Exclude<DistanceUnit, 'auto'>, number>> = {
  m: 1,
  km: 1_000,
  AU: ASTRONOMICAL_UNIT_METERS,
  ly: LIGHT_YEAR_METERS,
  pc: PARSEC_METERS,
}

const speedScale: Readonly<Record<Exclude<SpeedUnit, 'auto'>, number>> = {
  'm/s': 1,
  'km/s': 1_000,
  c: SPEED_OF_LIGHT_METERS_PER_SECOND,
}

function formatValue(value: number, maximumFractionDigits: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits: 0,
    useGrouping: false,
  }).format(value)
}

export function selectDistanceUnit(meters: number): Exclude<DistanceUnit, 'auto'> {
  const magnitude = Math.abs(meters)
  if (magnitude >= PARSEC_METERS) return 'pc'
  if (magnitude >= LIGHT_YEAR_METERS * 0.1) return 'ly'
  if (magnitude >= ASTRONOMICAL_UNIT_METERS * 0.1) return 'AU'
  if (magnitude >= 1_000) return 'km'
  return 'm'
}

export function formatDistance(
  meters: number,
  options: FormatUnitOptions<DistanceUnit> = {},
): string {
  if (!Number.isFinite(meters)) throw new RangeError('Distance must be finite')
  const unit = options.unit === undefined || options.unit === 'auto'
    ? selectDistanceUnit(meters)
    : options.unit
  const digits = options.maximumFractionDigits ?? 2
  const value = meters / distanceScale[unit]
  return `${formatValue(value, digits, options.locale ?? 'en-US')} ${unit}`
}

export function selectSpeedUnit(metersPerSecond: number): Exclude<SpeedUnit, 'auto'> {
  const magnitude = Math.abs(metersPerSecond)
  if (magnitude >= SPEED_OF_LIGHT_METERS_PER_SECOND * 0.01) return 'c'
  if (magnitude >= 1_000) return 'km/s'
  return 'm/s'
}

export function formatSpeed(
  metersPerSecond: number,
  options: FormatUnitOptions<SpeedUnit> = {},
): string {
  if (!Number.isFinite(metersPerSecond)) throw new RangeError('Speed must be finite')
  const unit = options.unit === undefined || options.unit === 'auto'
    ? selectSpeedUnit(metersPerSecond)
    : options.unit
  const digits = options.maximumFractionDigits ?? 2
  const value = metersPerSecond / speedScale[unit]
  return `${formatValue(value, digits, options.locale ?? 'en-US')} ${unit}`
}
