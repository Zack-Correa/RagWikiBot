/**
 * Shared Accounts Plugin
 * Sistema de compartilhamento de contas Ragnarok com TOTP e permissões granulares
 */

const storage = require('./storage');
const contaCommand = require('./commands/conta');

let pluginContext = null;

/**
 * Called when plugin is loaded from disk
 */
function onLoad(context) {
    pluginContext = context;
    storage.setLogger(context.logger);
    contaCommand.setLogger(context.logger);
    context.logger.info('Shared Accounts plugin loaded');
}

/**
 * Called when plugin is enabled
 */
function onEnable(context) {
    context.logger.info('Shared Accounts plugin enabled');
    
    // Check if ENCRYPTION_KEY is set
    if (!process.env.ENCRYPTION_KEY) {
        context.logger.warn('ENCRYPTION_KEY não está configurada! O plugin não funcionará corretamente.');
    }
}

/**
 * Called when plugin is disabled
 */
function onDisable(context) {
    context.logger.info('Shared Accounts plugin disabled');
}

/**
 * Called when plugin is unloaded from memory
 */
function onUnload(context) {
    pluginContext = null;
    context.logger.info('Shared Accounts plugin unloaded');
}

// Export commands
const commands = {
    'conta': contaCommand
};

// Export public API for use by admin panel/API routes
const api = {
    // Account CRUD
    getAllAccounts: storage.getAllAccounts,
    getAccount: storage.getAccount,
    createAccount: storage.createAccount,
    updateAccount: storage.updateAccount,
    deleteAccount: storage.deleteAccount,
    
    // TOTP
    generateTOTP: storage.generateTOTP,
    
    // Permissions
    addPermission: storage.addPermission,
    removePermission: storage.removePermission,
    checkPermission: storage.checkPermission,
    getAccessibleAccounts: storage.getAccessibleAccounts,
    
    // Ownership
    isAccountOwner: storage.isAccountOwner,
    getAccountOwner: storage.getAccountOwner,
    
    // Access Logs
    getAccessLogs: storage.getAccessLogs,
    clearOldAccessLogs: storage.clearOldAccessLogs,
    
    // Constants
    PERMISSION_TYPES: storage.PERMISSION_TYPES,
    PERMISSION_ACTIONS: storage.PERMISSION_ACTIONS,
    SERVERS: storage.SERVERS
};

module.exports = {
    onLoad,
    onEnable,
    onDisable,
    onUnload,
    commands,
    events: {},
    api
};
