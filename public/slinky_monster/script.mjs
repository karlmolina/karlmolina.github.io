/**
 * Settings should include:
 * - no fill
 * - color fill
 * - speed of rotation
 * - radius of rotation
 * - size of circle
 * - square or circle
 * - inverted colors (black background)
 * - amount of circles to draw per frame
 * - stroke weight
 */


import sketchUtils from '../utils/sketchUtils.mjs';

new p5(sketchUtils.wrapSketch(s => {
    let v;
    let b;
    const period = 10;

    s.setup = () => {
        s.strokeWeight(0.3);
    };

    s.updateSketch = () => {
        b = s.createVector(s.width / 2, s.height / 2);
        v = s.createVector(0, 25);
    };

    s.draw = () => {
        if (sketchUtils.isTouchDevice) {
            drawMobile();
        } else {
            drawNonMobile();
        }
    };

    function drawMobile() {
        if (s.mouseIsPressed) {
            const a = getSlinky();

            s.ellipse(a.x, a.y, 50, 50);
        }
    }

    function drawNonMobile() {
        const a = getSlinky();
        if (!s.mouseIsPressed) {
            s.ellipse(a.x, a.y, 50, 50);
        }
    }

    function getSlinky() {
        v.rotate(1 / period);
        let mouse = s.createVector(s.mouseX, s.mouseY);
        b = p5.Vector.lerp(b, mouse, 0.008);
        return p5.Vector.add(v, b);
    }

    s.touchMoved = () => {
        return false;
    };

    /* prevents the mobile browser from processing some default
     * touch events, like swiping left for "back" or scrolling
     * the page.
     */
    document.ontouchmove = function (event) {
        event.preventDefault();
    };

    s.keyPressed = () => {
        s.background(255);
    };
}));