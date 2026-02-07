/**
 * Market Alert Service
 * Runs periodic checks for market alerts and notifies users via DM
 */

const logger = require('../utils/logger');
const alertStorage = require('../utils/alertStorage');
const configStorage = require('../utils/configStorage');
const gnjoy = require('../integrations/database/gnjoy');
const { sleep } = require('../utils/helpers');
const intelligentStrategy = require('./intelligentQueryStrategy');

let client = null;
let intervalId = null;
let cleanupIntervalId = null;
let isRunning = false;
let currentIntervalMs = null;

/**
 * Initializes the market alert service
 * @param {Client} discordClient - Discord.js client instance
 */
function initialize(discordClient) {
    client = discordClient;
    logger.info('Market alert service initialized');
}

/**
 * Starts the periodic alert checking
 */
function start() {
    if (!client) {
        logger.error('Market alert service not initialized - call initialize() first');
        return;
    }
    
    if (intervalId) {
        logger.warn('Market alert service already running');
        return;
    }
    
    // Get current interval from config
    currentIntervalMs = configStorage.getCheckIntervalMs();
    
    // Run first check after 1 minute to let the bot fully start
    setTimeout(() => {
        runAlertCheck();
    }, 60 * 1000);
    
    // Then run at configured interval
    intervalId = setInterval(() => {
        runAlertCheck();
    }, currentIntervalMs);
    
    logger.info('Market alert service started', { 
        intervalMinutes: currentIntervalMs / 60000 
    });
    
    // Start cleanup interval (run once per day)
    startCleanupInterval();
}

/**
 * Restarts the service with updated config (call after config changes)
 */
function restart() {
    const wasRunning = !!intervalId;
    stop();
    
    if (wasRunning) {
        // Start immediately without the 1-minute delay
        currentIntervalMs = configStorage.getCheckIntervalMs();
        
        intervalId = setInterval(() => {
            runAlertCheck();
        }, currentIntervalMs);
        
        logger.info('Market alert service restarted with new config', { 
            intervalMinutes: currentIntervalMs / 60000 
        });
    }
}

/**
 * Stops the periodic alert checking
 */
function stop() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    
    if (cleanupIntervalId) {
        clearInterval(cleanupIntervalId);
        cleanupIntervalId = null;
    }
    
    logger.info('Market alert service stopped');
}

/**
 * Starts the cleanup interval (runs once per day)
 */
function startCleanupInterval() {
    if (cleanupIntervalId) {
        logger.warn('Cleanup interval already running');
        return;
    }
    
    // Run cleanup once per day (24 hours)
    const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
    
    // Run first cleanup after 1 hour
    setTimeout(() => {
        cleanupOldAlerts();
    }, 60 * 60 * 1000);
    
    // Then run daily
    cleanupIntervalId = setInterval(() => {
        cleanupOldAlerts();
    }, CLEANUP_INTERVAL_MS);
    
    logger.info('Cleanup interval started', { 
        intervalHours: CLEANUP_INTERVAL_MS / (60 * 60 * 1000) 
    });
}

/**
 * Runs a single alert check cycle
 */
