import RouterContract, { type IRouter } from '@ostro/contracts/router/router';
import path from 'path';
import fs from 'fs';
import MethodNotAvailable from '@ostro/support/exceptions/methodNotAvailable';
import PageNotFoundException from '@ostro/support/exceptions/pageNotFoundException';
import InvalidArgumentException from '@ostro/support/exceptions/invalidArgumentException';
import InvalidRouteExceptions from './exceptions/invalidRouteExceptions';
import { Macroable } from '@ostro/support/macro';
import Layer from './layer';
import { compose, composeWith, urlNormalize } from './utils';
import * as pathToRegexp from 'path-to-regexp';
import url from 'url';
import HttpContext from './httpContext';
import ExceptionHandler from './exceptionHandler';
import ViewController from './viewController';
import { IsClass } from '@ostro/support/function';

/** Unique symbol for internal layer storage. */
const kLayers: unique symbol = Symbol('kLayers');

/** Unique symbol for regex options configuration. */
const kRegexConfig: unique symbol = Symbol('kRegexConfig');

/** Unique symbol for middleware registry. */
const kMiddlewares: unique symbol = Symbol('middlewares');

const middlewares: Record<string, any> = Object.create(null);
const controllers: Record<string, any> = Object.create(null);
const stacks: RouteStack[] = [];

interface RouteStack {
    prefix: string;
    suffix: string;
    namespace: string;
    middlewares: any[];
    url: string;
    name: string;
    handle: any;
    methods: string[];
    defaults: any;
    domain?: string;
    [key: string]: any;
}

function resolveModule(modPath: string): any {
    let mod: any;
    let target = modPath;
    if (typeof target === 'string' && target.startsWith('~/')) {
        target = path.resolve(process.cwd(), target.slice(2));
    }
    try {
        mod = require(target);
    } catch (err: any) {
        if (err && err.code === 'MODULE_NOT_FOUND') {
            const cwd: string = process.cwd().replace(/^\/private/, '');
            const normTarget: string = target.replace(/^\/private/, '');
            const rel: string = path.relative(cwd, normTarget);
            if (!rel.startsWith('..') && !rel.startsWith('.dist' + path.sep) && !rel.startsWith('build' + path.sep)) {
                let userOutDir = process.env.OSTRO_BUILD_DIR || '';
                if (!userOutDir) {
                    for (const tsConfigFile of ['tsconfig.build.json', 'tsconfig.json']) {
                        const fullTsPath = path.join(cwd, tsConfigFile);
                        if (fs.existsSync(fullTsPath)) {
                            try {
                                const parsed = JSON.parse(fs.readFileSync(fullTsPath, 'utf8'));
                                if (parsed && parsed.compilerOptions && parsed.compilerOptions.outDir) {
                                    userOutDir = parsed.compilerOptions.outDir.replace(/^\.[/\\]/, '');
                                    break;
                                }
                            } catch (_) {}
                        }
                    }
                }
                userOutDir = userOutDir || '.dist';
                const distCandidate: string = path.join(cwd, userOutDir, rel);
                const buildCandidate: string = path.join(cwd, 'build', rel);
                try {
                    mod = require(distCandidate);
                } catch {
                    try {
                        mod = require(buildCandidate);
                    } catch {
                        throw err;
                    }
                }
            } else {
                throw err;
            }
        } else {
            throw err;
        }
    }
    return (mod && (mod.__esModule || mod.default) && mod.default) ? mod.default : mod;
}

/**
 * Route definition class representing an individual route being configured.
 */
class Route {
    /**
     * Supported HTTP verbs.
     */
    public $verbs: string[] = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

    /**
     * Index of current stack item.
     */
    public $currentStack: number;

    /**
     * Reference to the route stack definition.
     */
    public $stack: RouteStack;

