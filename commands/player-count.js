/**
 * Slash Command: /players
 * Shows online player counts for Ragnarok Online LATAM servers.
 * 
 * Reads directly from the player count store (data/player-counts.json)
 * which is populated by the token-capture proxy.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const playerCountStore = require('../utils/playerCountStore');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('players')
        .setDescription('Mostra a quantidade de jogadores online nos servidores')
        .addStringOption(option =>
            option
                .setName('modo')
                .setDescription('Tipo de informação')
                .setRequired(false)
                .addChoices(
                    { name: 'Atual', value: 'atual' },
                    { name: 'Histórico (24h)', value: 'historico' },
                    { name: 'Estatísticas', value: 'stats' },
                    { name: 'Diagnóstico', value: 'diagnostico' }
                )
        ),

    async execute(interaction) {
        const mode = interaction.options.getString('modo') || 'atual';

        await interaction.deferReply();

        try {
            switch (mode) {
                case 'historico':
                    return sendHistory(interaction);
                case 'stats':
                    return sendStats(interaction);
                case 'diagnostico':
                    return sendDiagnostics(interaction);
                default:
                    return sendCurrent(interaction);
            }
        } catch (error) {
            logger.error('Error in /players command', { error: error.message });

            const embed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('❌ Erro')
                .setDescription('Não foi possível obter a contagem de jogadores.')
                .setFooter({ text: 'BeeWiki' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    }
};

// ============================================================
// /players (default) — Current player counts
// ============================================================

async function sendCurrent(interaction) {
    const latest = playerCountStore.getLatest();
    const embed = new EmbedBuilder().setTimestamp();

    if (latest && latest.servers?.length > 0) {
        const age = Date.now() - new Date(latest.timestamp).getTime();
        const ageMin = Math.round(age / 60000);

        embed
            .setColor('#5865F2')
            .setTitle('👥 Jogadores Online')
            .setDescription(`**Ragnarok Online LATAM** — Total: **${latest.totalPlayers.toLocaleString('pt-BR')}** jogadores`);

        const maxPlayers = Math.max(...latest.servers.map(s => s.playerCount || 0), 1);

        for (const server of latest.servers) {
            const count = server.playerCount || 0;
            const barLength = 20;
            const filled = Math.round((count / maxPlayers) * barLength);
            const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
            const emoji = getServerEmoji(server.key);

            embed.addFields({
                name: `${emoji} ${server.name}`,
                value: `\`${bar}\` **${count.toLocaleString('pt-BR')}**`,
                inline: false
            });
        }

        const freshness = ageMin < 1 ? 'agora' :
            ageMin < 60 ? `${ageMin}min atrás` :
            `${Math.round(ageMin / 60)}h atrás`;

        embed.setFooter({ text: `BeeWiki • Dados: ${freshness} • ${formatTime(latest.timestamp)}` });

    } else {
        embed
            .setColor('#F5A623')
            .setTitle('👥 Jogadores Online')
            .setDescription('Nenhum dado de player count disponível ainda.');

        embed.addFields({
            name: '💡 Como Habilitar',
            value: [
                '**1. Ativar o plugin de captura:**',
                '```',
                '/plugin enable token-capture',
                '/token-capture start',
                '```',
                '',
                '**2. Configurar o hosts no PC do jogo:**',
                'Editar `C:\\Windows\\System32\\drivers\\etc\\hosts`',
                '```',
                '<IP_DO_BOT>  lt-account-01.gnjoylatam.com',
                '```',
                '',
                '**3. Logar no jogo normalmente**',
                'Os dados são capturados automaticamente a cada login!'
            ].join('\n'),
            inline: false
        });

        embed.setFooter({ text: 'BeeWiki • Contagem de Jogadores' });
    }

    return interaction.editReply({ embeds: [embed] });
}

// ============================================================
// /players modo:historico — Last 24h timeline
// ============================================================

async function sendHistory(interaction) {
    const history = playerCountStore.getHistory(24);
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📈 Histórico de Players (24h)')
        .setTimestamp();

    if (history.length === 0) {
        embed.setDescription('Nenhum dado nas últimas 24 horas.');
        embed.setFooter({ text: 'BeeWiki' });
        return interaction.editReply({ embeds: [embed] });
    }

    embed.setDescription(`**${history.length}** capturas nas últimas 24 horas`);

    // Show last 10 entries as a table
    const recent = history.slice(0, 10);
    const lines = recent.map(h => {
        const time = formatTime(h.t);
        const parts = [];
        if (h.FREYA != null) parts.push(`F: ${h.FREYA}`);
        if (h.NIDHOGG != null) parts.push(`N: ${h.NIDHOGG}`);
        if (h.YGGDRASIL != null) parts.push(`Y: ${h.YGGDRASIL}`);
        return `\`${time}\` — ${parts.join(' | ')} — **${h.total}** total`;
    });

    embed.addFields({
        name: '🕐 Capturas Recentes',
        value: lines.join('\n') || 'N/A',
        inline: false
    });

    // Min/Max in period
    const totals = history.map(h => h.total).filter(t => t != null);
    if (totals.length > 0) {
        const peak = Math.max(...totals);
        const low = Math.min(...totals);
        const avg = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);

        embed.addFields({
            name: '📊 Resumo (24h)',
            value: [
                `🔺 Pico: **${peak.toLocaleString('pt-BR')}**`,
                `🔻 Mínimo: **${low.toLocaleString('pt-BR')}**`,
                `📊 Média: **${avg.toLocaleString('pt-BR')}**`
            ].join('\n'),
            inline: false
        });
    }

    embed.setFooter({ text: 'BeeWiki • Histórico' });
    return interaction.editReply({ embeds: [embed] });
}

// ============================================================
// /players modo:stats — Global statistics
// ============================================================

async function sendStats(interaction) {
    const stats = playerCountStore.getStats();
    const daily = playerCountStore.getDailyStats(7);
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📊 Estatísticas de Players')
        .setTimestamp();

    // Global
    const globalLines = [
        `📅 Primeira captura: ${stats.firstCapture ? formatTime(stats.firstCapture) : 'N/A'}`,
        `🔢 Total de capturas: **${(stats.totalCaptures || 0).toLocaleString('pt-BR')}**`
    ];

    if (stats.peak) {
        globalLines.push(`🏆 Pico absoluto: **${stats.peak.total.toLocaleString('pt-BR')}** (${formatTime(stats.peak.timestamp)})`);
    }

    embed.addFields({
        name: '🌐 Geral',
        value: globalLines.join('\n'),
        inline: false
    });

    // Peak by server
    if (stats.peakByServer && Object.keys(stats.peakByServer).length > 0) {
        const peakLines = Object.entries(stats.peakByServer).map(([key, p]) => {
            const emoji = getServerEmoji(key);
            return `${emoji} **${key}**: ${p.count.toLocaleString('pt-BR')} (${formatTime(p.timestamp)})`;
        });

        embed.addFields({
            name: '🏆 Pico por Servidor',
            value: peakLines.join('\n'),
            inline: false
        });
    }

    // Weekly daily summary
    const dailyDates = Object.keys(daily).sort();
    if (dailyDates.length > 0) {
        const dayLines = dailyDates.map(date => {
            const d = daily[date];
            return `\`${date}\` — ⬆ ${d.peak?.total || '?'} ⬇ ${d.low?.total || '?'} ≈ ${d.avgTotal || '?'} (${d.captures}x)`;
        });

        embed.addFields({
            name: '📅 Últimos 7 dias',
            value: dayLines.join('\n').substring(0, 1024),
            inline: false
        });
    }

    embed.setFooter({ text: 'BeeWiki • Estatísticas' });
    return interaction.editReply({ embeds: [embed] });
}

// ============================================================
// /players modo:diagnostico — Debug info
// ============================================================

async function sendDiagnostics(interaction) {
    const latest = playerCountStore.getLatest();
    const stats = playerCountStore.getStats();
    const history = playerCountStore.getHistory(1); // last 1h
    const hasRecent = playerCountStore.hasRecentData();

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🔧 Diagnóstico — Player Count')
        .setTimestamp();

    embed.addFields({
        name: '📦 Store',
        value: [
            `Arquivo: \`data/player-counts.json\``,
            `Dados recentes (< 2h): ${hasRecent ? '✅' : '❌'}`,
            `Total capturas: ${stats.totalCaptures || 0}`,
            `Primeira: ${stats.firstCapture ? formatTime(stats.firstCapture) : 'N/A'}`
        ].join('\n'),
        inline: false
    });

    if (latest) {
        const age = Date.now() - new Date(latest.timestamp).getTime();
        embed.addFields({
            name: '📡 Última Captura',
            value: [
                `Timestamp: ${latest.timestamp}`,
                `Idade: ${Math.round(age / 60000)} minutos`,
                `Fonte: ${latest.source}`,
                `Servidores: ${latest.servers.map(s => `${s.key}: ${s.playerCount}`).join(', ')}`,
                `Total: ${latest.totalPlayers}`
            ].join('\n'),
            inline: false
        });
    }

    embed.addFields({
        name: '🕐 Capturas (última hora)',
        value: `${history.length} capturas`,
        inline: false
    });

    embed.addFields({
        name: '⚙️ Configuração',
        value: [
            `RO_PROBE_USERNAME: ${process.env.RO_PROBE_USERNAME ? '✅ configurado' : '❌ ausente'}`,
            `RO_AUTH_TOKEN: ${process.env.RO_AUTH_TOKEN ? `✅ ${process.env.RO_AUTH_TOKEN.substring(0, 20)}...` : '❌ ausente'}`
        ].join('\n'),
        inline: false
    });

    embed.setFooter({ text: 'BeeWiki • Diagnóstico' });
    return interaction.editReply({ embeds: [embed] });
}

// ============================================================
// Helpers
// ============================================================

function getServerEmoji(key) {
    if (!key) return '🎮';
    const k = key.toUpperCase();
    if (k.includes('FREY')) return '⚔️';
    if (k.includes('NIDH')) return '🐉';
    if (k.includes('YGGD')) return '🌳';
    return '🎮';
}

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
