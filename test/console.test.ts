import path from 'path';
import fs from 'fs';
import ControllerMakeCommand from '../src/console/controllerMakeCommand';
import MiddlewareMakeCommand from '../src/console/middlewareMakeCommand';
import InvalidArgumentException from '@ostro/support/exceptions/invalidArgumentException';

describe('Console Make Commands', () => {
    describe('ControllerMakeCommand', () => {
        let app;
        let fileMock;
        let command;

        beforeEach(() => {
            fileMock = {
                exists: jest.fn().mockResolvedValue(false),
                get: jest.fn().mockImplementation((filePath) => {
                    return Promise.resolve(fs.readFileSync(filePath, 'utf8'));
                }),
                put: jest.fn().mockResolvedValue(true)
            };
            app = {
                basePath: jest.fn((subPath) => path.join('/mock/app', subPath || '')),
                rootNamespace: jest.fn(() => 'App'),
                config: {
                    get: jest.fn(() => 'App/Models/User')
                }
            };
            command = new ControllerMakeCommand(fileMock);
            command.$app = app;
        });

        test('getDefaultNamespace', () => {
            const ns = command.getDefaultNamespace('App');
            expect(ns).toBe(path.join('App', 'app', 'http', 'controllers'));
        });

        test('getStub returns plain stub by default', async () => {
            command.option = jest.fn((key) => null);
            const stubPath = await command.getStub();
            expect(stubPath).toContain('controller.plain.stub');
        });

        test('getStub returns resource stub when --resource option given', async () => {
            command.option = jest.fn((key) => key === 'resource' ? true : null);
            const stubPath = await command.getStub();
            expect(stubPath).toContain('controller.stub');
        });

        test('getStub returns model stub when --model option given', async () => {
            command.option = jest.fn((key) => key === 'model' ? 'User' : null);
            const stubPath = await command.getStub();
            expect(stubPath).toContain('controller.model.stub');
        });

        test('getStub returns custom type stub when --type option given', async () => {
            command.option = jest.fn((key) => key === 'type' ? 'nested' : null);
            const stubPath = await command.getStub();
            expect(stubPath).toContain('controller.nested.stub');
        });

        test('resolveStubPath uses custom path if file exists', async () => {
            fileMock.exists.mockResolvedValueOnce(true);
            const stubPath = await command.resolveStubPath('/stubs/controller.plain.stub');
            expect(stubPath).toBe(path.join('/mock/app', 'stubs/controller.plain.stub'));
        });

        test('parseModel throws InvalidArgumentException if model is boolean true', () => {
            expect(() => {
                command.parseModel(true);
            }).toThrow(InvalidArgumentException);
        });

        test('parseModel qualifies model name', () => {
            command.qualifyModel = jest.fn((m) => `App/Models/${m}`);
            expect(command.parseModel('User')).toBe('App/Models/User');
        });

        test('buildClass without model replaces standard class name', async () => {
            command.option = jest.fn((key) => null);
            command.getNamespace = jest.fn(() => 'App\\Http\\Controllers');
            command.rootNamespace = jest.fn(() => 'App');

            const content = await command.buildClass('UserController');
            expect(content).toContain('class UserController extends Controller');
            expect(content).toContain('module.exports = UserController');
        });

        test('buildClass with model prompts and generates model if not exists', async () => {
            command.option = jest.fn((key) => key === 'model' ? 'Post' : null);
            command.getNamespace = jest.fn(() => 'App\\Http\\Controllers');
            command.rootNamespace = jest.fn(() => 'App');
            command.qualifyModel = jest.fn((m) => `App/Models/${m}`);
            command.confirm = jest.fn().mockResolvedValue(true);
            command.callCommand = jest.fn();

            const content = await command.buildClass('PostController');
            expect(command.confirm).toHaveBeenCalled();
            expect(command.callCommand).toHaveBeenCalledWith('make:model', { name: 'App/Models/Post' });
            expect(content).toContain('class PostController extends Controller');
            expect(content).toContain('Post');
        });

        test('buildClass with model if model file already exists does not prompt', async () => {
            command.option = jest.fn((key) => key === 'model' ? 'User' : null);
            command.getNamespace = jest.fn(() => 'App\\Http\\Controllers');
            command.rootNamespace = jest.fn(() => 'App');
            command.qualifyModel = jest.fn((m) => `App/Models/${m}`);
            fileMock.exists = jest.fn((p) => {
                if (p.includes('User.js')) return Promise.resolve(true);
                return Promise.resolve(false);
            });
            command.confirm = jest.fn();

            const content = await command.buildClass('UserController');
            expect(command.confirm).not.toHaveBeenCalled();
            expect(content).toContain('class UserController extends Controller');
        });

        test('buildClass with model ending in .js and confirm returning false', async () => {
            command.option = jest.fn((key) => key === 'model' ? 'Order.js' : null);
            command.getNamespace = jest.fn(() => 'App\\Http\\Controllers');
            command.rootNamespace = jest.fn(() => 'App');
            command.qualifyModel = jest.fn((m) => `App/Models/${m}`);
            fileMock.exists = jest.fn().mockResolvedValue(false);
            command.confirm = jest.fn().mockResolvedValue(false);
            command.callCommand = jest.fn();

            const content = await command.buildClass('OrderController');
            expect(command.confirm).toHaveBeenCalled();
            expect(command.callCommand).not.toHaveBeenCalled();
            expect(content).toContain('class OrderController extends Controller');
        });
    });

    describe('MiddlewareMakeCommand', () => {
        let app;
        let fileMock;
        let command;

        beforeEach(() => {
            fileMock = {
                exists: jest.fn().mockResolvedValue(false),
                get: jest.fn().mockImplementation((filePath) => {
                    return fs.readFileSync(filePath, 'utf8');
                }),
                put: jest.fn().mockResolvedValue(true)
            };
            app = {
                basePath: jest.fn((subPath) => path.join('/mock/app', subPath || '')),
                rootNamespace: jest.fn(() => 'App')
            };
            command = new MiddlewareMakeCommand(fileMock);
            command.$app = app;
        });

        test('getDefaultNamespace', () => {
            const ns = command.getDefaultNamespace('App');
            expect(ns).toBe(path.join('App', 'app', 'http', 'middleware'));
        });

        test('getStub returns middleware stub', async () => {
            const stubPath = await command.getStub();
            expect(stubPath).toContain('middleware.stub');
        });

        test('resolveStubPath uses custom path when exists', async () => {
            fileMock.exists.mockResolvedValueOnce(true);
            const stubPath = await command.resolveStubPath('/stubs/middleware.stub');
            expect(stubPath).toBe(path.join('/mock/app', 'stubs/middleware.stub'));
        });
    });
});
