export type RendererBackend = 'webgpu' | 'webgl2'

export type QualityLevel = 'balanced' | 'ultra' | 'battery'

export type CelestialKind =
  | 'star'
  | 'terrestrial'
  | 'oceanic'
  | 'desert'
  | 'gas-giant'
  | 'ice-giant'

export interface CelestialBodyView {
  id: string
  name: string
  designation: string
  kind: CelestialKind
  description: string
  radiusKm: number
  massEarths: number
  temperatureK: number
  gravityG: number
  orbitalPeriodDays: number
  distanceAu: number
  atmosphere: string
  discovered: string
  color: string
  accent: string
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
  id: string
  name: string
  kind: CelestialKind
  color: string
}
