export type RendererBackend = 'webgpu' | 'webgl2'

export type QualityLevel = 'balanced' | 'ultra' | 'battery'

export type CatalogBodyKind = 'star' | 'planet' | 'moon'

export type CelestialKind =
  | 'star'
  | 'terrestrial'
  | 'oceanic'
  | 'desert'
  | 'gas-giant'
  | 'ice-giant'

export interface AtmosphereConstituentView {
  readonly species: string
  /** Normalized volume fraction in the range 0..1. */
  readonly fraction: number
}

export interface OrbitView {
  readonly semiMajorAxisMeters: number
  /** Distance from the primary star. Moons inherit their parent planet's stellar distance. */
  readonly stellarDistanceAu: number
  readonly eccentricity: number
  readonly inclinationDegrees: number
  readonly periodDays: number
  readonly periapsisMeters: number
  readonly apoapsisMeters: number
  readonly meanVelocityKmPerSecond: number
  readonly stellarFluxWattsPerSquareMeter: number
  readonly stellarFluxSolar: number
}

export interface ProvenanceView {
  readonly origin: 'synthetic' | 'catalogue' | 'derived'
  readonly generator: string
  readonly modelVersion: string
  readonly seed: string | null
  readonly notice: string
  readonly references: readonly string[]
}

export type HabitabilityTone = 'positive' | 'caution' | 'negative' | 'neutral'

export interface HabitabilityView {
  readonly label: string
  readonly tone: HabitabilityTone
  readonly summary: string
}

export interface CelestialBodyView {
  readonly id: string
  readonly name: string
  readonly designation: string
  /** Existing presentation class consumed by the current HUD. */
  readonly kind: CelestialKind
  /** Canonical catalogue role, independent from the presentation class. */
  readonly bodyKind: CatalogBodyKind
  readonly bodyClass: string
  readonly parentId: string | null
  readonly parentName: string | null
  readonly description: string
  readonly radiusKm: number
  readonly massKilograms: number
  readonly massEarths: number
  readonly densityKgPerCubicMeter: number
  readonly temperatureK: number
  readonly equilibriumTemperatureK: number | null
  readonly greenhouseDeltaK: number | null
  readonly internalHeatFluxWattsPerSquareMeter: number | null
  readonly surfaceGravityMetersPerSecondSquared: number
  readonly gravityG: number
  readonly escapeVelocityKmPerSecond: number
  readonly orbitalPeriodDays: number
  readonly distanceAu: number
  readonly orbit: OrbitView | null
  readonly rotationPeriodHours: number
  readonly axialTiltDegrees: number
  readonly albedo: number
  readonly atmosphere: string
  readonly surfacePressurePascals: number | null
  readonly atmosphereComposition: readonly AtmosphereConstituentView[]
  readonly discovered: string
  readonly provenance: ProvenanceView
  readonly facts: readonly string[]
  readonly habitability: HabitabilityView
  readonly color: string
  readonly accent: string
}

export interface EngineTelemetry {
  backend: RendererBackend
  fps: number
  frameTimeMs: number
  drawCalls: number
  triangles: number
  starCount: number
  cameraSpeed: number
  cameraAltitudeKm: number | null
  simulationDate: Date
  timeScale: number
  quality: QualityLevel
  floatingOriginKm: readonly [number, number, number]
}

export interface EngineCapabilities {
  backend: RendererBackend
  webgpuAvailable: boolean
  computeStarfield: boolean
  logarithmicDepth: boolean
  maxTextureDimension2D: number | null
  adapterName: string | null
}

export interface CosmosEngineEvents {
  onReady?: (capabilities: EngineCapabilities) => void
  onTelemetry?: (telemetry: EngineTelemetry) => void
  onSelection?: (body: CelestialBodyView) => void
  onError?: (error: Error) => void
}

export interface NavigationTarget {
  readonly id: string
  readonly name: string
  readonly kind: CelestialKind
  readonly bodyKind: Extract<CatalogBodyKind, 'star' | 'planet'>
  readonly bodyClass: string
  readonly color: string
}
