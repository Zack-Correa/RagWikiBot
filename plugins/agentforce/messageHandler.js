/**
 * Message Handler
 * Listens for Discord messages and processes them with Agentforce
 */

const agentforceClient = require('./client');
const sessionManager = require('./sessionManager');
const actions = require('./actions');
const embedBuilder = require('./embedBuilder');

let discordClient = null;
let config = {
    triggerOnMention: true,
    triggerOnDM: true,
    allowedChannels: [],
    logger: console
};

let isInitialized = false;

/**
 * Initialize the message handler
 * @param {Client} client - Discord client
 * @param {Object} options - Configuration options
 */
function initialize(client, options = {}) {
    discordClient = client;
    config = { ...config, ...options };
    isInitialized = true;
    config.logger.info('Agentforce message handler initialized');
}

/**
 * Shutdown the message handler
 */
function shutdown() {
    isInitialized = false;
    config.logger.info('Agentforce message handler shutdown');
}

/**
 * Check if a message should be processed
 * @param {Message} message - Discord message
 * @returns {boolean} True if should process
 */
function shouldProcess(message) {
    // Ignore bot messages
    if (message.author.bot) return false;
    
    // Check if initialized
    if (!isInitialized || !discordClient) return false;
    
    // Check if Agentforce is configured
    if (!agentforceClient.isConfigured()) return false;
    
    // Check DM
    if (!message.guild) {
        return config.triggerOnDM;
    }
    
    // Check mention
    if (config.triggerOnMention && message.mentions.has(discordClient.user)) {
        return true;
    }
    
    // Check allowed channels
    if (config.allowedChannels.length > 0) {
        return config.allowedChannels.includes(message.channel.id);
    }
    
    return false;
}

/**
 * Extract the actual message content (remove bot mention)
 * @param {Message} message - Discord message
 * @returns {string} Cleaned message content
 */
function extractContent(message) {
    let content = message.content;
    
    // Remove bot mention
    if (discordClient?.user?.id) {
        content = content.replace(new RegExp(`<@!?${discordClient.user.id}>`, 'g'), '');
    }
    
    return content.trim();
}

/**
 * Handle an incoming message
 * @param {Message} message - Discord message
 */
async function handleMessage(message) {
    // Check if should process
    if (!shouldProcess(message)) return;
    
    const content = extractContent(message);
    
    // Ignore empty messages
    if (!content) {
        await message.reply('Olá! Como posso ajudar? Faça uma pergunta sobre Ragnarok Online.');
        return;
    }
    
    // Start typing indicator
    await message.channel.sendTyping();
    
    // Keep typing active during processing
    const typingInterval = setInterval(() => {
        message.channel.sendTyping().catch(() => {});
    }, 8000);
    
    try {
        // Get or create session for this user
        let session = sessionManager.getSession(message.author.id);
        
        if (!session) {
            try {
                const newSession = await agentforceClient.startSession({
                    externalKey: `discord_${message.author.id}_${Date.now()}`
                });
                session = sessionManager.createSession(message.author.id, newSession);
            } catch (error) {
                config.logger.error('Failed to create Agentforce session', { error: error.message });
                await message.reply('Desculpe, não consegui iniciar uma sessão. Tente novamente mais tarde.');
                return;
            }
        }
        
        // Send message to Agentforce
        let response;
        try {
            response = await agentforceClient.sendMessage(session.sessionId, content);
        } catch (error) {
            config.logger.error('Failed to get Agentforce response', { error: error.message });
            
            // Session may have expired, try to create new one
            sessionManager.clearSession(message.author.id);
            
            await message.reply('Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente.');
            return;
        }
        
        // Process response
        if (response.action && actions.hasAction(response.action)) {
            // Execute the action
            const actionResult = await actions.executeAction(response.action, response.params);
            
            // Build response with action result
            const embeds = embedBuilder.buildResponse(response.text, actionResult);
            
            await message.reply({
                content: response.text || undefined,
                embeds: embeds.length > 0 ? embeds : undefined
            });
        } else if (response.text) {
            // Just text response
            // Split long messages
            const chunks = splitMessage(response.text, 2000);
            
            for (let i = 0; i < chunks.length; i++) {
                if (i === 0) {
                    await message.reply(chunks[i]);
                } else {
                    await message.channel.send(chunks[i]);
                }
            }
        } else {
            // No useful response
            await message.reply('Desculpe, não entendi sua pergunta. Pode reformular?');
        }
        
    } catch (error) {
        config.logger.error('Error handling message', { 
            error: error.message,
            userId: message.author.id
        });
        
        await message.reply('Ocorreu um erro inesperado. Por favor, tente novamente.');
    } finally {
        clearInterval(typingInterval);
    }
}

/**
 * Split a message into chunks for Discord's character limit
 * @param {string} text - Text to split
 * @param {number} maxLength - Maximum length per chunk
 * @returns {Array<string>} Array of chunks
 */
function splitMessage(text, maxLength = 2000) {
    if (text.length <= maxLength) return [text];
    
    const chunks = [];
    let remaining = text;
    
    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }
        
        // Find a good break point
        let breakPoint = remaining.lastIndexOf('\n', maxLength);
        if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
            breakPoint = remaining.lastIndexOf(' ', maxLength);
        }
        if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
            breakPoint = maxLength;
        }
        
        chunks.push(remaining.substring(0, breakPoint));
        remaining = remaining.substring(breakPoint).trim();
    }
    
    return chunks;
}

/**
 * Handle a message without going through Agentforce
 * Directly execute an action (for testing or fallback)
 * @param {Message} message - Discord message
 * @param {string} actionName - Action to execute
 * @param {Object} params - Action parameters
 */
async function handleDirectAction(message, actionName, params) {
    await message.channel.sendTyping();
    
    try {
        const result = await actions.executeAction(actionName, params);
        const embeds = embedBuilder.buildResponse('', result);
        
        if (result.error) {
            await message.reply(`Erro: ${result.error}`);
        } else {
            await message.reply({ embeds });
        }
    } catch (error) {
        await message.reply(`Erro ao executar ação: ${error.message}`);
    }
}

module.exports = {
    initialize,
    shutdown,
    handleMessage,
    handleDirectAction,
    shouldProcess,
    extractContent
};
