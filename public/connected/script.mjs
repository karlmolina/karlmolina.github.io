import sketchUtils from '../utils/sketchUtils.mjs';

new p5(sketchUtils.wrapSketch(s => {
    const touchDevice = 'ontouchstart' in document.documentElement;
    let v1;
    let drawingSize;

    s.setup = () => {
        s.colorMode(s.HSB);
    };

    s.updateSketch = () => {
        drawingSize = sketchUtils.minSize / 2 - sketchUtils.minSize / 50;
        s.strokeWeight(sketchUtils.minSize / 500);
        s.background(0);
    };

    let c = 0;

    s.draw = () => {
        if (touchDevice) {
            drawMobile();
        } else {
            drawNonMobile();
        }
    };

    function drawNonMobile() {
        s.noStroke();
        s.fill(0, 0.05);
        s.rect(0, 0, s.width, s.height);
        c = (c + 2) % 360;
        let period = 100;
        const angle = ((s.frameCount % period) / period) * s.TWO_PI;
        let vectors = [];
        period = 300;
        vectors.push(getRotatedVectorAroundCenter(period, 0, drawingSize));
        vectors.push(
            getRotatedVectorAroundCenter(period * 1.2, 0, drawingSize * 0.3)
        );
        vectors.push(
            getRotatedVectorAroundCenter(-period / 2, period / 5, drawingSize / 4)
        );

        if (s.mouseIsPressed) {
            vectors.push(s.createVector(s.mouseX, s.mouseY));
        }

        s.stroke(c, 255, 255);
        drawLines(vectors);
    }

    function getRotatedVector(period, periodOffset) {
        const angle = (((s.frameCount + periodOffset) % period) / period) * s.TWO_PI;
        return p5.Vector.fromAngle(angle);
    }

    function getRotatedVectorAroundCenter(period, periodOffset, mag) {
        const v = getRotatedVector(period, periodOffset);
        v.setMag(mag);

        return p5.Vector.add(sketchUtils.center, v);
    }

    function drawMobile() {
        s.noStroke();
        if (s.touches.length > 0) {
            s.fill(0, 0.05);
            s.rect(0, 0, s.width, s.height);
            c = (c + 2) % 360;
        }

        s.stroke(c, 255, 255);

        drawLines(s.touches);
    }

    function drawLines(vectors) {
        for (let i = 0; i < vectors.length; i++) {
            const t1 = vectors[i];
            for (let j = i + 1; j < vectors.length; j++) {
                const t2 = vectors[j];
                drawLine(t1, t2);
            }
        }
    }

    function drawLine(t1, t2) {
        s.line(t1.x, t1.y, t2.x, t2.y);
    }

    /* prevents the mobile browser from processing some default
     * touch events, like swiping left for "back" or scrolling
     * the page.
     */
    document.ontouchmove = function (event) {
        event.preventDefault();
    };

    s.touchMoved = () => {
        return false;
    };
}));
