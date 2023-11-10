class ExceptionHandler {
    handle(error, { response }, next) {
        let status = 500;
        if (error instanceof Error) {
            status = error.status || 500;
            error = error.stack;
        } else if (typeof error == 'object') {
            status = error.status || 500;
            error = error;
        }
        error = process.env['NODE_ENV'] != 'production' ? error : 'Whoops, looks like something went wrong.';
        response.send(`<pre>${error}</pre>`, status);
    }

    terminate(error, { response }, next) {
        console.log(error)
    }
}

module.exports = ExceptionHandler
