import '@pixi/math-extras';

import * as PIXI from 'pixi.js';
import { Application, Point } from 'pixi.js';

function createVector(x, y) {
  return new PIXI.Point(x, y);
}

class Node {
  obj: any;
  lock: boolean;
  index: number;
  private v: Point;
  private a: Point;
  private _children: number[];
  weight: number;
  pause: boolean;
  constructor(obj) {
    this.obj = obj;
    this.v = createVector(0, 0);
    this.a = createVector(0, 0);
    this._children = [];
    this.weight = 1;
    this.pause = false;
  }

  averageChildren(nodes: Node[]) {
    const average = createVector(0, 0);
    for (const child of this.children(nodes)) {
      average.add(child.obj.position, average);
    }
    average.multiplyScalar(1 / this.children(nodes).length, average);
    return average;
  }

  updateAverage(nodes: Node[]) {
    if (this.lock || this.pause) {
      return;
    }
    for (const child of this.children(nodes)) {
      this.v.add(
        child.obj.position
          .subtract(this.obj.position)
          .multiplyScalar(0.1 * child.weight),
        this.v,
      );
    }
  }

  updatePhysics() {
    if (this.pause) {
      return;
    }
    this.a.multiplyScalar(0.06, this.a);
    this.v.add(this.a, this.v);
    this.v.multiplyScalar(0.99, this.v);
    this.obj.position.add(this.v, this.obj.position);
  }

  addChild(node: Node) {
    if (node === undefined) {
      return;
    }
    if (!this.lock) {
      this._children.push(node.index);
    }
    if (!node.lock) {
      node._children.push(this.index);
    }
  }

  children(nodes: Node[]) {
    return this._children.map((i) => nodes[i]);
  }
}
export default () => {
  let mouseNode: Node;
  // const { createVector, color, stroke,
  // strokeWeight, point, createCanvas, background, mouseX, mouseY, mouseIsPressed} = s;

  const width = window.innerWidth;
  const height = window.innerHeight;

  const app = new Application({
    antialias: true,
    background: '0xffffff',
    resizeTo: window,
    resolution: 1,
  });
  const spacing = 20;
  const nWide = Math.floor(width / spacing);
  const nHigh = Math.floor(height / spacing);
  const nodes: Node[] = [];

  const circle = new PIXI.Graphics();
  circle.beginFill(0x000000);
  circle.drawCircle(0, 0, 3);
  for (let i = 0; i < nHigh; i += 1) {
    for (let j = 0; j < nWide; j += 1) {
      const obj = app.stage.addChild(new PIXI.Graphics(circle.geometry));
      obj.position.set(j * spacing + 10, i * spacing + 10);
      const node = new Node(obj);
      if (i === 0 || j === 0 || j === nWide - 1 || i === nHigh - 1) {
        node.lock = true;
      }
      node.index = i * nWide + j;
      nodes[node.index] = node;
      // above
      node.addChild(nodes[(i - 1) * nWide + j]);
      // above left
      // node.addChild(nodes[(i - 1) * n + j - 1]);
      // above right
      // node.addChild(nodes[(i - 1) * n + j + 1]);
      // left
      node.addChild(nodes[i * nWide + j - 1]);
    }
  }
  app.stage.interactive = true;
  app.stage.hitArea = app.screen;
  app.stage.addEventListener('pointermove', (e) => {
    mouse.copyFrom(e.global);
    if (mouseIsPressed) {
      mouseNode.obj.position.copyFrom(mouse);
      mouseNode.pause = true;
      for (const child of mouseNode.children(nodes)) {
        child.obj.position.copyFrom(mouse);
        child.pause = true;
      }
    }
  });
  app.stage.addEventListener('pointerdown', (event) => {
    mouseIsPressed = true;
    for (const node of Object.values(nodes)) {
      if (node.lock) {
        continue;
      }
      node.weight = 1;
      if (event.global.subtract(node.obj.position).magnitude() < 20) {
        mouseNode = node;
        mouseNode.weight = 1;
        break;
      }
    }
    mouseNode.obj.position.copyFrom(mouse);
    mouseNode.pause = true;
    for (const child of mouseNode.children(nodes)) {
      child.obj.position.copyFrom(mouse);
      child.pause = true;
    }
  });
  app.stage.addEventListener('pointerup', () => {
    mouseIsPressed = false;
    mouseNode.weight = 1;
    mouseNode.obj.position.copyFrom(mouseNode.averageChildren(nodes));
  });
  app.ticker.add(() => {
    for (const node of Object.values(nodes)) {
      if (!mouseIsPressed) {
        node.pause = false;
      }
      node.updateAverage(nodes);
    }
    for (const node of Object.values(nodes)) {
      node.updatePhysics();
    }
  });

  // Create the application helper and add its render target to the page
  const mouse = new Point();
  let mouseIsPressed = false;
  return app;
};
