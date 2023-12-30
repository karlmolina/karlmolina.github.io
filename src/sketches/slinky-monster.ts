import { Vector } from 'p5'

import sketchUtils, { Sketch } from '../utils/sketch-utils.ts'

export default (s: Sketch) => {
  let v: Vector
  let b: Vector
  const period = 10

  s.setup = () => {
    s.strokeWeight(0.3)
    s.noFill()
  }

  s.updateSketch = () => {
    b = s.createVector(s.width / 2, s.height / 2)
    v = s.createVector(0, 50)
  }

  s.draw = () => {
    for (let i = 0; i < 2; i++) {
      if (sketchUtils.isTouchDevice) {
        drawMobile()
      } else {
        drawNonMobile()
      }
    }
  }

  function drawMobile() {
    if (s.mouseIsPressed) {
      const a = getSlinky()

      s.ellipse(a.x, a.y, 65, 65)
    }
  }

  function drawNonMobile() {
    const a = getSlinky()
    if (!s.mouseIsPressed) {
      s.ellipse(a.x, a.y, 65, 65)
    }
  }

  function getSlinky() {
    v.rotate(1 / period)
    const mouse = s.createVector(s.mouseX, s.mouseY)
    b = Vector.lerp(b, mouse, 0.008)
    return Vector.add(v, b)
  }

  s.touchMoved = () => {
    return false
  }

  /* prevents the mobile browser from processing some default
   * touch events, like swiping left for "back" or scrolling
   * the page.
   */
  document.ontouchmove = function (event) {
    event.preventDefault()
  }

  s.keyPressed = () => {
    s.background(255)
  }
  const dblclick = () => {
    if (!s.isLooping()) {
      document.removeEventListener('dblclick', dblclick)
      console.log('removed')
    }
    s.background(255)
  }
  document.addEventListener('dblclick', dblclick)
}
