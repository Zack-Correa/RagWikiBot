/**
 * Error Alert Service
 * Sends notifications to admins when critical errors occur
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'error-alerts.json');

// Discord client reference
let discordClient = null;

// Cooldown to prevent spam (5 minutes)
const COOLDOWN_MS = 5 * 60 * 1000;
const lastAlerts = new Map();

/**
 * Loads error alert configuration
 * @returns {Object} Config
 */
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (error) {
        logger.error('Error loading error alert config', { error: error.message });
    }
    return {
        enabled: true,
        adminUserIds: [],
        alertChannelId: null,
        minSeverity: 'error',
        cooldownMinutes: 5
    };
}

/**
 * Saves error alert configuration
 * @param {Object} config - Config to save
 */
function saveConfig(config) {
    try {
        const dir = path.dirname(CONFIG_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (error) {
        logger.error('Error saving error alert config', { error: error.message });
    }
}

/**
 * Sets the Discord client
 * @param {Client} client - Discord.js client
 */
function setClient(client) {
    discordClient = client;
}

/**
 * Checks if an alert should be sent (cooldown check)
 * @param {string} errorKey - Unique key for the error type
 * @returns {boolean} Whether alert should be sent
 */
function shouldSendAlert(errorKey) {
    const lastAlert = lastAlerts.get(errorKey);
    if (!lastAlert) return true;
    
    const config = loadConfig();
    const cooldown = (config.cooldownMinutes || 5) * 60 * 1000;
    
    return (Date.now() - lastAlert) > cooldown;
}

/**
 * Sends an error alert to configured admins
 * @param {Object} params - Alert parameters
 * @param {string} params.title - Alert title
 * @param {string} params.description - Alert description
 * @param {string} params.severity - Severity level (error, critical)
 * @param {Object} [params.details] - Additional details
 * @param {string} [params.errorKey] - Unique key for cooldown (defaults to title)
 */
async function sendAlert({ title, description, severity = 'error', details = {}, errorKey = null }) {
    const config = loadConfig();
    
    if (!config.enabled) return;
    if (!discordClient) return;
    
    // Check severity threshold
    const severityLevels = ['warning', 'error', 'critical'];
    const minLevel = severityLevels.indexOf(config.minSeverity || 'error');
    const currentLevel = severityLevels.indexOf(severity);
    
    if (currentLevel < minLevel) return;
    
    // Check cooldown
    const key = errorKey || title;
    if (!shouldSendAlert(key)) {
        logger.debug('Error alert skipped (cooldown)', { key });
        return;
    }
    
    // Mark as sent
    lastAlerts.set(key, Date.now());
    
    // Build embed
    const color = severity === 'critical' ? '#8B0000' : '#ED4245';
    const emoji = severity === 'critical' ? '🚨' : '⚠️';
    
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${emoji} ${title}`)
        .setDescription(description)
        .setTimestamp();
    
    // Add details
    if (details.plugin) {
        embed.addFields({ name: 'Plugin', value: details.plugin, inline: true });
    }
    if (details.command) {
        embed.addFields({ name: 'Comando', value: details.command, inline: true });
    }
    if (details.guild) {
        embed.addFields({ name: 'Servidor', value: details.guild, inline: true });
    }
    if (details.error) {
        embed.addFields({ 
            name: 'Erro', 
            value: `\`\`\`${details.error.substring(0, 500)}\`\`\``, 
            inline: false 
        });
    }
    if (details.stack) {
        embed.addFields({ 
            name: 'Stack', 
            value: `\`\`\`${details.stack.substring(0, 500)}\`\`\``, 
            inline: false 
        });
    }
    
    embed.setFooter({ text: `Severity: ${severity.toUpperCase()}` });
    
    // Send to alert channel if configured
    if (config.alertChannelId) {
        try {
            const channel = await discordClient.channels.fetch(config.alertChannelId);
            if (channel) {
                await channel.send({ embeds: [embed] });
                logger.info('Error alert sent to channel', { channelId: config.alertChannelId });
            }
        } catch (error) {
            logger.error('Failed to send alert to channel', { error: error.message });
        }
    }
    
    // Send DMs to admin users
    if (config.adminUserIds && config.adminUserIds.length > 0) {
        for (const userId of config.adminUserIds) {
            try {
                const user = await discordClient.users.fetch(userId);
                if (user) {
                    await user.send({ embeds: [embed] });
                    logger.info('Error alert sent to admin', { userId });
                }
            } catch (error) {
                // User might have DMs disabled
                logger.warn('Failed to send alert to admin', { userId, error: error.message });
            }
        }
    }
}

/**
 * Sends a plugin error alert
 * @param {string} pluginName - Plugin name
 * @param {Error} error - The error
 * @param {string} context - Error context
 */
async function alertPluginError(pluginName, error, context = 'unknown') {
    await sendAlert({
        title: 'Erro de Plugin',
        description: `O plugin **${pluginName}** encontrou um erro.`,
        severity: 'error',
        details: {
            plugin: pluginName,
            error: error.message,
            stack: error.stack
        },
        errorKey: `plugin:${pluginName}:${context}`
    });
}

/**
 * Sends a plugin auto-disable alert
 * @param {string} pluginName - Plugin name
 * @param {number} errorCount - Number of errors
 */
async function alertPluginAutoDisabled(pluginName, errorCount) {
    await sendAlert({
        title: 'Plugin Desativado Automaticamente',
        description: `O plugin **${pluginName}** foi desativado devido a muitos erros.`,
        severity: 'critical',
        details: {
            plugin: pluginName,
            error: `${errorCount} erros no período de monitoramento`
        },
        errorKey: `plugin-disabled:${pluginName}`
    });
}

/**
 * Sends a critical system error alert
 * @param {string} message - Error message
 * @param {Error} error - The error
 */
async function alertCriticalError(message, error) {
    await sendAlert({
        title: 'Erro Crítico do Sistema',
        description: message,
        severity: 'critical',
        details: {
            error: error.message,
            stack: error.stack
        },
        errorKey: `critical:${message}`
    });
}

/**
 * Adds an admin user to receive alerts
 * @param {string} userId - Discord user ID
 */
function addAdminUser(userId) {
    const config = loadConfig();
    if (!config.adminUserIds.includes(userId)) {
        config.adminUserIds.push(userId);
        saveConfig(config);
        logger.info('Admin user added for error alerts', { userId });
    }
}

/**
 * Removes an admin user from receiving alerts
 * @param {string} userId - Discord user ID
 */
function removeAdminUser(userId) {
    const config = loadConfig();
    config.adminUserIds = config.adminUserIds.filter(id => id !== userId);
    saveConfig(config);
    logger.info('Admin user removed from error alerts', { userId });
}

/**
 * Sets the alert channel
 * @param {string} channelId - Discord channel ID
 */
function setAlertChannel(channelId) {
    const config = loadConfig();
    config.alertChannelId = channelId;
    saveConfig(config);
    logger.info('Alert channel set', { channelId });
}

/**
 * Gets the current configuration
 * @returns {Object} Current config
 */
function getConfig() {
    return loadConfig();
}

/**
 * Updates configuration
 * @param {Object} updates - Config updates
 */
function updateConfig(updates) {
    const config = loadConfig();
    Object.assign(config, updates);
    saveConfig(config);
}

module.exports = {
    setClient,
    sendAlert,
    alertPluginError,
    alertPluginAutoDisabled,
    alertCriticalError,
    addAdminUser,
    removeAdminUser,
    setAlertChannel,
    getConfig,
    updateConfig
};
