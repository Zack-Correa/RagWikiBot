/**
 * Slash Command: /buscar-monstro-nome
 * Searches for monsters by name in the Divine Pride database
 * Includes interactive buttons to view detailed monster information
 */

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const divinePride = require('../integrations/database/divine-pride');
const settings = require('../integrations/const.json');
const parser = require('../utils/parser');
const logger = require('../utils/logger');
const config = require('../config');
const i18n = require('../utils/i18n');
const { ValidationError, CommandError } = require('../utils/errors');
const { createPaginatedEmbed, setupPagination } = require('../utils/pagination');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buscar-monstro-nome')
        .setDescription('Busca monstros pelo nome no banco de dados Divine Pride (servidor LATAM)')
        .addStringOption(option =>
            option
                .setName('nome')
                .setDescription('Nome do monstro')
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
        const t = i18n.getLanguage(language);

        try {
            const body = await divinePride.makeMonsterSearchQuery(searchTerm, language);
            const parsedBody = await parser.parseMonsterSearchBodyResponse(searchTerm, body, language);
            
            const thumbnail = settings.assets[1].url;
            const searchedWord = parsedBody[0] || t.search.noResults;
            const results = parsedBody.slice(1); // Remove search term, keep all results

            // Separate search URL from results
            const searchURL = results[results.length - 1]; // Last element is the search URL
            const monsterResults = results.slice(0, -1); // All monsters except the URL

            if (monsterResults.length === 0) {
                // No results found
                const { EmbedBuilder } = require('discord.js');
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(t.search.titleMonsters)
                    .setThumbnail(thumbnail)
                    .addFields({ 
                        name: `${t.search.resultsFor} "${searchedWord}"`, 
                        value: t.search.noResults
                    })
                    .addFields({
                        name: '\u200b',
                        value: t.credits.divinePride
                    })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Create paginated embed (10 monsters per page)
            const paginationData = createPaginatedEmbed({
                items: monsterResults,
                itemsPerPage: 10,
                title: t.search.titleMonsters,
                thumbnail: thumbnail,
                searchTerm: searchedWord,
                searchURL: searchURL,
                language: language,
                timeout: 180000 // 3 minutes
            });

            // Extract monster IDs and names from results for select menu
            const monsterOptions = [];
            const monsterIdsToCheck = [];
            const addedMonsterIds = new Set(); // Track unique monster IDs to prevent duplicates
            
            // First pass: collect valid monsters
            for (const result of monsterResults) {
                // Format is: [Monster Name](url) or [👑 Monster Name](url)
                const nameMatch = result.match(/\[([^\]]+)\]/);
                const idMatch = result.match(/monster\/(\d+)/);
                if (nameMatch && idMatch) {
                    // Extract name (keep crown emoji if present)
                    let monsterName = nameMatch[1].replace(/^👑\s*/, '').trim();
                    const monsterId = idMatch[1];
                    
                    // Skip if this monster ID was already added
                    if (addedMonsterIds.has(monsterId)) {
                        logger.debug('Skipping duplicate monster ID in select menu', { monsterId, monsterName });
                        continue;
                    }
                    
                    // Validate monster name before adding to menu
                    // Skip if empty or too short
                    if (!monsterName || monsterName.trim().length < 2) {
                        continue;
                    }
                    
                    // Skip Korean characters
                    if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(monsterName)) {
                        logger.debug('Skipping Korean monster in select menu', { monsterName });
                        continue;
                    }
                    
                    // Skip encoding issues
                    if (/[\u0000-\u001F\uFFFD]/.test(monsterName) || 
                        monsterName.includes('�') || 
                        monsterName.includes('&#x')) {
                        logger.debug('Skipping monster with encoding issues in select menu', { monsterName });
                        continue;
                    }
                    
                    // Skip placeholder names
                    const lowerName = monsterName.toLowerCase();
                    if (lowerName.includes('[ph]') ||
                        lowerName.includes('placeholder') ||
                        lowerName.includes('unknown') ||
                        monsterName === 'N/A' ||
                        monsterName === '?') {
                        continue;
                    }
                    
                    // Skip names that are only numbers or special characters
                    if (/^[\d\s\-_\.]+$/.test(monsterName)) {
                        continue;
                    }
                    
                    // Discord select menu limit is 25 options
                    if (monsterOptions.length < 25) {
                        // Clean and truncate name for display
                        monsterName = monsterName.trim();
                        
                        monsterOptions.push({
                            name: monsterName,
                            id: monsterId,
                            isMvp: false // Will be updated
                        });
                        
                        monsterIdsToCheck.push(monsterId);
                        
                        // Mark this ID as used
                        addedMonsterIds.add(monsterId);
                    }
                }
            }
            
            // Second pass: check which monsters are MVPs (in parallel)
            if (monsterIdsToCheck.length > 0) {
                try {
                    const mvpCheckPromises = monsterIdsToCheck.map(async (id) => {
                        try {
                            const monsterData = await divinePride.monsterSearch(id, language);
                            const isMvp = monsterData?.stats?.mvp === 1;
                            return { id, isMvp };
                        } catch {
                            return { id, isMvp: false };
                        }
                    });
                    
                    // Wait for all checks with a timeout
                    const mvpResults = await Promise.race([
                        Promise.all(mvpCheckPromises),
                        new Promise((resolve) => setTimeout(() => resolve([]), 3000)) // 3s timeout
                    ]);
                    
                    // Update monsterOptions with MVP status
                    if (Array.isArray(mvpResults)) {
                        const mvpMap = new Map(mvpResults.map(r => [r.id, r.isMvp]));
                        monsterOptions.forEach(option => {
                            option.isMvp = mvpMap.get(option.id) || false;
                        });
                    }
                } catch (error) {
                    logger.warn('Error checking MVP status', { error: error.message });
                    // Continue without MVP indicators
                }
            }
            
            // Build final options with MVP indicators
            const finalOptions = monsterOptions.map(option => {
                const prefix = option.isMvp ? '👑 ' : '';
                const suffix = option.isMvp ? ' (MVP)' : '';
                const label = `${prefix}${option.name}`.substring(0, 100); // Discord limit
                const description = `ID: ${option.id}${suffix}`;
                
                return {
                    label: label,
                    value: `monster_${option.id}`,
                    description: description
                };
            });

            // Create select menu if we have options
            const components = [];
            if (finalOptions.length > 0) {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('monster_details_menu')
                    .setPlaceholder(t.search.selectPlaceholderMonster)
                    .addOptions(finalOptions);

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

            // Set up select menu interaction collector for monster details
            const collector = reply.createMessageComponentCollector({
                filter: i => i.customId === 'monster_details_menu',
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (selectInteraction) => {
                try {
                    const selectedValue = selectInteraction.values[0];
                    const monsterId = selectedValue.replace('monster_', '');
                    
                    await selectInteraction.deferReply({ flags: MessageFlags.Ephemeral });
                    
                    // Fetch monster details
                    const response = await divinePride.monsterSearch(monsterId, language);
                    const monsterInfo = await parser.parseMonsterResponse(response, monsterId, language);
                    
                    const monsterThumbnail = settings.assets[1].url;
                    const monsterImage = `https://static.divine-pride.net/images/mobs/png/${monsterId}.png`;
                    
                    const detailEmbed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle(t.monster.title)
                        .setThumbnail(monsterThumbnail)
                        .setImage(monsterImage)
                        .setDescription(monsterInfo)
                        .addFields({
                            name: '\u200b',
                            value: t.credits.divinePride
                        })
                        .setTimestamp();

                    await selectInteraction.editReply({ embeds: [detailEmbed] });
                } catch (error) {
                    logger.error('Error showing monster details', { error: error.message });
                    await selectInteraction.editReply({
                        content: t.errors.monsterDetails
                    }).catch(() => {});
                }
            });

            collector.on('end', () => {
                // Remove select menu after timeout
                reply.edit({ components: [] }).catch(() => {});
                logger.debug('Monster detail collector ended', { searchTerm });
            });

            return;
        } catch (error) {
            logger.error('Error searching monster by name', { searchTerm, language, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply(t.errors.monsterNotFound);
        }
    }
};

