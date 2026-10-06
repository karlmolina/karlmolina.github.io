import {
  OrthographicCamera,
  Scene,
  Sprite,
  SpriteNodeMaterial,
  StorageInstancedBufferAttribute,
  WebGPURenderer,
} from 'three/webgpu'
import {
  Fn,
  If,
  instanceIndex,
  int,
  Loop,
  storage,
  uniform,
  vec2,
  vec3,
} from 'three/tsl'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoopParams = { i: any }

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
const PARTICLE_SIZE = 3

const STORAGE_KEY = 'gpu-bounce-config-v2'
const loadConfig = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}
const saveConfig = (config: Record<string, number>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // storage unavailable (private mode, quota); settings just won't persist
  }
}

export default async (parent: HTMLElement) => {
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
  const positions = new Float32Array(COUNT * 2)
  const velocities = new Float32Array(COUNT * 2)
  for (let i = 0; i < COUNT; i += 1) {
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
    COUNT,
  )
  const velocityBuffer = storage(
    new StorageInstancedBufferAttribute(velocities, 2),
    'vec2',
    COUNT,
  )

  const dt = uniform(0)
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

    Loop(COUNT, ({ i: other }: LoopParams) => {
      const offset = positionBuffer.element(other).sub(pos)
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
          If(offset.dot(dir).greaterThan(cosHalfFov.mul(dist2.sqrt())), () => {
            cohesionSum.addAssign(offset)
            velocitySum.addAssign(velocityBuffer.element(other))
            seen.addAssign(1)
          })
        },
      )
    })

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
  })().compute(COUNT)

  // 2. move and bounce off the edges
  const move = Fn(() => {
    const pos = positionBuffer.element(instanceIndex)
    const vel = velocityBuffer.element(instanceIndex)
    pos.addAssign(vel.mul(dt))

    If(pos.x.abs().greaterThan(half.x), () => {
      pos.x.assign(half.x.mul(pos.x.sign()))
      vel.x.assign(vel.x.negate())
    })
    If(pos.y.abs().greaterThan(half.y), () => {
      pos.y.assign(half.y.mul(pos.y.sign()))
      vel.y.assign(vel.y.negate())
    })
  })().compute(COUNT)

  const material = new SpriteNodeMaterial()
  material.positionNode = positionBuffer.toAttribute()
  // color by travel direction
  material.colorNode = vec3(
    velocityBuffer.toAttribute().normalize().mul(0.5).add(0.5),
    0.9,
  )
  const sprite = new Sprite(material)
  sprite.count = COUNT
  sprite.scale.setScalar(PARTICLE_SIZE)
  sprite.frustumCulled = false
  scene.add(sprite)

  const fpsEl = document.createElement('div')
  fpsEl.style.cssText =
    'position:fixed;top:8px;right:12px;color:#fff;font:14px monospace;pointer-events:none'
  parent.appendChild(fpsEl)
  const panel = document.createElement('div')
  panel.style.cssText =
    'position:fixed;top:32px;right:12px;width:190px;padding:8px 10px;background:rgba(0,0,0,0.6);color:#fff;font:12px monospace;border-radius:4px'
  const saved = loadConfig()
  const slider = (
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
    initial: number,
    onChange: (value: number) => void,
  ) => {
    const row = document.createElement('label')
    row.style.cssText = 'display:block;margin:4px 0'
    const text = document.createElement('div')
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(saved[key] ?? initial)
    input.style.cssText = 'width:100%'
    const update = () => {
      text.textContent = `${label}: ${input.value}`
      onChange(Number(input.value))
      saved[key] = Number(input.value)
      saveConfig(saved)
    }
    input.addEventListener('input', update)
    update()
    row.append(text, input)
    panel.appendChild(row)
  }
  slider('maxSpeed', 'max speed', 20, 600, 10, MAX_SPEED, (v) => {
    maxSpeed.value = v
  })
  slider(
    'cone',
    'cone (deg)',
    10,
    360,
    5,
    Math.round((FOV * 180) / Math.PI),
    (v) => {
      cosHalfFov.value = Math.cos((v * Math.PI) / 360)
    },
  )
  slider(
    'radius',
    'vision radius',
    4,
    MAX_VISION_RADIUS,
    1,
    VISION_RADIUS,
    (v) => {
      visionRadius.value = v
    },
  )
  slider(
    'cohesion',
    'cohesion',
    0,
    4,
    0.1,
    COHESION,
    (v) => (cohesion.value = v),
  )
  slider(
    'alignment',
    'alignment',
    0,
    4,
    0.1,
    ALIGNMENT,
    (v) => (alignment.value = v),
  )
  slider('separation', 'separation', 0, 4, 0.1, SEPARATION, (v) => {
    separation.value = v
  })
  slider('maxAccel', 'max accel', 0, 1000, 10, MAX_ACCEL, (v) => {
    maxAccel.value = v
  })
  slider('size', 'dot size', 1, 8, 0.5, PARTICLE_SIZE, (v) =>
    sprite.scale.setScalar(v),
  )
  // keep clicks and drags on the panel from reaching the page
  panel.addEventListener('pointerdown', (e) => e.stopPropagation())
  parent.appendChild(panel)
  let frames = 0
  let fpsStart = performance.now()

  let last = fpsStart
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    dt.value = Math.min((now - last) / 1000, 0.05)
    last = now
    frames += 1
    if (now - fpsStart >= 500) {
      fpsEl.textContent = `${Math.round(
        (frames * 1000) / (now - fpsStart),
      )} fps`
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
      fpsEl.remove()
      panel.remove()
    },
  }
}
