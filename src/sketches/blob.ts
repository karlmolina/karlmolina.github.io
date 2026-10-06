import '@pixi/math-extras'
import { Application, FederatedPointerEvent, Graphics, Point } from 'pixi.js'

import type { Control } from '../lib/config-menu.ts'
import Dot from './dot.ts'

export type BlobConfig = {
  nodes: number
  dotSize: number
  // how far apart connected dots like to sit
  distBetween: number
  // how hard connected dots pull toward that distance
  spring: number
  // how hard overlapping dots push apart
  repulsion: number
  maxVelocity: number
  // dots drop their furthest link once they have more than this many
  maxLinks: number
}

export const defaultBlobConfig = (): BlobConfig => ({
  nodes: 100,
  dotSize: 20,
  distBetween: 40,
  spring: 0.5,
  repulsion: 0.02,
  maxVelocity: 15,
  maxLinks: 4,
})

export const blobControls: Control<BlobConfig>[] = [
  {
    key: 'nodes',
    label: 'dots',
    type: 'range',
    min: 10,
    max: 400,
    step: 10,
    rebuild: true,
  },
  {
    key: 'dotSize',
    label: 'dot size',
    type: 'range',
    min: 5,
    max: 50,
    step: 1,
    rebuild: true,
  },
  {
    key: 'distBetween',
    label: 'spacing',
    type: 'range',
    min: 10,
    max: 120,
    step: 1,
    help: 'How far apart linked dots like to sit.',
  },
  {
    key: 'spring',
    label: 'spring',
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    help: 'How hard linked dots pull toward their spacing.',
  },
  {
    key: 'repulsion',
    label: 'repulsion',
    type: 'range',
    min: 0,
    max: 0.2,
    step: 0.01,
    help: 'How hard overlapping dots push apart.',
  },
  {
    key: 'maxVelocity',
    label: 'max speed',
    type: 'range',
    min: 1,
    max: 40,
    step: 1,
  },
  {
    key: 'maxLinks',
    label: 'max links',
    type: 'range',
    min: 1,
    max: 8,
    step: 1,
    help: 'A dot drops its furthest link once it has more than this many.',
  },
]

class Blob extends Dot {
  pointerDown = false
  updateForce(nodes: Blob[], config: BlobConfig) {
    if (this.lock || this.pause) {
      return
    }
    const acceleration = new Point(0, 0)
    for (const child of this.children(nodes)) {
      let distance = this.obj.position.subtract(child.obj.position)
      const magnitude = distance.magnitude()
      if (magnitude < config.distBetween) {
        continue
      }
      if (distance.x === 0 && distance.y === 0) {
        distance = new Point(Math.random() * 0.0001, Math.random() * 0.0001)
      }
      const normal = distance.normalize()
      normal.multiplyScalar(config.distBetween, normal)
      const force = normal.subtract(distance).multiplyScalar(config.spring)
      acceleration.add(force, acceleration)
    }
    this.v.add(acceleration, this.v)
  }
  updatePhysics(config: BlobConfig) {
    if (this.pause) {
      return
    }

    this.a.multiplyScalar(0.7, this.a)
    // limit the velocity
    if (this.v.magnitude() > config.maxVelocity) {
      this.v.normalize().multiplyScalar(config.maxVelocity, this.v)
    }
    this.v.add(this.a, this.v)
    const magnitude = this.v.magnitude()
    const slowDownConstant = 100
    const slowDown = slowDownConstant / (magnitude + slowDownConstant) - 0.05
    this.v.multiplyScalar(slowDown, this.v)
    this.obj.position.add(this.v, this.obj.position)
  }
}
export default (config: BlobConfig) => {
  const mouseNodes = new Map<number, Blob>()
  const nodes: Blob[] = []

  const width = window.innerWidth
  const height = window.innerHeight

  const app = new Application<HTMLCanvasElement>({
    antialias: true,
    background: '0xffffff',
    resizeTo: window,
    resolution: 1,
    /**
     * by default we use `auto` for backwards compatibility.
     * However `passive` is more performant and will be used by default in the future,
     */
    eventMode: 'passive',
    eventFeatures: {
      move: true,
      /** disables the global move events which can be very expensive in large scenes */
      globalMove: false,
      click: true,
      wheel: true,
    },
  })

  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen
  const center = new Point(width / 2, height / 2)
  const randomColor = Math.random() * 360
  for (let i = 0; i < config.nodes; i++) {
    const circle = new Graphics()
    const color = { h: Math.random() * 100 + randomColor, s: 65, l: 65 }
    circle.beginFill(color)
    circle.drawCircle(0, 0, config.dotSize)
    const obj = app.stage.addChild(new Graphics(circle.geometry))
    obj.position.copyFrom(center)
    nodes[i] = new Blob(obj, i)
  }
  for (const node of Object.values(nodes)) {
    for (const otherNode of Object.values(nodes)) {
      if (node === otherNode) {
        continue
      }
      if (node.childrenLength() == 3) {
        break
      }
      if (otherNode.childrenLength() < 3 && !node.sharesChild(otherNode)) {
        node.addChild(otherNode)
      }
    }
  }

  const move = (e: FederatedPointerEvent) => {
    const mouseNode = mouseNodes.get(e.pointerId)
    if (mouseNode) {
      mouseNode.obj.position.copyFrom(e.global)
      mouseNode.pause = true
    }
  }
  app.stage.addEventListener('pointermove', move)
  const click = (e: FederatedPointerEvent) => {
    let minDistance = 1000000000
    for (const node of Object.values(nodes)) {
      const distance = node.obj.position.subtract(e.global).magnitude()
      if (distance < minDistance && distance < 50) {
        mouseNodes.set(e.pointerId, node)
        minDistance = distance
      }
    }
    const mouseNode = mouseNodes.get(e.pointerId)
    if (!mouseNode) {
      return
    }
    for (const child of mouseNode.children(nodes)) {
      mouseNode.removeChild(child)
    }
  }
  app.stage.addEventListener('pointerdown', click)
  const unclick = (e: PointerEvent) => {
    if (!app.stage) {
      window.removeEventListener('pointerup', unclick)
    }
    const mouseNode = mouseNodes.get(e.pointerId)
    mouseNode && (mouseNode.pause = false)
    mouseNodes.delete(e.pointerId)
  }
  window.addEventListener('pointerup', unclick)
  app.ticker.add(() => {
    for (const node of Object.values(nodes)) {
      node.updateForce(nodes, config)
      for (const otherNode of Object.values(nodes)) {
        if (node === otherNode) {
          continue
        }
        // move away from other nodes
        let distance = node.obj.position.subtract(otherNode.obj.position)
        if (distance.x === 0 && distance.y === 0) {
          distance = new Point(Math.random() * 0.0001, Math.random() * 0.0001)
        }
        const magnitude = distance.magnitude()
        if (magnitude < config.distBetween) {
          const normal = distance.normalize()
          normal.multiplyScalar(config.distBetween, normal)
          const force = normal
            .subtract(distance)
            .multiplyScalar(config.repulsion)
          node.v.add(force, node.v)
          // add child
          if (!node.sharesChild(otherNode)) {
            node.addChild(otherNode)
          }
        }
      }
      // drop the furthest link until the node is back under the limit
      while (node.childrenLength() > config.maxLinks) {
        const furthest = node.furthestChild(nodes)
        node.removeChild(furthest)
      }
    }
    for (const node of Object.values(nodes)) {
      node.updatePhysics(config)
    }
  })
  return app
}
