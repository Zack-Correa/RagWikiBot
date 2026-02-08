/**
 * Slash Command: /server-status
 * Shows real-time status of Ragnarok Online LATAM servers.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const serverStatusService = require('../services/serverStatusService');
const serverStatusStorage = require('../utils/serverStatusStorage');
const playerCountStore = require('../utils/playerCountStore');
const tokenMetrics = require('../utils/tokenMetrics');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('server-status')
        .setDescription('Mostra o status dos servidores de Ragnarok Online LATAM')
        .addBooleanOption(option =>
            option
                .setName('atualizar')
                .setDescription('Forçar uma nova verificação (pode demorar alguns segundos)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const forceRefresh = interaction.options.getBoolean('atualizar') || false;

        await interaction.deferReply();

        try {
            if (forceRefresh) {
                await serverStatusService.forceCheck();
            }

            const status = serverStatusService.getStatus();
            const playerData = playerCountStore.getLatest();
            const history = serverStatusStorage.getHistory(5);

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🖥️ Status dos Servidores')
                .setDescription('**Ragnarok Online LATAM**')
                .setTimestamp();

            // Server status rows
            const SERVERS = serverStatusService.SERVERS;
            const gameServers = ['FREYA', 'NIDHOGG', 'YGGDRASIL'];

            for (const key of gameServers) {
                const srv = SERVERS[key];
                const st = status.servers?.[key];
                const playerInfo = playerData?.servers?.find(s => s.key === key);

                const online = st?.online;
                const icon = online === true ? '🟢' : online === false ? '🔴' : '⚪';
                const statusText = online === true ? 'Online' : online === false ? 'Offline' : 'Desconhecido';
                const latency = st?.responseTimeMs ? `${st.responseTimeMs}ms` : '—';
                const players = playerInfo ? `👥 ${playerInfo.playerCount.toLocaleString('pt-BR')}` : '';

                embed.addFields({
                    name: `${srv.emoji} ${srv.name}`,
                    value: `${icon} ${statusText} • ⏱ ${latency}${players ? ` • ${players}` : ''}`,
                    inline: false
                });
            }

            // Account server
            const accountSt = status.servers?.ACCOUNT;
            if (accountSt) {
                const acIcon = accountSt.online ? '🟢' : accountSt.online === false ? '🔴' : '⚪';
                embed.addFields({
                    name: '🔐 Account Server',
                    value: `${acIcon} ${accountSt.online ? 'Online' : 'Offline'} • ⏱ ${accountSt.responseTimeMs || '—'}ms`,
                    inline: false
                });
            }

            // Player count total
            if (playerData) {
                const age = Date.now() - new Date(playerData.timestamp).getTime();
                const ageMin = Math.round(age / 60000);
                const freshness = ageMin < 1 ? 'agora' :
                    ageMin < 60 ? `${ageMin}min atrás` :
                    `${Math.round(ageMin / 60)}h atrás`;

                embed.addFields({
                    name: '👥 Total Online',
                    value: `**${playerData.totalPlayers.toLocaleString('pt-BR')}** jogadores (${freshness})`,
                    inline: false
                });
            }

            // Recent status changes
            if (history.length > 0) {
                const changeLines = history.slice(0, 3).map(h => {
                    const time = formatTime(h.timestamp);
                    const icon = h.newStatus ? '🟢' : '🔴';
                    return `\`${time}\` ${icon} **${h.server}** → ${h.newStatus ? 'Online' : 'Offline'}`;
                });

                embed.addFields({
                    name: '📋 Mudanças Recentes',
                    value: changeLines.join('\n') || 'Nenhuma mudança registrada',
                    inline: false
                });
            }

            // Token info
            const tokenInfo = tokenMetrics.getCurrent();
            if (tokenInfo) {
                const tokenStatus = tokenInfo.status === 'active' ? '🟢 Ativo' : '🔴 Expirado';
                const tokenAge = tokenInfo.ageHuman || '?';
                const tokenUses = tokenInfo.useCount || 0;
                embed.addFields({
                    name: '🔑 Token SSO',
                    value: `${tokenStatus} • Idade: ${tokenAge} • Usos: ${tokenUses}`,
                    inline: false
                });
            }

            // TTL stats
            const ttlStats = tokenMetrics.getStats();
            if (ttlStats.avgTTLhuman) {
                embed.addFields({
                    name: '⏱ TTL Estimado',
                    value: `Médio: **${ttlStats.avgTTLhuman}** • Mín: ${ttlStats.minTTLhuman || '?'} • Máx: ${ttlStats.maxTTLhuman || '?'}`,
                    inline: false
                });
            }

            // Last check info
            const lastCheck = status.lastUpdated;
            embed.setFooter({
                text: `BeeWiki • Probe a cada ${status.intervalMinutes}min${lastCheck ? ` • Último: ${formatTime(lastCheck)}` : ''}`
            });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error('Error in /server-status command', { error: error.message });

            const embed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('❌ Erro')
                .setDescription('Não foi possível verificar o status dos servidores.')
                .setFooter({ text: 'BeeWiki' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    }
};

function formatTime(timestamp) {
    try {
        return new Date(timestamp).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return timestamp;
    }
}
