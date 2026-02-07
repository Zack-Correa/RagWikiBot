/**
 * Slash Command: /alerta-mercado
 * Manages market alerts for users (whitelisted users or admins)
 * Allows adding, removing, and listing alerts
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const alertStorage = require('../../utils/alertStorage');
const marketAlertService = require('../../services/marketAlertService');
const configStorage = require('../../utils/configStorage');
const gnjoy = require('../../integrations/database/gnjoy');
const logger = require('../../utils/logger');
const { COLORS } = require('../../utils/constants');
const { getServerChoices, getStoreTypeChoices } = require('../../utils/commandHelpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('alerta-mercado')
        .setDescription('Gerencia alertas de mercado')
        .addSubcommand(subcommand =>
            subcommand
                .setName('adicionar')
                .setDescription('Adiciona um novo alerta de mercado')
                .addStringOption(option =>
                    option
                        .setName('item')
                        .setDescription('Nome do item a monitorar')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('tipo')
                        .setDescription('Tipo de transação')
                        .setRequired(true)
                        .addChoices(...getStoreTypeChoices())
                )
                .addStringOption(option =>
                    option
                        .setName('servidor')
                        .setDescription('Servidor')
                        .setRequired(true)
                        .addChoices(...getServerChoices())
                )
                .addIntegerOption(option =>
                    option
                        .setName('preco-maximo')
                        .setDescription('Preço máximo em zeny (opcional)')
                        .setRequired(false)
                        .setMinValue(1)
                )
                .addIntegerOption(option =>
                    option
                        .setName('quantidade-minima')
                        .setDescription('Quantidade mínima (opcional)')
                        .setRequired(false)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remover')
                .setDescription('Remove um alerta de mercado')
                .addStringOption(option =>
                    option
                        .setName('id')
                        .setDescription('ID do alerta a remover')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('listar')
                .setDescription('Lista todos os seus alertas de mercado')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('limpar')
                .setDescription('Remove todos os seus alertas')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Mostra o status do sistema de alertas')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('verificar')
                .setDescription('Força uma verificação imediata dos alertas')
        ),

    async execute(interaction) {
        // Check if user is allowed (whitelist, username, role, or admin)
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const roleIds = interaction.member.roles.cache.map(role => role.id);
        
        const isAllowed = configStorage.isUserAllowed({
            userId: interaction.user.id,
            username: interaction.user.username,
            roleIds,
            isAdmin
        });
        
        if (!isAllowed) {
            return interaction.reply({
                content: '❌ Você não tem permissão para usar este comando. Entre em contato com um administrador para ser adicionado à lista de permissões.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'adicionar':
                await handleAdd(interaction);
                break;
            case 'remover':
                await handleRemove(interaction);
                break;
            case 'listar':
                await handleList(interaction);
                break;
            case 'limpar':
                await handleClear(interaction);
                break;
            case 'status':
                await handleStatus(interaction);
                break;
            case 'verificar':
                await handleForceCheck(interaction);
                break;
        }
    }
};

/**
 * Handles adding a new alert
 */
async function handleAdd(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const item = interaction.options.getString('item');
    const storeType = interaction.options.getString('tipo');
    const server = interaction.options.getString('servidor');
    const maxPrice = interaction.options.getInteger('preco-maximo');
    const minQuantity = interaction.options.getInteger('quantidade-minima');

    try {
        const alert = alertStorage.addAlert({
            userId: interaction.user.id,
            searchTerm: item,
            storeType,
            server,
            maxPrice,
            minQuantity
        });

        const storeTypeLabel = gnjoy.getStoreTypeLabel(storeType);
        
        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle('✅ Alerta Criado!')
            .setDescription('Você será notificado por DM quando este item aparecer no mercado.')
            .addFields(
                { name: '📦 Item', value: item, inline: true },
                { name: '🔄 Tipo', value: storeTypeLabel, inline: true },
                { name: '🌐 Servidor', value: server, inline: true }
            )
            .setTimestamp();

        if (maxPrice) {
            embed.addFields({ 
                name: '💰 Preço Máximo', 
                value: `${gnjoy.formatPrice(maxPrice)}z`, 
                inline: true 
            });
        }

        if (minQuantity) {
            embed.addFields({ 
                name: '📊 Quantidade Mínima', 
                value: `${minQuantity}`, 
                inline: true 
            });
        }

        embed.addFields({ 
            name: '🆔 ID do Alerta', 
            value: `\`${alert.id}\``, 
            inline: false 
        });

        embed.setFooter({ 
            text: 'O bot verifica o mercado a cada 15 minutos' 
        });

        await interaction.editReply({ embeds: [embed] });

        logger.info('Alert added via command', { 
            userId: interaction.user.id, 
            alertId: alert.id,
            item 
        });
    } catch (error) {
        logger.error('Error adding alert', { error: error.message });
        await interaction.editReply(`❌ ${error.message}`);
    }
}

/**
 * Handles removing an alert
 */
