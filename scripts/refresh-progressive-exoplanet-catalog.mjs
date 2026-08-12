import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const SCHEMA_VERSION = '2.0.0'
const CATALOG_ID = 'nasa-exoplanets'
const DETAIL_CHUNK_SIZE = 384
const FETCH_TIMEOUT_MS = 90_000
const TAP_ENDPOINT = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync'
const DOCUMENTATION_URL =
  'https://exoplanetarchive.ipac.caltech.edu/docs/API_PS_columns.html'
const ACKNOWLEDGEMENT_URL =
  'https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html'
const PUBLIC_ROOT_URL = new URL('../public/catalog/nasa-exoplanets/', import.meta.url)
const RELEASE_SUMMARY_URL = new URL(
  '../src/data/generated/progressiveExoplanetRelease.ts',
  import.meta.url,
)

const IDENTITY_FIELDS = Object.freeze([
  'pl_name',
  'hostname',
  'gaia_dr3_id',
  'hd_name',
  'hip_name',
  'tic_id',
])

const POSITION_FIELDS = Object.freeze(['ra', 'dec'])

const MEASUREMENTS = Object.freeze([
  ['distancePc', 'sy_dist', 'pc', false],
  ['parallaxMas', 'sy_plx', 'mas', false],
  ['properMotionMasYr', 'sy_pm', 'mas/yr', false],
  ['radiusEarth', 'pl_rade', 'R_earth', true],
  ['massEarth', 'pl_bmasse', 'M_earth', true],
  ['densityGcm3', 'pl_dens', 'g/cm^3', true],
  ['orbitalPeriodDays', 'pl_orbper', 'day', true],
  ['semiMajorAxisAu', 'pl_orbsmax', 'au', true],
  ['eccentricity', 'pl_orbeccen', 'dimensionless', true],
  ['inclinationDeg', 'pl_orbincl', 'deg', true],
  ['transitMidpointDays', 'pl_tranmid', 'day', true],
  ['transitDurationHours', 'pl_trandur', 'hour', true],
  ['transitDepthPercent', 'pl_trandep', 'percent', true],
  ['radialVelocityAmplitudeMs', 'pl_rvamp', 'm/s', true],
  ['equilibriumTempK', 'pl_eqt', 'K', true],
  ['insolationEarth', 'pl_insol', 'S_earth', true],
  ['transmissionMetric', 'pl_tsm', 'dimensionless', true],
  ['emissionMetric', 'pl_esm', 'dimensionless', true],
  ['stellarTeffK', 'st_teff', 'K', true],
  ['stellarRadiusSolar', 'st_rad', 'R_sun', true],
  ['stellarMassSolar', 'st_mass', 'M_sun', true],
  ['stellarAgeGyr', 'st_age', 'Gyr', true],
  ['stellarMetallicityDex', 'st_met', 'dex', true],
  ['stellarLuminosityLogSolar', 'st_lum', 'log10(L_sun)', true],
  ['stellarRotationDays', 'st_rotp', 'day', true],
  ['gaiaMagnitude', 'sy_gaiamag', 'mag', false],
])

const CONTEXT_FIELDS = Object.freeze([
  'st_spectype',
  'pl_bmassprov',
  'pl_controv_flag',
  'sy_snum',
  'sy_pnum',
  'sy_mnum',
  'disc_year',
  'disc_pubdate',
  'discoverymethod',
  'disc_locale',
  'disc_facility',
  'disc_instrument',
  'disc_telescope',
  'disc_refname',
  'pl_ntranspec',
  'pl_nespec',
  'pl_ndispec',
  'pl_nobs_jwst_tran',
  'pl_nobs_jwst_e',
  'pl_nobs_jwst_di',
  'pl_nobs_jwst_pc',
])

const measurementColumns = MEASUREMENTS.flatMap(([, source, , hasLimit]) => [
  source,
  `${source}err1`,
  `${source}err2`,
  ...(hasLimit ? [`${source}lim`] : []),
  `${source}_reflink`,
])

const SOURCE_COLUMNS = Object.freeze([
  ...IDENTITY_FIELDS,
  ...POSITION_FIELDS,
  ...measurementColumns,
  ...CONTEXT_FIELDS,
])

