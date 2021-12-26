require('@ostro/support/helpers')
const RouterContract = require('@ostro/contracts/router/router')
const path = require('path');
const MethodNotAvailable = require('@ostro/support/exceptions/methodNotAvailable')
const PageNotFoundException = require('@ostro/support/exceptions/pageNotFoundException')
const InvalidArgumentException = require('@ostro/support/exceptions/invalidArgumentException')
const InvalidRouteExceptions = require('./exceptions/invalidRouteExceptions')
const { Macroable } = require('@ostro/support/macro')
const Layer = require('./layer')
const { compose, composeWith, urlNormalize } = require('./utils')
const pathToRegexp = require('path-to-regexp')
const difference = require('lodash').difference
const url = require('url');
const HttpContext = require('./httpContext')
const ExceptionHandler = require('./exceptionHandler')
const kLayers = Symbol('kLayers')
const kRegexConfig = Symbol('kRegexConfig')
const kHandlerExtend = Symbol('handlerExtend')
const kArgumentCustomizer = Symbol('argumentCustomizer')
const kMiddlewares = Symbol('middlewares')
const middlewares = Object.create(null)
const controllers = Object.create(null)
const stacks = []
class Route {
    $verbs = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

    constructor(opt = {}) {
        opt = Object.assign({ prefix: '/', suffix: '/', namespace: '', middlewares: [], url: '/', name: '', handle: null, defaults: null }, opt)

        this.$currentStack = stacks.push({
            prefix: opt.prefix,
            suffix: opt.suffix,
            namespace: opt.namespace,
            middlewares: [...(opt.middlewares || [])],
            url: opt.url,
            name: opt.name,
            handle: null,
            methods: [],
            defaults: opt.defaults,
            domain: opt.domain
        }) - 1
        this.$stack = stacks[this.$currentStack]
    }

    get($uri, $action = null) {
        return this.addRoute(['GET', 'HEAD'], $uri, $action);
    }

    post($uri, $action = null) {
        return this.addRoute('POST', $uri, $action);
    }

    put($uri, $action = null) {
        return this.addRoute('PUT', $uri, $action);
    }

    patch($uri, $action = null) {
        return this.addRoute('PATCH', $uri, $action);
    }

    delete($uri, $action = null) {
        return this.addRoute('DELETE', $uri, $action);
    }

    options($uri, $action = null) {
        return this.addRoute('OPTIONS', $uri, $action);
    }

    any($uri, $action = null) {
        return this.addRoute(this.$verbs, $uri, $action);
    }

    redirect($uri, $destination, $status = 302) {
        return this.any($uri, function({
            request,
            response,
            next
        }) {
            response.writeHead($status, {
                Location: $destination
            });
            response.end()
        })
    }

    permanentRedirect($uri, $destination) {
        return this.redirect($uri, $destination, 301);
    }

    view($uri, $view, $data = {}, $status = 200, $headers = {}) {
        return this.match(['GET', 'HEAD'], $uri, require('@ostro/router/viewController'))
            .setDefaults({
                'view': $view,
                'data': $data,
                'status': $status ? $status : 200,
                'headers': $headers ? $headers : {},
            });
    }

    match($methods, $uri, $action = null) {
        $methods = $methods.map(method => method.toUpperCase())
        return this.addRoute($methods, $uri, $action);
    }

    middleware(callback) {
        if (Array.isArray(callback))
            this.$stack.middlewares = this.$stack.middlewares.concat(callback)
        else
            this.$stack.middlewares.push(callback)
        return this
    }

    prefix(prefix) {
        this.$stack.prefix = this.$stack.prefix + prefix
        return this
    }

    suffix(suffix) {
        this.$stack.suffix = this.$stack.suffix + suffix
        return this
    }

    domain(domain) {
        this.$stack.domain = domain
        return this
    }

    namespace(namespace) {
        this.$stack.namespace = this.$stack.namespace + (namespace || '')
        return this
    }

    name(name) {
        this.$stack.name += name
        return this
    }

    group(opt = {}, callback) {
        if (typeof opt == 'string') {
            callback = require(opt)
            opt = {}
        } else if (typeof opt == 'function') {
            callback = opt
            opt = {}
        }
        let inst = new GroupRoute(opt, this.$stack)
        callback.call(inst, inst);
    }

    setDefaults(defaults = {}) {
        this.$stack.defaults = { ...this.$stack.defaults,
            ...defaults
        }
    }

