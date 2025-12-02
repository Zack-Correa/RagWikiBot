/**
 * Embed Builder Factory
 * Provides standardized embed creation with consistent styling
 */

const { EmbedBuilder } = require('discord.js');
const settings = require('../integrations/const.json');
const { COLORS, IMAGES } = require('./constants');

const THUMBNAILS = {
    WIKI: settings.assets[0].url,
    DIVINE_PRIDE: settings.assets[1].url,
    BROWIKI: 'https://browiki.org/images2/wiki.png?c2539'
};

/**
 * Creates a base embed with standard configuration
 * @param {Object} options - Embed options
 * @param {string} options.title - Embed title
 * @param {string} [options.description] - Embed description
 * @param {string} [options.color] - Embed color (defaults to PRIMARY)
 * @param {string} [options.thumbnail] - Thumbnail URL
 * @param {boolean} [options.timestamp] - Whether to add timestamp (default: true)
 * @returns {EmbedBuilder}
 */
function createBaseEmbed({ title, description, color = COLORS.PRIMARY, thumbnail, timestamp = true }) {
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title);
    
    if (description) {
        embed.setDescription(description);
    }
    
    if (thumbnail) {
        embed.setThumbnail(thumbnail);
    }
    
    if (timestamp) {
        embed.setTimestamp();
    }
    
    return embed;
}

/**
 * Creates a search results embed
 * @param {Object} options - Search options
 * @param {string} options.searchTerm - The search term
 * @param {string} options.title - Embed title
 * @param {string} [options.source] - Source name (wiki/divine-pride)
 * @param {string} [options.noResultsMessage] - Custom no results message
 * @returns {EmbedBuilder}
 */
function createSearchEmbed({ searchTerm, title, source = 'divine-pride', noResultsMessage }) {
    const thumbnail = source === 'wiki' ? THUMBNAILS.WIKI : THUMBNAILS.DIVINE_PRIDE;
    const message = noResultsMessage || `Nenhum resultado encontrado para **"${searchTerm}"**`;
    
    return createBaseEmbed({
        title,
        description: message,
        thumbnail,
        color: COLORS.WARNING
    });
}

/**
 * Creates an item detail embed
 * @param {Object} options - Item options
 * @param {string} options.title - Embed title
 * @param {string} options.description - Item description/info
 * @param {string} options.itemId - Item ID for image
 * @param {string} options.footer - Footer text
 * @returns {EmbedBuilder}
 */
function createItemEmbed({ title, description, itemId, footer }) {
    const embed = createBaseEmbed({
        title,
        description,
        thumbnail: THUMBNAILS.DIVINE_PRIDE
    });
    
    if (itemId) {
        embed.setImage(IMAGES.ITEM(itemId));
    }
    
    if (footer) {
        embed.addFields({
            name: '\u200b',
            value: footer
        });
    }
    
    return embed;
}

/**
 * Creates a monster detail embed
 * @param {Object} options - Monster options
 * @param {string} options.title - Embed title
 * @param {string} options.description - Monster description/info
 * @param {string} options.monsterId - Monster ID for image
 * @param {string} options.footer - Footer text
 * @returns {EmbedBuilder}
 */
function createMonsterEmbed({ title, description, monsterId, footer }) {
    const embed = createBaseEmbed({
        title,
        description,
        thumbnail: THUMBNAILS.DIVINE_PRIDE
    });
    
    if (monsterId) {
        embed.setImage(IMAGES.MONSTER(monsterId));
    }
    
    if (footer) {
        embed.addFields({
            name: '\u200b',
            value: footer
        });
    }
    
    return embed;
}

/**
 * Creates a map detail embed
 * @param {Object} options - Map options
 * @param {string} options.title - Embed title
 * @param {string} options.description - Map description/info
 * @param {string} options.mapImage - Map image URL
 * @param {string} options.footer - Footer text
 * @returns {EmbedBuilder}
 */
function createMapEmbed({ title, description, mapImage, footer }) {
    const embed = createBaseEmbed({
        title,
        description,
        thumbnail: THUMBNAILS.DIVINE_PRIDE
    });
    
    if (mapImage) {
        embed.setImage(mapImage);
    }
    
    if (footer) {
        embed.addFields({
            name: '\u200b',
            value: footer
        });
    }
    
    return embed;
}

/**
 * Creates an error embed
 * @param {string} message - Error message
 * @returns {EmbedBuilder}
 */
function createErrorEmbed(message) {
    return createBaseEmbed({
        title: '❌ Erro',
        description: message,
        color: COLORS.ERROR,
        timestamp: false
    });
}

module.exports = {
    COLORS,
    THUMBNAILS,
    createBaseEmbed,
    createSearchEmbed,
    createItemEmbed,
    createMonsterEmbed,
    createMapEmbed,
    createErrorEmbed
};

