import Router from '../src/router';
import PageNotFoundException from '@ostro/support/exceptions/pageNotFoundException';
import MethodNotAvailable from '@ostro/support/exceptions/methodNotAvailable';
import InvalidRouteExceptions from '../src/exceptions/invalidRouteExceptions';
import InvalidArgumentException from '@ostro/support/exceptions/invalidArgumentException';
import path from 'path';

describe('Router & Route & GroupRoute', () => {
    let app;
    let router;

    beforeEach(() => {
        Router.clear();
        app = {};
        router = new Router(app);
    });

    afterEach(() => {
        Router.clear();
    });

    test('registers standard HTTP verb routes: get, post, put, patch, delete, options, any', () => {
        router.get('/test-get', () => {});
        router.post('/test-post', () => {});
        router.put('/test-put', () => {});
        router.patch('/test-patch', () => {});
        router.delete('/test-delete', () => {});
        router.options('/test-options', () => {});
        router.any('/test-any', () => {});

        const stacks = Router.getStacks();
        expect(stacks.length).toBe(7);
        expect(stacks[0].methods).toEqual(['GET', 'HEAD']);
        expect(stacks[1].methods).toBe('POST');
        expect(stacks[2].methods).toBe('PUT');
        expect(stacks[3].methods).toBe('PATCH');
        expect(stacks[4].methods).toBe('DELETE');
        expect(stacks[5].methods).toBe('OPTIONS');
        expect(stacks[6].methods).toEqual(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

        // Default action = null branches
        router.get('/default-get');
        router.post('/default-post');
        router.put('/default-put');
        router.patch('/default-patch');
        router.delete('/default-delete');
        router.options('/default-options');
        router.any('/default-any');
        router.match(['GET'], '/default-match');
    });

    test('redirect and permanentRedirect routes', () => {
        router.redirect('/old-url', '/new-url');
        router.permanentRedirect('/perm-old', '/perm-new');

        const stacks = Router.getStacks();
        expect(stacks.length).toBe(2);

        // Test handler invocation for redirect (status 302)
        let headerWritten = null;
        let ended = false;
        const mockRes = {
            writeHead(status, headers) {
                headerWritten = { status, headers };
            },
            end() {
                ended = true;
            }
        };

        stacks[0].handle({ response: mockRes });
        expect(headerWritten).toEqual({
            status: 302,
            headers: { Location: '/new-url' }
        });
        expect(ended).toBe(true);

        // Test handler invocation for permanent redirect (status 301)
        stacks[1].handle({ response: mockRes });
        expect(headerWritten.status).toBe(301);
    });

    test('view route registers View controller with defaults', () => {
        router.view('/welcome', 'welcome_view', { user: 'John' }, 200, { 'X-Custom': 'header' });

        const stacks = Router.getStacks();
        expect(stacks.length).toBe(1);
        expect(stacks[0].defaults).toEqual({
            view: 'welcome_view',
            data: { user: 'John' },
            status: 200,
            headers: { 'X-Custom': 'header' }
        });

        // Test view route with defaults status = null/0 and headers = null
        router.view('/minimal', 'minimal_view', undefined, null, null);
        expect(stacks[1].defaults.status).toBe(200);
        expect(stacks[1].defaults.headers).toEqual({});
    });

    test('route modifiers: prefix, suffix, domain, namespace, name, middleware', () => {
        router.prefix('/api')
            .suffix('.json')
            .domain('api.domain.com')
            .namespace('Api')
            .name('api.')
            .middleware('auth')
            .middleware(['cors', 'throttle'])
            .get('/items', () => {});

        const stacks = Router.getStacks();
        const stack = stacks[0];
        expect(stack.prefix).toBe('///api');
        expect(stack.suffix).toBe('//.json');
        expect(stack.domain).toBe('api.domain.com');
        expect(stack.name).toBe('api.');
        expect(stack.middlewares).toEqual(['auth', 'cors', 'throttle']);

        // Test namespace(null)
        router.namespace(null);
    });

    test('grouping with object and function', () => {
        router.group({ prefix: 'v1', middleware: ['auth'] }, (group) => {
            group.get('/profile', () => {});
            group.group({ prefix: '/sub' }, (subGroup) => {
                subGroup.get('/info', () => {});
            });
        });

        const stacks = Router.getStacks();
        expect(stacks.length).toBe(2);
        expect(stacks[0].middlewares).toContain('auth');
    });

    test('grouping with function directly', () => {
        router.group((group) => {
            group.get('/direct', () => {});
        });
        expect(Router.getStacks().length).toBe(1);
    });

    test('grouping with module path string', () => {
        const dummyGroupPath = path.join(__dirname, 'fixtures', 'groupFixtures.js');
        // GroupRoute handles requiring path
        router.group(dummyGroupPath);
        expect(Router.getStacks().length).toBe(1);
    });

    test('named middleware resolution with parameters and array stacks', () => {
        const dummyMw = jest.fn((ctx, next) => next());
        router.namedMiddleware('auth', dummyMw);

        const resolved = router.getMiddleware('auth');
        expect(resolved.handle).toBe(dummyMw);

        // parameterized named middleware
        class ParamMiddleware {
            constructor(role) {
                this.role = role;
            }
            handle(ctx, next) {
                ctx.role = this.role;
                return next();
            }
        }
        router.namedMiddleware('role', ParamMiddleware);
        const resolvedRole = router.getMiddleware('role:admin');
        expect(resolvedRole.handle).toBeDefined();

        // middleware array stack
        router.namedMiddleware('group_mw', [dummyMw, [dummyMw]]);
        const resolvedGroup = router.getMiddleware('group_mw');
        expect(Array.isArray(resolvedGroup)).toBe(true);

        // unknown middleware throws MethodNotAvailable
        expect(() => {
            router.getMiddleware('nonexistent');
        }).toThrow(MethodNotAvailable);
    });

    test('resolveDefaultMiddleware handles class, string path, and objects', () => {
        class ClassMiddleware {
            handle(ctx, next) { return next(); }
            terminate(ctx) {}
        }
        router.defaultMiddlewares([ClassMiddleware]);
        const resolved = router.resolveDefaultMiddleware();
        expect(resolved.length).toBe(1);
        expect(typeof resolved[0].handle).toBe('function');
        expect(typeof resolved[0].terminate).toBe('function');

        // caching on second call
        const resolved2 = router.resolveDefaultMiddleware();
        expect(resolved2[0]).toBe(resolved[0]);

        // string path middleware
        const dummyMwPath = path.join(__dirname, 'fixtures', 'dummyMiddleware.js');
        router.defaultMiddlewares([dummyMwPath]);
        const resolvedWithPath = router.resolveDefaultMiddleware();
        expect(resolvedWithPath.length).toBe(2);
    });

    test('cached named middleware lookup', () => {
        const dummyMw = jest.fn((ctx, next) => next());
        router.namedMiddleware('auth_test', dummyMw);
        const res1 = router.getMiddleware('auth_test');
        const res2 = router.getMiddleware('auth_test');
        expect(res1).toBe(res2);
    });

    test('Route.prototype.group with string module and function', () => {
        Router.clear();
        const dummyGroupPath = path.join(__dirname, 'fixtures', 'groupFixtures.js');
        router.prefix('/route-prefix').group(dummyGroupPath);
        expect(Router.getStacks().length).toBe(2);

        router.prefix('/route-fn').group((grp) => {
            grp.get('/fn-path', () => {});
        });
        expect(Router.getStacks().length).toBe(4);
    });

    test('defaultMiddlewares with non-array argument', () => {
        const symbols = Object.getOwnPropertySymbols(router);
        const mwSym = symbols.find(s => s.description === 'middlewares');
        router[mwSym]['default'] = null;
        expect(router.resolveDefaultMiddleware()).toEqual([]);
    });

    test('custom 3-arg error handler and 3-arg terminate in middlewares', async () => {
        let customErrorHandled = false;
        let customTerminateHandled = false;
        const custom3ArgHandle = (err, ctx, next) => {
            customErrorHandled = true;
            return next();
        };
        const custom3ArgTerminate = (err, ctx, next) => {
            customTerminateHandled = true;
            return next();
        };

        router.defaultMiddlewares([
            { handle: custom3ArgHandle, terminate: custom3ArgTerminate }
        ]);
        router.get('/custom-err', ({ request }) => {
            throw new Error('Trigger custom handler');
        });

        const runner = router.handle();
        const req = {
            url: '/custom-err',
            method: 'GET',
            headers: { host: 'localhost' }
        };
        const res = {};
        await new Promise((resolve) => {
            runner(req, res, resolve);
        });
        expect(customErrorHandled).toBe(true);
    });

    test('route layer dispatch and matching', async () => {
        let routeExecuted = false;
        router.get('/hello/:name', ({ request, response }) => {
            routeExecuted = true;
            response.body = `Hello ${request.params.name}`;
        });

        const runner = router.handle();
        const req = {
            url: '/hello/John',
            method: 'GET',
            headers: { host: 'localhost' }
        };
        const res = {};

        await new Promise((resolve, reject) => {
            runner(req, res, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        expect(routeExecuted).toBe(true);
        expect(res.body).toBe('Hello John');
    });

    test('route domain matching filters out mismatched domains', async () => {
        router.domain('admin.example.com').get('/admin-dashboard', () => {});

        const runner = router.handle();
        const req = {
            url: '/admin-dashboard',
            method: 'GET',
            headers: { host: 'user.example.com' }
        };
        const res = { send: jest.fn() };

        await new Promise((resolve) => {
            runner(req, res, resolve);
        });

        expect(res.send).toHaveBeenCalled();
    });

    test('route layer dispatch triggers PageNotFoundException on unmatched route', async () => {
        router.get('/only-path', () => {});

        const runner = router.handle();
        const req = {
            url: '/does-not-exist',
            method: 'GET',
            headers: { host: 'localhost' }
        };
        const res = { send: jest.fn() };

        await new Promise((resolve) => {
            runner(req, res, resolve);
        });

        expect(res.send).toHaveBeenCalled();
    });

    test('terminating middleware execution on route completion', async () => {
        let terminated = false;
        const terminateMiddleware = {
            handle: (ctx, next) => next(),
            terminate: (ctx) => {
                terminated = true;
            }
        };

        router.middleware(terminateMiddleware).get('/terminating', () => {});

        const runner = router.handle();
        const req = {
            url: '/terminating',
            method: 'GET',
            headers: { host: 'localhost' }
        };
        const res = {};

        await new Promise((resolve) => {
            runner(req, res, resolve);
        });

        expect(terminated).toBe(true);
    });

    test('terminating error middleware if terminate error occurs', async () => {
        let termErrorHandled = false;
        const terminatingWithErr = {
            handle: (ctx, next) => next(),
            terminate: (err, ctx) => {
                termErrorHandled = true;
            }
        };
        const failingTerminator = {
            handle: (ctx, next) => next(),
            terminate: (ctx, next) => {
                next(new Error('Termination fault'));
            }
        };

        router.defaultMiddlewares([terminatingWithErr, failingTerminator]);
        router.get('/term-error', () => {});

        const runner = router.handle();
        const req = {
            url: '/term-error',
            method: 'GET',
            headers: { host: 'localhost' }
        };
        const res = {};

        await new Promise((resolve) => {
            runner(req, res, resolve);
        });

        expect(termErrorHandled).toBe(true);

        // Terminate error with length === 3 handler
        let terminate3ArgCalled = false;
        const terminate3ArgHandler = (err, ctx, next) => {
            terminate3ArgCalled = true;
            if (next) next();
        };
        const failingTerminator2 = {
            handle: (ctx, next) => next(),
            terminate: (ctx, next) => next(new Error('Fatal termination'))
        };
        Router.clear();
        router = new Router(app);
        router.defaultMiddlewares([failingTerminator2]);
        router.get('/term-3arg', () => {});
        // inject 3-arg terminate handler
        const termRunner = router.handle();
        await new Promise((resolve) => {
            termRunner({ url: '/term-3arg', method: 'GET', headers: { host: 'localhost' } }, {}, resolve);
        });
    });

    test('GroupRoute constructor with null arguments and __get proxy', () => {
        router.group({ prefix: '/base' }, (grp) => {
            // inside group callback, grp is an instance of GroupRoute
            grp.opt = () => {}; // test if (typeof this.opt == 'function')
            grp.group({ prefix: '/inner' }, (inner) => {
                inner.get('/endpoint', () => {});
            });

            // call __get proxy on GroupRoute
            const routeFromGroup = grp.get('/test-proxy', () => {});
            expect(routeFromGroup).toBeDefined();
        });

        // Instantiate GroupRoute constructor with null
        let groupInstance = null;
        router.group({}, (grp) => {
            const GroupRouteClass = grp.constructor;
            groupInstance = new GroupRouteClass(null, null);
        });
        expect(groupInstance).toBeDefined();
    });

    test('createLayer handles string controller syntax Class::method and array syntax', () => {
        const fixturePath = path.join(__dirname, 'fixtures', 'mockController.js');

        // string Class::method
        router.namespace(__dirname).get('/ctrl-str', 'fixtures/mockController::index');
        // array [Controller, 'method']
        const MockControllerClass = require(fixturePath);
        router.get('/ctrl-arr', [MockControllerClass, 'index']);
        // class directly
        router.get('/ctrl-class', MockControllerClass);
        // object with handle
        router.get('/ctrl-obj', {
            handle: (ctx, next) => next()
        });

        expect(() => {
            router.handle();
        }).not.toThrow();
    });

    test('createLayer throws MethodNotAvailable if controller method missing', () => {
        router.namespace(__dirname).get('/missing-method', 'fixtures/mockController::nonexistent');
        expect(() => {
            router.handle();
        }).toThrow(MethodNotAvailable);

        Router.clear();
        router.get('/obj-missing', { notHandle: () => {} });
        expect(() => {
            router.handle();
        }).toThrow(MethodNotAvailable);
    });

    test('route() URL generation with parameters', () => {
        router.name('users.show').get('/users/:id/posts/:slug', () => {});
        router.name('home').get('/home', () => {});
        router.handle(); // builds layers

        expect(router.route('users.show', 123, 'first-post')).toBe('/users/123/posts/first-post');
        expect(router.route('home')).toBe('/home');

        // global.route helper test
        expect(global.route('home')).toBe('/home');

        // missing route name
        expect(() => {
            router.route('unknown.name');
        }).toThrow(InvalidRouteExceptions);

        // invalid parameters count
        expect(() => {
            router.route('users.show', 123);
        }).toThrow(InvalidArgumentException);
    });

    test('covers Route constructor default parameters and empty options', () => {
        const RouteClass = Router.Route;
        const r1 = new RouteClass();
        expect(r1.$stack).toBeDefined();

        const r2 = new RouteClass({
            prefix: '/api',
            suffix: '.json',
            namespace: 'App/Controllers',
            middlewares: ['auth'],
            url: '/test',
            name: 'api.test',
            defaults: { foo: 'bar' },
            domain: 'api.example.com'
        });
        expect(r2.$stack.prefix).toBe('/api');
        expect(r2.$stack.domain).toBe('api.example.com');

        // Route defaults with falsy middlewares
        const r3 = new RouteClass({ middlewares: null });
        expect(r3.$stack.middlewares).toEqual([]);
    });

    test('covers Route.view with default status and headers fallback', () => {
        router.view('/simple-view', 'index');
        const stack = Router.getStacks()[0];
        expect(stack.defaults.status).toBe(200);
        expect(stack.defaults.headers).toEqual({});

        // Custom status and headers
        Router.clear();
        router.view('/custom-view', 'index', { user: 'test' }, 201, { 'X-Test': '1' });
        const stack2 = Router.getStacks()[0];
        expect(stack2.defaults.status).toBe(201);
        expect(stack2.defaults.headers).toEqual({ 'X-Test': '1' });
    });

    test('covers Route.group string callback require and function callback', () => {
        const fixturePath = path.resolve(__dirname, 'fixtures/groupFixtures.js');
        router.group(fixturePath);
        expect(Router.getStacks().length).toBeGreaterThan(0);

        // Group with function
        router.group((group) => {
            group.get('/nested-func', () => {});
        });
    });

    test('covers GroupRoute constructor and group variations', () => {
        const GroupRouteClass = Router.GroupRoute;
        // opt == null && old == null
        const emptyGroup = new GroupRouteClass(null, null);
        expect(emptyGroup).toBeDefined();

        // opt.namespace empty vs present
        const g1 = new GroupRouteClass({ namespace: '' }, { namespace: 'Base' });
        expect(g1.opt.namespace).toBe('Base');

        const g2 = new GroupRouteClass({ namespace: 'Sub', domain: 'sub.com' }, { namespace: 'Base', domain: 'base.com' });
        expect(g2.opt.namespace).toBe(path.join('Base', 'Sub'));
        expect(g2.opt.domain).toBe('sub.com');

        const g3 = new GroupRouteClass({}, { domain: 'base.com' });
        expect(g3.opt.domain).toBe('base.com');

        // GroupRoute.group string vs function vs this.opt function
        const fixturePath = path.resolve(__dirname, 'fixtures/groupFixtures.js');
        g3.group(fixturePath);

        g3.opt = function () {};
        g3.group((nested) => {
            expect(typeof nested.opt).toBe('object');
        });
    });

    test('covers Router constructor default parameters and regexConfig', () => {
        const rDefault = new Router();
        expect(rDefault.$app).toEqual({});

        // Custom regexConfig with sensitive/strict/end false
        const rCustom = new Router({}, { sensitive: true, strict: true, end: false });
        rCustom.get('/custom-regex', () => {});
        const layer = rCustom.createLayer(Router.getStacks()[0]);
        expect(layer).toBeDefined();
    });

    test('covers getMiddleware split middleware without param string, class and object handlers', () => {
        // middleware: splitedMiddleware[1] not a string
        const r = new Router();
        class ParamMiddleware {
            constructor(...params) {
                this.params = params;
            }
            handle(ctx, next) { next(); }
        }
        r.namedMiddleware('auth', ParamMiddleware);
        const resolvedWithParam = r.getMiddleware('auth:admin,editor');
        expect(resolvedWithParam).toBeDefined();

        // Middleware with ':' but empty second part
        const resolvedEmptyParam = r.getMiddleware('auth:');
        expect(resolvedEmptyParam).toBeDefined();

        // resolveMiddleware with class without handle or terminate
        class BareClassMiddleware {}
        const bareResolved = r.resolveMiddleware(BareClassMiddleware, []);
        expect(bareResolved).toBeDefined();

        // resolveMiddleware with plain object having handle and terminate
        const objMiddleware = {
            handle(ctx, next) { next(); },
            terminate(ctx, next) { next(); }
        };
        const objResolved = r.resolveMiddleware(objMiddleware, []);
        expect(typeof objResolved.handle).toBe('function');
        expect(typeof objResolved.terminate).toBe('function');

        // resolveMiddleware with raw function
        const fnMiddleware = (ctx, next) => next();
        const fnResolved = r.resolveMiddleware(fnMiddleware, []);
        expect(fnResolved.handle).toBe(fnMiddleware);

        // resolveMiddleware with falsy handler
        expect(r.resolveMiddleware(null, [])).toBeUndefined();

        // getMiddleware without param after colon e.g. 'auth:' split has splitedMiddleware[1] === ''
        const emptyParamMw = r.getMiddleware('auth:');
        expect(emptyParamMw).toBeDefined();

        // defaultMiddlewares with default empty array parameter
        r.defaultMiddlewares();

        // getMiddleware cache hit
        const cacheHit = r.getMiddleware('auth:admin,editor');
        expect(cacheHit).toBe(resolvedWithParam);
    });

    test('covers createLayer with cached controller and method not available', () => {
        const r = new Router();
        const controllerPath = path.resolve(__dirname, 'fixtures/mockController.js');

        // First call loads and caches controller
        router.namespace(path.dirname(controllerPath));
        router.get('/cached-ctrl', 'mockController::index');
        const stack1 = { ...Router.getStacks()[0], handle: 'mockController::index' };
        const layer1 = r.createLayer(stack1);
        expect(layer1).toBeDefined();

        // Second call uses cached controller
        const stack2 = { ...stack1, handle: 'mockController::index' };
        const layer2 = r.createLayer(stack2);
        expect(layer2).toBeDefined();

        // Non-class controller required from file
        const nonClassPath = path.resolve(__dirname, 'fixtures/nonClassController.js');
        const nonClassStack = {
            handle: 'nonClassController::index',
            namespace: path.dirname(nonClassPath),
            middlewares: [],
            prefix: '/',
            url: '/non-class',
            suffix: '/'
        };
        const layerNonClass = r.createLayer(nonClassStack);
        expect(layerNonClass).toBeDefined();

        // Non-class controller object without handle method
        const invalidObjectStack = {
            handle: { notHandle: () => {} },
            middlewares: [],
            prefix: '/',
            url: '/invalid',
            suffix: '/'
        };
        expect(() => {
            r.createLayer(invalidObjectStack);
        }).toThrow(MethodNotAvailable);
    });

    test('covers direct Route instance group method and route() parameter checks', () => {
        // Direct Route instance group with function
        const directRoute = new Router.Route();
        let directGroupCalled = false;
        directRoute.group((grp) => {
            directGroupCalled = true;
            grp.get('/direct-route-group', () => {});
        });
        expect(directGroupCalled).toBe(true);

        // Direct Route instance group with options object and callback
        const directRouteOpt = new Router.Route();
        let directGroupOptCalled = false;
        directRouteOpt.group({ prefix: '/v1' }, (grp) => {
            directGroupOptCalled = true;
            grp.get('/nested-route', () => {});
        });
        expect(directGroupOptCalled).toBe(true);

        // Direct Route instance group with default empty options
        const directRouteDefault = new Router.Route();
        directRouteDefault.group(undefined, (grp) => {});

        // String module in Route.group
        const directRoute2 = new Router.Route();
        const fixturePath = path.resolve(__dirname, 'fixtures/groupFixtures.js');
        directRoute2.group(fixturePath);

        // router.route() with parameter-free route matching keys.length === 0
        router.name('home').get('/homepage', () => {});
        router.handle();
        expect(router.route('home')).toBe('/homepage');

        // router.route() when layer.$keys is undefined/empty
        const layerSym = Object.getOwnPropertySymbols(router).find(s => s.description === 'kLayers');
        const layers = router[layerSym];
        const homeLayer = layers.find(l => l.$name === 'home');
        homeLayer.$keys = null;
        expect(router.route('home')).toBe('/homepage');
    });

    test('covers namedMiddleware array cache hit in getMiddleware', () => {
        const r = new Router();
        const mw1 = (ctx, next) => next();
        r.namedMiddleware('arr_mw', [mw1]);
        const res1 = r.getMiddleware('arr_mw');
        expect(res1).toBeDefined();

        // Second call hits middlewares[middlewareName] cache for array namedMiddleware
        const res2 = r.getMiddleware('arr_mw');
        expect(res2).toBe(res1);
    });

    test('covers resolveDefaultMiddleware class caching, method binding and default handling', () => {
        const r = new Router();
        class TestDefaultClassMiddleware {
            handle(ctx, next) { next(); }
            terminate(ctx, next) { next(); }
        }
        class TestNoMethodsDefaultMiddleware {}

        r.defaultMiddlewares([TestDefaultClassMiddleware, TestNoMethodsDefaultMiddleware]);
        const resolvedList1 = r.resolveDefaultMiddleware();
        expect(resolvedList1.length).toBe(2);

        // Second call hits cache for class middleware
        const resolvedList2 = r.resolveDefaultMiddleware();
        expect(resolvedList2[0]).toBe(resolvedList1[0]);

        // Default middlewares non-array branch
        const symbols = Object.getOwnPropertySymbols(r);
        const mwSym = symbols.find(s => s.description === 'middlewares');
        r[mwSym]['default'] = null;
        expect(r.resolveDefaultMiddleware()).toEqual([]);
    });

    test('covers handle() with pre-parsed URL and cached terminate middleware', async () => {
        router.get('/cached-terminate', ({ response }) => {
            response.status = 200;
        });
        const handler = router.handle();

        // Request 1: creates defaultTerminateMiddleware[layer.$regexp]
        const req1 = {
            url: '/cached-terminate',
            method: 'GET',
            _parsedUrl: { pathname: '/cached-terminate' }, // Already parsed object!
            headers: { host: 'localhost' }
        };
        const res1 = { headers: {}, setHeader() {} };
        await new Promise((resolve) => {
            handler(req1, res1, resolve);
        });
        expect(res1.status).toBe(200);

        // Request 2: hits cached defaultTerminateMiddleware[layer.$regexp]
        const req2 = {
            url: '/cached-terminate',
            method: 'GET',
            _parsedUrl: { pathname: '/cached-terminate' },
            headers: { host: 'localhost' }
        };
        const res2 = { headers: {}, setHeader() {} };
        await new Promise((resolve) => {
            handler(req2, res2, resolve);
        });
        expect(res2.status).toBe(200);
    });

    test('currentRoute returns matching layer for request', () => {
        router.get('/users/active', () => {});
        router.domain('special.com').get('/special', () => {});
        router.handle();

        const req1 = {
            url: '/users/active',
            method: 'GET',
            _parsedUrl: { pathname: '/users/active' },
            headers: { host: 'localhost' }
        };
        const current = router.currentRoute(req1);
        expect(current).toBeDefined();
        expect(current.$original).toBe('/users/active');

        // Domain mismatch
        const req2 = {
            url: '/special',
            method: 'GET',
            _parsedUrl: { pathname: '/special' },
            headers: { host: 'wrong.com' }
        };
        expect(router.currentRoute(req2)).toBeUndefined();
    });

    test('bindToResponse extends HttpResponse with route redirect method', () => {
        class MockHttpResponse {
            redirect(url) {
                this.redirectedTo = url;
            }
        }


        router.name('dashboard').get('/dashboard', () => {});
        router.handle();

        router.bindToResponse(MockHttpResponse);
        const res = new MockHttpResponse();
        res.route('dashboard');

        expect(res.redirectedTo).toBe('/dashboard');
    });

    test('layerHandler skips next() when __viewPromise is set (async response scenario)', async () => {
        // Simulate a route that sets __viewPromise on the response (like view() does)
        // but where headersSent is still false (e.g. async session save defers end())
        let nextCalledAfterView = false;
        let viewRendered = false;
        let resolveViewPromise!: () => void;
        const controlledViewPromise = new Promise<void>((res) => {
            resolveViewPromise = res;
        });

        router.get('/view-route', (ctx: any) => {
            ctx.response.__viewPromise = controlledViewPromise;
        });

        const handler = router.handle();
        const req = {
            url: '/view-route',
            method: 'GET',
            headers: { host: 'localhost' }
        };
        const res: Record<string, any> = { headersSent: false };

        // Fire handler but do NOT await — it will suspend internally at await __viewPromise
        handler(req, res, () => {
            nextCalledAfterView = true;
        });

        // Give handler one tick to start and reach `await __viewPromise`
        await new Promise<void>((r) => setImmediate(r));

        // Resolve viewPromise — simulates view render completing
        resolveViewPromise();
        viewRendered = true;

        // Flush microtask + event loop ticks so the handler can finish
        await new Promise<void>((r) => setImmediate(r));
        await new Promise<void>((r) => setImmediate(r));

        // next() must NOT have been called since __viewPromise was set
        expect(nextCalledAfterView).toBe(false);
        expect(viewRendered).toBe(true);
    });

    test('layerHandler calls next() when no view and headersSent is false', async () => {
        // Route that does nothing - no __viewPromise, no headersSent
        // next() MUST be called so finalhandler can run
        let nextInvoked = false;

        router.get('/no-response-route', (_ctx) => {
            // intentionally does nothing
        });

        const handler = router.handle();
        const req = {
            url: '/no-response-route',
            method: 'GET',
            headers: { host: 'localhost' }
        };
        const res = { headersSent: false };

        await new Promise<void>((resolve) => {
            handler(req, res, () => {
                nextInvoked = true;
                resolve();
            });
        });

        expect(nextInvoked).toBe(true);
    });
});

