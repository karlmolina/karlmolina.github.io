import '@pixi/math-extras'

import * as PIXI from 'pixi.js'
import { Application, Graphics } from 'pixi.js'

import Dot from './dot.ts'

class Node extends Dot {
  updateAverage(nodes: Node[]) {
    if (this.lock || this.pause) {
      return
    }
    for (const child of this.children(nodes)) {
      this.v.add(
        child.obj.position
          .subtract(this.obj.position)
          .multiplyScalar(0.1 * child.weight),
        this.v,
      )
    }
  }

  updatePhysics() {
    if (this.pause || this.lock) {
      return
    }
    this.a.multiplyScalar(0.06, this.a)
    this.v.add(this.a, this.v)
    this.v.multiplyScalar(0.99, this.v)
    this.obj.position.add(this.v, this.obj.position)
  }
}
export default () => {
  const mouseNodes = new Map<number, Node>()

  const width = window.innerWidth
  const height = window.innerHeight

  const app = new Application<HTMLCanvasElement>({
    antialias: true,
    background: '0xffffff',
    resizeTo: window,
    resolution: 1,
  })
  const spacing = 20
  const nWide = Math.ceil(width / spacing) + 2
  const nHigh = Math.ceil(height / spacing) + 2
  const nodes: Node[] = []

  const randomColor = Math.random() * 360
  for (let i = 0; i < nHigh; i += 1) {
    for (let j = 0; j < nWide; j += 1) {
      const circle = new PIXI.Graphics()
      const color = { h: (i + j) * 2 + randomColor, s: 65, l: 65 }
      circle.beginFill(color)
      circle.drawCircle(0, 0, 5)
      let child = new Graphics(circle.geometry)
      let lock = false
      if (i === 0 || j === 0 || j === nWide - 1 || i === nHigh - 1) {
        child = new Graphics()
        lock = true
      }
      const obj = app.stage.addChild(child)
      obj.position.set(j * spacing - 10, i * spacing - 10)
      const node = new Node(obj, i * nWide + j)
      // it looks cool if you don't lock anything
      node.lock = lock
      nodes[node.index] = node
      // above
      const above = nodes[(i - 1) * nWide + j]
      node.addChild(above)
      // above left
      // node.addChild(nodes[(i - 2) * nWide + j - 1]);
      // above right
      // node.addChild(nodes[(i - 1) * nWide + j + 1]);
      // left
      node.addChild(nodes[i * nWide + j - 1])
      // below
      // node.addChild(nodes[(i + 1) * nWide + j]);
    }
  }
  app.stage.interactive = true
  app.stage.hitArea = app.screen
  app.stage.addEventListener('pointermove', (e) => {
    const mouseNode = mouseNodes.get(e.pointerId)
    if (!mouseNode) {
      return
    }
    mouseNode.obj.position.copyFrom(e.global)
    for (const child of mouseNode.children(nodes)) {
      if (child.lock) {
        continue
      }
      child.obj.position.copyFrom(e.global)
    }
  })
  app.stage.addEventListener('pointerdown', (event) => {
    let mouseNode
    for (const node of Object.values(nodes)) {
      if (node.lock) {
        continue
      }
      node.weight = 1
      if (event.global.subtract(node.obj.position).magnitude() < 20) {
        mouseNodes.set(event.pointerId, node)
        mouseNode = node
        mouseNode.weight = 1
        break
      }
    }
    if (!mouseNode) {
      return
    }
    mouseNode.pause = true
    mouseNode.obj.position.copyFrom(event.global)
    for (const child of mouseNode.children(nodes)) {
      if (child.lock) {
        continue
      }
      child.obj.position.copyFrom(event.global)
      child.pause = true
    }
  })
  app.stage.addEventListener('pointerup', (event) => {
    const mouseNode = mouseNodes.get(event.pointerId)
    if (!mouseNode) {
      return
    }
    mouseNode.weight = 1
    mouseNode.obj.position.copyFrom(mouseNode.averageChildren(nodes))
    mouseNode.pause = false
    for (const child of mouseNode.children(nodes)) {
      child.pause = false
    }
    mouseNodes.delete(event.pointerId)
  })
  app.ticker.add(() => {
    for (const node of Object.values(nodes)) {
      node.updateAverage(nodes)
    }
    for (const node of Object.values(nodes)) {
      node.updatePhysics()
    }
  })
  return app
}
