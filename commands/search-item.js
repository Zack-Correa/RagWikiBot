/**
 * Slash Command: /buscar-item
 * Searches for items by name in the Divine Pride database
 * Includes interactive select menu to view detailed item information
 */

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const divinePride = require('../integrations/database/divine-pride');
const settings = require('../integrations/const.json');
const parser = require('../utils/parser');
const logger = require('../utils/logger');
const config = require('../config');
const { ValidationError, CommandError } = require('../utils/errors');
const { createPaginatedEmbed, setupPagination } = require('../utils/pagination');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buscar-item')
        .setDescription('Busca itens pelo nome no banco de dados Divine Pride (servidor LATAM)')
        .addStringOption(option =>
            option
                .setName('nome')
                .setDescription('Nome do item')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('idioma')
                .setDescription('Idioma da busca (padrão: Português)')
                .setRequired(false)
                .addChoices(
                    { name: 'Português (Brasil)', value: 'pt-br' },
                    { name: 'English', value: 'en' },
                    { name: 'Español', value: 'es' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const searchTerm = interaction.options.getString('nome');
        const language = interaction.options.getString('idioma') || config.defaultLanguage;

        try {
            const body = await divinePride.makeSearchQuery(searchTerm, language);
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

            // Extract item IDs and names from results for select menu
            const itemOptions = [];
            const addedItemIds = new Set(); // Track unique item IDs to prevent duplicates
            
            for (const result of itemResults) {
                // Format is: [Item Name](url)
                const nameMatch = result.match(/\[([^\]]+)\]/);
                const idMatch = result.match(/item\/(\d+)/);
                if (nameMatch && idMatch) {
                    let itemName = nameMatch[1];
                    const itemId = idMatch[1];
                    
                    // Skip if this item ID was already added
                    if (addedItemIds.has(itemId)) {
                        logger.debug('Skipping duplicate item ID in select menu', { itemId, itemName });
                        continue;
                    }
                    
                    // Validate item name before adding to menu
                    // Skip if empty or too short
                    if (!itemName || itemName.trim().length < 2) {
                        continue;
                    }
                    
                    // Skip Korean characters
                    if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(itemName)) {
                        logger.debug('Skipping Korean item in select menu', { itemName });
                        continue;
                    }
                    
                    // Skip encoding issues
                    if (/[\u0000-\u001F\uFFFD]/.test(itemName) || 
                        itemName.includes('�') || 
                        itemName.includes('&#x')) {
                        logger.debug('Skipping item with encoding issues in select menu', { itemName });
                        continue;
                    }
                    
                    // Skip placeholder names
                    const lowerName = itemName.toLowerCase();
                    if (lowerName.includes('[ph]') ||
                        lowerName.includes('placeholder') ||
                        lowerName.includes('unknown') ||
                        itemName === 'N/A' ||
                        itemName === '?') {
                        continue;
                    }
                    
                    // Skip names that are only numbers or special characters
                    if (/^[\d\s\-_\.]+$/.test(itemName)) {
                        continue;
                    }
                    
                    // Discord select menu limit is 25 options
                    if (itemOptions.length < 25) {
                        // Clean and truncate name for display
                        itemName = itemName.trim().substring(0, 100); // Discord limit
                        
                        itemOptions.push({
                            label: itemName,
                            value: `item_${itemId}`,
                            description: `ID: ${itemId}`
                        });
                        
                        // Mark this ID as used
                        addedItemIds.add(itemId);
                    }
                }
            }

            // Create select menu if we have options
            const components = [];
            if (itemOptions.length > 0) {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('item_details_menu')
                    .setPlaceholder('Selecione um item para ver detalhes')
                    .addOptions(itemOptions);

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

            // Set up select menu interaction collector for item details
            const collector = reply.createMessageComponentCollector({
                filter: i => i.customId === 'item_details_menu',
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (selectInteraction) => {
                try {
                    const selectedValue = selectInteraction.values[0];
                    const itemId = selectedValue.replace('item_', '');
                    
                    await selectInteraction.deferReply({ flags: MessageFlags.Ephemeral });
                    
                    // Fetch item details
                    const response = await divinePride.makeItemIdRequest(itemId, language);
                    const itemInfo = await parser.parseDatabaseResponse(response, itemId);
                    
                    const itemThumbnail = settings.assets[1].url;
                    const itemImage = `https://www.divine-pride.net/img/items/collection/kro/${itemId}`;
                    
                    const detailEmbed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('Informações do Item')
                        .setThumbnail(itemThumbnail)
                        .setDescription(itemInfo)
                        .setImage(itemImage)
                        .addFields({
                            name: '\u200b',
                            value: '*Conteúdo fornecido por [Divine Pride](https://www.divine-pride.net)*'
                        })
                        .setTimestamp();

                    await selectInteraction.editReply({ embeds: [detailEmbed] });
                } catch (error) {
                    logger.error('Error showing item details', { error: error.message });
                    await selectInteraction.editReply({
                        content: '❌ Erro ao buscar detalhes do item.'
                    }).catch(() => {});
                }
            });

            collector.on('end', () => {
                // Remove select menu after timeout
                reply.edit({ components: [] }).catch(() => {});
                logger.debug('Item detail collector ended', { searchTerm });
            });

            return;
        } catch (error) {
            logger.error('Error searching item', { searchTerm, language, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply('❌ Não foi possível buscar o item solicitado.');
        }
    }
};

