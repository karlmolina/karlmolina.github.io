import {
  OrthographicCamera,
  Scene,
  Sprite,
  SpriteNodeMaterial,
  StorageInstancedBufferAttribute,
  WebGPURenderer,
} from 'three/webgpu'
import {
  float,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  int,
  Loop,
  select,
  storage,
  uniform,
  vec2,
  vec3,
} from 'three/tsl'

import type { Control } from '../lib/config-menu.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoopParams = { i: any }

// buffers are sized for MAX_COUNT; the slider picks how many are active
const MAX_COUNT = 30_000
const COUNT = 8_000
// how far a dot can see (slider goes up to MAX_VISION_RADIUS)
const MAX_VISION_RADIUS = 200
const VISION_RADIUS = 48
// how wide the forward vision cone is (full angle)
const FOV = (Math.PI * 4) / 3
// how hard a dot accelerates toward what it sees (px/s^2)
const MAX_ACCEL = 400
// dots closer than this fraction of the vision radius push apart
const SEPARATION_RADIUS_FRACTION = 0.4
// speed limit once dots are accelerating (px/s)
const MAX_SPEED = 150
// starting speeds are random in this range
const MIN_SPEED = 60
const INITIAL_MAX_SPEED = 150
// steering weights, each 0-1+ of maxAccel
const COHESION = 0.6
const ALIGNMENT = 2
const SEPARATION = 1.5
// each dot is linked to this many of the nearest dots it can see (slider max)
const MAX_LINKS = 10
const LINKS = 5
const LINE_OPACITY = 0.25
const LINE_WIDTH = 1
const PARTICLE_SIZE = 3

export interface ElectricBirdsConfig {
  dots: number
  dotSize: number
  links: number
  lineOpacity: number
  lineWidth: number
  maxSpeed: number
  // full width of the vision cone, in degrees
  cone: number
  visionRadius: number
  cohesion: number
  alignment: number
  separation: number
  maxAccel: number
}

export const defaultElectricBirdsConfig = (): ElectricBirdsConfig => ({
  dots: COUNT,
  dotSize: PARTICLE_SIZE,
  links: LINKS,
  lineOpacity: LINE_OPACITY,
  lineWidth: LINE_WIDTH,
  maxSpeed: MAX_SPEED,
  cone: Math.round((FOV * 180) / Math.PI),
  visionRadius: VISION_RADIUS,
  cohesion: COHESION,
  alignment: ALIGNMENT,
  separation: SEPARATION,
  maxAccel: MAX_ACCEL,
})

export const electricBirdsControls: Control<ElectricBirdsConfig>[] = [
  {
    type: 'range',
    key: 'dots',
    label: 'dots',
    min: 500,
    max: MAX_COUNT,
    step: 500,
    help: 'How many dots are on screen. More dots cost much more GPU time.',
  },
  {
    type: 'range',
    key: 'dotSize',
    label: 'dot size',
    min: 1,
    max: 8,
    step: 0.5,
    help: 'Size of each dot in pixels.',
  },
  {
    type: 'range',
    key: 'links',
    label: 'lines per dot',
    min: 0,
    max: MAX_LINKS,
    step: 1,
    help: 'How many of its nearest visible neighbors each dot draws a line to.',
  },
  {
    type: 'range',
    key: 'lineOpacity',
    label: 'line opacity',
    min: 0,
    max: 1,
    step: 0.05,
    help: "How visible the lines to each dot's nearest neighbors are. 0 hides them.",
  },
  {
    type: 'range',
    key: 'lineWidth',
    label: 'line width',
    min: 0.5,
    max: 4,
    step: 0.5,
    help: 'Thickness of the neighbor lines in pixels.',
  },
  {
    type: 'range',
    key: 'maxSpeed',
    label: 'max speed',
    min: 20,
    max: 600,
    step: 10,
    help: 'Speed limit for every dot, in pixels per second.',
  },
  {
    type: 'range',
    key: 'cone',
    label: 'cone (deg)',
    min: 10,
    max: 360,
    step: 5,
    help: 'How wide a dot can see in front of it. 360 means it sees all around; small values make it follow only what is straight ahead.',
  },
  {
    type: 'range',
    key: 'visionRadius',
    label: 'vision radius',
    min: 4,
    max: MAX_VISION_RADIUS,
    step: 1,
    help: 'How far a dot can see, in pixels.',
  },
  {
    type: 'range',
    key: 'cohesion',
    label: 'cohesion',
    min: 0,
    max: 4,
    step: 0.1,
    help: 'How strongly a dot steers toward the middle of the dots it sees.',
  },
  {
    type: 'range',
    key: 'alignment',
    label: 'alignment',
    min: 0,
    max: 4,
    step: 0.1,
    help: 'How strongly a dot matches the heading of the dots it sees. High values make groups move together.',
  },
  {
    type: 'range',
    key: 'separation',
    label: 'separation',
    min: 0,
    max: 4,
    step: 0.1,
    help: 'How strongly a dot pushes away from dots that are too close.',
  },
  {
    type: 'range',
    key: 'maxAccel',
    label: 'max accel',
    min: 0,
    max: 1000,
    step: 10,
    help: 'Top turning/speeding-up force, in pixels per second squared. Low values make dots steer slowly and swing wide.',
  },
]

