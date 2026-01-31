/**
 * Party Service
 * Handles party notifications and scheduling
 */

const partyStorage = require('../utils/partyStorage');
const logger = require('../utils/logger');

let discordClient = null;
let checkInterval = null;
let cleanupInterval = null;
const CHECK_INTERVAL_MS = 60000; // Check every minute

/**
 * Initializes the party service
 * @param {Client} client - Discord client
 */
function initialize(client) {
    discordClient = client;
    
    // Start checking for parties to notify
    startScheduler();
    
    // Cleanup old parties daily
    cleanupInterval = setInterval(() => {
        partyStorage.cleanupOldParties();
    }, 24 * 60 * 60 * 1000);
    
    logger.info('Party service initialized');
}

/**
 * Starts the party scheduler
 */
function startScheduler() {
    if (checkInterval) {
        clearInterval(checkInterval);
    }
    
    checkInterval = setInterval(checkPartiesForNotification, CHECK_INTERVAL_MS);
    
    // Also run immediately
    checkPartiesForNotification();
}

/**
 * Stops the party scheduler
 */
function stopScheduler() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
}

/**
 * Checks for parties that need notification
 */
async function checkPartiesForNotification() {
    if (!discordClient) return;
    
    try {
        // Check 2 hour notifications (confirmation)
        const parties2h = partyStorage.getPartiesToNotify('2h');
        for (const party of parties2h) {
            await notifyParty(party, '2h');
        }
        
        // Check 30 minute notifications (reminder)
        const parties30m = partyStorage.getPartiesToNotify('30m');
        for (const party of parties30m) {
            await notifyParty(party, '30m');
        }
        
        // Check start notifications
        const partiesStart = partyStorage.getPartiesToNotify('start');
        for (const party of partiesStart) {
            await notifyParty(party, 'start');
        }
    } catch (error) {
        logger.error('Error checking parties for notification', { error: error.message });
    }
}

/**
 * Sends notification for a party via DM to each participant
 * @param {Object} party - Party to notify
 * @param {string} type - Notification type: '2h', '30m', or 'start'
 */
async function notifyParty(party, type = 'start') {
    try {
        const scheduledTime = new Date(party.scheduledAt);
        const timeStr = scheduledTime.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo'
        });
        
        // Get creator info
        const creator = await discordClient.users.fetch(party.creatorId).catch(() => null);
        const creatorName = creator?.username || 'Organizador';
        
        // Build participant list
        const participantsList = party.participants
            .map(p => `• ${p.userName} (${partyStorage.CLASSES[p.classType]?.name || p.classType})`)
            .join('\n');
        
        // Message link
        const messageLink = `https://discord.com/channels/${party.guildId}/${party.channelId}/${party.messageId}`;
        
        // Build DM content based on type
        let title = '';
        let description = '';
        let color = '#00ff00';
        
        switch (type) {
            case '2h':
                title = '⏰ CONFIRMAÇÃO DE PRESENÇA';
                color = '#f39c12';
                description = `A party para **${party.instanceName}** começa em **2 horas**!\n\n` +
                    `📅 **Horário:** ${timeStr}\n` +
                    `👥 **Participantes:** ${party.participants.length}/${party.maxSlots}\n` +
                    `👑 **Organizador:** ${creatorName}\n\n` +
                    `Por favor, confirme sua presença ou avise se não puder comparecer.`;
                break;
            
            case '30m':
                title = '🔔 LEMBRETE FINAL';
                color = '#e74c3c';
                description = `A party para **${party.instanceName}** começa em **30 minutos**!\n\n` +
                    `📅 **Horário:** ${timeStr}\n` +
                    `👥 **Participantes:** ${party.participants.length}/${party.maxSlots}\n` +
                    `👑 **Organizador:** ${creatorName}\n\n` +
                    `⚔️ Preparem-se! Verifiquem itens, buffs e estejam prontos!`;
                break;
            
            case 'start':
            default:
                title = '🚀 HORA DA INSTÂNCIA';
                color = '#2ecc71';
                description = `A party para **${party.instanceName}** está começando **AGORA**!\n\n` +
                    `👑 **Organizador:** ${creatorName}\n\n` +
                    `**Participantes:**\n${participantsList}\n\n` +
                    `Boa sorte a todos! 🍀`;
                break;
        }
        
        // Build embed for DM
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(description)
            .addFields({
                name: '🔗 Link do Grupo',
                value: `[Clique aqui para ver o grupo](${messageLink})`,
                inline: false
            })
            .setFooter({ text: `Instância: ${party.instanceName}` })
            .setTimestamp();
        
        // Send DM to each participant
        let sentCount = 0;
        let failedCount = 0;
        
        for (const participant of party.participants) {
            try {
                const user = await discordClient.users.fetch(participant.userId);
                await user.send({ embeds: [embed] });
                sentCount++;
            } catch (error) {
                // User might have DMs disabled
                if (error.code === 50007) {
                    logger.debug('Cannot send DM to user (DMs disabled)', { 
                        userId: participant.userId,
                        partyId: party.id 
                    });
                } else {
                    logger.warn('Error sending party DM', { 
                        userId: participant.userId,
                        error: error.message 
                    });
                }
                failedCount++;
            }
        }
        
        // Also notify the creator if not a participant
        const creatorIsParticipant = party.participants.some(p => p.userId === party.creatorId);
        if (!creatorIsParticipant && creator) {
            try {
                await creator.send({ embeds: [embed] });
                sentCount++;
            } catch (error) {
                failedCount++;
            }
        }
        
        // Mark as notified
        partyStorage.markAsNotified(party.id, type);
        
        // Update original message only on start
        if (type === 'start') {
            await updatePartyMessage(party, true);
        }
        
        logger.info('Party DM notifications sent', { 
            partyId: party.id, 
            type,
            sent: sentCount,
            failed: failedCount,
            totalParticipants: party.participants.length 
        });
        
    } catch (error) {
        logger.error('Error notifying party', { partyId: party.id, type, error: error.message });
        // Still mark as notified to avoid repeated attempts
        partyStorage.markAsNotified(party.id, type);
    }
}

