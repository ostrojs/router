import Layer from '../src/layer';

describe('Layer', () => {
    test('instantiates without new keyword', () => {
        const stack = {
            url: '/users',
            methods: ['GET'],
            handle: (ctx, next) => next(),
            terminate: null,
            name: 'users.index',
            domain: 'api.example.com'
        };
        const layer = Layer(stack, {});
        expect(layer).toBeInstanceOf(Layer);
        expect(layer.$original).toBe('/users');
        expect(layer.$name).toBe('users.index');
        expect(layer.$domain).toBe('api.example.com');
        expect(layer.$methods).toEqual(['GET']);
    });

    test('fast_star matches any path and decodes param', () => {
        const stack = {
            url: '(.*)',
            methods: ['GET'],
            handle: (ctx, next) => next()
        };
        const layer = new Layer(stack, {});
        layer.$regexp.fast_star = true;

        const matched = layer.match('/wildcard/test%20space');
        expect(matched).toBe(true);
        expect(layer.$params).toEqual({ '0': '/wildcard/test space' });
        expect(layer.$path).toBe('/wildcard/test%20space');
    });

    test('fast_slash matches root when end is false', () => {
        const stack = {
            url: '/',
            methods: ['GET'],
            handle: (ctx, next) => next()
        };
        const layer = new Layer(stack, { end: false });
        expect(layer.$regexp.fast_slash).toBe(true);

        const matched = layer.match('/anything');
        expect(matched).toBe(true);
        expect(layer.$params).toEqual({});
        expect(layer.$path).toBe('');
    });

    test('matches parameterized path and decodes params', () => {
        const stack = {
            url: '/users/:id/posts/:slug',
            methods: ['GET'],
            handle: (ctx, next) => next()
        };
        const layer = new Layer(stack, { end: true });

        const matched = layer.match('/users/42/posts/hello%20world');
        expect(matched).toBe(true);
        expect(layer.$params).toEqual({
            id: '42',
            slug: 'hello world'
        });
        expect(layer.$path).toBe('/users/42/posts/hello%20world');

        const notMatched = layer.match('/other/path');
        expect(notMatched).toBe(false);
        expect(layer.$params).toBeUndefined();
        expect(layer.$path).toBeUndefined();

        const nullMatched = layer.match(null);
        expect(nullMatched).toBe(false);
    });

    test('matches duplicate keys where second match is undefined', () => {
        const stack = {
            url: '/test',
            methods: ['GET'],
            handle: (ctx, next) => next()
        };
        const layer = new Layer(stack);
        layer.$keys = [{ name: 'dup' }, { name: 'dup' }];
        layer.$regexp = {
            fast_slash: false,
            fast_star: false,
            exec: () => ['/dup', 'firstVal', undefined]
        };
        const matched = layer.match('/dup');
        expect(matched).toBe(true);
        expect(layer.$params['dup']).toBe('firstVal');
    });

    test('handle_request passes params to ctx and calls fn', () => {
        let executed = false;
        const stack = {
            url: '/test',
            methods: ['GET'],
            handle: (ctx, next) => {
                executed = true;
                return next();
            }
        };
        const layer = new Layer(stack);
        layer.match('/test');

        const ctx = { request: {} };
        let nextCalled = false;
        layer.handle_request(ctx, () => {
            nextCalled = true;
        });

        expect(executed).toBe(true);
        expect(nextCalled).toBe(true);
        expect(ctx.request.params).toBe(layer.$params);
    });

    test('handle_request skips execution if fn.length > 2 (error middleware)', () => {
        const stack = {
            url: '/test',
            methods: ['GET'],
            handle: (err, ctx, next) => {}
        };
        const layer = new Layer(stack);
        const ctx = { request: {} };
        let nextCalled = false;
        layer.handle_request(ctx, () => {
            nextCalled = true;
        });

        expect(nextCalled).toBe(true);
    });

    test('handle_request catches synchronous throw and calls next(err)', () => {
        const stack = {
            url: '/test',
            methods: ['GET'],
            handle: (ctx, next) => {
                throw new Error('Sync fail');
            }
        };
        const layer = new Layer(stack);
        const ctx = { request: {} };
        let caughtErr = null;
        layer.handle_request(ctx, (err) => {
            caughtErr = err;
        });

        expect(caughtErr).toBeDefined();
        expect(caughtErr.message).toBe('Sync fail');
    });

    test('handle_error delegates to fn if fn.length === 3', () => {
        let errHandled = null;
        const stack = {
            url: '/test',
            methods: ['GET'],
            handle: (err, ctx, next) => {
                errHandled = err;
                return next();
            }
        };
        const layer = new Layer(stack);
        const ctx = { request: {} };
        let nextCalled = false;
        layer.handle_error(new Error('Layer err'), ctx, () => {
            nextCalled = true;
        });

        expect(errHandled.message).toBe('Layer err');
        expect(nextCalled).toBe(true);
    });

    test('handle_error forwards error to next if fn.length !== 3', () => {
        const stack = {
            url: '/test',
            methods: ['GET'],
            handle: (ctx, next) => next()
        };
        const layer = new Layer(stack);
        const ctx = { request: {} };
        let passedErr = null;
        layer.handle_error(new Error('Forward me'), ctx, (err) => {
            passedErr = err;
        });

        expect(passedErr.message).toBe('Forward me');
    });

    test('handle_error catches error thrown inside fn', () => {
        const stack = {
            url: '/test',
            methods: ['GET'],
            handle: (err, ctx, next) => {
                throw new Error('Error inside error handler');
            }
        };
        const layer = new Layer(stack);
        const ctx = { request: {} };
        let passedErr = null;
        layer.handle_error(new Error('Orig'), ctx, (err) => {
            passedErr = err;
        });

        expect(passedErr.message).toBe('Error inside error handler');
    });
});
