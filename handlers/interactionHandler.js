/**
 * Interaction Handler
 * Handles Discord slash command interactions, buttons, and autocomplete
 */

const { Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const metricsService = require('../services/metricsService');

// Lazy load party service to avoid circular dependencies
let partyService = null;
function getPartyService() {
    if (!partyService) {
        partyService = require('../services/partyService');
    }
    return partyService;
}

class InteractionHandler {
    constructor() {
        this.commands = new Collection();
        this._loadCommands();
    }

    /**
     * Loads all command files from the commands directory
     * @private
     */
    _loadCommands() {
        const commandsPath = path.join(__dirname, '..', 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);

            if ('data' in command && 'execute' in command) {
                this.commands.set(command.data.name, command);
                logger.debug('Command loaded', { command: command.data.name });
            } else {
                logger.warn('Command file missing required properties', { file });
            }
        }

        logger.info('Commands loaded', { count: this.commands.size });
    }

    /**
     * Handles an interaction
     * @param {Interaction} interaction - Discord interaction object
     */
    async handleInteraction(interaction) {
        // Handle autocomplete
        if (interaction.isAutocomplete()) {
            return this._handleAutocomplete(interaction);
        }
        
        // Handle buttons
        if (interaction.isButton()) {
            return this._handleButton(interaction);
        }
        
        // Handle slash commands
        if (!interaction.isChatInputCommand()) return;

        const command = this.commands.get(interaction.commandName);

        if (!command) {
            logger.warn('Unknown command', { commandName: interaction.commandName });
            return;
        }

        // Start timing for metrics
        const startTime = Date.now();
        let hasError = false;

        try {
            logger.info('Executing command', {
                command: interaction.commandName,
                user: interaction.user.tag,
                guild: interaction.guild?.name || 'DM'
            });

            await command.execute(interaction);
        } catch (error) {
            hasError = true;
            logger.error('Error executing command', {
                command: interaction.commandName,
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag
            });

            const errorMessage = '❌ Ocorreu um erro ao executar este comando.';

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(errorMessage).catch(() => {
                    // Ignore errors if interaction already handled
                });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {
                    // Ignore errors if interaction already handled
                });
            }
        } finally {
            // Record metrics regardless of success/failure
            metricsService.recordCommandExecution({
                command: interaction.commandName,
                userId: interaction.user.id,
                guildId: interaction.guild?.id || null,
                startTime,
                error: hasError
            });
        }
    }

    /**
     * Handles autocomplete interactions
     * @param {Interaction} interaction - Autocomplete interaction
     * @private
     */
    async _handleAutocomplete(interaction) {
        const command = this.commands.get(interaction.commandName);
        
        if (!command || !command.autocomplete) {
            return;
        }
        
        try {
            await command.autocomplete(interaction);
        } catch (error) {
            logger.error('Error handling autocomplete', { 
                command: interaction.commandName,
                error: error.message 
            });
        }
    }

    /**
     * Handles button interactions
     * @param {Interaction} interaction - Button interaction
     * @private
     */
    async _handleButton(interaction) {
        const customId = interaction.customId;
        
        try {
            // Handle party buttons (using : as delimiter)
            if (customId.startsWith('party:')) {
                const handled = await getPartyService().handlePartyButton(interaction);
                if (handled) return;
            }
            
            // Add other button handlers here as needed
            
            logger.debug('Unhandled button interaction', { customId });
            
        } catch (error) {
            logger.error('Error handling button', { 
                customId,
                error: error.message 
            });
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: '❌ Erro ao processar ação.',
                    ephemeral: true 
                }).catch(() => {});
            }
        }
    }

    /**
     * Gets all command data for registration
     * @returns {Array} Array of command data
     */
    getCommandsData() {
        return Array.from(this.commands.values()).map(command => command.data.toJSON());
    }
}

module.exports = InteractionHandler;

