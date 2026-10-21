import HttpRouterContext from '../src/httpContext';

describe('HttpRouterContext', () => {
    test('defines non-writable enumerable request and response', () => {
        const req = { url: '/test' };
        const res = { status: 200 };
        const ctx = new HttpRouterContext(req, res);

        expect(ctx.request).toBe(req);
        expect(ctx.response).toBe(res);

        expect(() => {
            ctx.request = {};
        }).toThrow();

        expect(() => {
            ctx.response = {};
        }).toThrow();

        const keys = Object.keys(ctx);
        expect(keys).toContain('request');
        expect(keys).toContain('response');
    });

    test('supports Macroable methods', () => {
        HttpRouterContext.macro('customHelper', function () {
            return this.request.url;
        });

        const ctx = new HttpRouterContext({ url: '/macro-test' }, {});
        expect(ctx.customHelper()).toBe('/macro-test');
    });
});
