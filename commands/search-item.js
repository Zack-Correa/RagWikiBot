/**
 * Slash Command: /buscar-item
 * Searches for items by name in the Divine Pride database
 */

const { SlashCommandBuilder } = require('discord.js');
const divinePride = require('../integrations/database/divine-pride');
const settings = require('../integrations/const.json');
const parser = require('../utils/parser');
const logger = require('../utils/logger');
const { ValidationError, CommandError } = require('../utils/errors');
const { createPaginatedEmbed, setupPagination } = require('../utils/pagination');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buscar-item')
        .setDescription('Busca itens pelo nome no banco de dados Divine Pride')
        .addStringOption(option =>
            option
                .setName('nome')
                .setDescription('Nome do item')
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

        const searchTerm = interaction.options.getString('nome');
        const server = interaction.options.getString('servidor');

        try {
            const body = await divinePride.makeSearchQuery(searchTerm, server);
            const parsedBody = await parser.parseDatabaseBodyResponse(searchTerm, body);
            
            const thumbnail = settings.assets[1].url;
            const searchedWord = parsedBody[0] || 'Nenhum termo';
            const results = parsedBody.slice(1); // Remove search term, keep all results

            // Separate search URL from results
            const searchURL = results[results.length - 1]; // Last element is the search URL
            const itemResults = results.slice(0, -1); // All items except the URL

            if (itemResults.length === 0) {
                // No results found
                const { EmbedBuilder } = require('discord.js');
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Resultado da pesquisa')
                    .setThumbnail(thumbnail)
                    .addFields({ 
                        name: `Resultados para "${searchedWord}"`, 
                        value: 'Nenhum resultado encontrado'
                    })
                    .addFields({
                        name: '\u200b',
                        value: '*Conteúdo fornecido por [Divine Pride](https://www.divine-pride.net)*'
                    })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Create paginated embed (10 items per page)
            const paginationData = createPaginatedEmbed({
                items: itemResults,
                itemsPerPage: 10,
                title: 'Resultado da pesquisa',
                thumbnail: thumbnail,
                searchTerm: searchedWord,
                searchURL: searchURL,
                timeout: 180000 // 3 minutes
            });

            // Send the message
            const reply = await interaction.editReply({ embeds: [paginationData.embed] });
            
            // Set up pagination if there are multiple pages
            if (paginationData.totalPages > 1) {
                await setupPagination(reply, paginationData);
            }

            return;
        } catch (error) {
            logger.error('Error searching item', { searchTerm, server, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply('❌ Não foi possível buscar o item solicitado.');
        }
    }
};

