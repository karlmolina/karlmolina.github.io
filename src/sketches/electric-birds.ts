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

const STORAGE_KEY = 'electric-birds-config'
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

  const fpsEl = document.createElement('div')
  fpsEl.style.cssText =
    'position:fixed;top:8px;right:12px;color:#fff;font:14px monospace;pointer-events:none'
  parent.appendChild(fpsEl)
  const panel = document.createElement('div')
  panel.style.cssText =
    'position:fixed;top:32px;right:12px;width:190px;padding:8px 10px;background:rgba(0,0,0,0.6);color:#fff;font:12px monospace;border-radius:4px'
  const saved = loadConfig()
  const toggle = document.createElement('div')
  toggle.style.cssText =
    'cursor:pointer;user-select:none;display:flex;justify-content:space-between'
  const body = document.createElement('div')
  const setCollapsed = (collapsed: boolean) => {
    body.style.display = collapsed ? 'none' : 'block'
    toggle.textContent = collapsed ? 'settings +' : 'settings -'
    saved.collapsed = collapsed ? 1 : 0
    saveConfig(saved)
  }
  toggle.addEventListener('click', () =>
    setCollapsed(body.style.display !== 'none'),
  )
  panel.append(toggle, body)
  const help: Record<string, string> = {
    count: 'How many dots are on screen. More dots cost much more GPU time.',
    maxSpeed: 'Speed limit for every dot, in pixels per second.',
    cone: 'How wide a dot can see in front of it. 360 means it sees all around; small values make it follow only what is straight ahead.',
    radius: 'How far a dot can see, in pixels.',
    cohesion:
      'How strongly a dot steers toward the middle of the dots it sees.',
    alignment:
      'How strongly a dot matches the heading of the dots it sees. High values make groups move together.',
    separation: 'How strongly a dot pushes away from dots that are too close.',
    maxAccel:
      'Top turning/speeding-up force, in pixels per second squared. Low values make dots steer slowly and swing wide.',
    lineOpacity:
      "How visible the lines to each dot's nearest neighbors are. 0 hides them.",
    lineWidth: 'Thickness of the neighbor lines in pixels.',
    size: 'Size of each dot in pixels.',
  }
  const slider = (
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
    initial: number,
    onChange: (value: number) => void,
  ) => {
    const row = document.createElement('div')
    row.style.cssText = 'margin:4px 0'
    const header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;gap:6px'
    const text = document.createElement('span')
    const info = document.createElement('span')
    info.textContent = 'i'
    info.title = help[key] ?? ''
    info.style.cssText =
      'cursor:pointer;width:14px;height:14px;line-height:14px;text-align:center;border:1px solid #fff;border-radius:50%;font-size:10px;font-style:italic'
    const description = document.createElement('div')
    description.textContent = help[key] ?? ''
    description.style.cssText = 'display:none;margin:2px 0;color:#bbb'
    info.addEventListener('click', () => {
      description.style.display =
        description.style.display === 'none' ? 'block' : 'none'
    })
    header.append(info, text)
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
    row.append(header, description, input)
    body.appendChild(row)
  }
  slider('count', 'dots', 500, MAX_COUNT, 500, COUNT, (v) => {
    activeCount.value = v
    sprite.count = v
    lines.count = v * MAX_LINKS
  })
  slider('links', 'lines per dot', 0, MAX_LINKS, 1, LINKS, (v) => {
    linkCount.value = v
  })
  slider('lineOpacity', 'line opacity', 0, 1, 0.05, LINE_OPACITY, (v) => {
    lineOpacity.value = v
    lines.visible = v > 0
  })
  slider('lineWidth', 'line width', 0.5, 4, 0.5, LINE_WIDTH, (v) => {
    lineWidth.value = v
  })
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
  slider('size', 'dot size', 1, 8, 0.5, PARTICLE_SIZE, (v) => {
    dotSize.value = v
  })
  setCollapsed(saved.collapsed === 1)
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
