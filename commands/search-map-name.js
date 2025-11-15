/**
 * Slash Command: /buscar-mapa-nome
 * Searches for maps by name in the Divine Pride database
 * Includes interactive select menu to view detailed map information
 */

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');
const divinePride = require('../integrations/database/divine-pride');
const settings = require('../integrations/const.json');
const parser = require('../utils/parser');
const logger = require('../utils/logger');
const { ValidationError, CommandError } = require('../utils/errors');
const { createPaginatedEmbed, setupPagination } = require('../utils/pagination');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buscar-mapa-nome')
        .setDescription('Busca mapas pelo nome no banco de dados Divine Pride')
        .addStringOption(option =>
            option
                .setName('nome')
                .setDescription('Nome do mapa')
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
            const body = await divinePride.makeMapSearchQuery(searchTerm, server);
            const parsedBody = await parser.parseMapSearchBodyResponse(searchTerm, body);
            
            const thumbnail = settings.assets[1].url;
            const searchedWord = parsedBody[0] || 'Nenhum termo';
            const results = parsedBody.slice(1); // Remove search term, keep all results

            // Separate search URL from results
            const searchURL = results[results.length - 1]; // Last element is the search URL
            const mapResults = results.slice(0, -1); // All maps except the URL

            if (mapResults.length === 0) {
                // No results found
                const { EmbedBuilder } = require('discord.js');
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Resultado da pesquisa de mapas')
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

            // Create paginated embed (10 maps per page)
            const paginationData = createPaginatedEmbed({
                items: mapResults,
                itemsPerPage: 10,
                title: 'Resultado da pesquisa de mapas',
                thumbnail: thumbnail,
                searchTerm: searchedWord,
                searchURL: searchURL,
                timeout: 180000 // 3 minutes
            });

            // Extract map IDs and names from results for select menu
            const mapOptions = [];
            const addedMapIds = new Set(); // Track unique map IDs to prevent duplicates
            
            for (const result of mapResults) {
                // Format is now: **Map Name**\n[map_id](url)
                // Split by newline to separate name and link
                const parts = result.split('\n');
                if (parts.length < 2) continue;
                
                // Extract name from between ** ** (first part)
                const nameMatch = parts[0].match(/\*\*(.+?)\*\*/);
                // Extract ID from link (second part)
                const idMatch = parts[1].match(/\[([a-zA-Z0-9_]+)\]/);
                
                if (nameMatch && idMatch) {
                    let mapName = nameMatch[1].trim();
                    const mapId = idMatch[1].trim();
                    
                    // Skip if this map ID was already added
                    if (addedMapIds.has(mapId)) {
                        logger.debug('Skipping duplicate map ID in select menu', { mapId, mapName });
                        continue;
                    }
                    
                    // Validate map name before adding to menu
                    // Skip if empty or too short
                    if (!mapName || mapName.trim().length < 2) {
                        continue;
                    }
                    
                    // Skip Korean characters
                    if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(mapName)) {
                        logger.debug('Skipping Korean map in select menu', { mapName });
                        continue;
                    }
                    
                    // Skip encoding issues
                    if (/[\u0000-\u001F\uFFFD]/.test(mapName) || 
                        mapName.includes('�') || 
                        mapName.includes('&#x')) {
                        logger.debug('Skipping map with encoding issues in select menu', { mapName });
                        continue;
                    }
                    
                    // Skip placeholder names
                    const lowerName = mapName.toLowerCase();
                    if (lowerName.includes('[ph]') ||
                        lowerName.includes('placeholder') ||
                        lowerName.includes('unknown') ||
                        mapName === 'N/A' ||
                        mapName === '?') {
                        continue;
                    }
                    
                    // Skip names that are only numbers or special characters
                    if (/^[\d\s\-_\.]+$/.test(mapName)) {
                        continue;
                    }
                    
                    // Discord select menu limit is 25 options
                    if (mapOptions.length < 25) {
                        // Clean and truncate name for display
                        mapName = mapName.trim().substring(0, 100); // Discord limit
                        
                        mapOptions.push({
                            label: mapName, // Map name as title
                            value: `map_${mapId}`,
                            description: mapId // Map ID as subtitle (without "ID:" prefix)
                        });
                        
                        // Mark this ID as used
                        addedMapIds.add(mapId);
                    }
                }
            }

            // Create select menu if we have options
            const components = [];
            if (mapOptions.length > 0) {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('map_details_menu')
                    .setPlaceholder('Ver detalhes de um mapa')
                    .addOptions(mapOptions);

                const row = new ActionRowBuilder().addComponents(selectMenu);
                components.push(row);
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

            // Set up select menu interaction collector for map details
            const collector = reply.createMessageComponentCollector({
                filter: i => i.customId === 'map_details_menu',
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (selectInteraction) => {
                try {
                    const selectedValue = selectInteraction.values[0];
                    const mapId = selectedValue.replace('map_', '');
                    
                    await selectInteraction.deferReply({ flags: MessageFlags.Ephemeral });
                    
                    // Fetch map details
                    const response = await divinePride.mapSearch(mapId, server);
                    const mapInfo = await parser.parseMapResponse(response, mapId);
                    
                    // Try to get map image
                    let mapImage = null;
                    const originalUrl = `https://www.divine-pride.net/img/map/original/${mapId}`;
                    const rawUrl = `https://www.divine-pride.net/img/map/raw/${mapId}`;
                    
                    try {
                        const originalResponse = await axios.head(originalUrl, { timeout: 5000 });
                        if (originalResponse.status === 200) {
                            mapImage = originalUrl;
                        }
                    } catch {
                        try {
                            const rawResponse = await axios.head(rawUrl, { timeout: 5000 });
                            if (rawResponse.status === 200) {
                                mapImage = rawUrl;
                            }
                        } catch {
                            // No map image available
                        }
                    }
                    
                    const mapThumbnail = settings.assets[1].url;
                    const detailEmbed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('Informações do Mapa')
                        .setThumbnail(mapThumbnail)
                        .setDescription(mapInfo)
                        .addFields({
                            name: '\u200b',
                            value: '*Conteúdo fornecido por [Divine Pride](https://www.divine-pride.net)*'
                        })
                        .setTimestamp();
                    
                    if (mapImage) {
                        detailEmbed.setImage(mapImage);
                    }

                    await selectInteraction.editReply({ embeds: [detailEmbed] });
                } catch (error) {
                    logger.error('Error showing map details', { error: error.message });
                    await selectInteraction.editReply({
                        content: '❌ Erro ao buscar detalhes do mapa.'
                    }).catch(() => {});
                }
            });

            collector.on('end', () => {
                // Remove select menu after timeout
                reply.edit({ components: [] }).catch(() => {});
                logger.debug('Map detail collector ended', { searchTerm });
            });

            return;
        } catch (error) {
            logger.error('Error searching map by name', { searchTerm, server, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply('❌ Não foi possível buscar o mapa solicitado.');
        }
    }
};

