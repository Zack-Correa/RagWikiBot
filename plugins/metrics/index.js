/**
 * Metrics Plugin
 * Collects and analyzes bot usage metrics
 * 
 * This plugin provides:
 * - Command execution tracking
 * - Response time monitoring
 * - User activity statistics
 * - Dashboard data for admin panel
 */

const storage = require('./storage');

// Plugin state
let enabled = false;
let pluginLogger = null;

/**
 * Called when plugin is loaded from disk
 */
function onLoad(context) {
    pluginLogger = context.logger;
    storage.setLogger({
        info: (msg, data) => context.logger.info(msg, data),
        error: (msg, data) => context.logger.error(msg, data),
        debug: (msg, data) => context.logger.debug(msg, data),
        warn: (msg, data) => context.logger.warn(msg, data)
    });
    context.logger.info('Metrics plugin loaded');
}

/**
 * Called when plugin is enabled
 */
function onEnable(context) {
    enabled = true;
    context.logger.info('Metrics plugin enabled - collecting metrics');
}

/**
 * Called when plugin is disabled
 */
function onDisable(context) {
    enabled = false;
    context.logger.info('Metrics plugin disabled - metrics collection paused');
}

/**
 * Called when plugin is unloaded
 */
function onUnload(context) {
    context.logger.info('Metrics plugin unloaded');
}

// ============================================================
// Public API - These functions are exposed for external use
// ============================================================

/**
 * Records a command execution with timing
 * @param {Object} params - Parameters
 * @param {string} params.command - Command name
 * @param {string} params.userId - User ID
 * @param {string} [params.guildId] - Guild ID
 * @param {number} params.startTime - Start timestamp from Date.now()
 * @param {boolean} [params.error] - Whether command errored
 */
function recordCommandExecution({ command, userId, guildId, startTime, error = false }) {
    if (!enabled) return;
    
    try {
        const responseTime = Date.now() - startTime;
        
        storage.recordCommand({
            command,
            userId,
            guildId,
            responseTime,
            error
        });
    } catch (err) {
        // Don't let metrics errors affect bot functionality
        if (pluginLogger) {
            pluginLogger.error('Error recording metrics', { error: err.message });
        }
    }
}

/**
 * Gets dashboard statistics
 * @returns {Object} Dashboard stats
 */
function getDashboardStats() {
    return storage.getDashboardStats();
}

/**
 * Gets metrics for chart display
 * @param {number} days - Number of days
 * @returns {Object} Chart-ready data
 */
function getChartData(days = 7) {
    const range = storage.getMetricsRange(days);
    
    // Prepare data for charts
    const labels = [];
    const commandCounts = [];
    const errorCounts = [];
    const userCounts = [];
    
    // Get all dates in range
    const dates = Object.keys(range.daily).sort();
    
    for (const date of dates) {
        const dayData = range.daily[date];
        labels.push(date.slice(5)); // MM-DD format
        commandCounts.push(dayData.totalCommands);
        errorCounts.push(dayData.totalErrors);
        userCounts.push(dayData.uniqueUsers);
    }
    
    // Top commands
    const topCommands = Object.entries(range.commands)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    return {
        labels,
        datasets: {
            commands: commandCounts,
            errors: errorCounts,
            users: userCounts
        },
        topCommands
    };
}

/**
 * Gets hourly distribution for today
 * @returns {Object} Hourly data
 */
function getHourlyDistribution() {
    const hourly = storage.getHourlyToday();
    
    const labels = [];
    const counts = [];
    
    // Fill all 24 hours
    for (let h = 0; h < 24; h++) {
        const hourStr = String(h).padStart(2, '0');
        labels.push(`${hourStr}:00`);
        counts.push(hourly[hourStr]?.totalCommands || 0);
    }
    
    return { labels, counts };
}

/**
 * Gets command-specific statistics
 * @param {string} command - Command name
 * @param {number} days - Days to analyze
 * @returns {Object} Command stats
 */
function getCommandStats(command, days = 30) {
    return storage.getCommandStats(command, days);
}

/**
 * Resets all metrics (admin only)
 */
function resetMetrics() {
    storage.resetMetrics();
}

/**
 * Check if metrics collection is enabled
 * @returns {boolean} Whether metrics are being collected
 */
function isEnabled() {
    return enabled;
}

// Export plugin interface
module.exports = {
    // Lifecycle hooks
    onLoad,
    onEnable,
    onDisable,
    onUnload,
    
    // No commands for this plugin
    commands: {},
    
    // No events for this plugin
    events: {},
    
    // Public API (accessible via require)
    api: {
        recordCommandExecution,
        getDashboardStats,
        getChartData,
        getHourlyDistribution,
        getCommandStats,
        resetMetrics,
        isEnabled
    }
};
