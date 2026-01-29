/**
 * Alert Storage Module
 * Handles persistence of market alerts to JSON file
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const ALERTS_FILE = path.join(__dirname, '..', 'data', 'market-alerts.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

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
 * Loads all alerts from storage
 * @returns {Object} Alerts data structure
 */
function loadAlerts() {
    ensureDataDir();
    
    try {
        if (fs.existsSync(ALERTS_FILE)) {
            const data = fs.readFileSync(ALERTS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading alerts', { error: error.message });
    }
    
    return { alerts: [], lastCheck: null };
}

/**
 * Saves alerts to storage
 * @param {Object} data - Alerts data structure
 */
function saveAlerts(data) {
    ensureDataDir();
    
    try {
        fs.writeFileSync(ALERTS_FILE, JSON.stringify(data, null, 2), 'utf8');
        logger.debug('Alerts saved', { count: data.alerts?.length || 0 });
    } catch (error) {
        logger.error('Error saving alerts', { error: error.message });
        throw error;
    }
}

/**
 * Adds a new alert
 * @param {Object} alert - Alert object
 * @param {string} alert.userId - Discord user ID
 * @param {string} alert.searchTerm - Item name to search
 * @param {string} alert.storeType - BUY or SELL
 * @param {string} alert.server - Server name
 * @param {number} [alert.maxPrice] - Maximum price (optional)
 * @param {number} [alert.minQuantity] - Minimum quantity (optional)
 * @returns {Object} The created alert with ID
 */
function addAlert(alert) {
    const data = loadAlerts();
    
    // Check for duplicate
    const exists = data.alerts.some(a => 
        a.userId === alert.userId &&
        a.searchTerm.toLowerCase() === alert.searchTerm.toLowerCase() &&
        a.storeType === alert.storeType &&
        a.server === alert.server
    );
    
    if (exists) {
        throw new Error('Alerta já existe para este item com essas configurações');
    }
    
    const newAlert = {
        id: generateAlertId(),
        userId: alert.userId,
        searchTerm: alert.searchTerm,
        storeType: alert.storeType,
        server: alert.server,
        maxPrice: alert.maxPrice || null,
        minQuantity: alert.minQuantity || null,
        createdAt: new Date().toISOString(),
        lastNotified: null,
        notificationCount: 0,
        lowestPriceSeen: null // Track lowest price to notify on price drops
    };
    
    data.alerts.push(newAlert);
    saveAlerts(data);
    
    logger.info('Alert created', { 
        alertId: newAlert.id, 
        userId: alert.userId, 
        searchTerm: alert.searchTerm 
    });
    
    return newAlert;
}

/**
 * Removes an alert by ID
 * @param {string} alertId - Alert ID
 * @param {string} userId - User ID (for verification)
 * @returns {boolean} True if removed
 */
function removeAlert(alertId, userId) {
    const data = loadAlerts();
    const initialLength = data.alerts.length;
    
    data.alerts = data.alerts.filter(a => !(a.id === alertId && a.userId === userId));
    
    if (data.alerts.length < initialLength) {
        saveAlerts(data);
        logger.info('Alert removed', { alertId, userId });
        return true;
    }
    
    return false;
}

/**
 * Updates an existing alert
 * @param {string} alertId - Alert ID
 * @param {Object} updates - Fields to update
 * @param {string} [updates.searchTerm] - New search term
 * @param {string} [updates.storeType] - New store type (BUY/SELL)
 * @param {string} [updates.server] - New server
 * @param {number|null} [updates.maxPrice] - New max price
 * @param {number|null} [updates.minQuantity] - New min quantity
 * @returns {Object|null} Updated alert or null if not found
 */
function updateAlert(alertId, updates) {
    const data = loadAlerts();
    const alertIndex = data.alerts.findIndex(a => a.id === alertId);
    
    if (alertIndex === -1) {
        return null;
    }
    
    const alert = data.alerts[alertIndex];
    
    // Update allowed fields
    if (updates.searchTerm !== undefined) {
        alert.searchTerm = updates.searchTerm;
    }
    if (updates.storeType !== undefined) {
        alert.storeType = updates.storeType;
    }
    if (updates.server !== undefined) {
        alert.server = updates.server;
    }
    if (updates.maxPrice !== undefined) {
        alert.maxPrice = updates.maxPrice || null;
    }
    if (updates.minQuantity !== undefined) {
        alert.minQuantity = updates.minQuantity || null;
    }
    
    // Reset notification tracking if search criteria changed
    if (updates.searchTerm || updates.storeType || updates.server) {
        alert.lowestPriceSeen = null;
        alert.lastNotified = null;
    }
    
    alert.updatedAt = new Date().toISOString();
    
    data.alerts[alertIndex] = alert;
    saveAlerts(data);
    
    logger.info('Alert updated', { alertId, updates: Object.keys(updates) });
    
    return alert;
}

/**
 * Gets an alert by ID
 * @param {string} alertId - Alert ID
 * @returns {Object|null} Alert or null if not found
 */
function getAlert(alertId) {
    const data = loadAlerts();
    return data.alerts.find(a => a.id === alertId) || null;
}

/**
 * Gets all alerts for a user
 * @param {string} userId - Discord user ID
 * @returns {Array} User's alerts
 */
function getUserAlerts(userId) {
    const data = loadAlerts();
    return data.alerts.filter(a => a.userId === userId);
}

/**
 * Gets all alerts grouped by search term and server for optimization
 * @returns {Object} Grouped alerts { 'searchTerm|server|storeType': [alerts] }
 */
function getGroupedAlerts() {
    const data = loadAlerts();
    const grouped = {};
    
    for (const alert of data.alerts) {
        const key = `${alert.searchTerm.toLowerCase()}|${alert.server}|${alert.storeType}`;
        if (!grouped[key]) {
            grouped[key] = {
                searchTerm: alert.searchTerm,
                server: alert.server,
                storeType: alert.storeType,
                alerts: []
            };
        }
        grouped[key].alerts.push(alert);
    }
    
    return grouped;
}

/**
 * Updates the last notified timestamp for an alert
 * @param {string} alertId - Alert ID
 */
function updateAlertNotified(alertId) {
    const data = loadAlerts();
    const alert = data.alerts.find(a => a.id === alertId);
    
    if (alert) {
        alert.lastNotified = new Date().toISOString();
        alert.notificationCount = (alert.notificationCount || 0) + 1;
        saveAlerts(data);
    }
}

/**
 * Updates the lowest price seen for an alert
 * @param {string} alertId - Alert ID
 * @param {number} lowestPrice - Lowest price found
 */
function updateLowestPrice(alertId, lowestPrice) {
    const data = loadAlerts();
    const alert = data.alerts.find(a => a.id === alertId);
    
    if (alert) {
        alert.lowestPriceSeen = lowestPrice;
        saveAlerts(data);
    }
}

/**
 * Gets the lowest price seen for an alert
 * @param {string} alertId - Alert ID
 * @returns {number|null} Lowest price or null
 */
function getLowestPriceSeen(alertId) {
    const data = loadAlerts();
    const alert = data.alerts.find(a => a.id === alertId);
    return alert?.lowestPriceSeen || null;
}

/**
 * Updates the last check timestamp
 */
function updateLastCheck() {
    const data = loadAlerts();
    data.lastCheck = new Date().toISOString();
    saveAlerts(data);
}

/**
 * Gets statistics about alerts
 * @returns {Object} Stats
 */
function getStats() {
    const data = loadAlerts();
    const uniqueUsers = new Set(data.alerts.map(a => a.userId)).size;
    const uniqueSearches = new Set(data.alerts.map(a => 
        `${a.searchTerm.toLowerCase()}|${a.server}|${a.storeType}`
    )).size;
    
    return {
        totalAlerts: data.alerts.length,
        uniqueUsers,
        uniqueSearches,
        lastCheck: data.lastCheck
    };
}

/**
 * Generates a unique alert ID
 * @returns {string} Alert ID
 */
function generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clears all alerts for a user
 * @param {string} userId - User ID
 * @returns {number} Number of alerts removed
 */
function clearUserAlerts(userId) {
    const data = loadAlerts();
    const initialLength = data.alerts.length;
    
    data.alerts = data.alerts.filter(a => a.userId !== userId);
    
    const removed = initialLength - data.alerts.length;
    if (removed > 0) {
        saveAlerts(data);
        logger.info('User alerts cleared', { userId, removed });
    }
    
    return removed;
}

module.exports = {
    loadAlerts,
    saveAlerts,
    addAlert,
    removeAlert,
    updateAlert,
    getAlert,
    getUserAlerts,
    getGroupedAlerts,
    updateAlertNotified,
    updateLowestPrice,
    getLowestPriceSeen,
    updateLastCheck,
    getStats,
    clearUserAlerts
};
