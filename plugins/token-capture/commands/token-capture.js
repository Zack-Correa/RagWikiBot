/**
 * Token Capture Command
 * Manages automatic SSO token capture via transparent TCP proxy
 * 
 * Usage:
 * /token-capture start   - Start token capture proxy
 * /token-capture stop    - Stop token capture
 * /token-capture status  - Check capture status and last token
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const proxyService = require('../proxyService');

let logger = console;

function setLogger(l) {
    logger = l;
}

const data = new SlashCommandBuilder()
    .setName('token-capture')
    .setDescription('Gerencia captura automatica de token SSO do cliente do jogo')
    .addSubcommand(sub =>
        sub.setName('start').setDescription('Inicia o proxy de captura de token')
    )
    .addSubcommand(sub =>
        sub.setName('stop').setDescription('Para o proxy de captura de token')
    )
    .addSubcommand(sub =>
        sub.setName('status').setDescription('Verifica status da captura de token')
    );

async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
        if (subcommand === 'start') {
            const status = await proxyService.startCapture();

            const embed = new EmbedBuilder()
                .setTitle('Captura de Token Iniciada')
                .setColor(0x00FF00)
                .setDescription([
                    'O proxy transparente esta rodando e aguardando conexoes do cliente do jogo.',
                    '',
                    '**Arquitetura:**',
                    '```',
                    'Windows (jogo) -> Linux (proxy) -> Servidor Real',
                    '                  | captura token',
                    '                  | salva no .env',
                    '```'
                ].join('\n'))
                .addFields(
                    {
                        name: 'Proxy',
                        value: `\`${status.localIp}:${status.listenPort}\``,
                        inline: true
                    },
                    {
                        name: 'Servidor Real',
                        value: `\`${status.targetIp}:${status.targetPort}\``,
                        inline: true
                    },
                    {
                        name: 'Configuracao no Windows (uma vez)',
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
                            '> O token sera capturado automaticamente!'
                        ].join('\n'),
                        inline: false
                    }
                )
                .setFooter({ text: 'Para parar: /token-capture stop | Remova a linha do hosts ao terminar' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } else if (subcommand === 'stop') {
            proxyService.stopCapture();

            const embed = new EmbedBuilder()
                .setTitle('Captura de Token Parada')
                .setColor(0xFF9900)
                .setDescription('O proxy foi parado. Lembre-se de remover a linha do arquivo hosts no Windows.')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } else if (subcommand === 'status') {
            const status = proxyService.getStatus();

            const embed = new EmbedBuilder()
                .setTitle('Status da Captura de Token')
                .setColor(status.running ? 0x00FF00 : 0x666666)
                .addFields(
                    {
                        name: 'Status',
                        value: status.running ? 'Rodando' : 'Parado',
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
                        name: 'Conexoes',
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
                        name: 'Ultimo Token',
                        value: [
                            `**Usuario:** ${status.lastToken.username || 'N/A'}`,
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
            .setTitle('Erro')
            .setColor(0xFF0000)
            .setDescription(`Erro ao executar comando: ${error.message}`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

module.exports = {
    data,
    execute,
    setLogger
};
