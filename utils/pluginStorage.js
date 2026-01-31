/**
 * Plugin Storage Module
 * Handles persistence of plugin states and configurations
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');
const PLUGINS_CONFIG_FILE = path.join(__dirname, '..', 'data', 'plugins-config.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Ensures required directories exist
 */
function ensureDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(PLUGINS_DIR)) {
        fs.mkdirSync(PLUGINS_DIR, { recursive: true });
        logger.info('Created plugins directory', { path: PLUGINS_DIR });
    }
}

/**
 * Loads plugin configuration from storage
 * @returns {Object} Plugin config data structure
 */
function loadPluginsConfig() {
    ensureDirectories();
    
    try {
        if (fs.existsSync(PLUGINS_CONFIG_FILE)) {
            const data = fs.readFileSync(PLUGINS_CONFIG_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading plugins config', { error: error.message });
    }
    
    return { plugins: {}, lastUpdated: null };
}

/**
 * Saves plugin configuration to storage
 * @param {Object} config - Plugin config data structure
 */
function savePluginsConfig(config) {
    ensureDirectories();
    
    try {
        config.lastUpdated = new Date().toISOString();
        fs.writeFileSync(PLUGINS_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        logger.debug('Plugins config saved');
    } catch (error) {
        logger.error('Error saving plugins config', { error: error.message });
        throw error;
    }
}

/**
 * Gets the state of a specific plugin
 * @param {string} pluginName - Name of the plugin
 * @returns {Object|null} Plugin state or null if not found
 */
function getPluginState(pluginName) {
    const config = loadPluginsConfig();
    return config.plugins[pluginName] || null;
}

/**
 * Sets the state of a specific plugin
 * @param {string} pluginName - Name of the plugin
 * @param {Object} state - Plugin state
 */
function setPluginState(pluginName, state) {
    const config = loadPluginsConfig();
    config.plugins[pluginName] = {
        ...config.plugins[pluginName],
        ...state,
        updatedAt: new Date().toISOString()
    };
    savePluginsConfig(config);
}

/**
 * Gets all plugin states
 * @returns {Object} Map of plugin names to states
 */
function getAllPluginStates() {
    const config = loadPluginsConfig();
    return config.plugins;
}

/**
 * Checks if a plugin is enabled
 * @param {string} pluginName - Name of the plugin
 * @returns {boolean} Whether the plugin is enabled
 */
function isPluginEnabled(pluginName) {
    const state = getPluginState(pluginName);
    return state?.enabled === true;
}

/**
 * Enables a plugin
 * @param {string} pluginName - Name of the plugin
 */
function enablePlugin(pluginName) {
    setPluginState(pluginName, { enabled: true, enabledAt: new Date().toISOString() });
    logger.info('Plugin enabled', { pluginName });
}

/**
 * Disables a plugin
 * @param {string} pluginName - Name of the plugin
 */
function disablePlugin(pluginName) {
    setPluginState(pluginName, { enabled: false, disabledAt: new Date().toISOString() });
    logger.info('Plugin disabled', { pluginName });
}

/**
 * Gets the custom configuration for a plugin
 * @param {string} pluginName - Name of the plugin
 * @returns {Object} Plugin configuration
 */
function getPluginConfig(pluginName) {
    const state = getPluginState(pluginName);
    return state?.config || {};
}

/**
 * Sets the custom configuration for a plugin
 * @param {string} pluginName - Name of the plugin
 * @param {Object} pluginConfig - Plugin configuration
 */
function setPluginConfig(pluginName, pluginConfig) {
    setPluginState(pluginName, { config: pluginConfig });
    logger.info('Plugin config updated', { pluginName });
}

/**
 * Reads a plugin's manifest (plugin.json)
 * @param {string} pluginName - Name of the plugin
 * @returns {Object|null} Plugin manifest or null if not found
 */
function readPluginManifest(pluginName) {
    const manifestPath = path.join(PLUGINS_DIR, pluginName, 'plugin.json');
    
    try {
        if (fs.existsSync(manifestPath)) {
            const data = fs.readFileSync(manifestPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error reading plugin manifest', { pluginName, error: error.message });
    }
    
    return null;
}

/**
 * Lists all installed plugins (directories in plugins folder)
 * @returns {Array<string>} List of plugin names
 */
function listInstalledPlugins() {
    ensureDirectories();
    
    try {
        const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
        return entries
            .filter(entry => entry.isDirectory())
            .filter(entry => {
                // Check if it has a valid plugin.json
                const manifestPath = path.join(PLUGINS_DIR, entry.name, 'plugin.json');
                return fs.existsSync(manifestPath);
            })
            .map(entry => entry.name);
    } catch (error) {
        logger.error('Error listing plugins', { error: error.message });
        return [];
    }
}

/**
 * Gets detailed information about all installed plugins
 * @returns {Array<Object>} List of plugin info objects
 */
function getInstalledPluginsInfo() {
    const plugins = listInstalledPlugins();
    const states = getAllPluginStates();
    
    return plugins.map(name => {
        const manifest = readPluginManifest(name);
        const state = states[name] || {};
        
        return {
            name,
            version: manifest?.version || '0.0.0',
            description: manifest?.description || '',
            author: manifest?.author || 'Unknown',
            main: manifest?.main || 'index.js',
            commands: manifest?.commands || [],
            dependencies: manifest?.dependencies || [],
            enabled: state.enabled || false,
            enabledAt: state.enabledAt || null,
            disabledAt: state.disabledAt || null,
            config: state.config || {},
            updatedAt: state.updatedAt || null
        };
    });
}

/**
 * Removes plugin state from storage
 * @param {string} pluginName - Name of the plugin
 */
function removePluginState(pluginName) {
    const config = loadPluginsConfig();
    delete config.plugins[pluginName];
    savePluginsConfig(config);
    logger.info('Plugin state removed', { pluginName });
}

/**
 * Gets the path to the plugins directory
 * @returns {string} Plugins directory path
 */
function getPluginsDir() {
    return PLUGINS_DIR;
}

// ==================== GUILD PERMISSIONS ====================

/**
 * Gets guild-specific plugin settings
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Guild plugin settings
 */
function getGuildPluginSettings(guildId) {
    const config = loadPluginsConfig();
    return config.guilds?.[guildId] || {};
}

/**
 * Sets guild-specific plugin settings
 * @param {string} guildId - Discord guild ID
 * @param {Object} settings - Guild plugin settings
 */
function setGuildPluginSettings(guildId, settings) {
    const config = loadPluginsConfig();
    if (!config.guilds) {
        config.guilds = {};
    }
    config.guilds[guildId] = {
        ...config.guilds[guildId],
        ...settings,
        updatedAt: new Date().toISOString()
    };
    savePluginsConfig(config);
}

/**
 * Checks if a plugin is enabled for a specific guild
 * @param {string} pluginName - Plugin name
 * @param {string} guildId - Discord guild ID
 * @returns {boolean} Whether plugin is enabled for the guild
 */
function isPluginEnabledForGuild(pluginName, guildId) {
    // First check if plugin is globally enabled
    if (!isPluginEnabled(pluginName)) {
        return false;
    }
    
    // Then check guild-specific settings
    const guildSettings = getGuildPluginSettings(guildId);
    
    // If no guild settings exist, plugin is enabled by default
    if (!guildSettings.disabledPlugins) {
        return true;
    }
    
    // Check if plugin is in disabled list for this guild
    return !guildSettings.disabledPlugins.includes(pluginName);
}

/**
 * Enables a plugin for a specific guild
 * @param {string} pluginName - Plugin name
 * @param {string} guildId - Discord guild ID
 */
function enablePluginForGuild(pluginName, guildId) {
    const guildSettings = getGuildPluginSettings(guildId);
    
    if (guildSettings.disabledPlugins) {
        guildSettings.disabledPlugins = guildSettings.disabledPlugins.filter(p => p !== pluginName);
    }
    
    setGuildPluginSettings(guildId, guildSettings);
    logger.info('Plugin enabled for guild', { plugin: pluginName, guildId });
}

/**
 * Disables a plugin for a specific guild
 * @param {string} pluginName - Plugin name
 * @param {string} guildId - Discord guild ID
 */
function disablePluginForGuild(pluginName, guildId) {
    const guildSettings = getGuildPluginSettings(guildId);
    
    if (!guildSettings.disabledPlugins) {
        guildSettings.disabledPlugins = [];
    }
    
    if (!guildSettings.disabledPlugins.includes(pluginName)) {
        guildSettings.disabledPlugins.push(pluginName);
    }
    
    setGuildPluginSettings(guildId, guildSettings);
    logger.info('Plugin disabled for guild', { plugin: pluginName, guildId });
}

/**
 * Gets all guild-specific plugin configurations
 * @returns {Object} Map of guild ID to settings
 */
function getAllGuildSettings() {
    const config = loadPluginsConfig();
    return config.guilds || {};
}

module.exports = {
    loadPluginsConfig,
    savePluginsConfig,
    getPluginState,
    setPluginState,
    getAllPluginStates,
    isPluginEnabled,
    enablePlugin,
    disablePlugin,
    getPluginConfig,
    setPluginConfig,
    readPluginManifest,
    listInstalledPlugins,
    getInstalledPluginsInfo,
    removePluginState,
    getPluginsDir,
    // Guild permissions
    getGuildPluginSettings,
    setGuildPluginSettings,
    isPluginEnabledForGuild,
    enablePluginForGuild,
    disablePluginForGuild,
    getAllGuildSettings,
    PLUGINS_DIR,
    PLUGINS_CONFIG_FILE
};
