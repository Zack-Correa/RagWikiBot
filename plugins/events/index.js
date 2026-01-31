/**
 * Events Plugin
 * Shows news and events from GNJoy LATAM with automatic scraping
 */

const path = require('path');

// Reference the existing integration files (shared code)
const gnjoyEvents = require('../../integrations/database/gnjoy-events');
const eventsStorage = require('../../utils/eventsStorage');
const eventsCommand = require('./command');

let pluginLogger = null;
let discordClient = null;
let checkIntervalId = null;
let scrapeIntervalId = null;

// Check interval (5 minutes)
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Scrape interval (1 hour)
const SCRAPE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Called when plugin is loaded
 */
function onLoad(context) {
    pluginLogger = context.logger;
    context.logger.info('Events plugin loaded');
}

/**
 * Called when plugin is enabled
 */
function onEnable(context) {
    discordClient = context.getClient();
    
    if (discordClient) {
        // Run first check after 1 minute
        setTimeout(checkPendingNotifications, 60000);
        
        // Then run at interval
        checkIntervalId = setInterval(checkPendingNotifications, CHECK_INTERVAL_MS);
        
        // Run scrape every hour
        scrapeIntervalId = setInterval(scrapeGNJoy, SCRAPE_INTERVAL_MS);
        
        // Initial scrape after 2 minutes
        setTimeout(scrapeGNJoy, 120000);
    }
    
    context.logger.info('Events plugin enabled', {
        checkIntervalMinutes: CHECK_INTERVAL_MS / 60000,
        scrapeIntervalMinutes: SCRAPE_INTERVAL_MS / 60000
    });
}

/**
 * Called when plugin is disabled
 */
function onDisable(context) {
    if (checkIntervalId) {
        clearInterval(checkIntervalId);
        checkIntervalId = null;
    }
    
    if (scrapeIntervalId) {
        clearInterval(scrapeIntervalId);
        scrapeIntervalId = null;
    }
    
    context.logger.info('Events plugin disabled');
}

/**
 * Called when plugin is unloaded
 */
function onUnload(context) {
    if (checkIntervalId) {
        clearInterval(checkIntervalId);
        checkIntervalId = null;
    }
    if (scrapeIntervalId) {
        clearInterval(scrapeIntervalId);
        scrapeIntervalId = null;
    }
    context.logger.info('Events plugin unloaded');
}

/**
 * Checks and sends pending notifications
 */
async function checkPendingNotifications() {
    if (!discordClient) {
        return;
    }
    
    try {
        const pending = eventsStorage.getPendingNotifications();
        
        if (pending.length === 0) {
            return;
        }
        
        if (pluginLogger) {
            pluginLogger.info('Processing pending notifications', { count: pending.length });
        }
        
        const { EmbedBuilder } = require('discord.js');
        
        for (const notification of pending) {
            try {
                await sendNotification(notification, EmbedBuilder);
                eventsStorage.markNotified(notification.subscription.id);
            } catch (error) {
                if (pluginLogger) {
                    pluginLogger.error('Error sending event notification', {
                        subscriptionId: notification.subscription.id,
                        error: error.message
                    });
                }
            }
            
            // Small delay between notifications
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
    } catch (error) {
        if (pluginLogger) {
            pluginLogger.error('Error checking pending notifications', { error: error.message });
        }
    }
}

/**
 * Sends a notification to a user
 */
async function sendNotification(notification, EmbedBuilder) {
    const { subscription, event, minutesUntilStart } = notification;
    
    try {
        const user = await discordClient.users.fetch(subscription.userId);
        
        if (!user) {
            return;
        }
        
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
        
        if (pluginLogger) {
            pluginLogger.info('Event notification sent', {
                userId: subscription.userId,
                eventId: event.id,
                eventTitle: event.title
            });
        }
        
    } catch (error) {
        if (error.code === 50007) {
            if (pluginLogger) {
                pluginLogger.warn('Cannot send DM to user (DMs disabled)', { userId: subscription.userId });
            }
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
        if (pluginLogger) {
            pluginLogger.info('Starting GNJoy event scrape...');
        }
        const result = await gnjoyEvents.syncEvents();
        
        if (result.added > 0 && pluginLogger) {
            pluginLogger.info('New events found from GNJoy', { added: result.added });
        }
        
    } catch (error) {
        if (pluginLogger) {
            pluginLogger.error('Error scraping GNJoy events', { error: error.message });
        }
    }
}

/**
 * Formats date/time
 */
function formatDateTime(date) {
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Export command
const commands = {
    'eventos': {
        data: eventsCommand.data,
        execute: eventsCommand.execute
    }
};

// Export plugin interface
module.exports = {
    onLoad,
    onEnable,
    onDisable,
    onUnload,
    commands,
    events: {},
    
    // Public API
    api: {
        getLatestNews: gnjoyEvents.getLatestNews,
        categorizeNews: gnjoyEvents.categorizeNews,
        getNewsCacheInfo: gnjoyEvents.getNewsCacheInfo,
        forceRefreshNews: gnjoyEvents.forceRefreshNews,
        getStatus: () => {
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
    }
};