const QUERY = `select ${SOURCE_COLUMNS.join(',')} from pscomppars`

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function stableJson(value) {
  return `${JSON.stringify(value)}\n`
}

function optionalString(value) {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function optionalInteger(value) {
  const numeric = optionalNumber(value)
  return numeric === null || !Number.isInteger(numeric) ? null : numeric
}

function decodeHtmlText(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&Aacute;', 'Á')
    .replaceAll('&Ouml;', 'Ö')
    .replaceAll('&Scaron;', 'Š')
    .replaceAll('&aacute;', 'á')
    .replaceAll('&acirc;', 'â')
    .replaceAll('&atilde;', 'ã')
    .replaceAll('&auml;', 'ä')
    .replaceAll('&ccedil;', 'ç')
    .replaceAll('&egrave;', 'è')
    .replaceAll('&eacute;', 'é')
    .replaceAll('&iacute;', 'í')
    .replaceAll('&ntilde;', 'ñ')
    .replaceAll('&oacute;', 'ó')
    .replaceAll('&ograve;', 'ò')
    .replaceAll('&ouml;', 'ö')
    .replaceAll('&plusmn;', '±')
    .replaceAll('&scaron;', 'š')
    .replaceAll('&uacute;', 'ú')
    .replaceAll('&uuml;', 'ü')
    .replaceAll('&yacute;', 'ý')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function parseReference(value) {
  const raw = optionalString(value)
  if (raw === null) return null
  const href = raw.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? null
  return {
    label: decodeHtmlText(raw) || 'Source reference',
    url: href?.startsWith('http') ? href : null,
  }
}

function measurement(row, source, unit, hasLimit) {
  return {
    value: optionalNumber(row[source]),
    errorPlus: optionalNumber(row[`${source}err1`]),
    errorMinus: optionalNumber(row[`${source}err2`]),
    limit: hasLimit ? optionalInteger(row[`${source}lim`]) : null,
    unit,
    reference: parseReference(row[`${source}_reflink`]),
  }
}

function stableEntityId(name) {
  return `nea:pscomppars:${encodeURIComponent(name)}`
}

function toPlanet(row) {
  const name = optionalString(row.pl_name)
  const host = optionalString(row.hostname)
  if (name === null || host === null) return null

  return {
    id: stableEntityId(name),
    name,
    host,
    externalIds: {
      gaiaDr3: optionalString(row.gaia_dr3_id),
      hd: optionalString(row.hd_name),
      hip: optionalString(row.hip_name),
      tic: optionalString(row.tic_id),
    },
    coordinates: {
      frame: 'ICRS',
      raDeg: optionalNumber(row.ra),
      decDeg: optionalNumber(row.dec),
    },
    measurements: Object.fromEntries(
      MEASUREMENTS.map(([key, source, unit, hasLimit]) => [
        key,
        measurement(row, source, unit, hasLimit),
      ]),
    ),
    hostStar: {
      spectralType: optionalString(row.st_spectype),
    },
    system: {
      starCount: optionalInteger(row.sy_snum),
      planetCount: optionalInteger(row.sy_pnum),
      moonCount: optionalInteger(row.sy_mnum),
    },
    discovery: {
      year: optionalInteger(row.disc_year),
      publicationDate: optionalString(row.disc_pubdate),
      method: optionalString(row.discoverymethod),
      locale: optionalString(row.disc_locale),
      facility: optionalString(row.disc_facility),
      instrument: optionalString(row.disc_instrument),
      telescope: optionalString(row.disc_telescope),
      reference: parseReference(row.disc_refname),
    },
    observationCounts: {
      transmissionSpectra: optionalInteger(row.pl_ntranspec),
      emissionSpectra: optionalInteger(row.pl_nespec),
      directImagingSpectra: optionalInteger(row.pl_ndispec),
      jwstTransmission: optionalInteger(row.pl_nobs_jwst_tran),
      jwstEmission: optionalInteger(row.pl_nobs_jwst_e),
      jwstDirectImaging: optionalInteger(row.pl_nobs_jwst_di),
      jwstPhaseCurve: optionalInteger(row.pl_nobs_jwst_pc),
    },
    flags: {
      controversial: optionalInteger(row.pl_controv_flag) === 1,
      massProvenance: optionalString(row.pl_bmassprov),
    },
  }
}

function compareText(left, right) {
  return left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true })
}

