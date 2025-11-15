/**
 * Slash Command: /wiki
 * Searches for information in the Browiki with pagination support
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const wiki = require('../integrations/wikis/wikiRequests');
const settings = require('../integrations/const.json');
const parser = require('../utils/parser');
const logger = require('../utils/logger');
const pagination = require('../utils/pagination');
const { ValidationError, CommandError } = require('../utils/errors');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wiki')
        .setDescription('Busca informações na Browiki')
        .addStringOption(option =>
            option
                .setName('termo')
                .setDescription('Termo de busca')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const searchTerm = interaction.options.getString('termo');

        try {
            logger.debug('Starting wiki search', { searchTerm });
            const response = await wiki.makeRequest(searchTerm, 'wiki');
            logger.debug('Wiki response received', { 
                responseType: typeof response,
                hasQuery: !!response.query,
                hasSearch: !!response.query?.search
            });
            
            const parsedData = parser.parseWikiResponse(response);
            logger.debug('Wiki response parsed', { 
                totalResults: parsedData.totalResults,
                hasResults: parsedData.results.length > 0
            });
            
            const thumbnail = settings.assets[0].url;

            // Check if no results
            if (!parsedData.results || parsedData.results.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('📚 Resultado da pesquisa')
                    .setThumbnail(thumbnail)
                    .setDescription(`Nenhum resultado encontrado para **"${searchTerm}"**\n\n*Conteúdo fornecido por [bROWiki](https://browiki.org)*`)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Format results for display
            const formattedResults = parsedData.results.map((result, index) => {
                let formatted = `**${index + 1}. [${result.title}](${result.url})**`;
                
                // Add indicator if match is in title
                if (result.isInTitle) {
                    formatted += ` 🎯`;
                }
                
                // Only add snippet if it exists and has meaningful content
                if (result.snippet && result.snippet.trim().length > 0) {
                    formatted += `\n${result.snippet}`;
                }
                
                return formatted;
            });

            // Check if pagination is needed (more than 5 results)
            if (formattedResults.length <= 5) {
                // Simple embed without pagination
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('📚 Resultado da pesquisa')
                    .setThumbnail(thumbnail)
                    .setDescription(`**${parsedData.totalResults}** resultado${parsedData.totalResults > 1 ? 's' : ''} encontrado${parsedData.totalResults > 1 ? 's' : ''} para **"${searchTerm}"**`)
                    .setTimestamp();

                // Add results as a field
                // Use single line break for items without snippets, double for items with snippets
                const resultsText = formattedResults.join('\n\n').replace(/\n\n\*\*(\d+)\./g, '\n**$1.');
                embed.addFields({
                    name: '📄 Resultados',
                    value: resultsText
                });

                // Add source credit at the bottom
                embed.addFields({
                    name: '\u200b',
                    value: '*Conteúdo fornecido por [bROWiki](https://browiki.org)*'
                });

                return interaction.editReply({ embeds: [embed] });
            } else {
                // Use pagination for many results
                const paginationData = pagination.createPaginatedEmbed({
                    items: formattedResults,
                    itemsPerPage: 5,
                    title: '📚 Resultado da pesquisa',
                    thumbnail: thumbnail,
                    searchTerm: searchTerm,
                    timeout: 180000 // 3 minutes
                });

                // Custom embed with better formatting
                const firstEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('📚 Resultado da pesquisa')
                    .setThumbnail(thumbnail)
                    .setDescription(`**${parsedData.totalResults}** resultado${parsedData.totalResults > 1 ? 's' : ''} encontrado${parsedData.totalResults > 1 ? 's' : ''} para **"${searchTerm}"**\n\n*Use as reações abaixo para navegar*`)
                    .setTimestamp()
                    .setFooter({ text: `Página 1/${paginationData.totalPages}` });

                // Add first page results
                const firstPageItems = formattedResults.slice(0, 5);
                const firstPageText = firstPageItems.join('\n\n').replace(/\n\n\*\*(\d+)\./g, '\n**$1.');
                firstEmbed.addFields({
                    name: '📄 Resultados',
                    value: firstPageText
                });

                // Add source credit at the bottom
                firstEmbed.addFields({
                    name: '\u200b',
                    value: '*Conteúdo fornecido por [bROWiki](https://browiki.org)*'
                });

                const message = await interaction.editReply({ embeds: [firstEmbed] });

                // Setup pagination if there are multiple pages
                if (paginationData.totalPages > 1) {
                    await setupWikiPagination(message, paginationData, thumbnail, parsedData.totalResults);
                }

                return;
            }
        } catch (error) {
            logger.error('Error searching wiki', { searchTerm, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply('❌ Não foi possível buscar na wiki.');
        }
    }
};

/**
 * Setup pagination for wiki results with custom formatting
 * @param {Message} message - Discord message
 * @param {Object} paginationData - Pagination data
 * @param {string} thumbnail - Thumbnail URL
 * @param {number} totalResults - Total number of results
 */
