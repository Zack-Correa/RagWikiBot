/**
 * Metrics Service Facade
 * Delegates to the metrics plugin when enabled, otherwise does nothing
 * This allows the core to use metrics without hard dependency on the plugin
 */

const path = require('path');
const logger = require('../utils/logger');

// Cache for plugin module
let metricsPlugin = null;
let pluginChecked = false;

/**
 * Gets the metrics plugin if available and enabled
 * @returns {Object|null} Plugin API or null
 */
function getMetricsPlugin() {
    if (!pluginChecked) {
        pluginChecked = true;
        try {
            // Try to load the plugin directly
            const pluginPath = path.join(__dirname, '..', 'plugins', 'metrics', 'index.js');
            metricsPlugin = require(pluginPath);
        } catch (e) {
            // Plugin not installed
            metricsPlugin = null;
        }
    }
    return metricsPlugin;
}

/**
 * Resets the plugin cache (call when plugins are reloaded)
 */
function resetPluginCache() {
    pluginChecked = false;
    metricsPlugin = null;
    
    // Clear require cache
    try {
        const pluginPath = path.join(__dirname, '..', 'plugins', 'metrics', 'index.js');
        delete require.cache[require.resolve(pluginPath)];
    } catch (e) {
        // Ignore
    }
}

/**
 * Records a command execution with timing
 * @param {Object} params - Parameters
 */
function recordCommandExecution(params) {
    const plugin = getMetricsPlugin();
    if (plugin?.api?.recordCommandExecution) {
        plugin.api.recordCommandExecution(params);
    }
}

/**
 * Gets dashboard statistics
 * @returns {Object} Dashboard stats
 */
function getDashboardStats() {
    const plugin = getMetricsPlugin();
    if (plugin?.api?.getDashboardStats) {
        return plugin.api.getDashboardStats();
    }
    return {
        today: { totalCommands: 0, totalErrors: 0, uniqueUsers: 0, topCommands: [] },
        totals: { commands: 0, errors: 0, uniqueUsers: 0 },
        lastUpdated: null
    };
}

/**
 * Gets metrics for chart display
 * @param {number} days - Number of days
 * @returns {Object} Chart-ready data
 */
function getChartData(days = 7) {
    const plugin = getMetricsPlugin();
    if (plugin?.api?.getChartData) {
        return plugin.api.getChartData(days);
    }
    return {
        labels: [],
        datasets: { commands: [], errors: [], users: [] },
        topCommands: []
    };
}

/**
 * Gets hourly distribution for today
 * @returns {Object} Hourly data
 */
function getHourlyDistribution() {
    const plugin = getMetricsPlugin();
    if (plugin?.api?.getHourlyDistribution) {
        return plugin.api.getHourlyDistribution();
    }
    return { labels: [], counts: [] };
}

/**
 * Gets command-specific statistics
 * @param {string} command - Command name
 * @param {number} days - Days to analyze
 * @returns {Object} Command stats
 */
function getCommandStats(command, days = 30) {
    const plugin = getMetricsPlugin();
    if (plugin?.api?.getCommandStats) {
        return plugin.api.getCommandStats(command, days);
    }
    return {
        command,
        days,
        totalCount: 0,
        totalErrors: 0,
        avgResponseMs: 0,
        errorRate: 0,
        dailyData: []
    };
}

/**
 * Resets all metrics (admin only)
 */
function resetMetrics() {
    const plugin = getMetricsPlugin();
    if (plugin?.api?.resetMetrics) {
        plugin.api.resetMetrics();
    }
}

/**
 * Check if metrics collection is enabled
 * @returns {boolean} Whether metrics are being collected
 */
function isEnabled() {
    const plugin = getMetricsPlugin();
    return plugin?.api?.isEnabled?.() || false;
}

module.exports = {
    recordCommandExecution,
    getDashboardStats,
    getChartData,
    getHourlyDistribution,
    getCommandStats,
    resetMetrics,
    resetPluginCache,
    isEnabled
};
