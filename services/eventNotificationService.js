/**
 * Event Notification Service
 * Handles sending notifications for upcoming events
 */

const logger = require('../utils/logger');
const eventsStorage = require('../utils/eventsStorage');
const gnjoyEvents = require('../integrations/database/gnjoy-events');
const { sleep } = require('../utils/helpers');

// Check interval (5 minutes)
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Scrape interval (1 hour)
const SCRAPE_INTERVAL_MS = 60 * 60 * 1000;

let client = null;
let checkIntervalId = null;
let scrapeIntervalId = null;

/**
 * Initializes the event notification service
 * @param {Client} discordClient - Discord client
 */
function initialize(discordClient) {
    client = discordClient;
    logger.info('Event notification service initialized');
}

/**
 * Starts the service
 */
function start() {
    if (checkIntervalId) {
        logger.warn('Event notification service already running');
        return;
    }
    
    // Run first check after 1 minute
    setTimeout(checkPendingNotifications, 60000);
    
    // Then run at interval
    checkIntervalId = setInterval(checkPendingNotifications, CHECK_INTERVAL_MS);
    
    // Run scrape every hour
    scrapeIntervalId = setInterval(scrapeGNJoy, SCRAPE_INTERVAL_MS);
    
    // Initial scrape after 2 minutes
    setTimeout(scrapeGNJoy, 120000);
    
    logger.info('Event notification service started', {
        checkIntervalMinutes: CHECK_INTERVAL_MS / 60000,
        scrapeIntervalMinutes: SCRAPE_INTERVAL_MS / 60000
    });
}

/**
 * Stops the service
 */
function stop() {
    if (checkIntervalId) {
        clearInterval(checkIntervalId);
        checkIntervalId = null;
    }
    
    if (scrapeIntervalId) {
        clearInterval(scrapeIntervalId);
        scrapeIntervalId = null;
    }
    
    logger.info('Event notification service stopped');
}

/**
 * Checks and sends pending notifications
 */
async function checkPendingNotifications() {
    if (!client) {
        logger.warn('Discord client not available for notifications');
        return;
    }
    
    try {
        const pending = eventsStorage.getPendingNotifications();
        
        if (pending.length === 0) {
            return;
        }
        
        logger.info('Processing pending notifications', { count: pending.length });
        
        for (const notification of pending) {
            try {
                await sendNotification(notification);
                eventsStorage.markNotified(notification.subscription.id);
            } catch (error) {
                logger.error('Error sending event notification', {
                    subscriptionId: notification.subscription.id,
                    error: error.message
                });
            }
            
            // Small delay between notifications
            await sleep(1000);
        }
        
    } catch (error) {
        logger.error('Error checking pending notifications', { error: error.message });
    }
}

/**
 * Sends a notification to a user
 * @param {Object} notification - Notification data
 */
async function sendNotification(notification) {
    const { subscription, event, minutesUntilStart } = notification;
    
    try {
        const user = await client.users.fetch(subscription.userId);
        
        if (!user) {
            logger.warn('User not found for notification', { userId: subscription.userId });
            return;
        }
        
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setColor('#F5A623')
            .setTitle('🎮 Lembrete de Evento!')
            .setDescription(`O evento **${event.title}** está prestes a começar!`)
            .addFields({
                name: '⏰ Início em',
                value: `**${minutesUntilStart}** minutos`,
                inline: true
            })
            .setTimestamp();
        
        if (event.description) {
            embed.addFields({
                name: '📋 Descrição',
                value: event.description.substring(0, 500),
                inline: false
            });
        }
        
        const startDate = new Date(event.startDate);
        const endDate = new Date(event.endDate);
        
        embed.addFields({
            name: '📅 Período',
            value: `${formatDateTime(startDate)} - ${formatDateTime(endDate)}`,
            inline: false
        });
        
        if (event.sourceUrl) {
            embed.addFields({
                name: '🔗 Link',
                value: `[Ver no site](${event.sourceUrl})`,
                inline: true
            });
        }
        
        embed.setFooter({ text: 'BeeWiki • Notificação de Evento' });
        
        await user.send({ embeds: [embed] });
        
        logger.info('Event notification sent', {
            userId: subscription.userId,
            eventId: event.id,
            eventTitle: event.title
        });
        
    } catch (error) {
        if (error.code === 50007) {
            logger.warn('Cannot send DM to user (DMs disabled)', { userId: subscription.userId });
        } else {
            throw error;
        }
    }
}

/**
 * Scrapes GNJoy for new events
 */
async function scrapeGNJoy() {
    try {
        logger.info('Starting GNJoy event scrape...');
        const result = await gnjoyEvents.syncEvents();
        
        if (result.added > 0) {
            logger.info('New events found from GNJoy', { added: result.added });
        }
        
    } catch (error) {
        logger.error('Error scraping GNJoy events', { error: error.message });
    }
}

/**
 * Forces an immediate scrape
 * @returns {Promise<Object>} Scrape result
 */
async function forceScrape() {
    return await gnjoyEvents.syncEvents();
}

/**
 * Gets service status
 * @returns {Object} Status info
 */
function getStatus() {
    const stats = eventsStorage.getStats();
    const scrapeStatus = gnjoyEvents.getStatus();
    
    return {
        running: !!checkIntervalId,
        checkIntervalMinutes: CHECK_INTERVAL_MS / 60000,
        scrapeIntervalMinutes: SCRAPE_INTERVAL_MS / 60000,
        ...stats,
        ...scrapeStatus
    };
}

/**
 * Formats date/time
 * @param {Date} date - Date to format
 * @returns {string} Formatted date/time
 */
function formatDateTime(date) {
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

module.exports = {
    initialize,
    start,
    stop,
    checkPendingNotifications,
    scrapeGNJoy,
    forceScrape,
    getStatus
};
