import { describe, expect, it } from 'vitest'
import {
  EXOPLANET_CATALOG_SCHEMA_VERSION,
  NEARBY_EXOPLANET_COUNT,
  loadNearbyExoplanetCatalog,
  validateExoplanetCatalog,
} from './exoplanetCatalog'

describe('nearby confirmed exoplanet snapshot', () => {
  it('loads the generated NASA catalogue lazily', async () => {
    const catalog = await loadNearbyExoplanetCatalog()
    expect(catalog.planets).toHaveLength(NEARBY_EXOPLANET_COUNT)
    expect(catalog.metadata.recordCount).toBe(NEARBY_EXOPLANET_COUNT)
    expect(catalog.metadata.schemaVersion).toBe(EXOPLANET_CATALOG_SCHEMA_VERSION)
    expect(catalog.metadata.source).toMatchObject({
      provider: 'NASA Exoplanet Archive',
      table: 'pscomppars',
      tapEndpoint: 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync',
    })
    expect(catalog.metadata.source.query.toLowerCase()).toContain('from pscomppars')
    expect(catalog.metadata.source.query.toLowerCase()).not.toMatch(/\b(top|order\s+by)\b/)
    expect(catalog.metadata.source.requestUrl).toContain(
      'exoplanetarchive.ipac.caltech.edu/TAP/sync',
    )
    expect(catalog.metadata.provenance.nullPolicy).toContain('No value was imputed')
  })

  it('contains unique planets sorted locally by distance with multiple hosts', async () => {
    const { planets } = await loadNearbyExoplanetCatalog()
    expect(new Set(planets.map(({ name }) => name)).size).toBe(planets.length)
    expect(new Set(planets.map(({ host }) => host)).size).toBeGreaterThanOrEqual(50)

    for (const [index, planet] of planets.entries()) {
      for (const value of [
        planet.distancePc,
        planet.radiusEarth,
        planet.massEarth,
        planet.orbitalPeriodDays,
        planet.semiMajorAxisAu,
      ]) {
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThan(0)
      }
      for (const value of [
        planet.raDeg,
        planet.decDeg,
        planet.eccentricity,
        planet.equilibriumTempK,
        planet.insolationEarth,
        planet.stellarTeffK,
        planet.stellarRadiusSolar,
        planet.stellarMassSolar,
        planet.systemStarCount,
        planet.systemPlanetCount,
        planet.discoveryYear,
      ]) {
        expect(value === null || Number.isFinite(value)).toBe(true)
      }
      if (index > 0) {
        expect(planet.distancePc).toBeGreaterThanOrEqual(planets[index - 1].distancePc)
      }
    }
  })

  it('rejects unsupported schema versions', async () => {
    const catalog = await loadNearbyExoplanetCatalog()
    expect(() =>
      validateExoplanetCatalog({
        ...catalog,
        metadata: { ...catalog.metadata, schemaVersion: '999' },
      }),
    ).toThrow(/Unsupported exoplanet schema version/)
  })
})
