/**
 * Plugin Service
 * Manages the lifecycle of plugins: loading, enabling, disabling, reloading
 */

const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const logger = require('../utils/logger');
const pluginStorage = require('../utils/pluginStorage');
const auditLogger = require('../utils/auditLogger');

// Lazy load error alert service to avoid circular dependencies
let errorAlertService = null;
function getErrorAlertService() {
    if (!errorAlertService) {
        errorAlertService = require('./errorAlertService');
    }
    return errorAlertService;
}

// Loaded plugin instances
const loadedPlugins = new Map();

// Plugin commands (separate from main commands)
const pluginCommands = new Collection();

// Plugin event handlers
const pluginEventHandlers = new Map();

// Discord client reference
let discordClient = null;

// Error tracking for auto-disable
const pluginErrors = new Map();
const ERROR_THRESHOLD = 5; // Number of errors before auto-disable
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 minutes window

/**
 * Records a plugin error and checks if auto-disable should trigger
 * @param {string} pluginName - Plugin name
 * @param {Error} error - The error that occurred
 * @param {string} context - Context where error occurred (e.g., 'command', 'event')
 * @returns {boolean} Whether the plugin was auto-disabled
 */
function recordPluginError(pluginName, error, context = 'unknown') {
    if (!pluginErrors.has(pluginName)) {
        pluginErrors.set(pluginName, []);
    }
    
    const errors = pluginErrors.get(pluginName);
    const now = Date.now();
    
    // Add new error
    errors.push({
        timestamp: now,
        message: error.message,
        context,
        stack: error.stack
    });
    
    // Remove errors outside the window
    const windowStart = now - ERROR_WINDOW_MS;
    const recentErrors = errors.filter(e => e.timestamp > windowStart);
    pluginErrors.set(pluginName, recentErrors);
    
    logger.warn(`Plugin error recorded`, {
        plugin: pluginName,
        context,
        error: error.message,
        recentErrorCount: recentErrors.length,
        threshold: ERROR_THRESHOLD
    });
    
    // Check if we should auto-disable
    if (recentErrors.length >= ERROR_THRESHOLD) {
        logger.error(`Auto-disabling plugin due to too many errors`, {
            plugin: pluginName,
            errorCount: recentErrors.length,
            window: `${ERROR_WINDOW_MS / 60000} minutes`
        });
        
        // Disable the plugin
        const result = disablePlugin(pluginName);
        
        if (result.success) {
            // Log to audit
            auditLogger.logPluginAction({
                plugin: pluginName,
                action: 'auto_disable',
                details: {
                    reason: 'Too many errors',
                    errorCount: recentErrors.length,
                    lastError: error.message
                }
            });
            
            // Send alert to admins
            try {
                const alertService = getErrorAlertService();
                alertService.alertPluginAutoDisabled(pluginName, recentErrors.length);
            } catch (alertError) {
                logger.error('Failed to send auto-disable alert', { error: alertError.message });
            }
            
            // Clear error history
            pluginErrors.delete(pluginName);
            
            return true;
        }
    }
    
    return false;
}

/**
 * Gets error statistics for a plugin
 * @param {string} pluginName - Plugin name
 * @returns {Object} Error statistics
 */
function getPluginErrorStats(pluginName) {
    const errors = pluginErrors.get(pluginName) || [];
    const now = Date.now();
    const windowStart = now - ERROR_WINDOW_MS;
    const recentErrors = errors.filter(e => e.timestamp > windowStart);
    
    return {
        totalErrors: errors.length,
        recentErrors: recentErrors.length,
        threshold: ERROR_THRESHOLD,
        windowMinutes: ERROR_WINDOW_MS / 60000,
        lastError: errors.length > 0 ? errors[errors.length - 1] : null
    };
}

/**
 * Clears error history for a plugin
 * @param {string} pluginName - Plugin name
 */
function clearPluginErrors(pluginName) {
    pluginErrors.delete(pluginName);
}

