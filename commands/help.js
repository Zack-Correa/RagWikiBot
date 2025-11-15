/**
 * Slash Command: /ajuda
 * Shows help information about available commands
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ajuda')
        .setDescription('Mostra informações sobre os comandos disponíveis'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📚 Comandos Disponíveis')
            .setDescription('Lista de comandos do RagWiki Bot')
            .addFields(
                {
                    name: '/buscar-item-id',
                    value: 'Busca um item pelo ID no banco de dados Divine Pride\n`/buscar-item-id id:501 servidor:iro`',
                    inline: false
                },
                {
                    name: '/buscar-item',
                    value: 'Busca itens pelo nome no banco de dados Divine Pride\n`/buscar-item nome:Poring servidor:iro`',
                    inline: false
                },
                {
                    name: '/wiki',
                    value: 'Busca informações na Browiki\n`/wiki termo:Poring`',
                    inline: false
                },
                {
                    name: '/buscar-monstro',
                    value: 'Busca informações de um monstro pelo ID\n`/buscar-monstro id:1002`',
                    inline: false
                },
                {
                    name: '/buscar-monstro-nome',
                    value: 'Busca monstros pelo nome no banco de dados Divine Pride\n`/buscar-monstro-nome nome:Poring servidor:iro`',
                    inline: false
                },
                {
                    name: '/buscar-mapa',
                    value: 'Busca informações de um mapa pelo ID\n`/buscar-mapa id:hu_fild03`',
                    inline: false
                },
                {
                    name: '/buscar-mapa-nome',
                    value: 'Busca mapas pelo nome no banco de dados Divine Pride\n`/buscar-mapa-nome nome:Prontera servidor:iro`',
                    inline: false
                },
                {
                    name: '📖 Documentação Completa',
                    value: 'Acesse [GitHub](https://github.com/Zack-Correa/RagWikiBot/blob/dev/README_PT-BR.md) para mais informações',
                    inline: false
                }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};

