import { flatten } from 'array-flatten';

/**
 * Compose middleware functions into a single execution function.
 *
 * @param handlers - Middleware functions or arrays of functions to compose.
 * @returns Composed middleware execution function.
 */
export function compose(...handlers: any[]): (...context: any[]) => any {
    const middleware: Function = generate(handlers);
    return function compose(...context: any[]): any {
        return middleware(null, ...context);
    };
}

/**
 * Compose middleware with an HttpContext constructor wrapper.
 *
 * @param handlers - Middleware functions to compose.
 * @returns Higher-order function accepting HttpContext class.
 */
export function composeWith(...handlers: any[]): (HttpContext: any) => (req: any, res: any, done: Function) => any {
    const middleware: Function = generate(handlers);
    return function (HttpContext: any) {
        return function (req: any, res: any, done: Function): any {
            const context: any = new HttpContext(req, res);

            return middleware(null, context, done);
        };
    };
}

/**
 * Decode a URL parameter value safely.
 *
 * @param val - The string parameter value to decode.
 * @returns The decoded string or original value if not string.
 */
export function decode_param(val: any): any {
    if (typeof val !== 'string' || val.length === 0) {
        return val;
    }

    try {
        return decodeURIComponent(val);
    } catch (err: any) {
        if (err instanceof URIError) {
            err.message = 'Failed to decode param \'' + val + '\'';
            (err as any).status = (err as any).statusCode = 400;
        }

        throw err;
    }
}

/**
 * Normalize and join URL segments.
 *
 * @param args - URL parts or an array of URL segments.
 * @returns Normalized URL string.
 */
export function urlNormalize(...args: any[]): string {
    let strArray: any[];
    if (typeof args[0] === 'object') {
        strArray = args[0];
    } else {
        strArray = [].slice.call(args);
    }
    const resultArray: any[] = [];
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

    for (let i = 0; i < strArray.length; i++) {
        const component: any = strArray[i];
        if (component === '') {
            continue;
        }
        resultArray.push(component);
    }
    const parts: string[] = resultArray.filter((data: any) => data).join('/').replace(/\/(\?|&|#[^!])/g, '$1/').replace(/\/{2,}/g, '/').split('?');
    return parts.shift()! + (parts.length > 0 ? '?' : '') + parts.join('&');
}

/**
 * Generate a sequential middleware dispatcher from an array of handlers.
 *
 * @param handlers - Array of middleware handler functions.
 * @returns Middleware runner function.
 */
function generate(handlers: any[]): Function {
    const stack: any[] = flatten(handlers);
    for (let _i = 0, stack_1 = stack; _i < stack_1.length; _i++) {
        const handler: any = stack_1[_i];
        if (typeof handler !== 'function') {
            throw new TypeError('Handlers must be a function');
        }
    }

    return function middleware(err: any, httpContext: any, done: Function): any {
        let index: number = -1;

        function dispatch(pos: number, err: any): any {
            const handler: any = stack[pos];

            index = pos;
            if (index === stack.length) {
                return done(err);
            }

            let nextCalled = false;
            let nextResolve: (val?: any) => void = () => {};
            const nextPromise = new Promise((resolve) => {
                nextResolve = resolve;
            });

            httpContext.next = (err: any) => {
                nextCalled = true;
                const p = dispatch(pos + 1, err);
                nextResolve(p);
                return p;
            };

            if (httpContext && typeof httpContext.setCurrentNext === 'function') {
                httpContext.setCurrentNext(httpContext.next);
            }

            try {
                if (handler.length === 3) {
                    if (err) {
                        const res = handler(err, httpContext, httpContext.next);
                        if (res && typeof res.then === 'function') {
                            return res.catch(httpContext.next);
                        }
                        if (pos < stack.length - 1) {
                            return nextPromise;
                        }
                        return res;
                    }
                } else {
                    if (!err) {
                        const res = handler(httpContext, httpContext.next);
                        if (res && typeof res.then === 'function') {
                            return res.catch(httpContext.next);
                        }
                        if (pos < stack.length - 1) {
                            return nextPromise;
                        }
                        return res;
                    }
                }
            } catch (e: any) {
                if (index > pos) {
                    throw e;
                }
                return httpContext.next(e);
            }
            return httpContext.next(err);
        }
        return dispatch(0, err);
    };
}