import { Graphics, Point } from 'pixi.js'

export default class Dot {
  obj: Graphics
  lock: boolean
  index: number
  v: Point
  protected a: Point
  _children: Set<number>
  weight: number
  pause: boolean
  constructor(obj: Graphics, index: number) {
    this.obj = obj
    this.index = index
    this.v = new Point(0, 0)
    this.a = new Point(0, 0)
    this._children = new Set()
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
      this._children.add(node.index)
    }
    if (!node.lock) {
      node._children.add(this.index)
    }
  }

  removeChild(node: Dot) {
    this._children.delete(node.index)
    node._children.delete(this.index)
  }

  children(nodes: Dot[]) {
    return [...this._children].map((i) => nodes[i])
  }

  furthestChild(nodes: Dot[]) {
    const index = [...this._children].reduce((a, b) =>
      this.obj.position.subtract(nodes[a].obj.position).magnitude() >
      this.obj.position.subtract(nodes[b].obj.position).magnitude()
        ? a
        : b,
    )
    return nodes[index]
  }

  sharesChild(node: Dot) {
    return [...this._children].some((i) => node._children.has(i))
  }

  childrenLength = () => this._children.size
}
