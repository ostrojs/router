/**
 * Exception thrown when a requested route cannot be resolved.
 */
class InvalidRouteExceptions extends Error {
    public statusCode: number;

    /**
     * Create a new InvalidRouteExceptions instance.
     *
     * @param message - The error message.
     */
    constructor(message: string) {
        super();
        this.name = this.constructor.name;
        this.message = message;
        this.statusCode = 500;
        Error.captureStackTrace(this, this.constructor);
    }
}

export default InvalidRouteExceptions;