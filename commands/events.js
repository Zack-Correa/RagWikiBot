/**
 * Events Command
 * Shows latest news from GNJoy LATAM
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const gnjoyEvents = require('../integrations/database/gnjoy-events');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eventos')
        .setDescription('Mostra as últimas notícias e anúncios do GNJoy LATAM'),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        try {
            const news = await gnjoyEvents.getLatestNews();
            
            if (news.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#F5A623')
                    .setTitle('📰 Notícias do GNJoy')
                    .setDescription('Não foi possível carregar as notícias no momento. Tente novamente mais tarde.')
                    .setFooter({ text: 'BeeWiki • Notícias' })
                    .setTimestamp();
                
                return interaction.editReply({ embeds: [embed] });
            }
            
            // Categorize news
            const categories = gnjoyEvents.categorizeNews(news);
            
            // Get cache info
            const cacheInfo = gnjoyEvents.getNewsCacheInfo();
            
            const embed = new EmbedBuilder()
                .setColor('#F5A623')
                .setTitle('📰 Últimas Notícias do GNJoy LATAM')
                .setDescription(`Resumo das **${news.length}** notícias mais recentes\n[🔗 Ver todas no site](https://ro.gnjoylatam.com/pt/news/notice)`)
                .setThumbnail('https://ro.gnjoylatam.com/favicon.ico');
            
            // Add important notices first (avisos)
            if (categories.avisos.length > 0) {
                const avisosText = categories.avisos.slice(0, 5).map(n => 
                    `• [${n.title}](${n.url})${n.date ? ` *(${n.date})*` : ''}`
                ).join('\n');
                
                embed.addFields({
                    name: '⚠️ Avisos Importantes',
                    value: avisosText.substring(0, 1024),
                    inline: false
                });
            }
            
            // Add updates (atualizações)
            if (categories.atualizacoes.length > 0) {
                const updatesText = categories.atualizacoes.slice(0, 5).map(n => 
                    `• [${n.title}](${n.url})${n.date ? ` *(${n.date})*` : ''}`
                ).join('\n');
                
                embed.addFields({
                    name: '🔧 Atualizações',
                    value: updatesText.substring(0, 1024),
                    inline: false
                });
            }
            
            // Add events (eventos)
            if (categories.eventos.length > 0) {
                const eventsText = categories.eventos.slice(0, 5).map(n => 
                    `• [${n.title}](${n.url})${n.date ? ` *(${n.date})*` : ''}`
                ).join('\n');
                
                embed.addFields({
                    name: '🎉 Eventos e Promoções',
                    value: eventsText.substring(0, 1024),
                    inline: false
                });
            }
            
            // Add others if we have space
            if (categories.outros.length > 0) {
                const outrosText = categories.outros.slice(0, 5).map(n => 
                    `• [${n.title}](${n.url})${n.date ? ` *(${n.date})*` : ''}`
                ).join('\n');
                
                embed.addFields({
                    name: '📋 Outras Notícias',
                    value: outrosText.substring(0, 1024),
                    inline: false
                });
            }
            
            // Show last update info
            if (cacheInfo.lastRefresh) {
                const lastUpdate = new Date(cacheInfo.lastRefresh);
                const lastUpdateStr = lastUpdate.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                embed.setFooter({ text: `BeeWiki • Atualizado em ${lastUpdateStr}` });
            } else {
                embed.setFooter({ text: 'BeeWiki • Notícias do GNJoy LATAM' });
            }
            
            embed.setTimestamp();
            
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            logger.error('Error showing news', { error: error.message });
            return interaction.editReply({ content: '❌ Erro ao carregar notícias.' });
        }
    }
};
