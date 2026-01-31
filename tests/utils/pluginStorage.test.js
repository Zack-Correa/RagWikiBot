/**
 * Tests for utils/pluginStorage.js
 */

const fs = require('fs');
const path = require('path');

// Mock fs module
jest.mock('fs');

// Mock logger
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

const pluginStorage = require('../../utils/pluginStorage');
const logger = require('../../utils/logger');

describe('pluginStorage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Default mock implementations
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify({
            plugins: {
                'test-plugin': { enabled: true, enabledAt: '2024-01-01T00:00:00.000Z' }
            },
            guilds: {},
            lastUpdated: '2024-01-01T00:00:00.000Z'
        }));
        fs.writeFileSync.mockImplementation(() => {});
        fs.mkdirSync.mockImplementation(() => {});
        fs.readdirSync.mockReturnValue([]);
    });

    describe('loadPluginsConfig', () => {
        it('should load config from file when it exists', () => {
            const config = pluginStorage.loadPluginsConfig();
            
            expect(config).toHaveProperty('plugins');
            expect(config.plugins['test-plugin']).toBeDefined();
        });

        it('should return default config when file does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            
            const config = pluginStorage.loadPluginsConfig();
            
            expect(config).toEqual({ plugins: {}, lastUpdated: null });
        });

        it('should return default config on parse error', () => {
            fs.readFileSync.mockReturnValue('invalid json');
            
            const config = pluginStorage.loadPluginsConfig();
            
            expect(config).toEqual({ plugins: {}, lastUpdated: null });
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('savePluginsConfig', () => {
        it('should save config to file', () => {
            const config = { plugins: { 'my-plugin': { enabled: true } } };
            
            pluginStorage.savePluginsConfig(config);
            
            expect(fs.writeFileSync).toHaveBeenCalled();
            const savedData = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
            expect(savedData.lastUpdated).toBeDefined();
        });

        it('should throw error if save fails', () => {
            fs.writeFileSync.mockImplementation(() => {
                throw new Error('Write failed');
            });
            
            expect(() => {
                pluginStorage.savePluginsConfig({ plugins: {} });
            }).toThrow('Write failed');
        });
    });

    describe('getPluginState', () => {
        it('should return plugin state when exists', () => {
            const state = pluginStorage.getPluginState('test-plugin');
            
            expect(state).toBeDefined();
            expect(state.enabled).toBe(true);
        });

        it('should return null when plugin does not exist', () => {
            const state = pluginStorage.getPluginState('non-existent');
            
            expect(state).toBeNull();
        });
    });

    describe('setPluginState', () => {
        it('should update plugin state', () => {
            pluginStorage.setPluginState('test-plugin', { enabled: false });
            
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should merge with existing state', () => {
            let savedConfig;
            fs.writeFileSync.mockImplementation((path, data) => {
                savedConfig = JSON.parse(data);
            });
            
            pluginStorage.setPluginState('test-plugin', { customOption: 'value' });
            
            expect(savedConfig.plugins['test-plugin'].customOption).toBe('value');
            expect(savedConfig.plugins['test-plugin'].updatedAt).toBeDefined();
        });
    });

    describe('isPluginEnabled', () => {
        it('should return true for enabled plugins', () => {
            expect(pluginStorage.isPluginEnabled('test-plugin')).toBe(true);
        });

        it('should return false for disabled plugins', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify({
                plugins: { 'test-plugin': { enabled: false } },
                lastUpdated: null
            }));
            
            expect(pluginStorage.isPluginEnabled('test-plugin')).toBe(false);
        });

        it('should return false for non-existent plugins', () => {
            expect(pluginStorage.isPluginEnabled('non-existent')).toBe(false);
        });
    });

    describe('enablePlugin', () => {
        it('should enable plugin and log', () => {
            pluginStorage.enablePlugin('my-plugin');
            
            expect(fs.writeFileSync).toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalledWith('Plugin enabled', { pluginName: 'my-plugin' });
        });
    });

    describe('disablePlugin', () => {
        it('should disable plugin and log', () => {
            pluginStorage.disablePlugin('my-plugin');
            
            expect(fs.writeFileSync).toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalledWith('Plugin disabled', { pluginName: 'my-plugin' });
        });
    });

    describe('getPluginConfig', () => {
        it('should return plugin config', () => {
            fs.readFileSync.mockReturnValue(JSON.stringify({
                plugins: { 
                    'test-plugin': { 
                        enabled: true, 
                        config: { setting: 'value' } 
                    } 
                },
                lastUpdated: null
            }));
            
            const config = pluginStorage.getPluginConfig('test-plugin');
            
            expect(config).toEqual({ setting: 'value' });
        });

        it('should return empty object if no config', () => {
            const config = pluginStorage.getPluginConfig('test-plugin');
            
            expect(config).toEqual({});
        });
    });

    describe('setPluginConfig', () => {
        it('should save plugin config', () => {
            let savedConfig;
            fs.writeFileSync.mockImplementation((path, data) => {
                savedConfig = JSON.parse(data);
            });
            
            pluginStorage.setPluginConfig('test-plugin', { option: true });
            
            expect(savedConfig.plugins['test-plugin'].config).toEqual({ option: true });
        });
    });

    describe('Guild Permissions', () => {
        describe('getGuildPluginSettings', () => {
            it('should return guild settings when exist', () => {
                fs.readFileSync.mockReturnValue(JSON.stringify({
                    plugins: {},
                    guilds: { '123': { disabledPlugins: ['plugin-a'] } },
                    lastUpdated: null
                }));
                
                const settings = pluginStorage.getGuildPluginSettings('123');
                
                expect(settings.disabledPlugins).toContain('plugin-a');
            });

            it('should return empty object for new guild', () => {
                const settings = pluginStorage.getGuildPluginSettings('new-guild');
                
                expect(settings).toEqual({});
            });
        });

        describe('isPluginEnabledForGuild', () => {
            it('should return false if plugin is globally disabled', () => {
                fs.readFileSync.mockReturnValue(JSON.stringify({
                    plugins: { 'test-plugin': { enabled: false } },
                    guilds: {},
                    lastUpdated: null
                }));
                
                expect(pluginStorage.isPluginEnabledForGuild('test-plugin', '123')).toBe(false);
            });

            it('should return false if plugin is disabled for guild', () => {
                fs.readFileSync.mockReturnValue(JSON.stringify({
                    plugins: { 'test-plugin': { enabled: true } },
                    guilds: { '123': { disabledPlugins: ['test-plugin'] } },
                    lastUpdated: null
                }));
                
                expect(pluginStorage.isPluginEnabledForGuild('test-plugin', '123')).toBe(false);
            });

            it('should return true if plugin is enabled globally and not disabled for guild', () => {
                expect(pluginStorage.isPluginEnabledForGuild('test-plugin', '123')).toBe(true);
            });
        });

        describe('enablePluginForGuild', () => {
            it('should remove plugin from disabled list', () => {
                let savedConfig;
                fs.readFileSync.mockReturnValue(JSON.stringify({
                    plugins: {},
                    guilds: { '123': { disabledPlugins: ['test-plugin', 'other-plugin'] } },
                    lastUpdated: null
                }));
                fs.writeFileSync.mockImplementation((path, data) => {
                    savedConfig = JSON.parse(data);
                });
                
                pluginStorage.enablePluginForGuild('test-plugin', '123');
                
                expect(savedConfig.guilds['123'].disabledPlugins).not.toContain('test-plugin');
                expect(savedConfig.guilds['123'].disabledPlugins).toContain('other-plugin');
            });
        });

        describe('disablePluginForGuild', () => {
            it('should add plugin to disabled list', () => {
                let savedConfig;
                fs.writeFileSync.mockImplementation((path, data) => {
                    savedConfig = JSON.parse(data);
                });
                
                pluginStorage.disablePluginForGuild('test-plugin', '123');
                
                expect(savedConfig.guilds['123'].disabledPlugins).toContain('test-plugin');
            });

            it('should not duplicate plugin in disabled list', () => {
                let savedConfig;
                fs.readFileSync.mockReturnValue(JSON.stringify({
                    plugins: {},
                    guilds: { '123': { disabledPlugins: ['test-plugin'] } },
                    lastUpdated: null
                }));
                fs.writeFileSync.mockImplementation((path, data) => {
                    savedConfig = JSON.parse(data);
                });
                
                pluginStorage.disablePluginForGuild('test-plugin', '123');
                
                const count = savedConfig.guilds['123'].disabledPlugins.filter(p => p === 'test-plugin').length;
                expect(count).toBe(1);
            });
        });
    });

    describe('readPluginManifest', () => {
        it('should read and parse plugin.json', () => {
            fs.readFileSync.mockImplementation((filePath) => {
                if (filePath.includes('plugin.json')) {
                    return JSON.stringify({
                        name: 'test-plugin',
                        version: '1.0.0',
                        description: 'Test'
                    });
                }
                return '{}';
            });
            
            const manifest = pluginStorage.readPluginManifest('test-plugin');
            
            expect(manifest.name).toBe('test-plugin');
            expect(manifest.version).toBe('1.0.0');
        });

        it('should return null if manifest does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            
            const manifest = pluginStorage.readPluginManifest('non-existent');
            
            expect(manifest).toBeNull();
        });
    });
});