export default async (
  config: ElectricBirdsConfig,
  onFps: (fps: number) => void,
) => {
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

  // random positions and velocities, generated on the CPU once
  const positions = new Float32Array(MAX_COUNT * 2)
  const velocities = new Float32Array(MAX_COUNT * 2)
  for (let i = 0; i < MAX_COUNT; i += 1) {
    positions[i * 2] = (Math.random() - 0.5) * width
    positions[i * 2 + 1] = (Math.random() - 0.5) * height
    const angle = Math.random() * Math.PI * 2
    const speed = MIN_SPEED + Math.random() * (INITIAL_MAX_SPEED - MIN_SPEED)
    velocities[i * 2] = Math.cos(angle) * speed
    velocities[i * 2 + 1] = Math.sin(angle) * speed
  }
  const positionBuffer = storage(
    new StorageInstancedBufferAttribute(positions, 2),
    'vec2',
    MAX_COUNT,
  )
  const velocityBuffer = storage(
    new StorageInstancedBufferAttribute(velocities, 2),
    'vec2',
    MAX_COUNT,
  )

  const dt = uniform(0)
  const worldSize = vec2(width, height)
  const activeCount = uniform(COUNT)
  const linkCount = uniform(LINKS)
  // indices of each dot's nearest visible neighbors (-1 = empty slot)
  const neighborBuffer = instancedArray(MAX_COUNT * MAX_LINKS, 'int')
  const isActive = instanceIndex.toFloat().lessThan(activeCount)
  const half = uniform(vec2(width / 2, height / 2))

  const cosHalfFov = uniform(Math.cos(FOV / 2))
  const maxAccel = uniform(MAX_ACCEL)
  const maxSpeed = uniform(MAX_SPEED)
  const cohesion = uniform(COHESION)
  const alignment = uniform(ALIGNMENT)
  const separation = uniform(SEPARATION)
  const visionRadius = uniform(VISION_RADIUS)

  // 1. boids (brute force: every dot checks every other dot): cohesion + alignment toward dots in the forward cone, separation
  //    from any dot that is too close; accelerate, then clamp the speed
  const steer = Fn(() => {
    If(isActive, () => {
      const pos = positionBuffer.element(instanceIndex).toVar()
      const vel = velocityBuffer.element(instanceIndex)
      const speed = vel.length()
      const dir = vel.div(speed.max(0.001))
      const radius2 = visionRadius.mul(visionRadius)
      const sepRadius2 = radius2.mul(SEPARATION_RADIUS_FRACTION ** 2)
      const cohesionSum = vec2(0, 0).toVar()
      const velocitySum = vec2(0, 0).toVar()
      const separationSum = vec2(0, 0).toVar()
      const seen = int(0).toVar()
      // the MAX_LINKS nearest visible dots, sorted by distance
      const nearDist = Array.from({ length: MAX_LINKS }, () =>
        float(1e9).toVar(),
      )
      const nearIndex = Array.from({ length: MAX_LINKS }, () => int(-1).toVar())
      const last = MAX_LINKS - 1

      Loop(activeCount.toInt(), ({ i: other }: LoopParams) => {
        // shortest way to the other dot, going through the screen edges if closer
        const rawOffset = positionBuffer.element(other).sub(pos)
        const offset = rawOffset.sub(
          rawOffset.div(worldSize).round().mul(worldSize),
        )
        const dist2 = offset.dot(offset)
        If(
          other
            .notEqual(instanceIndex.toInt())
            .and(dist2.lessThan(radius2))
            .and(dist2.greaterThan(0.0001)),
          () => {
            // too close: push away, harder the closer it is
            If(dist2.lessThan(sepRadius2), () => {
              separationSum.subAssign(offset.div(dist2))
            })
            // in front of us: follow it
            If(
              offset.dot(dir).greaterThan(cosHalfFov.mul(dist2.sqrt())),
              () => {
                cohesionSum.addAssign(offset)
                velocitySum.addAssign(velocityBuffer.element(other))
                seen.addAssign(1)
                // insert into the nearest list, then bubble it into place
                If(dist2.lessThan(nearDist[last]), () => {
                  nearDist[last].assign(dist2)
                  nearIndex[last].assign(other)
                  for (let j = last; j > 0; j -= 1) {
                    If(nearDist[j].lessThan(nearDist[j - 1]), () => {
                      const d = nearDist[j - 1].toVar()
                      nearDist[j - 1].assign(nearDist[j])
                      nearDist[j].assign(d)
                      const n = nearIndex[j - 1].toVar()
                      nearIndex[j - 1].assign(nearIndex[j])
                      nearIndex[j].assign(n)
                    })
                  }
                })
              },
            )
          },
        )
      })

      for (let j = 0; j < MAX_LINKS; j += 1) {
        neighborBuffer
          .element(instanceIndex.mul(MAX_LINKS).add(j))
          .assign(select(linkCount.greaterThan(j), nearIndex[j], int(-1)))
      }

      const force = vec2(0, 0).toVar()
      If(seen.greaterThan(0), () => {
        const count = seen.toFloat()
        const toCenter = cohesionSum.div(count)
        force.addAssign(toCenter.normalize().mul(cohesion))
        // steer toward the average heading of the dots we see
        force.addAssign(
          velocitySum.div(count).sub(vel).div(maxSpeed).mul(alignment),
        )
      })
      If(separationSum.length().greaterThan(0.0001), () => {
        force.addAssign(separationSum.normalize().mul(separation))
      })
      // total steering force is at most 1 (= maxAccel)
      const forceLength = force.length()
      If(forceLength.greaterThan(1), () => {
        force.divAssign(forceLength)
      })
      vel.addAssign(force.mul(maxAccel).mul(dt))

      // keep speed within [MIN_SPEED, maxSpeed] so dots never stall
      const newSpeed = vel.length()
      If(newSpeed.greaterThan(maxSpeed), () => {
        vel.assign(vel.mul(maxSpeed.div(newSpeed)))
      })
      If(newSpeed.lessThan(MIN_SPEED), () => {
        vel.assign(dir.mul(MIN_SPEED))
      })
    })
  })().compute(MAX_COUNT)

  // 2. move and wrap around the edges
  const move = Fn(() => {
    If(isActive, () => {
      const pos = positionBuffer.element(instanceIndex)
      const vel = velocityBuffer.element(instanceIndex)
      pos.addAssign(vel.mul(dt))

      // wrap around: leaving one edge re-enters from the opposite one
      If(pos.x.abs().greaterThan(half.x), () => {
        pos.x.assign(pos.x.sub(half.x.mul(2).mul(pos.x.sign())))
      })
      If(pos.y.abs().greaterThan(half.y), () => {
        pos.y.assign(pos.y.sub(half.y.mul(2).mul(pos.y.sign())))
      })
    })
  })().compute(MAX_COUNT)

  // lines: one stretched sprite per (dot, neighbor slot) pair
  const lineOpacity = uniform(LINE_OPACITY)
  const lineWidth = uniform(LINE_WIDTH)
  const lineMaterial = new SpriteNodeMaterial()
  lineMaterial.transparent = true
  lineMaterial.depthWrite = false
  const lineDot = instanceIndex.div(MAX_LINKS)
  const lineNeighbor = neighborBuffer.element(instanceIndex).toInt()
  const lineFrom = positionBuffer.element(lineDot)
  const lineRaw = positionBuffer
    .element(lineNeighbor.toFloat().max(0).toUint())
    .sub(lineFrom)
  // go through the screen edge if that is the shorter way
  const lineVector = lineRaw.sub(lineRaw.div(worldSize).round().mul(worldSize))
  lineMaterial.positionNode = vec3(lineFrom.add(lineVector.mul(0.5)), 0)
  lineMaterial.rotationNode = lineVector.y.atan(lineVector.x)
  lineMaterial.scaleNode = vec2(
    select(lineNeighbor.greaterThanEqual(0), lineVector.length(), 0),
    lineWidth,
  )
  // same color rule as the dots, taken from the dot the line starts at
  lineMaterial.colorNode = vec3(
    velocityBuffer.element(lineDot).normalize().mul(0.5).add(0.5),
    0.9,
  )
  lineMaterial.opacityNode = lineOpacity
  const lines = new Sprite(lineMaterial)
  lines.count = COUNT * MAX_LINKS
  lines.frustumCulled = false
  scene.add(lines)

  const material = new SpriteNodeMaterial()
  // scale the dot itself; scaling the sprite would also scale every position
  const dotSize = uniform(PARTICLE_SIZE)
  material.scaleNode = dotSize
  material.positionNode = positionBuffer.toAttribute()
  // color by travel direction
  material.colorNode = vec3(
    velocityBuffer.toAttribute().normalize().mul(0.5).add(0.5),
    0.9,
  )
  const sprite = new Sprite(material)
  sprite.count = COUNT
  sprite.frustumCulled = false
  scene.add(sprite)

  let frames = 0
  let fpsStart = performance.now()

  let last = fpsStart
  renderer.setAnimationLoop(() => {
    activeCount.value = config.dots
    sprite.count = config.dots
    lines.count = config.dots * MAX_LINKS
    dotSize.value = config.dotSize
    linkCount.value = config.links
    lineOpacity.value = config.lineOpacity
    lines.visible = config.lineOpacity > 0
    lineWidth.value = config.lineWidth
    maxSpeed.value = config.maxSpeed
    cosHalfFov.value = Math.cos((config.cone * Math.PI) / 360)
    visionRadius.value = config.visionRadius
    cohesion.value = config.cohesion
    alignment.value = config.alignment
    separation.value = config.separation
    maxAccel.value = config.maxAccel
    const now = performance.now()
    dt.value = Math.min((now - last) / 1000, 0.05)
    last = now
    frames += 1
    if (now - fpsStart >= 500) {
      onFps(Math.round((frames * 1000) / (now - fpsStart)))
      frames = 0
      fpsStart = now
    }
    for (const pass of [steer, move]) {
      renderer.compute(pass)
    }
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