async function runAlertCheck() {
    if (isRunning) {
        logger.debug('Alert check already in progress, skipping');
        return;
    }
    
    isRunning = true;
    const startTime = Date.now();
    
    try {
        logger.info('Starting market alert check');
        
        // Get alerts grouped by search term to optimize API calls
        const groupedAlerts = alertStorage.getGroupedAlerts();
        const groups = Object.values(groupedAlerts);
        
        if (groups.length === 0) {
            logger.debug('No alerts to check');
            return;
        }
        
        logger.info('Processing alert groups', { 
            totalGroups: groups.length,
            totalAlerts: groups.reduce((sum, g) => sum + g.alerts.length, 0)
        });
        
        // Use intelligent prioritization
        const prioritizedGroups = intelligentStrategy.prioritizeGroups(groups);
        
        logger.debug('Groups prioritized', {
            originalOrder: groups.map(g => g.searchTerm),
            prioritizedOrder: prioritizedGroups.map(g => g.searchTerm)
        });
        
        let notificationsSent = 0;
        let errorsCount = 0;
        let skippedCount = 0;
        let cacheHits = 0;
        
        for (const group of prioritizedGroups) {
            try {
                // Check if query should be skipped
                const skipCheck = intelligentStrategy.shouldSkipQuery(
                    group.searchTerm,
                    group.server,
                    group.storeType
                );
                
                if (skipCheck.shouldSkip) {
                    skippedCount++;
                    logger.debug('Skipping query (intelligent strategy)', {
                        searchTerm: group.searchTerm,
                        server: group.server,
                        storeType: group.storeType,
                        reason: skipCheck.reason
                    });
                    continue;
                }
                
                // Try to get cached result first
                let results = intelligentStrategy.getCachedResult(
                    group.searchTerm,
                    group.server,
                    group.storeType
                );
                
                if (results) {
                    cacheHits++;
                    logger.debug('Using cached result for group', {
                        searchTerm: group.searchTerm,
                        server: group.server,
                        storeType: group.storeType
                    });
                } else {
                    // Search the market for this group
                    results = await gnjoy.searchMarket(group.searchTerm, {
                        storeType: group.storeType,
                        server: group.server
                    });
                    
                    // Cache the result
                    intelligentStrategy.cacheResult(
                        group.searchTerm,
                        group.server,
                        group.storeType,
                        results
                    );
                }
                
                // Record that we checked this group
                intelligentStrategy.recordCheck(
                    group.searchTerm,
                    group.server,
                    group.storeType
                );
                
                if (results.list && results.list.length > 0) {
                    // Process each alert in this group INDEPENDENTLY
                    // Each alert has its own criteria (maxPrice, minQuantity)
                    for (const alert of group.alerts) {
                        try {
                            // IMPORTANT: Reload alert from storage to get fresh data
                            // This prevents stale data issues when multiple alerts are processed
                            const freshAlert = alertStorage.getAlert(alert.id);
                            if (!freshAlert) {
                                logger.warn('Alert no longer exists', { alertId: alert.id });
                                continue;
                            }
                            
                            const sent = await processAlertResults(freshAlert, results.list);
                            if (sent) notificationsSent++;
                        } catch (alertError) {
                            logger.warn('Error processing individual alert', {
                                alertId: alert.id,
                                error: alertError.message
                            });
                        }
                    }
                } else {
                    logger.debug('No results found for group', {
                        searchTerm: group.searchTerm,
                        server: group.server,
                        storeType: group.storeType
                    });
                }
                
                // Delay between requests to avoid rate limiting
                await sleep(configStorage.getRequestDelayMs());
            } catch (error) {
                errorsCount++;
                logger.warn('Error checking alert group', {
                    searchTerm: group.searchTerm,
                    server: group.server,
                    error: error.message
                });
            }
        }
        
        // Update last check timestamp
        alertStorage.updateLastCheck();
        
        const duration = Date.now() - startTime;
        logger.info('Market alert check completed', {
            duration: `${duration}ms`,
            groupsChecked: groups.length - skippedCount,
            groupsSkipped: skippedCount,
            cacheHits,
            notificationsSent,
            errors: errorsCount
        });
    } catch (error) {
        logger.error('Error in alert check cycle', { error: error.message });
    } finally {
        isRunning = false;
    }
}

/**
 * Processes search results for a specific alert and sends notification if criteria match
 * @param {Object} alert - The alert object (should be fresh from storage)
 * @param {Array} items - Market items found
 * @returns {boolean} True if notification was sent
 */
