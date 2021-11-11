const { Macroable } = require('@ostro/support/macro')

class HttpRouterContext extends Macroable {
    constructor(request, response, next) {
        super()
        Object.defineProperty(this, 'request', {
            value: request,
            enumerable: true,
            configurable: false,
            writable: false
        })
        Object.defineProperty(this, 'response', {
            value: response,
            enumerable: true,
            configurable: false,
            writable: false
        })
    }

}

module.exports = HttpRouterContext