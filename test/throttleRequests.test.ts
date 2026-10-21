import ThrottleRequests from '../src/middleware/throttleRequests';
import ThrottleRequestsException from '@ostro/http/exception/throttleRequestsException';
import HttpException from '@ostro/http/exception/httpException';
import Unlimited from '@ostro/cache/rateLimiting/unlimited';
import Response from '@ostro/http/response';

describe('ThrottleRequests Middleware', () => {
    let mockCache;
    let mockApp;
    let mockLimiter;

    beforeEach(() => {
        ThrottleRequests.shouldHashKeys(true);
        mockCache = {};
        mockApp = {
            cache: mockCache
        };
    });

    test('static using and with generate middleware strings', () => {
        const usingStr = ThrottleRequests.using('api');
        expect(usingStr).toBe('ThrottleRequests:api');

        const withStr = ThrottleRequests.with(100, 2, 'api:');
        expect(withStr).toBe('ThrottleRequests:100,2,api:');

        const withDefaults = ThrottleRequests.with();
        expect(withDefaults).toBe('ThrottleRequests:60,1,');
    });

    test('shouldHashKeys toggles hashing behavior', () => {
        ThrottleRequests.shouldHashKeys(false);
        const mw = new ThrottleRequests(10, 1, 'prefix:');
        expect(mw.formatIdentifier('my-id')).toBe('my-id');

        ThrottleRequests.shouldHashKeys(true);
        expect(mw.formatIdentifier('my-id')).not.toBe('my-id');
    });

    test('resolveRequestSignature resolves auth user, ip, or throws if domain unavailable', async () => {
        const mw = new ThrottleRequests();

        // 1. With user
        const reqWithUser = {
            user: async () => ({ getAuthIdentifier: () => 'user-123' }),
            hostname: () => 'localhost',
            ip: () => '127.0.0.1'
        };
        const sigUser = await mw.resolveRequestSignature(reqWithUser);
        expect(sigUser).toBe(mw.formatIdentifier('user-123'));

        // 2. Without user, with hostname and ip
        const reqWithHost = {
            user: async () => null,
            hostname: () => 'example.com',
            ip: () => '1.2.3.4'
        };
        const sigHost = await mw.resolveRequestSignature(reqWithHost);
        expect(sigHost).toBe(mw.formatIdentifier('example.com|1.2.3.4'));

        // 3. Without user and without hostname
        const reqEmpty = {
            user: async () => null,
            hostname: () => null,
            ip: () => '1.2.3.4'
        };
        await expect(mw.resolveRequestSignature(reqEmpty)).rejects.toThrow('Unable to generate the request signature. Route unavailable.');
    });

    test('resolveMaxAttempts handles pipe delimited and numeric limits', async () => {
        const mw = new ThrottleRequests();
        const guestReq = { user: async () => null };
        const userReq = { user: async () => ({ rate_limit: 200 }) };

        // pipe split: guest gets index 0, auth gets index 1
        expect(await mw.resolveMaxAttempts(guestReq, '10|50')).toBe(10);
        expect(await mw.resolveMaxAttempts(userReq, '10|50')).toBe(50);

        // attribute on user model
        expect(await mw.resolveMaxAttempts(userReq, 'rate_limit')).toBe(200);

        // plain numeric
        expect(await mw.resolveMaxAttempts(guestReq, '30')).toBe(30);
    });

    test('handle executes standard rate limiting and adds headers', async () => {
        const mw = new ThrottleRequests(10, 1, 'test:');
        mw.$app = mockApp;

        mw.$limiter.tooManyAttempts = jest.fn().mockResolvedValue(false);
        mw.$limiter.hit = jest.fn().mockResolvedValue(true);
        mw.$limiter.retriesLeft = jest.fn().mockResolvedValue(9);

        const req = {
            user: async () => null,
            hostname: () => 'localhost',
            ip: () => '127.0.0.1'
        };

        const headers = {};
        const res = {
            header(key, val) {
                headers[key] = val;
            }
        };

        let nextCalled = false;
        await mw.handle({
            request: req,
            response: res,
            next: () => {
                nextCalled = true;
            }
        });

        expect(nextCalled).toBe(true);
        expect(headers['X-RateLimit-Limit']).toBe(10);
        expect(headers['X-RateLimit-Remaining']).toBe(9);
    });

    test('handle throws ThrottleRequestsException when too many attempts', async () => {
        const mw = new ThrottleRequests(5, 1, 'test:');
        mw.$app = mockApp;

        mw.$limiter.tooManyAttempts = jest.fn().mockResolvedValue(true);
        mw.$limiter.availableIn = jest.fn().mockResolvedValue(45);

        const req = {
            user: async () => null,
            hostname: () => 'localhost',
            ip: () => '127.0.0.1'
        };
        const res = { header: jest.fn() };

        let caughtErr = null;
        await mw.handle({
            request: req,
            response: res,
            next: (err) => {
                caughtErr = err;
            }
        });

        expect(caughtErr).toBeInstanceOf(ThrottleRequestsException);
        expect(caughtErr.message).toBe('Too Many Attempts.');
        expect(caughtErr.getHeaders()['Retry-After']).toBe(45);
        expect(caughtErr.getHeaders()['X-RateLimit-Remaining']).toBe(0);
    });

    test('buildException uses custom responseCallback when callable', async () => {
        const mw = new ThrottleRequests();
        mw.$app = mockApp;
        mw.$limiter.availableIn = jest.fn().mockResolvedValue(30);

        const customCallback = jest.fn((req, headers) => 'Rate limited custom body');
        const err = await mw.buildException({}, 'test-key', 10, customCallback);

        expect(err).toBeInstanceOf(HttpException);
        expect(customCallback).toHaveBeenCalled();
    });

    test('getHeaders returns empty if response already has lower or equal remaining', () => {
        const mw = new ThrottleRequests();
        const res = {
            header(key) {
                if (key === 'X-RateLimit-Remaining') return '3';
                return null;
            }
        };

        const headers = mw.getHeaders(10, 5, null, res);
        expect(headers).toEqual([]);
    });

    test('named limiter returning Response', async () => {
        const mw = new ThrottleRequests('named_limiter');
        mw.$app = mockApp;

        const customResponse = new Response('Custom rate limit page', 429);
        mw.$limiter.limiter = jest.fn(() => () => customResponse);

        const req = { user: async () => null, hostname: () => 'localhost', ip: () => '127.0.0.1' };
        const res = { header: jest.fn() };
        let nextCalled = false;

        const result = await mw.handle({
            request: req,
            response: res,
            next: () => { nextCalled = true; }
        });

        expect(result).toBe(customResponse);
        expect(nextCalled).toBe(false);
    });

    test('named limiter returning Unlimited', async () => {
        const mw = new ThrottleRequests('named_unlimited');
        mw.$app = mockApp;

        mw.$limiter.limiter = jest.fn(() => () => new Unlimited());

        const req = { user: async () => null, hostname: () => 'localhost', ip: () => '127.0.0.1' };
        const res = { header: jest.fn() };
        let nextCalled = false;

        await mw.handle({
            request: req,
            response: res,
            next: () => { nextCalled = true; }
        });

        expect(nextCalled).toBe(true);
    });

    test('named limiter returning limit object array with unhashed and hashed keys', async () => {
        // Hashed keys = false
        ThrottleRequests.shouldHashKeys(false);
        const mw = new ThrottleRequests('named_array');
        mw.$app = mockApp;

        mw.$limiter.limiter = jest.fn(() => () => [{
            key: 'tier1',
            maxAttempts: 100,
            decayMinutes: 1,
            responseCallback: null
        }]);

        mw.$limiter.tooManyAttempts = jest.fn().mockResolvedValue(false);
        mw.$limiter.hit = jest.fn().mockResolvedValue(true);
        mw.$limiter.retriesLeft = jest.fn().mockResolvedValue(99);

        const req = { user: async () => null, hostname: () => 'localhost', ip: () => '127.0.0.1' };
        const res = { header: jest.fn() };
        let nextCalled = false;

        await mw.handle({
            request: req,
            response: res,
            next: () => { nextCalled = true; }
        });

        expect(nextCalled).toBe(true);
        expect(mw.$limiter.tooManyAttempts).toHaveBeenCalledWith('named_array:tier1', 100);

        // Hashed keys = true
        ThrottleRequests.shouldHashKeys(true);
        await mw.handle({
            request: req,
            response: res,
            next: () => {}
        });
        expect(mw.$limiter.tooManyAttempts).not.toHaveBeenCalledWith('named_array:tier1');
    });

    test('constructor with and without $app', () => {
        const mw1 = new ThrottleRequests();
        expect(mw1.$limiter).toBeDefined();

        ThrottleRequests.prototype.$app = { cache: {} };
        const mw2 = new ThrottleRequests();
        expect(mw2.$limiter).toBeDefined();
        delete ThrottleRequests.prototype.$app;

        const mw3 = new ThrottleRequests(undefined, undefined, undefined);
        expect(mw3.$maxAttempts).toBe(60);
    });

    test('getHeaders with response having higher remaining than current', () => {
        const mw = new ThrottleRequests();
        const res = {
            header(key) {
                if (key === 'X-RateLimit-Remaining') return '10';
                return null;
            }
        };

        const headers = mw.getHeaders(20, 5, 60, res);
        expect(headers['X-RateLimit-Limit']).toBe(20);
        expect(headers['X-RateLimit-Remaining']).toBe(5);
        expect(headers['Retry-After']).toBe(60);

        // response exists but header returns null
        const resNullHeader = {
            header(key) {
                return null;
            }
        };
        const headersNull = mw.getHeaders(20, 5, null, resNullHeader);
        expect(headersNull['X-RateLimit-Limit']).toBe(20);

        // Call without retryAfter or response
        const headersDefaults = mw.getHeaders(10, 3);
        expect(headersDefaults['X-RateLimit-Limit']).toBe(10);
        expect(headersDefaults['X-RateLimit-Remaining']).toBe(3);
        expect(headersDefaults['Retry-After']).toBeUndefined();
    });

    test('handleRequest with empty limits array', async () => {
        const mw = new ThrottleRequests();
        let nextCalled = false;
        await mw.handleRequest({}, {}, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
    });

    test('resolveMaxAttempts default parameter', async () => {
        const mw = new ThrottleRequests();
        const req = { user: async () => null };
        expect(await mw.resolveMaxAttempts(req)).toBeNaN();
    });

    test('buildException default parameter', async () => {
        const mw = new ThrottleRequests();
        mw.$app = mockApp;
        mw.$limiter.availableIn = jest.fn().mockResolvedValue(10);
        const exc = await mw.buildException({}, 'test-key', 5);
        expect(exc).toBeInstanceOf(ThrottleRequestsException);
    });

    test('shouldHashKeys default parameter', () => {
        ThrottleRequests.shouldHashKeys();
        expect(ThrottleRequests.$shouldHashKeys).toBe(true);
    });
});
