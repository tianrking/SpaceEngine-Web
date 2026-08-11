import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  Fn,
  float,
  hash,
  instanceIndex,
  instancedArray,
  shapeCircle,
  vec3,
} from 'three/tsl'
import { BODY_LOOKUP, RENDER_BODIES, STAR, type RenderBody } from './catalog'
import {
  createCloudTexture,
  createPlanetTexture,
  createRadialGlowTexture,
  createRingTexture,
} from './proceduralTextures'
import type {
  CelestialBodyView,
  CosmosEngineEvents,
  EngineCapabilities,
  EngineTelemetry,
  QualityLevel,
  RendererBackend,
} from './types'

const TAU = Math.PI * 2
const SYSTEM_UNIT_KM = 1_000_000
const FLOATING_ORIGIN_THRESHOLD = 4_000
const TELEMETRY_INTERVAL_MS = 400
const SIMULATION_EPOCH = Date.UTC(2187, 2, 20, 14, 32, 0)

interface BodyRuntime {
  definition: RenderBody
  group: THREE.Group
  mesh: THREE.Mesh
  cloudMesh: THREE.Mesh | null
}

interface CameraFlight {
  targetId: string
  startedAt: number
  durationMs: number
  startCamera: THREE.Vector3
  startTarget: THREE.Vector3
  viewDistance: number
}

interface NavigatorWithOptionalGpu {
  gpu?: GPU
}

