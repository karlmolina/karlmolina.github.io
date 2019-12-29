function resizeWindow(s) {
    s.windowWidth = s.windowWidth / 2;
    s.windowHeight = s.windowHeight / 2;
}

const sketchUtils = {
    isTouchDevice: 'ontouchstart' in document.documentElement,
    wrapSketch: function (wrappedFunction) {
        return s => {
            if (sketchUtils.isTouchDevice) {
                resizeWindow(s);
            }
            wrappedFunction(s);

            const wrappedWindowResized = s.windowResized;
            s.windowResized = () => {
                resizeWindow(s);
                wrappedWindowResized();
            };
        };
    }
};

export default sketchUtils;
