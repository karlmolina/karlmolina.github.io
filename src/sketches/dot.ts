import { Graphics, Point } from 'pixi.js'

export default class Dot {
  obj: Graphics
  lock: boolean
  index: number
  protected v: Point
  protected a: Point
  protected _children: number[]
  weight: number
  pause: boolean
  constructor(obj: Graphics, index: number) {
    this.obj = obj
    this.index = index
    this.v = new Point(0, 0)
    this.a = new Point(0, 0)
    this._children = []
    this.weight = 1
    this.pause = false
    this.lock = false
  }

  averageChildren(nodes: Dot[]) {
    const average = new Point(0, 0)
    for (const child of this.children(nodes)) {
      average.add(child.obj.position, average)
    }
    average.multiplyScalar(1 / this.children(nodes).length, average)
    return average
  }

  addChild(node: Dot) {
    if (node === undefined) {
      return
    }
    if (!this.lock) {
      this._children.push(node.index)
    }
    if (!node.lock) {
      node._children.push(this.index)
    }
  }

  children(nodes: Dot[]) {
    return this._children.map((i) => nodes[i])
  }
}
