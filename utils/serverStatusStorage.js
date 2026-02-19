/**
 * Server Status Storage
 * Stores server status history
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATUS_FILE = path.join(DATA_DIR, 'server-status.json');

// Servers to track (game worlds + account server)
const SERVERS = ['FREYA', 'NIDHOGG', 'YGGDRASIL', 'ACCOUNT'];

/**
 * Ensures data directory exists
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Gets default status structure
 * @returns {Object} Default status object
 */
function getDefaultStatus() {
    const servers = {};
    for (const server of SERVERS) {
        servers[server] = {
            online: null,
            lastCheck: null,
            lastOnline: null,
            lastOffline: null,
            reason: null,
            responseTimeMs: null
        };
    }
    
    return {
        servers,
        maintenanceSchedule: [],
        history: [],
        lastUpdated: new Date().toISOString()
    };
}

/**
 * Loads status from file
 * @returns {Object} Status data
 */
function loadStatus() {
    ensureDataDir();
    
    try {
        if (fs.existsSync(STATUS_FILE)) {
            const data = fs.readFileSync(STATUS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading server status', { error: error.message });
    }
    
    return getDefaultStatus();
}

/**
 * Saves status to file
 * @param {Object} data - Status data to save
 */
function saveStatus(data) {
    ensureDataDir();
    
    try {
        data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        logger.error('Error saving server status', { error: error.message });
    }
}

/**
 * Updates server status
 * @param {string} server - Server name
 * @param {boolean} online - Whether server is online
 * @param {Object} details - Additional details
 */
function updateServerStatus(server, online, details = {}) {
    const status = loadStatus();
    const now = new Date().toISOString();
    
    if (!status.servers[server]) {
        status.servers[server] = {
            online: null,
            lastCheck: null,
            lastOnline: null,
            lastOffline: null,
            reason: null,
            responseTimeMs: null
        };
    }
    
    const serverStatus = status.servers[server];
    const previousStatus = serverStatus.online;
    
    serverStatus.online = online;
    serverStatus.lastCheck = now;
    serverStatus.responseTimeMs = details.responseTimeMs || null;
    serverStatus.reason = details.reason || null;
    
    if (online) {
        serverStatus.lastOnline = now;
        serverStatus.reason = null;
    } else {
        serverStatus.lastOffline = now;
    }
    
    // Record status change in history
    if (previousStatus !== null && previousStatus !== online) {
        status.history.unshift({
            server,
            previousStatus,
            newStatus: online,
            timestamp: now,
            reason: details.reason
        });
        
        // Keep last 100 history entries
        if (status.history.length > 100) {
            status.history = status.history.slice(0, 100);
        }
        
        logger.info('Server status changed', { server, online, previousStatus });
    }
    
    saveStatus(status);
    
    return {
        changed: previousStatus !== null && previousStatus !== online,
        previousStatus,
        newStatus: online
    };
}

/**
 * Gets current server status
 * @param {string} [server] - Optional server filter
 * @returns {Object} Server status(es)
 */
function getServerStatus(server = null) {
    const status = loadStatus();
    
    if (server) {
        return status.servers[server] || null;
    }
    
    return status.servers;
}

/**
 * Gets status history
 * @param {number} [limit=20] - Maximum entries
 * @returns {Array} History entries
 */
function getHistory(limit = 20) {
    const status = loadStatus();
    return status.history.slice(0, limit);
}

/**
 * Adds a scheduled maintenance
 * @param {Object} maintenance - Maintenance info
 */
function addMaintenance(maintenance) {
    const status = loadStatus();
    
    status.maintenanceSchedule.push({
        id: Date.now().toString(36),
        ...maintenance,
        addedAt: new Date().toISOString()
    });
    
    saveStatus(status);
}

/**
 * Gets scheduled maintenance
 * @param {boolean} [futureOnly=true] - Only return future maintenance
 * @returns {Array} Maintenance schedule
 */
function getMaintenanceSchedule(futureOnly = true) {
    const status = loadStatus();
    const now = new Date();
    
    if (futureOnly) {
        return status.maintenanceSchedule.filter(m => new Date(m.endDate) > now);
    }
    
    return status.maintenanceSchedule;
}

/**
 * Removes a scheduled maintenance
 * @param {string} id - Maintenance ID
 * @returns {boolean} Whether removed
 */
function removeMaintenance(id) {
    const status = loadStatus();
    const initialLength = status.maintenanceSchedule.length;
    
    status.maintenanceSchedule = status.maintenanceSchedule.filter(m => m.id !== id);
    
    if (status.maintenanceSchedule.length < initialLength) {
        saveStatus(status);
        return true;
    }
    
    return false;
}

/**
 * Gets full status data
 * @returns {Object} All status data
 */
function getFullStatus() {
    return loadStatus();
}

module.exports = {
    loadStatus,
    saveStatus,
    updateServerStatus,
    getServerStatus,
    getHistory,
    addMaintenance,
    getMaintenanceSchedule,
    removeMaintenance,
    getFullStatus,
    SERVERS
};
