import RouteServiceProvider from '../src/routeServiceProvider';
import Router from '../src/router';

describe('RouteServiceProvider', () => {
    test('registers router singleton and boots service provider', () => {
        const singletons = {};
        const mockApp = {
            singleton(name, factory) {
                singletons[name] = factory(mockApp);
            }
        };

        const provider = new RouteServiceProvider(mockApp);
        provider.register();

        expect(singletons['router']).toBeInstanceOf(Router);

        let mapCalled = false;
        provider.map = () => {
            mapCalled = true;
        };
        provider.boot();
        expect(mapCalled).toBe(true);
    });

    test('default properties', () => {
        const provider = new RouteServiceProvider({});
        expect(provider.$namespace).toBe('');
        expect(provider.regexConfig).toEqual({
            sensitive: false,
            strict: false,
            end: true,
        });
        expect(provider.kernal).toEqual({
            default: [],
            named: {}
        });
        provider.map(); // empty default implementation
    });
});
