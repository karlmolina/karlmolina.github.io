mySketch = new p5(sketch => {
    class Link {
        constructor(name, linkPath) {
            this.name = name;
            this.linkPath = linkPath;
            this.p = sketch.createVector(sketch.random(0, sketch.windowWidth), sketch.random(0, sketch.windowHeight));
            this.v = p5.Vector.random2D();
        }

        update() {
            this.p.add(this.v);
            if (this.p.x < 0 || this.p.x > sketch.windowWidth) {
                this.v.x = -this.v.x;
            }
            if (this.p.y < 0 || this.p.y > sketch.windowHeight) {
                this.v.y = -this.v.y;
            }
            if (this.p.dist(sketch.createVector(sketch.mouseX, sketch.mouseY)) < 50) {
                document.body.style.cursor = 'pointer';
                if (sketch.mouseIsPressed) {
                    window.location.href = '/' + this.linkPath;
                }
            } else {
                document.body.style.cursor = 'default';
            }
        }

        show() {
            sketch.text(this.name, this.p.x, this.p.y);
        }
    }

    let minSize, drawingSize, center, links = [];

    sketch.setup = () => {
        sketch.createCanvas(sketch.windowWidth, sketch.windowHeight);
        sketch.colorMode(sketch.HSB);
        updateSketch();
        sketch.textAlign(sketch.CENTER, sketch.CENTER);
        sketch.textFont('Neuton');
        links.push(new Link('Connected', 'connected'));
        links.push(new Link('Slinky Monster', 'slinky_monster'));
    };

    function updateSketch() {
        minSize = sketch.min(sketch.windowHeight, sketch.windowWidth);
        drawingSize = minSize / 2 - minSize / 50;
        center = sketch.createVector(sketch.windowWidth / 2, sketch.windowHeight / 2);
        sketch.strokeWeight(minSize / 500);
        sketch.textSize(sketch.windowWidth * 0.1);
        sketch.background(0);
    }

    sketch.windowResized = () => {
        sketch.resizeCanvas(sketch.windowWidth, sketch.windowHeight);
        updateSketch();
    };

    sketch.draw = () => {
        sketch.background(0);
        const period = 10000;
        sketch.fill((sketch.frameCount % period) / period * 360, 100, 100);

        sketch.text('karlmolina.com', sketch.windowWidth / 2, .15 * sketch.windowHeight);
        // logMouseRatio();

        links.forEach(link => {
            link.update();
            link.show();
        });
    };

    function logMouseRatio() {
        console.log('x: ', sketch.mouseX / sketch.windowWidth);
        console.log('y: ', sketch.mouseY / sketch.windowHeight);
    }
});

