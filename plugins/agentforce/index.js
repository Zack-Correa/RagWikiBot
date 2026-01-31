/**
 * Agentforce Plugin
 * AI Assistant using Salesforce Agentforce for RAG-based searches
 * Responds to natural language questions about Ragnarok Online
 */

const agentforceClient = require('./client');
const messageHandler = require('./messageHandler');
const sessionManager = require('./sessionManager');

let pluginLogger = null;
let discordClient = null;
let config = null;

/**
 * Called when plugin is loaded
 */
function onLoad(context) {
    pluginLogger = context.logger;
    config = context.config || {};
    context.logger.info('Agentforce plugin loaded');
}

/**
 * Called when plugin is enabled
 */
function onEnable(context) {
    discordClient = context.getClient();
    
    if (!discordClient) {
        context.logger.error('Discord client not available');
        return;
    }
    
    // Check if credentials are configured
    const clientId = process.env.SALESFORCE_CLIENT_ID;
    const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
    const instanceUrl = process.env.SALESFORCE_INSTANCE_URL;
    const agentId = process.env.AGENTFORCE_AGENT_ID;
    
    if (!clientId || !clientSecret || !instanceUrl || !agentId) {
        context.logger.warn('Agentforce credentials not configured. Set SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET, SALESFORCE_INSTANCE_URL, and AGENTFORCE_AGENT_ID in .env');
    }
    
    // Initialize components
    agentforceClient.initialize({
        clientId,
        clientSecret,
        instanceUrl,
        agentId
    });
    
    messageHandler.initialize(discordClient, {
        triggerOnMention: config.triggerOnMention !== false,
        triggerOnDM: config.triggerOnDM !== false,
        allowedChannels: config.allowedChannels || [],
        logger: pluginLogger
    });
    
    sessionManager.initialize({
        timeoutMinutes: config.sessionTimeoutMinutes || 30,
        logger: pluginLogger
    });
    
    context.logger.info('Agentforce plugin enabled');
}

/**
 * Called when plugin is disabled
 */
function onDisable(context) {
    messageHandler.shutdown();
    sessionManager.shutdown();
    context.logger.info('Agentforce plugin disabled');
}

/**
 * Called when plugin is unloaded
 */
function onUnload(context) {
    messageHandler.shutdown();
    sessionManager.shutdown();
    context.logger.info('Agentforce plugin unloaded');
}

// No slash commands - this plugin responds to mentions and DMs
const commands = {};

// Event handlers
const events = {
    messageCreate: (message) => messageHandler.handleMessage(message)
};

// Export plugin interface
module.exports = {
    onLoad,
    onEnable,
    onDisable,
    onUnload,
    commands,
    events,
    
    // Public API for external access
    api: {
        // Client functions
        authenticate: agentforceClient.authenticate,
        sendMessage: agentforceClient.sendMessage,
        
        // Session functions
        getSession: sessionManager.getSession,
        createSession: sessionManager.createSession,
        clearSession: sessionManager.clearSession,
        
        // Status
        isConfigured: () => {
            return !!(
                process.env.SALESFORCE_CLIENT_ID &&
                process.env.SALESFORCE_CLIENT_SECRET &&
                process.env.SALESFORCE_INSTANCE_URL &&
                process.env.AGENTFORCE_AGENT_ID
            );
        }
    }
};