    addRoute($methods, $uri, $action) {
        this.$stack.url = $uri
        this.$stack.methods = $methods
        this.$stack.handle = $action
        return this
    }

}
class GroupRoute extends Macroable {
    opt = {}
    constructor(opt = null, old = {}) {
        super()

        if (opt == null && old == null) {
            return this
        }
        opt = Object.assign({ prefix: '/', suffix: '/', namespace: '', middleware: [], url: '/', name: '', handle: null, defaults: null }, opt)
        old = Object.assign({ prefix: '/', suffix: '/', namespace: '', middlewares: [], url: '/', name: '', handle: null, defaults: null }, old)

        this.opt.prefix = old.prefix + opt.prefix;
        this.opt.suffix = old.suffix + opt.suffix;
        this.opt.namespace = opt.namespace ? path.join(old.namespace, opt.namespace) : old.namespace
        this.opt.middlewares = old.middlewares.concat(opt.middleware);
        this.opt.url = old.url + opt.url;
        this.opt.name = old.name + opt.name;
        this.opt.handle = null
        this.opt.defaults = null
        this.opt.domain = opt.domain || old.domain
    }
    group(opt, callback) {
        if (typeof this.opt == 'function') {
            this.opt = {}
        }
        let inst = new GroupRoute(opt, this.opt)
        callback.call(inst, inst);
    }

    __get(target, method) {
        return this.make(new Route(target.opt), method)
    }
}

class Router extends Macroable.extend(RouterContract) {
    constructor($app = {}, regexConfig = {
        sensitive: false,
        strict: false,
        end: true
    }, callbackHandler) {
        super()
        this.$app = $app
        this[kMiddlewares] = {
            default: [],
            named: {},
        }
        Object.defineProperty(this, kRegexConfig, {
            value: regexConfig,
            configurable: true,
            enumerable: false,
            writable: true
        })
        this.httpContextHandler(HttpContext)

    }

    getMiddleware(middleware) {
        const middlewareName = middleware
        let params = []

        if (typeof middleware == 'string' && middleware.includes(':')) {
            let splitedMiddleware = middleware.split(':')
            middleware = splitedMiddleware[0]
            if (typeof splitedMiddleware[1] == 'string') {
                params = splitedMiddleware[1].split(',')
            }

        }


        if (typeof middleware === 'function') {
            return this.resolveMiddleware(middleware, params)
        }

        if (middlewares[middlewareName]) {
            return middlewares[middlewareName]
        }

        if (!this[kMiddlewares]['named'][middleware])
            throw new MethodNotAvailable('middleware [{' + middleware + '}] is not available')
        if (!middlewares[middlewareName]) {
            let namedMiddleware = this[kMiddlewares]['named'][middleware]
            if (!Array.isArray(namedMiddleware)) {

                middlewares[middlewareName] = this.resolveMiddleware(namedMiddleware, params)

            } else {
                middlewares[middlewareName] = this[kMiddlewares]['named'][middleware].map(handler => {
                    if (handler instanceof Array)
                        return handler.reduce((acc, val) => acc.concat(val), [])
                    return handler
                }).map(handler => {

                    return this.resolveMiddleware(handler, params)
                }).filter(data => data);
            }

        }
        return middlewares[middlewareName]
    }

    resolveMiddleware(handler, params) {

        if (IsClass(handler)) {
            handler.prototype.$app = this.$app
            handler = new handler(...params)
        }
        if (typeof handler == 'object' && !Array.isArray(handler)) {
            if (typeof handler.handle == 'function') {
                return handler.handle.bind(handler)

            }
        } else {
            return handler
        }
    }

    createLayer(stack) {
        const self = this

        if (typeof stack.handle == 'string') {
            let [controller, callback] = stack.handle.split('::')
            let controllerPath = path.normalize(path.join(path.resolve(stack.namespace), controller))
            if (!controllers[controllerPath]) {
                let clazz = require(controllerPath)
                if (IsClass(clazz)) {
                    clazz.prototype.$app = this.$app
                    clazz = new clazz(stack.defaults)
                }
                controllers[controllerPath] = clazz
            }
            if (callback && !controllers[controllerPath][callback]) {
                throw new MethodNotAvailable(`Specified [{${callback}}] method was not available in [{${controllerPath}}]`)
            }
            stack.handle = controllers[controllerPath][callback].bind(controllers[controllerPath])

        } else if (Array.isArray(stack.handle)) {
            let [controller, callback] = stack.handle
            controller.prototype.$app = this.$app
            controller = new controller(stack.defaults)
            stack.handle = controller[callback].bind(controller)
        } else {
            if (IsClass(stack.handle)) {
                stack.handle.prototype.$app = this.$app
                stack.handle = new stack.handle(stack.defaults)
            }
            if (typeof stack.handle == 'object') {
                let callback = 'handle'
                if (callback && !stack.handle[callback]) {
                    throw new MethodNotAvailable(`Specified [{${callback}}] method was not available`)
                }
                stack.handle = stack.handle[callback].bind(stack.handle)
            }
        }
        let middlewares = stack.middlewares.map(middleware => this.getMiddleware(middleware)).reduce((acc, val) => acc.concat(val), []);
        middlewares.push(stack.handle)
        let url = urlNormalize('/', stack.prefix, stack.url, stack.suffix).replace(/^\/|\/$/g, '')
        return new Layer({
            url: '/' + url,
            methods: stack.methods,
            name: stack.name,
            domain: stack.domain,
            handle: compose(middlewares),

        }, {
            sensitive: this[kRegexConfig]['sensitive'] || false,
            strict: this[kRegexConfig]['strict'] || false,
            end: this[kRegexConfig]['end'] || true,
        })
    }

