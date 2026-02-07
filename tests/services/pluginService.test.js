/**
 * Tests for services/pluginService.js
 * Focus on exported constants and basic functionality
 */

describe('pluginService', () => {
    let pluginService;

    beforeEach(() => {
        jest.resetModules();
        
        // Mock dependencies
        jest.doMock('fs', () => ({
            existsSync: jest.fn(() => true),
            readFileSync: jest.fn(() => '{}'),
            writeFileSync: jest.fn(),
            readdirSync: jest.fn(() => []),
            statSync: jest.fn(() => ({ isDirectory: () => true })),
            mkdirSync: jest.fn()
        }));
        
        jest.doMock('../../utils/logger', () => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        }));
        
        jest.doMock('../../utils/pluginStorage', () => ({
            loadPluginsConfig: jest.fn(() => ({ plugins: {}, guilds: {} })),
            savePluginsConfig: jest.fn(),
            getPluginState: jest.fn(),
            setPluginState: jest.fn(),
            isPluginEnabled: jest.fn(() => false),
            enablePlugin: jest.fn(),
            disablePlugin: jest.fn(),
            listInstalledPlugins: jest.fn(() => []),
            readPluginManifest: jest.fn(),
            PLUGINS_DIR: '/mock/plugins'
        }));
        
        jest.doMock('../../utils/auditLogger', () => ({
            logPluginAction: jest.fn()
        }));
        
        pluginService = require('../../services/pluginService');
    });

    afterEach(() => {
        jest.resetModules();
    });

    describe('exports', () => {
        it('should export ERROR_THRESHOLD constant', () => {
            expect(pluginService.ERROR_THRESHOLD).toBeDefined();
            expect(typeof pluginService.ERROR_THRESHOLD).toBe('number');
            expect(pluginService.ERROR_THRESHOLD).toBeGreaterThan(0);
        });

        it('should export ERROR_WINDOW_MS constant', () => {
            expect(pluginService.ERROR_WINDOW_MS).toBeDefined();
            expect(typeof pluginService.ERROR_WINDOW_MS).toBe('number');
            expect(pluginService.ERROR_WINDOW_MS).toBeGreaterThan(0);
        });

        it('should export setClient function', () => {
            expect(typeof pluginService.setClient).toBe('function');
        });

        it('should export getClient function', () => {
            expect(typeof pluginService.getClient).toBe('function');
        });

        it('should export initialize function', () => {
            expect(typeof pluginService.initialize).toBe('function');
        });

        it('should export shutdown function', () => {
            expect(typeof pluginService.shutdown).toBe('function');
        });

        it('should export plugin management functions', () => {
            expect(typeof pluginService.loadPlugin).toBe('function');
            expect(typeof pluginService.unloadPlugin).toBe('function');
            expect(typeof pluginService.enablePlugin).toBe('function');
            expect(typeof pluginService.disablePlugin).toBe('function');
            expect(typeof pluginService.reloadPlugin).toBe('function');
        });

        it('should export query functions', () => {
            expect(typeof pluginService.getLoadedPlugins).toBe('function');
            expect(typeof pluginService.getEnabledPlugins).toBe('function');
            expect(typeof pluginService.getPluginCommand).toBe('function');
            expect(typeof pluginService.getAllPluginCommands).toBe('function');
            expect(typeof pluginService.getPluginCommandsForDeploy).toBe('function');
            expect(typeof pluginService.isPluginCommand).toBe('function');
        });

        it('should export error tracking functions', () => {
            expect(typeof pluginService.recordPluginError).toBe('function');
            expect(typeof pluginService.getPluginErrorStats).toBe('function');
            expect(typeof pluginService.clearPluginErrors).toBe('function');
        });
    });

    describe('setClient / getClient', () => {
        it('should store and retrieve Discord client', () => {
            const mockClient = { user: { tag: 'TestBot#1234' } };
            
            pluginService.setClient(mockClient);
            
            expect(pluginService.getClient()).toBe(mockClient);
        });

        it('should return null when no client set', () => {
            expect(pluginService.getClient()).toBeNull();
        });
    });

    describe('getLoadedPlugins', () => {
        it('should return empty array when no plugins loaded', () => {
            const plugins = pluginService.getLoadedPlugins();
            expect(Array.isArray(plugins)).toBe(true);
            expect(plugins.length).toBe(0);
        });
    });

    describe('getEnabledPlugins', () => {
        it('should return empty array when no plugins enabled', () => {
            const plugins = pluginService.getEnabledPlugins();
            expect(Array.isArray(plugins)).toBe(true);
            expect(plugins.length).toBe(0);
        });
    });

    describe('getPluginCommand', () => {
        it('should return null for unknown command', () => {
            const command = pluginService.getPluginCommand('unknown-command');
            expect(command).toBeNull();
        });
    });

    describe('isPluginCommand', () => {
        it('should return false for unknown command', () => {
            const isPlugin = pluginService.isPluginCommand('unknown-command');
            expect(isPlugin).toBe(false);
        });
    });

    describe('getPluginCommandsForDeploy', () => {
        it('should return empty array when no commands', () => {
            const commands = pluginService.getPluginCommandsForDeploy();
            expect(Array.isArray(commands)).toBe(true);
            expect(commands.length).toBe(0);
        });
    });

    describe('error tracking', () => {
        it('should track plugin errors', () => {
            const error = new Error('Test error');
            
            // Record an error
            pluginService.recordPluginError('test-plugin', error, 'test');
            
            // Check stats
            const stats = pluginService.getPluginErrorStats('test-plugin');
            expect(stats.totalErrors).toBe(1);
        });

        it('should clear plugin errors', () => {
            const error = new Error('Test error');
            
            pluginService.recordPluginError('test-plugin', error, 'test');
            pluginService.clearPluginErrors('test-plugin');
            
            const stats = pluginService.getPluginErrorStats('test-plugin');
            expect(stats.totalErrors).toBe(0);
        });

        it('should return zero errors for unknown plugin', () => {
            const stats = pluginService.getPluginErrorStats('unknown-plugin');
            expect(stats.totalErrors).toBe(0);
            expect(stats.recentErrors).toBe(0);
        });
    });
});
