/**
 * Pagination utility for Discord embeds
 * Handles pagination with emoji reactions
 */

const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');
const i18n = require('./i18n');

// Emoji constants
const EMOJIS = {
    FIRST: '⏮️',
    PREV: '⬅️',
    NEXT: '➡️',
    LAST: '⏭️',
    STOP: '❌'
};

/**
 * Creates a paginated embed message with navigation emojis
 * @param {Object} options - Pagination options
 * @param {Array} options.items - Array of items to paginate
 * @param {number} options.itemsPerPage - Number of items per page (default: 10)
 * @param {string} options.title - Embed title
 * @param {string} options.thumbnail - Thumbnail URL
 * @param {string} options.searchTerm - Search term for display
 * @param {string} options.searchURL - Full search URL
 * @param {string} options.language - Language code for translations (default: 'pt-br')
 * @param {number} options.timeout - Timeout in milliseconds (default: 180000 = 3 minutes)
 * @returns {Object} Object with embed and page info
 */
function createPaginatedEmbed(options) {
    const {
        items,
        itemsPerPage = 10,
        title,
        thumbnail,
        searchTerm,
        searchURL,
        language = 'pt-br',
        timeout = 180000
    } = options;

    const totalPages = Math.ceil(items.length / itemsPerPage);
    const currentPage = 1;

    return {
        embed: buildEmbed(items, currentPage, totalPages, itemsPerPage, title, thumbnail, searchTerm, searchURL, language),
        totalPages,
        currentPage,
        items,
        itemsPerPage,
        title,
        thumbnail,
        searchTerm,
        searchURL,
        language,
        timeout
    };
}

/**
 * Builds an embed for a specific page
 * @param {Array} items - All items
 * @param {number} page - Current page (1-indexed)
 * @param {number} totalPages - Total number of pages
 * @param {number} itemsPerPage - Items per page
 * @param {string} title - Embed title
 * @param {string} thumbnail - Thumbnail URL
 * @param {string} searchTerm - Search term
 * @param {string} searchURL - Full search URL
 * @param {string} language - Language code for translations
 * @returns {EmbedBuilder} Built embed
 */
function buildEmbed(items, page, totalPages, itemsPerPage, title, thumbnail, searchTerm, searchURL, language = 'pt-br') {
    const t = i18n.getLanguage(language);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, items.length);
    const pageItems = items.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(title)
        .setTimestamp()
        .setFooter({ text: `${t.search.page} ${page}/${totalPages}` });

    if (thumbnail) {
        embed.setThumbnail(thumbnail);
    }

    if (pageItems.length === 0) {
        embed.addFields({
            name: `${t.search.resultsFor} "${searchTerm}"`,
            value: t.search.noResults
        });
    } else {
        // Build result text
        let resultText = pageItems.join('\n');
        
        // Add search URL to last page
        if (page === totalPages && searchURL) {
            resultText += searchURL;
        }

        // Discord field limit is 1024 characters
        const MAX_FIELD_LENGTH = 1024;
        
        if (resultText.length <= MAX_FIELD_LENGTH) {
            // Single field - all items fit
            embed.addFields({
                name: `${t.search.resultsFor} "${searchTerm}" (${items.length} ${t.search.found})`,
                value: resultText
            });
        } else {
            // Split into multiple fields if needed
            let currentField = '';
            const fields = [];
            
            for (const item of pageItems) {
                const separator = currentField ? '\n' : '';
                const testField = currentField + separator + item;
                
                if (testField.length > MAX_FIELD_LENGTH && currentField) {
                    fields.push(currentField);
                    currentField = item;
                } else {
                    currentField = testField;
                }
            }
            
            if (currentField) {
                fields.push(currentField);
            }
            
            // Add all fields
            fields.forEach((fieldContent, index) => {
                const isLast = index === fields.length - 1;
                const fieldName = fields.length > 1
                    ? `${t.search.resultsFor} "${searchTerm}" (${index + 1}/${fields.length})`
                    : `${t.search.resultsFor} "${searchTerm}" (${items.length} ${t.search.found})`;
                
                let value = fieldContent;
                if (isLast && page === totalPages && searchURL) {
                    value += searchURL;
                }
                
                embed.addFields({
                    name: fieldName,
                    value: value
                });
            });
        }
    }

    // Add Divine Pride credit at the bottom
    embed.addFields({
        name: '\u200b',
        value: t.credits.divinePride
    });

    return embed;
}

/**
 * Sets up pagination reactions and collector
 * @param {Message} message - Discord message to paginate
 * @param {Object} paginationData - Pagination data from createPaginatedEmbed
 * @returns {Promise<void>}
 */
async function setupPagination(message, paginationData) {
    const { totalPages, timeout } = paginationData;
    
    if (totalPages <= 1) {
        // No pagination needed
        return;
    }

    // Add navigation emojis
    const emojis = [];
    if (totalPages > 1) {
        emojis.push(EMOJIS.FIRST, EMOJIS.PREV, EMOJIS.NEXT, EMOJIS.LAST);
    }
    emojis.push(EMOJIS.STOP);

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
        dispose: true // Handle both add and remove reactions
    });

    let currentPage = paginationData.currentPage;

    collector.on('collect', async (reaction, user) => {
        try {
            // Remove user's reaction
            await reaction.users.remove(user.id).catch(() => {});

            const emoji = reaction.emoji.name;
            let newPage = currentPage;

            switch (emoji) {
                case EMOJIS.FIRST:
                    newPage = 1;
                    break;
                case EMOJIS.PREV:
                    newPage = Math.max(1, currentPage - 1);
                    break;
                case EMOJIS.NEXT:
                    newPage = Math.min(totalPages, currentPage + 1);
                    break;
                case EMOJIS.LAST:
                    newPage = totalPages;
                    break;
                case EMOJIS.STOP:
                    collector.stop();
                    return;
                default:
                    return; // Unknown emoji, ignore
            }

            // Only update if page changed
            if (newPage !== currentPage) {
                currentPage = newPage;
                const newEmbed = buildEmbed(
                    paginationData.items,
                    currentPage,
                    totalPages,
                    paginationData.itemsPerPage,
                    paginationData.title,
                    paginationData.thumbnail,
                    paginationData.searchTerm,
                    paginationData.searchURL,
                    paginationData.language
                );

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
            // Remove all reactions when collector ends
            await message.reactions.removeAll().catch(() => {});
        } catch (error) {
            logger.warn('Failed to remove reactions', { error: error.message });
        }
    });

    logger.debug('Pagination setup complete', {
        messageId: message.id,
        totalPages,
        timeout
    });
}

module.exports = {
    createPaginatedEmbed,
    setupPagination,
    EMOJIS
};

