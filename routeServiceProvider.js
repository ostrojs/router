const ServiceProvider = require('@ostro/support/serviceProvider');
const Router = require('./router')
class RouteServiceProvider extends ServiceProvider {
    $namespace = '';

    regexConfig = {
        sensitive: false,
        strict: false,
        end: true,
    };

    kernal = {
        default: [],
        named: {}
    };

    register() {
        this.registerRouter()
    }
    
    map() {

    }
    
    boot() {
        this.map()
    }

    registerRouter() {
        this.$app.singleton('router', (app => {
            return new Router(app, this.regexConfig)
        }))
    }

}
module.exports = RouteServiceProvider