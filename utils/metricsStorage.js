/**
 * Metrics Storage
 * Handles persistent storage for bot usage metrics
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const METRICS_FILE = path.join(DATA_DIR, 'metrics.json');

// How many days of data to retain
const RETENTION_DAYS = 90;

/**
 * Ensures data directory exists
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Gets default metrics structure
 * @returns {Object} Default metrics object
 */
function getDefaultMetrics() {
    return {
        daily: {},
        hourly: {},
        guilds: {},  // Guild-specific metrics
        totals: {
            commands: 0,
            errors: 0,
            uniqueUsers: []
        },
        lastUpdated: new Date().toISOString()
    };
}

/**
 * Loads metrics from file
 * @returns {Object} Metrics data
 */
function loadMetrics() {
    ensureDataDir();
    
    try {
        if (fs.existsSync(METRICS_FILE)) {
            const data = fs.readFileSync(METRICS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading metrics', { error: error.message });
    }
    
    return getDefaultMetrics();
}

/**
 * Saves metrics to file
 * @param {Object} data - Metrics data to save
 */
function saveMetrics(data) {
    ensureDataDir();
    
    try {
        data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(METRICS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        logger.error('Error saving metrics', { error: error.message });
    }
}

/**
 * Gets current date key (YYYY-MM-DD)
 * @returns {string} Date key
 */
function getDateKey() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Gets current hour key (YYYY-MM-DDTHH)
 * @returns {string} Hour key
 */
function getHourKey() {
    const now = new Date();
    return `${now.toISOString().split('T')[0]}T${String(now.getHours()).padStart(2, '0')}`;
}

/**
 * Records a command execution
 * @param {Object} params - Command execution parameters
 * @param {string} params.command - Command name
 * @param {string} params.userId - User ID who executed
 * @param {number} params.responseTime - Response time in milliseconds
 * @param {boolean} params.error - Whether the command resulted in an error
 * @param {string} [params.guildId] - Guild ID where executed
 * @param {string} [params.guildName] - Guild name where executed
 */
function recordCommand({ command, userId, responseTime, error = false, guildId = null, guildName = null }) {
    const metrics = loadMetrics();
    const dateKey = getDateKey();
    const hourKey = getHourKey();
    
    // Initialize guilds object if missing
    if (!metrics.guilds) {
        metrics.guilds = {};
    }
    
    // Initialize daily data
    if (!metrics.daily[dateKey]) {
        metrics.daily[dateKey] = {
            commands: {},
            uniqueUsers: [],
            totalCommands: 0,
            totalErrors: 0
        };
    }
    
    // Initialize hourly data
    if (!metrics.hourly[hourKey]) {
        metrics.hourly[hourKey] = {
            commands: {},
            totalCommands: 0
        };
    }
    
    // Initialize command data for the day
    if (!metrics.daily[dateKey].commands[command]) {
        metrics.daily[dateKey].commands[command] = {
            count: 0,
            errors: 0,
            totalResponseMs: 0,
            avgResponseMs: 0
        };
    }
    
    // Initialize command data for the hour
    if (!metrics.hourly[hourKey].commands[command]) {
        metrics.hourly[hourKey].commands[command] = {
            count: 0
        };
    }
    
    // Update daily metrics
    const dailyCmd = metrics.daily[dateKey].commands[command];
    dailyCmd.count++;
    if (error) dailyCmd.errors++;
    if (responseTime) {
        dailyCmd.totalResponseMs += responseTime;
        dailyCmd.avgResponseMs = Math.round(dailyCmd.totalResponseMs / dailyCmd.count);
    }
    
    metrics.daily[dateKey].totalCommands++;
    if (error) metrics.daily[dateKey].totalErrors++;
    
    // Track unique users for the day
    if (!metrics.daily[dateKey].uniqueUsers.includes(userId)) {
        metrics.daily[dateKey].uniqueUsers.push(userId);
    }
    
    // Update hourly metrics
    metrics.hourly[hourKey].commands[command].count++;
    metrics.hourly[hourKey].totalCommands++;
    
    // Update totals
    metrics.totals.commands++;
    if (error) metrics.totals.errors++;
    if (!metrics.totals.uniqueUsers.includes(userId)) {
        metrics.totals.uniqueUsers.push(userId);
    }
    
    // Update guild metrics
    if (guildId) {
        if (!metrics.guilds[guildId]) {
            metrics.guilds[guildId] = {
                name: guildName || guildId,
                totalCommands: 0,
                totalErrors: 0,
                uniqueUsers: [],
                topCommands: {},
                lastActive: dateKey,
                firstSeen: dateKey
            };
        }
        
        const guild = metrics.guilds[guildId];
        
        // Update guild name if provided
        if (guildName && guild.name !== guildName) {
            guild.name = guildName;
        }
        
        guild.totalCommands++;
        if (error) guild.totalErrors++;
        guild.lastActive = dateKey;
        
        // Track unique users for the guild
        if (!guild.uniqueUsers.includes(userId)) {
            guild.uniqueUsers.push(userId);
        }
        
        // Track top commands per guild
        if (!guild.topCommands[command]) {
            guild.topCommands[command] = 0;
        }
        guild.topCommands[command]++;
    }
    
    // Cleanup old data
    cleanupOldData(metrics);
    
    saveMetrics(metrics);
}

/**
 * Removes data older than retention period
 * @param {Object} metrics - Metrics data object
 */
function cleanupOldData(metrics) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    const cutoffKey = cutoffDate.toISOString().split('T')[0];
    
    // Cleanup daily data
    for (const key of Object.keys(metrics.daily)) {
        if (key < cutoffKey) {
            delete metrics.daily[key];
        }
    }
    
    // Cleanup hourly data (keep last 7 days for hourly)
    const hourlyCutoff = new Date();
    hourlyCutoff.setDate(hourlyCutoff.getDate() - 7);
    const hourlyCutoffKey = hourlyCutoff.toISOString().split('T')[0];
    
    for (const key of Object.keys(metrics.hourly)) {
        if (key.split('T')[0] < hourlyCutoffKey) {
            delete metrics.hourly[key];
        }
    }
}

/**
 * Gets dashboard statistics
 * @returns {Object} Dashboard stats
 */
function getDashboardStats() {
    const metrics = loadMetrics();
    const today = getDateKey();
    const todayData = metrics.daily[today] || { 
        commands: {}, 
        uniqueUsers: [], 
        totalCommands: 0,
        totalErrors: 0 
    };
    
    // Get top commands
    const topCommands = Object.entries(todayData.commands)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    
    return {
        today: {
            totalCommands: todayData.totalCommands,
            totalErrors: todayData.totalErrors,
            uniqueUsers: todayData.uniqueUsers.length,
            topCommands
        },
        totals: {
            commands: metrics.totals.commands,
            errors: metrics.totals.errors,
            uniqueUsers: metrics.totals.uniqueUsers.length
        },
        lastUpdated: metrics.lastUpdated
    };
}

/**
 * Gets metrics for a specific date range
 * @param {number} days - Number of days to include
 * @returns {Object} Metrics data for the range
 */
function getMetricsRange(days = 7) {
    const metrics = loadMetrics();
    const result = {
        daily: {},
        commands: {}
    };
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffKey = cutoff.toISOString().split('T')[0];
    
    // Aggregate daily data
    for (const [date, data] of Object.entries(metrics.daily)) {
        if (date >= cutoffKey) {
            result.daily[date] = {
                totalCommands: data.totalCommands,
                totalErrors: data.totalErrors,
                uniqueUsers: data.uniqueUsers?.length || 0
            };
            
            // Aggregate command counts
            for (const [cmd, cmdData] of Object.entries(data.commands)) {
                if (!result.commands[cmd]) {
                    result.commands[cmd] = { count: 0, errors: 0 };
                }
                result.commands[cmd].count += cmdData.count;
                result.commands[cmd].errors += cmdData.errors;
            }
        }
    }
    
    return result;
}

/**
 * Gets hourly metrics for today
 * @returns {Object} Hourly data for today
 */
function getHourlyToday() {
    const metrics = loadMetrics();
    const today = getDateKey();
    const result = {};
    
    for (const [key, data] of Object.entries(metrics.hourly)) {
        if (key.startsWith(today)) {
            const hour = key.split('T')[1];
            result[hour] = data;
        }
    }
    
    return result;
}

/**
 * Gets command statistics
 * @param {string} command - Command name
 * @param {number} days - Number of days to analyze
 * @returns {Object} Command statistics
 */
function getCommandStats(command, days = 30) {
    const metrics = loadMetrics();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffKey = cutoff.toISOString().split('T')[0];
    
    let totalCount = 0;
    let totalErrors = 0;
    let totalResponseMs = 0;
    const dailyData = [];
    
    for (const [date, data] of Object.entries(metrics.daily)) {
        if (date >= cutoffKey && data.commands[command]) {
            const cmdData = data.commands[command];
            totalCount += cmdData.count;
            totalErrors += cmdData.errors;
            totalResponseMs += cmdData.totalResponseMs || 0;
            
            dailyData.push({
                date,
                count: cmdData.count,
                errors: cmdData.errors,
                avgResponseMs: cmdData.avgResponseMs
            });
        }
    }
    
    return {
        command,
        days,
        totalCount,
        totalErrors,
        avgResponseMs: totalCount > 0 ? Math.round(totalResponseMs / totalCount) : 0,
        errorRate: totalCount > 0 ? ((totalErrors / totalCount) * 100).toFixed(2) : 0,
        dailyData: dailyData.sort((a, b) => a.date.localeCompare(b.date))
    };
}

/**
 * Resets all metrics
 */
function resetMetrics() {
    const defaultMetrics = getDefaultMetrics();
    saveMetrics(defaultMetrics);
    logger.info('Metrics reset');
}

// ==================== GUILD METRICS ====================

/**
 * Gets statistics for a specific guild
 * @param {string} guildId - Guild ID
 * @returns {Object|null} Guild statistics or null if not found
 */
function getGuildStats(guildId) {
    const metrics = loadMetrics();
    
    if (!metrics.guilds || !metrics.guilds[guildId]) {
        return null;
    }
    
    const guild = metrics.guilds[guildId];
    
    // Calculate top commands sorted by count
    const topCommands = Object.entries(guild.topCommands || {})
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    // Calculate error rate
    const errorRate = guild.totalCommands > 0 
        ? ((guild.totalErrors / guild.totalCommands) * 100).toFixed(2)
        : '0.00';
    
    return {
        guildId,
        name: guild.name,
        totalCommands: guild.totalCommands,
        totalErrors: guild.totalErrors,
        errorRate: errorRate + '%',
        uniqueUsers: guild.uniqueUsers?.length || 0,
        topCommands,
        lastActive: guild.lastActive,
        firstSeen: guild.firstSeen,
        daysSinceActive: calculateDaysSince(guild.lastActive)
    };
}

/**
 * Gets top guilds by command usage
 * @param {number} limit - Maximum number of guilds to return
 * @returns {Array} Array of guild statistics sorted by command count
 */
function getTopGuilds(limit = 10) {
    const metrics = loadMetrics();
    
    if (!metrics.guilds) {
        return [];
    }
    
    return Object.entries(metrics.guilds)
        .map(([guildId, data]) => ({
            guildId,
            name: data.name,
            totalCommands: data.totalCommands,
            totalErrors: data.totalErrors,
            errorRate: data.totalCommands > 0 
                ? ((data.totalErrors / data.totalCommands) * 100).toFixed(1) + '%'
                : '0%',
            uniqueUsers: data.uniqueUsers?.length || 0,
            lastActive: data.lastActive,
            daysSinceActive: calculateDaysSince(data.lastActive)
        }))
        .sort((a, b) => b.totalCommands - a.totalCommands)
        .slice(0, limit);
}

/**
 * Gets all guilds with their statistics
 * @returns {Array} Array of all guild statistics
 */
function getAllGuildStats() {
    const metrics = loadMetrics();
    
    if (!metrics.guilds) {
        return [];
    }
    
    return Object.entries(metrics.guilds).map(([guildId, data]) => {
        const topCommands = Object.entries(data.topCommands || {})
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        
        return {
            guildId,
            name: data.name,
            totalCommands: data.totalCommands,
            totalErrors: data.totalErrors,
            errorRate: data.totalCommands > 0 
                ? ((data.totalErrors / data.totalCommands) * 100).toFixed(1) + '%'
                : '0%',
            uniqueUsers: data.uniqueUsers?.length || 0,
            topCommands,
            lastActive: data.lastActive,
            firstSeen: data.firstSeen,
            daysSinceActive: calculateDaysSince(data.lastActive)
        };
    });
}

/**
 * Gets guild activity summary
 * @param {number} days - Number of days to consider for active status
 * @returns {Object} Activity summary
 */
function getGuildActivitySummary(days = 7) {
    const metrics = loadMetrics();
    
    if (!metrics.guilds) {
        return {
            totalGuilds: 0,
            activeGuilds: 0,
            inactiveGuilds: 0,
            totalCommands: 0,
            totalUsers: 0
        };
    }
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffKey = cutoff.toISOString().split('T')[0];
    
    let activeGuilds = 0;
    let totalCommands = 0;
    const allUsers = new Set();
    
    for (const [guildId, data] of Object.entries(metrics.guilds)) {
        if (data.lastActive >= cutoffKey) {
            activeGuilds++;
        }
        totalCommands += data.totalCommands;
        for (const userId of (data.uniqueUsers || [])) {
            allUsers.add(userId);
        }
    }
    
    const totalGuilds = Object.keys(metrics.guilds).length;
    
    return {
        totalGuilds,
        activeGuilds,
        inactiveGuilds: totalGuilds - activeGuilds,
        activeDays: days,
        totalCommands,
        totalUsers: allUsers.size
    };
}

/**
 * Calculates days since a given date
 * @param {string} dateKey - Date in YYYY-MM-DD format
 * @returns {number} Number of days since the date
 */
function calculateDaysSince(dateKey) {
    if (!dateKey) return null;
    
    const date = new Date(dateKey);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Updates guild name in metrics
 * @param {string} guildId - Guild ID
 * @param {string} guildName - New guild name
 */
function updateGuildName(guildId, guildName) {
    const metrics = loadMetrics();
    
    if (metrics.guilds && metrics.guilds[guildId]) {
        metrics.guilds[guildId].name = guildName;
        saveMetrics(metrics);
    }
}

module.exports = {
    loadMetrics,
    saveMetrics,
    recordCommand,
    getDashboardStats,
    getMetricsRange,
    getHourlyToday,
    getCommandStats,
    resetMetrics,
    
    // Guild metrics
    getGuildStats,
    getTopGuilds,
    getAllGuildStats,
    getGuildActivitySummary,
    updateGuildName
};