/**
 * Updates a party's embed message
 * @param {Object} party - Party to update
 * @param {boolean} started - Whether the party has started
 */
async function updatePartyMessage(party, started = false) {
    if (!discordClient || !party.messageId) return;
    
    try {
        const channel = await discordClient.channels.fetch(party.channelId).catch(() => null);
        if (!channel) return;
        
        const message = await channel.messages.fetch(party.messageId).catch(() => null);
        if (!message) return;
        
        const embed = buildPartyEmbed(party, started);
        const components = started || party.status === 'cancelled' ? [] : buildPartyButtons(party);
        
        await message.edit({ embeds: [embed], components });
        
    } catch (error) {
        logger.debug('Error updating party message', { partyId: party.id, error: error.message });
    }
}

/**
 * Builds the party embed
 * @param {Object} party - Party data
 * @param {boolean} started - Whether started
 * @returns {Object} Embed object
 */
function buildPartyEmbed(party, started = false) {
    const { EmbedBuilder } = require('discord.js');
    
    const statusEmoji = {
        open: '🟢',
        full: '🟡',
        started: '🔵',
        cancelled: '🔴',
        completed: '⚫'
    };
    
    const statusText = {
        open: 'Aberto',
        full: 'Cheio',
        started: 'Iniciado',
        cancelled: 'Cancelado',
        completed: 'Finalizado'
    };
    
    const embed = new EmbedBuilder()
        .setTitle(`⚔️ Grupo para Instância`)
        .setColor(party.status === 'cancelled' ? '#ED4245' : (started ? '#3BA55C' : '#F5A623'));
    
    if (party.description) {
        embed.setDescription(party.description);
    }
    
    // Instance name field
    embed.addFields({
        name: '🏰 Instância',
        value: party.instanceName,
        inline: true
    });
    
    // Scheduled time
    const scheduledDate = new Date(party.scheduledAt);
    const timeString = scheduledDate.toLocaleString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo'
    });
    
    embed.addFields({
        name: '📅 Data/Hora',
        value: timeString,
        inline: true
    });
    
    embed.addFields({
        name: '📊 Status',
        value: `${statusEmoji[party.status]} ${statusText[party.status]}`,
        inline: true
    });
    
    embed.addFields({
        name: '👥 Vagas',
        value: `${party.participants.length}/${party.maxSlots}`,
        inline: true
    });
    
    // Show class limits if defined
    if (party.classLimits && Object.keys(party.classLimits).length > 0) {
        const classCounts = {};
        for (const p of party.participants) {
            classCounts[p.classType] = (classCounts[p.classType] || 0) + 1;
        }
        
        const limitsText = Object.entries(party.classLimits)
            .map(([classType, limit]) => {
                const classInfo = partyStorage.CLASSES[classType] || { emoji: '❓', name: classType };
                const current = classCounts[classType] || 0;
                const status = current >= limit ? '✅' : '⬜';
                return `${status} ${classInfo.emoji} ${classInfo.name}: ${current}/${limit}`;
            })
            .join('\n');
        
        embed.addFields({
            name: '📊 Limites por Classe',
            value: limitsText || '*Sem limites*',
            inline: false
        });
    }
    
    // Group participants by class
    const byClass = {};
    for (const p of party.participants) {
        if (!byClass[p.classType]) {
            byClass[p.classType] = [];
        }
        byClass[p.classType].push(p);
    }
    
    // Build participant list
    let participantText = '';
    if (party.participants.length === 0) {
        participantText = '*Nenhum participante ainda*';
    } else {
        for (const [classType, participants] of Object.entries(byClass)) {
            const classInfo = partyStorage.CLASSES[classType] || { emoji: '❓', name: classType };
            participantText += `${classInfo.emoji} **${classInfo.name}**\n`;
            for (const p of participants) {
                participantText += `└ ${p.userName}\n`;
            }
            participantText += '\n';
        }
    }
    
    embed.addFields({
        name: '📋 Participantes',
        value: participantText.trim() || '*Vazio*',
        inline: false
    });
    
    embed.addFields({
        name: '👑 Organizador',
        value: `<@${party.creatorId}>`,
        inline: true
    });
    
    if (!started && party.status !== 'cancelled') {
        embed.setFooter({ 
            text: 'Clique nos botões abaixo para entrar com sua classe' 
        });
    }
    
    return embed;
}

