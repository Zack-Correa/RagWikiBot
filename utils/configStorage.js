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
    
    // Permissions for alert commands
    // Each entry: { type: 'userId'|'username'|'roleId', value: string, addedAt: ISO date }
    alertPermissions: [],
    
    // Legacy whitelist (for backwards compatibility, will be migrated)
    alertWhitelist: [],
    
    // Whether to allow admins regardless of whitelist
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

/**
 * Migrates old whitelist format to new permissions format
 * Also ensures all permissions have IDs
 * @param {Object} config - Config object
 * @returns {Object} Updated config
 */
function migrateWhitelist(config) {
    let needsSave = false;
    
    // Migrate old whitelist
    if (config.alertWhitelist && config.alertWhitelist.length > 0) {
        if (!config.alertPermissions) {
            config.alertPermissions = [];
        }
        
        for (const userId of config.alertWhitelist) {
            // Check if already migrated
            const exists = config.alertPermissions.some(
                p => p.type === PERMISSION_TYPES.USER_ID && p.value === userId
            );
            
            if (!exists) {
                config.alertPermissions.push({
                    id: `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    type: PERMISSION_TYPES.USER_ID,
                    value: userId,
                    addedAt: new Date().toISOString()
                });
            }
        }
        
        // Clear old whitelist after migration
        config.alertWhitelist = [];
        needsSave = true;
        logger.info('Migrated legacy whitelist to new permissions format');
    }
    
    // Ensure all permissions have IDs (fix for permissions added without ID)
    if (config.alertPermissions) {
        for (const perm of config.alertPermissions) {
            if (!perm.id) {
                perm.id = `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                needsSave = true;
            }
        }
        
        if (needsSave) {
            logger.info('Added missing IDs to permissions');
        }
    }
    
    if (needsSave) {
        saveConfig(config);
    }
    
    return config;
}

/**
 * Gets all alert permissions
 * @returns {Array<Object>}
 */
function getAlertPermissions() {
    let config = loadConfig();
    config = migrateWhitelist(config);
    return config.alertPermissions || [];
}

/**
 * Gets the whitelist of user IDs (legacy, for backwards compatibility)
 * @returns {Array<string>}
 */
function getAlertWhitelist() {
    const permissions = getAlertPermissions();
    return permissions
        .filter(p => p.type === PERMISSION_TYPES.USER_ID)
        .map(p => p.value);
}

/**
 * Checks if a user is allowed to use alert commands
 * @param {Object} params - Check parameters
 * @param {string} params.userId - Discord user ID
 * @param {string} params.username - Discord username
 * @param {Array<string>} params.roleIds - Array of role IDs the user has
 * @param {boolean} params.isAdmin - Whether the user is an admin
 * @returns {boolean}
 */
function isUserAllowed({ userId, username, roleIds = [], isAdmin = false }) {
    const config = loadConfig();
    
    // Admins are always allowed if allowAdmins is true
    if (config.allowAdmins && isAdmin) {
        return true;
    }
    
    const permissions = config.alertPermissions || [];
    
    // Check each permission
    for (const permission of permissions) {
        switch (permission.type) {
            case PERMISSION_TYPES.USER_ID:
                if (permission.value === userId) return true;
                break;
            case PERMISSION_TYPES.USERNAME:
                // Case-insensitive username comparison
                if (permission.value.toLowerCase() === username?.toLowerCase()) return true;
                break;
            case PERMISSION_TYPES.ROLE_ID:
                if (roleIds.includes(permission.value)) return true;
                break;
        }
    }
    
    // Legacy whitelist check (backwards compatibility)
    if (config.alertWhitelist && config.alertWhitelist.includes(userId)) {
        return true;
    }
    
    return false;
}

/**
 * Adds a permission to the list
 * @param {string} type - Permission type (userId, username, roleId)
 * @param {string} value - The value (ID or username)
 * @returns {Object} The created permission
 */
function addPermission(type, value) {
    if (!Object.values(PERMISSION_TYPES).includes(type)) {
        throw new Error(`Tipo de permissão inválido: ${type}`);
    }
    
    const config = loadConfig();
    
    if (!config.alertPermissions) {
        config.alertPermissions = [];
    }
    
    // Check for duplicates
    const exists = config.alertPermissions.some(
        p => p.type === type && p.value.toLowerCase() === value.toLowerCase()
    );
    
    if (exists) {
        throw new Error('Esta permissão já existe');
    }
    
    const permission = {
        id: `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        value,
        addedAt: new Date().toISOString()
    };
    
    config.alertPermissions.push(permission);
    saveConfig(config);
    logger.info('Permission added', { type, value });
    
    return permission;
}

/**
 * Removes a permission by ID or by type+value
 * Also clears all alerts for the user if it's a userId permission
 * @param {string} permissionId - Permission ID (or value for legacy support)
 * @param {string} resolvedUserId - Optional user ID resolved from username (for username permissions)
 * @returns {Object} Result with removed status, alerts cleared count, and permission info
 */
function removePermission(permissionId, resolvedUserId = null) {
    let config = loadConfig();
    
    // Run migration to ensure all permissions have IDs
    config = migrateWhitelist(config);
    
    if (!config.alertPermissions) {
        return { removed: false, alertsCleared: 0, permission: null };
    }
    
    // Try to find by ID first
    let found = config.alertPermissions.find(p => p.id === permissionId);
    
    // If not found by ID, try to find by value (for backwards compatibility)
    if (!found) {
        found = config.alertPermissions.find(p => p.value === permissionId);
    }
    
    if (found) {
        config.alertPermissions = config.alertPermissions.filter(p => p !== found);
        saveConfig(config);
        
        let alertsCleared = 0;
        
        // If it's a userId permission, clear all alerts for that user
        if (found.type === PERMISSION_TYPES.USER_ID) {
            alertsCleared = alertStorage.clearUserAlerts(found.value);
            logger.info('User alerts cleared due to permission removal', { 
                userId: found.value, 
                alertsCleared 
            });
        }
        // If it's a username permission and we have a resolved user ID, clear alerts
        else if (found.type === PERMISSION_TYPES.USERNAME && resolvedUserId) {
            alertsCleared = alertStorage.clearUserAlerts(resolvedUserId);
            logger.info('User alerts cleared due to username permission removal', { 
                username: found.value,
                resolvedUserId, 
                alertsCleared 
            });
        }
        
        logger.info('Permission removed', { 
            permissionId, 
            type: found.type,
            value: found.value,
            alertsCleared
        });
        
        return { removed: true, alertsCleared, permission: found };
    }
    
    return { removed: false, alertsCleared: 0, permission: null };
}

/**
 * Adds a user to the whitelist (legacy, uses new permission system)
 * @param {string} userId - Discord user ID
 * @returns {boolean} True if added (false if already exists)
 */
function addToWhitelist(userId) {
    try {
        addPermission(PERMISSION_TYPES.USER_ID, userId);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Removes a user from the whitelist (legacy, uses new permission system)
 * @param {string} userId - Discord user ID
 * @returns {boolean} True if removed
 */
function removeFromWhitelist(userId) {
    const config = loadConfig();
    
    if (!config.alertPermissions) {
        return false;
    }
    
    const permission = config.alertPermissions.find(
        p => p.type === PERMISSION_TYPES.USER_ID && p.value === userId
    );
    
    if (permission) {
        return removePermission(permission.id);
    }
    
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
