/**
 * Server Status Plugin
 * Monitors and displays Ragnarok Online LATAM server status
 */

const service = require('./service');
const storage = require('./storage');
const serverStatusCommand = require('./command');

let pluginLogger = null;
let discordClient = null;

/**
 * Called when plugin is loaded
 */
function onLoad(context) {
    pluginLogger = context.logger;
    
    const loggerAdapter = {
        info: (msg, data) => context.logger.info(msg, data),
        error: (msg, data) => context.logger.error(msg, data),
        warn: (msg, data) => context.logger.warn(msg, data),
        debug: (msg, data) => context.logger.debug(msg, data)
    };
    
    service.setLogger(loggerAdapter);
    storage.setLogger(loggerAdapter);
    
    context.logger.info('Server status plugin loaded');
}

/**
 * Called when plugin is enabled
 */
function onEnable(context) {
    discordClient = context.getClient();
    
    if (discordClient) {
        service.initialize(discordClient);
        service.start();
    }
    
    context.logger.info('Server status plugin enabled');
}

/**
 * Called when plugin is disabled
 */
function onDisable(context) {
    service.stop();
    context.logger.info('Server status plugin disabled');
}

/**
 * Called when plugin is unloaded
 */
function onUnload(context) {
    service.stop();
    context.logger.info('Server status plugin unloaded');
}

// Export command
const commands = {
    'servidor-status': {
        data: serverStatusCommand.data,
        execute: serverStatusCommand.execute
    }
};

// Export plugin interface
module.exports = {
    onLoad,
    onEnable,
    onDisable,
    onUnload,
    commands,
    events: {},
    
    // Public API
    api: {
        getStatus: service.getStatus,
        forceCheck: service.forceCheck,
        setNotificationChannel: service.setNotificationChannel
    }
};