/**
 * Sets the Discord client reference
 * @param {Client} client - Discord.js client
 */
function setClient(client) {
    discordClient = client;
}

/**
 * Gets the Discord client
 * @returns {Client|null} Discord client
 */
function getClient() {
    return discordClient;
}

/**
 * Creates a plugin context object passed to lifecycle hooks
 * @param {string} pluginName - Plugin name
 * @returns {Object} Plugin context
 */
function createPluginContext(pluginName) {
    return {
        name: pluginName,
        logger: {
            info: (msg, data) => logger.info(`[Plugin:${pluginName}] ${msg}`, data),
            warn: (msg, data) => logger.warn(`[Plugin:${pluginName}] ${msg}`, data),
            error: (msg, data) => logger.error(`[Plugin:${pluginName}] ${msg}`, data),
            debug: (msg, data) => logger.debug(`[Plugin:${pluginName}] ${msg}`, data)
        },
        getClient: () => discordClient,
        getConfig: () => pluginStorage.getPluginConfig(pluginName),
        setConfig: (config) => pluginStorage.setPluginConfig(pluginName, config),
        getPluginPath: () => path.join(pluginStorage.PLUGINS_DIR, pluginName)
    };
}

/**
 * Loads a plugin from disk
 * @param {string} pluginName - Name of the plugin
 * @returns {Object|null} Plugin instance or null on error
 */
function loadPlugin(pluginName) {
    const pluginPath = path.join(pluginStorage.PLUGINS_DIR, pluginName);
    const manifest = pluginStorage.readPluginManifest(pluginName);
    
    if (!manifest) {
        logger.error('Plugin manifest not found', { pluginName });
        return null;
    }
    
    const mainFile = path.join(pluginPath, manifest.main || 'index.js');
    
    if (!fs.existsSync(mainFile)) {
        logger.error('Plugin main file not found', { pluginName, mainFile });
        return null;
    }
    
    try {
        // Clear require cache for hot-reload support
        const resolvedPath = require.resolve(mainFile);
        delete require.cache[resolvedPath];
        
        // Load the plugin module
        const pluginModule = require(mainFile);
        
        const pluginInstance = {
            name: pluginName,
            manifest,
            module: pluginModule,
            enabled: false,
            loadedAt: new Date().toISOString()
        };
        
        loadedPlugins.set(pluginName, pluginInstance);
        
        // Call onLoad lifecycle hook
        const context = createPluginContext(pluginName);
        if (typeof pluginModule.onLoad === 'function') {
            pluginModule.onLoad(context);
        }
        
        logger.info('Plugin loaded', { pluginName, version: manifest.version });
        
        return pluginInstance;
    } catch (error) {
        logger.error('Error loading plugin', { pluginName, error: error.message, stack: error.stack });
        return null;
    }
}

/**
 * Unloads a plugin
 * @param {string} pluginName - Name of the plugin
 * @returns {boolean} Success
 */
function unloadPlugin(pluginName) {
    const plugin = loadedPlugins.get(pluginName);
    
    if (!plugin) {
        return false;
    }
    
    try {
        // Call onUnload lifecycle hook
        const context = createPluginContext(pluginName);
        if (typeof plugin.module.onUnload === 'function') {
            plugin.module.onUnload(context);
        }
        
        // Remove plugin commands
        if (plugin.module.commands) {
            for (const cmdName of Object.keys(plugin.module.commands)) {
                pluginCommands.delete(cmdName);
            }
        }
        
        // Remove event handlers
        const handlers = pluginEventHandlers.get(pluginName);
        if (handlers && discordClient) {
            for (const [event, handler] of Object.entries(handlers)) {
                discordClient.off(event, handler);
            }
        }
        pluginEventHandlers.delete(pluginName);
        
        // Clear from loaded plugins
        loadedPlugins.delete(pluginName);
        
        // Clear require cache
        const pluginPath = path.join(pluginStorage.PLUGINS_DIR, pluginName);
        const mainFile = path.join(pluginPath, plugin.manifest.main || 'index.js');
        const resolvedPath = require.resolve(mainFile);
        delete require.cache[resolvedPath];
        
        logger.info('Plugin unloaded', { pluginName });
        
        return true;
    } catch (error) {
        logger.error('Error unloading plugin', { pluginName, error: error.message });
        return false;
    }
}

