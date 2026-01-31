/**
 * Market Alerts Plugin
 * Monitors item prices and sends notifications when conditions are met
 */

const marketAlertService = require('../../services/marketAlertService');
const alertStorage = require('../../utils/alertStorage');
const marketAlertCommand = require('./command');

let pluginLogger = null;
let discordClient = null;

/**
 * Called when plugin is loaded
 */
function onLoad(context) {
    pluginLogger = context.logger;
    context.logger.info('Market alerts plugin loaded');
}

/**
 * Called when plugin is enabled
 */
function onEnable(context) {
    discordClient = context.getClient();
    
    if (discordClient) {
        marketAlertService.initialize(discordClient);
        marketAlertService.start();
        context.logger.info('Market alerts service started');
    }
    
    context.logger.info('Market alerts plugin enabled');
}

/**
 * Called when plugin is disabled
 */
function onDisable(context) {
    marketAlertService.stop();
    context.logger.info('Market alerts plugin disabled');
}

/**
 * Called when plugin is unloaded
 */
function onUnload(context) {
    marketAlertService.stop();
    context.logger.info('Market alerts plugin unloaded');
}

// Export command
const commands = {
    'alerta-mercado': {
        data: marketAlertCommand.data,
        execute: marketAlertCommand.execute
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
        getStatus: marketAlertService.getStatus,
        forceCheck: marketAlertService.forceCheck,
        start: marketAlertService.start,
        stop: marketAlertService.stop,
        restart: marketAlertService.restart,
        // Storage functions
        loadAlerts: alertStorage.loadAlerts,
        saveAlerts: alertStorage.saveAlerts,
        addAlert: alertStorage.addAlert,
        removeAlert: alertStorage.removeAlert,
        getUserAlerts: alertStorage.getUserAlerts,
        clearUserAlerts: alertStorage.clearUserAlerts
    }
};
