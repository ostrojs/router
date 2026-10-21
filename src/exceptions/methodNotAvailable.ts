/**
 * Exception thrown when a controller or middleware method is not available.
 */
class MethodNotAvailable extends Error {
    public statusCode: number;

    /**
     * Create a new MethodNotAvailable instance.
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

export default MethodNotAvailable;