async function handleRemove(interaction) {
    const alertId = interaction.options.getString('id');

    const removed = alertStorage.removeAlert(alertId, interaction.user.id);

    if (removed) {
        await interaction.reply({
            content: `✅ Alerta \`${alertId}\` removido com sucesso!`,
            ephemeral: true
        });
    } else {
        await interaction.reply({
            content: `❌ Alerta não encontrado ou você não tem permissão para removê-lo.`,
            ephemeral: true
        });
    }
}

/**
 * Handles listing user's alerts
 */
async function handleList(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const alerts = alertStorage.getUserAlerts(interaction.user.id);

    if (alerts.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('📋 Seus Alertas de Mercado')
            .setDescription('Você não tem nenhum alerta configurado.\n\nUse `/alerta-mercado adicionar` para criar um novo alerta.')
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle('📋 Seus Alertas de Mercado')
        .setDescription(`Você tem **${alerts.length}** alerta(s) configurado(s).`)
        .setTimestamp();

    // Group alerts by server for better organization
    const byServer = {};
    for (const alert of alerts) {
        if (!byServer[alert.server]) {
            byServer[alert.server] = [];
        }
        byServer[alert.server].push(alert);
    }

    for (const [server, serverAlerts] of Object.entries(byServer)) {
        const alertList = serverAlerts.map(alert => {
            const storeLabel = alert.storeType === 'BUY' ? `🟢 ${gnjoy.getStoreTypeLabel(alert.storeType)}` : `🔴 ${gnjoy.getStoreTypeLabel(alert.storeType)}`;
            const filters = [];
            if (alert.maxPrice) filters.push(`≤${gnjoy.formatPrice(alert.maxPrice)}z`);
            if (alert.minQuantity) filters.push(`≥${alert.minQuantity}un`);
            const filterStr = filters.length > 0 ? ` (${filters.join(', ')})` : '';
            
            return `• **${alert.searchTerm}** - ${storeLabel}${filterStr}\n  ID: \`${alert.id}\``;
        }).join('\n\n');

        embed.addFields({
            name: `🌐 ${server}`,
            value: alertList.substring(0, 1024),
            inline: false
        });
    }

    embed.setFooter({ 
        text: 'Use /alerta-mercado remover <id> para remover um alerta' 
    });

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Handles clearing all user's alerts
 */
async function handleClear(interaction) {
    const removed = alertStorage.clearUserAlerts(interaction.user.id);

    if (removed > 0) {
        await interaction.reply({
            content: `✅ ${removed} alerta(s) removido(s) com sucesso!`,
            ephemeral: true
        });
    } else {
        await interaction.reply({
            content: `ℹ️ Você não tinha nenhum alerta para remover.`,
            ephemeral: true
        });
    }
}

/**
 * Handles showing system status
 */
async function handleStatus(interaction) {
    const status = marketAlertService.getStatus();

    const embed = new EmbedBuilder()
        .setColor(status.running ? COLORS.SUCCESS : COLORS.WARNING)
        .setTitle('📊 Status do Sistema de Alertas')
        .addFields(
            { 
                name: '🔄 Status', 
                value: status.running ? '✅ Ativo' : '❌ Parado', 
                inline: true 
            },
            { 
                name: '⏱️ Intervalo', 
                value: `${status.intervalMinutes} minutos`, 
                inline: true 
            },
            { 
                name: '⏸️ Cooldown', 
                value: `${status.cooldownMinutes} minutos`, 
                inline: true 
            },
            { 
                name: '📋 Total de Alertas', 
                value: `${status.totalAlerts}`, 
                inline: true 
            },
            { 
                name: '👥 Usuários', 
                value: `${status.uniqueUsers}`, 
                inline: true 
            },
            { 
                name: '🔍 Buscas Únicas', 
                value: `${status.uniqueSearches}`, 
                inline: true 
            }
        )
        .setTimestamp();

    if (status.lastCheck) {
        const lastCheckDate = new Date(status.lastCheck);
        embed.addFields({
            name: '🕐 Última Verificação',
            value: `<t:${Math.floor(lastCheckDate.getTime() / 1000)}:R>`,
            inline: false
        });
    }

    if (status.isChecking) {
        embed.addFields({
            name: '⚡ Verificação em Andamento',
            value: 'Uma verificação está sendo executada agora.',
            inline: false
        });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handles forcing an immediate check
 */
async function handleForceCheck(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const status = marketAlertService.getStatus();

    if (status.isChecking) {
        return interaction.editReply('⏳ Uma verificação já está em andamento. Aguarde...');
    }

    await interaction.editReply('🔍 Iniciando verificação manual dos alertas...');

    try {
        await marketAlertService.forceCheck();
        
        const newStatus = marketAlertService.getStatus();
        await interaction.followUp({
            content: `✅ Verificação concluída!\n📋 ${newStatus.totalAlerts} alerta(s) verificados.`,
            ephemeral: true
        });
    } catch (error) {
        logger.error('Error in force check', { error: error.message });
        await interaction.followUp({
            content: `❌ Erro durante a verificação: ${error.message}`,
            ephemeral: true
        });
    }
}
