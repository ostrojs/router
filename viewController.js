class View {
    constructor(app, defaults) {
        this.$view = defaults.view;
        this.$data = defaults.data;
        this.$status = defaults.status;
    }
    handle({ request, response, next }) {
        response.view(this.$view, this.$data, this.$status)
    }
}

module.exports = View