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
                    name: '🔍 Busca no Divine Pride',
                    value: 'Os comandos abaixo detectam automaticamente se você está buscando por **nome** ou **ID**:',
                    inline: false
                },
                {
                    name: '/buscar-item',
                    value: 'Busca itens por nome ou ID\n**Exemplos:**\n• `/buscar-item busca:Poring` - busca por nome\n• `/buscar-item busca:501` - busca por ID',
                    inline: false
                },
                {
                    name: '/buscar-monstro',
                    value: 'Busca monstros por nome ou ID\n**Exemplos:**\n• `/buscar-monstro busca:Poring` - busca por nome\n• `/buscar-monstro busca:1002` - busca por ID',
                    inline: false
                },
                {
                    name: '/buscar-mapa',
                    value: 'Busca mapas por nome ou ID\n**Exemplos:**\n• `/buscar-mapa busca:Prontera` - busca por nome\n• `/buscar-mapa busca:prt_fild01` - busca por ID',
                    inline: false
                },
                {
                    name: '📚 Busca na Wiki',
                    value: '`/wiki termo:Poring` - Busca informações na Browiki',
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

