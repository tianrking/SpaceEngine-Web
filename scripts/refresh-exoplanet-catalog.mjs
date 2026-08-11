import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SCHEMA_VERSION = '1.0.0'
const RECORD_LIMIT = 128
const TAP_ENDPOINT = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync'
const DOCUMENTATION_URL =
  'https://exoplanetarchive.ipac.caltech.edu/docs/API_PS_columns.html'
const OUTPUT_URL = new URL(
  '../src/data/generated/nearby-exoplanets-128.json',
  import.meta.url,
)

const SOURCE_COLUMNS = Object.freeze([
  'pl_name',
  'hostname',
  'sy_dist',
  'ra',
  'dec',
  'pl_rade',
  'pl_bmasse',
  'pl_orbper',
  'pl_orbsmax',
  'pl_orbeccen',
  'pl_eqt',
  'pl_insol',
  'st_spectype',
  'st_teff',
  'st_rad',
  'st_mass',
  'sy_snum',
  'sy_pnum',
  'disc_year',
  'discoverymethod',
  'disc_facility',
])

// Fetch the complete relevant projection. Filtering, sorting and limiting are
// intentionally local so the 128-row selection never depends on TAP row order.
const QUERY = `select ${SOURCE_COLUMNS.join(',')} from pscomppars`

function buildRequestUrl() {
  const url = new URL(TAP_ENDPOINT)
  url.searchParams.set('query', QUERY)
  url.searchParams.set('format', 'json')
  return url
}

function optionalString(value) {
  if (typeof value !== 'string') return value == null ? null : String(value)
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function requiredString(value) {
  return optionalString(value)
}

function toPlanet(row) {
  return {
    name: requiredString(row.pl_name),
    host: requiredString(row.hostname),
    distancePc: optionalNumber(row.sy_dist),
    raDeg: optionalNumber(row.ra),
    decDeg: optionalNumber(row.dec),
    radiusEarth: optionalNumber(row.pl_rade),
    massEarth: optionalNumber(row.pl_bmasse),
    orbitalPeriodDays: optionalNumber(row.pl_orbper),
    semiMajorAxisAu: optionalNumber(row.pl_orbsmax),
    eccentricity: optionalNumber(row.pl_orbeccen),
    equilibriumTempK: optionalNumber(row.pl_eqt),
    insolationEarth: optionalNumber(row.pl_insol),
    stellarSpectralType: optionalString(row.st_spectype),
    stellarTeffK: optionalNumber(row.st_teff),
    stellarRadiusSolar: optionalNumber(row.st_rad),
    stellarMassSolar: optionalNumber(row.st_mass),
    systemStarCount: optionalNumber(row.sy_snum),
    systemPlanetCount: optionalNumber(row.sy_pnum),
    discoveryYear: optionalNumber(row.disc_year),
    discoveryMethod: optionalString(row.discoverymethod),
    discoveryFacility: optionalString(row.disc_facility),
  }
}

function isPositiveFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function hasRequiredNearbyFields(planet) {
  return (
    planet.name !== null &&
    planet.host !== null &&
    isPositiveFinite(planet.distancePc) &&
    isPositiveFinite(planet.radiusEarth) &&
    isPositiveFinite(planet.massEarth) &&
    isPositiveFinite(planet.orbitalPeriodDays) &&
    isPositiveFinite(planet.semiMajorAxisAu)
  )
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function comparePlanets(left, right) {
  return (
    left.distancePc - right.distancePc ||
    compareText(left.host, right.host) ||
    compareText(left.name, right.name)
  )
}

function retrievedAtFromArguments() {
  const prefix = '--retrieved-at='
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix))
  const retrievedAt = argument?.slice(prefix.length) ?? new Date().toISOString()
  const timestamp = Date.parse(retrievedAt)
  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`Invalid --retrieved-at value: ${retrievedAt}`)
  }
  return new Date(timestamp).toISOString()
}

function createSnapshot(rows, requestUrl, retrievedAt) {
  const candidates = rows.map(toPlanet).filter(hasRequiredNearbyFields)
  candidates.sort(comparePlanets)

  const seen = new Set()
  for (const planet of candidates) {
    if (seen.has(planet.name)) {
      throw new Error(`NASA pscomppars returned duplicate planet name: ${planet.name}`)
    }
    seen.add(planet.name)
  }

  const planets = candidates.slice(0, RECORD_LIMIT)
  if (planets.length !== RECORD_LIMIT) {
    throw new Error(
      `Expected at least ${RECORD_LIMIT} complete nearby planets, received ${planets.length}`,
    )
  }

  const hostCount = new Set(planets.map(({ host }) => host)).size
  if (hostCount < 2) {
    throw new Error('Nearby selection must span multiple host systems')
  }

  return {
    metadata: {
      schemaVersion: SCHEMA_VERSION,
      retrievedAt,
      recordCount: planets.length,
      source: {
        provider: 'NASA Exoplanet Archive',
        table: 'pscomppars',
        tapEndpoint: TAP_ENDPOINT,
        requestUrl: requestUrl.href,
        query: QUERY,
        documentationUrl: DOCUMENTATION_URL,
      },
      units: {
        distancePc: 'pc',
        raDeg: 'deg',
        decDeg: 'deg',
        radiusEarth: 'R_earth',
        massEarth: 'M_earth',
        orbitalPeriodDays: 'day',
        semiMajorAxisAu: 'au',
        eccentricity: 'dimensionless',
        equilibriumTempK: 'K',
        insolationEarth: 'S_earth',
        stellarTeffK: 'K',
        stellarRadiusSolar: 'R_sun',
        stellarMassSolar: 'M_sun',
        systemStarCount: 'count',
        systemPlanetCount: 'count',
        discoveryYear: 'year',
      },
      provenance: {
        catalogueScope:
          'Confirmed planets from the NASA Exoplanet Archive Planetary Systems Composite Parameters table.',
        selection:
          'Converted the complete projected TAP result locally, required planet name, host, distance, radius, mass, period and semi-major axis, then retained the first 128 rows after deterministic sorting.',
        numericConversion:
          'Numeric source cells were converted with Number; only finite values were retained.',
        nullPolicy:
          'Empty, absent or non-finite optional source values remain null. No value was imputed, interpolated or synthesized by this project.',
        sort: 'distancePc ascending, then host ascending, then planet name ascending.',
      },
    },
    planets,
  }
}

async function main() {
  const requestUrl = buildRequestUrl()
  const response = await fetch(requestUrl, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Astral-Surveyor-Exoplanet-Snapshot/1.0',
    },
  })
  if (!response.ok) {
    throw new Error(`NASA TAP request failed (${response.status} ${response.statusText})`)
  }

  const rows = await response.json()
  if (!Array.isArray(rows)) throw new TypeError('NASA TAP response was not a JSON array')

  const snapshot = createSnapshot(
    rows,
    requestUrl,
    retrievedAtFromArguments(),
  )
  const outputPath = fileURLToPath(OUTPUT_URL)
  await mkdir(new URL('.', OUTPUT_URL), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

  const hostCount = new Set(snapshot.planets.map(({ host }) => host)).size
  process.stdout.write(
    `Wrote ${snapshot.planets.length} planets across ${hostCount} hosts to ${outputPath}\n`,
  )
}

await main()
