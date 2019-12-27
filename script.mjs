import sketchUtils from './utils/sketchUtils.mjs';

new p5(sketchUtils.wrapSketch(s => {
    class Link {
        constructor(name, linkPath) {
            this.name = name;
            this.linkPath = linkPath;
            this.v = p5.Vector.random2D();
            this.v.mult(2);
            this.textWidth = s.textWidth(this.name);
            this.width = this.textWidth / 2;
            this.height = s.textAscent() / 2;
            this.p = s.createVector(
                s.random(this.width, s.windowWidth - this.width),
                s.random(this.height, s.windowHeight - this.height));
        }

        update() {
            this.p.add(this.v);
            if (this.p.x - this.width < 0 || this.p.x + this.width > s.windowWidth) {
                this.v.x = -this.v.x;
            }
            if (this.p.y - this.height < 0 || this.p.y + this.height > s.windowHeight) {
                this.v.y = -this.v.y;
            }
            if (this.pointInside(s.mouseX, s.mouseY)) {
                document.body.style.cursor = 'pointer';
                if (s.mouseIsPressed) {
                    window.location.href = '/' + this.linkPath;
                }
            }
        }

        show() {
            s.fill(255);
            s.stroke(0);
            s.text(this.name, this.p.x, this.p.y);
            s.rectMode(s.CENTER);
            // sketch.rect(this.p.x, this.p.y, this.textWidth, 10);
        }

        pointInside(x, y) {
            return this.p.x - this.width < x &&
                this.p.x + this.width > x &&
                this.p.y - this.height < y &&
                this.p.y + this.height > y;
        }
    }

    let minSize, drawingSize, center, links;

    s.setup = () => {
        s.createCanvas(s.windowWidth, s.windowHeight);
        s.colorMode(s.HSB);
        s.textAlign(s.CENTER, s.CENTER);
        s.textFont('Neuton');
        updateSketch();

        // sketch.fill(255);
    };

    function updateSketch() {
        minSize = s.min(s.windowHeight, s.windowWidth);
        drawingSize = minSize / 2 - minSize / 50;
        center = s.createVector(s.windowWidth / 2, s.windowHeight / 2);
        s.strokeWeight(minSize / 200);
        s.textSize(s.windowWidth * 0.1);
        links = [];
        links.push(new Link('Connected', 'connected'));
        links.push(new Link('Slinky Monster', 'slinky_monster'));
        // links.push(new Link('Slinky Monster 2', 'slinky_monster_2'));
        links.push(new Link('Tic Tac Toe', 'tictactoe'));
        links.push(new Link('Tree', 'tree'));
        // sketch.background(0);
    }

    s.windowResized = () => {
        s.resizeCanvas(s.windowWidth, s.windowHeight);
        updateSketch();
    };

    s.draw = () => {
        // sketch.background(0);
        s.rectMode(s.CORNER);
        s.fill(0, 0.05);
        s.rect(0, 0, s.windowWidth, s.windowHeight);
        const period = 10000;
        // sketch.fill((sketch.frameCount % period) / period * 360, 100, 100);

        s.text('karlmolina.com', s.windowWidth / 2, .15 * s.windowHeight);
        // logMouseRatio();

        document.body.style.cursor = 'default';
        links.forEach(link => {
            link.update();
            link.show();
        });
    };

    function logMouseRatio() {
        console.log('x: ', s.mouseX / s.windowWidth);
        console.log('y: ', s.mouseY / s.windowHeight);
    }
}));

