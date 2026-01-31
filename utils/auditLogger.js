/**
 * Audit Logger Module
 * High-level interface for logging audit events
 */

const auditStorage = require('./auditStorage');
const logger = require('./logger');

// Audit types
const TYPES = {
    ADMIN_ACTION: 'ADMIN_ACTION',
    DISCORD_COMMAND: 'DISCORD_COMMAND',
    PLUGIN_ACTION: 'PLUGIN_ACTION',
    SYSTEM: 'SYSTEM'
};

// Actor types
const ACTOR_TYPES = {
    ADMIN: 'admin',
    USER: 'user',
    SYSTEM: 'system',
    PLUGIN: 'plugin'
};

// Common actions
const ACTIONS = {
    // Alerts
    ALERT_CREATE: 'alerts.create',
    ALERT_UPDATE: 'alerts.update',
    ALERT_DELETE: 'alerts.delete',
    ALERT_FORCE_CHECK: 'alerts.force_check',
    
    // Parties
    PARTY_CREATE: 'parties.create',
    PARTY_CANCEL: 'parties.cancel',
    PARTY_CLEANUP: 'parties.cleanup',
    PARTY_REMOVE_PARTICIPANT: 'parties.remove_participant',
    PARTY_UPDATE_CLASS_LIMITS: 'parties.update_class_limits',
    
    // Config
    CONFIG_UPDATE: 'config.update',
    
    // Permissions
    PERMISSION_ADD: 'permissions.add',
    PERMISSION_REMOVE: 'permissions.remove',
    
    // Deploy
    DEPLOY_GLOBAL: 'deploy.global',
    DEPLOY_GUILD: 'deploy.guild',
    DEPLOY_CLEAR_GLOBAL: 'deploy.clear_global',
    DEPLOY_CLEAR_GUILD: 'deploy.clear_guild',
    
    // Service
    SERVICE_START: 'service.start',
    SERVICE_STOP: 'service.stop',
    
    // Plugins
    PLUGIN_ENABLE: 'plugins.enable',
    PLUGIN_DISABLE: 'plugins.disable',
    PLUGIN_RELOAD: 'plugins.reload',
    PLUGIN_CONFIG_UPDATE: 'plugins.config_update',
    
    // Discord commands
    COMMAND_EXECUTE: 'command.execute',
    COMMAND_AUTOCOMPLETE: 'command.autocomplete',
    
    // System
    BOT_START: 'system.bot_start',
    BOT_STOP: 'system.bot_stop',
    AUDIT_CLEANUP: 'system.audit_cleanup',
    
    // Backup
    BACKUP_CREATE: 'backup.create',
    BACKUP_RESTORE: 'backup.restore',
    BACKUP_DELETE: 'backup.delete'
};

/**
 * Logs an admin action from the web panel
 * @param {Object} options - Log options
 * @param {string} options.action - Action name (use ACTIONS constant)
 * @param {Object} options.req - Express request object (for IP and session)
 * @param {Object} [options.target] - Target of the action
 * @param {Object} [options.details] - Additional details
 * @param {boolean} [options.success] - Whether action succeeded
 * @param {string} [options.error] - Error message if failed
 * @returns {Object} Created audit entry
 */
function logAdminAction({ action, req, target, details, success = true, error = null }) {
    const entry = {
        type: TYPES.ADMIN_ACTION,
        action,
        actor: {
            type: ACTOR_TYPES.ADMIN,
            id: req?.session?.userId || null,
            name: req?.session?.username || 'Admin'
        },
        target,
        details,
        ip: req?.ip || req?.connection?.remoteAddress || null,
        success,
        error
    };
    
    const result = auditStorage.addEntry(entry);
    
    logger.debug('Audit: Admin action logged', { action, success });
    
    return result;
}

/**
 * Logs a Discord command execution
 * @param {Object} options - Log options
 * @param {Object} options.interaction - Discord interaction object
 * @param {string} options.command - Command name
 * @param {Object} [options.details] - Additional details (options, subcommand, etc.)
 * @param {boolean} [options.success] - Whether command succeeded
 * @param {string} [options.error] - Error message if failed
 * @returns {Object} Created audit entry
 */
