import path from 'path';
import GeneratorCommand from '@ostro/console/generatorCommand';
import { trim } from '@ostro/support/function';

/**
 * Console command for generating new middleware classes.
 */
class MiddlewareMakeCommand extends GeneratorCommand {
    /**
     * The console command name.
     */
    public get $signature(): string {
        return 'make:middleware';
    }

    /**
     * The console command description.
     */
    public get $description(): string {
        return 'Create a new middleware class';
    }

    /**
     * The type of class being generated.
     */
    public $type: string = 'Middleware';

    public override get $dirname(): string {
        return __dirname;
    }

    /**
     * Get the stub file for the generator.
     *
     * @returns The resolved stub file path.
     */
    public getStub(): Promise<string> {
        return this.resolveStubPath('stubs/middleware.stub');
    }

    /**
     * Get the default namespace for the class.
     *
     * @param $rootNamespace - Root application namespace.
     * @returns The default namespace path.
     */
    public getDefaultNamespace($rootNamespace: string): string {
        return path.join($rootNamespace, 'app', 'http', 'middleware');
    }
}

export default MiddlewareMakeCommand;