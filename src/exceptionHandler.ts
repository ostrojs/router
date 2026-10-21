/**
 * Exception handler for routing errors and unexpected terminations.
 */
class ExceptionHandler {
    /**
     * Handle the given error and render an HTTP response.
     *
     * @param error - The caught error or exception.
     * @param context - Context containing response.
     * @param next - Optional next callback.
     */
    public handle(error: any, { response }: Record<string, any>, next?: Function): void {
        let status: number = 500;
        if (error instanceof Error) {
            status = (error as any).status || 500;
            error = error.stack;
        } else if (typeof error === 'object') {
            status = error.status || 500;
            error = error;
        }
        error = process.env['NODE_ENV'] !== 'production' ? error : 'Whoops, looks like something went wrong.';
        response.send(`<pre>${error}</pre>`, status);
        if (typeof next === 'function') {
            next();
        }
    }

    /**
     * Terminate the process on fatal error by logging to console.
     *
     * @param error - The error to log.
     * @param context - Context containing response.
     * @param next - Optional next callback.
     */
    public terminate(error: any, { response }: Record<string, any>, next?: Function): void {
        console.error(error);
    }
}

export default ExceptionHandler;
