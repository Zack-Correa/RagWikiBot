/**
 * Slash Command: /buscar-mapa
 * Searches for map information by ID
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const divinePride = require('../integrations/database/divine-pride');
const settings = require('../integrations/const.json');
const parser = require('../utils/parser');
const logger = require('../utils/logger');
const config = require('../config');
const i18n = require('../utils/i18n');
const { ValidationError, CommandError } = require('../utils/errors');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buscar-mapa')
        .setDescription('Busca informações de um mapa pelo ID')
        .addStringOption(option =>
            option
                .setName('id')
                .setDescription('ID do mapa (ex: hu_fild03, prt_fild01)')
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

        const mapId = interaction.options.getString('id');
        const language = interaction.options.getString('idioma') || config.defaultLanguage;
        const t = i18n.getLanguage(language);

        // Validate map ID - can be a number or a string like "hu_fild03"
        if (!mapId || mapId.trim() === '') {
            return interaction.editReply('❌ O ID do mapa não pode estar vazio.');
        }

        try {
            const response = await divinePride.mapSearch(mapId, language);
            const mapInfo = await parser.parseMapResponse(response, mapId, language);
            
            // Try to get map image - first try original, then raw
            let mapImage = null;
            const originalUrl = `https://www.divine-pride.net/img/map/original/${mapId}`;
            const rawUrl = `https://www.divine-pride.net/img/map/raw/${mapId}`;
            
            try {
                // Try original first
                const originalResponse = await axios.head(originalUrl, { timeout: 5000 });
                if (originalResponse.status === 200) {
                    mapImage = originalUrl;
                    logger.debug('Using original map image', { mapId, url: originalUrl });
                }
            } catch (originalError) {
                // If original fails, try raw
                try {
                    const rawResponse = await axios.head(rawUrl, { timeout: 5000 });
                    if (rawResponse.status === 200) {
                        mapImage = rawUrl;
                        logger.debug('Using raw map image', { mapId, url: rawUrl });
                    }
                } catch (rawError) {
                    logger.warn('Map image not available', { mapId, originalError: originalError.message, rawError: rawError.message });
                }
            }
            
            const thumbnail = settings.assets[1].url;
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(t.map.title)
                .setThumbnail(thumbnail)
                .setDescription(mapInfo)
                .addFields({
                    name: '\u200b',
                    value: t.credits.divinePride
                })
                .setTimestamp();
            
            // Add map image if available
            if (mapImage) {
                embed.setImage(mapImage);
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error searching map', { mapId, language, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply(t.errors.mapNotFound);
        }
    }
};

