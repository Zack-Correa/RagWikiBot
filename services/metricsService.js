/**
 * Metrics Service
 * Provides a simple interface for recording and retrieving bot metrics
 */

const metricsStorage = require('../utils/metricsStorage');
const logger = require('../utils/logger');

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
    try {
        const responseTime = Date.now() - startTime;
        
        metricsStorage.recordCommand({
            command,
            userId,
            guildId,
            responseTime,
            error
        });
        
        logger.debug('Metrics recorded', { command, responseTime, error });
    } catch (err) {
        // Don't let metrics errors affect bot functionality
        logger.error('Error recording metrics', { error: err.message });
    }
}

/**
 * Gets dashboard statistics
 * @returns {Object} Dashboard stats
 */
function getDashboardStats() {
    return metricsStorage.getDashboardStats();
}

/**
 * Gets metrics for chart display
 * @param {number} days - Number of days
 * @returns {Object} Chart-ready data
 */
function getChartData(days = 7) {
    const range = metricsStorage.getMetricsRange(days);
    
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
    const hourly = metricsStorage.getHourlyToday();
    
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
    return metricsStorage.getCommandStats(command, days);
}

/**
 * Resets all metrics (admin only)
 */
function resetMetrics() {
    metricsStorage.resetMetrics();
}

module.exports = {
    recordCommandExecution,
    getDashboardStats,
    getChartData,
    getHourlyDistribution,
    getCommandStats,
    resetMetrics
};
