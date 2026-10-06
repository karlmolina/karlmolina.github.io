import {
  Fn,
  hash,
  If,
  instancedArray,
  instanceIndex,
  length,
  mix,
  mx_noise_float,
  smoothstep,
  storage,
  uint,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl'
import {
  Color,
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Sprite,
  SpriteNodeMaterial,
  StorageInstancedBufferAttribute,
  WebGPURenderer,
} from 'three/webgpu'

import type { Control } from '../lib/config-menu.ts'

// buffers are sized for MAX_COUNT; the slider picks how many are active
const MAX_COUNT = 100_000
const COUNT = 20_000
// pixels per height-buffer cell
const CELL = 2
// distance in pixels between the two samples used to measure the slope
const SLOPE_STEP = 2
// the deepest erosion can carve, in height units (the terrain spans 0-1)
const MAX_EROSION = 0.4

export interface RainConfig {
  dots: number
  dotSize: number
  // downhill acceleration per unit of slope
  gravity: number
  friction: number
  // seconds a drop keeps rolling after landing before it respawns
  lifetime: number
  // seconds a drop's trail takes to fade
  trail: number
  // how fast drops carve the ground (height per second of rain), 0 = off
  erosion: number
  // how bright the terrain is under the drops, 0-1
  terrain: number
  // drop and trail color, hue in degrees
  hue: number
  // 0 = gray, 1 = vivid
  saturation: number
  // how fast the noise moves through its third axis, 0 = static
  drift: number
  // height buffer generation (rebuilds the sketch)
  noiseScale: number
  octaves: number
  seed: number
}

export const defaultRainConfig = (): RainConfig => ({
  dots: COUNT,
  dotSize: 2,
  gravity: 40000,
  friction: 1.5,
  lifetime: 6,
  trail: 2,
  erosion: 0.03,
  terrain: 0,
  hue: 205,
  saturation: 0.8,
  drift: 0.1,
  noiseScale: 220,
  octaves: 4,
  seed: 1,
})

export const rainControls: Control<RainConfig>[] = [
  {
    type: 'range',
    key: 'dots',
    label: 'drops',
    min: 500,
    max: MAX_COUNT,
    step: 500,
    help: 'How many rain drops are alive at once.',
  },
  {
    type: 'range',
    key: 'dotSize',
    label: 'drop size',
    min: 1,
    max: 8,
    step: 0.5,
    help: 'Size of each drop in pixels.',
  },
  {
    type: 'range',
    key: 'gravity',
    label: 'gravity',
    min: 5000,
    max: 200000,
    step: 5000,
    help: 'How hard a landed drop is pulled toward the darker, lower ground.',
  },
  {
    type: 'range',
    key: 'friction',
    label: 'friction',
    min: 0,
    max: 8,
    step: 0.1,
    help: 'How quickly a rolling drop loses speed. Low values make drops overshoot and swirl around the valleys.',
  },
  {
    type: 'range',
    key: 'lifetime',
    label: 'lifetime',
    min: 0.5,
    max: 20,
    step: 0.5,
    help: 'Seconds a drop keeps rolling after it lands before it reappears somewhere else.',
  },
  {
    type: 'range',
    key: 'erosion',
    label: 'erosion',
    min: 0,
    max: 0.2,
    step: 0.005,
    help: 'How fast drops carve the ground they roll over. Carved paths get lower, so later drops are pulled into them and form channels. 0 turns it off.',
  },
  {
    type: 'range',
    key: 'trail',
    label: 'trail',
    min: 0,
    max: 10,
    step: 0.25,
    help: 'Seconds the wet path behind each drop takes to fade. 0 hides trails.',
  },
  {
    type: 'range',
    key: 'hue',
    label: 'drop hue',
    min: 0,
    max: 360,
    step: 5,
    help: 'Color of the drops and the wet trails they leave, as a hue in degrees (0 red, 120 green, 240 blue).',
  },
  {
    type: 'range',
    key: 'saturation',
    label: 'saturation',
    min: 0,
    max: 1,
    step: 0.05,
    help: 'How vivid the drop color is. 0 makes white drops.',
  },
  {
    type: 'range',
    key: 'terrain',
    label: 'terrain',
    min: 0,
    max: 1,
    step: 0.05,
    help: 'Brightness of the height map. Dark is low, light is high.',
  },
  {
    type: 'range',
    key: 'drift',
    label: 'drift',
    min: 0,
    max: 1,
    step: 0.01,
    help: 'How fast the terrain morphs over time. 0 keeps it still. Carved erosion channels stay where they are while the ground shifts under them.',
  },
  {
    type: 'range',
    key: 'noiseScale',
    label: 'noise scale',
    min: 40,
    max: 800,
    step: 10,
    rebuild: true,
    help: 'Size of the hills in pixels. Small values make a bumpy surface with many pools.',
  },
  {
    type: 'range',
    key: 'octaves',
    label: 'octaves',
    min: 1,
    max: 6,
    step: 1,
    rebuild: true,
    help: 'Layers of finer detail added on top of the big hills.',
  },
  {
    type: 'range',
    key: 'seed',
    label: 'seed',
    min: 0,
    max: 100,
    step: 1,
    rebuild: true,
    help: 'Picks a different random terrain.',
  },
]

export default async (config: RainConfig) => {
  const parent = document.body
  if (!('gpu' in navigator)) {
    parent.textContent = 'WebGPU not supported in this browser'
    return { destroy: () => parent.replaceChildren() }
  }
  const width = window.innerWidth
  const height = window.innerHeight

  const renderer = new WebGPURenderer({ antialias: false })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(width, height)
  renderer.setClearColor(0x000000)
  parent.appendChild(renderer.domElement)
  await renderer.init()

  const camera = new OrthographicCamera(
    -width / 2,
    width / 2,
    height / 2,
    -height / 2,
    0.1,
    10,
  )
  camera.position.z = 1
  const scene = new Scene()

  // height buffer: one cell per CELL pixels, row 0 at the bottom of the screen
  const cols = Math.ceil(width / CELL)
  const rows = Math.ceil(height / CELL)
  const heightBuffer = instancedArray(cols * rows, 'float')
  // how recently a drop passed over each cell (1 = just now, fades to 0)
  const trailBuffer = instancedArray(cols * rows, 'float')
  // how far drops have worn each cell down; the ground is noise minus this
  const erosionBuffer = instancedArray(cols * rows, 'float')

  const half = vec2(width / 2, height / 2)
  const gridMax = vec2(cols - 1, rows - 1)

  // third noise axis, advanced every frame so the terrain slowly morphs
  const noiseTime = uniform(0)

  // fractal perlin noise in 0-1 at a position in pixels from the bottom left
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noiseHeight = (pixels: any) => {
    const p = pixels.div(config.noiseScale)
    let sum = vec3(0).x
    let amplitude = 1
    let frequency = 1
    let total = 0
    for (let o = 0; o < config.octaves; o += 1) {
      sum = sum.add(
        mx_noise_float(
          vec3(p.mul(frequency), noiseTime.mul(frequency).add(config.seed * 7.31)),
        ).mul(amplitude),
      )
      total += amplitude
      amplitude *= 0.5
      frequency *= 2
    }
    return sum.div(total).mul(0.5).add(0.5)
  }

  // 0. fill the height buffer (only used to draw the terrain)
  const initHeights = Fn(() => {
    const colF = instanceIndex.mod(uint(cols)).toFloat()
    const rowF = instanceIndex.div(uint(cols)).toFloat()
    const h = noiseHeight(vec2(colF, rowF).add(0.5).mul(CELL))
    heightBuffer.element(instanceIndex).assign(h.clamp(0, 1))
  })().compute(cols * rows)

  // bilinear value of a grid buffer at a position given in grid cells
  // (0,0 = bottom left), so nothing looks blocky when scaled up to the screen
  const bilinear = (buffer: typeof heightBuffer) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Fn(([grid]: any[]) => {
      const g = grid.sub(0.5).clamp(vec2(0, 0), gridMax)
      const i0 = g.floor()
      const f = g.fract()
      const i1 = i0.add(1).min(gridMax)
      const at = (x: typeof g.x, y: typeof g.y) =>
        buffer.element(y.mul(cols).add(x).toUint())
      return mix(
        mix(at(i0.x, i0.y), at(i1.x, i0.y), f.x),
        mix(at(i0.x, i1.y), at(i1.x, i1.y), f.x),
        f.y,
      )
    })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sampleHeight: any = bilinear(heightBuffer)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sampleTrail: any = bilinear(trailBuffer)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sampleErosion: any = bilinear(erosionBuffer)

  // drops: position and velocity in pixels from the screen center, plus
  // the seconds each one has left before it respawns
  const positions = new Float32Array(MAX_COUNT * 2)
  const lifes = new Float32Array(MAX_COUNT)
  for (let i = 0; i < MAX_COUNT; i += 1) {
    positions[i * 2] = (Math.random() - 0.5) * width
    positions[i * 2 + 1] = (Math.random() - 0.5) * height
    lifes[i] = config.lifetime * (0.5 + Math.random())
  }
  const positionBuffer = storage(
    new StorageInstancedBufferAttribute(positions, 2),
    'vec2',
    MAX_COUNT,
  )
  const velocityBuffer = instancedArray(MAX_COUNT, 'vec2')
  const lifeBuffer = storage(
    new StorageInstancedBufferAttribute(lifes, 1),
    'float',
    MAX_COUNT,
  )

  const dt = uniform(0)
  const frame = uniform(0, 'uint')
  const activeCount = uniform(COUNT)
  const isActive = instanceIndex.toFloat().lessThan(activeCount)
  const gravity = uniform(0)
  const damping = uniform(1)
  const lifetime = uniform(0)
  const trailDecay = uniform(0)
  const erosionRate = uniform(0)

  // 1. roll downhill on the height buffer; respawn when done
  const update = Fn(() => {
    If(isActive, () => {
      const pos = positionBuffer.element(instanceIndex)
      const vel = velocityBuffer.element(instanceIndex)
      const life = lifeBuffer.element(instanceIndex)
      // mix index and frame with different large odd constants; a plain
      // index + frame sum gives drop i at frame f the same seed as drop i+1 at
      // frame f-1, so neighbors respawn on the same spot
      const seedIndex = instanceIndex
        .mul(uint(1664525))
        .add(frame.mul(uint(1013904223)))
      const random1 = hash(seedIndex)
      const random2 = hash(seedIndex.add(uint(7919)))
      const random3 = hash(seedIndex.add(uint(104729)))

      const grid = pos.add(half).div(CELL)
      // slope in height per pixel, taken straight from the noise function
      // (not the grid) so it is smooth and paths don't follow cell edges
      const here = pos.add(half)
      const dx = noiseHeight(here.add(vec2(SLOPE_STEP, 0))).sub(
        noiseHeight(here.sub(vec2(SLOPE_STEP, 0))),
      )
      const dy = noiseHeight(here.add(vec2(0, SLOPE_STEP))).sub(
        noiseHeight(here.sub(vec2(0, SLOPE_STEP))),
      )
      // roll toward lower ground
      const noiseSlope = vec2(dx, dy).div(2 * SLOPE_STEP)
      // carved ground is lower, so its slope is subtracted (smooth enough
      // because erosion is written as soft splats)
      const gx = sampleErosion(grid.add(vec2(1, 0))).sub(
        sampleErosion(grid.sub(vec2(1, 0))),
      )
      const gy = sampleErosion(grid.add(vec2(0, 1))).sub(
        sampleErosion(grid.sub(vec2(0, 1))),
      )
      const slope = noiseSlope.sub(vec2(gx, gy).div(2 * CELL))
      vel.addAssign(slope.mul(gravity.negate()).mul(dt))
      vel.assign(vel.mul(damping))
      pos.addAssign(vel.mul(dt))
      life.subAssign(dt)

      // soft splat: share the drop's wetness between the 4 nearest cells by
      // distance (keeping the strongest value) so the trail has no hard edges
      const g = grid.sub(0.5)
      const base = g.floor()
      const f = g.fract()
      for (const [ox, oy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const weight = (ox ? f.x : f.x.oneMinus()).mul(
          oy ? f.y : f.y.oneMinus(),
        )
        const cell = base.add(vec2(ox, oy)).clamp(vec2(0, 0), gridMax)
        const wet = trailBuffer.element(cell.y.mul(cols).add(cell.x).toUint())
        wet.assign(wet.max(weight))
        // wear the ground down a little, up to a maximum depth
        const worn = erosionBuffer.element(
          cell.y.mul(cols).add(cell.x).toUint(),
        )
        worn.assign(worn.add(weight.mul(erosionRate).mul(dt)).min(MAX_EROSION))
      }

      const outside = pos.x
        .abs()
        .greaterThan(half.x)
        .or(pos.y.abs().greaterThan(half.y))
      If(outside.or(life.lessThanEqual(0)), () => {
        pos.assign(
          vec2(random1.sub(0.5).mul(width), random2.sub(0.5).mul(height)),
        )
        vel.assign(vec2(0, 0))
        life.assign(lifetime.mul(random3.add(0.5)))
      })
    })
  })().compute(MAX_COUNT)

  // 2. fade the trails
  const fade = Fn(() => {
    const t = trailBuffer.element(instanceIndex)
    t.assign(t.mul(trailDecay))
  })().compute(cols * rows)

  // terrain: height map in grays with the wet trails tinted blue
  const dropColor = uniform(new Color())
  const terrainBrightness = uniform(1)
  const terrainMaterial = new MeshBasicNodeMaterial()
  terrainMaterial.depthWrite = false
  const terrainGrid = uv().mul(vec2(cols, rows))
  const terrainHeight = sampleHeight(terrainGrid)
    .sub(sampleErosion(terrainGrid))
    .max(0)
  const wet = sampleTrail(terrainGrid)
  terrainMaterial.colorNode = mix(
    vec3(terrainHeight.mul(0.9).mul(terrainBrightness)),
    dropColor.mul(0.8),
    wet.mul(0.6),
  )
  const terrain = new Mesh(new PlaneGeometry(width, height), terrainMaterial)
  terrain.renderOrder = -1
  scene.add(terrain)

  // drops: blue
  const material = new SpriteNodeMaterial()
  material.depthTest = false
  material.depthWrite = false
  const dotSize = uniform(2)
  material.positionNode = vec3(positionBuffer.toAttribute(), 0.5)
  material.scaleNode = dotSize
  // round, soft-edged drops instead of squares
  material.transparent = true
  material.opacityNode = smoothstep(0.5, 0.3, length(uv().sub(0.5)))
  material.colorNode = dropColor
  const sprite = new Sprite(material)
  sprite.count = COUNT
  sprite.frustumCulled = false
  scene.add(sprite)

  renderer.compute(initHeights)

  let last = performance.now()
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const delta = Math.min((now - last) / 1000, 0.05)
    last = now
    dt.value = delta
    frame.value = (frame.value + 1) % 1_000_000
    activeCount.value = config.dots
    sprite.count = config.dots
    dotSize.value = config.dotSize
    gravity.value = config.gravity
    damping.value = Math.exp(-config.friction * delta)
    lifetime.value = config.lifetime
    erosionRate.value = config.erosion
    trailDecay.value =
      config.trail > 0 ? Math.exp(-(delta * 4) / config.trail) : 0
    terrainBrightness.value = config.terrain
    dropColor.value.setHSL(config.hue / 360, config.saturation, 0.6)
    noiseTime.value += delta * config.drift
    // the height buffer is only for display, so skip it while terrain is hidden
    if (config.terrain > 0 && config.drift > 0) renderer.compute(initHeights)
    renderer.compute(update)
    renderer.compute(fade)
    renderer.render(scene, camera)
  })

  return {
    destroy: () => {
      renderer.setAnimationLoop(null)
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
