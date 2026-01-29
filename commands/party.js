/**
 * Party Command
 * Create and manage instance party groups
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const partyStorage = require('../utils/partyStorage');
const partyService = require('../services/partyService');
const logger = require('../utils/logger');

// Instâncias para grupo (baseado em browiki.org/wiki/Instâncias)
// Apenas instâncias que aceitam mais de 1 pessoa (modo 1+ ou 2+)
const COMMON_INSTANCES = [
    // Horárias
    'Altar do Selo',
    'Caverna do Polvo',
    'Esgotos de Malangdo',
    'Labirinto da Neblina',
    'Espaço Infinito',
    
    // Diárias
    'Vila dos Porings',
    'Batalha dos Orcs',
    'Memórias de Sarah',
    'Base Militar',
    'Laboratório Werner',
    'Missão OS',
    'Memorial COR',
    'Sonho Sombrio',
    'Aos Pés do Rei',
    'Torre do Demônio',
    'Caverna de Buwaya',
    'Maldição de Glastheim',
    'Covil de Vermes',
    'Laboratório Central',
    'Fábrica do Terror',
    'Sala Final',
    'Ilha Bios',
    'Caverna de Mors',
    'Templo do Demônio Rei',
    'Edda do Biolaboratório',
    
    // 3 Dias
    'Ninho de Nidhogg',
    'Laboratório de Wolfchev',
    'Fortaleza Voadora',
    'Glastheim Sombria',
    
    // Semanais
    'Torre sem Fim',
    'Cripta',
    'Glastheim Infantil',
    'Fábrica Infantil',
    'Túmulo do Monarca',
    'Hospital Abandonado',
    'Lago de Bakonawa',
    'Sarah vs Fenrir'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('grupo')
        .setDescription('Gerencia grupos para instâncias')
        .addSubcommand(subcommand =>
            subcommand
                .setName('criar')
                .setDescription('Cria um novo grupo para instância')
                .addStringOption(option =>
                    option.setName('instancia')
                        .setDescription('Nome da instância')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('data')
                        .setDescription('Data (DD/MM ou DD/MM/AAAA)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('hora')
                        .setDescription('Hora (HH:MM)')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('vagas')
                        .setDescription('Número máximo de vagas (padrão: 12, máx: 120)')
                        .setMinValue(2)
                        .setMaxValue(120))
                .addStringOption(option =>
                    option.setName('descricao')
                        .setDescription('Descrição adicional (requisitos, etc.)'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('listar')
                .setDescription('Lista grupos ativos neste servidor')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancelar')
                .setDescription('Cancela um grupo que você criou')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID do grupo (ou deixe vazio para ver seus grupos)')
                        .setRequired(false))
        ),
    
    async autocomplete(interaction) {
        try {
            const focusedOption = interaction.options.getFocused(true);
            
            // Only handle 'instancia' option
            if (focusedOption.name !== 'instancia') {
                return interaction.respond([]);
            }
            
            const focusedValue = focusedOption.value.toLowerCase();
            
            let filtered;
            if (focusedValue.length === 0) {
                // Show all instances if nothing typed
                filtered = COMMON_INSTANCES;
            } else {
                filtered = COMMON_INSTANCES.filter(instance => 
                    instance.toLowerCase().includes(focusedValue)
                );
            }
            
            await interaction.respond(
                filtered.slice(0, 25).map(instance => ({
                    name: instance,
                    value: instance
                }))
            );
        } catch (error) {
            // Silently fail for autocomplete errors
            console.error('Autocomplete error:', error);
        }
    },
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'criar':
                return await handleCreate(interaction);
            case 'listar':
                return await handleList(interaction);
            case 'cancelar':
                return await handleCancel(interaction);
        }
    }
};

/**
 * Handles party creation
 */
async function handleCreate(interaction) {
    const instanceName = interaction.options.getString('instancia');
    const dateStr = interaction.options.getString('data');
    const timeStr = interaction.options.getString('hora');
    const maxSlots = interaction.options.getInteger('vagas') || 12;
    const description = interaction.options.getString('descricao') || '';
    
    // Parse date and time
    const scheduledAt = parseDateTime(dateStr, timeStr);
    
    if (!scheduledAt) {
        return interaction.reply({
            content: '❌ Data/hora inválida. Use o formato DD/MM HH:MM (ex: 28/01 20:30)',
            ephemeral: true
        });
    }
    
    // Check if date is in the past
    if (scheduledAt < new Date()) {
        return interaction.reply({
            content: '❌ A data/hora não pode ser no passado!',
            ephemeral: true
        });
    }
    
    // Check if date is too far in future (30 days max)
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    if (scheduledAt > maxDate) {
        return interaction.reply({
            content: '❌ A data não pode ser mais de 30 dias no futuro.',
            ephemeral: true
        });
    }
    
    await interaction.deferReply();
    
    try {
        // Create the party
        const party = partyStorage.createParty({
            instanceName,
            description,
            creatorId: interaction.user.id,
            creatorName: interaction.user.displayName || interaction.user.username,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            scheduledAt: scheduledAt.toISOString(),
            maxSlots
        });
        
        // Build and send the embed
        const embed = partyService.buildPartyEmbed(party);
        const components = partyService.buildPartyButtons(party);
        
        const message = await interaction.editReply({
            embeds: [embed],
            components
        });
        
        // Save message ID
        partyStorage.setPartyMessageId(party.id, message.id);
        
        logger.info('Party created via command', { 
            partyId: party.id, 
            instance: instanceName,
            creator: interaction.user.id 
        });
        
    } catch (error) {
        logger.error('Error creating party', { error: error.message });
        
        await interaction.editReply({
            content: '❌ Erro ao criar o grupo. Tente novamente.',
            embeds: [],
            components: []
        });
    }
}