/**
 * Builds party action buttons
 * @param {Object} party - Party data
 * @returns {Array} Action row components
 */
function buildPartyButtons(party) {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
    
    if (party.status === 'cancelled' || party.status === 'started') {
        return [];
    }
    
    const rows = [];
    
    // Get available classes (respecting limits)
    const availableClasses = partyStorage.getAvailableClasses(party.id);
    const classCounts = partyStorage.getClassCounts(party.id) || {};
    
    // Class select menu - only show available classes
    const classOptions = Object.entries(partyStorage.CLASSES)
        .filter(([key]) => availableClasses.includes(key))
        .map(([key, classInfo]) => {
            const limit = party.classLimits?.[key];
            const count = classCounts[key] || 0;
            let description = classInfo.description;
            
            // Add limit info if defined
            if (limit !== undefined) {
                description = `${description} (${count}/${limit})`;
            }
            
            return {
                label: classInfo.name,
                description: description.substring(0, 100),
                value: `party:join:${party.id}:${key}`,
                emoji: classInfo.emoji
            };
        });
    
    // Only add select menu if there are available classes
    if (classOptions.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`party:select:${party.id}`)
            .setPlaceholder('🎮 Selecione sua classe para entrar')
            .addOptions(classOptions);
        
        const selectRow = new ActionRowBuilder().addComponents(selectMenu);
        rows.push(selectRow);
    }
    
    // Action buttons row
    const buttonRow = new ActionRowBuilder();
    
    // Leave button
    buttonRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`party:leave:${party.id}`)
            .setLabel('Sair')
            .setEmoji('🚪')
            .setStyle(ButtonStyle.Secondary)
    );
    
    // Configure button (for creator)
    buttonRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`party:config:${party.id}`)
            .setLabel('Configurar')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Secondary)
    );
    
    // Cancel button (for creator)
    buttonRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`party:cancel:${party.id}`)
            .setLabel('Cancelar Grupo')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger)
    );
    
    rows.push(buttonRow);
    
    return rows;
}

/**
 * Handles party button/select interaction
 * @param {Interaction} interaction - Button or SelectMenu interaction
 */
