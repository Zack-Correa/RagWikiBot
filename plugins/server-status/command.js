/**
 * Server Status Command
 * Shows the current status of Ragnarok Online LATAM servers
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const service = require('./service');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servidor-status')
        .setDescription('Mostra o status dos servidores de Ragnarok Online LATAM'),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        try {
            const status = service.getStatus();
            const servers = status.servers;
            
            // Determine overall status
            const serverList = Object.entries(servers);
            const anyOnline = serverList.some(([_, s]) => s.online === true);
            const anyOffline = serverList.some(([_, s]) => s.online === false);
            const allUnknown = serverList.every(([_, s]) => s.online === null);
            
            let color = '#F5A623'; // Yellow - unknown
            let statusTitle = '⚪ Status Desconhecido';
            
            if (anyOnline && !anyOffline) {
                color = '#3BA55C'; // Green
                statusTitle = '🟢 Servidores Online';
            } else if (anyOffline && !anyOnline) {
                color = '#ED4245'; // Red
                statusTitle = '🔴 Servidores Offline';
            } else if (!allUnknown) {
                color = '#F5A623'; // Yellow - partial
                statusTitle = '🟡 Status Parcial';
            }
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(statusTitle)
                .setDescription('Ragnarok Online LATAM')
                .setTimestamp();
            
            // Show all servers in one field
            const serverStatusText = serverList.map(([name, s]) => {
                const emoji = s.online === null ? '⚪' : (s.online ? '🟢' : '🔴');
                const statusText = s.online === null ? 'Desconhecido' : (s.online ? 'Online' : 'Offline');
                return `${emoji} **${name}**: ${statusText}`;
            }).join('\n');
            
            embed.addFields({
                name: 'Servidores',
                value: serverStatusText,
                inline: false
            });
            
            // Last check info
            if (status.lastUpdated) {
                const lastCheck = new Date(status.lastUpdated);
                embed.addFields({
                    name: '📊 Última Verificação',
                    value: formatRelativeTime(lastCheck),
                    inline: true
                });
            }
            
            // Response time (same for all servers)
            const firstServer = serverList[0];
            if (firstServer && firstServer[1].responseTimeMs) {
                embed.addFields({
                    name: '⏱️ Tempo de Resposta',
                    value: `${firstServer[1].responseTimeMs}ms`,
                    inline: true
                });
            }
            
            // Next check info
            const interval = status.intervalHours || (status.intervalMinutes / 60);
            embed.addFields({
                name: '🔄 Intervalo',
                value: `${interval} horas`,
                inline: true
            });
            
            embed.setFooter({ text: `BeeWiki • ${status.accountServer}` });
            
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            logger.error('Error getting server status', { error: error.message });
            
            const embed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('❌ Erro')
                .setDescription('Não foi possível obter o status dos servidores.')
                .setFooter({ text: 'BeeWiki' })
                .setTimestamp();
            
            return interaction.editReply({ embeds: [embed] });
        }
    }
};

/**
 * Formats a date relative to now
 * @param {Date} date - Date to format
 * @returns {string} Relative time string
 */
function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSeconds < 60) {
        return 'Agora mesmo';
    } else if (diffMinutes < 60) {
        return `Há ${diffMinutes} minuto${diffMinutes > 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
        return `Há ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    } else {
        return `Há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
    }
}
