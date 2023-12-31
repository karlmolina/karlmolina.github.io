import { Application, Graphics, Point } from 'pixi.js'

import Dot from './dot.ts'

class Blob extends Dot {
  updateForce(nodes: Blob[]) {
    for (const child of this.children(nodes)) {
      // if it's closer than 20 then it's getting pushed away
      const distance = this.obj.position.subtract(child.obj.position)
      const normal = distance.normalize()
      normal.multiplyScalar(60, normal)
      const magnitude = distance.magnitude()
      const force = normal.subtract(distance).multiplyScalar(0.005)
      this.v.add(force, this.v)
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
  let mouseNode: Blob | undefined
  const nodes: Blob[] = []

  const width = window.innerWidth
  const height = window.innerHeight

  const app = new Application<HTMLCanvasElement>({
    antialias: true,
    background: '0xffffff',
    resizeTo: window,
    resolution: 1,
  })

  const circle = new Graphics()
  circle.beginFill(0x000000)
  circle.drawCircle(0, 0, 20)

  const redCircle = new Graphics()
  redCircle.beginFill(0x000000)
  redCircle.drawCircle(0, 0, 20)

  app.stage.interactive = true
  app.stage.hitArea = app.screen
  nodes.push(new Blob(app.stage.addChild(new Graphics(circle.geometry)), 0))
  nodes[0].obj.position.set(width / 2, height / 2)
  nodes.push(new Blob(app.stage.addChild(new Graphics(circle.geometry)), 1))
  nodes[1].obj.position.set(width / 2 + 1, height / 2 - 2)
  nodes[0].addChild(nodes[1])
  nodes.push(new Blob(app.stage.addChild(new Graphics(circle.geometry)), 2))
  nodes[2].obj.position.set(width / 2 + 3, height / 2 - 1)
  nodes[2].addChild(nodes[1])
  nodes[2].addChild(nodes[0])
  nodes.push(new Blob(app.stage.addChild(new Graphics(circle.geometry)), 3))
  nodes[3].obj.position.set(width / 2 + 4, height / 2 + 1)
  // why can't they be at the same position? if they are they shoot away reaaly fast
  // oh the distance is zero so the force is infinite lol thanks chatgpt
  nodes[3].addChild(nodes[1])
  nodes[3].addChild(nodes[0])
  // make it so the children change depending on which is closest
  const mouse = new Point()
  let mouseIsPressed = false
  app.stage.addEventListener('pointermove', (e) => {
    mouse.copyFrom(e.global)

    if (mouseIsPressed && mouseNode !== undefined) {
      mouseNode.obj.position.copyFrom(mouse)
      mouseNode.pause = true
    }
  })
  app.stage.addEventListener('pointerdown', (event) => {
    mouseIsPressed = true
    mouseNode = undefined
    for (const node of Object.values(nodes)) {
      if (node.lock) {
        continue
      }
      node.weight = 1
      if (mouse.subtract(node.obj.position).magnitude() < 20) {
        mouseNode = node
        mouseNode.weight = 1
        break
      }
    }
  })
  app.stage.addEventListener('pointerup', () => {
    mouseIsPressed = false
  })
  app.ticker.add(() => {
    for (const node of Object.values(nodes)) {
      if (!mouseIsPressed) {
        node.pause = false
      }
      node.updateForce(nodes)
    }
    for (const node of Object.values(nodes)) {
      node.updatePhysics()
    }
  })
  return app
}