    /**
     * Create a new Route instance.
     *
     * @param opt - Route configuration options.
     */
    constructor(opt: Record<string, any> = {}) {
        opt = Object.assign({ prefix: '/', suffix: '/', namespace: '', middlewares: [], url: '/', name: '', handle: null, defaults: null }, opt);

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
        }) - 1;
        this.$stack = stacks[this.$currentStack];
    }

    /**
     * Register a GET route.
     *
     * @param $uri - Route URI pattern.
     * @param $action - Route handler action.
     * @returns This route instance.
     */
    public get($uri: string, $action: any = null): this {
        return this.addRoute(['GET', 'HEAD'], $uri, $action);
    }

    /**
     * Register a POST route.
     *
     * @param $uri - Route URI pattern.
     * @param $action - Route handler action.
     * @returns This route instance.
     */
    public post($uri: string, $action: any = null): this {
        return this.addRoute('POST', $uri, $action);
    }

    /**
     * Register a PUT route.
     *
     * @param $uri - Route URI pattern.
     * @param $action - Route handler action.
     * @returns This route instance.
     */
    public put($uri: string, $action: any = null): this {
        return this.addRoute('PUT', $uri, $action);
    }

    /**
     * Register a PATCH route.
     *
     * @param $uri - Route URI pattern.
     * @param $action - Route handler action.
     * @returns This route instance.
     */
    public patch($uri: string, $action: any = null): this {
        return this.addRoute('PATCH', $uri, $action);
    }

    /**
     * Register a DELETE route.
     *
     * @param $uri - Route URI pattern.
     * @param $action - Route handler action.
     * @returns This route instance.
     */
    public delete($uri: string, $action: any = null): this {
        return this.addRoute('DELETE', $uri, $action);
    }

    /**
     * Register an OPTIONS route.
     *
     * @param $uri - Route URI pattern.
     * @param $action - Route handler action.
     * @returns This route instance.
     */
    public options($uri: string, $action: any = null): this {
        return this.addRoute('OPTIONS', $uri, $action);
    }

    /**
     * Register a route matching any HTTP verb.
     *
     * @param $uri - Route URI pattern.
     * @param $action - Route handler action.
     * @returns This route instance.
     */
    public any($uri: string, $action: any = null): this {
        return this.addRoute(this.$verbs, $uri, $action);
    }

    /**
     * Register a redirect route with specified HTTP status.
     *
     * @param $uri - Source URI.
     * @param $destination - Destination URI.
     * @param $status - HTTP status code (default 302).
     * @returns This route instance.
     */
    public redirect($uri: string, $destination: string, $status: number = 302): this {
        return this.any($uri, function ({
            response,
        }: Record<string, any>) {
            response.writeHead($status, {
                Location: $destination
            });
            response.end();
        });
    }

    /**
     * Register a permanent redirect route (status 301).
     *
     * @param $uri - Source URI.
     * @param $destination - Destination URI.
     * @returns This route instance.
     */
    public permanentRedirect($uri: string, $destination: string): this {
        return this.redirect($uri, $destination, 301);
    }

    /**
     * Register a view route that renders a template directly.
     *
     * @param $uri - Route URI pattern.
     * @param $view - View template name.
     * @param $data - Data passed to view.
     * @param $status - HTTP response status code.
     * @param $headers - Response headers.
     * @returns This route instance.
     */
    public view($uri: string, $view: string, $data: Record<string, any> = {}, $status: number = 200, $headers: Record<string, any> = {}): this {
        return this.match(['GET', 'HEAD'], $uri, ViewController)
            .setDefaults({
                'view': $view,
                'data': $data,
                'status': $status ? $status : 200,
                'headers': $headers ? $headers : {},
            });
    }

    /**
     * Register a route matching given HTTP methods.
     *
     * @param $methods - Array of HTTP methods.
     * @param $uri - Route URI pattern.
     * @param $action - Route handler action.
     * @returns This route instance.
     */
    public match($methods: string[], $uri: string, $action: any = null): this {
        const methods: string[] = $methods.map((method: string) => method.toUpperCase());
        return this.addRoute(methods, $uri, $action);
    }

    /**
     * Add middleware to this route.
     *
     * @param callback - Middleware function or array of middleware.
     * @returns This route instance.
     */
    public middleware(callback: any): this {
        if (Array.isArray(callback)) {
            this.$stack.middlewares = this.$stack.middlewares.concat(callback);
        } else {
            this.$stack.middlewares.push(callback);
        }
        return this;
    }

    /**
     * Add a prefix to the route URI.
     *
     * @param prefix - URI prefix string.
     * @returns This route instance.
     */
    public prefix(prefix: string): this {
        this.$stack.prefix = this.$stack.prefix + prefix;
        return this;
    }

    /**
     * Add a suffix to the route URI.
     *
     * @param suffix - URI suffix string.
     * @returns This route instance.
     */
    public suffix(suffix: string): this {
        this.$stack.suffix = this.$stack.suffix + suffix;
        return this;
    }

    /**
     * Set the domain constraint for this route.
     *
     * @param domain - Domain pattern.
     * @returns This route instance.
     */
    public domain(domain: string): this {
        this.$stack.domain = domain;
        return this;
    }

    /**
     * Set the controller namespace for this route.
     *
     * @param namespace - Controller namespace path.
     * @returns This route instance.
     */
    public namespace(namespace: string): this {
        this.$stack.namespace = path.join(this.$stack.namespace, (namespace || ''));
        return this;
    }

    /**
     * Set the route name.
     *
     * @param name - Route name.
     * @returns This route instance.
     */
    public name(name: string): this {
        this.$stack.name += name;
        return this;
    }

    /**
     * Create a route group with shared attributes.
     *
     * @param opt - Group configuration or file path.
     * @param callback - Group definition callback.
     */
    public group(opt: any = {}, callback?: Function): void {
        if (typeof opt === 'string') {
            callback = resolveModule(opt);
            opt = {};
        } else if (typeof opt === 'function') {
            callback = opt;
            opt = {};
        }
        const inst: GroupRoute = new GroupRoute(opt, this.$stack);
        callback!.call(inst, inst);
    }

    /**
     * Set default parameters and metadata on this route.
     *
     * @param defaults - Defaults dictionary.
     * @returns This route instance.
     */
    public setDefaults(defaults: Record<string, any>): this {
        this.$stack.defaults = {
            ...this.$stack.defaults,
            ...defaults
        };
        return this;
    }

    /**
     * Set route stack methods, URI, and action handler.
     *
     * @param $methods - Method or array of methods.
     * @param $uri - URI pattern.
     * @param $action - Action handler.
     * @returns This route instance.
     */
    public addRoute($methods: any, $uri: string, $action: any): this {
        this.$stack.url = $uri;
        this.$stack.methods = $methods;
        this.$stack.handle = $action;
        return this;
    }
}

