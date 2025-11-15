/**
 * Slash Command: /buscar-item-id
 * Searches for an item by ID in the Divine Pride database
 */

const { SlashCommandBuilder } = require('discord.js');
const divinePride = require('../integrations/database/divine-pride');
const parser = require('../utils/parser');
const logger = require('../utils/logger');
const { ValidationError, CommandError } = require('../utils/errors');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buscar-item-id')
        .setDescription('Busca um item pelo ID no banco de dados Divine Pride')
        .addStringOption(option =>
            option
                .setName('id')
                .setDescription('ID do item')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('servidor')
                .setDescription('Servidor (iro, kro, bro, jro)')
                .setRequired(true)
                .addChoices(
                    { name: 'iRO', value: 'iro' },
                    { name: 'kRO', value: 'kro' },
                    { name: 'bRO', value: 'bro' },
                    { name: 'jRO', value: 'jro' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const itemId = interaction.options.getString('id');
        const server = interaction.options.getString('servidor');

        // Validate item ID
        if (!/^\d+$/.test(itemId)) {
            return interaction.editReply('❌ O ID do item deve ser um número.');
        }

        try {
            const response = await divinePride.makeItemIdRequest(itemId, server);
            const result = await parser.parseDatabaseResponse(response, itemId);
            const resultWithCredit = `${result}\n\n*Conteúdo fornecido por Divine Pride (https://www.divine-pride.net)*`;
            return interaction.editReply(resultWithCredit);
        } catch (error) {
            logger.error('Error searching item by ID', { itemId, server, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply('❌ Não foi possível obter informações do item.');
        }
    }
};

