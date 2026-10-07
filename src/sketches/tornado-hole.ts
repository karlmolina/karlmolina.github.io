import {
  abs,
  float,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  mix,
  smoothstep,
  storage,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import {
  Color,
  Node,
  OrthographicCamera,
  Scene,
  Sprite,
  SpriteNodeMaterial,
  StorageInstancedBufferAttribute,
  WebGPURenderer,
} from 'three/webgpu'

// how close a pointer must be to a dot to grab it
const GRAB_RADIUS = 20
const MAX_POINTERS = 4
// the simulation was tuned per frame at 60hz, so step at a fixed rate
const STEP = 1 / 60
const MAX_STEPS_PER_FRAME = 4
// two presses near each other within this long pin (or unpin) it
const DOUBLE_PRESS_MS = 400
const DOUBLE_PRESS_RADIUS = 40

export interface TornadoHoleConfig {
  // which screen edges are pinned in place (rebuilds the grid)
  lockTop: boolean
  lockBottom: boolean
  lockLeft: boolean
  lockRight: boolean
  // approximate number of dots on screen (rebuilds the grid)
  dots: number
  dotSize: number
  // pull toward each neighbor per step
  spring: number
  // fraction of velocity kept per step
  damping: number
  // simulation speed multiplier, 1 = normal, 0 = paused
  speed: number
  // opacity of the dots, 0-1
  opacity: number
}

export const defaultTornadoHoleConfig = (): TornadoHoleConfig => ({
  lockTop: true,
  lockBottom: true,
  lockLeft: true,
  lockRight: true,
  dots: 5000,
  dotSize: 10,
  spring: 0.1,
  damping: 0.99,
  speed: 1,
  opacity: 1,
})

export default async (config: TornadoHoleConfig) => {
  const parent = document.body
  if (!('gpu' in navigator)) {
    parent.textContent = 'WebGPU not supported in this browser'
    return { destroy: () => parent.replaceChildren() }
  }
  const { lockTop, lockBottom, lockLeft, lockRight } = config
  const anyLocked = lockTop || lockBottom || lockLeft || lockRight
  const width = window.innerWidth
  const height = window.innerHeight

  const renderer = new WebGPURenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(width, height)
  renderer.setClearColor(0x000000)
  const canvas = renderer.domElement
  canvas.style.display = 'block'
  canvas.style.touchAction = 'none'
  parent.appendChild(canvas)
  await renderer.init()

  // spread the requested dots evenly over the screen
  const spacing = Math.max(0.5, Math.sqrt((width * height) / config.dots))
  const nWide = Math.ceil(width / spacing) + 2
  const nHigh = Math.ceil(height / spacing) + 2
  const count = nWide * nHigh
  const isLockedCell = (i: number, j: number) =>
    (lockTop && i === 0) ||
    (lockBottom && i === nHigh - 1) ||
    (lockLeft && j === 0) ||
    (lockRight && j === nWide - 1)

  // positions are in screen pixels (y down); the vertex shader flips them
  const positions = new Float32Array(count * 2)
  // rgb + visibility (locked edge dots are invisible)
  const colors = new Float32Array(count * 4)
  const randomHue = Math.random() * 360
  const color = new Color()
  for (let i = 0; i < nHigh; i += 1) {
    for (let j = 0; j < nWide; j += 1) {
      const n = i * nWide + j
      const locked = isLockedCell(i, j)
      if (anyLocked) {
        positions[n * 2] = j * spacing - spacing / 2
        positions[n * 2 + 1] = i * spacing - spacing / 2
      } else {
        positions[n * 2] = width / 2
        positions[n * 2 + 1] = height / 2
      }
      color.setHSL((((i + j) * 2 + randomHue) % 360) / 360, 0.65, 0.7)
      colors.set([color.r, color.g, color.b, locked ? 0 : 1], n * 4)
    }
  }
  const spring = uniform(config.spring)
  const damping = uniform(config.damping)
  // fraction of a full step each step advances, so slow motion keeps 60 steps a second
  const stepScale = uniform(1)
  const dotSize = uniform(config.dotSize)
  const dotOpacity = uniform(config.opacity)
  const positionAttribute = new StorageInstancedBufferAttribute(positions, 2)
  const positionBuffer = storage(positionAttribute, 'vec2', count)
  const velocityBuffer = instancedArray(count, 'vec2')
  const colorBuffer = instancedArray(colors, 'vec4')
  // 1 for dots the user pinned in place with a double press
  const pinnedBuffer = instancedArray(count, 'float')
  const pinTarget = uniform(-1)

  // each active pointer holds a dot and its direct neighbors at the pointer
  const slots = Array.from({ length: MAX_POINTERS }, () => ({
    position: uniform(vec2(0, 0)),
    // row, column of the held dot, and 1 when the slot is in use
    cell: uniform(vec3(0, 0, 0)),
  }))

  const rowCol = (index: Node<'float'>) => {
    const row = index.div(nWide).floor().toVar()
    return { row, col: index.sub(row.mul(nWide)).toVar() }
  }
  const isUnlocked = (row: Node<'float'>, col: Node<'float'>) => {
    let unlocked = float(1).greaterThan(0)
    if (lockTop) unlocked = unlocked.and(row.greaterThan(0))
    if (lockBottom) unlocked = unlocked.and(row.lessThan(nHigh - 1))
    if (lockLeft) unlocked = unlocked.and(col.greaterThan(0))
    if (lockRight) unlocked = unlocked.and(col.lessThan(nWide - 1))
    return unlocked
  }

  // x, y = where a held dot should be, z = 1 if this dot is held
  const heldBy = (row: Node<'float'>, col: Node<'float'>) => {
    const held = vec3(0, 0, 0).toVar()
    for (const slot of slots) {
      const distance = abs(row.sub(slot.cell.x)).add(abs(col.sub(slot.cell.y)))
      // a pinned dot only moves when it is the one being dragged
      const pin = pinnedBuffer.element(row.mul(nWide).add(col).toInt())
      const canMove = distance.lessThan(0.5).or(pin.lessThan(0.5))
      If(
        slot.cell.z.greaterThan(0).and(distance.lessThanEqual(1)).and(canMove),
        () => {
          held.assign(vec3(slot.position, 1))
        },
      )
    }
    return held
  }

  const togglePin = Fn(() => {
    const pin = pinnedBuffer.element(instanceIndex)
    If(float(instanceIndex).equal(pinTarget), () => {
      pin.assign(float(1).sub(pin))
    })
  })().compute(count)

  // pull each dot toward its up/down/left/right neighbors
  const accelerate = Fn(() => {
    const index = instanceIndex.toInt()
    const { row, col } = rowCol(float(instanceIndex))
    const free = pinnedBuffer.element(index).lessThan(0.5)
    If(
      isUnlocked(row, col).and(free).and(heldBy(row, col).z.lessThan(0.5)),
      () => {
        const pos = positionBuffer.element(index)
        const pull = vec2(0, 0).toVar()
        If(row.greaterThan(0), () => {
          pull.addAssign(positionBuffer.element(index.sub(nWide)).sub(pos))
        })
        If(row.lessThan(nHigh - 1), () => {
          pull.addAssign(positionBuffer.element(index.add(nWide)).sub(pos))
        })
        If(col.greaterThan(0), () => {
          pull.addAssign(positionBuffer.element(index.sub(1)).sub(pos))
        })
        If(col.lessThan(nWide - 1), () => {
          pull.addAssign(positionBuffer.element(index.add(1)).sub(pos))
        })
        const vel = velocityBuffer.element(index)
        vel.addAssign(pull.mul(spring))
      },
    )
  })().compute(count)

  const move = Fn(() => {
    const index = instanceIndex.toInt()
    const { row, col } = rowCol(float(instanceIndex))
    If(isUnlocked(row, col), () => {
      const pos = positionBuffer.element(index)
      const vel = velocityBuffer.element(index)
      const held = heldBy(row, col)
      If(held.z.greaterThan(0.5), () => {
        pos.assign(held.xy)
      })
        .ElseIf(pinnedBuffer.element(index).greaterThan(0.5), () => {
          vel.assign(vec2(0, 0))
        })
        .Else(() => {
          vel.mulAssign(damping)
          pos.addAssign(vel.mul(stepScale))
        })
    })
  })().compute(count)

  const material = new SpriteNodeMaterial({
    transparent: true,
    depthWrite: false,
  })
  const screenPosition = positionBuffer.toAttribute()
  material.positionNode = vec3(
    screenPosition.x.sub(width / 2),
    float(height / 2).sub(screenPosition.y),
    0,
  )
  // the sprite's own scale would also multiply positionNode, so size via scaleNode
  material.scaleNode = dotSize
  const dotColor = colorBuffer.toAttribute()
  const isPinned = pinnedBuffer.toAttribute()
  material.colorNode = vec4(mix(dotColor.rgb, vec3(1, 1, 1), isPinned), 1)
  const edge = uv().sub(0.5).length()
  material.opacityNode = float(1)
    .sub(smoothstep(0.4, 0.5, edge))
    .mul(dotColor.a)
    .mul(dotOpacity)
  const sprite = new Sprite(material)
  sprite.count = count
  sprite.frustumCulled = false

  const scene = new Scene()
  scene.add(sprite)
  const camera = new OrthographicCamera(
    -width / 2,
    width / 2,
    height / 2,
    -height / 2,
    0.1,
    10,
  )
  camera.position.z = 1

  // pointerId -> slot index; undefined while the grab lookup is in flight
  const held = new Map<number, number | undefined>()
  let lastPress = { dot: -1, time: -Infinity, x: 0, y: 0 }
  const toLocal = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = async (e: PointerEvent) => {
    if (held.size >= MAX_POINTERS || held.has(e.pointerId)) {
      return
    }
    held.set(e.pointerId, undefined)
    const pressTime = e.timeStamp
    const { x, y } = toLocal(e)
    // the dot usually slides away from the first press, so a quick second
    // press near the same spot targets the dot that press held
    const isDouble =
      lastPress.dot !== -1 &&
      pressTime - lastPress.time < DOUBLE_PRESS_MS &&
      Math.hypot(x - lastPress.x, y - lastPress.y) < DOUBLE_PRESS_RADIUS
    const buffer = isDouble
      ? undefined
      : await renderer.getArrayBufferAsync(positionAttribute)
    const current = new Float32Array(buffer ?? new ArrayBuffer(0))
    let nearest = GRAB_RADIUS * GRAB_RADIUS
    let grabbed = isDouble ? lastPress.dot : -1
    for (let n = 0; n < count && !isDouble; n += 1) {
      const i = Math.floor(n / nWide)
      const j = n % nWide
      if (isLockedCell(i, j)) {
        continue
      }
      const d2 = (current[n * 2] - x) ** 2 + (current[n * 2 + 1] - y) ** 2
      if (d2 < nearest) {
        nearest = d2
        grabbed = n
      }
    }
    // released (or destroyed) while we were looking
    if (!held.has(e.pointerId)) {
      return
    }
    if (grabbed === -1) {
      held.delete(e.pointerId)
      return
    }
    const used = new Set(held.values())
    const slotIndex = slots.findIndex((_, s) => !used.has(s))
    const slot = slots[slotIndex]
    held.set(e.pointerId, slotIndex)
    if (isDouble) {
      pinTarget.value = grabbed
      renderer.compute(togglePin)
      lastPress = { dot: -1, time: -Infinity, x: 0, y: 0 }
    } else {
      lastPress = { dot: grabbed, time: pressTime, x, y }
    }
    slot.position.value.set(x, y)
    slot.cell.value.set(Math.floor(grabbed / nWide), grabbed % nWide, 1)
  }
  const onPointerMove = (e: PointerEvent) => {
    const slotIndex = held.get(e.pointerId)
    if (slotIndex === undefined) {
      return
    }
    const { x, y } = toLocal(e)
    slots[slotIndex].position.value.set(x, y)
  }
  const onPointerUp = (e: PointerEvent) => {
    const slotIndex = held.get(e.pointerId)
    held.delete(e.pointerId)
    if (slotIndex !== undefined) {
      slots[slotIndex].cell.value.z = 0
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)

  let last = performance.now()
  let accumulated = 0
  renderer.setAnimationLoop(() => {
    // below normal speed, shrink each step instead of running fewer of them
    const scale = Math.min(config.speed, 1)
    stepScale.value = scale
    spring.value = config.spring * scale
    damping.value = config.damping ** scale
    dotSize.value = config.dotSize
    dotOpacity.value = config.opacity
    const now = performance.now()
    accumulated += ((now - last) / 1000) * Math.max(config.speed, 1)
    last = now
    let steps = 0
    while (accumulated >= STEP && steps < MAX_STEPS_PER_FRAME) {
      renderer.compute(accelerate)
      renderer.compute(move)
      accumulated -= STEP
      steps += 1
    }
    if (steps === MAX_STEPS_PER_FRAME) {
      accumulated = 0
    }
    renderer.render(scene, camera)
  })

  return {
    destroy: () => {
      held.clear()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      renderer.setAnimationLoop(null)
      renderer.dispose()
      canvas.remove()
    },
  }
}
