/**
 * Token Capture Command
 * Manages automatic SSO token capture from Ragnarok Online game client
 * 
 * The proxy runs on the Linux server and captures tokens from game clients
 * on the same LAN that have their hosts file pointing to this server.
 * 
 * Usage:
 * /token-capture start   - Start token capture proxy
 * /token-capture stop    - Stop token capture
 * /token-capture status  - Check capture status and last token
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const tokenCaptureService = require('../services/tokenCaptureService');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('token-capture')
        .setDescription('Gerencia captura automática de token SSO do cliente do jogo')
        .addSubcommand(sub =>
            sub.setName('start').setDescription('Inicia o proxy de captura de token')
        )
        .addSubcommand(sub =>
            sub.setName('stop').setDescription('Para o proxy de captura de token')
        )
        .addSubcommand(sub =>
            sub.setName('status').setDescription('Verifica status da captura de token')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'start') {
                const status = await tokenCaptureService.startCapture();

                const embed = new EmbedBuilder()
                    .setTitle('🔐 Captura de Token Iniciada')
                    .setColor(0x00FF00)
                    .setDescription([
                        'O proxy transparente está rodando e aguardando conexões do cliente do jogo.',
                        '',
                        '**Arquitetura:**',
                        '```',
                        'Windows (jogo) → Linux (proxy) → Servidor Real',
                        '                  ↓ captura token',
                        '                  ↓ salva no .env',
                        '```'
                    ].join('\n'))
                    .addFields(
                        {
                            name: '📡 Proxy',
                            value: `\`${status.localIp}:${status.listenPort}\``,
                            inline: true
                        },
                        {
                            name: '🎮 Servidor Real',
                            value: `\`${status.targetIp}:${status.targetPort}\``,
                            inline: true
                        },
                        {
                            name: '📋 Configuração no Windows (uma vez)',
                            value: [
                                '1. Abrir **Bloco de Notas como Administrador**',
                                '2. Abrir o arquivo:',
                                '   `C:\\Windows\\System32\\drivers\\etc\\hosts`',
                                '3. Adicionar esta linha no final:',
                                '```',
                                `${status.localIp}  ${status.targetHost}`,
                                '```',
                                '4. Salvar e fechar',
                                '5. **Abrir o jogo e logar normalmente**',
                                '',
                                '> O token será capturado automaticamente!'
                            ].join('\n'),
                            inline: false
                        }
                    )
                    .setFooter({ text: 'Quando quiser parar, use /token-capture stop e remova a linha do hosts' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });

            } else if (subcommand === 'stop') {
                tokenCaptureService.stopCapture();

                const embed = new EmbedBuilder()
                    .setTitle('🛑 Captura de Token Parada')
                    .setColor(0xFF9900)
                    .setDescription('O proxy foi parado. Lembre-se de remover a linha do arquivo hosts no Windows.')
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });

            } else if (subcommand === 'status') {
                const status = tokenCaptureService.getStatus();

                const embed = new EmbedBuilder()
                    .setTitle('📊 Status da Captura de Token')
                    .setColor(status.running ? 0x00FF00 : 0x666666)
                    .addFields(
                        {
                            name: 'Status',
                            value: status.running ? '🟢 Rodando' : '⚫ Parado',
                            inline: true
                        }
                    )
                    .setTimestamp();

                if (status.running) {
                    embed.addFields(
                        {
                            name: 'Proxy',
                            value: `\`${status.localIp}:${status.listenPort}\``,
                            inline: true
                        },
                        {
                            name: 'Conexões',
                            value: `${status.connections}`,
                            inline: true
                        },
                        {
                            name: 'Tokens Capturados',
                            value: `${status.tokensCaptured}`,
                            inline: true
                        }
                    );

                    if (status.lastToken) {
                        embed.addFields({
                            name: '🔑 Último Token',
                            value: [
                                `**Usuário:** ${status.lastToken.username || 'N/A'}`,
                                `**Tamanho:** ${status.lastToken.length} chars`,
                                `**Preview:** \`${status.lastToken.preview}\``,
                                `**Capturado em:** ${status.lastToken.capturedAt}`
                            ].join('\n'),
                            inline: false
                        });
                    }
                }

                await interaction.reply({ embeds: [embed] });
            }

        } catch (error) {
            logger.error('Token capture command error', { error: error.message });

            const embed = new EmbedBuilder()
                .setTitle('❌ Erro')
                .setColor(0xFF0000)
                .setDescription(`Erro ao executar comando: ${error.message}`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};
