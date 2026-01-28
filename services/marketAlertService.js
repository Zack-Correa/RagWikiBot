/**
 * Market Alert Service
 * Runs periodic checks for market alerts and notifies users via DM
 */

const logger = require('../utils/logger');
const alertStorage = require('../utils/alertStorage');
const gnjoy = require('../integrations/database/gnjoy');

// Check interval: 5 minutes
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Cooldown between notifications for the same alert (1 hour)
const NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000;

// Delay between API requests to avoid rate limiting
const REQUEST_DELAY_MS = 2000;

let client = null;
let intervalId = null;
let isRunning = false;

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
    
    // Run first check after 1 minute to let the bot fully start
    setTimeout(() => {
        runAlertCheck();
    }, 60 * 1000);
    
    // Then run every 15 minutes
    intervalId = setInterval(() => {
        runAlertCheck();
    }, CHECK_INTERVAL_MS);
    
    logger.info('Market alert service started', { 
        intervalMinutes: CHECK_INTERVAL_MS / 60000 
    });
}

/**
 * Stops the periodic alert checking
 */
function stop() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info('Market alert service stopped');
    }
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
        
        let notificationsSent = 0;
        let errorsCount = 0;
        
        for (const group of groups) {
            try {
                // Search the market for this group
                const results = await gnjoy.searchMarket(group.searchTerm, {
                    storeType: group.storeType,
                    server: group.server
                });
                
                if (results.list && results.list.length > 0) {
                    // Process each alert in this group
                    for (const alert of group.alerts) {
                        const sent = await processAlertResults(alert, results.list);
                        if (sent) notificationsSent++;
                    }
                }
                
                // Delay between requests to avoid rate limiting
                await sleep(REQUEST_DELAY_MS);
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
            groupsChecked: groups.length,
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
 * @param {Object} alert - The alert object
 * @param {Array} items - Market items found
 * @returns {boolean} True if notification was sent
 */
async function processAlertResults(alert, items) {
    try {
        // Filter items based on alert criteria
        let matchingItems = items;
        
        // Filter by max price if specified
        if (alert.maxPrice) {
            matchingItems = matchingItems.filter(item => item.itemPrice <= alert.maxPrice);
        }
        
        // Filter by min quantity if specified
        if (alert.minQuantity) {
            matchingItems = matchingItems.filter(item => item.itemCnt >= alert.minQuantity);
        }
        
        if (matchingItems.length === 0) {
            return false;
        }
        
        // Find the lowest price in current results
        const currentLowestPrice = Math.min(...matchingItems.map(item => item.itemPrice));
        const previousLowestPrice = alert.lowestPriceSeen || alertStorage.getLowestPriceSeen(alert.id);
        
        // Check if we found a lower price than before
        const isLowerPrice = previousLowestPrice !== null && currentLowestPrice < previousLowestPrice;
        const isFirstCheck = previousLowestPrice === null;
        
        // Always update the lowest price seen for future comparisons
        if (isFirstCheck || currentLowestPrice < previousLowestPrice) {
            alertStorage.updateLowestPrice(alert.id, currentLowestPrice);
            logger.debug('Updated lowest price', {
                alertId: alert.id,
                previousLowestPrice,
                currentLowestPrice
            });
        }
        
        // Check cooldown (skip cooldown if we found a lower price)
        if (!isLowerPrice && alert.lastNotified) {
            const timeSinceNotified = Date.now() - new Date(alert.lastNotified).getTime();
            if (timeSinceNotified < NOTIFICATION_COOLDOWN_MS) {
                logger.debug('Alert in cooldown', { 
                    alertId: alert.id,
                    remainingMinutes: Math.ceil((NOTIFICATION_COOLDOWN_MS - timeSinceNotified) / 60000)
                });
                return false;
            }
        }
        
        // Send DM to user
        const sent = await sendAlertNotification(alert, matchingItems, {
            isLowerPrice,
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
            error: error.message 
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
        
        const storeTypeLabel = alert.storeType === 'BUY' ? 'Comprando' : 'Vendendo';
        
        // Different title and color if price dropped
        let title = '🔔 Alerta de Mercado!';
        let color = '#00ff00';
        let description = `Encontramos **${items.length}** resultado(s) para seu alerta!`;
        
        if (priceInfo.isLowerPrice) {
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
    return {
        running: !!intervalId,
        isChecking: isRunning,
        intervalMinutes: CHECK_INTERVAL_MS / 60000,
        cooldownMinutes: NOTIFICATION_COOLDOWN_MS / 60000,
        ...stats
    };
}

/**
 * Sleep helper
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    initialize,
    start,
    stop,
    forceCheck,
    getStatus
};
