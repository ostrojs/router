
const ThrottleRequestsException = require('@ostro/http/exception/throttleRequestsException');
const HttpException = require('@ostro/http/exception/httpException');
const RateLimiter = require('@ostro/cache/rateLimiter');
const Unlimited = require('@ostro/cache/rateLimiting/unlimited');
const InteractsWithTime = require('@ostro/support/interactsWithTime');
const { get_class_name } = require("@ostro/support/function");
const Response = require('@ostro/http/response');

class ThrottleRequests extends InteractsWithTime {

    $limiter;
    $maxAttempts;
    $decayMinutes;
    $prefix;

    static $shouldHashKeys = true;


    constructor($maxAttempts = 60, $decayMinutes = 1, $prefix = '') {
        super()
        this.$maxAttempts = $maxAttempts;
        this.$decayMinutes = $decayMinutes;
        this.$prefix = $prefix;
        this.$limiter = new RateLimiter(this.$app.cache);
    }

    static using($name) {
        return get_class_name(this) + ':' + $name;
    }

    static with($maxAttempts = 60, $decayMinutes = 1, $prefix = '') {
        const args = [...arguments];
        args[0] = args[0] || $maxAttempts;
        args[1] = args[1] || $decayMinutes;
        args[2] = args[2] || $prefix;
        return get_class_name(this) + ':' + args.join(',');
    }

    async handle({ request, response, next }) {
        const $limiter = is_string(this.$maxAttempts) ? this.$limiter.limiter(this.$maxAttempts) : null;
        if (
            !is_null($limiter)) {
            return this.handleRequestUsingNamedLimiter(request, response, next, this.$maxAttempts, this.$limiter);
        }

        this.handleRequest(
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

    handleRequestUsingNamedLimiter(request, response, next, $limiterName, $limiter) {
        $limiterResponse = $limiter(request);

        if ($limiterResponse instanceof Response) {
            return $limiterResponse;
        } else if ($limiterResponse instanceof Unlimited) {
            return next();
        }

        return this.handleRequest(
            request,
            response,
            next,
            collect(Arr.wrap($limiterResponse)).map(function ($limit) {
                return {
                    'key': this.$shouldHashKeys ? md5($limiterName.$limit.key) : $limiterName + ':' + $limit.key,
                    'maxAttempts': $limit.maxAttempts,
                    'decayMinutes': $limit.decayMinutes,
                    'responseCallback': $limit.responseCallback,
                };
            }).all()
        );
    }


    async handleRequest(request, response, next, $limits = []) {
        for (let $limit of $limits) {
            if (await this.$limiter.tooManyAttempts($limit.key, $limit.maxAttempts)) {
                return next(await this.buildException(request, $limit.key, $limit.maxAttempts, $limit.responseCallback));
            }

            await this.$limiter.hit($limit.key, $limit.decayMinutes * 60);
        }

        for (let $limit of $limits) {
            response = this.addHeaders(
                response,
                $limit.maxAttempts,
                await this.calculateRemainingAttempts($limit.key, $limit.maxAttempts)
            );
        }

        return next();
    }

    async resolveMaxAttempts(request, $maxAttempts = '') {
        const $user = await request.user();
        if (str_contains($maxAttempts, '|')) {
            $maxAttempts = $maxAttempts.split('|', 2)[$user ? 1 : 0];
        }

        if (!is_numeric($maxAttempts) && $user) {
            $maxAttempts = $user[$maxAttempts];
        }

        return parseInt($maxAttempts);
    }

    async resolveRequestSignature(request) {
        const $domain = request.hostname();
        const $user = await request.user()
        if ($user) {
            return this.formatIdentifier($user.getAuthIdentifier());
        } else if ($domain) {
            return this.formatIdentifier($domain + '|' + request.ip());
        }

        throw new Error('Unable to generate the request signature. Route unavailable.');
    }

    async buildException(request, $key, $maxAttempts, responseCallback = null) {
        const $retryAfter = await this.getTimeUntilNextRetry($key);

        const $headers = this.getHeaders(
            $maxAttempts,
            await this.calculateRemainingAttempts($key, $maxAttempts, $retryAfter),
            $retryAfter
        );

        return is_callable(responseCallback)
            ? new HttpException(responseCallback(request, $headers))
            : new ThrottleRequestsException(null, 'Too Many Attempts.', $headers);
    }

    getTimeUntilNextRetry($key) {
        return this.$limiter.availableIn($key);
    }

    addHeaders(response, $maxAttempts, $remainingAttempts, $retryAfter = null) {
        const headers = this.getHeaders($maxAttempts, $remainingAttempts, $retryAfter, response);
        for (let key in headers) {
            response.header(
                key,
                headers[key]
            );
        }


        return response;
    }


    getHeaders($maxAttempts, $remainingAttempts, $retryAfter = null, response = null) {
        if (response &&
            !is_null(response.header('X-RateLimit-Remaining')) &&
            parseInt(response.header('X-RateLimit-Remaining')) <= parseInt($remainingAttempts)) {
            return [];
        }

        const $headers = {
            'X-RateLimit-Limit': $maxAttempts,
            'X-RateLimit-Remaining': $remainingAttempts,
        };

        if (!is_null($retryAfter)) {
            $headers['Retry-After'] = $retryAfter;
            $headers['X-RateLimit-Reset'] = this.availableAt($retryAfter);
        }

        return $headers;
    }


    calculateRemainingAttempts($key, $maxAttempts, $retryAfter = null) {
        return is_null($retryAfter) ? this.$limiter.retriesLeft($key, $maxAttempts) : 0;
    }

    formatIdentifier($value) {
        return this.$shouldHashKeys ? sha1($value) : $value;
    }


    static shouldHashKeys($shouldHashKeys = true) {
        this.$shouldHashKeys = $shouldHashKeys;
    }
}

module.exports = ThrottleRequests