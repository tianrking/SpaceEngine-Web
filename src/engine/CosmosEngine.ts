import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  Fn,
  float,
  hash,
  instanceIndex,
  instancedArray,
  materialOpacity,
  shapeCircle,
  uniform,
  vec3,
} from 'three/tsl'
import { ASTERIA_SYSTEM, JULIAN_DAY_SECONDS, orbitalStateAtTime } from '../domain'
import type { ProgressiveHostSkyIndex } from '../data/progressiveExoplanetCatalog'
import type { ObservedSystemBundle } from '../data/progressiveObservedSystem'
import {
  appendBoundedCameraHistory,
  beginBodyCentering,
  beginFreeCameraFrame,
  beginSystemOverview,
  cameraDistanceForMode,
  cameraLodReferenceId,
  completeCameraCentering,
  enclosingVisualRadius,
  isCameraFlightInputCode,
  minimumCameraDistance,
  recoverInterruptedRestoreTarget,
  interruptCameraCentering,
  shouldPushCameraHistory,
  shouldPreserveBodyScale,
  shouldPushRedirectedCameraHistory,
  smoothFlightProgress,
  trackingTranslation,
  type BodyCameraViewMode,
} from './cameraCentering'
import {
  BODY_LOOKUP,
  CATALOG_BODIES,
  RENDER_BODIES,
  STAR,
  type RenderBody,
} from './catalog'
import {
  DEFAULT_DISPLAY_SETTINGS,
  deriveVisualCalibration,
  normalizeDisplaySettings,
} from './displaySettings'
import {
  buildObservedHostPoints,
  buildObservedSystemRenderModel,
  clearObservedSelectionState,
  OBSERVED_HOST_BASE_OPACITY,
  observedCameraDistance,
  observedHostCanOpen,
  observedNavigationCommand,
  observedHostId,
  observedObjectSupportsViewMode,
  observedHostVisualCalibration,
  shouldStartObservedCentering,
  type ObservedHostPoint,
  type ObservedPlanetRenderModel,
} from './observedScene'
import {
  createCloudTexture,
  createPlanetTexture,
  createRadialGlowTexture,
  createRingTexture,
} from './proceduralTextures'
import type {
  CelestialBodyView,
  CameraCenterState,
  CosmosEngineEvents,
  DisplaySettings,
  EngineCapabilities,
  EngineTelemetry,
  ObservedCenteredViewMode,
  ObservedSceneState,
  ObservedSelection,
  QualityLevel,
  RendererBackend,
  VisualCalibration,
} from './types'

const TAU = Math.PI * 2
const SYSTEM_UNIT_KM = 1_000_000
const FLOATING_ORIGIN_THRESHOLD = 4_000
const TELEMETRY_INTERVAL_MS = 400
const SIMULATION_EPOCH = Date.UTC(2187, 2, 20, 14, 32, 0)
const ORBIT_BASE_OPACITY = 0.15
const FAR_STAR_BASE_OPACITY = 0.88
const CPU_GALAXY_BASE_OPACITY = 0.72
const GPU_GALAXY_BASE_OPACITY = 1
const CAMERA_HISTORY_LIMIT = 8

interface BodyRuntime {
  definition: RenderBody
  orbitNode: THREE.Group
  visualNode: THREE.Group
  mesh: THREE.Mesh
  cloudMesh: THREE.Mesh | null
}

interface CameraFlight {
  centerBodyId: string | null
  centerObject: THREE.Object3D | null
  fixedCenter: THREE.Vector3 | null
  startedAt: number
  durationMs: number
  startCamera: THREE.Vector3
  startTarget: THREE.Vector3
  viewDistance: number
  approachDirection: THREE.Vector3
  cameraOffset: THREE.Vector3 | null
  targetOffset: THREE.Vector3 | null
  restoreTarget: SavedCameraView | null
}

interface SavedCameraView {
  readonly mode: CameraCenterState['mode']
  readonly bodyId: string | null
  readonly cameraOffset: THREE.Vector3
  readonly targetOffset: THREE.Vector3
}

interface StartCameraFlightOptions {
  readonly centerBodyId: string | null
  readonly center: THREE.Vector3
  readonly viewDistance: number
  readonly approachDirection: THREE.Vector3
  readonly durationMs: number
  readonly nextState: CameraCenterState
  readonly cameraOffset?: THREE.Vector3
  readonly targetOffset?: THREE.Vector3
  readonly restoreTarget?: SavedCameraView
  readonly centerObject?: THREE.Object3D
  readonly fixedCenter?: THREE.Vector3
}

interface NavigatorWithOptionalGpu {
  gpu?: GPU
}

interface BrightnessBinding {
  readonly apply: (brightness: number) => void
}

interface MutableColorOpacityMaterial {
  readonly color: THREE.Color
  opacity: number
}

interface ObservedPlanetRuntime {
  readonly definition: ObservedPlanetRenderModel
  readonly orbitNode: THREE.Group
  readonly mesh: THREE.Mesh
}