/**
 * Route group coordinator for nesting route prefixes, namespaces, and middleware.
 */
class GroupRoute extends Macroable {
    public opt: Record<string, any> = {};

    /**
     * Create a new GroupRoute instance.
     *
     * @param opt - Group configuration options.
     * @param old - Parent group or route options.
     */
    constructor(opt: any = null, old: Record<string, any> = {}) {
        super();

        if (opt == null && old == null) {
            return this;
        }
        opt = Object.assign({ prefix: '/', suffix: '/', namespace: '', middleware: [], url: '/', name: '', handle: null, defaults: null }, opt);
        old = Object.assign({ prefix: '/', suffix: '/', namespace: '', middlewares: [], url: '/', name: '', handle: null, defaults: null }, old);

        this.opt.prefix = old.prefix + opt.prefix;
        this.opt.suffix = old.suffix + opt.suffix;
        this.opt.namespace = opt.namespace ? path.join(old.namespace, opt.namespace) : old.namespace;
        this.opt.middlewares = old.middlewares.concat(opt.middleware);
        this.opt.url = old.url + opt.url;
        this.opt.name = old.name + opt.name;
        this.opt.handle = null;
        this.opt.defaults = null;
        this.opt.domain = opt.domain || old.domain;
    }

    /**
     * Define a nested route group.
     *
     * @param opt - Nested group options or path string.
     * @param callback - Callback defining routes.
     */
    public group(opt: any, callback?: Function): void {
        if (typeof opt === 'string') {
            callback = resolveModule(opt);
            opt = {};
        } else if (typeof opt === 'function') {
            callback = opt;
            opt = {};
        }
        if (typeof this.opt === 'function') {
            this.opt = {};
        }
        const inst: GroupRoute = new GroupRoute(opt, this.opt);
        callback!.call(inst, inst);
    }

