/**
 * Slash Command: /buscar-monstro
 * Searches for monster information by ID
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const divinePride = require('../integrations/database/divine-pride');
const settings = require('../integrations/const.json');
const parser = require('../utils/parser');
const logger = require('../utils/logger');
const config = require('../config');
const i18n = require('../utils/i18n');
const { ValidationError, CommandError } = require('../utils/errors');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buscar-monstro')
        .setDescription('Busca informações de um monstro pelo ID')
        .addStringOption(option =>
            option
                .setName('id')
                .setDescription('ID do monstro')
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

        const monsterId = interaction.options.getString('id');
        const language = interaction.options.getString('idioma') || config.defaultLanguage;
        const t = i18n.getLanguage(language);

        // Validate monster ID
        if (!/^\d+$/.test(monsterId)) {
            return interaction.editReply(t.errors.invalidId.replace('item', 'monstro'));
        }

        try {
            const response = await divinePride.monsterSearch(monsterId, language);
            const monsterInfo = await parser.parseMonsterResponse(response, monsterId, language);
            
            const thumbnail = settings.assets[1].url;
            const monsterImage = `https://static.divine-pride.net/images/mobs/png/${monsterId}.png`;
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(t.monster.title)
                .setThumbnail(thumbnail)
                .setImage(monsterImage)
                .setDescription(monsterInfo)
                .addFields({
                    name: '\u200b',
                    value: t.credits.divinePride
                })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error searching monster', { monsterId, language, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply(t.errors.monsterNotFound);
        }
    }
};

