const GeneratorCommand = require('@ostro/console/generatorCommand')

class MiddlewareMakeCommand extends GeneratorCommand {

    $signature = 'make:middleware';

    $description =  'Create a new middleware class';

    $type =  'Middleware';

    getStub() {
        return this.resolveStubPath('/stubs/middleware.stub');
    }

    resolveStubPath($stub) {
        let $customPath = this.$app.basePath(trim($stub, '/'))
        return this.$file.exists($customPath).then($exists => ($exists ? $customPath : path.join(__dirname, $stub)))
    }

    getDefaultNamespace($rootNamespace) {
        return path.join($rootNamespace, 'app', 'http', 'middleware');
    }

}

module.exports = MiddlewareMakeCommand