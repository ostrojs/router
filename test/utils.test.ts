import { compose, composeWith, decode_param, urlNormalize } from '../src/utils';

describe('Router Utils', () => {
    describe('decode_param', () => {
        test('returns non-string or empty string as is', () => {
            expect(decode_param(null)).toBeNull();
            expect(decode_param(undefined)).toBeUndefined();
            expect(decode_param(123)).toBe(123);
            expect(decode_param('')).toBe('');
        });

        test('decodes valid percent-encoded string', () => {
            expect(decode_param('hello%20world')).toBe('hello world');
            expect(decode_param('foo%2Fbar')).toBe('foo/bar');
        });

        test('throws 400 error on invalid URI encoding and handles non-URIError', () => {
            expect(() => {
                decode_param('%E0%A4%A');
            }).toThrow();

            try {
                decode_param('%E0%A4%A');
            } catch (err) {
                expect(err.statusCode).toBe(400);
                expect(err.status).toBe(400);
                expect(err.message).toContain('Failed to decode param');
            }

            // Test non-URIError branch
            const originalDecodeURIComponent = global.decodeURIComponent;
            try {
                global.decodeURIComponent = () => {
                    throw new TypeError('Custom error');
                };
                expect(() => decode_param('any')).toThrow(TypeError);
            } finally {
                global.decodeURIComponent = originalDecodeURIComponent;
            }
        });
    });

    describe('urlNormalize', () => {
        test('handles empty input', () => {
            expect(urlNormalize()).toBe('');
            expect(urlNormalize([])).toBe('');
        });

        test('normalizes standard path arguments', () => {
            expect(urlNormalize('api', 'v1', 'users')).toBe('api/v1/users');
            expect(urlNormalize(['api', '', 'users'])).toBe('api/users');
        });

        test('normalizes double and multiple slashes', () => {
            expect(urlNormalize('/api///v1/', '//users/')).toBe('/api/v1/users/');
        });

        test('handles http and file protocol schemas', () => {
            expect(urlNormalize('file:///', 'path', 'to', 'file')).toBe('file:/path/to/file');
            expect(urlNormalize('http://', 'example.com', 'api')).toBe('http:/example.com/api');
        });

        test('normalizes query params and hash strings', () => {
            expect(urlNormalize('search', '?q=test')).toBe('search?/q=test');
        });
    });

    describe('compose', () => {
        test('throws TypeError if handler is not a function', () => {
            expect(() => {
                compose('not-a-func');
            }).toThrow(TypeError);
        });

        test('executes middleware stack in order', async () => {
            const order = [];
            const fn1 = (ctx, next) => {
                order.push(1);
                return next();
            };
            const fn2 = (ctx, next) => {
                order.push(2);
                return next();
            };

            const composed = compose(fn1, fn2);
            const ctx = {};
            await new Promise((resolve, reject) => {
                composed(ctx, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            expect(order).toEqual([1, 2]);
        });

        test('propagates synchronous error through next', async () => {
            const fn1 = (ctx, next) => {
                throw new Error('Boom in fn1');
            };
            const composed = compose(fn1);
            const ctx = {};

            const err = await new Promise((resolve) => {
                composed(ctx, (e) => resolve(e));
            });
            expect(err.message).toBe('Boom in fn1');
        });

        test('handles error-handling middleware (3 arguments)', async () => {
            const fn1 = (ctx, next) => {
                return next(new Error('Trigger error'));
            };
            let caughtError = null;
            const errorHandler = (err, ctx, next) => {
                caughtError = err;
                return next();
            };

            const composed = compose(fn1, errorHandler);
            const ctx = {};

            await new Promise((resolve) => {
                composed(ctx, resolve);
            });

            expect(caughtError).toBeDefined();
            expect(caughtError.message).toBe('Trigger error');
        });

        test('handles async rejected promise in middleware', async () => {
            const fn1 = async (ctx, next) => {
                throw new Error('Async error');
            };

            const composed = compose(fn1);
            const ctx = {};

            const err = await new Promise((resolve) => {
                composed(ctx, resolve);
            });

            expect(err).toBeDefined();
            expect(err.message).toBe('Async error');
        });

        test('handles async rejected promise in error-handling middleware', async () => {
            const fn1 = (ctx, next) => {
                return next(new Error('Init error'));
            };
            const errHandler = async (err, ctx, next) => {
                throw new Error('Error in error handler');
            };

            const composed = compose(fn1, errHandler);
            const ctx = {};

            const err = await new Promise((resolve) => {
                composed(ctx, resolve);
            });

            expect(err).toBeDefined();
            expect(err.message).toBe('Error in error handler');
        });

        test('re-throws error if caught after index > pos (multi next)', () => {
            const fn1 = (ctx, next) => {
                next();
                throw new Error('After next throw');
            };
            const composed = compose(fn1);
            const ctx = {};

            expect(() => {
                composed(ctx, () => {});
            }).toThrow('After next throw');
        });

        test('bypasses normal middleware (length < 3) when err is present', async () => {
            const executed = [];
            const fn1 = (ctx, next) => {
                return next(new Error('err1'));
            };
            const normalMw = (ctx, next) => {
                executed.push('normal');
                return next();
            };
            const composed = compose(fn1, normalMw);
            const ctx = {};
            const err = await new Promise((resolve) => {
                composed(ctx, resolve);
            });
            expect(err.message).toBe('err1');
            expect(executed).toEqual([]);
        });

        test('skips error-handling middleware (3 arguments) when err is null', async () => {
            const executed = [];
            const normalMw = (ctx, next) => {
                executed.push('normal');
                return next();
            };
            const errorMw = (err, ctx, next) => {
                executed.push('errorMw');
                return next();
            };
            const composed = compose(normalMw, errorMw);
            const ctx = {};
            await new Promise((resolve) => {
                composed(ctx, resolve);
            });
            expect(executed).toEqual(['normal']);
        });
    });

    describe('composeWith', () => {
        test('creates runner with HttpContext instantiation', async () => {
            class MockHttpContext {
                constructor(req, res) {
                    this.req = req;
                    this.res = res;
                }
            }

            const fn = (ctx, next) => {
                ctx.req.processed = true;
                return next();
            };

            const factory = composeWith(fn);
            const runner = factory(MockHttpContext);

            const req = {};
            const res = {};

            await new Promise((resolve) => {
                runner(req, res, resolve);
            });

            expect(req.processed).toBe(true);
        });
    });
});
