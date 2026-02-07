/**
 * Slash Command: /buscar-monstro
 * Searches for monster information by ID or name
 */

const { SlashCommandBuilder } = require('discord.js');
const divinePride = require('../integrations/database/divine-pride');
const parser = require('../utils/parser');
const logger = require('../utils/logger');
const config = require('../config');
const i18n = require('../utils/i18n');
const { ValidationError, CommandError } = require('../utils/errors');
const { createPaginatedEmbed, setupPagination } = require('../utils/pagination');
const { createMonsterEmbed, createSearchEmbed, THUMBNAILS } = require('../utils/embedBuilder');
const { setupMonsterCollector } = require('../utils/collectorHelper');
const { PATTERNS, CUSTOM_IDS, EXTRACT_PATTERNS, TIMEOUTS } = require('../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buscar-monstro')
        .setDescription('Busca monstros por nome ou ID no banco de dados Divine Pride (servidor LATAM)')
        .addStringOption(option =>
            option
                .setName('busca')
                .setDescription('Nome ou ID do monstro')
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
                // Search by ID - direct monster lookup
                const response = await divinePride.monsterSearch(searchTerm, language);
                const monsterInfo = await parser.parseMonsterResponse(response, searchTerm, language);
                
                const embed = createMonsterEmbed({
                    title: t.monster.title,
                    description: monsterInfo,
                    monsterId: searchTerm,
                    footer: t.credits.divinePride
                });

                return interaction.editReply({ embeds: [embed] });
            }
            
            // Search by name - full search with pagination
            const body = await divinePride.makeMonsterSearchQuery(searchTerm, language);
            const parsedBody = await parser.parseMonsterSearchBodyResponse(searchTerm, body, language);
            
            const searchedWord = parsedBody[0] || t.search.noResults;
            const results = parsedBody.slice(1);
            const searchURL = results[results.length - 1];
            const monsterResults = results.slice(0, -1);
            
            if (monsterResults.length === 0) {
                const embed = createSearchEmbed({
                    searchTerm: searchedWord,
                    title: t.search.titleMonsters,
                    source: 'divine-pride',
                    noResultsMessage: `${t.search.resultsFor} "${searchedWord}"\n${t.search.noResults}\n\n${t.credits.divinePride}`
                });

                return interaction.editReply({ embeds: [embed] });
            }

            const paginationData = createPaginatedEmbed({
                items: monsterResults,
                itemsPerPage: 10,
                title: t.search.titleMonsters,
                thumbnail: THUMBNAILS.DIVINE_PRIDE,
                searchTerm: searchedWord,
                searchURL: searchURL,
                language: language,
                timeout: TIMEOUTS.PAGINATION
            });

            // Extract monsters for MVP checking
            const monsterOptions = [];
            const monsterIdsToCheck = [];
            const addedMonsterIds = new Set();
            
            for (const result of monsterResults) {
                const nameMatch = result.match(EXTRACT_PATTERNS.MONSTER.name);
                const idMatch = result.match(EXTRACT_PATTERNS.MONSTER.id);
                if (nameMatch && idMatch) {
                    const monsterName = nameMatch[1].replace(/^👑\s*/, '').trim();
                    const monsterId = idMatch[1];
                    
                    if (addedMonsterIds.has(monsterId)) continue;
                    
                    // Use centralized validation
                    const { isValidName } = require('../utils/nameValidator');
                    if (!isValidName(monsterName, { logSkipped: false })) continue;
                    
                    if (monsterOptions.length < 25) {
                        monsterOptions.push({
                            name: monsterName.trim(),
                            id: monsterId,
                            isMvp: false
                        });
                        monsterIdsToCheck.push(monsterId);
                        addedMonsterIds.add(monsterId);
                    }
                }
            }
            
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
                    
                    const mvpResults = await Promise.race([
                        Promise.all(mvpCheckPromises),
                        new Promise((resolve) => setTimeout(() => resolve([]), 3000))
                    ]);
                    
                    if (Array.isArray(mvpResults)) {
                        const mvpMap = new Map(mvpResults.map(r => [r.id, r.isMvp]));
                        monsterOptions.forEach(option => {
                            option.isMvp = mvpMap.get(option.id) || false;
                        });
                    }
                } catch (error) {
                    logger.warn('Error checking MVP status', { error: error.message });
                }
            }
            
            // Create select menu with MVP indicators
            const components = [];
            if (monsterOptions.length > 0) {
                const { createSelectOptions, createSelectMenu } = require('../utils/selectMenuBuilder');
                
                const selectOptions = createSelectOptions(monsterOptions, {
                    valuePrefix: 'monster_',
                    formatLabel: (item) => {
                        const prefix = item.isMvp ? '👑 ' : '';
                        return `${prefix}${item.name}`.substring(0, 100);
                    },
                    formatDescription: (item) => {
                        const suffix = item.isMvp ? ' (MVP)' : '';
                        return `ID: ${item.id}${suffix}`;
                    }
                });
                
                const selectMenuRow = createSelectMenu({
                    customId: CUSTOM_IDS.MONSTER_MENU,
                    placeholder: t.search.selectPlaceholderMonster,
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

            // Set up collector for monster details
            setupMonsterCollector(reply, CUSTOM_IDS.MONSTER_MENU, language, t);

            return;
        } catch (error) {
            logger.error('Error searching monster', { searchTerm, language, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply(t.errors.monsterNotFound);
        }
    }
};

