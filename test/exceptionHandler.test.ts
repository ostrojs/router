import ExceptionHandler from '../src/exceptionHandler';

describe('ExceptionHandler', () => {
    let originalEnv;

    beforeEach(() => {
        originalEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
    });

    test('handle formats Error stack in development', () => {
        process.env.NODE_ENV = 'development';
        const handler = new ExceptionHandler();
        const err = new Error('Test error');
        err.status = 404;

        let sentBody = null;
        let sentStatus = null;
        const res = {
            send(body, status) {
                sentBody = body;
                sentStatus = status;
            }
        };

        handler.handle(err, { response: res }, () => {});
        expect(sentStatus).toBe(404);
        expect(sentBody).toContain('<pre>');
        expect(sentBody).toContain('Test error');
        expect(sentBody).toContain('</pre>');
    });

    test('handle formats Error in production mode', () => {
        process.env.NODE_ENV = 'production';
        const handler = new ExceptionHandler();
        const err = new Error('Secret error details');

        let sentBody = null;
        let sentStatus = null;
        const res = {
            send(body, status) {
                sentBody = body;
                sentStatus = status;
            }
        };

        handler.handle(err, { response: res }, () => {});
        expect(sentStatus).toBe(500);
        expect(sentBody).toBe('<pre>Whoops, looks like something went wrong.</pre>');
    });

    test('handle formats non-Error object with status in development', () => {
        process.env.NODE_ENV = 'development';
        const handler = new ExceptionHandler();
        const objErr = { status: 403, msg: 'Forbidden' };

        let sentBody = null;
        let sentStatus = null;
        const res = {
            send(body, status) {
                sentBody = body;
                sentStatus = status;
            }
        };

        handler.handle(objErr, { response: res }, () => {});
        expect(sentStatus).toBe(403);
        expect(sentBody).toBe('<pre>[object Object]</pre>');

        // Test object without status property
        const plainObj = { msg: 'No status' };
        handler.handle(plainObj, { response: res }, () => {});
        expect(sentStatus).toBe(500);
    });

    test('handle formats non-Error string error', () => {
        process.env.NODE_ENV = 'development';
        const handler = new ExceptionHandler();

        let sentBody = null;
        let sentStatus = null;
        const res = {
            send(body, status) {
                sentBody = body;
                sentStatus = status;
            }
        };

        handler.handle('Simple failure', { response: res }, () => {});
        expect(sentStatus).toBe(500);
        expect(sentBody).toBe('<pre>Simple failure</pre>');

        // Call handle without next
        handler.handle('No next callback', { response: res });
        expect(sentStatus).toBe(500);
    });

    test('terminate logs error to console.error', () => {
        const handler = new ExceptionHandler();
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        handler.terminate('Fatal error', { response: {} }, () => {});
        expect(consoleSpy).toHaveBeenCalledWith('Fatal error');
        consoleSpy.mockRestore();
    });
});
