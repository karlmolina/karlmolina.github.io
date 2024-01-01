import { Application, FederatedPointerEvent, Graphics, Point } from 'pixi.js'

import Dot from './dot.ts'

const DIST_BETWEEN = 40
class Blob extends Dot {
  pointerDown = false
  updateForce(nodes: Blob[]) {
    if (this.lock || this.pause) {
      return
    }
    const acceleration = new Point(0, 0)
    for (const child of this.children(nodes)) {
      let distance = this.obj.position.subtract(child.obj.position)
      const magnitude = distance.magnitude()
      if (magnitude < DIST_BETWEEN) {
        continue
      }
      if (distance.x === 0 && distance.y === 0) {
        distance = new Point(Math.random() * 0.0001, Math.random() * 0.0001)
      }
      const normal = distance.normalize()
      normal.multiplyScalar(DIST_BETWEEN, normal)
      const force = normal.subtract(distance).multiplyScalar(0.5)
      acceleration.add(force, acceleration)
    }
    // limit the acceleration
    const maxAcceleration = 0.2
    // if (acceleration.magnitude() > maxAcceleration) {
    //   acceleration.normalize().multiplyScalar(maxAcceleration, acceleration)
    // }

    this.v.add(acceleration, this.v)
  }
  updatePhysics() {
    if (this.pause) {
      return
    }

    this.a.multiplyScalar(0.7, this.a)
    // limit the velocity
    const maxVelocity = 15
    if (this.v.magnitude() > maxVelocity) {
      this.v.normalize().multiplyScalar(maxVelocity, this.v)
    }
    this.v.add(this.a, this.v)
    const magnitude = this.v.magnitude()
    const slowDownConstant = 100
    const slowDown = slowDownConstant / (magnitude + slowDownConstant) - 0.05
    this.v.multiplyScalar(slowDown, this.v)
    this.obj.position.add(this.v, this.obj.position)
  }
}
export default () => {
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
  const numNodes = 100
  const center = new Point(width / 2, height / 2)
  const randomColor = Math.random() * 360
  for (let i = 0; i < numNodes; i++) {
    const circle = new Graphics()
    const color = { h: Math.random() * 100 + randomColor, s: 65, l: 65 }
    circle.beginFill(color)
    circle.drawCircle(0, 0, 20)
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
      node.updateForce(nodes)
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
        if (magnitude < DIST_BETWEEN) {
          const normal = distance.normalize()
          normal.multiplyScalar(DIST_BETWEEN, normal)
          const force = normal.subtract(distance).multiplyScalar(0.02)
          node.v.add(force, node.v)
          // add child
          if (!node.sharesChild(otherNode)) {
            node.addChild(otherNode)
          }
        }
      }
      // if the node has more than 3 children, remove the furthest one until there are 3
      while (node.childrenLength() > 4) {
        const furthest = node.furthestChild(nodes)
        node.removeChild(furthest)
      }
    }
    for (const node of Object.values(nodes)) {
      node.updatePhysics()
    }
  })
  return app
}
