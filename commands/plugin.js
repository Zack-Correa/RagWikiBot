/**
 * Plugin Command
 * Allows administrators to manage plugins via Discord
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const pluginService = require('../services/pluginService');
const pluginStorage = require('../utils/pluginStorage');
const deployService = require('../services/deployService');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('plugin')
        .setDescription('Gerencia plugins do bot (apenas administradores)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('listar')
                .setDescription('Lista todos os plugins instalados')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Mostra status detalhado de um plugin')
                .addStringOption(option =>
                    option.setName('nome')
                        .setDescription('Nome do plugin')
                        .setRequired(true)
                        .setAutocomplete(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('ativar')
                .setDescription('Ativa um plugin')
                .addStringOption(option =>
                    option.setName('nome')
                        .setDescription('Nome do plugin')
                        .setRequired(true)
                        .setAutocomplete(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('desativar')
                .setDescription('Desativa um plugin')
                .addStringOption(option =>
                    option.setName('nome')
                        .setDescription('Nome do plugin')
                        .setRequired(true)
                        .setAutocomplete(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('recarregar')
                .setDescription('Recarrega um plugin (hot reload)')
                .addStringOption(option =>
                    option.setName('nome')
                        .setDescription('Nome do plugin')
                        .setRequired(true)
                        .setAutocomplete(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('servidor-ativar')
                .setDescription('Ativa um plugin apenas neste servidor')
                .addStringOption(option =>
                    option.setName('nome')
                        .setDescription('Nome do plugin')
                        .setRequired(true)
                        .setAutocomplete(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('servidor-desativar')
                .setDescription('Desativa um plugin apenas neste servidor')
                .addStringOption(option =>
                    option.setName('nome')
                        .setDescription('Nome do plugin')
                        .setRequired(true)
                        .setAutocomplete(true))
        ),
    
    async autocomplete(interaction) {
        try {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const plugins = pluginService.getLoadedPlugins();
            
            const filtered = plugins
                .filter(p => p.name.toLowerCase().includes(focusedValue))
                .slice(0, 25);
            
            await interaction.respond(
                filtered.map(p => ({
                    name: `${p.name} ${p.enabled ? '✅' : '❌'}`,
                    value: p.name
                }))
            );
        } catch (error) {
            logger.error('Plugin autocomplete error', { error: error.message });
        }
    },
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'listar':
                return handleList(interaction);
            case 'status':
                return handleStatus(interaction);
            case 'ativar':
                return handleEnable(interaction);
            case 'desativar':
                return handleDisable(interaction);
            case 'recarregar':
                return handleReload(interaction);
            case 'servidor-ativar':
                return handleGuildEnable(interaction);
            case 'servidor-desativar':
                return handleGuildDisable(interaction);
        }
    }
};

/**
 * Handles listing all plugins
 */