    namedMiddleware(key, value) {
        this[kMiddlewares]['named'][key] = value
    }

    defaultMiddlewares(middlewares = []) {
        this[kMiddlewares]['default'] = this[kMiddlewares]['default'].concat(middlewares)
    }

    registerDefaultMiddleware() {
        if (this[kMiddlewares]['default'] instanceof Array) {
            return this[kMiddlewares]['default'].map(middleware => {
                if (typeof middleware == 'string') {
                    middleware = require(path.normalize(middleware))
                }
                if (IsClass(middleware)) {
                    if (typeof middleware.prototype.handle != 'function') {
                        middleware.prototype.handle = function({},
                            next
                        ) {
                            next()
                        }
                    }
                    if (!middlewares[middleware]) {
                        middleware.prototype.$app = this.$app

                        middlewares[middleware] = new middleware()
                    }
                    middleware = middlewares[middleware]
                    let handle = middleware.handle.bind(middleware)
                    Object.defineProperty(handle, "name", {
                        value: middleware.constructor.name
                    });
                    middleware = handle
                }
                return middleware
            })
        }
        return []
    }

    httpContextHandler(httpContext) {
        this.httpContext = httpContext
    }

    handle() {
        this[kLayers] = stacks.filter(stack => stack.handle).map(stack => this.createLayer(stack))
        let self = this
        let middlewares = [function urlHander({ request, response }, next) {
            if (typeof request._parsedUrl != 'object') {
                request._parsedUrl = url.parse(request.url, false)
            }
            next()
        }]
        middlewares = middlewares.concat(this.registerDefaultMiddleware())
        middlewares.push(function layerHandler(ctx, next) {

            let layer = self[kLayers].find(route => {
                if (route.$domain != undefined && ctx.request.headers.host != route.$domain)
                    return false
                return (route.match(ctx.request._parsedUrl.pathname) && (route.$methods.indexOf(ctx.request.method) > -1))
            })
            if (layer) {
                layer.handle_request(ctx, next)
            } else {
                next(new PageNotFoundException())
            }

        })
        let exceptionHandler = new ExceptionHandler()
        exceptionHandler = exceptionHandler.handle.bind(ExceptionHandler)
        Object.defineProperty(exceptionHandler, "name", {
            value: ExceptionHandler.name
        });
        middlewares = middlewares.filter(handler => {
            if (handler.length == 3) {
                exceptionHandler = handler
                return false
            }
            return true
        })
        middlewares.push(exceptionHandler)
        global.route = (name, params) => {
            return this.route(name, params)
        }
        return composeWith(middlewares)(this.httpContext)

    }

    route(name, ...params) {

        let currentRoute = this[kLayers].find(layer => (layer.$name == name && name != ''))
        if (!currentRoute) {
            throw new InvalidRouteExceptions('Route name [{' + name + '}] not found')
        }
        let currentRouteParams = (currentRoute.$keys || [])
        if (currentRouteParams.length && currentRouteParams.length != params.length) {
            throw new InvalidArgumentException('Invalid Route params in [' + name + ']')
        }
        let mParams = {}
        for (let i = 0; i < currentRouteParams.length; i++) {
            mParams[currentRouteParams[i]['name']] = params[i]
        }
        return pathToRegexp.compile(currentRoute.$original, { encode: encodeURIComponent })(mParams, { validate: false })
    }

    currentRoute(request) {
        return this[kLayers].find(route => {
            if (route.$domain != undefined && request.headers.host != route.$domain)
                return false
            return (route.match(request._parsedUrl.pathname) && (route.$methods.indexOf(request.method) > -1))
        })
    }

    bindToResponse(HttpResponse) {
        let self = this;

        HttpResponse.prototype.route = function(name, params) {
            this.redirect(self.route(name, params))
        };
    }


    __get(target, method) {
        return this.make(new GroupRoute, method)

    }

}
module.exports = Router