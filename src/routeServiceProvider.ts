import ServiceProvider from '@ostro/support/serviceProvider';
import Router from './router';

interface RegexConfig {
    sensitive: boolean;
    strict: boolean;
    end: boolean;
}

interface KernelConfig {
    default: any[];
    named: Record<string, any>;
}

/**
 * Service provider for registering and booting router services.
 */
class RouteServiceProvider extends ServiceProvider {
    /**
     * Default controller namespace.
     */
    public $namespace: string = '';

    /**
     * Regex compilation configuration for path-to-regexp.
     */
    public regexConfig: RegexConfig = {
        sensitive: false,
        strict: false,
        end: true,
    };

    /**
     * Default and named middleware registrations.
     */
    public kernal: KernelConfig = {
        default: [],
        named: {}
    };

    /**
     * Register route services into the container.
     */
    public register(): void {
        this.registerRouter();
    }

    /**
     * Define the routes for the application.
     */
    public map(): void {

    }

    /**
     * Boot the route service provider.
     */
    public boot(): void {
        this.map();
    }

    /**
     * Register the router singleton in the application container.
     */
    public registerRouter(): void {
        this.$app.singleton('router', ((app: any) => {
            return new Router(app, this.regexConfig);
        }));
    }
}

export default RouteServiceProvider;