async function handlePartyButton(interaction) {
    let customId = interaction.customId;
    
    // For select menus, get the selected value
    if (interaction.isStringSelectMenu()) {
        customId = interaction.values[0];
    }
    
    // Parse the custom ID
    // Format: party:join:PARTYID:CLASSTYPE or party:leave:PARTYID or party:select:PARTYID
    // Using : as delimiter because party IDs contain underscores
    const parts = customId.split(':');
    
    if (parts[0] !== 'party') return false;
    
    const action = parts[1];
    const partyId = parts[2];
    
    // Handle select menu (just extract and process as join)
    if (action === 'select') {
        // The user selected a class, but we need to handle this differently
        // The value should be the full customId like party:join:PARTYID:CLASSTYPE
        return false; // Let the value handle it
    }
    
    if (action === 'join' && parts[3]) {
        const classType = parts[3];
        return await handleJoin(interaction, partyId, classType);
    } else if (action === 'leave') {
        return await handleLeave(interaction, partyId);
    } else if (action === 'config') {
        return await handleConfigButton(interaction, partyId);
    } else if (action === 'cfgclass') {
        return await handleConfigClassSelect(interaction, partyId);
    } else if (action === 'cfglimit') {
        return await handleConfigLimitSelect(interaction, partyId);
    } else if (action === 'cfgclear') {
        return await handleConfigClear(interaction, partyId);
    } else if (action === 'cfgdone') {
        return await handleConfigDone(interaction, partyId);
    } else if (action === 'cancel') {
        return await handleCancelButton(interaction, partyId);
    }
    
    return false;
}

/**
 * Handles config button click - shows modal with select menus using raw API
 */
async function handleConfigButton(interaction, partyId) {
    const party = partyStorage.getParty(partyId);
    
    if (!party) {
        await interaction.reply({ 
            content: '❌ Grupo não encontrado.',
            ephemeral: true 
        });
        return true;
    }
    
    // Only creator can configure
    if (party.creatorId !== interaction.user.id) {
        await interaction.reply({ 
            content: '❌ Apenas o criador do grupo pode configurar os limites de classe.',
            ephemeral: true 
        });
        return true;
    }
    
    // Build class options for select menu (max 25)
    const mainClasses = Object.entries(partyStorage.CLASSES)
        .filter(([key]) => key !== 'FLEX')
        .slice(0, 25);
    
    const classOptions = mainClasses.map(([key, info]) => ({
        label: info.name,
        value: key,
        description: info.description.substring(0, 50),
        emoji: { name: info.emoji }
    }));
    
    // Build limit options (0-12 + remove)
    const limitOptions = [
        { label: 'Remover limite', value: 'none', description: 'Permite entrada ilimitada', emoji: { name: '🔓' } },
        ...Array.from({ length: 13 }, (_, i) => ({
            label: `${i} vagas`,
            value: String(i),
            emoji: { name: i === 0 ? '🚫' : '📌' }
        }))
    ];
    
    // Send modal using raw API via REST
    try {
        const { Routes } = require('discord.js');
        
        await interaction.client.rest.post(
            Routes.interactionCallback(interaction.id, interaction.token),
            {
                body: {
                    type: 9, // MODAL
                    data: {
                        custom_id: `party:modal:${partyId}`,
                        title: 'Configurar Limites',
                        components: [
                            {
                                type: 18, // Label
                                label: 'Selecione a classe',
                                component: {
                                    type: 3, // String Select
                                    custom_id: 'class_select',
                                    placeholder: 'Escolha uma classe...',
                                    options: classOptions
                                }
                            },
                            {
                                type: 18, // Label
                                label: 'Selecione o limite',
                                component: {
                                    type: 3, // String Select
                                    custom_id: 'limit_select',
                                    placeholder: 'Escolha o limite...',
                                    options: limitOptions
                                }
                            }
                        ]
                    }
                }
            }
        );
        
        logger.info('Raw modal with select menus sent successfully');
    } catch (error) {
        // Fallback to message-based config if raw modal fails
        logger.warn('Raw modal failed, using fallback', { error: error.message });
        return await handleConfigButtonFallback(interaction, partyId, party);
    }
    
    return true;
}

/**
 * Fallback config using message with select menus
 */