    /**
     * Proxy getter handler delegating methods to a new Route instance.
     *
     * @param target - Target object.
     * @param method - Method name being accessed.
     * @returns Delegated method handler.
     */
    public __get(target: Record<string, any>, method: string): any {
        return (this as any).make(new Route(target.opt), method);
    }
}

/**
 * Main HTTP Router class handling registration, resolution, middleware execution, and dispatching.
 */
class Router extends (Macroable.extend(RouterContract) as any) implements IRouter {
    public declare get: (uri: string, action?: any) => any;
    public declare post: (uri: string, action?: any) => any;
    public declare put: (uri: string, action?: any) => any;
    public declare patch: (uri: string, action?: any) => any;
    public declare delete: (uri: string, action?: any) => any;
    public declare options: (uri: string, action?: any) => any;
    public declare any: (uri: string, action?: any) => any;
    public declare match: (methods: string[], uri: string, action?: any) => any;
    public declare prefix: (prefix: string) => this;
    public declare middleware: (...middlewares: any[]) => this;
    public declare namespace: (namespace: string) => this;
    public declare group: (attributes: any, callback?: any) => this;
    public declare dispatch: (request: any, response: any) => Promise<any>;

    public $app: Record<string, any>;
    public httpContext: any;
    public [kMiddlewares]: { default: any[]; named: Record<string, any> };
    public [kLayers]: any[];
    public [kRegexConfig]: Record<string, any>;

    /**
     * Create a new Router instance.
     *
     * @param $app - Application container instance.
     * @param regexConfig - Regular expression matching configuration options.
     */
    constructor($app: Record<string, any> = {}, regexConfig: Record<string, any> = { sensitive: false, strict: false, end: true }) {
        super();
        this.$app = $app;
        this[kMiddlewares] = {
            default: [],
            named: {},
        };
        Object.defineProperty(this, kRegexConfig, {
            value: regexConfig,
            configurable: true,
            enumerable: false,
            writable: true
        });
        this.httpContextHandler(HttpContext);
    }

    /**
     * Resolve a middleware by name or definition.
     *
     * @param middleware - Middleware name, function, or object.
     * @returns Resolved middleware instance or array of middleware.
     */
    public getMiddleware(middleware: any): any {
        const middlewareName: string = middleware;
        let params: string[] = [];

        if (typeof middleware === 'string' && middleware.includes(':')) {
            const splitedMiddleware: string[] = middleware.split(':');
            middleware = splitedMiddleware[0];
            params = splitedMiddleware[1].split(',');
        }

        if (typeof middleware === 'function' || (typeof middleware === 'object' && middleware !== null)) {
            return this.resolveMiddleware(middleware, params);
        }

        if (middlewares[middlewareName]) {
            return middlewares[middlewareName];
        }

        if (!this[kMiddlewares]['named'][middleware]) {
            throw new MethodNotAvailable('middleware [{' + middleware + '}] is not available');
        }

        const namedMiddleware: any = this[kMiddlewares]['named'][middleware];
        if (!Array.isArray(namedMiddleware)) {
            middlewares[middlewareName] = this.resolveMiddleware(namedMiddleware, params);
        } else {
            middlewares[middlewareName] = this[kMiddlewares]['named'][middleware].map((handler: any) => {
                if (handler instanceof Array) {
                    return handler.reduce((acc: any[], val: any) => acc.concat(val), []);
                }
                return handler;
            }).map((handler: any) => this.resolveMiddleware(handler, params)).filter((fn: any) => fn);
        }
        return middlewares[middlewareName];
    }

