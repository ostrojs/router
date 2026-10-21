/**
 * Controller for rendering views directly from route definitions.
 */
class View {
    public $app: any;
    public $view: string | undefined;
    public $data: Record<string, any> | undefined;
    public $status: number | undefined;

    /**
     * Create a new View controller instance.
     *
     * @param app - Application instance or defaults configuration object.
     * @param defaults - Defaults configuration object.
     */
    constructor(app?: any, defaults: Record<string, any> = {}) {
        if ((!defaults || Object.keys(defaults).length === 0) && app && typeof app === 'object' && app.view) {
            defaults = app;
            app = null;
        }
        defaults = defaults || {};
        this.$app = app;
        this.$view = defaults.view;
        this.$data = defaults.data;
        this.$status = defaults.status;
    }

    /**
     * Handle the incoming request by rendering the configured view.
     *
     * @param context - Context containing request, response, and next.
     */
    public handle({ request, response, next }: Record<string, any>): void {
        response.view(this.$view, this.$data, this.$status);
    }
}

export default View;