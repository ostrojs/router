import { Macroable } from '@ostro/support/macro';

/**
 * Context object passed to routing handlers and middleware.
 */
class HttpRouterContext extends Macroable {
    public readonly request!: any;
    public readonly response!: any;
    public next?: Function;

    /**
     * Create a new HttpRouterContext instance.
     *
     * @param request - HTTP request instance.
     * @param response - HTTP response instance.
     * @param next - Optional next callback function.
     */
    constructor(request: any, response: any, next?: Function) {
        super();
        Object.defineProperty(this, 'request', {
            value: request,
            enumerable: true,
            configurable: false,
            writable: false
        });
        Object.defineProperty(this, 'response', {
            value: response,
            enumerable: true,
            configurable: false,
            writable: false
        });
    }
}

export default HttpRouterContext;