    /**
     * Instantiate and bind middleware class or object.
     *
     * @param handler - Middleware constructor or handler object.
     * @param params - Parameters passed to middleware constructor.
     * @returns Resolved middleware object with handle and optional terminate.
     */
    public resolveMiddleware(handler: any, params: any[]): any {
        if (IsClass(handler)) {
            handler.prototype.$app = this.$app;
            handler = new handler(...params);
        }
        if (typeof handler === 'object' && handler !== null && !Array.isArray(handler)) {
            if (typeof handler.handle === 'function') {
                handler.handle = handler.handle.bind(handler);
            }
            if (typeof handler.terminate === 'function') {
                handler.terminate = handler.terminate.bind(handler);
            }
            return handler;
        } else if (handler) {
            return { handle: handler };
        }
    }

    /**
     * Create a Layer instance from a stack definition.
     *
     * @param stack - Route stack definition.
     * @returns Compiled Layer instance.
     */
    public createLayer(stack: any): any {
        if (typeof stack.handle === 'string') {
            const [controller, callback] = stack.handle.split('::');
            const controllerPath: string = path.normalize(path.join(path.resolve(stack.namespace), controller));
            if (!controllers[controllerPath]) {
                let clazz: any = resolveModule(controllerPath);
                if (IsClass(clazz)) {
                    clazz.prototype.$app = this.$app;
                    clazz = new clazz(stack.defaults);
                }
                controllers[controllerPath] = clazz;
            }
            if (callback && !controllers[controllerPath][callback]) {
                throw new MethodNotAvailable(`Specified [{${callback}}] method was not available in [{${controllerPath}}]`);
            }
            stack.handle = controllers[controllerPath][callback].bind(controllers[controllerPath]);
        } else if (Array.isArray(stack.handle)) {
            const [controller, callback] = stack.handle;
            controller.prototype.$app = this.$app;
            const ctrlInstance: any = new controller(stack.defaults);
            stack.handle = ctrlInstance[callback].bind(ctrlInstance);
        } else {
            if (IsClass(stack.handle)) {
                stack.handle.prototype.$app = this.$app;
                stack.handle = new stack.handle(stack.defaults);
            }
            if (typeof stack.handle === 'object') {
                const callback: string = 'handle';
                if (callback && !stack.handle[callback]) {
                    throw new MethodNotAvailable(`Specified [{${callback}}] method was not available`);
                }
                stack.handle = stack.handle[callback].bind(stack.handle);
            }
        }
        const resolvedMiddlewares: any[] = stack.middlewares.map((middleware: any) => this.getMiddleware(middleware)).reduce((acc: any[], val: any) => acc.concat(val), []);
        resolvedMiddlewares.push({ handle: stack.handle });
        const normalizedUrl: string = urlNormalize('/', stack.prefix, stack.url, stack.suffix).replace(/^\/|\/$/g, '');
        const middlewareHandels: Function[] = resolvedMiddlewares.map((middleware: any) => middleware.handle).filter((fn: any) => fn);
        const middlewareTerminates: Function[] = resolvedMiddlewares.map((middleware: any) => middleware.terminate).filter((fn: any) => fn);
        return new Layer({
            url: '/' + normalizedUrl,
            methods: stack.methods,
            name: stack.name,
            domain: stack.domain,
            handle: compose(middlewareHandels),
            terminate: middlewareTerminates,
        }, {
            sensitive: this[kRegexConfig]['sensitive'] || false,
            strict: this[kRegexConfig]['strict'] || false,
            end: this[kRegexConfig]['end'] || true,
        });
    }