async function processAlertResults(alert, items) {
    try {
        logger.debug('Processing alert', {
            alertId: alert.id,
            userId: alert.userId,
            searchTerm: alert.searchTerm,
            maxPrice: alert.maxPrice,
            minQuantity: alert.minQuantity,
            lowestPriceSeen: alert.lowestPriceSeen,
            totalItems: items.length
        });
        
        // Filter items based on alert criteria
        let matchingItems = [...items]; // Create a copy to avoid modifying original
        
        // Filter by max price if specified
        if (alert.maxPrice) {
            matchingItems = matchingItems.filter(item => item.itemPrice <= alert.maxPrice);
            logger.debug('After maxPrice filter', {
                alertId: alert.id,
                maxPrice: alert.maxPrice,
                matchingCount: matchingItems.length
            });
        }
        
        // Filter by min quantity if specified
        if (alert.minQuantity) {
            matchingItems = matchingItems.filter(item => item.itemCnt >= alert.minQuantity);
            logger.debug('After minQuantity filter', {
                alertId: alert.id,
                minQuantity: alert.minQuantity,
                matchingCount: matchingItems.length
            });
        }
        
        if (matchingItems.length === 0) {
            logger.debug('No matching items for alert', { alertId: alert.id });
            return false;
        }
        
        // Sort by price ascending to get the lowest first
        matchingItems.sort((a, b) => a.itemPrice - b.itemPrice);
        
        // Find the lowest price in current results
        const currentLowestPrice = matchingItems[0].itemPrice;
        
        // Use the value directly from the alert object (which should be fresh from storage)
        const previousLowestPrice = alert.lowestPriceSeen;
        
        logger.debug('Price comparison', {
            alertId: alert.id,
            currentLowestPrice,
            previousLowestPrice,
            matchingItemsCount: matchingItems.length
        });
        
        // Check if we found a lower price than before
        const isLowerPrice = previousLowestPrice !== null && currentLowestPrice < previousLowestPrice;
        const isFirstCheck = previousLowestPrice === null;
        
        // Always update the lowest price seen if it's lower (or first check)
        if (isFirstCheck || currentLowestPrice < previousLowestPrice) {
            alertStorage.updateLowestPrice(alert.id, currentLowestPrice);
            logger.info('Updated lowest price for alert', {
                alertId: alert.id,
                previousLowestPrice,
                currentLowestPrice,
                isFirstCheck
            });
        }
        
        // Check cooldown (skip cooldown if we found a lower price)
        const cooldownMs = configStorage.getCooldownMs();
        if (!isLowerPrice && !isFirstCheck && alert.lastNotified) {
            const timeSinceNotified = Date.now() - new Date(alert.lastNotified).getTime();
            if (timeSinceNotified < cooldownMs) {
                logger.debug('Alert in cooldown', { 
                    alertId: alert.id,
                    remainingMinutes: Math.ceil((cooldownMs - timeSinceNotified) / 60000)
                });
                return false;
            }
        }
        
        // Send DM to user
        const sent = await sendAlertNotification(alert, matchingItems, {
            isLowerPrice,
            isFirstCheck,
            previousLowestPrice,
            currentLowestPrice
        });
        
        if (sent) {
            alertStorage.updateAlertNotified(alert.id);
        }
        
        return sent;
    } catch (error) {
        logger.error('Error processing alert results', { 
            alertId: alert.id, 
            error: error.message,
            stack: error.stack
        });
        return false;
    }
}

/**
 * Sends a DM notification to the user
 * @param {Object} alert - The alert object
 * @param {Array} items - Matching items
 * @param {Object} priceInfo - Price comparison info
 * @param {boolean} priceInfo.isLowerPrice - Whether a lower price was found
 * @param {boolean} priceInfo.isFirstCheck - Whether this is the first check
 * @param {number} priceInfo.previousLowestPrice - Previous lowest price
 * @param {number} priceInfo.currentLowestPrice - Current lowest price
 * @returns {boolean} True if sent successfully
 */
