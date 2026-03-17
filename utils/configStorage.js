/**
 * Config Storage Module
 * Handles dynamic configuration settings for the bot
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const alertStorage = require('./alertStorage');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'config.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

// Permission types
const PERMISSION_TYPES = {
    USER_ID: 'userId',
    USERNAME: 'username',
    ROLE_ID: 'roleId'
};

// Default configuration values
const DEFAULT_CONFIG = {
    // Alert service intervals (in minutes)
    checkIntervalMinutes: 15,
    cooldownMinutes: 60,
    requestDelayMs: 2000,
    
    // Per-plugin permissions: { [pluginName]: Permission[] }
    pluginPermissions: {},
    
    // Legacy fields (migrated on load)
    alertPermissions: [],
    alertWhitelist: [],
    
    // Whether to allow admins regardless of permissions
    allowAdmins: true
};

/**
 * Ensures the data directory exists
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        logger.info('Created data directory', { path: DATA_DIR });
    }
}

/**
 * Loads configuration from storage
 * @returns {Object} Config data
 */
function loadConfig() {
    ensureDataDir();
    
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            const config = JSON.parse(data);
            // Merge with defaults to ensure all keys exist
            return { ...DEFAULT_CONFIG, ...config };
        }
    } catch (error) {
        logger.error('Error loading config', { error: error.message });
    }
    
    return { ...DEFAULT_CONFIG };
}

/**
 * Saves configuration to storage
 * @param {Object} config - Config data
 */
function saveConfig(config) {
    ensureDataDir();
    
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        logger.info('Config saved');
    } catch (error) {
        logger.error('Error saving config', { error: error.message });
        throw error;
    }
}

/**
 * Gets the check interval in milliseconds
 * @returns {number}
 */
function getCheckIntervalMs() {
    const config = loadConfig();
    return config.checkIntervalMinutes * 60 * 1000;
}

/**
 * Gets the notification cooldown in milliseconds
 * @returns {number}
 */
function getCooldownMs() {
    const config = loadConfig();
    return config.cooldownMinutes * 60 * 1000;
}

/**
 * Gets the request delay in milliseconds
 * @returns {number}
 */
function getRequestDelayMs() {
    const config = loadConfig();
    return config.requestDelayMs;
}

