/**
 * Slash Command: /buscar-monstro
 * Searches for monster information by ID
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const divinePride = require('../integrations/database/divine-pride');
const settings = require('../integrations/const.json');
const parser = require('../utils/parser');
const logger = require('../utils/logger');
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
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const monsterId = interaction.options.getString('id');

        // Validate monster ID
        if (!/^\d+$/.test(monsterId)) {
            return interaction.editReply('❌ O ID do monstro deve ser um número.');
        }

        try {
            const response = await divinePride.monsterSearch(monsterId);
            const monsterInfo = await parser.parseMonsterResponse(response, monsterId);
            
            const thumbnail = settings.assets[1].url;
            const monsterImage = `https://static.divine-pride.net/images/mobs/png/${monsterId}.png`;
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Informações do Monstro')
                .setThumbnail(thumbnail)
                .setImage(monsterImage)
                .setDescription(monsterInfo)
                .addFields({
                    name: '\u200b',
                    value: '*Conteúdo fornecido por [Divine Pride](https://www.divine-pride.net)*'
                })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error searching monster', { monsterId, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply('❌ Não foi possível obter informações do monstro.');
        }
    }
};

