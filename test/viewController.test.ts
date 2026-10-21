import View from '../src/viewController';

describe('ViewController', () => {
    test('instantiates with defaults and renders view on response', () => {
        const view = new View(null, {
            view: 'home',
            data: { title: 'Welcome' },
            status: 200
        });

        expect(view.$view).toBe('home');
        expect(view.$data).toEqual({ title: 'Welcome' });
        expect(view.$status).toBe(200);

        let rendered = null;
        const mockResponse = {
            view(viewName, data, status) {
                rendered = { viewName, data, status };
            }
        };

        view.handle({ request: {}, response: mockResponse, next: () => {} });
        expect(rendered).toEqual({
            viewName: 'home',
            data: { title: 'Welcome' },
            status: 200
        });
    });

    test('instantiates with single defaults object as first argument', () => {
        const view = new View({
            view: 'about',
            data: { id: 1 },
            status: 201
        });

        expect(view.$view).toBe('about');
        expect(view.$data).toEqual({ id: 1 });
        expect(view.$status).toBe(201);
    });

    test('instantiates with null / undefined defaults safely', () => {
        const view = new View();
        expect(view.$view).toBeUndefined();
        expect(view.$data).toBeUndefined();
        expect(view.$status).toBeUndefined();

        const viewNull = new View({}, null);
        expect(viewNull.$view).toBeUndefined();
    });
});
