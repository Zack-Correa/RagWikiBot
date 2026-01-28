/**
 * Deploy Service
 * Handles Discord slash command deployment (global and per-guild)
 */

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

const DEPLOY_STATE_FILE = path.join(__dirname, '..', 'data', 'deploy-state.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

let discordClient = null;
let commandsCache = null;

/**
 * Ensures the data directory exists
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Loads the deployment state
 * @returns {Object} Deployment state
 */
function loadDeployState() {
    ensureDataDir();
    
    try {
        if (fs.existsSync(DEPLOY_STATE_FILE)) {
            const data = fs.readFileSync(DEPLOY_STATE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading deploy state', { error: error.message });
    }
    
    return {
        global: {
            deployed: false,
            commands: [],
            lastDeployedAt: null
        },
        guilds: {}
    };
}

/**
 * Saves the deployment state
 * @param {Object} state - Deployment state
 */
function saveDeployState(state) {
    ensureDataDir();
    
    try {
        fs.writeFileSync(DEPLOY_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
        logger.debug('Deploy state saved');
    } catch (error) {
        logger.error('Error saving deploy state', { error: error.message });
        throw error;
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
 * Gets all available commands
 * @returns {Array} Array of command data
 */
function getAvailableCommands() {
    if (commandsCache) {
        return commandsCache;
    }
    
    const commands = [];
    const commandsPath = path.join(__dirname, '..', 'commands');
    
    try {
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            // Clear require cache to get fresh command data
            delete require.cache[require.resolve(filePath)];
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                commands.push({
                    name: command.data.name,
                    description: command.data.description,
                    file: file
                });
            }
        }
        
        commandsCache = commands;
    } catch (error) {
        logger.error('Error loading commands', { error: error.message });
    }
    
    return commands;
}

/**
 * Gets command data for deployment
 * @param {Array<string>} commandNames - Optional list of command names to include
 * @returns {Array} Array of command JSON data
 */
function getCommandsData(commandNames = null) {
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commands = [];
    
    try {
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            delete require.cache[require.resolve(filePath)];
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                // If commandNames is provided, only include specified commands
                if (!commandNames || commandNames.includes(command.data.name)) {
                    commands.push(command.data.toJSON());
                }
            }
        }
    } catch (error) {
        logger.error('Error getting commands data', { error: error.message });
    }
    
    return commands;
}

/**
 * Validates that clientId is configured
 * @throws {Error} If clientId is not set
 */
function validateClientId() {
    if (!config.discord.clientId) {
        throw new Error('CLIENT_ID não está configurado no arquivo .env. Adicione CLIENT_ID=seu_id_aqui');
    }
}

/**
 * Creates a REST instance for API calls
 * @returns {REST} REST instance
 */
function createRest() {
    return new REST({ version: '10' }).setToken(config.discord.token);
}

/**
 * Deploys commands globally
 * @param {Array<string>} commandNames - Optional list of command names (null = all)
 * @returns {Object} Result
 */
async function deployGlobal(commandNames = null) {
    validateClientId();
    
    const rest = createRest();
    const commands = getCommandsData(commandNames);
    
    if (commands.length === 0) {
        throw new Error('Nenhum comando encontrado para deploy');
    }
    
    logger.info('Deploying commands globally', { count: commands.length });
    
    try {
        const data = await rest.put(
            Routes.applicationCommands(config.discord.clientId),
            { body: commands }
        );
        
        // Update state
        const state = loadDeployState();
        state.global = {
            deployed: true,
            commands: commands.map(c => c.name),
            lastDeployedAt: new Date().toISOString()
        };
        saveDeployState(state);
        
        logger.info('Global commands deployed', { count: data.length });
        
        return {
            success: true,
            count: data.length,
            commands: commands.map(c => c.name)
        };
    } catch (error) {
        logger.error('Error deploying global commands', { error: error.message });
        throw error;
    }
}

/**
 * Deploys commands to a specific guild
 * @param {string} guildId - Guild ID
 * @param {Array<string>} commandNames - Optional list of command names (null = all)
 * @returns {Object} Result
 */
async function deployToGuild(guildId, commandNames = null) {
    validateClientId();
    
    const rest = createRest();
    const commands = getCommandsData(commandNames);
    
    if (commands.length === 0) {
        throw new Error('Nenhum comando encontrado para deploy');
    }
    
    logger.info('Deploying commands to guild', { guildId, count: commands.length });
    
    try {
        const data = await rest.put(
            Routes.applicationGuildCommands(config.discord.clientId, guildId),
            { body: commands }
        );
        
        // Update state
        const state = loadDeployState();
        state.guilds[guildId] = {
            deployed: true,
            commands: commands.map(c => c.name),
            lastDeployedAt: new Date().toISOString()
        };
        saveDeployState(state);
        
        logger.info('Guild commands deployed', { guildId, count: data.length });
        
        return {
            success: true,
            count: data.length,
            commands: commands.map(c => c.name)
        };
    } catch (error) {
        logger.error('Error deploying guild commands', { guildId, error: error.message });
        throw error;
    }
}

/**
 * Removes all global commands
 * @returns {Object} Result
 */
async function clearGlobal() {
    validateClientId();
    
    const rest = createRest();
    
    logger.info('Clearing global commands');
    
    try {
        await rest.put(
            Routes.applicationCommands(config.discord.clientId),
            { body: [] }
        );
        
        // Update state
        const state = loadDeployState();
        state.global = {
            deployed: false,
            commands: [],
            lastDeployedAt: null
        };
        saveDeployState(state);
        
        logger.info('Global commands cleared');
        
        return { success: true };
    } catch (error) {
        logger.error('Error clearing global commands', { error: error.message });
        throw error;
    }
}

/**
 * Removes all commands from a specific guild
 * @param {string} guildId - Guild ID
 * @returns {Object} Result
 */
async function clearGuild(guildId) {
    validateClientId();
    
    const rest = createRest();
    
    logger.info('Clearing guild commands', { guildId });
    
    try {
        await rest.put(
            Routes.applicationGuildCommands(config.discord.clientId, guildId),
            { body: [] }
        );
        
        // Update state
        const state = loadDeployState();
        if (state.guilds[guildId]) {
            delete state.guilds[guildId];
            saveDeployState(state);
        }
        
        logger.info('Guild commands cleared', { guildId });
        
        return { success: true };
    } catch (error) {
        logger.error('Error clearing guild commands', { guildId, error: error.message });
        throw error;
    }
}

/**
 * Gets the current deployment status
 * @returns {Object} Deployment status
 */
function getDeployStatus() {
    const state = loadDeployState();
    const availableCommands = getAvailableCommands();
    const clientIdConfigured = !!config.discord.clientId;
    
    // Get guilds from Discord client
    let guilds = [];
    if (discordClient) {
        guilds = discordClient.guilds.cache.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.iconURL({ size: 64 }),
            memberCount: g.memberCount,
            deployed: state.guilds[g.id] || null
        }));
    }
    
    return {
        availableCommands,
        global: state.global,
        guilds,
        clientIdConfigured,
        clientId: clientIdConfigured ? config.discord.clientId : null
    };
}

/**
 * Fetches currently registered commands from Discord API
 * @param {string} guildId - Optional guild ID (null = global)
 * @returns {Array} Registered commands
 */
async function fetchRegisteredCommands(guildId = null) {
    validateClientId();
    
    const rest = createRest();
    
    try {
        let commands;
        if (guildId) {
            commands = await rest.get(
                Routes.applicationGuildCommands(config.discord.clientId, guildId)
            );
        } else {
            commands = await rest.get(
                Routes.applicationCommands(config.discord.clientId)
            );
        }
        
        return commands.map(c => ({
            id: c.id,
            name: c.name,
            description: c.description
        }));
    } catch (error) {
        logger.error('Error fetching registered commands', { guildId, error: error.message });
        throw error;
    }
}

module.exports = {
    setClient,
    getAvailableCommands,
    getCommandsData,
    deployGlobal,
    deployToGuild,
    clearGlobal,
    clearGuild,
    getDeployStatus,
    fetchRegisteredCommands,
    loadDeployState
};