/**
 * Handles listing active parties
 */
async function handleList(interaction) {
    const parties = partyStorage.getActiveParties(interaction.guildId);
    
    if (parties.length === 0) {
        return interaction.reply({
            content: '📭 Não há grupos ativos neste servidor.\n\nUse `/grupo criar` para criar um novo grupo!',
            ephemeral: true
        });
    }
    
    const embed = new EmbedBuilder()
        .setTitle('📋 Grupos Ativos')
        .setColor('#F5A623')
        .setDescription(`Encontrados **${parties.length}** grupo(s) ativo(s):`);
    
    for (const party of parties.slice(0, 10)) {
        const scheduledDate = new Date(party.scheduledAt);
        const timeString = scheduledDate.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo'
        });
        
        const statusEmoji = party.status === 'full' ? '🟡' : '🟢';
        
        embed.addFields({
            name: `${statusEmoji} ${party.instanceName}`,
            value: [
                `📅 ${timeString}`,
                `👥 ${party.participants.length}/${party.maxSlots} vagas`,
                `👑 <@${party.creatorId}>`,
                `🔗 [Ver mensagem](https://discord.com/channels/${party.guildId}/${party.channelId}/${party.messageId})`
            ].join('\n'),
            inline: true
        });
    }
    
    if (parties.length > 10) {
        embed.setFooter({ text: `... e mais ${parties.length - 10} grupo(s)` });
    }
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handles party cancellation
 */
async function handleCancel(interaction) {
    const partyId = interaction.options.getString('id');
    
    if (!partyId) {
        // Show user's parties
        const allParties = partyStorage.getActiveParties(interaction.guildId);
        const userParties = allParties.filter(p => p.creatorId === interaction.user.id);
        
        if (userParties.length === 0) {
            return interaction.reply({
                content: '📭 Você não tem grupos ativos.',
                ephemeral: true
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🗑️ Seus Grupos')
            .setColor('#ED4245')
            .setDescription('Use `/grupo cancelar id:ID_DO_GRUPO` para cancelar:');
        
        for (const party of userParties) {
            embed.addFields({
                name: party.instanceName,
                value: `ID: \`${party.id}\`\n👥 ${party.participants.length} participante(s)`,
                inline: true
            });
        }
        
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // Cancel the party
    const result = partyStorage.cancelParty(partyId, interaction.user.id);
    
    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.error}`,
            ephemeral: true
        });
    }
    
    // Update the message
    await partyService.updatePartyMessage(result.party);
    
    // Notify participants
    if (result.party.participants.length > 0) {
        const mentions = result.party.participants.map(p => `<@${p.userId}>`).join(' ');
        
        await interaction.reply({
            content: `🔴 O grupo **${result.party.instanceName}** foi cancelado por ${interaction.user}.\n\n` +
                `Participantes notificados: ${mentions}`
        });
    } else {
        await interaction.reply({
            content: `🔴 Grupo **${result.party.instanceName}** cancelado.`,
            ephemeral: true
        });
    }
}

/**
 * Parses date and time strings to Date object
 * @param {string} dateStr - Date in DD/MM or DD/MM/YYYY format
 * @param {string} timeStr - Time in HH:MM format
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDateTime(dateStr, timeStr) {
    try {
        // Parse date
        const dateParts = dateStr.split('/');
        if (dateParts.length < 2) return null;
        
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1; // JS months are 0-indexed
        let year = dateParts[2] ? parseInt(dateParts[2], 10) : new Date().getFullYear();
        
        // Handle 2-digit year
        if (year < 100) {
            year += 2000;
        }
        
        // Parse time
        const timeParts = timeStr.split(':');
        if (timeParts.length < 2) return null;
        
        const hour = parseInt(timeParts[0], 10);
        const minute = parseInt(timeParts[1], 10);
        
        // Validate
        if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(minute)) {
            return null;
        }
        
        if (day < 1 || day > 31 || month < 0 || month > 11) {
            return null;
        }
        
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return null;
        }
        
        // Create date in BRT timezone
        const date = new Date(year, month, day, hour, minute, 0, 0);
        
        // Adjust for BRT (UTC-3)
        // Note: This assumes the server is in a different timezone
        // The date is created in local time, which should work if the server is in BRT
        
        return date;
        
    } catch (error) {
        return null;
    }
}
