class MockController {
    constructor(defaults) {
        this.defaults = defaults;
    }
    index(ctx, next) {
        return next ? next() : null;
    }
    handle(ctx, next) {
        return next ? next() : null;
    }
}

module.exports = MockController;