export class CosmosEngine {
  private readonly host: HTMLElement
  private readonly events: CosmosEngineEvents
  private readonly scene = new THREE.Scene()
  private readonly worldRoot = new THREE.Group()
  private readonly sharedBackgroundRoot = new THREE.Group()
  private readonly asteriaRoot = new THREE.Group()
  private observedRoot: THREE.Group | null = null
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.001, 100_000)
  private readonly renderer: THREE.WebGPURenderer
  private readonly controls: OrbitControls
  private readonly timer = new THREE.Timer()
  private readonly bodyRuntimes = new Map<string, BodyRuntime>()
  private readonly bodyObjects = new Map<string, THREE.Object3D>()
  private readonly raycastTargets: THREE.Object3D[] = []
  private readonly disposableTextures: THREE.Texture[] = []
  private radialGlowTexture: THREE.CanvasTexture | null = null
  private readonly pressedKeys = new Set<string>()
  private readonly floatingOriginUnits = new THREE.Vector3()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly resizeObserver: ResizeObserver
  private readonly reducedMotionQuery: MediaQueryList
  private readonly previousCameraPosition = new THREE.Vector3()
  private readonly orbitBrightnessBindings: BrightnessBinding[] = []
  private readonly observedOrbitBrightnessBindings: BrightnessBinding[] = []
  private readonly starfieldBrightnessBindings: BrightnessBinding[] = []
  private readonly observedStarfieldBrightnessBindings: BrightnessBinding[] = []
  private observedHostCloud: THREE.Points | null = null
  private readonly observedHostPoints = new Map<string, ObservedHostPoint>()
  private readonly observedPlanetRuntimes = new Map<string, ObservedPlanetRuntime>()
  private observedSystemStarId: string | null = null
  private observedTrackedObject: THREE.Object3D | null = null
  private observedRaycastTarget: THREE.Points | null = null
  private observedSceneState: ObservedSceneState = {
    mode: 'asteria',
    activeHost: null,
    activeSystemId: null,
    selectedObjectId: null,
    selectedHost: null,
    centeredObjectId: null,
    centeredViewMode: null,
    transitioning: false,
  }

  private backend: RendererBackend = 'webgl2'
  private quality: QualityLevel = 'balanced'
  private displaySettings: DisplaySettings = DEFAULT_DISPLAY_SETTINGS
  private simulationDays = 0
  private timeScale = 1
  private navigationSpeed = 1
  private selectedId: string | null = 'pelagos'
  private cameraCenterState: CameraCenterState = {
    mode: 'system',
    bodyId: null,
    transitioning: false,
    canReturn: false,
  }
  private trackedCenter = new THREE.Vector3()
  private readonly cameraViewHistory: SavedCameraView[] = []
  private cameraFlight: CameraFlight | null = null
  private lastTelemetryAt = 0
  private telemetryFrameCount = 0
  private telemetryFrameTime = 0
  private lastFps = 0
  private cameraSpeedMetersPerSecond = 0
  private starCount = 0
  private disposed = false
  private initialized = false

  constructor(host: HTMLElement, events: CosmosEngineEvents = {}) {
    this.host = host
    this.events = events
    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.reducedMotionQuery.addEventListener('change', this.onReducedMotionChange)
    this.scene.background = new THREE.Color('#010207')
    this.scene.add(this.worldRoot)
    this.worldRoot.add(this.sharedBackgroundRoot, this.asteriaRoot)

    const forceWebGL = new URLSearchParams(window.location.search).get('renderer') === 'webgl2'
    this.renderer = new THREE.WebGPURenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
      alpha: false,
      forceWebGL,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = this.displaySettings.exposure
    this.renderer.setClearColor(0x010207, 1)
    this.renderer.domElement.className = 'cosmos-canvas'
    this.renderer.domElement.setAttribute(
      'aria-keyshortcuts',
      'G Shift+G Backspace 0 W A S D Q E Space',
    )
    this.renderer.domElement.tabIndex = 0
    this.host.appendChild(this.renderer.domElement)
    this.timer.connect(document)

    this.camera.position.set(42, 28, 74)
    this.previousCameraPosition.copy(this.camera.position)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.055
    this.controls.enablePan = false
    this.controls.minDistance = 1.4
    this.controls.maxDistance = 3_000
    this.controls.zoomSpeed = 1.25
    this.controls.rotateSpeed = 0.42
    this.controls.target.set(0, 0, 0)
    this.controls.update()
    this.controls.addEventListener('start', this.cancelCameraFlight)

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(this.host)
    this.bindInput()
  }

  async init(): Promise<EngineCapabilities> {
    if (this.initialized) {
      return this.readCapabilities(null)
    }

    try {
      const gpu = (navigator as unknown as NavigatorWithOptionalGpu).gpu
      const adapterPromise = gpu?.requestAdapter() ?? Promise.resolve(null)
      this.resize()
      await this.renderer.init()
      if (this.disposed) throw new Error('Universe renderer was disposed during initialization.')
      const adapter = await adapterPromise.catch(() => null)
      const rendererBackend = this.renderer.backend as unknown as { isWebGPUBackend?: boolean }
      this.backend = rendererBackend.isWebGPUBackend === true ? 'webgpu' : 'webgl2'

      this.createLighting()
      this.createStarSystem()
      this.createFarStars()
      if (this.backend === 'webgpu') {
        this.createGpuGalaxy(96_000)
      } else {
        this.createCpuGalaxy(24_000)
      }

      this.initialized = true
      this.select('pelagos')
      this.emitCameraCenterState()
      this.timer.reset()
      await this.renderer.setAnimationLoop(this.animate)

      const capabilities = this.readCapabilities(adapter)
      this.events.onReady?.(capabilities)
      return capabilities
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason))
      this.events.onError?.(error)
      throw error
    }
  }

  getBodies(): readonly CelestialBodyView[] {
    return CATALOG_BODIES
  }

  getObservedSceneState(): ObservedSceneState {
    return { ...this.observedSceneState }
  }

  showAsteriaSystem(): void {
    if (!this.initialized) return
    this.clearObservedScene()
    this.asteriaRoot.visible = true
    this.observedSceneState = {
      mode: 'asteria',
      activeHost: null,
      activeSystemId: null,
      selectedObjectId: null,
      selectedHost: null,
      centeredObjectId: null,
      centeredViewMode: null,
      transitioning: false,
    }
    this.resetCameraForScene(new THREE.Vector3(42, 28, 74), 'pelagos')
    this.select('pelagos')
    this.emitObservedSceneState()
  }

  showObservedUniverse(index: ProgressiveHostSkyIndex, focusHost?: string): void {
    if (!this.initialized) return
    const points = buildObservedHostPoints(index)
    const nextRoot = new THREE.Group()
    nextRoot.name = 'Observed NASA host universe'
    const positions = new Float32Array(points.length * 3)
    const colors = new Float32Array(points.length * 3)
    const color = new THREE.Color()
    this.observedHostPoints.clear()
    for (const [pointIndex, point] of points.entries()) {
      positions[pointIndex * 3] = point.position.x
      positions[pointIndex * 3 + 1] = point.position.y
      positions[pointIndex * 3 + 2] = point.position.z
      color.set(this.observedSpectralColor(point.spectralType))
      colors[pointIndex * 3] = color.r
      colors[pointIndex * 3 + 1] = color.g
      colors[pointIndex * 3 + 2] = color.b
      this.observedHostPoints.set(point.id, point)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const material = new THREE.PointsNodeMaterial({
      size: 5.2,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: OBSERVED_HOST_BASE_OPACITY,
      depthWrite: false,
    })
    const nextStarfieldBrightnessBindings: BrightnessBinding[] = []
    this.bindMaterialBrightness(
      nextStarfieldBrightnessBindings,
      material,
      OBSERVED_HOST_BASE_OPACITY,
      this.displaySettings.starfieldBrightness,
      observedHostVisualCalibration,
    )
    const cloud = new THREE.Points(geometry, material)
    cloud.name = 'Observed NASA hosts'
    cloud.userData.observedHostIds = points.map(({ id }) => id)
    nextRoot.add(cloud)
    this.replaceObservedRoot(nextRoot, {
      starfield: nextStarfieldBrightnessBindings,
    })
    this.observedHostCloud = cloud
    this.observedRaycastTarget = cloud
    this.asteriaRoot.visible = false
    this.raycaster.params.Points = { threshold: 8 }
    this.observedSceneState = {
      mode: 'observed-universe',
      activeHost: null,
      activeSystemId: null,
      selectedObjectId: null,
      selectedHost: null,
      centeredObjectId: null,
      centeredViewMode: null,
      transitioning: false,
    }
    this.resetCameraForScene(new THREE.Vector3(1_050, 540, 1_420))
    if (focusHost) this.focusObservedHost(focusHost)
    else this.emitObservedSceneState()
  }

  focusObservedHost(host: string): boolean {
    if (this.observedSceneState.mode !== 'observed-universe') return false
    const point = this.observedHostPoints.get(observedHostId(host))
    if (!point) return false
    this.selectObservedHost(point, false)
    if (!shouldStartObservedCentering(this.observedSceneState, point.id, 'orbit')) return true
    this.observedTrackedObject = null
    this.observedSceneState = {
      ...this.observedSceneState,
      centeredObjectId: point.id,
      centeredViewMode: 'orbit',
      transitioning: true,
    }
    this.emitObservedSceneState()
    const center = new THREE.Vector3(point.position.x, point.position.y, point.position.z)
      .add(this.observedRoot?.position ?? new THREE.Vector3())
    this.startCameraFlight({
      centerBodyId: null,
      center,
      fixedCenter: center,
      viewDistance: 42,
      approachDirection: this.camera.position.clone().sub(this.controls.target).normalize(),
      durationMs: 1_650,
      nextState: beginFreeCameraFrame(false, true),
    })
    return true
  }

  loadObservedSystem(bundle: ObservedSystemBundle): void {
    if (!this.initialized) return
    const model = buildObservedSystemRenderModel(bundle)
    const nextRoot = new THREE.Group()
    nextRoot.name = `Observed system ${bundle.host}`
    const nextPlanetRuntimes = new Map<string, ObservedPlanetRuntime>()
    const nextOrbitBrightnessBindings: BrightnessBinding[] = []

    const starMaterial = new THREE.MeshBasicNodeMaterial({
      color: this.observedTemperatureColor(model.starTemperatureKelvin),
    })
    const star = new THREE.Mesh(new THREE.SphereGeometry(model.starRadius, 48, 30), starMaterial)
    star.name = bundle.host
    star.userData.observedObjectId = model.starId
    star.userData.observedKind = 'star'
    star.userData.observedSourceId = bundle.id
    star.userData.observedHost = bundle.host
    nextRoot.add(star)
    const glowTexture = this.getRadialGlowTexture()
    const glowMaterial = new THREE.SpriteNodeMaterial({
      map: glowTexture,
      color: this.observedTemperatureColor(model.starTemperatureKelvin),
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const glow = new THREE.Sprite(glowMaterial)
    glow.name = `${bundle.host} stellar glow`
    glow.scale.setScalar(model.starRadius * 5.8)
    nextRoot.add(glow)
    const observedStellarLight = new THREE.PointLight(0xffd5a0, 1_450, 0, 1.5)
    nextRoot.add(observedStellarLight)

    for (const planet of model.planets) {
      const orbitNode = new THREE.Group()
      orbitNode.name = `${planet.name} illustrative orbit frame`
      const planetMaterial = new THREE.MeshStandardNodeMaterial({
        color: this.observedPlanetColor(planet.radiusEarth),
        roughness: 0.82,
        metalness: 0.01,
      })
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(planet.radius, 40, 24), planetMaterial)
      mesh.name = planet.name
      mesh.userData.observedObjectId = planet.id
      mesh.userData.observedKind = 'planet'
      mesh.userData.observedSourceId = planet.sourceId
      mesh.userData.observedHost = bundle.host
      mesh.userData.observedAssumptionCount = planet.assumptions.length
      orbitNode.add(mesh)
      nextRoot.add(orbitNode)
      const orbitPoints: THREE.Vector3[] = []
      for (let index = 0; index <= 160; index += 1) {
        orbitPoints.push(this.observedPlanetPosition(planet, index / 160 * TAU))
      }
      const orbitMaterial = new THREE.LineBasicNodeMaterial({
        color: 0x6f879b,
        transparent: true,
        opacity: ORBIT_BASE_OPACITY,
      })
      this.bindMaterialBrightness(
        nextOrbitBrightnessBindings,
        orbitMaterial,
        ORBIT_BASE_OPACITY,
        this.displaySettings.orbitBrightness,
      )
      const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPoints), orbitMaterial)
      orbit.name = `${planet.name} illustrative visual orbit`
      nextRoot.add(orbit)
      orbitNode.position.copy(this.observedPlanetPosition(planet, planet.phaseRadians))
      nextPlanetRuntimes.set(planet.id, { definition: planet, orbitNode, mesh })
    }

    this.replaceObservedRoot(nextRoot, { orbit: nextOrbitBrightnessBindings })
    this.observedPlanetRuntimes.clear()
    for (const [id, runtime] of nextPlanetRuntimes) this.observedPlanetRuntimes.set(id, runtime)
    this.observedSystemStarId = model.starId
    this.observedHostCloud = null
    this.observedRaycastTarget = null
    this.observedHostPoints.clear()
    this.asteriaRoot.visible = false
    this.observedSceneState = {
      mode: 'observed-system',
      activeHost: bundle.host,
      activeSystemId: bundle.id,
      selectedObjectId: model.starId,
      selectedHost: bundle.host,
      centeredObjectId: null,
      centeredViewMode: null,
      transitioning: false,
    }
    this.resetCameraForScene(new THREE.Vector3(42, 26, 70))
    this.emitObservedSelection({
      kind: 'star',
      id: model.starId,
      sourceId: bundle.id,
      host: bundle.host,
      name: bundle.host,
      observed: true,
      illustrativeAssumptionCount: 0,
    })
    this.emitObservedSceneState()
  }

  centerOnObservedObject(id: string, mode: ObservedCenteredViewMode = 'orbit'): boolean {
    if (!observedObjectSupportsViewMode(this.observedSceneState.mode, id, mode)) return false
    if (this.observedSceneState.mode === 'observed-universe') {
      const point = this.observedHostPoints.get(id)
      return point ? this.focusObservedHost(point.host) : false
    }
    if (this.observedSceneState.mode !== 'observed-system') return false
    const object = this.findObservedSystemObject(id)
    if (!object) return false
    if (!shouldStartObservedCentering(this.observedSceneState, id, mode)) return true
    this.observedTrackedObject = object
    this.observedSceneState = {
      ...this.observedSceneState,
      centeredObjectId: id,
      centeredViewMode: mode,
      transitioning: true,
    }
    this.emitObservedSceneState()
    const center = object.getWorldPosition(new THREE.Vector3())
    const radius = id === this.observedSystemStarId
      ? (object.geometry as THREE.SphereGeometry).parameters.radius
      : this.observedPlanetRuntimes.get(id)?.definition.radius ?? 1
    this.startCameraFlight({
      centerBodyId: null,
      center,
      centerObject: object,
      viewDistance: observedCameraDistance(radius, mode),
      approachDirection: this.camera.position.clone().sub(this.controls.target).normalize(),
      durationMs: 1_500,
      nextState: beginFreeCameraFrame(false, true),
    })
    this.controls.minDistance = minimumCameraDistance(radius)
    return true
  }

  getDisplaySettings(): DisplaySettings {
    return { ...this.displaySettings }
  }

  setDisplaySettings(update: Partial<DisplaySettings>): DisplaySettings {
    const previous = this.displaySettings
    const next = normalizeDisplaySettings(update, previous)
    this.displaySettings = next

    if (next.exposure !== previous.exposure) {
      this.renderer.toneMappingExposure = next.exposure
    }
    if (next.orbitBrightness !== previous.orbitBrightness) {
      for (const binding of this.orbitBrightnessBindings) {
        binding.apply(next.orbitBrightness)
      }
      for (const binding of this.observedOrbitBrightnessBindings) {
        binding.apply(next.orbitBrightness)
      }
    }
    if (next.starfieldBrightness !== previous.starfieldBrightness) {
      for (const binding of this.starfieldBrightnessBindings) {
        binding.apply(next.starfieldBrightness)
      }
      for (const binding of this.observedStarfieldBrightnessBindings) {
        binding.apply(next.starfieldBrightness)
      }
    }

    return this.getDisplaySettings()
  }

  resetDisplaySettings(): DisplaySettings {
    return this.setDisplaySettings(DEFAULT_DISPLAY_SETTINGS)
  }

  setTimeScale(nextScale: number): void {
    this.timeScale = THREE.MathUtils.clamp(nextScale, -10_000, 10_000)
  }

  getTimeScale(): number {
    return this.timeScale
  }

  setNavigationSpeed(nextSpeed: number): void {
    this.navigationSpeed = THREE.MathUtils.clamp(nextSpeed, 0.1, 12)
  }

  resetSimulationTime(): void {
    this.simulationDays = 0
    this.timeScale = 1
  }

  setQuality(nextQuality: QualityLevel): void {
    this.quality = nextQuality
    const qualityMultiplier = nextQuality === 'ultra' ? 1.35 : nextQuality === 'battery' ? 0.72 : 1
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * qualityMultiplier)
    this.resize()
  }

  select(id: string): void {
    const body = BODY_LOOKUP.get(id)
    if (!body) return
    this.selectedId = id
    this.events.onSelection?.(body)
  }

  clearSelection(): void {
    if (this.selectedId === null) return
    this.selectedId = null
    this.events.onSelectionCleared?.()
  }

  clearObservedSelection(): void {
    if (this.observedSceneState.mode === 'asteria') return
    if (
      this.observedSceneState.selectedObjectId === null &&
      this.observedSceneState.selectedHost === null
    ) return
    this.observedSceneState = clearObservedSelectionState(this.observedSceneState)
    this.emitObservedSceneState()
    this.events.onObservedSelectionCleared?.()
  }

  getCameraCenterState(): CameraCenterState {
    return { ...this.cameraCenterState }
  }

  centerOnBody(id: string, mode: BodyCameraViewMode = 'orbit'): boolean {
    if (this.observedSceneState.mode !== 'asteria') return false
    const body = BODY_LOOKUP.get(id)
    const target = this.bodyObjects.get(id)
    if (!body || !target) return false
    if (mode === 'close' && body.bodyKind === 'star') return false
    if (
      this.cameraCenterState.transitioning &&
      this.cameraCenterState.bodyId === id &&
      this.cameraCenterState.mode === mode
    ) {
      return true
    }
    const hadActiveTransition = this.cameraFlight !== null
    if (!shouldPushCameraHistory(this.cameraCenterState, id, mode)) {
      this.select(id)
      return true
    }

    this.prepareNavigationHistory(hadActiveTransition, id, mode)
    this.select(id)
    const visualRadius = this.visualRadiusFor(id)
    const center = target.getWorldPosition(new THREE.Vector3())
    const approachDirection = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize()
    if (approachDirection.lengthSq() < 0.1) {
      approachDirection.set(1, 0.45, 1).normalize()
    }
    this.startCameraFlight({
      centerBodyId: id,
      center,
      viewDistance: cameraDistanceForMode(visualRadius, mode),
      approachDirection,
      durationMs: mode === 'close' ? 2_400 : 1_900,
      nextState: beginBodyCentering(id, mode, this.cameraViewHistory.length > 0),
    })
    this.controls.minDistance = minimumCameraDistance(visualRadius)
    return true
  }

  focusOn(id: string, surface = false): void {
    this.centerOnBody(id, surface ? 'close' : 'orbit')
  }

  returnToPreviousView(): boolean {
    if (this.cameraFlight) this.cancelCameraFlightAtCurrentPose(true)
    const saved = this.cameraViewHistory.pop()
    if (!saved) return false
    this.restoreSavedCameraView(saved)
    return true
  }

  cancelCameraTransition(): boolean {
    if (!this.cameraFlight) return false
    this.cancelCameraFlightAtCurrentPose()
    return true
  }

  showSystemOverview(): void {
    if (this.observedSceneState.mode !== 'asteria') {
      if (this.observedSceneState.mode === 'observed-universe') {
        this.resetCameraForScene(new THREE.Vector3(1_050, 540, 1_420))
      } else {
        this.resetCameraForScene(new THREE.Vector3(42, 26, 70))
      }
      this.observedTrackedObject = null
      this.observedSceneState = {
        ...this.observedSceneState,
        centeredObjectId: null,
        centeredViewMode: null,
        transitioning: false,
      }
      this.emitObservedSceneState()
      return
    }
    const hadActiveTransition = this.cameraFlight !== null
    this.prepareNavigationHistory(hadActiveTransition, null, 'system')
    const starCenter = this.bodyObjects
      .get(STAR.id)
      ?.getWorldPosition(new THREE.Vector3()) ?? this.worldRoot.position.clone()
    const approachDirection = new THREE.Vector3(42, 28, 74).normalize()
    this.startCameraFlight({
      centerBodyId: null,
      center: starCenter,
      viewDistance: new THREE.Vector3(42, 28, 74).length(),
      approachDirection,
      durationMs: 1_500,
      nextState: beginSystemOverview(this.cameraViewHistory.length > 0),
    })
    this.controls.minDistance = 1.4
  }

  resetView(): void {
    if (this.observedSceneState.mode !== 'asteria') {
      this.showAsteriaSystem()
      return
    }
    this.cameraViewHistory.length = 0
    this.showSystemOverview()
    this.cameraViewHistory.length = 0
    this.cameraCenterState = {
      ...this.cameraCenterState,
      canReturn: false,
    }
    this.emitCameraCenterState()
    this.select('pelagos')
  }

  private visualRadiusFor(id: string): number {
    if (id === STAR.id) return 3.4
    const body = this.bodyRuntimes.get(id)?.definition
    if (!body) return 1
    return enclosingVisualRadius(
      body.renderRadius,
      body.hasRings ? body.ringOuterRatio : null,
    )
  }

  private pushCurrentCameraView(): void {
    const center = this.currentCenterWorldPosition()
    const nextHistory = appendBoundedCameraHistory(this.cameraViewHistory, {
      mode: this.cameraCenterState.mode,
      bodyId: this.cameraCenterState.bodyId,
      cameraOffset: this.camera.position.clone().sub(center),
      targetOffset: this.controls.target.clone().sub(center),
    }, CAMERA_HISTORY_LIMIT)
    this.cameraViewHistory.splice(0, this.cameraViewHistory.length, ...nextHistory)
  }

  private prepareNavigationHistory(
    hadActiveTransition: boolean,
    nextBodyId: string | null,
    nextMode: CameraCenterState['mode'],
  ): void {
    const stateBeforeCancel = this.cameraCenterState
    if (hadActiveTransition) this.cancelCameraFlightAtCurrentPose()
    if (
      shouldPushRedirectedCameraHistory(
        hadActiveTransition,
        stateBeforeCancel,
        nextBodyId,
        nextMode,
      )
    ) {
      this.pushCurrentCameraView()
    }
  }

  private restoreSavedCameraView(saved: SavedCameraView): void {
    const center = this.centerWorldPositionFor(saved.bodyId)
    const cameraOffset = saved.cameraOffset.clone()
    const targetOffset = saved.targetOffset.clone()
    const distance = Math.max(cameraOffset.distanceTo(targetOffset), 1)
    const direction = cameraOffset.clone().sub(targetOffset).normalize()
    if (direction.lengthSq() < 0.1) direction.set(1, 0.45, 1).normalize()
    if (
      (saved.mode === 'orbit' || saved.mode === 'close') &&
      saved.bodyId === null
    ) {
      throw new Error('Body-centered view is missing its body id')
    }
    this.startCameraFlight({
      centerBodyId: saved.bodyId,
      center,
      viewDistance: distance,
      approachDirection: direction,
      durationMs: 1_350,
      cameraOffset,
      targetOffset,
      restoreTarget: saved,
      nextState:
        saved.mode === 'system'
          ? beginSystemOverview(this.cameraViewHistory.length > 0)
          : saved.mode === 'free'
            ? beginFreeCameraFrame(this.cameraViewHistory.length > 0, true)
          : beginBodyCentering(
              saved.bodyId as string,
              saved.mode,
              this.cameraViewHistory.length > 0,
            ),
    })
    this.controls.minDistance =
      saved.bodyId === null ? 1.4 : minimumCameraDistance(this.visualRadiusFor(saved.bodyId))
  }

  private startCameraFlight(options: StartCameraFlightOptions): void {
    const durationMs = this.prefersReducedMotion() ? 0 : options.durationMs
    this.cameraCenterState = options.nextState
    this.trackedCenter.copy(options.center)
    this.cameraFlight = {
      centerBodyId: options.centerBodyId,
      centerObject: options.centerObject ?? null,
      fixedCenter: options.fixedCenter?.clone() ?? null,
      startedAt: performance.now(),
      durationMs,
      startCamera: this.camera.position.clone(),
      startTarget: this.controls.target.clone(),
      viewDistance: options.viewDistance,
      approachDirection: options.approachDirection.clone(),
      cameraOffset: options.cameraOffset?.clone() ?? null,
      targetOffset: options.targetOffset?.clone() ?? null,
      restoreTarget: options.restoreTarget ?? null,
    }
    this.emitCameraCenterState()
    if (durationMs === 0) this.updateCameraFlight(performance.now())
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    void this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.reducedMotionQuery.removeEventListener('change', this.onReducedMotionChange)
    this.unbindInput()
    this.controls.removeEventListener('start', this.cancelCameraFlight)
    this.controls.dispose()
    this.timer.dispose()
    this.clearObservedScene()

    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      mesh.geometry?.dispose?.()
      const material = mesh.material
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
      else material?.dispose?.()
    })
    this.disposableTextures.forEach((texture) => texture.dispose())
    this.orbitBrightnessBindings.length = 0
    this.observedOrbitBrightnessBindings.length = 0
    this.starfieldBrightnessBindings.length = 0
    this.observedStarfieldBrightnessBindings.length = 0
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private readonly animate = (now: number): void => {
    if (this.disposed || !this.initialized) return
    this.timer.update(now)
    const deltaSeconds = Math.min(this.timer.getDelta(), 0.05)
    this.simulationDays += deltaSeconds * this.timeScale * 0.12

    this.updateBodies(deltaSeconds)
    this.updateTrackedCenter()
    this.updateKeyboardFlight(deltaSeconds)
    this.updateCameraFlight(now)
    this.recenterIfNeeded()
    this.controls.update()
    const instantaneousSpeed =
      (this.camera.position.distanceTo(this.previousCameraPosition) * SYSTEM_UNIT_KM * 1_000) /
      Math.max(deltaSeconds, 1 / 240)
    this.cameraSpeedMetersPerSecond =
      this.cameraSpeedMetersPerSecond * 0.75 + instantaneousSpeed * 0.25
    this.previousCameraPosition.copy(this.camera.position)
    this.renderer.render(this.scene, this.camera)
    this.updateTelemetry(now, deltaSeconds)
  }

  private createLighting(): void {
    const ambient = new THREE.AmbientLight(0x6e83a6, 0.065)
    this.sharedBackgroundRoot.add(ambient)

    const stellarLight = new THREE.PointLight(0xffd5a0, 1800, 0, 1.5)
    stellarLight.position.set(0, 0, 0)
    stellarLight.castShadow = false
    this.asteriaRoot.add(stellarLight)
  }

  private getRadialGlowTexture(): THREE.CanvasTexture {
    if (this.radialGlowTexture) return this.radialGlowTexture
    const texture = createRadialGlowTexture()
    this.radialGlowTexture = texture
    this.disposableTextures.push(texture)
    return texture
  }

  private createStarSystem(): void {
    const starGroup = new THREE.Group()
    starGroup.name = STAR.name
    starGroup.userData.bodyId = STAR.id
    const starMaterial = new THREE.MeshBasicNodeMaterial({ color: STAR.color })
    const starMesh = new THREE.Mesh(new THREE.SphereGeometry(3.4, 64, 40), starMaterial)
    starMesh.userData.bodyId = STAR.id
    starGroup.add(starMesh)
    this.raycastTargets.push(starMesh)

    const glowTexture = this.getRadialGlowTexture()
    const glowMaterial = new THREE.SpriteNodeMaterial({
      map: glowTexture,
      color: STAR.accent,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const glow = new THREE.Sprite(glowMaterial)
    glow.scale.setScalar(24)
    starGroup.add(glow)
    this.asteriaRoot.add(starGroup)
    this.bodyObjects.set(STAR.id, starGroup)

    for (const body of RENDER_BODIES.filter(({ bodyKind }) => bodyKind === 'planet')) {
      this.createBody(body)
    }
    for (const body of RENDER_BODIES.filter(({ bodyKind }) => bodyKind === 'moon')) {
      this.createBody(body)
    }
    for (const body of RENDER_BODIES) this.createOrbit(body)
  }

  private createBody(body: RenderBody): void {
    const orbitNode = new THREE.Group()
    orbitNode.name = `${body.name} orbital frame`
    orbitNode.userData.bodyId = body.id
    const visualNode = new THREE.Group()
    visualNode.name = body.name
    visualNode.userData.bodyId = body.id
    visualNode.rotation.z = body.axialTiltRadians
    orbitNode.add(visualNode)

    const parentNode =
      body.parentId === STAR.id
        ? this.asteriaRoot
        : this.bodyRuntimes.get(body.parentId ?? '')?.orbitNode
    if (!parentNode) throw new Error(`Missing render parent ${body.parentId} for ${body.id}`)
    parentNode.add(orbitNode)
    orbitNode.position.copy(
      this.renderPositionAtTime(body, ASTERIA_SYSTEM.epochSeconds),
    )

    const widthSegments = body.bodyKind === 'moon' ? 64 : 96
    const heightSegments = body.bodyKind === 'moon' ? 40 : 64
    const geometry = new THREE.SphereGeometry(body.renderRadius, widthSegments, heightSegments)
    if (!body.isGasWorld) this.displaceRockySurface(geometry, body)

    const texture = createPlanetTexture(
      body.id,
      body.palette,
      body.isGasWorld,
      body.bodyKind === 'moon' ? 256 : 512,
      body.bodyKind === 'moon' ? 128 : 256,
    )
    this.disposableTextures.push(texture)
    const material = new THREE.MeshStandardNodeMaterial({
      map: texture,
      roughness: body.surfaceRoughness,
      metalness: 0.015,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.bodyId = body.id
    visualNode.add(mesh)
    this.raycastTargets.push(mesh)

    let cloudMesh: THREE.Mesh | null = null
    if (body.hasClouds) {
      const cloudTexture = createCloudTexture(body.id)
      this.disposableTextures.push(cloudTexture)
      const cloudMaterial = new THREE.MeshBasicNodeMaterial({
        map: cloudTexture,
        color: 0xe8f5ff,
        transparent: true,
        opacity: 0.54,
        depthWrite: false,
      })
      cloudMesh = new THREE.Mesh(
        new THREE.SphereGeometry(body.renderRadius * 1.018, 80, 48),
        cloudMaterial,
      )
      visualNode.add(cloudMesh)
    }

    if (body.atmosphereColor && body.atmosphereOpacity > 0) {
      const atmosphereMaterial = new THREE.MeshBasicNodeMaterial({
        color: body.atmosphereColor,
        transparent: true,
        opacity: body.atmosphereOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      })
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(body.renderRadius * body.atmosphereScale, 64, 40),
        atmosphereMaterial,
      )
      visualNode.add(atmosphere)
    }

    if (body.hasRings) this.createRings(visualNode, body)

    this.bodyObjects.set(body.id, orbitNode)
    this.bodyRuntimes.set(body.id, {
      definition: body,
      orbitNode,
      visualNode,
      mesh,
      cloudMesh,
    })
  }

  private displaceRockySurface(geometry: THREE.SphereGeometry, body: RenderBody): void {
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    const seed = body.id.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0)
    const vector = new THREE.Vector3()
    for (let index = 0; index < positions.count; index += 1) {
      vector.fromBufferAttribute(positions, index).normalize()
      const ridge =
        Math.sin(vector.x * 19 + seed) *
        Math.sin(vector.y * 23 - seed * 0.1) *
        Math.sin(vector.z * 17 + seed * 0.03)
      vector.multiplyScalar(body.renderRadius * (1 + ridge * body.surfaceDisplacement))
      positions.setXYZ(index, vector.x, vector.y, vector.z)
    }
    positions.needsUpdate = true
    geometry.computeVertexNormals()
  }

  private createRings(group: THREE.Group, body: RenderBody): void {
    const ringTexture = createRingTexture(body.ringColor ?? '#bca892')
    this.disposableTextures.push(ringTexture)
    const material = new THREE.MeshBasicNodeMaterial({
      map: ringTexture,
      color: body.ringColor ?? '#bca892',
      transparent: true,
      opacity: body.ringOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const innerRadius = body.renderRadius * body.ringInnerRatio
    const outerRadius = body.renderRadius * body.ringOuterRatio
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 192, 8)
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    const uvs = geometry.getAttribute('uv') as THREE.BufferAttribute
    for (let index = 0; index < positions.count; index += 1) {
      const radius = Math.hypot(positions.getX(index), positions.getY(index))
      uvs.setXY(index, (radius - innerRadius) / (outerRadius - innerRadius), 0.5)
    }
    uvs.needsUpdate = true
    const rings = new THREE.Mesh(geometry, material)
    rings.userData.bodyId = body.id
    rings.rotation.x = Math.PI / 2
    rings.rotation.z = body.ringInclinationRadians
    group.add(rings)
    this.raycastTargets.push(rings)
  }

  private createOrbit(body: RenderBody): void {
    const points: THREE.Vector3[] = []
    for (let index = 0; index <= 256; index += 1) {
      const timeSeconds =
        body.keplerOrbit.epochSeconds +
        (body.keplerOrbit.periodSeconds * index) / 256
      points.push(this.renderPositionAtTime(body, timeSeconds))
    }
    const material = new THREE.LineBasicNodeMaterial({
      color: body.color,
      transparent: true,
      opacity: ORBIT_BASE_OPACITY,
    })
    this.bindMaterialBrightness(
      this.orbitBrightnessBindings,
      material,
      ORBIT_BASE_OPACITY,
      this.displaySettings.orbitBrightness,
    )
    const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material)
    orbit.name = `${body.name} orbit`
    const parentNode =
      body.parentId === STAR.id
        ? this.asteriaRoot
        : this.bodyRuntimes.get(body.parentId ?? '')?.orbitNode
    if (!parentNode) throw new Error(`Missing orbit parent ${body.parentId} for ${body.id}`)
    parentNode.add(orbit)
  }

  private renderPositionAtTime(body: RenderBody, timeSeconds: number): THREE.Vector3 {
    const { positionMeters } = orbitalStateAtTime(body.keplerOrbit, timeSeconds)
    return new THREE.Vector3(
      positionMeters.x * body.orbitScale,
      positionMeters.z * body.orbitScale,
      positionMeters.y * body.orbitScale,
    )
  }

  private createFarStars(): void {
    const count = 8_000
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const random = this.createSeededRandom(0x7a51e2)
    const color = new THREE.Color()

    for (let index = 0; index < count; index += 1) {
      const radius = 1_800 + random() * 2_800
      const phi = Math.acos(2 * random() - 1)
      const theta = TAU * random()
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[index * 3 + 1] = radius * Math.cos(phi)
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)

      const temperature = random()
      if (temperature < 0.2) color.set('#ffb48c')
      else if (temperature > 0.82) color.set('#a7c7ff')
      else color.set('#f5f4ec')
      colors[index * 3] = color.r
      colors[index * 3 + 1] = color.g
      colors[index * 3 + 2] = color.b
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const material = new THREE.PointsNodeMaterial({
      size: 1.35,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: FAR_STAR_BASE_OPACITY,
      depthWrite: false,
    })
    this.bindMaterialBrightness(
      this.starfieldBrightnessBindings,
      material,
      FAR_STAR_BASE_OPACITY,
      this.displaySettings.starfieldBrightness,
    )
    this.sharedBackgroundRoot.add(new THREE.Points(geometry, material))
    this.starCount += count
  }

  private createGpuGalaxy(count: number): void {
    const positions = instancedArray(count, 'vec3')
    const colors = instancedArray(count, 'vec3')

    const computeInit = Fn(() => {
      const position = positions.element(instanceIndex)
      const particleColor = colors.element(instanceIndex)
      const radius = hash(instanceIndex.add(11)).pow(0.58).mul(4_200).add(780)
      const arm = float(instanceIndex.mod(4)).mul(Math.PI / 2)
      const angle = radius
        .mul(0.0034)
        .add(arm)
        .add(hash(instanceIndex.add(3)).sub(0.5).mul(0.92))
      const height = hash(instanceIndex.add(7))
        .sub(0.5)
        .mul(float(260).mul(radius.div(5_200).oneMinus().add(0.12)))

      position.assign(vec3(angle.cos().mul(radius), height, angle.sin().mul(radius)))
      const hot = hash(instanceIndex.add(19))
      particleColor.assign(
        vec3(
          float(0.62).add(hot.mul(0.38)),
          float(0.67).add(hot.mul(0.24)),
          float(0.78).add(hot.mul(0.22)),
        ),
      )
    })().compute(count)

    const initialCalibration = deriveVisualCalibration(
      this.displaySettings.starfieldBrightness,
      GPU_GALAXY_BASE_OPACITY,
    )
    const brightnessUniform = uniform(initialCalibration.colorIntensity)
    // `shapeCircle()` is scalar at runtime; current @types/three exposes it as bare Node.
    const circleOpacity = shapeCircle() as unknown as THREE.Node<'float'>
    const material = new THREE.SpriteNodeMaterial()
    material.colorNode = colors.element(instanceIndex).mul(brightnessUniform)
    material.positionNode = positions.toAttribute()
    material.scaleNode = hash(instanceIndex.add(23)).mul(0.34).add(0.12)
    material.opacityNode = materialOpacity.mul(circleOpacity)
    material.opacity = initialCalibration.opacity
    material.transparent = true
    material.depthWrite = false
    material.blending = THREE.AdditiveBlending
    material.toneMapped = false

    const galaxy = new THREE.Sprite(material)
    galaxy.count = count
    galaxy.frustumCulled = false
    galaxy.name = 'WebGPU compute galaxy'
    galaxy.rotation.x = -0.16
    this.sharedBackgroundRoot.add(galaxy)
    this.starfieldBrightnessBindings.push({
      apply: (brightness) => {
        const calibration = deriveVisualCalibration(
          brightness,
          GPU_GALAXY_BASE_OPACITY,
        )
        brightnessUniform.value = calibration.colorIntensity
        material.opacity = calibration.opacity
      },
    })
    this.renderer.compute(computeInit)
    this.starCount += count
  }

  private createCpuGalaxy(count: number): void {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const random = this.createSeededRandom(0x51e2b7)
    const color = new THREE.Color()
    for (let index = 0; index < count; index += 1) {
      const radius = Math.pow(random(), 0.58) * 4_200 + 780
      const arm = (index % 4) * (Math.PI / 2)
      const angle = radius * 0.0034 + arm + (random() - 0.5) * 0.92
      positions[index * 3] = Math.cos(angle) * radius
      positions[index * 3 + 1] = (random() - 0.5) * 260 * (1 - radius / 5_400)
      positions[index * 3 + 2] = Math.sin(angle) * radius
      color.setHSL(0.57 + random() * 0.05, 0.45, 0.68 + random() * 0.26)
      colors[index * 3] = color.r
      colors[index * 3 + 1] = color.g
      colors[index * 3 + 2] = color.b
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const material = new THREE.PointsNodeMaterial({
      size: 0.32,
      vertexColors: true,
      transparent: true,
      opacity: CPU_GALAXY_BASE_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.bindMaterialBrightness(
      this.starfieldBrightnessBindings,
      material,
      CPU_GALAXY_BASE_OPACITY,
      this.displaySettings.starfieldBrightness,
    )
    this.sharedBackgroundRoot.add(new THREE.Points(geometry, material))
    this.starCount += count
  }

  private updateBodies(deltaSeconds: number): void {
    const simulationSeconds =
      ASTERIA_SYSTEM.epochSeconds + this.simulationDays * JULIAN_DAY_SECONDS
    for (const runtime of this.bodyRuntimes.values()) {
      const { definition, orbitNode, mesh, cloudMesh } = runtime
      orbitNode.position.copy(this.renderPositionAtTime(definition, simulationSeconds))

      const rotationRate = (deltaSeconds * this.timeScale * 24) / definition.rotationHours
      mesh.rotation.y += rotationRate * 0.018
      if (cloudMesh) cloudMesh.rotation.y += rotationRate * 0.0125
    }

    if (this.observedSceneState.mode === 'observed-system') {
      for (const runtime of this.observedPlanetRuntimes.values()) {
        const { definition, orbitNode, mesh } = runtime
        if (!definition.staticOrbit && definition.periodDays !== null) {
          const phase = definition.phaseRadians +
            (this.simulationDays / definition.periodDays) * TAU
          orbitNode.position.copy(this.observedPlanetPosition(definition, phase))
        }
        mesh.rotation.y += deltaSeconds * this.timeScale * 0.08
      }
    }

    if (this.observedSceneState.mode === 'asteria') this.updateScaleLod()
  }

  private updateScaleLod(): void {
    const centeredId = this.cameraCenterState.bodyId
    const referenceId = cameraLodReferenceId(centeredId, this.selectedId)
    if (referenceId === null) {
      for (const [id, object] of this.bodyObjects) {
        const visual = this.bodyRuntimes.get(id)?.visualNode ?? object
        const nextScale = THREE.MathUtils.lerp(visual.scale.x, 1, 0.1)
        visual.scale.setScalar(nextScale)
      }
      return
    }
    const referenceObject = this.bodyObjects.get(referenceId)
    if (!referenceObject) return
    const referenceRuntime = this.bodyRuntimes.get(referenceId)
    const selectedRadius = referenceId === STAR.id ? 3.4 : referenceRuntime?.definition.renderRadius ?? 1
    const selectedWorldPosition = referenceObject.getWorldPosition(new THREE.Vector3())
    const distance = this.camera.position.distanceTo(selectedWorldPosition)
    const closeBlend = 1 - THREE.MathUtils.smoothstep(distance, selectedRadius * 7, selectedRadius * 24)

    for (const [id, object] of this.bodyObjects) {
      const targetScale = shouldPreserveBodyScale(id, centeredId, this.selectedId)
        ? 1
        : 1 - closeBlend * 0.78
      const visual = this.bodyRuntimes.get(id)?.visualNode ?? object
      const nextScale = THREE.MathUtils.lerp(visual.scale.x, targetScale, 0.1)
      visual.scale.setScalar(nextScale)
    }
  }

  private updateKeyboardFlight(deltaSeconds: number): void {
    if (this.pressedKeys.size === 0) return
    const direction = new THREE.Vector3()
    this.camera.getWorldDirection(direction)
    const right = new THREE.Vector3().crossVectors(direction, this.camera.up).normalize()
    const up = this.camera.up.clone().normalize()
    const movement = new THREE.Vector3()
    if (this.pressedKeys.has('KeyW')) movement.add(direction)
    if (this.pressedKeys.has('KeyS')) movement.sub(direction)
    if (this.pressedKeys.has('KeyD')) movement.add(right)
    if (this.pressedKeys.has('KeyA')) movement.sub(right)
    if (this.pressedKeys.has('KeyE')) movement.add(up)
    if (this.pressedKeys.has('KeyQ')) movement.sub(up)
    if (movement.lengthSq() === 0) return
    if (this.cameraFlight) this.cancelCameraFlightAtCurrentPose()

    const targetDistance = Math.max(this.camera.position.distanceTo(this.controls.target), 1)
    const boost = this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight') ? 4 : 1
    const distance = this.navigationSpeed * boost * deltaSeconds * Math.max(0.7, targetDistance * 0.16)
    movement.normalize().multiplyScalar(distance)
    this.camera.position.add(movement)
    if (this.cameraCenterState.bodyId === null) this.controls.target.add(movement)
  }

  private updateCameraFlight(now: number): void {
    if (!this.cameraFlight) return
    const flight = this.cameraFlight
    const center = flight.centerObject
      ? flight.centerObject.getWorldPosition(new THREE.Vector3())
      : flight.fixedCenter?.clone() ?? this.centerWorldPositionFor(flight.centerBodyId)
    const progress = flight.durationMs === 0
      ? 1
      : THREE.MathUtils.clamp((now - flight.startedAt) / flight.durationMs, 0, 1)
    const eased = smoothFlightProgress(now - flight.startedAt, flight.durationMs)
    const targetOffset = flight.targetOffset ?? new THREE.Vector3()
    const cameraOffset = flight.cameraOffset ?? flight.approachDirection
      .clone()
      .multiplyScalar(flight.viewDistance)
      .add(new THREE.Vector3(0, flight.viewDistance * 0.16, 0))
    const destinationTarget = center.clone().add(targetOffset)
    const destinationCamera = center.clone().add(cameraOffset)

    this.camera.position.lerpVectors(flight.startCamera, destinationCamera, eased)
    this.controls.target.lerpVectors(flight.startTarget, destinationTarget, eased)
    this.trackedCenter.copy(center)
    if (progress >= 1) this.finishCameraFlight()
  }

  private updateTrackedCenter(): void {
    if (this.cameraFlight) return
    const currentCenter = this.observedTrackedObject
      ? this.observedTrackedObject.getWorldPosition(new THREE.Vector3())
      : this.cameraCenterState.bodyId === null
        ? null
        : this.centerWorldPositionFor(this.cameraCenterState.bodyId)
    if (!currentCenter) return
    const delta = trackingTranslation(this.trackedCenter, currentCenter)
    const translation = new THREE.Vector3(delta.x, delta.y, delta.z)
    this.camera.position.add(translation)
    this.controls.target.add(translation)
    // Reference-frame motion keeps the body centered; it is not user navigation speed.
    this.previousCameraPosition.add(translation)
    this.trackedCenter.copy(currentCenter)
  }

  private finishCameraFlight(): void {
    this.cameraFlight = null
    this.cameraCenterState = completeCameraCentering({
      ...this.cameraCenterState,
      canReturn: this.cameraViewHistory.length > 0,
    })
    this.trackedCenter.copy(
      this.observedTrackedObject?.getWorldPosition(new THREE.Vector3()) ??
        this.currentCenterWorldPosition(),
    )
    if (this.observedSceneState.mode !== 'asteria') {
      this.observedSceneState = { ...this.observedSceneState, transitioning: false }
      this.emitObservedSceneState()
    }
    this.emitCameraCenterState()
  }

  private cancelCameraFlightAtCurrentPose(consumeRestoreTarget = false): void {
    if (!this.cameraFlight) return
    const restoreTarget = this.cameraFlight.restoreTarget
    this.cameraFlight = null
    const recoveredHistory = recoverInterruptedRestoreTarget(
      this.cameraViewHistory,
      restoreTarget,
      consumeRestoreTarget,
      CAMERA_HISTORY_LIMIT,
    )
    this.cameraViewHistory.splice(
      0,
      this.cameraViewHistory.length,
      ...recoveredHistory,
    )
    this.cameraCenterState = interruptCameraCentering(
      this.cameraCenterState,
      this.cameraViewHistory.length > 0,
    )
    if (this.observedSceneState.mode === 'asteria') {
      this.trackedCenter.copy(this.centerWorldPositionFor(null))
    } else {
      this.observedTrackedObject = null
      this.trackedCenter.copy(this.controls.target)
      this.observedSceneState = {
        ...this.observedSceneState,
        centeredObjectId: null,
        centeredViewMode: null,
        transitioning: false,
      }
      this.emitObservedSceneState()
    }
    this.emitCameraCenterState()
  }

  private centerWorldPositionFor(bodyId: string | null): THREE.Vector3 {
    const centerObject = this.bodyObjects.get(bodyId ?? STAR.id)
    return centerObject?.getWorldPosition(new THREE.Vector3()) ?? this.worldRoot.position.clone()
  }

  private currentCenterWorldPosition(): THREE.Vector3 {
    return this.centerWorldPositionFor(this.cameraCenterState.bodyId)
  }

  private emitCameraCenterState(): void {
    this.events.onCameraCenterChange?.(this.getCameraCenterState())
  }

  private prefersReducedMotion(): boolean {
    return this.reducedMotionQuery.matches
  }

  private readonly onReducedMotionChange = (event: MediaQueryListEvent): void => {
    if (event.matches && this.cameraFlight) {
      this.updateCameraFlight(Number.POSITIVE_INFINITY)
    }
  }

  private recenterIfNeeded(): void {
    if (this.camera.position.length() < FLOATING_ORIGIN_THRESHOLD) return
    const shift = this.camera.position.clone()
    this.worldRoot.position.sub(shift)
    this.camera.position.sub(shift)
    this.controls.target.sub(shift)
    this.trackedCenter.sub(shift)
    this.previousCameraPosition.sub(shift)
    if (this.cameraFlight) {
      this.cameraFlight.startCamera.sub(shift)
      this.cameraFlight.startTarget.sub(shift)
      this.cameraFlight.fixedCenter?.sub(shift)
    }
    this.floatingOriginUnits.add(shift)
  }

  private updateTelemetry(now: number, deltaSeconds: number): void {
    this.telemetryFrameCount += 1
    this.telemetryFrameTime += deltaSeconds
    if (now - this.lastTelemetryAt < TELEMETRY_INTERVAL_MS) return

    const fps = this.telemetryFrameTime > 0 ? this.telemetryFrameCount / this.telemetryFrameTime : 0
    this.lastFps = this.lastFps === 0 ? fps : this.lastFps * 0.55 + fps * 0.45
    this.lastTelemetryAt = now
    this.telemetryFrameCount = 0
    this.telemetryFrameTime = 0

    const altitude = this.computeSelectedAltitudeKm()
    const info = this.renderer.info.render
    const originKm: [number, number, number] = [
      this.floatingOriginUnits.x * SYSTEM_UNIT_KM,
      this.floatingOriginUnits.y * SYSTEM_UNIT_KM,
      this.floatingOriginUnits.z * SYSTEM_UNIT_KM,
    ]
    const telemetry: EngineTelemetry = {
      backend: this.backend,
      fps: Math.round(this.lastFps),
      frameTimeMs: this.lastFps > 0 ? 1_000 / this.lastFps : 0,
      drawCalls: info.drawCalls,
      triangles: info.triangles,
      starCount: this.starCount,
      cameraSpeed: this.cameraSpeedMetersPerSecond,
      cameraAltitudeKm: altitude,
      simulationDate: new Date(SIMULATION_EPOCH + this.simulationDays * 86_400_000),
      timeScale: this.timeScale,
      quality: this.quality,
      floatingOriginKm: originKm,
      cameraCenter: this.getCameraCenterState(),
    }
    this.events.onTelemetry?.(telemetry)
  }

  private computeSelectedAltitudeKm(): number | null {
    const centeredId = this.cameraCenterState.bodyId
    if (centeredId === null || centeredId === STAR.id) return null
    const runtime = this.bodyRuntimes.get(centeredId)
    if (!runtime) return null
    const worldPosition = runtime.orbitNode.getWorldPosition(new THREE.Vector3())
    const surfaceDistance = Math.max(this.camera.position.distanceTo(worldPosition) - runtime.definition.renderRadius, 0)
    return (surfaceDistance / runtime.definition.renderRadius) * runtime.definition.radiusKm
  }

  private readCapabilities(adapter: GPUAdapter | null): EngineCapabilities {
    const adapterInfo = adapter?.info
    const adapterName = adapterInfo?.description ?? adapterInfo?.device ?? adapterInfo?.vendor ?? null
    return {
      backend: this.backend,
      webgpuAvailable: (navigator as unknown as NavigatorWithOptionalGpu).gpu !== undefined,
      computeStarfield: this.backend === 'webgpu',
      logarithmicDepth: true,
      maxTextureDimension2D: adapter?.limits?.maxTextureDimension2D ?? null,
      adapterName,
    }
  }

  private createSeededRandom(initialSeed: number): () => number {
    let seed = initialSeed >>> 0
    return () => {
      seed += 0x6d2b79f5
      let value = seed
      value = Math.imul(value ^ (value >>> 15), value | 1)
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
    }
  }

  private bindMaterialBrightness(
    bindings: BrightnessBinding[],
    material: MutableColorOpacityMaterial,
    baseOpacity: number,
    initialBrightness: number,
    calibrationFor?: (brightness: number) => VisualCalibration,
  ): void {
    const baseColor = material.color.clone()
    const binding: BrightnessBinding = {
      apply: (brightness) => {
        const calibration = calibrationFor?.(brightness) ??
          deriveVisualCalibration(brightness, baseOpacity)
        material.color
          .copy(baseColor)
          .multiplyScalar(calibration.colorIntensity)
        material.opacity = calibration.opacity
      },
    }
    bindings.push(binding)
    binding.apply(initialBrightness)
  }

  private readonly resize = (): void => {
    const width = Math.max(this.host.clientWidth, 1)
    const height = Math.max(this.host.clientHeight, 1)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    const multiplier = this.quality === 'ultra' ? 1.35 : this.quality === 'battery' ? 0.72 : 1
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * multiplier)
    this.renderer.setSize(width, height, false)
  }

  private resetCameraForScene(position: THREE.Vector3, targetBodyId?: string): void {
    this.cameraFlight = null
    this.cameraViewHistory.length = 0
    this.cameraCenterState = {
      mode: 'system',
      bodyId: null,
      transitioning: false,
      canReturn: false,
    }
    this.camera.position.copy(position)
    const originShift = this.worldRoot.position.clone()
    this.worldRoot.position.set(0, 0, 0)
    this.floatingOriginUnits.sub(originShift)
    this.controls.target.set(0, 0, 0)
    this.controls.minDistance = 1.4
    this.controls.maxDistance = 3_000
    this.controls.update()
    this.trackedCenter.set(0, 0, 0)
    this.observedTrackedObject = null
    this.previousCameraPosition.copy(position)
    if (targetBodyId) this.selectedId = targetBodyId
    this.emitCameraCenterState()
  }

  private replaceObservedRoot(
    nextRoot: THREE.Group,
    nextBindings: {
      readonly orbit?: readonly BrightnessBinding[]
      readonly starfield?: readonly BrightnessBinding[]
    } = {},
  ): void {
    const previous = this.observedRoot
    this.observedRoot = nextRoot
    this.worldRoot.add(nextRoot)
    if (previous) {
      this.worldRoot.remove(previous)
      this.disposeSceneBranch(previous)
    }
    this.observedOrbitBrightnessBindings.splice(
      0,
      this.observedOrbitBrightnessBindings.length,
      ...(nextBindings.orbit ?? []),
    )
    this.observedStarfieldBrightnessBindings.splice(
      0,
      this.observedStarfieldBrightnessBindings.length,
      ...(nextBindings.starfield ?? []),
    )
  }

  private clearObservedScene(): void {
    if (this.observedRoot) {
      this.worldRoot.remove(this.observedRoot)
      this.disposeSceneBranch(this.observedRoot)
      this.observedRoot = null
    }
    this.observedHostCloud = null
    this.observedRaycastTarget = null
    this.observedHostPoints.clear()
    this.observedPlanetRuntimes.clear()
    this.observedSystemStarId = null
    this.observedTrackedObject = null
    this.observedOrbitBrightnessBindings.length = 0
    this.observedStarfieldBrightnessBindings.length = 0
  }

  private disposeSceneBranch(root: THREE.Object3D): void {
    root.traverse((object) => {
      const renderable = object as THREE.Mesh
      renderable.geometry?.dispose?.()
      const material = renderable.material
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
      else material?.dispose?.()
    })
    root.clear()
  }

  private emitObservedSceneState(): void {
    this.events.onObservedSceneChange?.(this.getObservedSceneState())
  }

  private emitObservedSelection(selection: ObservedSelection): void {
    this.events.onObservedSelection?.(selection)
  }

  private selectObservedHost(point: ObservedHostPoint, openHost: boolean): void {
    this.observedSceneState = {
      ...this.observedSceneState,
      selectedObjectId: point.id,
      selectedHost: point.host,
    }
    this.emitObservedSelection({
      kind: 'host',
      id: point.id,
      host: point.host,
      distancePc: point.distancePc,
      raDeg: point.raDeg,
      decDeg: point.decDeg,
      skyOnly: point.skyOnly,
      spectralType: point.spectralType,
      planetCount: point.planetCount,
      starCount: point.starCount,
      gaiaDr3: point.gaiaDr3,
    })
    this.emitObservedSceneState()
    if (openHost && observedHostCanOpen(point)) this.events.onObservedHostOpen?.(point.host)
  }

  private findObservedSystemObject(id: string): THREE.Mesh | null {
    if (!this.observedRoot) return null
    if (id === this.observedSystemStarId) {
      return this.observedRoot.children.find(
        (child) => child.userData.observedObjectId === id,
      ) as THREE.Mesh | undefined ?? null
    }
    return this.observedPlanetRuntimes.get(id)?.mesh ?? null
  }

  private intersectObservedScene(): THREE.Intersection | null {
    if (this.observedSceneState.mode === 'observed-universe' && this.observedRaycastTarget) {
      const height = Math.max(this.renderer.domElement.clientHeight, 1)
      const targetDistance = Math.max(this.camera.position.distanceTo(this.controls.target), 1)
      const worldPerPixel =
        2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * targetDistance / height
      this.raycaster.params.Points = { threshold: Math.max(0.12, worldPerPixel * 6) }
      return this.raycaster.intersectObject(this.observedRaycastTarget, false)[0] ?? null
    }
    if (this.observedSceneState.mode !== 'observed-system' || !this.observedRoot) return null
    const targets: THREE.Object3D[] = []
    const star = this.observedSystemStarId
      ? this.findObservedSystemObject(this.observedSystemStarId)
      : null
    if (star) targets.push(star)
    for (const runtime of this.observedPlanetRuntimes.values()) targets.push(runtime.mesh)
    return this.raycaster.intersectObjects(targets, false)[0] ?? null
  }

  private handleObservedIntersection(
    intersection: THREE.Intersection,
    openOrCenter: boolean,
  ): void {
    if (this.observedSceneState.mode === 'observed-universe') {
      const hostIds = this.observedHostCloud?.userData.observedHostIds as readonly string[] | undefined
      const id = hostIds?.[intersection.index ?? -1]
      const point = id ? this.observedHostPoints.get(id) : undefined
      if (point) {
        if (openOrCenter && !observedHostCanOpen(point)) this.focusObservedHost(point.host)
        else this.selectObservedHost(point, openOrCenter)
      }
      return
    }
    const object = intersection.object
    const id = object.userData.observedObjectId as string | undefined
    const kind = object.userData.observedKind as 'star' | 'planet' | undefined
    const sourceId = object.userData.observedSourceId as string | undefined
    const host = object.userData.observedHost as string | undefined
    if (!id || !kind || !sourceId || !host) return
    const name = object.name || host
    const assumptionCount = Number(object.userData.observedAssumptionCount ?? 0)
    this.observedSceneState = {
      ...this.observedSceneState,
      selectedObjectId: id,
      selectedHost: host,
    }
    this.emitObservedSelection({
      kind,
      id,
      sourceId,
      host,
      name,
      observed: true,
      illustrativeAssumptionCount: assumptionCount,
    })
    this.emitObservedSceneState()
    if (openOrCenter) this.centerOnObservedObject(id)
  }

  private observedPlanetPosition(
    planet: ObservedPlanetRenderModel,
    anomaly: number,
  ): THREE.Vector3 {
    const semiMajor = planet.orbitRadius
    const semiMinor = semiMajor * Math.sqrt(1 - planet.eccentricity ** 2)
    const eccentricOffset = semiMajor * planet.eccentricity
    return new THREE.Vector3(
      Math.cos(anomaly) * semiMajor - eccentricOffset,
      0,
      Math.sin(anomaly) * semiMinor,
    )
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), planet.periapsisRadians)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), planet.inclinationRadians)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), planet.ascendingNodeRadians)
  }

  private observedSpectralColor(spectralType: string | null): string {
    const spectralClass = spectralType?.trim().charAt(0).toUpperCase()
    return ({
      O: '#8eb5ff', B: '#a8c7ff', A: '#d5e0ff', F: '#f4f3ff',
      G: '#fff0b7', K: '#ffc48f', M: '#ff9b78',
    } as Record<string, string>)[spectralClass ?? ''] ?? '#a9ddd8'
  }

  private observedTemperatureColor(temperatureKelvin: number | null): string {
    if (temperatureKelvin === null) return '#ffe0ad'
    if (temperatureKelvin >= 10_000) return '#a8c7ff'
    if (temperatureKelvin >= 7_500) return '#d5e0ff'
    if (temperatureKelvin >= 6_000) return '#f4f3ff'
    if (temperatureKelvin >= 5_200) return '#fff0b7'
    if (temperatureKelvin >= 3_700) return '#ffc48f'
    return '#ff9b78'
  }

  private observedPlanetColor(radiusEarth: number | null): string {
    if (radiusEarth === null) return '#8ca9b8'
    if (radiusEarth < 1.6) return '#83b6b0'
    if (radiusEarth < 4) return '#7fa7c3'
    if (radiusEarth < 10) return '#9b91c8'
    return '#c19b73'
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    const bounds = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const observed = this.intersectObservedScene()
    if (observed) {
      this.handleObservedIntersection(observed, false)
      return
    }
    if (this.observedSceneState.mode !== 'asteria') return
    const intersection = this.raycaster.intersectObjects(this.raycastTargets, false)[0]
    const bodyId = intersection?.object.userData.bodyId as string | undefined
    if (bodyId) this.select(bodyId)
  }

  private readonly onDoubleClick = (event: MouseEvent): void => {
    const bounds = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const observed = this.intersectObservedScene()
    if (observed) {
      this.handleObservedIntersection(observed, true)
      return
    }
    if (this.observedSceneState.mode !== 'asteria') return
    const intersection = this.raycaster.intersectObjects(this.raycastTargets, false)[0]
    const bodyId = intersection?.object.userData.bodyId as string | undefined
    if (bodyId) this.focusOn(bodyId)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target
    if (
      target instanceof HTMLElement &&
      target.closest(
        'input, textarea, select, button, a[href], [role="button"], [role="dialog"], [contenteditable="true"]',
      )
    ) {
      return
    }
    const isOverviewCommand = event.code === 'Digit0' || event.code === 'Numpad0'
    const isNavigationCommand =
      event.code === 'KeyG' ||
      event.code === 'Backspace' ||
      event.code === 'Space' ||
      isOverviewCommand
    if (event.repeat && isNavigationCommand) {
      if (
        event.code === 'Backspace' ||
        event.code === 'Space' ||
        isOverviewCommand
      ) event.preventDefault()
      return
    }
    if (event.code === 'Backspace') {
      event.preventDefault()
      const command = observedNavigationCommand(event.code, {
        mode: this.observedSceneState.mode,
        selectedObservedId: this.observedSceneState.selectedObjectId,
      })
      if (command.type === 'asteria-history') this.returnToPreviousView()
      return
    }
    if (isOverviewCommand) {
      event.preventDefault()
      this.showSystemOverview()
      return
    }
    if (event.code === 'KeyG') {
      const command = observedNavigationCommand(event.code, {
        mode: this.observedSceneState.mode,
        selectedObservedId: this.observedSceneState.selectedObjectId,
        closeRequested: event.shiftKey,
      })
      if (command.type === 'observed-center') this.centerOnObservedObject(command.id, command.mode)
      else if (command.type === 'asteria-center' && this.selectedId !== null) {
        this.centerOnBody(this.selectedId, command.mode)
      }
      return
    }
    if (event.code === 'Space') {
      event.preventDefault()
      this.setTimeScale(this.timeScale === 0 ? 1 : 0)
      return
    }
    if (isCameraFlightInputCode(event.code)) this.pressedKeys.add(event.code)
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.code)
  }

  private readonly clearPressedKeys = (): void => {
    this.pressedKeys.clear()
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') this.clearPressedKeys()
  }

  private readonly cancelCameraFlight = (): void => {
    this.cancelCameraFlightAtCurrentPose()
  }

  private bindInput(): void {
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('dblclick', this.onDoubleClick)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.clearPressedKeys)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  private unbindInput(): void {
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('dblclick', this.onDoubleClick)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.clearPressedKeys)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
  }
}