async function sendAlertNotification(alert, items, priceInfo = {}) {
    try {
        const user = await client.users.fetch(alert.userId);
        
        if (!user) {
            logger.warn('Could not find user for alert', { userId: alert.userId });
            return false;
        }
        
        const { EmbedBuilder } = require('discord.js');
        
        const storeTypeLabel = gnjoy.getStoreTypeLabel(alert.storeType);
        
        // Different title and color based on notification type
        let title = '🔔 Alerta de Mercado!';
        let color = '#00ff00';
        let description = `Encontramos **${items.length}** resultado(s) para seu alerta!`;
        
        if (priceInfo.isFirstCheck) {
            title = '🆕 Primeiro Alerta!';
            color = '#3498db';
            description = `Primeira verificação do seu alerta! Menor preço encontrado: **${gnjoy.formatPrice(priceInfo.currentLowestPrice)}z**`;
        } else if (priceInfo.isLowerPrice) {
            title = '📉 Preço Mais Baixo Encontrado!';
            color = '#ffaa00';
            const priceDrop = priceInfo.previousLowestPrice - priceInfo.currentLowestPrice;
            const dropPercent = ((priceDrop / priceInfo.previousLowestPrice) * 100).toFixed(1);
            description = `**QUEDA DE PREÇO!** O menor preço caiu de **${gnjoy.formatPrice(priceInfo.previousLowestPrice)}z** para **${gnjoy.formatPrice(priceInfo.currentLowestPrice)}z** (-${dropPercent}%)`;
        }
        
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(description)
            .setTimestamp();
        
        // Alert info
        embed.addFields({
            name: '📋 Configuração do Alerta',
            value: [
                `**Item:** ${alert.searchTerm}`,
                `**Tipo:** ${storeTypeLabel}`,
                `**Servidor:** ${alert.server}`,
                alert.maxPrice ? `**Preço máx:** ${gnjoy.formatPrice(alert.maxPrice)}z` : null,
                alert.minQuantity ? `**Qtd mín:** ${alert.minQuantity}` : null
            ].filter(Boolean).join('\n'),
            inline: false
        });
        
        // Show top 5 results
        const topItems = items.slice(0, 5);
        const itemsList = topItems.map((item, i) => {
            const price = gnjoy.formatPrice(item.itemPrice);
            return `**${i + 1}.** ${item.itemName}\n` +
                   `   💰 ${price}z | 📦 x${item.itemCnt}\n` +
                   `   🏪 ${item.storeName} (${item.itemSellerCharName})`;
        }).join('\n\n');
        
        embed.addFields({
            name: `🛒 Resultados (${Math.min(5, items.length)} de ${items.length})`,
            value: itemsList.substring(0, 1024),
            inline: false
        });
        
        if (items.length > 5) {
            embed.addFields({
                name: '\u200b',
                value: `*... e mais ${items.length - 5} resultado(s)*`,
                inline: false
            });
        }
        
        embed.setFooter({ 
            text: 'Use /alerta-mercado listar para ver seus alertas' 
        });
        
        await user.send({ embeds: [embed] });
        
        logger.info('Alert notification sent', { 
            alertId: alert.id, 
            userId: alert.userId,
            itemsFound: items.length
        });
        
        return true;
    } catch (error) {
        // User might have DMs disabled
        if (error.code === 50007) {
            logger.warn('Cannot send DM to user (DMs disabled)', { userId: alert.userId });
        } else {
            logger.error('Error sending alert notification', { 
                alertId: alert.id, 
                error: error.message 
            });
        }
        return false;
    }
}

/**
 * Forces an immediate alert check (for testing)
 */
async function forceCheck() {
    await runAlertCheck();
}

/**
 * Gets the service status
 * @returns {Object} Status info
 */
function getStatus() {
    const stats = alertStorage.getStats();
    const config = configStorage.getFullConfig();
    const cacheStats = intelligentStrategy.getCacheStats();
    
    return {
        running: !!intervalId,
        isChecking: isRunning,
        intervalMinutes: config.checkIntervalMinutes,
        cooldownMinutes: config.cooldownMinutes,
        requestDelayMs: config.requestDelayMs,
        intelligentStrategy: {
            enabled: true,
            cacheSize: cacheStats.cacheSize,
            groupStatsSize: cacheStats.groupStatsSize
        },
        ...stats
    };
}

/**
 * Sends a notification to user about alert expiration
 * @param {Object} alert - The alert object
 * @returns {boolean} True if sent successfully
 */
