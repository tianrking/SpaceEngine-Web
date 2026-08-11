import { describe, expect, it } from 'vitest'
import { createAsteriaSystem } from './asteria'
import { bodyPositionAtTime, findBodyById, flattenSystemBodies } from './system'

describe('Asteria catalogue', () => {
  it('is deterministic for a seed and varies orbital phases across seeds', () => {
    const first = createAsteriaSystem('catalogue-test')
    const replay = createAsteriaSystem('catalogue-test')
    const alternate = createAsteriaSystem('alternate-test')

    expect(replay).toEqual(first)
    expect(alternate.planets[0]?.orbit.meanAnomalyAtEpochRadians).not.toBe(
      first.planets[0]?.orbit.meanAnomalyAtEpochRadians,
    )
  })

  it('contains a diverse six-planet system with rings and moons', () => {
    const system = createAsteriaSystem()
    const gasGiant = system.planets.find((planet) => planet.planetClass === 'gas-giant')

    expect(system.primaryStar.name).toBe('Asteria')
    expect(system.planets).toHaveLength(6)
    expect(gasGiant?.rings).toBeDefined()
    expect(gasGiant?.moons.length).toBeGreaterThanOrEqual(3)
    expect(system.planets.some((planet) => planet.planetClass === 'ice-giant')).toBe(true)
  })

  it('flattens and looks up every nested moon', () => {
    const system = createAsteriaSystem()
    const flattened = flattenSystemBodies(system)

    expect(findBodyById(system, 'brontes-ione')?.name).toBe('Ione')
    expect(new Set(flattened.map((body) => body.id)).size).toBe(flattened.length)
    expect(flattened.length).toBeGreaterThan(system.planets.length + 1)
  })

  it('resolves moon positions into the star-system coordinate frame', () => {
    const system = createAsteriaSystem('position-test')
    const planetPosition = bodyPositionAtTime(system, 'pelagos', 123_456)
    const moonPosition = bodyPositionAtTime(system, 'pelagos-neris', 123_456)
    const moon = findBodyById(system, 'pelagos-neris')

    expect(planetPosition).toBeDefined()
    expect(moonPosition).toBeDefined()
    expect(moon?.kind).toBe('moon')
    if (!planetPosition || !moonPosition || moon?.kind !== 'moon') return

    const separation = Math.hypot(
      moonPosition.x - planetPosition.x,
      moonPosition.y - planetPosition.y,
      moonPosition.z - planetPosition.z,
    )
    expect(separation).toBeGreaterThan(
      moon.orbit.semiMajorAxisMeters * (1 - moon.orbit.eccentricity) * 0.999,
    )
    expect(separation).toBeLessThan(
      moon.orbit.semiMajorAxisMeters * (1 + moon.orbit.eccentricity) * 1.001,
    )
  })
})
