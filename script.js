mySketch = new p5(sketch => {
    class Link {
        constructor(name, linkPath) {
            this.name = name;
            this.linkPath = linkPath;
            this.v = p5.Vector.random2D();
            this.v.mult(2);
            this.textWidth = sketch.textWidth(this.name);
            this.width = this.textWidth / 2;
            this.height = sketch.textAscent() / 2;
            this.p = sketch.createVector(
                sketch.random(this.width, sketch.windowWidth - this.width),
                sketch.random(this.height, sketch.windowHeight - this.height));
        }

        update() {
            this.p.add(this.v);
            if (this.p.x - this.width < 0 || this.p.x + this.width > sketch.windowWidth) {
                this.v.x = -this.v.x;
            }
            if (this.p.y - this.height < 0 || this.p.y + this.height > sketch.windowHeight) {
                this.v.y = -this.v.y;
            }
            if (this.pointInside(sketch.mouseX, sketch.mouseY)) {
                document.body.style.cursor = 'pointer';
                if (sketch.mouseIsPressed) {
                    window.location.href = '/' + this.linkPath;
                }
            }
        }

        show() {
            sketch.fill(255);
            sketch.stroke(0);
            sketch.text(this.name, this.p.x, this.p.y);
            sketch.rectMode(sketch.CENTER);
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

    sketch.setup = () => {
        sketch.createCanvas(sketch.windowWidth, sketch.windowHeight);
        sketch.colorMode(sketch.HSB);
        sketch.textAlign(sketch.CENTER, sketch.CENTER);
        sketch.textFont('Neuton');
        updateSketch();

        // sketch.fill(255);
    };

    function updateSketch() {
        minSize = sketch.min(sketch.windowHeight, sketch.windowWidth);
        drawingSize = minSize / 2 - minSize / 50;
        center = sketch.createVector(sketch.windowWidth / 2, sketch.windowHeight / 2);
        sketch.strokeWeight(minSize / 200);
        sketch.textSize(sketch.windowWidth * 0.1);
        links = [];
        links.push(new Link('Connected', 'connected'));
        links.push(new Link('Slinky Monster', 'slinky_monster'));
        links.push(new Link('Slinky Monster 2', 'slinky_monster_2'));
        links.push(new Link('Tic Tac Toe', 'tictactoe'));
        // sketch.background(0);
    }

    sketch.windowResized = () => {
        sketch.resizeCanvas(sketch.windowWidth, sketch.windowHeight);
        updateSketch();
    };

    sketch.draw = () => {
        // sketch.background(0);
        sketch.rectMode(sketch.CORNER);
        sketch.fill(0, 0.05);
        sketch.rect(0, 0, sketch.windowWidth, sketch.windowHeight);
        const period = 10000;
        // sketch.fill((sketch.frameCount % period) / period * 360, 100, 100);

        sketch.text('karlmolina.com', sketch.windowWidth / 2, .15 * sketch.windowHeight);
        // logMouseRatio();

        document.body.style.cursor = 'default';
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