async function handleConfigButtonFallback(interaction, partyId, party) {
    const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
    
    // Build embed showing current limits
    const embed = new EmbedBuilder()
        .setTitle('⚙️ Configurar Limites de Classe')
        .setDescription('Selecione uma classe e depois o limite desejado.\nClasses sem limite definido permitem entrada ilimitada.')
        .setColor('#F5A623');
    
    // Show current limits
    const currentLimitsText = Object.keys(party.classLimits || {}).length > 0
        ? Object.entries(party.classLimits)
            .map(([classType, limit]) => {
                const classInfo = partyStorage.CLASSES[classType] || { emoji: '❓', name: classType };
                return `${classInfo.emoji} ${classInfo.name}: **${limit}**`;
            })
            .join('\n')
        : '*Nenhum limite definido (grupo livre)*';
    
    embed.addFields({ name: '📊 Limites Atuais', value: currentLimitsText });
    
    // Class select menu
    const mainClasses = Object.entries(partyStorage.CLASSES)
        .filter(([key]) => key !== 'FLEX')
        .slice(0, 25);
    
    const classOptions = mainClasses.map(([key, info]) => ({
        label: info.name,
        value: key,
        emoji: info.emoji,
        description: party.classLimits?.[key] !== undefined ? `Limite atual: ${party.classLimits[key]}` : 'Sem limite'
    }));
    
    const classSelect = new StringSelectMenuBuilder()
        .setCustomId(`party:cfgclass:${partyId}`)
        .setPlaceholder('📋 Selecione uma classe para definir limite')
        .addOptions(classOptions);
    
    // Limit select menu (0-12)
    const limitOptions = [
        { label: 'Remover limite', value: 'none', emoji: '🔓', description: 'Permite entrada ilimitada' },
        ...Array.from({ length: 13 }, (_, i) => ({
            label: `${i} vagas`,
            value: String(i),
            emoji: i === 0 ? '🚫' : '📌'
        }))
    ];
    
    const limitSelect = new StringSelectMenuBuilder()
        .setCustomId(`party:cfglimit:${partyId}`)
        .setPlaceholder('🔢 Selecione o limite de vagas')
        .addOptions(limitOptions);
    
    // Action buttons
    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`party:cfgclear:${partyId}`)
            .setLabel('Limpar Todos')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`party:cfgdone:${partyId}`)
            .setLabel('Concluído')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
    );
    
    await interaction.reply({
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(classSelect),
            new ActionRowBuilder().addComponents(limitSelect),
            buttonRow
        ],
        ephemeral: true
    });
    
    return true;
}

// Store temporary config state (class selected by user)
const configState = new Map();

/**
 * Handles class selection in config menu
 */
async function handleConfigClassSelect(interaction, partyId) {
    const selectedClass = interaction.values[0];
    
    // Store the selected class for this user+party combination
    const stateKey = `${interaction.user.id}:${partyId}`;
    configState.set(stateKey, { selectedClass, timestamp: Date.now() });
    
    const classInfo = partyStorage.CLASSES[selectedClass];
    
    await interaction.reply({
        content: `${classInfo.emoji} **${classInfo.name}** selecionado. Agora selecione o limite de vagas.`,
        ephemeral: true
    });
    
    return true;
}

/**
 * Handles limit selection in config menu
 */
async function handleConfigLimitSelect(interaction, partyId) {
    const stateKey = `${interaction.user.id}:${partyId}`;
    const state = configState.get(stateKey);
    
    if (!state || !state.selectedClass) {
        await interaction.reply({
            content: '❌ Primeiro selecione uma classe no menu acima.',
            ephemeral: true
        });
        return true;
    }
    
    const party = partyStorage.getParty(partyId);
    if (!party) {
        await interaction.reply({
            content: '❌ Grupo não encontrado.',
            ephemeral: true
        });
        return true;
    }
    
    const selectedClass = state.selectedClass;
    const limitValue = interaction.values[0];
    const classInfo = partyStorage.CLASSES[selectedClass];
    
    // Update class limits
    const newLimits = { ...(party.classLimits || {}) };
    
    if (limitValue === 'none') {
        delete newLimits[selectedClass];
    } else {
        newLimits[selectedClass] = parseInt(limitValue, 10);
    }
    
    partyStorage.updateClassLimits(partyId, newLimits);
    
    // Clear the state
    configState.delete(stateKey);
    
    // Update the party message
    const updatedParty = partyStorage.getParty(partyId);
    await updatePartyMessage(updatedParty);
    
    const actionText = limitValue === 'none' 
        ? `Limite de **${classInfo.name}** removido.`
        : `Limite de **${classInfo.name}** definido para **${limitValue}** vagas.`;
    
    await interaction.reply({
        content: `✅ ${classInfo.emoji} ${actionText}`,
        ephemeral: true
    });
    
    logger.info('Party class limit updated', { partyId, class: selectedClass, limit: limitValue });
    
    return true;
}