async function sendExpirationNotification(alert) {
    try {
        const user = await client.users.fetch(alert.userId);
        
        if (!user) {
            logger.warn('Could not find user for expiration notification', { userId: alert.userId });
            return false;
        }
        
        const { EmbedBuilder } = require('discord.js');
        const storeTypeLabel = gnjoy.getStoreTypeLabel(alert.storeType);
        
        const createdAt = new Date(alert.createdAt);
        const daysOld = Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
        
        const embed = new EmbedBuilder()
            .setColor('#ff6b6b')
            .setTitle('⏰ Alerta Expirado')
            .setDescription(
                `Seu alerta de mercado foi removido automaticamente por estar inativo há mais de 30 dias.\n\n` +
                `**Detalhes do alerta removido:**`
            )
            .addFields({
                name: '📋 Configuração',
                value: [
                    `**Item:** ${alert.searchTerm}`,
                    `**Tipo:** ${storeTypeLabel}`,
                    `**Servidor:** ${alert.server}`,
                    alert.maxPrice ? `**Preço máx:** ${gnjoy.formatPrice(alert.maxPrice)}z` : null,
                    alert.minQuantity ? `**Qtd mín:** ${alert.minQuantity}` : null,
                    `**Criado em:** <t:${Math.floor(createdAt.getTime() / 1000)}:F>`,
                    `**Idade:** ${daysOld} dias`,
                    alert.notificationCount > 0 ? `**Notificações enviadas:** ${alert.notificationCount}` : null
                ].filter(Boolean).join('\n'),
                inline: false
            })
            .addFields({
                name: '💡 Dica',
                value: 'Você pode criar um novo alerta a qualquer momento usando `/alerta-mercado criar`',
                inline: false
            })
            .setTimestamp()
            .setFooter({ 
                text: 'Alertas antigos são removidos automaticamente após 30 dias de inatividade' 
            });
        
        await user.send({ embeds: [embed] });
        
        logger.info('Expiration notification sent', { 
            alertId: alert.id, 
            userId: alert.userId,
            daysOld
        });
        
        return true;
    } catch (error) {
        // User might have DMs disabled
        if (error.code === 50007) {
            logger.warn('Cannot send expiration DM to user (DMs disabled)', { userId: alert.userId });
        } else {
            logger.error('Error sending expiration notification', { 
                alertId: alert.id, 
                error: error.message 
            });
        }
        return false;
    }
}

/**
 * Cleans up old alerts (30+ days) and notifies users
 * @param {number} daysOld - Minimum age in days (default: 30)
 * @returns {Object} Cleanup statistics
 */
async function cleanupOldAlerts(daysOld = 30) {
    if (!client) {
        logger.warn('Cannot cleanup alerts - service not initialized');
        return { cleaned: 0, notified: 0, errors: 0 };
    }
    
    try {
        logger.info('Starting cleanup of old alerts', { daysOld });
        
        const oldAlerts = alertStorage.findOldAlerts(daysOld);
        
        if (oldAlerts.length === 0) {
            logger.debug('No old alerts to clean up');
            return { cleaned: 0, notified: 0, errors: 0 };
        }
        
        logger.info('Found old alerts to clean', { count: oldAlerts.length });
        
        let notified = 0;
        let errors = 0;
        const alertIdsToRemove = [];
        
        // Group alerts by user to avoid duplicate notifications
        const alertsByUser = {};
        for (const alert of oldAlerts) {
            if (!alertsByUser[alert.userId]) {
                alertsByUser[alert.userId] = [];
            }
            alertsByUser[alert.userId].push(alert);
        }
        
        // Send notifications and collect alert IDs
        for (const [userId, userAlerts] of Object.entries(alertsByUser)) {
            try {
                // Send one notification per user with all their expired alerts
                const sent = await sendBulkExpirationNotification(userId, userAlerts);
                if (sent) {
                    notified++;
                }
                
                // Collect all alert IDs for this user
                userAlerts.forEach(alert => {
                    alertIdsToRemove.push(alert.id);
                });
                
                // Small delay between users to avoid rate limiting
                await sleep(500);
            } catch (error) {
                errors++;
                logger.warn('Error processing user alerts for cleanup', {
                    userId,
                    error: error.message
                });
                // Still collect alert IDs even if notification failed
                userAlerts.forEach(alert => {
                    alertIdsToRemove.push(alert.id);
                });
            }
        }
        
        // Remove all old alerts
        const removed = alertStorage.removeAlertsByIds(alertIdsToRemove);
        
        logger.info('Cleanup completed', {
            oldAlertsFound: oldAlerts.length,
            removed,
            usersNotified: notified,
            errors
        });
        
        return {
            cleaned: removed,
            notified,
            errors
        };
    } catch (error) {
        logger.error('Error during cleanup', { error: error.message });
        return { cleaned: 0, notified: 0, errors: 1 };
    }
}