/**
 * Enables a plugin
 * @param {string} pluginName - Name of the plugin
 * @returns {Object} Result with success status
 */
function enablePlugin(pluginName) {
    let plugin = loadedPlugins.get(pluginName);
    
    // Load if not already loaded
    if (!plugin) {
        plugin = loadPlugin(pluginName);
        if (!plugin) {
            return { success: false, error: 'Failed to load plugin' };
        }
    }
    
    if (plugin.enabled) {
        return { success: false, error: 'Plugin already enabled' };
    }
    
    try {
        const context = createPluginContext(pluginName);
        
        // Call onEnable lifecycle hook
        if (typeof plugin.module.onEnable === 'function') {
            plugin.module.onEnable(context);
        }
        
        // Register plugin commands
        if (plugin.module.commands) {
            for (const [cmdName, command] of Object.entries(plugin.module.commands)) {
                if (command.data && command.execute) {
                    pluginCommands.set(cmdName, {
                        ...command,
                        pluginName
                    });
                    logger.debug('Plugin command registered', { pluginName, command: cmdName });
                }
            }
        }
        
        // Register event handlers
        if (plugin.module.events && discordClient) {
            const handlers = {};
            for (const [event, handler] of Object.entries(plugin.module.events)) {
                const wrappedHandler = (...args) => {
                    try {
                        handler(...args);
                    } catch (error) {
                        logger.error('Plugin event handler error', { 
                            pluginName, 
                            event, 
                            error: error.message 
                        });
                    }
                };
                discordClient.on(event, wrappedHandler);
                handlers[event] = wrappedHandler;
            }
            pluginEventHandlers.set(pluginName, handlers);
        }
        
        plugin.enabled = true;
        plugin.enabledAt = new Date().toISOString();
        
        // Persist enabled state
        pluginStorage.enablePlugin(pluginName);
        
        // Audit log
        auditLogger.logPluginAction({
            action: auditLogger.ACTIONS.PLUGIN_ENABLE,
            pluginName,
            details: { version: plugin.manifest.version }
        });
        
        logger.info('Plugin enabled', { pluginName });
        
        return { success: true };
    } catch (error) {
        logger.error('Error enabling plugin', { pluginName, error: error.message });
        return { success: false, error: error.message };
    }
}

/**
 * Disables a plugin
 * @param {string} pluginName - Name of the plugin
 * @returns {Object} Result with success status
 */
function disablePlugin(pluginName) {
    const plugin = loadedPlugins.get(pluginName);
    
    if (!plugin) {
        return { success: false, error: 'Plugin not loaded' };
    }
    
    if (!plugin.enabled) {
        return { success: false, error: 'Plugin already disabled' };
    }
    
    try {
        const context = createPluginContext(pluginName);
        
        // Call onDisable lifecycle hook
        if (typeof plugin.module.onDisable === 'function') {
            plugin.module.onDisable(context);
        }
        
        // Unregister plugin commands
        if (plugin.module.commands) {
            for (const cmdName of Object.keys(plugin.module.commands)) {
                pluginCommands.delete(cmdName);
            }
        }
        
        // Unregister event handlers
        const handlers = pluginEventHandlers.get(pluginName);
        if (handlers && discordClient) {
            for (const [event, handler] of Object.entries(handlers)) {
                discordClient.off(event, handler);
            }
        }
        pluginEventHandlers.delete(pluginName);
        
        plugin.enabled = false;
        plugin.disabledAt = new Date().toISOString();
        
        // Persist disabled state
        pluginStorage.disablePlugin(pluginName);
        
        // Audit log
        auditLogger.logPluginAction({
            action: auditLogger.ACTIONS.PLUGIN_DISABLE,
            pluginName
        });
        
        logger.info('Plugin disabled', { pluginName });
        
        return { success: true };
    } catch (error) {
        logger.error('Error disabling plugin', { pluginName, error: error.message });
        return { success: false, error: error.message };
    }
}

