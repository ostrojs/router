import path from 'path';
import GeneratorCommand from '@ostro/console/generatorCommand';
import InvalidArgumentException from '@ostro/support/exceptions/invalidArgumentException';
import { trim, class_basename } from '@ostro/support/function';
import { replaceAllArray, ucfirst } from '@ostro/support/string';

/**
 * Console command for generating new controller classes.
 */
class ControllerMakeCommand extends GeneratorCommand {
    /**
     * The console command name.
     */
    public get $signature(): string {
        return 'make:controller';
    }

    /**
     * The console command description.
     */
    public get $description(): string {
        return 'Create a new controller class';
    }

    /**
     * The console command options.
     */
    public get $options(): any[] {
        return [
            this.createOption('--force', 'Create the class even if the controller already exists'),
            this.createOption('-m, --model [model]', 'Generate a resource controller for the given model.'),
            this.createOption('-r, --resource', 'Generate a resource controller class.')
        ];
    }

    /**
     * The type of class being generated.
     */
    public $type: string = 'Controller';

    public override get $dirname(): string {
        return __dirname;
    }

    /**
     * Get the stub file for the generator.
     *
     * @returns The resolved stub file path.
     */
    public getStub(): Promise<string> {
        let $stub: string | null = null;
        let $type: string | null;
        if (($type = this.option('type'))) {
            $stub = `stubs/controller.${$type}.stub`;
        } else if (this.option('model')) {
            $stub = 'stubs/controller.model.stub';
        } else if (this.option('resource')) {
            $stub = 'stubs/controller.stub';
        }

        $stub = $stub || 'stubs/controller.plain.stub';

        return this.resolveStubPath($stub);
    }

    /**
     * Get the default namespace for the class.
     *
     * @param $rootNamespace - Root application namespace.
     * @returns The default namespace path.
     */
    public getDefaultNamespace($rootNamespace: string): string {
        return path.join($rootNamespace, 'app', 'http', 'controllers');
    }

    /**
     * Build the class with the given name.
     *
     * @param $name - Class name.
     * @returns The built class content.
     */
    public async buildClass($name: string): Promise<string> {
        let $controllerNamespace: string = this.getNamespace($name);
        let $replace: Record<string, string> = {};
        if (this.option('model')) {
            $replace = await this.buildModelReplacements($replace);
        }

        return super.buildClass($name).then((content: any) => replaceAllArray(content, Object.keys($replace), Object.values($replace)));
    }

    /**
     * Build the model replacement values.
     *
     * @param $replace - Replacements dictionary.
     * @returns Updated replacements dictionary.
     */
    public async buildModelReplacements($replace: Record<string, string>): Promise<Record<string, string>> {
        let $modelClass: string = this.parseModel(this.option('model'));

        if (!await this.$file.exists(!$modelClass.endsWith('.js') ? $modelClass + '.js' : $modelClass)) {
            if (await this.confirm(`A ${$modelClass} model does not exist. Do you want to generate it?`, true)) {
                this.callCommand('make:model', {
                    'name': $modelClass
                });
            }
        }
        $modelClass = trim($modelClass.replace(this.rootNamespace(), '~').replaceAll('\\', '/'), '/');
        const baseModel = class_basename($modelClass);
        const modelVar = ucfirst(baseModel);
        return Object.assign($replace, {
            'DummyFullModelClass': $modelClass,
            '{{ namespacedModel }}': $modelClass,
            '{{namespacedModel}}': $modelClass,
            'DummyModelClass': baseModel,
            '{{ model }}': baseModel,
            '{{model}}': baseModel,
            'DummyModelVariable': modelVar,
            '{{ modelVariable }}': modelVar,
            '{{modelVariable}}': modelVar,
        });
    }

    /**
     * Parse the model name and format it.
     *
     * @param $model - Model name option value.
     * @returns Qualified model name.
     */
    public parseModel($model: any): string {
        if ($model && typeof $model === 'boolean') {
            throw new InvalidArgumentException('Invalid model name');
        }
        return this.qualifyModel($model);
    }
}

export default ControllerMakeCommand;