async function handleList(interaction) {
    const plugins = pluginService.getLoadedPlugins();
    
    if (plugins.length === 0) {
        return interaction.reply({
            content: '📭 Nenhum plugin instalado.',
            ephemeral: true
        });
    }
    
    const enabledCount = plugins.filter(p => p.enabled).length;
    
    const embed = new EmbedBuilder()
        .setColor('#F5A623')
        .setTitle('🔌 Plugins Instalados')
        .setDescription(`**${enabledCount}/${plugins.length}** plugins ativos`)
        .setTimestamp();
    
    // Group by status
    const enabled = plugins.filter(p => p.enabled);
    const disabled = plugins.filter(p => !p.enabled);
    
    if (enabled.length > 0) {
        const enabledText = enabled.map(p => {
            const cmds = p.commands?.length || 0;
            return `✅ **${p.name}** v${p.version}${cmds > 0 ? ` (${cmds} cmd)` : ''}`;
        }).join('\n');
        
        embed.addFields({
            name: '🟢 Ativos',
            value: enabledText,
            inline: false
        });
    }
    
    if (disabled.length > 0) {
        const disabledText = disabled.map(p => 
            `❌ **${p.name}** v${p.version}`
        ).join('\n');
        
        embed.addFields({
            name: '🔴 Inativos',
            value: disabledText,
            inline: false
        });
    }
    
    embed.setFooter({ text: 'Use /plugin status <nome> para detalhes' });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handles showing plugin status
 */
async function handleStatus(interaction) {
    const pluginName = interaction.options.getString('nome');
    const plugins = pluginService.getLoadedPlugins();
    const plugin = plugins.find(p => p.name === pluginName);
    
    if (!plugin) {
        return interaction.reply({
            content: `❌ Plugin **${pluginName}** não encontrado.`,
            ephemeral: true
        });
    }
    
    const embed = new EmbedBuilder()
        .setColor(plugin.enabled ? '#3BA55C' : '#ED4245')
        .setTitle(`🔌 ${plugin.name}`)
        .setDescription(plugin.description || 'Sem descrição')
        .addFields(
            { name: 'Versão', value: plugin.version, inline: true },
            { name: 'Status', value: plugin.enabled ? '✅ Ativo' : '❌ Inativo', inline: true },
            { name: 'Autor', value: plugin.author || 'Desconhecido', inline: true }
        )
        .setTimestamp();
    
    if (plugin.commands && plugin.commands.length > 0) {
        embed.addFields({
            name: 'Comandos',
            value: plugin.commands.map(c => `\`/${c}\``).join(', '),
            inline: false
        });
    }
    
    if (plugin.enabledAt) {
        const enabledDate = new Date(plugin.enabledAt);
        embed.addFields({
            name: 'Ativado em',
            value: `<t:${Math.floor(enabledDate.getTime() / 1000)}:R>`,
            inline: true
        });
    }
    
    if (plugin.loadedAt) {
        const loadedDate = new Date(plugin.loadedAt);
        embed.addFields({
            name: 'Carregado em',
            value: `<t:${Math.floor(loadedDate.getTime() / 1000)}:R>`,
            inline: true
        });
    }
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handles enabling a plugin
 */
async function handleEnable(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const pluginName = interaction.options.getString('nome');
    
    try {
        const result = pluginService.enablePlugin(pluginName);
        
        if (!result.success) {
            return interaction.editReply(`❌ Erro ao ativar plugin: ${result.error}`);
        }
        
        // Clear deploy cache to include new commands
        deployService.clearCommandsCache();
        
        logger.info('Plugin enabled via Discord command', { 
            plugin: pluginName,
            user: interaction.user.tag
        });
        
        await interaction.editReply(`✅ Plugin **${pluginName}** ativado com sucesso!`);
        
    } catch (error) {
        logger.error('Error enabling plugin via command', { plugin: pluginName, error: error.message });
        await interaction.editReply(`❌ Erro: ${error.message}`);
    }
}

/**
 * Handles disabling a plugin
 */
async function handleDisable(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const pluginName = interaction.options.getString('nome');
    
    try {
        const result = pluginService.disablePlugin(pluginName);
        
        if (!result.success) {
            return interaction.editReply(`❌ Erro ao desativar plugin: ${result.error}`);
        }
        
        // Clear deploy cache to remove commands
        deployService.clearCommandsCache();
        
        logger.info('Plugin disabled via Discord command', { 
            plugin: pluginName,
            user: interaction.user.tag
        });
        
        await interaction.editReply(`🔴 Plugin **${pluginName}** desativado.`);
        
    } catch (error) {
        logger.error('Error disabling plugin via command', { plugin: pluginName, error: error.message });
        await interaction.editReply(`❌ Erro: ${error.message}`);
    }
}

/**
 * Handles reloading a plugin
 */
async function handleReload(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const pluginName = interaction.options.getString('nome');
    
    try {
        const result = pluginService.reloadPlugin(pluginName);
        
        if (!result.success) {
            return interaction.editReply(`❌ Erro ao recarregar plugin: ${result.error}`);
        }
        
        // Clear deploy cache
        deployService.clearCommandsCache();
        
        logger.info('Plugin reloaded via Discord command', { 
            plugin: pluginName,
            user: interaction.user.tag
        });
        
        await interaction.editReply(`🔄 Plugin **${pluginName}** recarregado com sucesso!`);
        
    } catch (error) {
        logger.error('Error reloading plugin via command', { plugin: pluginName, error: error.message });
        await interaction.editReply(`❌ Erro: ${error.message}`);
    }
}

/**
 * Handles enabling a plugin for the current guild only
 */
async function handleGuildEnable(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({
            content: '❌ Este comando só pode ser usado em servidores.',
            ephemeral: true
        });
    }
    
    const pluginName = interaction.options.getString('nome');
    const plugins = pluginService.getLoadedPlugins();
    const plugin = plugins.find(p => p.name === pluginName);
    
    if (!plugin) {
        return interaction.reply({
            content: `❌ Plugin **${pluginName}** não encontrado.`,
            ephemeral: true
        });
    }
    
    // Check if plugin is globally enabled
    if (!plugin.enabled) {
        return interaction.reply({
            content: `❌ O plugin **${pluginName}** está desativado globalmente. Ative-o primeiro com \`/plugin ativar\`.`,
            ephemeral: true
        });
    }
    
    pluginStorage.enablePluginForGuild(pluginName, interaction.guildId);
    
    logger.info('Plugin enabled for guild via Discord command', { 
        plugin: pluginName,
        guildId: interaction.guildId,
        user: interaction.user.tag
    });
    
    await interaction.reply({
        content: `✅ Plugin **${pluginName}** ativado neste servidor!`,
        ephemeral: true
    });
}

/**
 * Handles disabling a plugin for the current guild only
 */
async function handleGuildDisable(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({
            content: '❌ Este comando só pode ser usado em servidores.',
            ephemeral: true
        });
    }
    
    const pluginName = interaction.options.getString('nome');
    const plugins = pluginService.getLoadedPlugins();
    const plugin = plugins.find(p => p.name === pluginName);
    
    if (!plugin) {
        return interaction.reply({
            content: `❌ Plugin **${pluginName}** não encontrado.`,
            ephemeral: true
        });
    }
    
    pluginStorage.disablePluginForGuild(pluginName, interaction.guildId);
    
    logger.info('Plugin disabled for guild via Discord command', { 
        plugin: pluginName,
        guildId: interaction.guildId,
        user: interaction.user.tag
    });
    
    await interaction.reply({
        content: `🔴 Plugin **${pluginName}** desativado neste servidor.`,
        ephemeral: true
    });
}