async function setupWikiPagination(message, paginationData, thumbnail, totalResults) {
    const { totalPages, timeout, items, itemsPerPage, searchTerm } = paginationData;
    
    if (totalPages <= 1) {
        return;
    }

    // Add navigation emojis
    const emojis = [pagination.EMOJIS.FIRST, pagination.EMOJIS.PREV, pagination.EMOJIS.NEXT, pagination.EMOJIS.LAST, pagination.EMOJIS.STOP];

    // Add all reactions
    for (const emoji of emojis) {
        try {
            await message.react(emoji);
        } catch (error) {
            logger.warn('Failed to add reaction', { emoji, error: error.message });
        }
    }

    // Create reaction collector
    const filter = (reaction, user) => {
        return emojis.includes(reaction.emoji.name) && !user.bot;
    };

    const collector = message.createReactionCollector({
        filter,
        time: timeout,
        dispose: true
    });

    let currentPage = 1;

    collector.on('collect', async (reaction, user) => {
        try {
            await reaction.users.remove(user.id).catch(() => {});

            const emoji = reaction.emoji.name;
            let newPage = currentPage;

            switch (emoji) {
                case pagination.EMOJIS.FIRST:
                    newPage = 1;
                    break;
                case pagination.EMOJIS.PREV:
                    newPage = Math.max(1, currentPage - 1);
                    break;
                case pagination.EMOJIS.NEXT:
                    newPage = Math.min(totalPages, currentPage + 1);
                    break;
                case pagination.EMOJIS.LAST:
                    newPage = totalPages;
                    break;
                case pagination.EMOJIS.STOP:
                    collector.stop();
                    return;
                default:
                    return;
            }

            if (newPage !== currentPage) {
                currentPage = newPage;
                
                // Build new embed
                const startIndex = (currentPage - 1) * itemsPerPage;
                const endIndex = Math.min(startIndex + itemsPerPage, items.length);
                const pageItems = items.slice(startIndex, endIndex);

                const newEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('📚 Resultado da pesquisa')
                    .setThumbnail(thumbnail)
                    .setDescription(`**${totalResults}** resultado${totalResults > 1 ? 's' : ''} encontrado${totalResults > 1 ? 's' : ''} para **"${searchTerm}"**\n\n*Use as reações abaixo para navegar*`)
                    .setTimestamp()
                    .setFooter({ text: `Página ${currentPage}/${totalPages}` });

                const pageText = pageItems.join('\n\n').replace(/\n\n\*\*(\d+)\./g, '\n**$1.');
                newEmbed.addFields({
                    name: '📄 Resultados',
                    value: pageText
                });

                // Add source credit at the bottom
                newEmbed.addFields({
                    name: '\u200b',
                    value: '*Conteúdo fornecido por [bROWiki](https://browiki.org)*'
                });

                await message.edit({ embeds: [newEmbed] }).catch(error => {
                    logger.error('Failed to edit paginated message', {
                        error: error.message,
                        messageId: message.id
                    });
                });
            }
        } catch (error) {
            logger.error('Error handling pagination reaction', {
                error: error.message,
                userId: user.id
            });
        }
    });

    collector.on('end', async () => {
        try {
            await message.reactions.removeAll().catch(() => {});
        } catch (error) {
            logger.warn('Failed to remove reactions', { error: error.message });
        }
    });

    logger.debug('Wiki pagination setup complete', {
        messageId: message.id,
        totalPages,
        timeout
    });
}