/**
 * Handles clear all limits button
 */
async function handleConfigClear(interaction, partyId) {
    const party = partyStorage.getParty(partyId);
    
    if (!party) {
        await interaction.reply({
            content: '❌ Grupo não encontrado.',
            ephemeral: true
        });
        return true;
    }
    
    if (party.creatorId !== interaction.user.id) {
        await interaction.reply({
            content: '❌ Apenas o criador pode fazer isso.',
            ephemeral: true
        });
        return true;
    }
    
    partyStorage.updateClassLimits(partyId, {});
    
    // Update the party message
    const updatedParty = partyStorage.getParty(partyId);
    await updatePartyMessage(updatedParty);
    
    await interaction.reply({
        content: '🗑️ Todos os limites de classe foram removidos. O grupo agora é livre.',
        ephemeral: true
    });
    
    logger.info('Party class limits cleared', { partyId });
    
    return true;
}

/**
 * Handles done button - dismisses the config message
 */
async function handleConfigDone(interaction, partyId) {
    // Clean up any config state
    const stateKey = `${interaction.user.id}:${partyId}`;
    configState.delete(stateKey);
    
    await interaction.update({
        content: '✅ Configuração concluída!',
        embeds: [],
        components: []
    });
    
    return true;
}

/**
 * Handles cancel button click - cancels the party
 */
async function handleCancelButton(interaction, partyId) {
    const party = partyStorage.getParty(partyId);
    
    if (!party) {
        await interaction.reply({
            content: '❌ Grupo não encontrado.',
            ephemeral: true
        });
        return true;
    }
    
    // Only creator can cancel
    if (party.creatorId !== interaction.user.id) {
        await interaction.reply({
            content: '❌ Apenas o criador do grupo pode cancelar.',
            ephemeral: true
        });
        return true;
    }
    
    // Cancel the party
    const result = partyStorage.cancelParty(partyId, interaction.user.id);
    
    if (!result.success) {
        await interaction.reply({
            content: `❌ ${result.error}`,
            ephemeral: true
        });
        return true;
    }
    
    // Update the message to show cancelled status
    const cancelledParty = partyStorage.getParty(partyId);
    const embed = buildPartyEmbed(cancelledParty);
    
    await interaction.update({
        embeds: [embed],
        components: [] // Remove all buttons
    });
    
    // Notify in channel
    await interaction.followUp({
        content: `🗑️ O grupo **${party.instanceName}** foi cancelado por <@${interaction.user.id}>.`
    });
    
    logger.info('Party cancelled via button', { partyId, cancelledBy: interaction.user.id });
    
    return true;
}

/**
 * Handles join button click
 */
async function handleJoin(interaction, partyId, classType) {
    await interaction.deferUpdate();
    
    const result = partyStorage.joinParty(
        partyId,
        interaction.user.id,
        interaction.user.displayName || interaction.user.username,
        classType
    );
    
    if (!result.success) {
        await interaction.followUp({ 
            content: `❌ ${result.error}`, 
            ephemeral: true 
        });
        return true;
    }
    
    // Update the message
    await updatePartyMessage(result.party);
    
    const classInfo = partyStorage.CLASSES[classType];
    const action = result.updated ? 'trocou para' : 'entrou como';
    
    await interaction.followUp({ 
        content: `${classInfo.emoji} Você ${action} **${classInfo.name}**!`, 
        ephemeral: true 
    });
    
    return true;
}

/**
 * Handles leave button click
 */
