const { pathToRegexp } = require('path-to-regexp');
const { decode_param } = require('./utils')

const hasOwnProperty = Object.prototype.hasOwnProperty;

class Layer {
    constructor(stack, opts = {}) {
        if (!(this instanceof Layer)) {
            return new Layer(path, opts);
        }

        this.handle = stack.handle;
        this.terminate = stack.terminate;
        this.$name = stack.name;
        this.$domain = stack.domain;
        this.$original = stack.url;
        this.$methods = stack.methods;
        this.$path = undefined;
        this.$regexp = pathToRegexp(stack.url, this.$keys = [], opts);
        this.$params = this.$keys;
        this.$regexp.fast_star = stack.url === '*';
        this.$regexp.fast_slash = stack.url === '/' && opts.end === false;
    }

    handle_error(error, ctx, next) {
        var fn = this.handle;

        if (fn.length !== 3) {
            return next(error);
        }

        try {
            return fn(error, ctx, next);
        } catch (err) {
            return next(err);
        }
    }

    handle_request(ctx, next) {
        var fn = this.handle;
        ctx.request.params = this.$params;

        if (fn.length > 2) {
            return next();
        }

        try {
            return fn(ctx, next);
        } catch (err) {
            return next(err);
        }
    }

    match(path) {
        var match;

        if (path != null) {

            if (this.$regexp.fast_slash) {
                this.$params = {};
                this.$path = '';
                return true;
            }

            if (this.$regexp.fast_star) {
                this.$params = {
                    '0': decode_param(path)
                };
                this.$path = path;
                return true;
            }

            match = this.$regexp.exec(path);
        }

        if (!match) {
            this.$params = undefined;
            this.$path = undefined;
            return false;
        }

        this.$params = {};
        this.$path = match[0];

        var keys = this.$keys;
        var params = this.$params;

        for (var i = 1; i < match.length; i++) {
            var key = keys[i - 1];
            var prop = key.name;
            var val = decode_param(match[i]);

            if (val !== undefined || !(hasOwnProperty.call(params, prop))) {
                params[prop] = val;
            }
        }

        return true;
    }
}

module.exports = Layer;
