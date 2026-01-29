/**
 * Main application entry point for RagWiki Discord Bot
 * Handles bot initialization, event listeners, and error handling
 */

const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const InteractionHandler = require('./handlers/interactionHandler');
const marketAlertService = require('./services/marketAlertService');
const partyService = require('./services/partyService');
const webServer = require('./web/server');
const config = require('./config');
const logger = require('./utils/logger');

// Initialize Discord client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions, // Needed for pagination reactions
        GatewayIntentBits.DirectMessages // Needed for sending DM alerts
    ]
});

// Initialize interaction handler
const interactionHandler = new InteractionHandler();

/**
 * Handles bot ready event
 * Sets up presence and logs successful connection
 * Supports both new (clientReady) and legacy (ready) events for compatibility
 */
const handleReady = () => {
    logger.info(`Bot logged in as ${client.user.tag}`, {
        userId: client.user.id,
        guilds: client.guilds.cache.size,
        commands: interactionHandler.commands.size
    });

    // Set bot presence
    const activityType = ActivityType[config.discord.presence.type] || ActivityType.Streaming;
    client.user.setPresence({
        activities: [{
            name: config.discord.presence.activity,
            type: activityType,
            url: config.discord.presence.url
        }],
        status: 'online'
    });

    // Initialize and start the market alert service
    marketAlertService.initialize(client);
    marketAlertService.start();
    logger.info('Market alert service started');

    // Initialize party service for instance groups
    partyService.initialize(client);
    logger.info('Party service started');

    // Start admin web panel if password is configured
    const adminPort = process.env.ADMIN_PORT || 3000;
    const adminHost = process.env.ADMIN_HOST || '0.0.0.0';
    if (process.env.ADMIN_PASSWORD) {
        // Pass Discord client to web server for user lookups
        webServer.setDiscordClient(client);
        webServer.start(adminPort, adminHost).catch(error => {
            logger.error('Failed to start admin panel', { error: error.message });
        });
    } else {
        logger.warn('ADMIN_PASSWORD not set - admin panel disabled');
    }
};

// Support both new (clientReady) and legacy (ready) events
client.once('clientReady', handleReady);

/**
 * Handles interaction events (slash commands)
 */
client.on('interactionCreate', async (interaction) => {
    await interactionHandler.handleInteraction(interaction);
});

/**
 * Handles client errors
 */
client.on('error', (error) => {
    logger.error('Discord client error', { error: error.message, stack: error.stack });
});

/**
 * Handles process errors
 */
process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection', { error: error.message, stack: error.stack });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    marketAlertService.stop();
    partyService.shutdown();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    marketAlertService.stop();
    partyService.shutdown();
    client.destroy();
    process.exit(0);
});

// Login to Discord
client.login(config.discord.token).catch((error) => {
    logger.error('Failed to login to Discord', { error: error.message });
    process.exit(1);
});
