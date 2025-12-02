/**
 * Slash Command: /buscar-mapa
 * Searches for map information by ID or name
 */

const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const divinePride = require('../integrations/database/divine-pride');
const parser = require('../utils/parser');
const logger = require('../utils/logger');
const config = require('../config');
const i18n = require('../utils/i18n');
const { ValidationError, CommandError } = require('../utils/errors');
const { createPaginatedEmbed, setupPagination } = require('../utils/pagination');
const { createMapEmbed, createSearchEmbed, THUMBNAILS } = require('../utils/embedBuilder');
const { extractMapsFromResults, createSelectOptions, createSelectMenu } = require('../utils/selectMenuBuilder');
const { setupMapCollector } = require('../utils/collectorHelper');
const { PATTERNS, CUSTOM_IDS, IMAGES, TIMEOUTS } = require('../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buscar-mapa')
        .setDescription('Busca mapas por nome ou ID no banco de dados Divine Pride (servidor LATAM)')
        .addStringOption(option =>
            option
                .setName('busca')
                .setDescription('Nome ou ID do mapa (ex: prontera, prt_fild01)')
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

        // Validate search term
        if (!searchTerm || searchTerm.trim() === '') {
            return interaction.editReply('❌ O termo de busca não pode estar vazio.');
        }

        try {
            // Check if it looks like a map ID using smarter detection
            const hasUnderscore = searchTerm.includes('_');
            const hasNumbers = /\d/.test(searchTerm);
            const hasSpaces = /\s/.test(searchTerm);
            const isAlphanumeric = PATTERNS.MAP_ID.test(searchTerm);
            
            // It's likely an ID if it has no spaces AND (has underscore OR numbers)
            const isMapId = !hasSpaces && isAlphanumeric && (hasUnderscore || hasNumbers);
            
            if (isMapId) {
                // Try search by ID - if it fails, fall through to name search
                try {
                    const response = await divinePride.mapSearch(searchTerm, language);
                    const mapInfo = await parser.parseMapResponse(response, searchTerm, language);
                    
                // Try to get map image
                let mapImage = null;
                try {
                    const originalResponse = await axios.head(IMAGES.MAP_ORIGINAL(searchTerm), { timeout: 5000 });
                    if (originalResponse.status === 200) {
                        mapImage = IMAGES.MAP_ORIGINAL(searchTerm);
                        logger.debug('Using original map image', { mapId: searchTerm });
                    }
                } catch {
                    try {
                        const rawResponse = await axios.head(IMAGES.MAP_RAW(searchTerm), { timeout: 5000 });
                        if (rawResponse.status === 200) {
                            mapImage = IMAGES.MAP_RAW(searchTerm);
                            logger.debug('Using raw map image', { mapId: searchTerm });
                        }
                    } catch {
                        logger.warn('Map image not available', { mapId: searchTerm });
                    }
                }
                
                const embed = createMapEmbed({
                    title: t.map.title,
                    description: mapInfo,
                    mapImage,
                    footer: t.credits.divinePride
                });

                return interaction.editReply({ embeds: [embed] });
                } catch (idError) {
                    // ID search failed, fall through to name search below
                    logger.debug('Map ID search failed, trying name search', { searchTerm, error: idError.message });
                }
            }
            
            // Search by name - full search with pagination
            const body = await divinePride.makeMapSearchQuery(searchTerm, language);
            const parsedBody = await parser.parseMapSearchBodyResponse(searchTerm, body);
            
            const searchedWord = parsedBody[0] || t.search.noResults;
            const results = parsedBody.slice(1);
            const searchURL = results[results.length - 1];
            const mapResults = results.slice(0, -1);
            
            if (mapResults.length === 0) {
                const embed = createSearchEmbed({
                    searchTerm: searchedWord,
                    title: t.search.titleMaps,
                    source: 'divine-pride',
                    noResultsMessage: `${t.search.resultsFor} "${searchedWord}"\n${t.search.noResults}\n\n${t.credits.divinePride}`
                });

                return interaction.editReply({ embeds: [embed] });
            }

            const paginationData = createPaginatedEmbed({
                items: mapResults,
                itemsPerPage: 10,
                title: t.search.titleMaps,
                thumbnail: THUMBNAILS.DIVINE_PRIDE,
                searchTerm: searchedWord,
                searchURL: searchURL,
                language: language,
                timeout: TIMEOUTS.PAGINATION
            });

            // Create select menu using specialized map extractor
            const components = [];
            const maps = extractMapsFromResults(mapResults);
            
            if (maps.length > 0) {
                const selectOptions = createSelectOptions(maps, {
                    valuePrefix: 'map_',
                    formatLabel: (item) => item.name,
                    formatDescription: (item) => item.id
                });
                
                const selectMenuRow = createSelectMenu({
                    customId: CUSTOM_IDS.MAP_MENU,
                    placeholder: t.search.selectPlaceholderMap,
                    selectOptions
                });
                
                if (selectMenuRow) {
                    components.push(selectMenuRow);
                }
            }

            const reply = await interaction.editReply({ 
                embeds: [paginationData.embed],
                components: components
            });
            
            if (paginationData.totalPages > 1) {
                await setupPagination(reply, paginationData);
            }

            // Set up collector for map details
            setupMapCollector(reply, CUSTOM_IDS.MAP_MENU, language, t);

            return;
        } catch (error) {
            logger.error('Error searching map', { searchTerm, language, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply(t.errors.mapNotFound);
        }
    }
};

