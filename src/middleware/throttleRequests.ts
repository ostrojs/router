import ThrottleRequestsException from '@ostro/http/exception/throttleRequestsException';
import HttpException from '@ostro/http/exception/httpException';
import RateLimiter from '@ostro/cache/rateLimiter';
import Unlimited from '@ostro/cache/rateLimiting/unlimited';
import InteractsWithTime from '@ostro/support/interactsWithTime';
import { get_class_name, is_string, is_null, is_numeric, str_contains, is_callable, collect, md5, sha1 } from '@ostro/support/function';
import * as Arr from '@ostro/support/array';
import Response from '@ostro/http/response';

/**
 * Middleware to throttle incoming HTTP requests based on IP, user, or custom key.
 */
class ThrottleRequests extends InteractsWithTime {
    declare public $app: any;
    public $limiter: any;
    public $maxAttempts: any;
    public $decayMinutes: number;
    public $prefix: string;

    public static $shouldHashKeys: boolean = true;

    /**
     * Create a new throttle requests middleware instance.
     *
     * @param $maxAttempts - Maximum attempts allowed or named limiter name.
     * @param $decayMinutes - Number of minutes before attempts decay.
     * @param $prefix - Prefix for cache keys.
     */
    constructor($maxAttempts: any = 60, $decayMinutes: number = 1, $prefix: string = '') {
        super();
        this.$maxAttempts = $maxAttempts;
        this.$decayMinutes = $decayMinutes;
        this.$prefix = $prefix;
        this.$limiter = new RateLimiter(this.$app ? this.$app.cache : null);
    }

    /**
     * Resolve the middleware string for a named limiter.
     *
     * @param $name - Limiter name.
     * @returns Formatted middleware identifier string.
     */
    public static using($name: string): string {
        return get_class_name(this) + ':' + $name;
    }

    /**
     * Resolve the middleware string with specific parameters.
     *
     * @param $maxAttempts - Max attempts.
     * @param $decayMinutes - Decay minutes.
     * @param $prefix - Key prefix.
     * @returns Formatted middleware identifier string.
     */
    public static with($maxAttempts: any = 60, $decayMinutes: any = 1, $prefix: string = ''): string {
        const args: any[] = [...arguments];
        args[0] = args[0] || $maxAttempts;
        args[1] = args[1] || $decayMinutes;
        args[2] = args[2] || $prefix;
        return get_class_name(this) + ':' + args.join(',');
    }

    /**
     * Handle an incoming request.
     *
     * @param context - Context containing request, response, and next callback.
     * @returns Result of next middleware or response.
     */
    public async handle({ request, response, next }: Record<string, any>): Promise<any> {
        const $limiter: any = is_string(this.$maxAttempts) ? this.$limiter.limiter(this.$maxAttempts) : null;
        if (!is_null($limiter)) {
            return this.handleRequestUsingNamedLimiter(request, response, next, this.$maxAttempts, $limiter);
        }

        return this.handleRequest(
            request,
            response,
            next,
            [
                {
                    'key': this.$prefix + await this.resolveRequestSignature(request),
                    'maxAttempts': await this.resolveMaxAttempts(request, this.$maxAttempts),
                    'decayMinutes': this.$decayMinutes,
                    'responseCallback': null,
                },
            ]
        );
    }

    /**
     * Handle the request using a named rate limiter.
     *
     * @param request - HTTP request.
     * @param response - HTTP response.
     * @param next - Next middleware callback.
     * @param $limiterName - Limiter name.
     * @param $limiter - Limiter callback.
     * @returns Response or next callback invocation.
     */
    public handleRequestUsingNamedLimiter(request: any, response: any, next: Function, $limiterName: string, $limiter: Function): any {
        const $limiterResponse: any = $limiter(request);

        if ($limiterResponse instanceof Response) {
            return $limiterResponse;
        } else if ($limiterResponse instanceof Unlimited) {
            return next();
        }

        return this.handleRequest(
            request,
            response,
            next,
            collect(Arr.wrap($limiterResponse)).map(($limit: any) => {
                return {
                    'key': (this.constructor as typeof ThrottleRequests).$shouldHashKeys ? md5($limiterName + ':' + $limit.key) : $limiterName + ':' + $limit.key,
                    'maxAttempts': $limit.maxAttempts,
                    'decayMinutes': $limit.decayMinutes,
                    'responseCallback': $limit.responseCallback,
                };
            }).all()
        );
    }

    /**
     * Handle request against configured rate limits.
     *
     * @param request - HTTP request.
     * @param response - HTTP response.
     * @param next - Next callback.
     * @param $limits - Array of rate limits to enforce.
     * @returns Next callback or throws exception.
     */
    public async handleRequest(request: any, response: any, next: Function, $limits: any[] = []): Promise<any> {
        for (const $limit of $limits) {
            if (await this.$limiter.tooManyAttempts($limit.key, $limit.maxAttempts)) {
                return next(await this.buildException(request, $limit.key, $limit.maxAttempts, $limit.responseCallback));
            }

            await this.$limiter.hit($limit.key, $limit.decayMinutes * 60);
        }

        for (const $limit of $limits) {
            response = this.addHeaders(
                response,
                $limit.maxAttempts,
                await this.calculateRemainingAttempts($limit.key, $limit.maxAttempts)
            );
        }

        return next();
    }