async function handleLeave(interaction, partyId) {
    await interaction.deferUpdate();
    
    const result = partyStorage.leaveParty(partyId, interaction.user.id);
    
    if (!result.success) {
        await interaction.followUp({ 
            content: `❌ ${result.error}`, 
            ephemeral: true 
        });
        return true;
    }
    
    // Update the message
    await updatePartyMessage(result.party);
    
    await interaction.followUp({ 
        content: '🚪 Você saiu do grupo!', 
        ephemeral: true 
    });
    
    return true;
}

/**
 * Handles modal submission for class limits
 */
async function handleModalSubmit(interaction) {
    const customId = interaction.customId;
    
    if (!customId.startsWith('party:modal:')) {
        return false;
    }
    
    const partyId = customId.replace('party:modal:', '');
    const party = partyStorage.getParty(partyId);
    
    if (!party) {
        await interaction.reply({ 
            content: '❌ Grupo não encontrado.',
            ephemeral: true 
        });
        return true;
    }
    
    // Only creator can configure
    if (party.creatorId !== interaction.user.id) {
        await interaction.reply({ 
            content: '❌ Apenas o criador do grupo pode configurar.',
            ephemeral: true 
        });
        return true;
    }
    
    try {
        // Debug: log the full interaction structure
        logger.info('Modal submit raw data', { 
            dataComponents: JSON.stringify(interaction.data?.components),
            fieldsData: interaction.fields ? JSON.stringify([...interaction.fields.fields?.entries?.() || []]) : 'no fields'
        });
        
        // Try different ways to get the values
        let selectedClass, selectedLimit;
        
        // Access fields.fields Map directly - select menus store values in 'values' array
        if (interaction.fields?.fields) {
            const classField = interaction.fields.fields.get('class_select');
            const limitField = interaction.fields.fields.get('limit_select');
            
            selectedClass = classField?.values?.[0] || classField?.value;
            selectedLimit = limitField?.values?.[0] || limitField?.value;
            
            logger.debug('Fields Map result', { selectedClass, selectedLimit });
        }
        
        // Fallback: Try getField method
        if (!selectedClass) {
            try {
                const classField = interaction.fields.getField('class_select');
                const limitField = interaction.fields.getField('limit_select');
                selectedClass = classField?.values?.[0] || classField?.value;
                selectedLimit = limitField?.values?.[0] || limitField?.value;
            } catch (e) {
                logger.debug('getField failed', { error: e.message });
            }
        }
        
        logger.info('Final parsed modal values', { selectedClass, selectedLimit });
        
        if (!selectedClass || !selectedLimit) {
            await interaction.reply({
                content: '❌ Selecione tanto a classe quanto o limite.',
                ephemeral: true
            });
            return true;
        }
        
        const classInfo = partyStorage.CLASSES[selectedClass];
        
        if (!classInfo) {
            await interaction.reply({
                content: `❌ Classe inválida: ${selectedClass}`,
                ephemeral: true
            });
            return true;
        }
        
        // Update class limits
        const newLimits = { ...(party.classLimits || {}) };
        
        if (selectedLimit === 'none') {
            delete newLimits[selectedClass];
        } else {
            newLimits[selectedClass] = parseInt(selectedLimit, 10);
        }
        
        partyStorage.updateClassLimits(partyId, newLimits);
        
        // Update the party message
        const updatedParty = partyStorage.getParty(partyId);
        await updatePartyMessage(updatedParty);
        
        const actionText = selectedLimit === 'none'
            ? `Limite de **${classInfo.name}** removido.`
            : `Limite de **${classInfo.name}** definido para **${selectedLimit}** vagas.`;
        
        await interaction.reply({
            content: `✅ ${classInfo.emoji} ${actionText}`,
            ephemeral: true
        });
        
        logger.info('Party class limit updated via modal', { partyId, class: selectedClass, limit: selectedLimit });
        
        return true;
    } catch (error) {
        logger.error('Error handling class limits modal', { error: error.message });
        await interaction.reply({ 
            content: '❌ Erro ao salvar configurações.',
            ephemeral: true 
        });
        return true;
    }
}

/**
 * Shuts down the service
 */
function shutdown() {
    stopScheduler();
    logger.info('Party service stopped');
}

module.exports = {
    initialize,
    shutdown,
    updatePartyMessage,
    buildPartyEmbed,
    buildPartyButtons,
    handlePartyButton,
    handleModalSubmit
};
