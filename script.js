const touchDevice = 'ontouchstart' in document.documentElement;

function setup() {
    createCanvas(windowWidth, windowHeight);
    background(0);
    colorMode(HSB);
    strokeWeight(3);
}

let c = 0;

function draw() {
    if (!touchDevice) {
        background(0);
        text();
        return;
    }

    noStroke();
    if (touches.length > 0) {
        fill(0, 0.05);
        rect(0, 0, windowWidth, windowHeight);
        c = (c + 5) % 360;
    }
    // fill(c, 255, 255);
    // ellipse(mouseX, mouseY, 50, 50);
    stroke(c, 255, 255);
    touches.forEach(t1 => {
        touches.forEach(t2 => {
            if (t1 === t2) {
                return;
            }

            line(t1.x, t1.y, t2.x, t2.y);
        });
    });
}

// this prevents dragging screen around
function touchMoved() {
    return false;
}
