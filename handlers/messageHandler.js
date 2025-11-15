/**
 * Message Handler
 * Processes Discord messages and routes them to appropriate command handlers
 */

const { EmbedBuilder } = require('discord.js');
const divinePride = require('../integrations/database/divine-pride');
const wiki = require('../integrations/wikis/wikiRequests');
const settings = require('../integrations/const.json');
const parser = require('../utils/parser');
const config = require('../config');
const logger = require('../utils/logger');
const { ValidationError, CommandError } = require('../utils/errors');

class MessageHandler {
    constructor() {
        this.commands = this._initializeCommands();
    }

    /**
     * Initializes command map
     * @returns {Object} Map of command names to handler functions
     * @private
     */
    _initializeCommands() {
        return {
            'buscaritemid': this.searchItemID.bind(this),
            'wiki': this.searchWiki.bind(this),
            'buscaritem': this.searchItem.bind(this),
            'buscarmonstroid': this.getMonsterInfo.bind(this),
            'ajuda': this.showHelp.bind(this)
        };
    }

    /**
     * Main message handler
     * Parses message and routes to appropriate command
     * @param {Message} message - Discord message object
     * @returns {Promise<string|EmbedBuilder>} Response to send
     */
    async handleMessage(message) {
        const content = message.content.toLowerCase().trim();
        const args = content.slice(config.discord.prefix.length).trim().split(/\s+/);
        const commandName = args[0];

        if (!commandName) {
            throw new ValidationError('Comando não especificado', 'Por favor, especifique um comando válido.');
        }

        const command = this.commands[commandName];
        if (!command) {
            throw new ValidationError(
                `Comando desconhecido: ${commandName}`,
                `Comando "${commandName}" não encontrado. Use %ajuda para ver os comandos disponíveis.`
            );
        }

        logger.debug('Processing command', { command: commandName, args: args.slice(1) });

        try {
            return await command(args.slice(1), message);
        } catch (error) {
            logger.error('Command execution error', {
                command: commandName,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Creates an embed message for search results
     * @param {Array} messageBody - Array containing search term and results
     * @param {string} wikiType - Type of wiki (Browiki, DivinePride)
     * @returns {EmbedBuilder} Formatted embed message
     * @private
     */
    _createEmbedMessage(messageBody, wikiType) {
        const thumbnail = this._getThumbnail(wikiType);
        const searchedWord = messageBody[0] || 'Nenhum termo';
        const results = messageBody.slice(1).join('\n') || 'Nenhum resultado encontrado';

        return new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Resultado da pesquisa')
            .setThumbnail(thumbnail)
            .addFields({ 
                name: `Resultados para "${searchedWord}"`, 
                value: results 
            })
            .setTimestamp()
            .setFooter({ text: 'Desenvolvido por Zack#7458' });
    }

    /**
     * Gets thumbnail URL based on wiki type
     * @param {string} wikiType - Type of wiki
     * @returns {string} Thumbnail URL
     * @private
     */
    _getThumbnail(wikiType) {
        const thumbnailMap = {
            'Browiki': settings.assets[0].url,
            'DivinePride': settings.assets[1].url
        };
        return thumbnailMap[wikiType] || settings.assets[1].url;
    }

    /**
     * Validates required arguments
     * @param {Array} args - Command arguments
     * @param {number} requiredCount - Number of required arguments
     * @param {string} errorMessage - Error message to throw
     * @throws {ValidationError} If validation fails
     * @private
     */
    _validateArgs(args, requiredCount, errorMessage) {
        if (!args || args.length < requiredCount) {
            throw new ValidationError('Argumentos insuficientes', errorMessage);
        }
    }

    /**
     * Searches for item by ID
     * @param {Array} args - Command arguments [itemId, server]
     * @returns {Promise<string>} Item information
     */
    async searchItemID(args) {
        this._validateArgs(args, 2, 'Uso: %buscaritemid <ID> <servidor>\nExemplo: %buscaritemid 501 iro');
        
        const [itemId, server] = args;
        
        if (!/^\d+$/.test(itemId)) {
            throw new ValidationError('ID inválido', 'O ID do item deve ser um número.');
        }

        try {
            const response = await divinePride.makeItemIdRequest(itemId, server);
            return await parser.parseDatabaseResponse(response, itemId);
        } catch (error) {
            logger.error('Error searching item by ID', { itemId, server, error: error.message });
            throw new CommandError('Erro ao buscar item por ID', 'Não foi possível obter informações do item.');
        }
    }

    /**
     * Searches for item by name
     * @param {Array} args - Command arguments [itemName, server]
     * @param {Message} message - Discord message object
     * @returns {Promise<EmbedBuilder>} Embed with search results
     */
    async searchItem(args, message) {
        this._validateArgs(args, 2, 'Uso: %buscaritem <nome> <servidor>\nExemplo: %buscaritem Poring iro');
        
        const server = args[args.length - 1]; // Last argument is server
        const searchTerm = args.slice(0, -1).join(' '); // Join all args except last (server)

        try {
            const body = await divinePride.makeSearchQuery(searchTerm, server);
            const parsedBody = await parser.parseDatabaseBodyResponse(searchTerm, body);
            return this._createEmbedMessage(parsedBody, 'DivinePride');
        } catch (error) {
            logger.error('Error searching item', { searchTerm, server, error: error.message });
            throw new CommandError('Erro ao buscar item', 'Não foi possível buscar o item solicitado.');
        }
    }

    /**
     * Searches wiki for information
     * @param {Array} args - Command arguments [searchTerm]
     * @returns {Promise<EmbedBuilder>} Embed with search results
     */
    async searchWiki(args) {
        this._validateArgs(args, 1, 'Uso: %wiki <termo>\nExemplo: %wiki Poring');
        
        const searchTerm = args.join(' ');

        try {
            const response = await wiki.makeRequest(searchTerm, 'wiki');
            const parsedResponse = parser.parseWikiResponse(response);
            return this._createEmbedMessage(parsedResponse, 'Browiki');
        } catch (error) {
            logger.error('Error searching wiki', { searchTerm, error: error.message });
            throw new CommandError('Erro ao buscar na wiki', 'Não foi possível buscar na wiki.');
        }
    }

    /**
     * Gets monster information by ID
     * @param {Array} args - Command arguments [monsterId]
     * @returns {Promise<string>} Monster information
     */
    async getMonsterInfo(args) {
        this._validateArgs(args, 1, 'Uso: %buscarmonstroid <ID>\nExemplo: %buscarmonstroid 1002');
        
        const monsterId = args[0];
        
        if (!/^\d+$/.test(monsterId)) {
            throw new ValidationError('ID inválido', 'O ID do monstro deve ser um número.');
        }

        try {
            const response = await divinePride.monsterSearch(monsterId);
            // TODO: Implement proper parsing when feature is complete
            return 'Funcionalidade em desenvolvimento.';
        } catch (error) {
            logger.error('Error searching monster', { monsterId, error: error.message });
            throw new CommandError('Erro ao buscar monstro', 'Não foi possível obter informações do monstro.');
        }
    }

    /**
     * Shows help message
     * @returns {string} Help message
     */
    showHelp() {
        return 'Acesse https://github.com/Zack-Correa/RagWikiBot/blob/dev/README_PT-BR.md para ler os comandos disponíveis!';
    }
}

module.exports = MessageHandler;
