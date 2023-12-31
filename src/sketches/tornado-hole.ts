import '@pixi/math-extras'

import * as PIXI from 'pixi.js'
import { Application, Point } from 'pixi.js'

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
    if (this.pause) {
      return
    }
    this.a.multiplyScalar(0.06, this.a)
    this.v.add(this.a, this.v)
    this.v.multiplyScalar(0.99, this.v)
    this.obj.position.add(this.v, this.obj.position)
  }
}
export default () => {
  let mouseNode: Node

  const width = window.innerWidth
  const height = window.innerHeight

  const app = new Application<HTMLCanvasElement>({
    antialias: true,
    background: '0xffffff',
    resizeTo: window,
    resolution: 1,
  })
  const spacing = 20
  const nWide = Math.floor(width / spacing)
  const nHigh = Math.floor(height / spacing)
  const nodes: Node[] = []

  const circle = new PIXI.Graphics()
  circle.beginFill(0x000000)
  circle.drawCircle(0, 0, 3)
  for (let i = 0; i < nHigh; i += 1) {
    for (let j = 0; j < nWide; j += 1) {
      const obj = app.stage.addChild(new PIXI.Graphics(circle.geometry))
      obj.position.set(j * spacing + 10, i * spacing + 10)
      const node = new Node(obj, i * nWide + j)
      if (i === 0 || j === 0 || j === nWide - 1 || i === nHigh - 1) {
        node.lock = true
      }
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
  const mouse = new Point()
  let mouseIsPressed = false
  app.stage.addEventListener('pointermove', (e) => {
    mouse.copyFrom(e.global)
    if (mouseIsPressed) {
      mouseNode.obj.position.copyFrom(mouse)
      mouseNode.pause = true
      for (const child of mouseNode.children(nodes)) {
        child.obj.position.copyFrom(mouse)
        child.pause = true
      }
    }
  })
  app.stage.addEventListener('pointerdown', (event) => {
    mouseIsPressed = true
    for (const node of Object.values(nodes)) {
      if (node.lock) {
        continue
      }
      node.weight = 1
      if (event.global.subtract(node.obj.position).magnitude() < 20) {
        mouseNode = node
        mouseNode.weight = 1
        break
      }
    }
    mouseNode.obj.position.copyFrom(mouse)
    mouseNode.pause = true
    for (const child of mouseNode.children(nodes)) {
      child.obj.position.copyFrom(mouse)
      child.pause = true
    }
  })
  app.stage.addEventListener('pointerup', () => {
    mouseIsPressed = false
    mouseNode.weight = 1
    mouseNode.obj.position.copyFrom(mouseNode.averageChildren(nodes))
  })
  app.ticker.add(() => {
    for (const node of Object.values(nodes)) {
      if (!mouseIsPressed) {
        node.pause = false
      }
      node.updateAverage(nodes)
    }
    for (const node of Object.values(nodes)) {
      node.updatePhysics()
    }
  })
  return app
}
