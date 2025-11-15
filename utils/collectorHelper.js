/**
 * Collector Helper
 * Utilities for setting up message component collectors with standard behavior
 */

const { MessageFlags } = require('discord.js');
const logger = require('./logger');
const { TIMEOUTS } = require('./constants');
const divinePride = require('../integrations/database/divine-pride');
const parser = require('./parser');
const { createItemEmbed, createMonsterEmbed, createMapEmbed } = require('./embedBuilder');
const axios = require('axios');

/**
 * Sets up a collector for item details
 * @param {Message} message - The message to collect from
 * @param {string} customId - The custom ID to filter
 * @param {string} language - Language code
 * @param {Object} translations - Translation object
 * @returns {void}
 */
function setupItemCollector(message, customId, language, translations) {
    const collector = message.createMessageComponentCollector({
        filter: i => i.customId === customId,
        time: TIMEOUTS.COLLECTOR
    });

    collector.on('collect', async (selectInteraction) => {
        try {
            const itemId = selectInteraction.values[0].replace('item_', '');
            
            await selectInteraction.deferReply({ flags: MessageFlags.Ephemeral });
            
            // Fetch item details
            const response = await divinePride.makeItemIdRequest(itemId, language);
            const itemInfo = await parser.parseDatabaseResponse(response, itemId, language);
            
            const embed = createItemEmbed({
                title: translations.item.title,
                description: itemInfo,
                itemId,
                footer: translations.credits.divinePride
            });

            await selectInteraction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error showing item details', { error: error.message });
            await selectInteraction.editReply({
                content: translations.errors.itemDetails
            }).catch(() => {});
        }
    });

    collector.on('end', () => {
        message.edit({ components: [] }).catch(() => {});
    });
}

/**
 * Sets up a collector for monster details
 * @param {Message} message - The message to collect from
 * @param {string} customId - The custom ID to filter
 * @param {string} language - Language code
 * @param {Object} translations - Translation object
 * @returns {void}
 */
function setupMonsterCollector(message, customId, language, translations) {
    const collector = message.createMessageComponentCollector({
        filter: i => i.customId === customId,
        time: TIMEOUTS.COLLECTOR
    });

    collector.on('collect', async (selectInteraction) => {
        try {
            const monsterId = selectInteraction.values[0].replace('monster_', '');
            
            await selectInteraction.deferReply({ flags: MessageFlags.Ephemeral });
            
            // Fetch monster details
            const response = await divinePride.monsterSearch(monsterId, language);
            const monsterInfo = await parser.parseMonsterResponse(response, monsterId, language);
            
            const embed = createMonsterEmbed({
                title: translations.monster.title,
                description: monsterInfo,
                monsterId,
                footer: translations.credits.divinePride
            });

            await selectInteraction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error showing monster details', { error: error.message });
            await selectInteraction.editReply({
                content: translations.errors.monsterDetails
            }).catch(() => {});
        }
    });

    collector.on('end', () => {
        message.edit({ components: [] }).catch(() => {});
    });
}

/**
 * Sets up a collector for map details
 * @param {Message} message - The message to collect from
 * @param {string} customId - The custom ID to filter
 * @param {string} language - Language code
 * @param {Object} translations - Translation object
 * @returns {void}
 */
function setupMapCollector(message, customId, language, translations) {
    const collector = message.createMessageComponentCollector({
        filter: i => i.customId === customId,
        time: TIMEOUTS.COLLECTOR
    });

    collector.on('collect', async (selectInteraction) => {
        try {
            const mapId = selectInteraction.values[0].replace('map_', '');
            
            await selectInteraction.deferReply({ flags: MessageFlags.Ephemeral });
            
            // Fetch map details
            const response = await divinePride.mapSearch(mapId, language);
            const mapInfo = await parser.parseMapResponse(response, mapId, language);
            
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
                } catch {}
            }
            
            const embed = createMapEmbed({
                title: translations.map.title,
                description: mapInfo,
                mapImage,
                footer: translations.credits.divinePride
            });

            await selectInteraction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error showing map details', { error: error.message });
            await selectInteraction.editReply({
                content: translations.errors.mapDetails
            }).catch(() => {});
        }
    });

    collector.on('end', () => {
        message.edit({ components: [] }).catch(() => {});
    });
}

module.exports = {
    setupItemCollector,
    setupMonsterCollector,
    setupMapCollector
};

