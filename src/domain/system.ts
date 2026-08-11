import { positionAtTime } from './orbit'
import type { CelestialBody, Planet, StarSystem, Vector3 } from './types'

const ORIGIN: Vector3 = Object.freeze({ x: 0, y: 0, z: 0 })

export function flattenSystemBodies(system: StarSystem): CelestialBody[] {
  return [
    system.primaryStar,
    ...system.planets.flatMap((planet) => [planet, ...planet.moons]),
  ]
}

export function findBodyById(
  system: StarSystem,
  bodyId: string,
): CelestialBody | undefined {
  if (system.primaryStar.id === bodyId) return system.primaryStar

  for (const planet of system.planets) {
    if (planet.id === bodyId) return planet
    const moon = planet.moons.find((candidate) => candidate.id === bodyId)
    if (moon) return moon
  }

  return undefined
}

function add(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  }
}

function findMoonParent(system: StarSystem, moonId: string): Planet | undefined {
  return system.planets.find((planet) =>
    planet.moons.some((moon) => moon.id === moonId),
  )
}

/**
 * Resolves a body to star-system coordinates. The primary star is the origin;
 * planets and moons include every parent-relative orbital transform.
 */
export function bodyPositionAtTime(
  system: StarSystem,
  bodyId: string,
  timeSeconds: number,
): Vector3 | undefined {
  if (bodyId === system.primaryStar.id) return ORIGIN

  const planet = system.planets.find((candidate) => candidate.id === bodyId)
  if (planet) return positionAtTime(planet.orbit, timeSeconds)

  const parent = findMoonParent(system, bodyId)
  if (!parent) return undefined
  const moon = parent.moons.find((candidate) => candidate.id === bodyId)
  if (!moon) return undefined

  return add(
    positionAtTime(parent.orbit, timeSeconds),
    positionAtTime(moon.orbit, timeSeconds),
  )
}