function comparePlanets(left, right) {
  return compareText(left.name, right.name) || compareText(left.host, right.host)
}

function buildRequestUrl() {
  const url = new URL(TAP_ENDPOINT)
  url.searchParams.set('query', QUERY)
  url.searchParams.set('format', 'json')
  return url
}

function argumentValue(name) {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

function retrievedAtFromArguments() {
  const value = argumentValue('retrieved-at') ?? new Date().toISOString()
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new TypeError(`Invalid --retrieved-at: ${value}`)
  return new Date(timestamp).toISOString()
}

async function sourceRows(requestUrl) {
  const input = argumentValue('input')
  if (input) {
    const parsed = JSON.parse(await readFile(input, 'utf8'))
    if (!Array.isArray(parsed)) throw new TypeError('--input must contain a JSON array')
    return parsed
  }

  const response = await fetch(requestUrl, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Astral-Surveyor-Catalog-Builder/2.0',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`NASA TAP request failed (${response.status} ${response.statusText})`)
  }
  const rows = await response.json()
  if (!Array.isArray(rows)) throw new TypeError('NASA TAP response was not a JSON array')
  return rows
}

function summaryTuple(planet, chunkId) {
  const values = planet.measurements
  return [
    planet.id,
    planet.name,
    planet.host,
    values.distancePc.value,
    values.radiusEarth.value,
    values.massEarth.value,
    values.equilibriumTempK.value,
    planet.hostStar.spectralType,
    planet.discovery.method,
    planet.discovery.facility,
    planet.discovery.year,
    chunkId,
  ]
}

function compareNullable(left, right, direction) {
  if (left === null) return right === null ? 0 : 1
  if (right === null) return -1
  return direction === 'ascending' ? left - right : right - left
}

function summaryOrders(summaries) {
  const indices = summaries.map((_, index) => index)
  return {
    distance: [...indices].sort(
      (left, right) =>
        compareNullable(summaries[left][3], summaries[right][3], 'ascending') ||
        left - right,
    ),
    discovery: [...indices].sort(
      (left, right) =>
        compareNullable(summaries[left][10], summaries[right][10], 'descending') ||
        left - right,
    ),
  }
}

async function existingReleasePlanets() {
  if (!process.argv.includes('--repack-existing')) return null
  const manifest = JSON.parse(
    await readFile(new URL('manifest.json', PUBLIC_ROOT_URL), 'utf8'),
  )
  const records = []
  for (const descriptor of manifest.chunks) {
    const path = new URL(descriptor.path.replace('/catalog/nasa-exoplanets/', ''), PUBLIC_ROOT_URL)
    const chunk = JSON.parse(await readFile(path, 'utf8'))
    records.push(...chunk.records)
  }
  return {
    planets: records,
    source: manifest.source,
    retrievedAt: manifest.retrievedAt,
  }
}

async function writeContentAddressed(directoryUrl, stem, value) {
  const text = stableJson(value)
  const bytes = Buffer.from(text, 'utf8')
  const hash = sha256(bytes)
  const filename = `${stem}-${hash.slice(0, 16)}.json`
  await writeFile(new URL(filename, directoryUrl), bytes)
  return { filename, sha256: hash, bytes: bytes.byteLength }
}

async function main() {
  const existing = await existingReleasePlanets()
  const retrievedAt = existing?.retrievedAt ?? retrievedAtFromArguments()
  const requestUrl = buildRequestUrl()
  const rows = existing ? null : await sourceRows(requestUrl)
  const planets = existing
    ? existing.planets.sort(comparePlanets)
    : rows.map(toPlanet).filter(Boolean).sort(comparePlanets)

  if (planets.length < 1000) {
    throw new Error(`Refusing incomplete release with only ${planets.length} planets`)
  }
  const ids = new Set()
  const names = new Set()
  for (const planet of planets) {
    if (ids.has(planet.id) || names.has(planet.name)) {
      throw new Error(`Duplicate NASA planet identity: ${planet.name}`)
    }
    ids.add(planet.id)
    names.add(planet.name)
  }

  const logicalHash = sha256(Buffer.from(stableJson(planets), 'utf8'))
  const revision = `nea-${retrievedAt.slice(0, 10).replaceAll('-', '')}-${logicalHash.slice(0, 12)}`
  const releaseUrl = new URL(`releases/${revision}/`, PUBLIC_ROOT_URL)
  const chunkUrl = new URL('chunks/', releaseUrl)
  await mkdir(chunkUrl, { recursive: true })

  const chunks = []
  const summaries = []
  for (let offset = 0; offset < planets.length; offset += DETAIL_CHUNK_SIZE) {
    const records = planets.slice(offset, offset + DETAIL_CHUNK_SIZE)
    const chunkId = chunks.length
    const written = await writeContentAddressed(chunkUrl, `detail-${chunkId}`, {
      schemaVersion: SCHEMA_VERSION,
      catalogRevision: revision,
      chunkId,
      records,
    })
    const path = `/catalog/nasa-exoplanets/releases/${revision}/chunks/${written.filename}`
    chunks.push({
      id: chunkId,
      path,
      sha256: written.sha256,
      bytes: written.bytes,
      records: records.length,
      firstName: records.at(0).name,
      lastName: records.at(-1).name,
    })
    for (const planet of records) summaries.push(summaryTuple(planet, chunkId))
  }

  const index = await writeContentAddressed(releaseUrl, 'search-index', {
    schemaVersion: SCHEMA_VERSION,
    catalogRevision: revision,
    columns: [
      'id',
      'name',
      'host',
      'distancePc',
      'radiusEarth',
      'massEarth',
      'equilibriumTempK',
      'stellarSpectralType',
      'discoveryMethod',
      'discoveryFacility',
      'discoveryYear',
      'chunkId',
    ],
    orders: summaryOrders(summaries),
    records: summaries,
  })

  const hostCount = new Set(planets.map(({ host }) => host)).size
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    catalogId: CATALOG_ID,
    catalogRevision: revision,
    retrievedAt,
    publishedAt: retrievedAt,
    recordCount: planets.length,
    hostCount,
    source: existing?.source ?? {
      provider: 'NASA Exoplanet Archive',
      table: 'pscomppars',
      tapEndpoint: TAP_ENDPOINT,
      requestUrl: requestUrl.href,
      query: QUERY,
      documentationUrl: DOCUMENTATION_URL,
      acknowledgementUrl: ACKNOWLEDGEMENT_URL,
      product: 'Planetary Systems Composite Parameters',
    },
    provenance: {
      scope: 'All named confirmed planets returned by pscomppars at retrieval time.',
      nullPolicy: 'Absent or non-finite source cells remain null; no scientific value is imputed.',
      compositePolicy:
        'Composite fields can originate from different literature sources and are labelled archive composite.',
      sort: 'Planet name, then host name, using locale-aware deterministic comparison.',
      rightsStatus: 'review-required',
    },
    performance: {
      detailChunkSize: DETAIL_CHUNK_SIZE,
      chunkCount: chunks.length,
      resultPageSize: 20,
    },
    searchIndex: {
      path: `/catalog/nasa-exoplanets/releases/${revision}/${index.filename}`,
      sha256: index.sha256,
      bytes: index.bytes,
      records: summaries.length,
    },
    chunks,
  }

  await mkdir(PUBLIC_ROOT_URL, { recursive: true })
  await writeFile(new URL('manifest.json', PUBLIC_ROOT_URL), stableJson(manifest), 'utf8')
  await mkdir(new URL('.', RELEASE_SUMMARY_URL), { recursive: true })
  await writeFile(
    RELEASE_SUMMARY_URL,
    `// Generated by scripts/refresh-progressive-exoplanet-catalog.mjs.\n` +
      `export const PROGRESSIVE_EXOPLANET_RELEASE = ${JSON.stringify(
        {
          revision,
          recordCount: planets.length,
          hostCount,
          retrievedAt,
          chunkCount: chunks.length,
        },
        null,
        2,
      )} as const\n`,
    'utf8',
  )
  process.stdout.write(
    `Published ${planets.length} planets / ${hostCount} hosts in ${chunks.length} chunks (${revision})\n`,
  )
}

await main()