/**
 * Reloads a plugin (hot-reload)
 * @param {string} pluginName - Name of the plugin
 * @returns {Object} Result with success status
 */
function reloadPlugin(pluginName) {
    const wasEnabled = loadedPlugins.get(pluginName)?.enabled || false;
    
    // Unload first
    if (loadedPlugins.has(pluginName)) {
        if (wasEnabled) {
            disablePlugin(pluginName);
        }
        unloadPlugin(pluginName);
    }
    
    // Reload
    const plugin = loadPlugin(pluginName);
    if (!plugin) {
        return { success: false, error: 'Failed to reload plugin' };
    }
    
    // Re-enable if was enabled
    if (wasEnabled) {
        const result = enablePlugin(pluginName);
        if (!result.success) {
            return result;
        }
    }
    
    // Audit log
    auditLogger.logPluginAction({
        action: auditLogger.ACTIONS.PLUGIN_RELOAD,
        pluginName,
        details: { wasEnabled }
    });
    
    logger.info('Plugin reloaded', { pluginName });
    
    return { success: true };
}

/**
 * Initializes the plugin service
 * Loads and enables all previously enabled plugins
 */
function initialize() {
    logger.info('Initializing plugin service');
    
    const installedPlugins = pluginStorage.listInstalledPlugins();
    
    for (const pluginName of installedPlugins) {
        // Load the plugin
        loadPlugin(pluginName);
        
        // Enable if it was previously enabled
        if (pluginStorage.isPluginEnabled(pluginName)) {
            enablePlugin(pluginName);
        }
    }
    
    logger.info('Plugin service initialized', { 
        installed: installedPlugins.length,
        enabled: getEnabledPlugins().length
    });
}

/**
 * Shuts down the plugin service
 * Unloads all plugins without changing their persisted enabled state
 */
function shutdown() {
    logger.info('Shutting down plugin service');
    
    for (const [pluginName, plugin] of loadedPlugins) {
        if (plugin.enabled) {
            // Call onDisable lifecycle hook without persisting state
            try {
                const context = createPluginContext(pluginName);
                if (typeof plugin.module.onDisable === 'function') {
                    plugin.module.onDisable(context);
                }
                
                // Unregister plugin commands
                if (plugin.module.commands) {
                    for (const cmdName of Object.keys(plugin.module.commands)) {
                        pluginCommands.delete(cmdName);
                    }
                }
                
                // Unregister event handlers
                const handlers = pluginEventHandlers.get(pluginName);
                if (handlers && discordClient) {
                    for (const [event, handler] of Object.entries(handlers)) {
                        discordClient.off(event, handler);
                    }
                }
                pluginEventHandlers.delete(pluginName);
                
                plugin.enabled = false;
                logger.debug('Plugin disabled for shutdown (state preserved)', { pluginName });
            } catch (error) {
                logger.error('Error disabling plugin during shutdown', { pluginName, error: error.message });
            }
        }
        unloadPlugin(pluginName);
    }
    
    logger.info('Plugin service shut down');
}

/**
 * Gets all loaded plugins
 * @returns {Array<Object>} List of loaded plugins
 */
function getLoadedPlugins() {
    return Array.from(loadedPlugins.values()).map(p => ({
        name: p.name,
        version: p.manifest.version,
        description: p.manifest.description,
        author: p.manifest.author,
        enabled: p.enabled,
        loadedAt: p.loadedAt,
        enabledAt: p.enabledAt,
        commands: p.manifest.commands || [],
        hasEvents: !!(p.module.events && Object.keys(p.module.events).length > 0)
    }));
}

