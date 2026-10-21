import MethodNotAvailable from '../src/exceptions/methodNotAvailable';
import InvalidRouteExceptions from '../src/exceptions/invalidRouteExceptions';
import Controller from '../src/controller';

describe('Exceptions & Base Controller', () => {
    test('MethodNotAvailable has proper properties', () => {
        const err = new MethodNotAvailable('Method not found');
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('MethodNotAvailable');
        expect(err.message).toBe('Method not found');
        expect(err.statusCode).toBe(500);
        expect(err.stack).toBeDefined();
    });

    test('InvalidRouteExceptions has proper properties', () => {
        const err = new InvalidRouteExceptions('Route invalid');
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('InvalidRouteExceptions');
        expect(err.message).toBe('Route invalid');
        expect(err.statusCode).toBe(500);
        expect(err.stack).toBeDefined();
    });

    test('Controller class instantiates', () => {
        const ctrl = new Controller();
        expect(ctrl).toBeInstanceOf(Controller);
    });
});