/**
 * Sends a bulk expiration notification for multiple alerts
 * @param {string} userId - User ID
 * @param {Array} alerts - Array of expired alerts
 * @returns {boolean} True if sent successfully
 */
async function sendBulkExpirationNotification(userId, alerts) {
    try {
        const user = await client.users.fetch(userId);
        
        if (!user) {
            logger.warn('Could not find user for bulk expiration notification', { userId });
            return false;
        }
        
        const { EmbedBuilder } = require('discord.js');
        
        // If only one alert, use detailed notification
        if (alerts.length === 1) {
            return await sendExpirationNotification(alerts[0]);
        }
        
        // Multiple alerts - create summary
        const embed = new EmbedBuilder()
            .setColor('#ff6b6b')
            .setTitle('⏰ Alertas Expirados')
            .setDescription(
                `**${alerts.length}** de seus alertas foram removidos automaticamente por estarem inativos há mais de 30 dias.\n\n` +
                `**Detalhes dos alertas removidos:**`
            )
            .setTimestamp();
        
        // Add each alert as a field (limit to first 10 to avoid embed size limits)
        const alertsToShow = alerts.slice(0, 10);
        const alertsList = alertsToShow.map((alert, index) => {
            const storeTypeLabel = gnjoy.getStoreTypeLabel(alert.storeType);
            const createdAt = new Date(alert.createdAt);
            const daysOld = Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
            
            return `**${index + 1}.** ${alert.searchTerm} (${storeTypeLabel}, ${alert.server})\n` +
                   `   Criado há ${daysOld} dias | ${alert.notificationCount || 0} notificação(ões)`;
        }).join('\n\n');
        
        embed.addFields({
            name: '📋 Alertas Removidos',
            value: alertsList.substring(0, 1024),
            inline: false
        });
        
        if (alerts.length > 10) {
            embed.addFields({
                name: '\u200b',
                value: `*... e mais ${alerts.length - 10} alerta(s)*`,
                inline: false
            });
        }
        
        embed.addFields({
            name: '💡 Dica',
            value: 'Você pode criar novos alertas a qualquer momento usando `/alerta-mercado criar`',
            inline: false
        });
        
        embed.setFooter({ 
            text: 'Alertas antigos são removidos automaticamente após 30 dias de inatividade' 
        });
        
        await user.send({ embeds: [embed] });
        
        logger.info('Bulk expiration notification sent', { 
            userId,
            alertCount: alerts.length
        });
        
        return true;
    } catch (error) {
        if (error.code === 50007) {
            logger.warn('Cannot send expiration DM to user (DMs disabled)', { userId });
        } else {
            logger.error('Error sending bulk expiration notification', { 
                userId, 
                error: error.message 
            });
        }
        return false;
    }
}

/**
 * Clears the intelligent query cache (useful for manual refresh)
 */
function clearCache() {
    intelligentStrategy.clearCache();
    logger.info('Intelligent query cache cleared');
}

module.exports = {
    initialize,
    start,
    stop,
    restart,
    forceCheck,
    getStatus,
    clearCache,
    cleanupOldAlerts
};
