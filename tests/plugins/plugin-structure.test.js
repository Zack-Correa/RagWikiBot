/**
 * Tests for plugin structure and manifest validation
 */

const fs = require('fs');
const path = require('path');

// Use actual fs for this test (not mocked)
jest.unmock('fs');

const PLUGINS_DIR = path.join(__dirname, '..', '..', 'plugins');

describe('Plugin Structure', () => {
    let installedPlugins = [];

    beforeAll(() => {
        // Get all installed plugins
        if (fs.existsSync(PLUGINS_DIR)) {
            installedPlugins = fs.readdirSync(PLUGINS_DIR)
                .filter(name => {
                    const pluginPath = path.join(PLUGINS_DIR, name);
                    return fs.statSync(pluginPath).isDirectory() && name !== 'node_modules';
                });
        }
    });

    describe('Plugin Manifests', () => {
        it('should have plugins installed', () => {
            expect(installedPlugins.length).toBeGreaterThan(0);
        });

        installedPlugins.forEach || (installedPlugins = []);
        
        test.each(installedPlugins.length > 0 ? installedPlugins : ['_placeholder'])('plugin "%s" should have valid plugin.json', (pluginName) => {
            if (pluginName === '_placeholder') {
                return; // Skip placeholder
            }
            
            const manifestPath = path.join(PLUGINS_DIR, pluginName, 'plugin.json');
            
            expect(fs.existsSync(manifestPath)).toBe(true);
            
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            
            // Required fields
            expect(manifest).toHaveProperty('name');
            expect(manifest).toHaveProperty('version');
            expect(manifest).toHaveProperty('description');
            expect(manifest).toHaveProperty('author');
            expect(manifest).toHaveProperty('main');
            
            // Name should match folder name
            expect(manifest.name).toBe(pluginName);
            
            // Version should be semver-like
            expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
            
            // Main file should exist
            const mainPath = path.join(PLUGINS_DIR, pluginName, manifest.main);
            expect(fs.existsSync(mainPath)).toBe(true);
        });
    });

    describe('Plugin Entry Points', () => {
        test.each(installedPlugins.length > 0 ? installedPlugins : ['_placeholder'])('plugin "%s" should export required hooks', (pluginName) => {
            if (pluginName === '_placeholder') {
                return; // Skip placeholder
            }
            
            const pluginPath = path.join(PLUGINS_DIR, pluginName);
            const manifestPath = path.join(pluginPath, 'plugin.json');
            
            if (!fs.existsSync(manifestPath)) return;
            
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const mainFile = path.join(pluginPath, manifest.main);
            
            // Read the file content to check exports (without executing)
            const content = fs.readFileSync(mainFile, 'utf8');
            
            // Should export lifecycle hooks
            expect(content).toMatch(/onLoad|exports\.onLoad/);
            expect(content).toMatch(/onEnable|exports\.onEnable/);
            expect(content).toMatch(/onDisable|exports\.onDisable/);
            expect(content).toMatch(/onUnload|exports\.onUnload/);
            
            // Should export commands object
            expect(content).toMatch(/commands|exports\.commands/);
        });
    });

    describe('Plugin Commands', () => {
        test.each(installedPlugins.length > 0 ? installedPlugins : ['_placeholder'])('plugin "%s" commands should match manifest', (pluginName) => {
            if (pluginName === '_placeholder') {
                return; // Skip placeholder
            }
            
            const manifestPath = path.join(PLUGINS_DIR, pluginName, 'plugin.json');
            
            if (!fs.existsSync(manifestPath)) return;
            
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            
            // Commands array should exist (can be empty)
            expect(manifest).toHaveProperty('commands');
            expect(Array.isArray(manifest.commands)).toBe(true);
            
            // Each command name should be valid (lowercase, with hyphens)
            manifest.commands.forEach(cmdName => {
                expect(cmdName).toMatch(/^[a-z][a-z0-9-]*$/);
            });
        });
    });

    describe('Plugin Author', () => {
        test.each(installedPlugins.length > 0 ? installedPlugins : ['_placeholder'])('plugin "%s" should have author "Zack Corrêa"', (pluginName) => {
            if (pluginName === '_placeholder') {
                return;
            }
            
            const manifestPath = path.join(PLUGINS_DIR, pluginName, 'plugin.json');
            
            if (!fs.existsSync(manifestPath)) return;
            
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            
            expect(manifest.author).toBe('Zack Corrêa');
        });
    });
});
