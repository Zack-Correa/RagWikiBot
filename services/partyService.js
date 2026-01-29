/**
 * Party Service
 * Handles party notifications and scheduling
 */

const partyStorage = require('../utils/partyStorage');
const logger = require('../utils/logger');

let discordClient = null;
let checkInterval = null;
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
    setInterval(() => {
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
}

/**
 * Checks for parties that need notification
 */
async function checkPartiesForNotification() {
    if (!discordClient) return;
    
    try {
        const partiesToNotify = partyStorage.getPartiesToNotify();
        
        for (const party of partiesToNotify) {
            await notifyParty(party);
        }
    } catch (error) {
        logger.error('Error checking parties for notification', { error: error.message });
    }
}

/**
 * Sends notification for a party
 * @param {Object} party - Party to notify
 */
async function notifyParty(party) {
    try {
        // Get the channel
        const channel = await discordClient.channels.fetch(party.channelId).catch(() => null);
        
        if (!channel) {
            logger.warn('Party channel not found', { partyId: party.id, channelId: party.channelId });
            partyStorage.markAsNotified(party.id);
            return;
        }
        
        // Build mention list
        const mentions = party.participants.map(p => `<@${p.userId}>`).join(' ');
        
        // Send notification
        const notificationMsg = await channel.send({
            content: `🔔 **HORA DA INSTÂNCIA!**\n\n` +
                `A party para **${party.instanceName}** está começando!\n\n` +
                `👥 Participantes: ${mentions}\n\n` +
                `Organizador: <@${party.creatorId}>`
        });
        
        // Mark as notified
        partyStorage.markAsNotified(party.id);
        
        // Update original message
        await updatePartyMessage(party, true);
        
        logger.info('Party notification sent', { 
            partyId: party.id, 
            participants: party.participants.length 
        });
        
    } catch (error) {
        logger.error('Error notifying party', { partyId: party.id, error: error.message });
        // Still mark as notified to avoid repeated attempts
        partyStorage.markAsNotified(party.id);
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
        .setTitle(`⚔️ ${party.instanceName}`)
        .setColor(party.status === 'cancelled' ? '#ED4245' : (started ? '#3BA55C' : '#F5A623'));
    
    if (party.description) {
        embed.setDescription(party.description);
    }
    
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
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    
    if (party.status === 'cancelled' || party.status === 'started') {
        return [];
    }
    
    const rows = [];
    
    // Class buttons (first row)
    const classRow1 = new ActionRowBuilder();
    const classes1 = ['TANK', 'DPS_MELEE', 'DPS_RANGED', 'DPS_MAGIC'];
    
    for (const classType of classes1) {
        const classInfo = partyStorage.CLASSES[classType];
        classRow1.addComponents(
            new ButtonBuilder()
                .setCustomId(`party:join:${party.id}:${classType}`)
                .setLabel(classInfo.name)
                .setEmoji(classInfo.emoji)
                .setStyle(ButtonStyle.Secondary)
        );
    }
    rows.push(classRow1);
    
    // Class buttons (second row)
    const classRow2 = new ActionRowBuilder();
    const classes2 = ['SUPPORT', 'BARD', 'FLEX'];
    
    for (const classType of classes2) {
        const classInfo = partyStorage.CLASSES[classType];
        classRow2.addComponents(
            new ButtonBuilder()
                .setCustomId(`party:join:${party.id}:${classType}`)
                .setLabel(classInfo.name)
                .setEmoji(classInfo.emoji)
                .setStyle(ButtonStyle.Secondary)
        );
    }
    
    // Leave button
    classRow2.addComponents(
        new ButtonBuilder()
            .setCustomId(`party:leave:${party.id}`)
            .setLabel('Sair')
            .setEmoji('🚪')
            .setStyle(ButtonStyle.Danger)
    );
    
    rows.push(classRow2);
    
    return rows;
}

/**
 * Handles party button interaction
 * @param {Interaction} interaction - Button interaction
 */
async function handlePartyButton(interaction) {
    const customId = interaction.customId;
    
    // Parse the custom ID
    // Format: party:join:PARTYID:CLASSTYPE or party:leave:PARTYID
    // Using : as delimiter because party IDs contain underscores
    const parts = customId.split(':');
    
    if (parts[0] !== 'party') return false;
    
    const action = parts[1];
    const partyId = parts[2];
    
    if (action === 'join' && parts[3]) {
        const classType = parts[3];
        return await handleJoin(interaction, partyId, classType);
    } else if (action === 'leave') {
        return await handleLeave(interaction, partyId);
    }
    
    return false;
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
    handlePartyButton
};
