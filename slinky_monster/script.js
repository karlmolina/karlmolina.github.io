let v;
let b;

function setup() {
    createCanvas(windowWidth, windowHeight);
    v = createVector(0, 25);
    b = createVector(windowWidth / 2, windowHeight / 2);
}

function draw() {
    const period = 10;
    v.rotate(1 / period);
    let mouse = createVector(mouseX, mouseY);
    b = p5.Vector.lerp(b, mouse, 0.008);
    let a = p5.Vector.add(v, b);

    ellipse(a.x, a.y, 50, 50);
}