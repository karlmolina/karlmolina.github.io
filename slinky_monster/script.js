let v;
let b;
const touchDevice = 'ontouchstart' in document.documentElement;

function setup() {
    if (touchDevice) {
        const canvas = createCanvas(windowWidth / 2, windowHeight / 2).elt;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        b = createVector(windowWidth / 4, windowHeight / 4);
    } else {

        createCanvas(windowWidth, windowHeight);
        b = createVector(windowWidth / 2, windowHeight / 2);
    }

    v = createVector(0, 25);
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function draw() {
    const period = 10;
    v.rotate(1 / period);
    let mouse = createVector(mouseX, mouseY);
    b = p5.Vector.lerp(b, mouse, 0.008);
    let a = p5.Vector.add(v, b);

    ellipse(a.x, a.y, 50, 50);
}

function touchMoved() {
    return false;
}

/* prevents the mobile browser from processing some default
 * touch events, like swiping left for "back" or scrolling
 * the page.
 */
document.ontouchmove = function (event) {
    event.preventDefault();
};