/**
 * Gets all enabled plugins
 * @returns {Array<Object>} List of enabled plugins
 */
function getEnabledPlugins() {
    return getLoadedPlugins().filter(p => p.enabled);
}

/**
 * Gets a specific plugin command
 * @param {string} commandName - Command name
 * @returns {Object|null} Command or null
 */
function getPluginCommand(commandName) {
    return pluginCommands.get(commandName) || null;
}

/**
 * Gets all plugin commands
 * @returns {Collection} Plugin commands collection
 */
function getAllPluginCommands() {
    return pluginCommands;
}

/**
 * Gets all plugin command data for deploy
 * @returns {Array<Object>} Command data array
 */
function getPluginCommandsForDeploy() {
    const commands = [];
    for (const [name, cmd] of pluginCommands) {
        if (cmd.data) {
            commands.push(cmd.data);
        }
    }
    return commands;
}

/**
 * Checks if a command is from a plugin
 * @param {string} commandName - Command name
 * @returns {boolean} Whether command is from a plugin
 */
function isPluginCommand(commandName) {
    return pluginCommands.has(commandName);
}

/**
 * Gets detailed info about a specific plugin
 * @param {string} pluginName - Plugin name
 * @returns {Object|null} Plugin info or null
 */
function getPluginInfo(pluginName) {
    const plugin = loadedPlugins.get(pluginName);
    if (!plugin) {
        // Try to get info from manifest without loading
        const manifest = pluginStorage.readPluginManifest(pluginName);
        if (!manifest) return null;
        
        const state = pluginStorage.getPluginState(pluginName);
        return {
            name: pluginName,
            version: manifest.version,
            description: manifest.description,
            author: manifest.author,
            commands: manifest.commands || [],
            dependencies: manifest.dependencies || [],
            loaded: false,
            enabled: false,
            config: state?.config || {}
        };
    }
    
    return {
        name: plugin.name,
        version: plugin.manifest.version,
        description: plugin.manifest.description,
        author: plugin.manifest.author,
        commands: plugin.manifest.commands || [],
        dependencies: plugin.manifest.dependencies || [],
        loaded: true,
        enabled: plugin.enabled,
        loadedAt: plugin.loadedAt,
        enabledAt: plugin.enabledAt,
        config: pluginStorage.getPluginConfig(pluginName),
        hasEvents: !!(plugin.module.events && Object.keys(plugin.module.events).length > 0)
    };
}

/**
 * Updates a plugin's configuration
 * @param {string} pluginName - Plugin name
 * @param {Object} config - New configuration
 * @returns {Object} Result with success status
 */
function updatePluginConfig(pluginName, config) {
    const plugin = loadedPlugins.get(pluginName);
    
    if (!plugin) {
        return { success: false, error: 'Plugin not loaded' };
    }
    
    try {
        pluginStorage.setPluginConfig(pluginName, config);
        
        // Notify plugin of config change if it has a handler
        if (typeof plugin.module.onConfigChange === 'function') {
            const context = createPluginContext(pluginName);
            plugin.module.onConfigChange(context, config);
        }
        
        // Audit log
        auditLogger.logPluginAction({
            action: auditLogger.ACTIONS.PLUGIN_CONFIG_UPDATE,
            pluginName,
            details: { config }
        });
        
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    setClient,
    getClient,
    initialize,
    shutdown,
    loadPlugin,
    unloadPlugin,
    enablePlugin,
    disablePlugin,
    reloadPlugin,
    getLoadedPlugins,
    getEnabledPlugins,
    getPluginCommand,
    getAllPluginCommands,
    getPluginCommandsForDeploy,
    isPluginCommand,
    getPluginInfo,
    updatePluginConfig,
    // Error tracking
    recordPluginError,
    getPluginErrorStats,
    clearPluginErrors,
    ERROR_THRESHOLD,
    ERROR_WINDOW_MS
};
