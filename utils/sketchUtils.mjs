const sketchUtils = {
    isTouchDevice: 'ontouchstart' in document.documentElement,
    wrapSketch: function (wrappedFunction) {
        return s => {
            if (sketchUtils.isTouchDevice) {
                s.windowWidth = s.windowWidth / 2;
                s.windowHeight = s.windowHeight / 2;
            }
            wrappedFunction(s);
        };
    }
};

export default sketchUtils;