export class CosmosEngine {
  private readonly host: HTMLElement
  private readonly events: CosmosEngineEvents
  private readonly scene = new THREE.Scene()
  private readonly worldRoot = new THREE.Group()
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.001, 100_000)
  private readonly renderer: THREE.WebGPURenderer
  private readonly controls: OrbitControls
  private readonly timer = new THREE.Timer()
  private readonly bodyRuntimes = new Map<string, BodyRuntime>()
  private readonly bodyObjects = new Map<string, THREE.Object3D>()
  private readonly raycastTargets: THREE.Object3D[] = []
  private readonly disposableTextures: THREE.Texture[] = []
  private readonly pressedKeys = new Set<string>()
  private readonly floatingOriginUnits = new THREE.Vector3()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly resizeObserver: ResizeObserver
  private readonly previousCameraPosition = new THREE.Vector3()

  private backend: RendererBackend = 'webgl2'
  private quality: QualityLevel = 'balanced'
  private simulationDays = 0
  private timeScale = 1
  private navigationSpeed = 1
  private selectedId = 'pelagos'
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
    this.scene.background = new THREE.Color('#010207')
    this.scene.add(this.worldRoot)

    const forceWebGL = new URLSearchParams(window.location.search).get('renderer') === 'webgl2'
    this.renderer = new THREE.WebGPURenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
      alpha: false,
      forceWebGL,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.setClearColor(0x010207, 1)
    this.renderer.domElement.className = 'cosmos-canvas'
    this.renderer.domElement.setAttribute('aria-label', 'Interactive procedural universe viewport')
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
    return [STAR, ...RENDER_BODIES]
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

  focusOn(id: string, surface = false): void {
    const body = BODY_LOOKUP.get(id)
    const target = this.bodyObjects.get(id)
    if (!body || !target) return

    this.select(id)
    const renderRadius = id === STAR.id ? 3.4 : this.bodyRuntimes.get(id)?.definition.renderRadius ?? 1
    this.cameraFlight = {
      targetId: id,
      startedAt: performance.now(),
      durationMs: surface ? 2_800 : 1_900,
      startCamera: this.camera.position.clone(),
      startTarget: this.controls.target.clone(),
      viewDistance: renderRadius * (surface ? 1.18 : id === STAR.id ? 4.4 : 4.2),
    }
  }

  resetView(): void {
    this.cameraFlight = null
    this.camera.position.set(42, 28, 74)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
    this.select('pelagos')
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    void this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.unbindInput()
    this.controls.removeEventListener('start', this.cancelCameraFlight)
    this.controls.dispose()
    this.timer.dispose()

    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      mesh.geometry?.dispose?.()
      const material = mesh.material
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
      else material?.dispose?.()
    })
    this.disposableTextures.forEach((texture) => texture.dispose())
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private readonly animate = (now: number): void => {
    if (this.disposed || !this.initialized) return
    this.timer.update(now)
    const deltaSeconds = Math.min(this.timer.getDelta(), 0.05)
    this.simulationDays += deltaSeconds * this.timeScale * 0.12

    this.updateBodies(deltaSeconds)
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
    this.worldRoot.add(ambient)

    const stellarLight = new THREE.PointLight(0xffd5a0, 1800, 0, 1.5)
    stellarLight.position.set(0, 0, 0)
    stellarLight.castShadow = false
    this.worldRoot.add(stellarLight)
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

    const glowTexture = createRadialGlowTexture()
    this.disposableTextures.push(glowTexture)
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
    this.worldRoot.add(starGroup)
    this.bodyObjects.set(STAR.id, starGroup)

    for (const body of RENDER_BODIES) {
      this.createPlanet(body)
      this.createOrbit(body)
    }
  }

  private createPlanet(body: RenderBody): void {
    const group = new THREE.Group()
    group.name = body.name
    group.userData.bodyId = body.id

    const geometry = new THREE.SphereGeometry(body.renderRadius, 96, 64)
    if (body.kind !== 'gas-giant' && body.kind !== 'ice-giant') {
      this.displaceRockySurface(geometry, body)
    }

    const texture = createPlanetTexture(
      body.id,
      body.palette,
      body.kind === 'gas-giant' || body.kind === 'ice-giant',
    )
    this.disposableTextures.push(texture)
    const material = new THREE.MeshStandardNodeMaterial({
      map: texture,
      roughness: body.kind === 'oceanic' ? 0.72 : 0.91,
      metalness: 0.015,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.bodyId = body.id
    mesh.rotation.z = body.inclination * 0.42
    group.add(mesh)
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
      group.add(cloudMesh)
    }

    const atmosphereMaterial = new THREE.MeshBasicNodeMaterial({
      color: body.accent,
      transparent: true,
      opacity: body.kind === 'desert' ? 0.055 : 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    })
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(body.renderRadius * 1.075, 64, 40),
      atmosphereMaterial,
    )
    group.add(atmosphere)

    if (body.hasRings) this.createRings(group, body)

    this.worldRoot.add(group)
    this.bodyObjects.set(body.id, group)
    this.bodyRuntimes.set(body.id, { definition: body, group, mesh, cloudMesh })
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
      vector.multiplyScalar(body.renderRadius * (1 + ridge * 0.008))
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
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const innerRadius = body.renderRadius * 1.32
    const outerRadius = body.renderRadius * 2.15
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 192, 8)
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    const uvs = geometry.getAttribute('uv') as THREE.BufferAttribute
    for (let index = 0; index < positions.count; index += 1) {
      const radius = Math.hypot(positions.getX(index), positions.getY(index))
      uvs.setXY(index, (radius - innerRadius) / (outerRadius - innerRadius), 0.5)
    }
    uvs.needsUpdate = true
    const rings = new THREE.Mesh(geometry, material)
    rings.rotation.x = Math.PI / 2
    rings.rotation.z = body.inclination * 1.7 + 0.08
    group.add(rings)
  }

  private createOrbit(body: RenderBody): void {
    const points: THREE.Vector3[] = []
    const semiMinor = body.orbitRadius * Math.sqrt(1 - body.eccentricity ** 2)
    for (let index = 0; index <= 256; index += 1) {
      const eccentricAnomaly = (index / 256) * TAU
      const x = body.orbitRadius * (Math.cos(eccentricAnomaly) - body.eccentricity)
      const z = semiMinor * Math.sin(eccentricAnomaly)
      points.push(new THREE.Vector3(x, z * Math.sin(body.inclination), z * Math.cos(body.inclination)))
    }
    const material = new THREE.LineBasicNodeMaterial({
      color: body.color,
      transparent: true,
      opacity: 0.15,
    })
    const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material)
    orbit.name = `${body.name} orbit`
    this.worldRoot.add(orbit)
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
      opacity: 0.88,
      depthWrite: false,
    })
    this.worldRoot.add(new THREE.Points(geometry, material))
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

    const material = new THREE.SpriteNodeMaterial()
    material.colorNode = colors.element(instanceIndex)
    material.positionNode = positions.toAttribute()
    material.scaleNode = hash(instanceIndex.add(23)).mul(0.34).add(0.12)
    material.opacityNode = shapeCircle()
    material.transparent = true
    material.depthWrite = false
    material.blending = THREE.AdditiveBlending
    material.toneMapped = false

    const galaxy = new THREE.Sprite(material)
    galaxy.count = count
    galaxy.frustumCulled = false
    galaxy.name = 'WebGPU compute galaxy'
    galaxy.rotation.x = -0.16
    this.worldRoot.add(galaxy)
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
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.worldRoot.add(new THREE.Points(geometry, material))
    this.starCount += count
  }

  private updateBodies(deltaSeconds: number): void {
    for (const runtime of this.bodyRuntimes.values()) {
      const { definition, group, mesh, cloudMesh } = runtime
      const meanAnomaly = definition.phase + (this.simulationDays / definition.orbitalPeriodDays) * TAU
      const eccentricAnomaly = this.solveEccentricAnomaly(meanAnomaly, definition.eccentricity)
      const x = definition.orbitRadius * (Math.cos(eccentricAnomaly) - definition.eccentricity)
      const z =
        definition.orbitRadius *
        Math.sqrt(1 - definition.eccentricity ** 2) *
        Math.sin(eccentricAnomaly)
      group.position.set(x, z * Math.sin(definition.inclination), z * Math.cos(definition.inclination))

      const rotationRate = (deltaSeconds * this.timeScale * 24) / definition.rotationHours
      mesh.rotation.y += rotationRate * 0.018
      if (cloudMesh) cloudMesh.rotation.y += rotationRate * 0.0125
    }

    this.updateScaleLod()
  }

  private updateScaleLod(): void {
    const selectedObject = this.bodyObjects.get(this.selectedId)
    if (!selectedObject) return
    const selectedRuntime = this.bodyRuntimes.get(this.selectedId)
    const selectedRadius = this.selectedId === STAR.id ? 3.4 : selectedRuntime?.definition.renderRadius ?? 1
    const selectedWorldPosition = selectedObject.position.clone().add(this.worldRoot.position)
    const distance = this.camera.position.distanceTo(selectedWorldPosition)
    const closeBlend = 1 - THREE.MathUtils.smoothstep(distance, selectedRadius * 7, selectedRadius * 24)

    for (const [id, object] of this.bodyObjects) {
      const targetScale = id === this.selectedId ? 1 : 1 - closeBlend * 0.78
      const nextScale = THREE.MathUtils.lerp(object.scale.x, targetScale, 0.1)
      object.scale.setScalar(nextScale)
    }
  }

  private updateKeyboardFlight(deltaSeconds: number): void {
    if (this.cameraFlight || this.pressedKeys.size === 0) return
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

    const targetDistance = Math.max(this.camera.position.distanceTo(this.controls.target), 1)
    const boost = this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight') ? 4 : 1
    const distance = this.navigationSpeed * boost * deltaSeconds * Math.max(0.7, targetDistance * 0.16)
    movement.normalize().multiplyScalar(distance)
    this.camera.position.add(movement)
    this.controls.target.add(movement)
  }

  private updateCameraFlight(now: number): void {
    if (!this.cameraFlight) return
    const flight = this.cameraFlight
    const targetObject = this.bodyObjects.get(flight.targetId)
    if (!targetObject) {
      this.cameraFlight = null
      return
    }

    const target = targetObject.getWorldPosition(new THREE.Vector3())
    const progress = THREE.MathUtils.clamp((now - flight.startedAt) / flight.durationMs, 0, 1)
    const eased = progress * progress * (3 - 2 * progress)
    const approachDirection = flight.startCamera.clone().sub(flight.startTarget).normalize()
    if (approachDirection.lengthSq() < 0.1) approachDirection.set(1, 0.45, 1).normalize()
    const destination = target
      .clone()
      .add(approachDirection.multiplyScalar(flight.viewDistance))
      .add(new THREE.Vector3(0, flight.viewDistance * 0.16, 0))

    this.camera.position.lerpVectors(flight.startCamera, destination, eased)
    this.controls.target.lerpVectors(flight.startTarget, target, eased)
    if (progress >= 1) this.cameraFlight = null
  }

  private recenterIfNeeded(): void {
    if (this.camera.position.length() < FLOATING_ORIGIN_THRESHOLD) return
    const shift = this.camera.position.clone()
    this.worldRoot.position.sub(shift)
    this.camera.position.sub(shift)
    this.controls.target.sub(shift)
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
      drawCalls: info.calls,
      triangles: info.triangles,
      starCount: this.starCount,
      cameraSpeed: this.cameraSpeedMetersPerSecond,
      cameraAltitudeKm: altitude,
      simulationDate: new Date(SIMULATION_EPOCH + this.simulationDays * 86_400_000),
      timeScale: this.timeScale,
      quality: this.quality,
      floatingOriginKm: originKm,
    }
    this.events.onTelemetry?.(telemetry)
  }

  private computeSelectedAltitudeKm(): number | null {
    if (this.selectedId === STAR.id) return null
    const runtime = this.bodyRuntimes.get(this.selectedId)
    if (!runtime) return null
    const worldPosition = runtime.group.getWorldPosition(new THREE.Vector3())
    const surfaceDistance = Math.max(this.camera.position.distanceTo(worldPosition) - runtime.definition.renderRadius, 0)
    return (surfaceDistance / runtime.definition.renderRadius) * runtime.definition.radiusKm
  }

  private solveEccentricAnomaly(meanAnomaly: number, eccentricity: number): number {
    let estimate = meanAnomaly % TAU
    for (let iteration = 0; iteration < 6; iteration += 1) {
      estimate -=
        (estimate - eccentricity * Math.sin(estimate) - meanAnomaly) /
        (1 - eccentricity * Math.cos(estimate))
    }
    return estimate
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

  private readonly resize = (): void => {
    const width = Math.max(this.host.clientWidth, 1)
    const height = Math.max(this.host.clientHeight, 1)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    const multiplier = this.quality === 'ultra' ? 1.35 : this.quality === 'battery' ? 0.72 : 1
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * multiplier)
    this.renderer.setSize(width, height, false)
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    const bounds = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
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
    this.pressedKeys.add(event.code)
    if (event.code === 'KeyG') this.focusOn(this.selectedId)
    if (event.code === 'Space') {
      event.preventDefault()
      this.setTimeScale(this.timeScale === 0 ? 1 : 0)
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.code)
  }

  private readonly cancelCameraFlight = (): void => {
    this.cameraFlight = null
  }

  private bindInput(): void {
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('dblclick', this.onDoubleClick)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  private unbindInput(): void {
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('dblclick', this.onDoubleClick)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }
}