    /**
     * Register a named middleware.
     *
     * @param key - Middleware alias name.
     * @param value - Middleware class or handler.
     */
    public namedMiddleware(key: string, value: any): void {
        this[kMiddlewares]['named'][key] = value;
    }

    /**
     * Register global default middlewares.
     *
     * @param middlewares - Array of default middlewares.
     */
    public defaultMiddlewares(middlewares: any[] = []): void {
        this[kMiddlewares]['default'] = this[kMiddlewares]['default'].concat(middlewares);
    }

    /**
     * Resolve all configured default middlewares.
     *
     * @returns Array of resolved middleware instances.
     */
    public resolveDefaultMiddleware(): any[] {
        if (this[kMiddlewares]['default'] instanceof Array) {
            return this[kMiddlewares]['default'].map((middleware: any) => {
                if (typeof middleware === 'string') {
                    middleware = resolveModule(path.normalize(middleware));
                }
                if (IsClass(middleware)) {
                    if (middlewares[middleware]) {
                        return middlewares[middleware];
                    }
                    middleware.prototype.$app = this.$app;
                    middlewares[middleware] = middleware = new middleware();

                    if (typeof middleware.handle === 'function') {
                        middleware.handle = middleware.handle.bind(middleware);
                    }
                    if (typeof middleware.terminate === 'function') {
                        middleware.terminate = middleware.terminate.bind(middleware);
                    }
                }
                return middleware;
            });
        }
        return [];
    }

    /**
     * Set the HttpContext constructor class.
     *
     * @param httpContext - HttpContext class constructor.
     */
    public httpContextHandler(httpContext: any): void {
        this.httpContext = httpContext;
    }

    /**
     * Create the HTTP request dispatch handler function.
     *
     * @returns Composed HTTP request handler pipeline.
     */
    public handle(): any {
        const defaultTerminateMiddleware: Record<string, any> = {};
        this[kLayers] = stacks.filter((stack: RouteStack) => stack.handle).map((stack: RouteStack) => this.createLayer(stack));
        const self: this = this;
        let middlewaresList: any[] = [function urlHander({ request }: Record<string, any>, next: Function): void {
            if (typeof request._parsedUrl !== 'object') {
                request._parsedUrl = url.parse(request.url, false);
            }
            next();
        }];
        const defaultMiddleare: any[] = this.resolveDefaultMiddleware();
        const defaultHandleMiddleWares: Function[] = defaultMiddleare.map((middleware: any) => middleware.handle).filter((fn: any) => fn);
        let defaultTerminateMiddleWares: Function[] = defaultMiddleare.map((middleware: any) => middleware.terminate).filter((fn: any) => fn);
        middlewaresList = middlewaresList.concat(defaultHandleMiddleWares);
        middlewaresList.push(async function layerHandler(ctx: any, next: Function): Promise<any> {
            const layer: any = self[kLayers].find((route: any) => {
                if (route.$domain !== undefined && ctx.request.headers.host !== route.$domain) {
                    return false;
                }
                return (route.match(ctx.request._parsedUrl.pathname) && (route.$methods.indexOf(ctx.request.method) > -1));
            });
            if (layer) {
                await layer.handle_request(ctx, next);
                if (ctx.response && ctx.response.__viewPromise) {
                    await ctx.response.__viewPromise;
                }
            } else {
                return next(new PageNotFoundException());
            }
            if (!defaultTerminateMiddleware[layer.$regexp]) {
                const terminateMiddlewares: Function[] = defaultTerminateMiddleWares.concat(layer.terminate);
                const errorHandlerTerminate: Function | undefined = terminateMiddlewares.find((handle: Function) => handle.length === 3);
                defaultTerminateMiddleware[layer.$regexp] = {
                    terminate: compose(terminateMiddlewares.filter((handle: Function) => handle.length < 3)),
                    error: function (err: any): void {
                        if (err && errorHandlerTerminate) {
                            errorHandlerTerminate(err, ctx);
                        }
                    }
                };
            }
            defaultTerminateMiddleware[layer.$regexp].terminate(ctx, defaultTerminateMiddleware[layer.$regexp].error);
            if (!ctx.response || (!ctx.response.headersSent && !ctx.response.__viewPromise)) {
                return next();
            }
        });
        const exceptionHandler: ExceptionHandler = new ExceptionHandler();
        let exceptionHandle: Function = exceptionHandler.handle.bind(exceptionHandler);
        let exceptionTerminate: Function = exceptionHandler.terminate.bind(exceptionHandler);
        Object.defineProperty(exceptionHandler, 'name', {
            value: ExceptionHandler.name
        });
        middlewaresList = middlewaresList.filter((handler: Function) => {
            if (handler.length === 3) {
                exceptionHandle = handler;
                return false;
            }
            return true;
        });
        defaultTerminateMiddleWares = defaultTerminateMiddleWares.filter((handler: Function) => {
            if (handler.length === 3) {
                exceptionTerminate = handler;
                return false;
            }
            return true;
        });
        middlewaresList.push(exceptionHandle);
        defaultTerminateMiddleWares.push(exceptionTerminate);
        (global as any).route = (name: string, params: any): any => {
            return this.route(name, params);
        };
        return composeWith(middlewaresList)(this.httpContext);
    }