function generatePermId() {
    return `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Migrates legacy alertPermissions/alertWhitelist into pluginPermissions['market-alerts'].
 * Also ensures all permissions have IDs.
 */
function migratePermissions(config) {
    let needsSave = false;

    if (!config.pluginPermissions) config.pluginPermissions = {};

    // Migrate legacy alertWhitelist → alertPermissions first
    if (config.alertWhitelist && config.alertWhitelist.length > 0) {
        if (!config.alertPermissions) config.alertPermissions = [];

        for (const userId of config.alertWhitelist) {
            const exists = config.alertPermissions.some(
                p => p.type === PERMISSION_TYPES.USER_ID && p.value === userId
            );
            if (!exists) {
                config.alertPermissions.push({
                    id: generatePermId(),
                    type: PERMISSION_TYPES.USER_ID,
                    value: userId,
                    addedAt: new Date().toISOString()
                });
            }
        }
        config.alertWhitelist = [];
        needsSave = true;
    }

    // Migrate alertPermissions → pluginPermissions['market-alerts']
    if (config.alertPermissions && config.alertPermissions.length > 0) {
        if (!config.pluginPermissions['market-alerts']) {
            config.pluginPermissions['market-alerts'] = [];
        }

        for (const perm of config.alertPermissions) {
            if (!perm.id) perm.id = generatePermId();
            const exists = config.pluginPermissions['market-alerts'].some(
                p => p.type === perm.type && p.value.toLowerCase() === perm.value.toLowerCase()
            );
            if (!exists) {
                config.pluginPermissions['market-alerts'].push(perm);
            }
        }
        config.alertPermissions = [];
        needsSave = true;
        logger.info('Migrated alertPermissions to pluginPermissions[market-alerts]');
    }

    // Ensure all permissions across all plugins have IDs
    for (const perms of Object.values(config.pluginPermissions)) {
        for (const perm of perms) {
            if (!perm.id) {
                perm.id = generatePermId();
                needsSave = true;
            }
        }
    }

    if (needsSave) saveConfig(config);
    return config;
}

/**
 * Gets permissions for a specific plugin (or all).
 * @param {string} [plugin] - Plugin name. If omitted, returns all permissions grouped by plugin.
 * @returns {Array<Object>|Object}
 */
function getPermissions(plugin) {
    let config = loadConfig();
    config = migratePermissions(config);

    if (plugin) {
        return config.pluginPermissions[plugin] || [];
    }
    return config.pluginPermissions || {};
}

// Legacy alias
function getAlertPermissions() {
    return getPermissions('market-alerts');
}

function getAlertWhitelist() {
    return getPermissions('market-alerts')
        .filter(p => p.type === PERMISSION_TYPES.USER_ID)
        .map(p => p.value);
}

/**
 * Checks if a user is allowed to use a plugin's commands.
 * @param {Object} params
 * @param {string} params.plugin - Plugin name to check permissions for
 * @param {string} params.userId - Discord user ID
 * @param {string} params.username - Discord username
 * @param {Array<string>} params.roleIds - Role IDs
 * @param {boolean} params.isAdmin - Whether the user is a server admin
 * @returns {boolean}
 */
function isUserAllowed({ plugin, userId, username, roleIds = [], isAdmin = false }) {
    let config = loadConfig();
    config = migratePermissions(config);

    if (config.allowAdmins && isAdmin) {
        return true;
    }

    const permissions = (plugin ? config.pluginPermissions[plugin] : null) || [];

    for (const perm of permissions) {
        switch (perm.type) {
            case PERMISSION_TYPES.USER_ID:
                if (perm.value === userId) return true;
                break;
            case PERMISSION_TYPES.USERNAME:
                if (perm.value.toLowerCase() === username?.toLowerCase()) return true;
                break;
            case PERMISSION_TYPES.ROLE_ID:
                if (roleIds.includes(perm.value)) return true;
                break;
        }
    }

    return false;
}

/**
 * Adds a permission for a specific plugin.
 * @param {string} plugin - Plugin name
 * @param {string} type - Permission type
 * @param {string} value - The value (ID or username)
 * @returns {Object} The created permission
 */
function addPermission(plugin, type, value) {
    if (!Object.values(PERMISSION_TYPES).includes(type)) {
        throw new Error(`Tipo de permissão inválido: ${type}`);
    }
    if (!plugin) {
        throw new Error('Nome do plugin é obrigatório');
    }

    let config = loadConfig();
    config = migratePermissions(config);

    if (!config.pluginPermissions[plugin]) {
        config.pluginPermissions[plugin] = [];
    }

    const exists = config.pluginPermissions[plugin].some(
        p => p.type === type && p.value.toLowerCase() === value.toLowerCase()
    );
    if (exists) {
        throw new Error('Esta permissão já existe para este plugin');
    }

    const permission = {
        id: generatePermId(),
        type,
        value,
        addedAt: new Date().toISOString()
    };

    config.pluginPermissions[plugin].push(permission);
    saveConfig(config);
    logger.info('Permission added', { plugin, type, value });
    return permission;
}

/**
 * Removes a permission by ID, searching across all plugins (or a specific one).
 * @param {string} permissionId
 * @param {string} [plugin] - If given, only search within this plugin
 * @param {string} [resolvedUserId] - For clearing alerts on username removal
 * @returns {Object}
 */
function removePermission(permissionId, plugin = null, resolvedUserId = null) {
    let config = loadConfig();
    config = migratePermissions(config);

    const pluginsToSearch = plugin
        ? [plugin]
        : Object.keys(config.pluginPermissions);

    for (const p of pluginsToSearch) {
        const perms = config.pluginPermissions[p] || [];
        const found = perms.find(x => x.id === permissionId) || perms.find(x => x.value === permissionId);

        if (found) {
            config.pluginPermissions[p] = perms.filter(x => x !== found);
            saveConfig(config);

            let alertsCleared = 0;
            if (p === 'market-alerts') {
                if (found.type === PERMISSION_TYPES.USER_ID) {
                    alertsCleared = alertStorage.clearUserAlerts(found.value);
                } else if (found.type === PERMISSION_TYPES.USERNAME && resolvedUserId) {
                    alertsCleared = alertStorage.clearUserAlerts(resolvedUserId);
                }
            }

            logger.info('Permission removed', { plugin: p, permissionId, type: found.type, value: found.value, alertsCleared });
            return { removed: true, alertsCleared, permission: found, plugin: p };
        }
    }

    return { removed: false, alertsCleared: 0, permission: null, plugin: null };
}

/**
 * Gets the list of all plugin names that have permissions configured.
 * @returns {string[]}
 */
function getPluginsWithPermissions() {
    let config = loadConfig();
    config = migratePermissions(config);
    return Object.keys(config.pluginPermissions).filter(p => config.pluginPermissions[p].length > 0);
}

/**
 * Legacy: adds a user to market-alerts whitelist
 */
function addToWhitelist(userId) {
    try {
        addPermission('market-alerts', PERMISSION_TYPES.USER_ID, userId);
        return true;
    } catch {
        return false;
    }
}

/**
 * Legacy: removes a user from market-alerts whitelist
 */
function removeFromWhitelist(userId) {
    const perms = getPermissions('market-alerts');
    const perm = perms.find(p => p.type === PERMISSION_TYPES.USER_ID && p.value === userId);
    if (perm) return removePermission(perm.id, 'market-alerts');
    return false;
}

/**
 * Updates configuration values
 * @param {Object} updates - Key-value pairs to update
 * @returns {Object} Updated config
 */
function updateConfig(updates) {
    const config = loadConfig();
    
    // Validate and apply updates
    const allowedKeys = ['checkIntervalMinutes', 'cooldownMinutes', 'requestDelayMs', 'allowAdmins'];
    
    for (const key of allowedKeys) {
        if (updates[key] !== undefined) {
            // Validation
            if (key === 'checkIntervalMinutes' && (updates[key] < 1 || updates[key] > 1440)) {
                throw new Error('Intervalo de verificação deve ser entre 1 e 1440 minutos');
            }
            if (key === 'cooldownMinutes' && (updates[key] < 1 || updates[key] > 1440)) {
                throw new Error('Cooldown deve ser entre 1 e 1440 minutos');
            }
            if (key === 'requestDelayMs' && (updates[key] < 500 || updates[key] > 10000)) {
                throw new Error('Delay de requisição deve ser entre 500 e 10000ms');
            }
            
            config[key] = updates[key];
        }
    }
    
    saveConfig(config);
    logger.info('Config updated', { updates });
    return config;
}

/**
 * Gets all configuration values
 * @returns {Object} Full config
 */
function getFullConfig() {
    return loadConfig();
}

module.exports = {
    loadConfig,
    saveConfig,
    getCheckIntervalMs,
    getCooldownMs,
    getRequestDelayMs,
    getAlertWhitelist,
    getAlertPermissions,
    getPermissions,
    getPluginsWithPermissions,
    isUserAllowed,
    addToWhitelist,
    removeFromWhitelist,
    addPermission,
    removePermission,
    updateConfig,
    getFullConfig,
    DEFAULT_CONFIG,
    PERMISSION_TYPES
};
