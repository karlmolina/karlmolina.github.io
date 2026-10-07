import {
  atan,
  clamp,
  dot,
  float,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  max,
  mix,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import {
  AdditiveBlending,
  Node,
  OrthographicCamera,
  Scene,
  Sprite,
  SpriteNodeMaterial,
  WebGPURenderer,
} from 'three/webgpu'

import type { Control } from '../lib/config-menu.ts'

export interface VectorFieldConfig {
  // size of one cell in pixels (rebuilds the grid)
  cellSize: number
  // size of each smoke puff, in cells
  softness: number
  // fraction of the gap to the neighbors' average closed per step
  drag: number
  // fraction of magnitude kept per step
  damping: number
  // how hard the mouse pushes vectors
  strength: number
  // radius of the mouse's influence in pixels
  brush: number
  // simulation speed multiplier, 1 = normal, 0 = paused
  speed: number
  // how much smoke the mouse emits
  emit: number
  // fraction of smoke kept per step
  fade: number
  // how fast smoke drifts upward, in cells per step
  rise: number
  // overall brightness, 0-1
  opacity: number
}

export const defaultVectorFieldConfig = (): VectorFieldConfig => ({
  cellSize: 8,
  softness: 3,
  drag: 0.2,
  damping: 0.99,
  strength: 0.15,
  brush: 60,
  speed: 1,
  emit: 0.5,
  fade: 0.99,
  rise: 0.05,
  opacity: 1,
})

export const vectorFieldControls: Control<VectorFieldConfig>[] = [
  {
    type: 'range',
    key: 'cellSize',
    label: 'cell size',
    min: 4,
    max: 60,
    step: 1,
    rebuild: true,
    help: 'Size of one simulation cell in pixels. Smaller is finer smoke but slower.',
  },
  {
    type: 'range',
    key: 'softness',
    label: 'softness',
    min: 1,
    max: 8,
    step: 0.25,
    help: 'Size of each smoke puff, in cells. Bigger is blurrier.',
  },
  {
    type: 'range',
    key: 'drag',
    label: 'drag',
    min: 0,
    max: 1,
    step: 0.01,
    help: 'How strongly each vector is pulled toward the direction of its neighbors.',
  },
  {
    type: 'range',
    key: 'damping',
    label: 'damping',
    min: 0.9,
    max: 1,
    step: 0.001,
    help: 'Friction. Lower values make vectors fade out faster.',
  },
  {
    type: 'range',
    key: 'strength',
    label: 'strength',
    min: 0.01,
    max: 1,
    step: 0.01,
    help: 'How hard the mouse pushes vectors.',
  },
  {
    type: 'range',
    key: 'brush',
    label: 'brush size',
    min: 10,
    max: 300,
    step: 5,
  },
  {
    type: 'range',
    key: 'speed',
    label: 'step speed',
    min: 0,
    max: 2,
    step: 0.05,
    help: 'Simulation speed. 1 is normal, lower is slow motion, 0 pauses.',
  },
  {
    type: 'range',
    key: 'emit',
    label: 'emit',
    min: 0,
    max: 2,
    step: 0.05,
    help: 'How much smoke the mouse leaves behind.',
  },
  {
    type: 'range',
    key: 'fade',
    label: 'fade',
    min: 0.9,
    max: 1,
    step: 0.001,
    help: 'How slowly smoke dissipates. 1 never fades.',
  },
  {
    type: 'range',
    key: 'rise',
    label: 'rise',
    min: -0.2,
    max: 0.5,
    step: 0.01,
    help: 'Upward drift of the smoke. Negative sinks.',
  },
  {
    type: 'range',
    key: 'opacity',
    label: 'opacity',
    min: 0.1,
    max: 1,
    step: 0.05,
  },
]

// cells per step; keeps the semi-Lagrangian trace back short
const MAX_SPEED = 3

export default async (config: VectorFieldConfig) => {
  const parent = document.body
  if (!('gpu' in navigator)) {
    parent.textContent = 'WebGPU not supported in this browser'
    return { destroy: () => parent.replaceChildren() }
  }
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

  const cell = config.cellSize
  const nWide = Math.ceil(width / cell)
  const nHigh = Math.ceil(height / cell)
  const count = nWide * nHigh

  // Velocity (cells per step, screen space with y down) and smoke (rgb light)
  // per cell. Each step reads one buffer and writes the other so a cell only
  // sees its neighbors' previous values; the pair of steps per frame ends back
  // in the first buffer.
  const velA = instancedArray(count, 'vec2')
  const velB = instancedArray(count, 'vec2')
  const smokeA = instancedArray(count, 'vec4')
  const smokeB = instancedArray(count, 'vec4')

  const drag = uniform(config.drag)
  const damping = uniform(config.damping)
  const strength = uniform(config.strength)
  const brush = uniform(config.brush)
  const softness = uniform(config.softness)
  const emit = uniform(config.emit)
  const fade = uniform(config.fade)
  const rise = uniform(config.rise)
  const opacity = uniform(config.opacity)
  // how far a step carries things, scaled by the speed setting
  const flow = uniform(1)
  // the mouse path this frame, from prev to cur
  const prev = uniform(vec2(0, 0))
  const cur = uniform(vec2(0, 0))

  const cellCenter = (index: Node<'float'>) => {
    const row = index.div(nWide).floor()
    const col = index.sub(row.mul(nWide))
    return { row, col, center: vec2(col.add(0.5), row.add(0.5)).mul(cell) }
  }

  // bilinear lookup at a position in cell units
  const sample = (buffer: typeof smokeA, at: Node<'vec2'>) => {
    const x = clamp(at.x, 0, nWide - 1.001)
    const y = clamp(at.y, 0, nHigh - 1.001)
    const x0 = x.floor()
    const y0 = y.floor()
    const i00 = y0.mul(nWide).add(x0).toInt()
    const top = mix(buffer.element(i00), buffer.element(i00.add(1)), x.sub(x0))
    const bottom = mix(
      buffer.element(i00.add(nWide)),
      buffer.element(i00.add(nWide + 1)),
      x.sub(x0),
    )
    return mix(top, bottom, y.sub(y0))
  }

  // one step: carry velocity and smoke along the velocity, drag velocity
  // toward the neighbors' average, then apply friction and fade
  const makeStep = (
    fromVel: typeof velA,
    toVel: typeof velA,
    fromSmoke: typeof smokeA,
    toSmoke: typeof smokeA,
  ) =>
    Fn(() => {
      const index = instanceIndex.toInt()
      const { row, col } = cellCenter(float(instanceIndex))
      const here = vec2(col, row)
      const vel = fromVel.element(index)
      // trace back to where this cell's contents came from; smoke also rises
      const back = here.sub(vel.mul(flow)).add(vec2(0, rise.negate().mul(flow)))
      const advected = sample(fromVel as unknown as typeof smokeA, back).xy
      const up = fromVel.element(
        row.greaterThan(0).select(index.sub(nWide), index),
      )
      const down = fromVel.element(
        row.lessThan(nHigh - 1).select(index.add(nWide), index),
      )
      const left = fromVel.element(
        col.greaterThan(0).select(index.sub(1), index),
      )
      const right = fromVel.element(
        col.lessThan(nWide - 1).select(index.add(1), index),
      )
      const average = up.add(down).add(left).add(right).mul(0.25)
      const next = advected
        .add(average.sub(advected).mul(drag))
        .mul(damping)
        .toVar()
      // cap speed so the trace back never runs far across the grid
      next.divAssign(max(float(1), next.length().div(MAX_SPEED)))
      toVel.element(index).assign(next)
      toSmoke.element(index).assign(sample(fromSmoke, back).mul(fade))
    })().compute(count)
  const stepAB = makeStep(velA, velB, smokeA, smokeB)
  const stepBA = makeStep(velB, velA, smokeB, smokeA)

  // distance from a cell to the mouse's path this frame
  const segmentDistance = (center: Node<'vec2'>) => {
    const delta = cur.sub(prev)
    const toCell = center.sub(prev)
    const t = clamp(dot(toCell, delta).div(max(dot(delta, delta), 1e-4)), 0, 1)
    return toCell.sub(delta.mul(t)).length()
  }

  // the mouse pushes the air and puffs smoke right where it is
  const push = Fn(() => {
    const index = instanceIndex.toInt()
    const { center } = cellCenter(float(instanceIndex))
    const delta = cur.sub(prev)
    const travel = delta.length()
    If(travel.greaterThan(0.01), () => {
      const pushWeight = float(1).sub(
        smoothstep(0, brush, segmentDistance(center)),
      )
      const vel = velA.element(index)
      const next = vel
        .add(delta.div(cell).mul(strength).mul(pushWeight))
        .toVar()
      next.divAssign(max(float(1), next.length().div(MAX_SPEED)))
      vel.assign(next)

      // color from the direction of travel
      const hue = atan(delta.y.negate(), delta.x).div(Math.PI * 2)
      const rgb = vec3(0, 1 / 3, 2 / 3)
        .add(hue)
        .mul(Math.PI * 2)
        .cos()
        .mul(0.5)
        .add(0.5)
      const smokeWeight = float(1).sub(
        smoothstep(0, brush.mul(0.5), segmentDistance(center)),
      )
      const amount = smokeWeight.mul(emit).mul(clamp(travel.div(10), 0, 1))
      const smoke = smokeA.element(index)
      smoke.assign(smoke.add(vec4(rgb.mul(amount), 0)))
    })
  })().compute(count)

  const material = new SpriteNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const { center } = cellCenter(instanceIndex.toFloat())
  material.positionNode = vec3(
    center.x.sub(width / 2),
    float(height / 2).sub(center.y),
    0,
  )
  material.scaleNode = softness.mul(cell).mul(2)
  const light = smokeA.toAttribute().rgb
  // soft round puff; additive blending sums overlapping puffs into smoke
  const falloff = float(1).sub(smoothstep(0, 0.5, uv().sub(0.5).length()))
  // keep bright smoke from blowing out to flat white
  const mapped = float(1).sub(light.negate().exp())
  material.colorNode = vec4(mapped.mul(opacity), 1)
  material.opacityNode = falloff.mul(falloff)
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

  let hasPointer = false
  const onPointerMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (!hasPointer) {
      prev.value.set(x, y)
      hasPointer = true
    }
    cur.value.set(x, y)
  }
  const onPointerLeave = () => {
    hasPointer = false
    prev.value.copy(cur.value)
  }
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerleave', onPointerLeave)

  renderer.setAnimationLoop(() => {
    const speed = config.speed
    // below normal speed, weaken each step; above it, strengthen them
    flow.value = speed
    drag.value = Math.min(1, config.drag * speed)
    damping.value = config.damping ** speed
    fade.value = config.fade ** speed
    rise.value = config.rise
    strength.value = config.strength
    brush.value = config.brush
    softness.value = config.softness
    emit.value = config.emit
    opacity.value = config.opacity
    renderer.compute(push)
    prev.value.copy(cur.value)
    if (speed > 0) {
      renderer.compute(stepAB)
      renderer.compute(stepBA)
    }
    renderer.render(scene, camera)
  })

  return {
    destroy: () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      renderer.setAnimationLoop(null)
      renderer.dispose()
      canvas.remove()
    },
  }
}
