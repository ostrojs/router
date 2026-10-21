module.exports = {
    index(ctx, next) {
        return next ? next() : null;
    }
};
