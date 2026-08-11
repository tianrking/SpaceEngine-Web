import { GRAVITATIONAL_CONSTANT, TAU } from './constants'
import type { KeplerOrbit, OrbitalState, Vector3 } from './types'

const NEWTON_TOLERANCE = 1e-13
const MAX_NEWTON_ITERATIONS = 20

export function normalizeRadians(angleRadians: number): number {
  const normalized = angleRadians % TAU
  return normalized < 0 ? normalized + TAU : normalized
}

export function orbitalPeriodSeconds(
  semiMajorAxisMeters: number,
  primaryMassKilograms: number,
  orbitingMassKilograms = 0,
): number {
  if (semiMajorAxisMeters <= 0 || !Number.isFinite(semiMajorAxisMeters)) {
    throw new RangeError('Semi-major axis must be a positive finite number')
  }
  if (primaryMassKilograms <= 0 || !Number.isFinite(primaryMassKilograms)) {
    throw new RangeError('Primary mass must be a positive finite number')
  }
  if (orbitingMassKilograms < 0 || !Number.isFinite(orbitingMassKilograms)) {
    throw new RangeError('Orbiting mass must be a non-negative finite number')
  }

  const gravitationalParameter =
    GRAVITATIONAL_CONSTANT * (primaryMassKilograms + orbitingMassKilograms)
  return TAU * Math.sqrt(semiMajorAxisMeters ** 3 / gravitationalParameter)
}

/** Solves M = E - e sin(E) for an elliptic orbit. */
export function solveEccentricAnomaly(
  meanAnomalyRadians: number,
  eccentricity: number,
): number {
  if (eccentricity < 0 || eccentricity >= 1 || !Number.isFinite(eccentricity)) {
    throw new RangeError('Elliptic eccentricity must satisfy 0 <= e < 1')
  }
  if (!Number.isFinite(meanAnomalyRadians)) {
    throw new RangeError('Mean anomaly must be finite')
  }

  const meanAnomaly = normalizeRadians(meanAnomalyRadians)
  let eccentricAnomaly = eccentricity < 0.8 ? meanAnomaly : Math.PI

  for (let iteration = 0; iteration < MAX_NEWTON_ITERATIONS; iteration += 1) {
    const residual =
      eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly
    const derivative = 1 - eccentricity * Math.cos(eccentricAnomaly)
    const correction = residual / derivative
    eccentricAnomaly -= correction
    if (Math.abs(correction) <= NEWTON_TOLERANCE) break
  }

  return normalizeRadians(eccentricAnomaly)
}

function rotateFromOrbitalPlane(
  x: number,
  y: number,
  orbit: KeplerOrbit,
): Vector3 {
  const ascendingNode = orbit.longitudeOfAscendingNodeRadians
  const periapsis = orbit.argumentOfPeriapsisRadians
  const inclination = orbit.inclinationRadians

  const cosNode = Math.cos(ascendingNode)
  const sinNode = Math.sin(ascendingNode)
  const cosPeriapsis = Math.cos(periapsis)
  const sinPeriapsis = Math.sin(periapsis)
  const cosInclination = Math.cos(inclination)
  const sinInclination = Math.sin(inclination)

  return {
    x:
      (cosNode * cosPeriapsis - sinNode * sinPeriapsis * cosInclination) * x +
      (-cosNode * sinPeriapsis - sinNode * cosPeriapsis * cosInclination) * y,
    y:
      (sinNode * cosPeriapsis + cosNode * sinPeriapsis * cosInclination) * x +
      (-sinNode * sinPeriapsis + cosNode * cosPeriapsis * cosInclination) * y,
    z: sinPeriapsis * sinInclination * x + cosPeriapsis * sinInclination * y,
  }
}

function validateOrbit(orbit: KeplerOrbit): void {
  if (orbit.semiMajorAxisMeters <= 0 || !Number.isFinite(orbit.semiMajorAxisMeters)) {
    throw new RangeError('Orbit semi-major axis must be positive and finite')
  }
  if (orbit.periodSeconds <= 0 || !Number.isFinite(orbit.periodSeconds)) {
    throw new RangeError('Orbit period must be positive and finite')
  }
  if (
    orbit.eccentricity < 0 ||
    orbit.eccentricity >= 1 ||
    !Number.isFinite(orbit.eccentricity)
  ) {
    throw new RangeError('Orbit eccentricity must satisfy 0 <= e < 1')
  }
}

/** Returns the complete parent-relative Keplerian state at an absolute time. */
export function orbitalStateAtTime(
  orbit: KeplerOrbit,
  timeSeconds: number,
): OrbitalState {
  validateOrbit(orbit)
  if (!Number.isFinite(timeSeconds)) throw new RangeError('Simulation time must be finite')

  const meanMotion = TAU / orbit.periodSeconds
  const meanAnomaly =
    orbit.meanAnomalyAtEpochRadians + meanMotion * (timeSeconds - orbit.epochSeconds)
  const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, orbit.eccentricity)

  const cosineE = Math.cos(eccentricAnomaly)
  const sineE = Math.sin(eccentricAnomaly)
  const eccentricityFactor = Math.sqrt(1 - orbit.eccentricity ** 2)
  const orbitalX = orbit.semiMajorAxisMeters * (cosineE - orbit.eccentricity)
  const orbitalY = orbit.semiMajorAxisMeters * eccentricityFactor * sineE

  const anomalyRate = meanMotion / (1 - orbit.eccentricity * cosineE)
  const orbitalVelocityX = -orbit.semiMajorAxisMeters * sineE * anomalyRate
  const orbitalVelocityY =
    orbit.semiMajorAxisMeters * eccentricityFactor * cosineE * anomalyRate

  const positionMeters = rotateFromOrbitalPlane(orbitalX, orbitalY, orbit)
  const velocityMetersPerSecond = rotateFromOrbitalPlane(
    orbitalVelocityX,
    orbitalVelocityY,
    orbit,
  )
  const trueAnomaly = Math.atan2(
    eccentricityFactor * sineE,
    cosineE - orbit.eccentricity,
  )

  return {
    positionMeters,
    velocityMetersPerSecond,
    radiusMeters: Math.hypot(orbitalX, orbitalY),
    eccentricAnomalyRadians: eccentricAnomaly,
    trueAnomalyRadians: normalizeRadians(trueAnomaly),
  }
}

/** Parent-relative Cartesian position in metres at an absolute simulation time. */
export function positionAtTime(orbit: KeplerOrbit, timeSeconds: number): Vector3 {
  return orbitalStateAtTime(orbit, timeSeconds).positionMeters
}
