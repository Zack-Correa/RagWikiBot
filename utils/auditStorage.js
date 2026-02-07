/**
 * Audit Storage Module
 * Handles persistence of audit logs with rotation
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const AUDIT_FILE = path.join(__dirname, '..', 'data', 'audit-log.json');
const DATA_DIR = path.join(__dirname, '..', 'data');
const MAX_ENTRIES = 10000;
const MAX_AGE_DAYS = 30;

/**
 * Ensures the data directory exists
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Generates a unique ID for audit entries
 * @returns {string} UUID-like string
 */
function generateId() {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Loads audit logs from storage
 * @returns {Object} Audit data structure
 */
function loadAuditLog() {
    ensureDataDir();
    
    try {
        if (fs.existsSync(AUDIT_FILE)) {
            const data = fs.readFileSync(AUDIT_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading audit log', { error: error.message });
    }
    
    return { entries: [], rotatedAt: null };
}

/**
 * Saves audit logs to storage
 * @param {Object} data - Audit data structure
 */
function saveAuditLog(data) {
    ensureDataDir();
    
    try {
        fs.writeFileSync(AUDIT_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        logger.error('Error saving audit log', { error: error.message });
        throw error;
    }
}

/**
 * Rotates the audit log file if it exceeds max entries
 * @param {Object} data - Audit data structure
 * @returns {Object} Updated data structure
 */
function rotateIfNeeded(data) {
    if (data.entries.length >= MAX_ENTRIES) {
        const timestamp = new Date().toISOString().split('T')[0];
        const rotatedFile = path.join(DATA_DIR, `audit-log-${timestamp}.json`);
        
        try {
            // Save current log to rotated file
            fs.writeFileSync(rotatedFile, JSON.stringify(data, null, 2), 'utf8');
            logger.info('Audit log rotated', { file: rotatedFile, entries: data.entries.length });
            
            // Start fresh
            return { entries: [], rotatedAt: new Date().toISOString() };
        } catch (error) {
            logger.error('Error rotating audit log', { error: error.message });
        }
    }
    
    return data;
}

/**
 * Adds an audit entry
 * @param {Object} entry - Audit entry
 * @returns {Object} The created entry with ID
 */
function addEntry(entry) {
    let data = loadAuditLog();
    data = rotateIfNeeded(data);
    
    const auditEntry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        type: entry.type || 'UNKNOWN',
        action: entry.action || 'unknown',
        actor: {
            type: entry.actor?.type || 'unknown',
            id: entry.actor?.id || null,
            name: entry.actor?.name || 'Unknown'
        },
        target: entry.target || null,
        details: entry.details || {},
        ip: entry.ip || null,
        success: entry.success !== false,
        error: entry.error || null
    };
    
    data.entries.push(auditEntry);
    saveAuditLog(data);
    
    return auditEntry;
}

/**
 * Queries audit entries with filters
 * @param {Object} filters - Query filters
 * @param {string} [filters.type] - Filter by type (ADMIN_ACTION, DISCORD_COMMAND)
 * @param {string} [filters.action] - Filter by action (supports partial match)
 * @param {string} [filters.actorId] - Filter by actor ID
 * @param {string} [filters.actorType] - Filter by actor type
 * @param {string} [filters.dateFrom] - Filter from date (ISO string)
 * @param {string} [filters.dateTo] - Filter to date (ISO string)
 * @param {boolean} [filters.success] - Filter by success status
 * @param {number} [filters.limit] - Maximum entries to return
 * @param {number} [filters.offset] - Offset for pagination
 * @returns {Object} Query results with entries and total count
 */
function queryEntries(filters = {}) {
    const data = loadAuditLog();
    let entries = [...data.entries];
    
    // Apply filters
    if (filters.type) {
        entries = entries.filter(e => e.type === filters.type);
    }
    
    if (filters.action) {
        const actionLower = filters.action.toLowerCase();
        entries = entries.filter(e => e.action.toLowerCase().includes(actionLower));
    }
    
    if (filters.actorId) {
        entries = entries.filter(e => e.actor?.id === filters.actorId);
    }
    
    if (filters.actorType) {
        entries = entries.filter(e => e.actor?.type === filters.actorType);
    }
    
    if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        entries = entries.filter(e => new Date(e.timestamp) >= fromDate);
    }
    
    if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        entries = entries.filter(e => new Date(e.timestamp) <= toDate);
    }
    
    if (filters.success !== undefined) {
        entries = entries.filter(e => e.success === filters.success);
    }
    
    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const total = entries.length;
    
    // Apply pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    entries = entries.slice(offset, offset + limit);
    
    return { entries, total, offset, limit };
}

/**
 * Gets statistics about audit entries
 * @param {number} [days] - Number of days to analyze (default: 7)
 * @returns {Object} Statistics
 */
function getStats(days = 7) {
    const data = loadAuditLog();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const recentEntries = data.entries.filter(e => new Date(e.timestamp) >= cutoffDate);
    
    // Count by type
    const byType = {};
    recentEntries.forEach(e => {
        byType[e.type] = (byType[e.type] || 0) + 1;
    });
    
    // Count by action
    const byAction = {};
    recentEntries.forEach(e => {
        byAction[e.action] = (byAction[e.action] || 0) + 1;
    });
    
    // Count by actor
    const byActor = {};
    recentEntries.forEach(e => {
        const actorKey = e.actor?.name || 'Unknown';
        byActor[actorKey] = (byActor[actorKey] || 0) + 1;
    });
    
    // Success/failure rate
    const successCount = recentEntries.filter(e => e.success).length;
    const failureCount = recentEntries.filter(e => !e.success).length;
    
    // Actions per day
    const perDay = {};
    recentEntries.forEach(e => {
        const day = e.timestamp.split('T')[0];
        perDay[day] = (perDay[day] || 0) + 1;
    });
    
    return {
        period: {
            days,
            from: cutoffDate.toISOString(),
            to: new Date().toISOString()
        },
        total: recentEntries.length,
        totalAllTime: data.entries.length,
        byType,
        byAction,
        byActor,
        successRate: recentEntries.length > 0 
            ? ((successCount / recentEntries.length) * 100).toFixed(1) 
            : 100,
        successCount,
        failureCount,
        perDay
    };
}

/**
 * Cleans up old audit entries
 * @param {number} [maxAgeDays] - Maximum age in days (default: 30)
 * @returns {Object} Cleanup result
 */
function cleanupOldEntries(maxAgeDays = MAX_AGE_DAYS) {
    const data = loadAuditLog();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
    
    const originalCount = data.entries.length;
    data.entries = data.entries.filter(e => new Date(e.timestamp) >= cutoffDate);
    const removedCount = originalCount - data.entries.length;
    
    if (removedCount > 0) {
        saveAuditLog(data);
        logger.info('Audit log cleanup completed', { removed: removedCount, remaining: data.entries.length });
    }
    
    // Also clean up rotated files
    const rotatedFiles = fs.readdirSync(DATA_DIR)
        .filter(f => f.startsWith('audit-log-') && f.endsWith('.json'));
    
    let rotatedRemoved = 0;
    for (const file of rotatedFiles) {
        const filePath = path.join(DATA_DIR, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            rotatedRemoved++;
        }
    }
    
    return { 
        entriesRemoved: removedCount, 
        filesRemoved: rotatedRemoved,
        remaining: data.entries.length 
    };
}

/**
 * Exports audit entries to a format
 * @param {Object} filters - Query filters
 * @param {string} [format] - Export format ('json' or 'csv')
 * @returns {string} Exported data
 */
function exportEntries(filters = {}, format = 'json') {
    const { entries } = queryEntries({ ...filters, limit: 100000 });
    
    if (format === 'csv') {
        const headers = ['id', 'timestamp', 'type', 'action', 'actor_type', 'actor_id', 'actor_name', 'success', 'error'];
        const rows = entries.map(e => [
            e.id,
            e.timestamp,
            e.type,
            e.action,
            e.actor?.type || '',
            e.actor?.id || '',
            e.actor?.name || '',
            e.success,
            e.error || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        
        return [headers.join(','), ...rows].join('\n');
    }
    
    return JSON.stringify(entries, null, 2);
}

/**
 * Gets a single entry by ID
 * @param {string} id - Entry ID
 * @returns {Object|null} Entry or null
 */
function getEntry(id) {
    const data = loadAuditLog();
    return data.entries.find(e => e.id === id) || null;
}

module.exports = {
    loadAuditLog,
    saveAuditLog,
    addEntry,
    queryEntries,
    getStats,
    cleanupOldEntries,
    exportEntries,
    getEntry,
    generateId,
    MAX_ENTRIES,
    MAX_AGE_DAYS
};
