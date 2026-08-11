import * as THREE from 'three/webgpu'
import { createNoise3D } from 'simplex-noise'

type Rng = () => number

function seedToUint(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(initialSeed: number): Rng {
  let seed = initialSeed >>> 0
  return () => {
    seed += 0x6d2b79f5
    let value = seed
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function fractalNoise(
  noise: ReturnType<typeof createNoise3D>,
  x: number,
  y: number,
  z: number,
  octaves = 5,
): number {
  let amplitude = 0.55
  let frequency = 1
  let sum = 0
  let normalization = 0

  for (let octave = 0; octave < octaves; octave += 1) {
    sum += noise(x * frequency, y * frequency, z * frequency) * amplitude
    normalization += amplitude
    frequency *= 2.03
    amplitude *= 0.5
  }

  return sum / normalization
}

function writeColor(
  data: Uint8Array,
  offset: number,
  color: THREE.Color,
  alpha = 1,
): void {
  data[offset] = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255)
  data[offset + 1] = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255)
  data[offset + 2] = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255)
  data[offset + 3] = Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255)
}

export function createPlanetTexture(
  seed: string,
  palette: readonly [string, string, string, string],
  gasGiant: boolean,
  width = 512,
  height = 256,
): THREE.DataTexture {
  const noise = createNoise3D(mulberry32(seedToUint(seed)))
  const data = new Uint8Array(width * height * 4)
  const colors = palette.map((value) => new THREE.Color(value))
  const color = new THREE.Color()

  for (let pixelY = 0; pixelY < height; pixelY += 1) {
    const v = pixelY / (height - 1)
    const latitude = (v - 0.5) * Math.PI
    const cosLatitude = Math.cos(latitude)

    for (let pixelX = 0; pixelX < width; pixelX += 1) {
      const u = pixelX / (width - 1)
      const longitude = u * Math.PI * 2
      const x = cosLatitude * Math.cos(longitude)
      const y = Math.sin(latitude)
      const z = cosLatitude * Math.sin(longitude)
      const baseNoise = fractalNoise(noise, x * 1.8, y * 1.8, z * 1.8)

      if (gasGiant) {
        const fineBands = Math.sin(latitude * 43 + baseNoise * 3.2) * 0.5 + 0.5
        const broadBands = Math.sin(latitude * 12 - baseNoise * 1.5) * 0.5 + 0.5
        const storm = noise(x * 4 + 9, y * 10, z * 4 - 3) * 0.12
        const band = THREE.MathUtils.clamp(fineBands * 0.45 + broadBands * 0.55 + storm, 0, 1)
        const colorIndex = Math.min(2, Math.floor(band * 3))
        color.copy(colors[colorIndex]).lerp(colors[colorIndex + 1], (band * 3) % 1)
      } else {
        const ridge = 1 - Math.abs(baseNoise)
        const polar = Math.pow(Math.abs(y), 6)
        const elevation = THREE.MathUtils.clamp(baseNoise * 0.7 + ridge * 0.25 + 0.42, 0, 1)
        const colorIndex = Math.min(2, Math.floor(elevation * 3))
        color.copy(colors[colorIndex]).lerp(colors[colorIndex + 1], (elevation * 3) % 1)
        color.lerp(new THREE.Color('#d8e5e7'), polar * 0.68)
      }

      const lightVariation = 0.86 + noise(x * 18, y * 18, z * 18) * 0.1
      color.multiplyScalar(lightVariation)
      writeColor(data, (pixelY * width + pixelX) * 4, color)
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  texture.name = `procedural-planet-${seed}`
  return texture
}

export function createCloudTexture(seed: string, width = 256, height = 128): THREE.DataTexture {
  const noise = createNoise3D(mulberry32(seedToUint(`${seed}:clouds`)))
  const data = new Uint8Array(width * height * 4)

  for (let pixelY = 0; pixelY < height; pixelY += 1) {
    const latitude = (pixelY / (height - 1) - 0.5) * Math.PI
    const cosLatitude = Math.cos(latitude)
    for (let pixelX = 0; pixelX < width; pixelX += 1) {
      const longitude = (pixelX / (width - 1)) * Math.PI * 2
      const x = cosLatitude * Math.cos(longitude)
      const y = Math.sin(latitude)
      const z = cosLatitude * Math.sin(longitude)
      const density = THREE.MathUtils.smoothstep(
        fractalNoise(noise, x * 2.8, y * 2.8, z * 2.8, 4),
        0.08,
        0.5,
      )
      const offset = (pixelY * width + pixelX) * 4
      data[offset] = 232
      data[offset + 1] = 244
      data[offset + 2] = 249
      data[offset + 3] = Math.round(density * 150)
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  texture.name = `procedural-clouds-${seed}`
  return texture
}

export function createRingTexture(colorValue: string, width = 512): THREE.DataTexture {
  const color = new THREE.Color(colorValue)
  const data = new Uint8Array(width * 4)
  for (let pixelX = 0; pixelX < width; pixelX += 1) {
    const radius = pixelX / (width - 1)
    const bands = Math.sin(radius * 210) * 0.18 + Math.sin(radius * 73) * 0.12
    const gap = Math.sin(radius * 29) > 0.92 ? 0.08 : 1
    const alpha = THREE.MathUtils.clamp((0.36 + bands) * gap, 0.03, 0.72)
    writeColor(data, pixelX * 4, color.clone().multiplyScalar(0.75 + radius * 0.25), alpha)
  }

  const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  texture.name = `procedural-rings-${colorValue}`
  return texture
}

export function createRadialGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create a 2D canvas for the stellar glow texture.')
  }

  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.08, 'rgba(255,226,173,0.95)')
  gradient.addColorStop(0.28, 'rgba(255,145,72,0.38)')
  gradient.addColorStop(0.62, 'rgba(255,74,38,0.08)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  texture.name = 'procedural-stellar-glow'
  return texture
}
