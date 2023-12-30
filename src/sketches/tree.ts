import { Vector } from 'p5';

import sketchUtils, { Sketch } from '../utils/sketch-utils.ts';

class TreeItem {
  p: Vector;
  v: Vector;
  private a: Vector;
  size: number;
  birthday: number;
  constructor(p: Vector, v: Vector, a: Vector, size: number) {
    this.p = p;
    this.v = v;
    this.a = a;
    this.a.limit(0.05);
    this.size = size;
    this.birthday = new Date().getTime();
  }

  update() {
    // You could make a decrease constantly
    this.v.add(this.a);
    this.v.setMag(1.1);
    this.v.add(Vector.random2D().limit(0.9 / this.size));
    this.p.add(this.v);
    this.size *= 0.998;
  }

  show(s: Sketch, size: number) {
    // fill brown
    s.stroke(255);
    s.fill(0);
    s.ellipse(this.p.x, this.p.y, size, size);
    // strokeWeight(size);
    // s.stroke(0, 0, 0, size);
    // s.line(this.prevP.x, this.prevP.y, this.p.x, this.p.y);
  }
}

export default (s: Sketch) => {
  let treeItems: TreeItem[];
  let reset = false;

  s.setup = () => {
    s.colorMode(s.HSB);
  };

  s.updateSketch = () => {
    s.background(255);
    treeItems = [];
    treeItems.push(
      new TreeItem(
        s.createVector(s.width / 2, s.height),
        s.createVector(0, -1.1),
        s.createVector(0, 0),
        100,
      ),
    );
  };

  s.draw = () => {
    console.log('tree items length' + treeItems.length);
    for (let j = 0; j < 10; j++) {
      for (let i = treeItems.length - 1; i >= 0; i--) {
        const item = treeItems[i];
        item.update();
        item.show(s, item.size);
        const timeSince = (birthday: number) => new Date().getTime() - birthday;
        const splitRate = (timeSince(item.birthday) / 1000) * (1 / item.size);
        const killRate = i / (treeItems.length * 9.5);
        // console.log(Math.ceil(item.size));
        if (
          item.p.x < 0 ||
          item.p.x > s.width ||
          item.p.y < 0 ||
          item.p.y > s.height ||
          item.size < 5 ||
          // (s.random() < killRate && item.size < 5) ||
          // (treeItems.length > 200 && item.size < 5) ||
          treeItems.length > 200
        ) {
          console.log('killed');
          treeItems.splice(i, 1);
          // draw a leaf at this position
          s.fill(255);
          s.ellipse(item.p.x, item.p.y, item.size, item.size);
          s.fill(s.random(0, 360), 100, 100, 0.5);
          s.noStroke();
          s.ellipse(item.p.x, item.p.y, s.random() * 20, s.random() * 20);
        } else if (s.random() < splitRate) {
          const v1 = item.v.copy();
          const rotateAngle = 0.5;
          v1.rotate(-rotateAngle);
          const newSize = (oldSize: number) => oldSize * 0.7;
          treeItems.push(
            new TreeItem(item.p.copy(), item.v.copy(), v1, newSize(item.size)),
          );
          // item.size = newSize(item.size);
          const v2 = item.v.copy();
          v2.rotate(rotateAngle);
          treeItems.push(
            new TreeItem(item.p.copy(), item.v.copy(), v2, newSize(item.size)),
          );
        }
      }
    }
  };

  s.keyPressed = () => {
    resetTree();
  };

  s.mousePressed = () => {
    if (!sketchUtils.isTouchDevice) {
      resetTree();
    }
  };

  s.touchStarted = () => {
    resetTree();
  };

  function resetTree() {
    if (reset) {
      s.updateSketch();
      reset = false;
    } else {
      treeItems = [];
      reset = true;
    }
  }
};
