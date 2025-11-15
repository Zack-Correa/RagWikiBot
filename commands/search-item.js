/**
 * Slash Command: /buscar-item
 * Searches for items by name in the Divine Pride database
 * Includes interactive select menu to view detailed item information
 */

const { SlashCommandBuilder } = require('discord.js');
const divinePride = require('../integrations/database/divine-pride');
const parser = require('../utils/parser');
const logger = require('../utils/logger');
const config = require('../config');
const i18n = require('../utils/i18n');
const { ValidationError, CommandError } = require('../utils/errors');
const { createPaginatedEmbed, setupPagination } = require('../utils/pagination');
const { createItemEmbed, createSearchEmbed, THUMBNAILS } = require('../utils/embedBuilder');
const { buildSelectMenuFromResults } = require('../utils/selectMenuBuilder');
const { setupItemCollector } = require('../utils/collectorHelper');
const { PATTERNS, CUSTOM_IDS, EXTRACT_PATTERNS, TIMEOUTS } = require('../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buscar-item')
        .setDescription('Busca itens por nome ou ID no banco de dados Divine Pride (servidor LATAM)')
        .addStringOption(option =>
            option
                .setName('busca')
                .setDescription('Nome ou ID do item')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('idioma')
                .setDescription('Idioma da busca (padrão: Português)')
                .setRequired(false)
                .addChoices(
                    { name: 'Português', value: 'pt' },
                    { name: 'English', value: 'en' },
                    { name: 'Español', value: 'es' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const searchTerm = interaction.options.getString('busca');
        const language = interaction.options.getString('idioma') || config.defaultLanguage;
        const t = i18n.getLanguage(language);

        try {
            // Check if search term is a numeric ID
            const isNumericId = PATTERNS.NUMERIC_ID.test(searchTerm);
            
            if (isNumericId) {
                // Search by ID - simpler response without pagination
                const response = await divinePride.makeItemIdRequest(searchTerm, language);
                const result = await parser.parseDatabaseResponse(response, searchTerm, language);
                
                const embed = createItemEmbed({
                    title: t.item.title,
                    description: result,
                    itemId: searchTerm,
                    footer: t.credits.divinePride
                });

                return interaction.editReply({ embeds: [embed] });
            }
            
            // Search by name
            const body = await divinePride.makeSearchQuery(searchTerm, language);
            const parsedBody = await parser.parseDatabaseBodyResponse(searchTerm, body, language);
            
            const searchedWord = parsedBody[0] || t.search.noResults;
            const results = parsedBody.slice(1);
            const searchURL = results[results.length - 1];
            const itemResults = results.slice(0, -1);

            if (itemResults.length === 0) {
                const embed = createSearchEmbed({
                    searchTerm: searchedWord,
                    title: t.search.titleItems,
                    source: 'divine-pride',
                    noResultsMessage: `${t.search.resultsFor} "${searchedWord}"\n${t.search.noResults}\n\n${t.credits.divinePride}`
                });

                return interaction.editReply({ embeds: [embed] });
            }

            // Create paginated embed (10 items per page)
            const paginationData = createPaginatedEmbed({
                items: itemResults,
                itemsPerPage: 10,
                title: t.search.titleItems,
                thumbnail: THUMBNAILS.DIVINE_PRIDE,
                searchTerm: searchedWord,
                searchURL: searchURL,
                language: language,
                timeout: TIMEOUTS.PAGINATION
            });

            // Create select menu using builder
            const components = [];
            const selectMenuRow = buildSelectMenuFromResults({
                results: itemResults,
                patterns: EXTRACT_PATTERNS.ITEM,
                customId: CUSTOM_IDS.ITEM_MENU,
                placeholder: t.search.selectPlaceholder,
                valuePrefix: 'item_',
                formatDescription: (item) => `ID: ${item.id}`
            });
            
            if (selectMenuRow) {
                components.push(selectMenuRow);
            }

            // Send the message with select menu
            const reply = await interaction.editReply({ 
                embeds: [paginationData.embed],
                components: components
            });
            
            // Set up pagination if there are multiple pages
            if (paginationData.totalPages > 1) {
                await setupPagination(reply, paginationData);
            }

            // Set up collector for item details
            setupItemCollector(reply, CUSTOM_IDS.ITEM_MENU, language, t);

            return;
        } catch (error) {
            logger.error('Error searching item', { searchTerm, language, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply(t.errors.itemNotFound);
        }
    }
};

