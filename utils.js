const {
    flatten
} = require("array-flatten");
exports.compose = function compose() {
    var handlers = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        handlers[_i] = arguments[_i];
    }
    var middleware = generate(handlers);
    return function compose(...context) {
        return middleware(null, ...context);
    }
}
exports.composeWith = function composeWith() {
    var handlers = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        handlers[_i] = arguments[_i];
    }
    var middleware = generate(handlers);
    return function(HttpContext) {
        return function(req, res, done) {
            let context = new HttpContext(req, res)

            return middleware(null, context, done);
        }
    };
}

exports.decode_param = function decode_param(val) {
    if (typeof val !== 'string' || val.length === 0) {
        return val;
    }

    try {
        return decodeURIComponent(val);
    } catch (err) {
        if (err instanceof URIError) {
            err.message = 'Failed to decode param \'' + val + '\'';
            err.status = err.statusCode = 400;
        }

        throw err;
    }
}
exports.urlNormalize = function urlNormalize() {
    var strArray;
    if (typeof arguments[0] === 'object') {
        strArray = arguments[0];
    } else {
        strArray = [].slice.call(arguments);
    }
    var resultArray = [];
    if (strArray.length === 0) {
        return '';
    }
    if (strArray[0].match(/^[^/:]+:\/*$/) && strArray.length > 1) {
        strArray[0] = strArray.shift() + strArray[0];
    }
    if (strArray[0].match(/^file:\/\/\//)) {
        strArray[0] = strArray[0].replace(/^([^/:]+):\/*/, '$1:///');
    } else {
        strArray[0] = strArray[0].replace(/^([^/:]+):\/*/, '$1://');
    }

    for (var i = 0; i < strArray.length; i++) {
        var component = strArray[i];
        if (component === '') {
            continue;
        }
        resultArray.push(component);
    }
    var parts = resultArray.filter((data) => data).join('/').replace(/\/(\?|&|#[^!])/g, '$1/').replace(/\/{2,}/g, '/').split('?')
    return parts.shift() + (parts.length > 0 ? '?' : '') + parts.join('&');

}

function generate(handlers) {
    var stack = flatten(handlers);
    for (var _i = 0, stack_1 = stack; _i < stack_1.length; _i++) {
        var handler = stack_1[_i];
        if (typeof handler !== 'function') {
            throw new TypeError('Handlers must be a function');
        }
    }

    return function middleware(err, httpContext, done) {

        var index = -1;

        function dispatch(pos, err) {
            var handler = stack[pos];

            index = pos;
            if (index === stack.length)
                return done(err);

            httpContext.next = err => {

                return dispatch(pos + 1, err);
            }

            try {
                if (handler.length === 3) {
                    if (err) {
                        return Promise.resolve(handler(err, httpContext, httpContext.next)).catch(httpContext.next);
                    }
                } else {
                    if (!err) {
                        return Promise.resolve(handler(httpContext, httpContext.next)).catch(httpContext.next);
                    }
                }
            } catch (e) {
                if (index > pos)
                    throw e;
                return httpContext.next(e);
            }
            return httpContext.next(err);
        }
        return dispatch(0, err);
    };
}