    /**
     * Resolve the number of attempts if the user is given or not.
     *
     * @param request - HTTP request.
     * @param $maxAttempts - Max attempts string or numeric.
     * @returns Resolved maximum attempts.
     */
    public async resolveMaxAttempts(request: any, $maxAttempts: string = ''): Promise<number> {
        const $user: any = await request.user();
        if (str_contains($maxAttempts, '|')) {
            $maxAttempts = $maxAttempts.split('|', 2)[$user ? 1 : 0];
        }

        if (!is_numeric($maxAttempts) && $user) {
            $maxAttempts = $user[$maxAttempts];
        }

        return parseInt($maxAttempts);
    }

    /**
     * Resolve the request signature for hashing.
     *
     * @param request - HTTP request.
     * @returns Signature string.
     */
    public async resolveRequestSignature(request: any): Promise<string> {
        const $domain: string | null = request.hostname();
        const $user: any = await request.user();
        if ($user) {
            return this.formatIdentifier($user.getAuthIdentifier());
        } else if ($domain) {
            return this.formatIdentifier($domain + '|' + request.ip());
        }

        throw new Error('Unable to generate the request signature. Route unavailable.');
    }

    /**
     * Build the rate limit exceeded exception.
     *
     * @param request - HTTP request.
     * @param $key - Rate limit key.
     * @param $maxAttempts - Maximum attempts.
     * @param responseCallback - Optional custom response callback.
     * @returns The generated exception.
     */
    public async buildException(request: any, $key: string, $maxAttempts: any, responseCallback: any = null): Promise<any> {
        const $retryAfter: number = await this.getTimeUntilNextRetry($key);

        const $headers: Record<string, any> = this.getHeaders(
            $maxAttempts,
            await this.calculateRemainingAttempts($key, $maxAttempts, $retryAfter),
            $retryAfter
        );

        return is_callable(responseCallback)
            ? new HttpException(responseCallback(request, $headers))
            : new ThrottleRequestsException(null, 'Too Many Attempts.', $headers);
    }

    /**
     * Get the number of seconds until the next retry.
     *
     * @param $key - Rate limit key.
     * @returns Number of seconds.
     */
    public getTimeUntilNextRetry($key: string): Promise<number> {
        return this.$limiter.availableIn($key);
    }

    /**
     * Add the rate limiting headers to the given response.
     *
     * @param response - HTTP response.
     * @param $maxAttempts - Maximum attempts.
     * @param $remainingAttempts - Remaining attempts.
     * @param $retryAfter - Retry-After duration.
     * @returns Response with headers added.
     */
    public addHeaders(response: any, $maxAttempts: any, $remainingAttempts: any, $retryAfter: any = null): any {
        const headers: Record<string, any> = this.getHeaders($maxAttempts, $remainingAttempts, $retryAfter, response);
        for (const key in headers) {
            response.header(
                key,
                headers[key]
            );
        }

        return response;
    }

    /**
     * Get the rate limiting headers.
     *
     * @param $maxAttempts - Maximum attempts.
     * @param $remainingAttempts - Remaining attempts.
     * @param $retryAfter - Retry-After duration.
     * @param response - Optional response to check existing remaining headers.
     * @returns Headers dictionary or array.
     */
    public getHeaders($maxAttempts: any, $remainingAttempts: any, $retryAfter: any = null, response: any = null): any {
        if (response &&
            !is_null(response.header('X-RateLimit-Remaining')) &&
            parseInt(response.header('X-RateLimit-Remaining')) <= parseInt($remainingAttempts)) {
            return [];
        }

        const $headers: Record<string, any> = {
            'X-RateLimit-Limit': $maxAttempts,
            'X-RateLimit-Remaining': $remainingAttempts,
        };

        if (!is_null($retryAfter)) {
            $headers['Retry-After'] = $retryAfter;
            $headers['X-RateLimit-Reset'] = this.availableAt($retryAfter);
        }

        return $headers;
    }

    /**
     * Calculate the number of remaining attempts.
     *
     * @param $key - Rate limit key.
     * @param $maxAttempts - Maximum attempts.
     * @param $retryAfter - Retry after duration.
     * @returns Remaining attempts count.
     */
    public calculateRemainingAttempts($key: string, $maxAttempts: any, $retryAfter: any = null): any {
        return is_null($retryAfter) ? this.$limiter.retriesLeft($key, $maxAttempts) : 0;
    }

    /**
     * Format the rate limiter identifier.
     *
     * @param $value - Value to format.
     * @returns Formatted identifier.
     */
    public formatIdentifier($value: any): string {
        return (this.constructor as typeof ThrottleRequests).$shouldHashKeys ? sha1($value) : $value;
    }

    /**
     * Set whether rate limiter keys should be hashed.
     *
     * @param $shouldHashKeys - Whether keys should be hashed.
     */
    public static shouldHashKeys($shouldHashKeys: boolean = true): void {
        this.$shouldHashKeys = $shouldHashKeys;
    }
}

export default ThrottleRequests;