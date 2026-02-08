/**
 * Slash Command: /players
 * Shows online player counts for Ragnarok Online LATAM servers
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const playerCountService = require('../services/playerCountService');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('players')
        .setDescription('Mostra a quantidade de jogadores online nos servidores')
        .addBooleanOption(option =>
            option
                .setName('atualizar')
                .setDescription('Forçar uma nova verificação (pode demorar alguns segundos)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName('diagnostico')
                .setDescription('Mostrar informações de diagnóstico (admin)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const forceRefresh = interaction.options.getBoolean('atualizar') || false;
        const showDiagnostics = interaction.options.getBoolean('diagnostico') || false;

        await interaction.deferReply();

        try {
            let result;

            if (forceRefresh) {
                result = await playerCountService.forceCheck();
            } else {
                result = playerCountService.getPlayerCounts();

                if (result.cachedResult) {
                    result = result.cachedResult;
                } else {
                    // No in-memory cache (e.g. bot just started) — check file data
                    result = await playerCountService.forceCheck();
                }
            }

            // Diagnostics mode
            if (showDiagnostics) {
                return sendDiagnostics(interaction, result);
            }

            // Normal mode - show player counts
            return sendPlayerCounts(interaction, result);

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

/**
 * Sends the player count embed
 */
async function sendPlayerCounts(interaction, result) {
    const embed = new EmbedBuilder()
        .setTimestamp();

    if (result?.success && result.servers?.length > 0) {
        // We have player count data!
        const totalPlayers = result.servers.reduce((sum, s) => sum + (s.playerCount || 0), 0);

        embed
            .setColor('#5865F2')
            .setTitle('👥 Jogadores Online')
            .setDescription(`**Ragnarok Online LATAM** — Total: **${totalPlayers.toLocaleString('pt-BR')}** jogadores`);

        // Server bars
        const maxPlayers = Math.max(...result.servers.map(s => s.playerCount || 0), 1);

        for (const server of result.servers) {
            const count = server.playerCount || 0;
            const barLength = 20;
            const filled = Math.round((count / maxPlayers) * barLength);
            const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
            const emoji = getServerEmoji(server.name);

            embed.addFields({
                name: `${emoji} ${server.name}`,
                value: `\`${bar}\` **${count.toLocaleString('pt-BR')}**`,
                inline: false
            });
        }

        // Strategy info
        const strategyText = result.strategy === 'proxy_capture' ? '🔄 Proxy (tempo real)' :
            result.strategy === 'sso' ? '🔐 SSO' :
            result.strategy === 'login' ? '🔑 Login' : '📡 Probe';
        const timeInfo = result.responseTime || result.elapsed
            ? ` • Tempo: ${result.responseTime || result.elapsed}ms`
            : '';
        embed.addFields({
            name: '📊 Informações',
            value: `Método: ${strategyText}${timeInfo}`,
            inline: false
        });

        if (result.timestamp) {
            embed.setFooter({ text: `BeeWiki • Atualizado em ${formatTime(result.timestamp)}` });
        }

    } else {
        // No player count data - show what we know
        embed
            .setColor('#F5A623')
            .setTitle('👥 Jogadores Online')
            .setDescription('Não foi possível obter a contagem de jogadores neste momento.');

        // Show server status from the main status service
        const statusInfo = [];

        if (result?.openPorts?.length > 0) {
            statusInfo.push(`📡 ${result.openPorts.length} porta(s) de char server encontrada(s)`);
        }

        if (result?.probeResults) {
            const pr = result.probeResults;
            statusInfo.push(`🔍 Hosts resolvidos: ${pr.hostsResolved}`);
            statusInfo.push(`🚪 Portas abertas: ${pr.openPorts}`);
            statusInfo.push(`📨 Respostas: ${pr.responses}`);
        }

        if (result?.error) {
            statusInfo.push(`⚠️ ${result.error}`);
        }

        if (statusInfo.length > 0) {
            embed.addFields({
                name: '📋 Resultado da Análise',
                value: statusInfo.join('\n'),
                inline: false
            });
        }

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
                'Os dados de players sao capturados automaticamente!',
                '',
                '> Cada login no jogo atualiza os dados.',
                '> Nao precisa configurar nada no `.env`.'
            ].join('\n'),
            inline: false
        });

        embed.setFooter({ text: 'BeeWiki • Contagem de Jogadores' });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Sends diagnostics embed
 */
async function sendDiagnostics(interaction, result) {
    const diagnostics = playerCountService.getDiagnostics();
    const history = playerCountService.getHistory(5);

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🔧 Diagnóstico — Player Count')
        .setTimestamp();

    // Config
    embed.addFields({
        name: '⚙️ Configuração',
        value: [
            `**Account Server:** \`${diagnostics.config.accountServer.host}:${diagnostics.config.accountServer.port}\``,
            `**Login Strategy:** ${diagnostics.config.loginStrategyEnabled ? '✅ Habilitada' : '❌ Desabilitada'}`,
            `**Intervalo:** ${diagnostics.config.checkIntervalMs / 60000} min`,
            `**Hosts para probe:** ${diagnostics.config.charServerHosts.length}`,
            `**Portas para probe:** ${diagnostics.config.charServerPorts.join(', ')}`
        ].join('\n'),
        inline: false
    });

    // Probe results
    if (diagnostics.probeResults?.openPorts?.length > 0) {
        const portsInfo = diagnostics.probeResults.openPorts
            .map(p => `• \`${p.host}:${p.port}\` (${p.connectTime}ms${p.receivedBytes ? `, ${p.receivedBytes} bytes` : ''})`)
            .join('\n');

        embed.addFields({
            name: '🚪 Portas Abertas Encontradas',
            value: portsInfo.substring(0, 1024),
            inline: false
        });
    }

    // Discovered char servers
    if (diagnostics.discoveredCharServers?.length > 0) {
        const csInfo = diagnostics.discoveredCharServers
            .map(cs => `• **${cs.name}** → \`${cs.ip}:${cs.port}\``)
            .join('\n');

        embed.addFields({
            name: '🎯 Char Servers Descobertos',
            value: csInfo,
            inline: false
        });
    }

    // Recent history
    if (history.length > 0) {
        const historyText = history.map(h => {
            const time = formatTime(h.timestamp);
            const players = h.totalPlayers != null ? `${h.totalPlayers} players` : 'N/A';
            return `\`${time}\` — ${h.strategy} — ${players}`;
        }).join('\n');

        embed.addFields({
            name: '📈 Histórico Recente',
            value: historyText.substring(0, 1024),
            inline: false
        });
    }

    // Current check result
    if (result) {
        const resultInfo = [
            `**Sucesso:** ${result.success ? '✅' : '❌'}`,
            `**Estratégia:** ${result.strategy || 'N/A'}`,
            `**Tempo:** ${result.elapsed || result.responseTime || '?'}ms`,
            `**Servidores:** ${result.servers?.length || 0}`
        ];

        if (result.error) {
            resultInfo.push(`**Erro:** ${result.error}`);
        }

        embed.addFields({
            name: '🔄 Última Verificação',
            value: resultInfo.join('\n'),
            inline: false
        });
    }

    embed.setFooter({ text: 'BeeWiki • Diagnóstico' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Gets emoji for server name
 */
function getServerEmoji(name) {
    if (!name) return '🎮';
    const n = name.toUpperCase();
    if (n.includes('FREY')) return '⚔️';
    if (n.includes('NIDH')) return '🐉';
    if (n.includes('YGGD')) return '🌳';
    return '🎮';
}

/**
 * Formats timestamp to BRT
 */
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
