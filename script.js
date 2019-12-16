const touchDevice = 'ontouchstart' in document.documentElement;
let v1;
let center;
let minSize;
let drawingSize;

function setup() {
    createCanvas(windowWidth, windowHeight);
    colorMode(HSB);
    updateSketch();
}

function updateSketch() {
    minSize = min(windowHeight, windowWidth);
    drawingSize = minSize / 2 - minSize / 50;
    center = createVector(windowWidth / 2, windowHeight / 2);
    strokeWeight(minSize / 500);
    background(0);
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    updateSketch();
}

let c = 0;

function draw() {
    if (touchDevice) {
        drawMobile();
    } else {
        drawNonMobile();
    }
}

function drawNonMobile() {
    noStroke();
    fill(0, 0.05);
    rect(0, 0, windowWidth, windowHeight);
    c = (c + 2) % 360;
    // fill(c, 255, 255);
    // ellipse(mouseX, mouseY, 50, 50);
    period = 100;
    angle = ((frameCount % period) / period) * TWO_PI;
    // console.log(angle);
    let vectors = [];
    // vectors.push(getRotatedVectorAroundCenter(200, drawingSize, center));
    period = 300;
    vectors.push(getRotatedVectorAroundCenter(period, 0, drawingSize));
    vectors.push(
        getRotatedVectorAroundCenter(period * 1.2, 0, drawingSize * 0.3)
    );
    vectors.push(
        getRotatedVectorAroundCenter(-period / 2, period / 5, drawingSize / 4)
    );
    // vectors.push(getRotatedVectorAroundCenter(period, 0, drawingSize / 5));
    // vectors.push(getRotatedVectorAroundCenter(-period, 0, drawingSize / 2));
    // vectors.push({ x: mouseX, y: mouseY });
    // vectors.forEach(v => {
    //     ellipse(v.x, v.y, 10, 10);
    // });
    stroke(c, 255, 255);
    drawLines(vectors);
}

function getRotatedVector(period, periodOffset) {
    angle = (((frameCount + periodOffset) % period) / period) * TWO_PI;
    return p5.Vector.fromAngle(angle);
}

function getRotatedVectorAroundCenter(period, periodOffset, mag) {
    const v = getRotatedVector(period, periodOffset);
    v.setMag(mag);

    return p5.Vector.add(center, v);
}

function drawMobile() {
    noStroke();
    if (touches.length > 0) {
        fill(0, 0.05);
        rect(0, 0, windowWidth, windowHeight);
        c = (c + 2) % 360;
    }

    stroke(c, 255, 255);

    drawLines(touches);
}

function drawLines(vectors) {
    // for (let i = 0; i < vectors.length - 1; i++) {
    //     const t1 = vectors[i];
    //     const t2 = vectors[i + 1];
    //     drawLine(t1, t2);
    // }

    // if (vectors.length > 2) {
    //     drawLine(vectors[0], vectors[vectors.length - 1]);
    // }

    for (let i = 0; i < vectors.length; i++) {
        const t1 = vectors[i];
        for (let j = i + 1; j < vectors.length; j++) {
            const t2 = vectors[j];
            line(t1.x, t1.y, t2.x, t2.y);
        }
    }
}

function drawLine(t1, t2) {
    line(t1.x, t1.y, t2.x, t2.y);
}

function touchStarted() {
    var fs = fullscreen();
    if (!fs && touchDevice) {
        fullscreen(true);
    }
}

/* prevents the mobile browser from processing some default
 * touch events, like swiping left for "back" or scrolling
 * the page.
 */
document.ontouchmove = function(event) {
    event.preventDefault();
};

function touchMoved() {
    return false;
}