    /**
     * Generate a URL for the named route.
     *
     * @param name - Route name.
     * @param params - Route parameter values.
     * @returns Compiled URL string.
     */
    public route(name: string, ...params: any[]): string {
        const currentRoute: any = this[kLayers].find((layer: any) => (layer.$name === name && name !== ''));
        if (!currentRoute) {
            throw new InvalidRouteExceptions('Route name [{' + name + '}] not found');
        }
        const currentRouteParams: any[] = (currentRoute.$keys || []);
        if (currentRouteParams.length && currentRouteParams.length !== params.length) {
            throw new InvalidArgumentException('Invalid Route params in [' + name + ']');
        }
        const mParams: Record<string, any> = {};
        for (let i = 0; i < currentRouteParams.length; i++) {
            mParams[currentRouteParams[i]['name']] = params[i];
        }
        return (pathToRegexp.compile(currentRoute.$original, { encode: encodeURIComponent }) as any)(mParams, { validate: false });
    }

    /**
     * Find the matched route layer for the given request.
     *
     * @param request - HTTP request instance.
     * @returns Matched Layer instance or undefined.
     */
    public currentRoute(request: any): any {
        return this[kLayers].find((route: any) => {
            if (route.$domain !== undefined && request.headers.host !== route.$domain) {
                return false;
            }
            return (route.match(request._parsedUrl.pathname) && (route.$methods.indexOf(request.method) > -1));
        });
    }

    /**
     * Bind a route helper method onto the HTTP Response class prototype.
     *
     * @param HttpResponse - Response class constructor.
     */
    public bindToResponse(HttpResponse: any): void {
        const self: this = this;

        HttpResponse.prototype.route = function (name: string, params: any): void {
            this.redirect(self.route(name, params));
        };
    }

    /**
     * Proxy getter handler delegating methods to a new GroupRoute instance.
     *
     * @param target - Target object.
     * @param method - Method name accessed.
     * @returns Delegated method handler.
     */
    public __get(target: Record<string, any>, method: string): any {
        return (this as any).make(new GroupRoute(), method);
    }

    /**
     * Clear all registered routes, cached middlewares, and controllers.
     */
    public static clear(): void {
        stacks.length = 0;
        for (const key of Object.keys(middlewares)) {
            delete middlewares[key];
        }
        for (const key of Object.keys(controllers)) {
            delete controllers[key];
        }
    }

    /**
     * Get all registered route stack definitions.
     *
     * @returns Array of registered route stacks.
     */
    public static getStacks(): RouteStack[] {
        return stacks;
    }

    public static Route: typeof Route = Route;
    public static GroupRoute: typeof GroupRoute = GroupRoute;
}

export default Router;
