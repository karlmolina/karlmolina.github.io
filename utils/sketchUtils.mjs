function getWindowDimensions(s) {
    const ratio = s.windowWidth / s.windowHeight;

    let width = s.windowWidth, height = s.windowHeight;

    if (sketchUtils.isTouchDevice) {
        if (height > width) {
            height = 650;
            width = height * ratio;
        } else {
            width = 650;
            height = width / ratio;
        }
    }

    return [width, height];
}

function showDebugInfo(s, pg, maxWidth) {
    pg.clear();
    const debugInfo = [
        'fps: ' + Math.round(s.frameRate()),
        'width: ' + s.width,
        'height: ' + s.height,
        'mouseX: ' + Math.round(s.mouseX),
        'mouseY: ' + Math.round(s.mouseY)
    ];

    debugInfo.forEach(info => {
        const width = pg.textWidth(info);
        if (width > maxWidth) {
            maxWidth = width;
        }
    });
    pg.push();
    pg.translate(10, 10);

    pg.rect(0, 0, Math.round(maxWidth) + 10, pg.textSize() * debugInfo.length + 5);

    for (let i = 0; i < debugInfo.length; i++) {
        const info = debugInfo[i];
        pg.text(info, 5, (i + 1) * pg.textSize());
    }

    pg.pop();

    s.image(pg, 0, 0);
}

function getCenter(s) {
    return s.createVector(s.width / 2, s.height / 2);
}

const sketchUtils = {
    isTouchDevice: 'ontouchstart' in document.documentElement,
    center: {},
    wrapSketch: function (wrappedSketchFunction) {
        return s => {
            wrappedSketchFunction(s);

            let pg;

            // Allow us to call updateSketch when it doesn't exist.
            const wrappedUpdateSketch = s.updateSketch;
            s.updateSketch = () => {
                if (wrappedUpdateSketch) {
                    wrappedUpdateSketch();
                }

                sketchUtils.center = getCenter(s);
            };

            const wrappedSetup = s.setup;
            s.setup = () => {
                const [width, height] = getWindowDimensions(s);
                s.createCanvas(width, height);

                wrappedSetup();
                s.updateSketch();
                pg = s.createGraphics(300, 300);
            };

            const wrappedWindowResized = s.windowResized;
            s.windowResized = () => {
                const [width, height] = getWindowDimensions(s);
                s.resizeCanvas(width, height);

                s.updateSketch();

                if (wrappedWindowResized) {
                    wrappedWindowResized();
                }
            };

            let maxWidth = 0;
            const wrappedDraw = s.draw;
            s.draw = () => {
                wrappedDraw();
                // showDebugInfo(s, pg, maxWidth);
            };
        };
    }
};

export default sketchUtils;