function logCommandExecution({ interaction, command, details, success = true, error = null }) {
    const entry = {
        type: TYPES.DISCORD_COMMAND,
        action: ACTIONS.COMMAND_EXECUTE,
        actor: {
            type: ACTOR_TYPES.USER,
            id: interaction?.user?.id || null,
            name: interaction?.user?.tag || interaction?.user?.username || 'Unknown'
        },
        target: {
            type: 'command',
            id: command,
            name: command
        },
        details: {
            command,
            guild: interaction?.guild?.name || 'DM',
            guildId: interaction?.guild?.id || null,
            channel: interaction?.channel?.name || null,
            channelId: interaction?.channel?.id || null,
            ...details
        },
        success,
        error
    };
    
    const result = auditStorage.addEntry(entry);
    
    return result;
}

/**
 * Logs a plugin action
 * @param {Object} options - Log options
 * @param {string} options.action - Action name
 * @param {string} options.pluginName - Plugin name
 * @param {Object} [options.actor] - Who triggered the action
 * @param {Object} [options.details] - Additional details
 * @param {boolean} [options.success] - Whether action succeeded
 * @param {string} [options.error] - Error message if failed
 * @returns {Object} Created audit entry
 */
function logPluginAction({ action, pluginName, actor, details, success = true, error = null }) {
    const entry = {
        type: TYPES.PLUGIN_ACTION,
        action,
        actor: actor || {
            type: ACTOR_TYPES.SYSTEM,
            id: null,
            name: 'System'
        },
        target: {
            type: 'plugin',
            id: pluginName,
            name: pluginName
        },
        details,
        success,
        error
    };
    
    const result = auditStorage.addEntry(entry);
    
    logger.debug('Audit: Plugin action logged', { action, pluginName, success });
    
    return result;
}

/**
 * Logs a system event
 * @param {Object} options - Log options
 * @param {string} options.action - Action name
 * @param {Object} [options.details] - Additional details
 * @param {boolean} [options.success] - Whether action succeeded
 * @param {string} [options.error] - Error message if failed
 * @returns {Object} Created audit entry
 */
function logSystemEvent({ action, details, success = true, error = null }) {
    const entry = {
        type: TYPES.SYSTEM,
        action,
        actor: {
            type: ACTOR_TYPES.SYSTEM,
            id: null,
            name: 'System'
        },
        details,
        success,
        error
    };
    
    const result = auditStorage.addEntry(entry);
    
    logger.debug('Audit: System event logged', { action, success });
    
    return result;
}

/**
 * Helper to extract request info for audit logging
 * @param {Object} req - Express request object
 * @returns {Object} Extracted info
 */
function extractRequestInfo(req) {
    return {
        ip: req?.ip || req?.connection?.remoteAddress || null,
        userAgent: req?.headers?.['user-agent'] || null,
        method: req?.method || null,
        path: req?.path || null
    };
}

/**
 * Helper to create a target object
 * @param {string} type - Target type
 * @param {string} id - Target ID
 * @param {string} [name] - Target name
 * @returns {Object} Target object
 */
function createTarget(type, id, name = null) {
    return { type, id, name: name || id };
}

// Expose query functions from storage
const queryEntries = auditStorage.queryEntries;
const getStats = auditStorage.getStats;
const cleanupOldEntries = auditStorage.cleanupOldEntries;
const exportEntries = auditStorage.exportEntries;
const getEntry = auditStorage.getEntry;

module.exports = {
    // Types and constants
    TYPES,
    ACTOR_TYPES,
    ACTIONS,
    
    // Logging functions
    logAdminAction,
    logCommandExecution,
    logPluginAction,
    logSystemEvent,
    
    // Helpers
    extractRequestInfo,
    createTarget,
    
    // Query functions (from storage)
    queryEntries,
    getStats,
    cleanupOldEntries,
    exportEntries,
    getEntry
};
