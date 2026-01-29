/**
 * Party Storage Module
 * Handles persistence of instance parties/groups
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const PARTIES_FILE = path.join(__dirname, '..', 'data', 'parties.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

// RO Classes with emojis
const CLASSES = {
    TANK: { emoji: '🛡️', name: 'Tank', description: 'RG, Crusader' },
    DPS_MELEE: { emoji: '⚔️', name: 'DPS Físico', description: 'RK, GX, Meca, etc.' },
    DPS_RANGED: { emoji: '🎯', name: 'Arqueiro', description: 'Ranger, Rebel, etc.' },
    DPS_MAGIC: { emoji: '🔮', name: 'DPS Mágico', description: 'Warlock, Sorc, etc.' },
    SUPPORT: { emoji: '💚', name: 'Suporte', description: 'AB, Sura, Genetic' },
    BARD: { emoji: '🎵', name: 'Bardo/Odalisca', description: 'Minstrel, Wanderer' },
    FLEX: { emoji: '🔄', name: 'Flex', description: 'Qualquer classe' }
};

/**
 * Ensures data directory exists
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Loads all parties from storage
 * @returns {Object} Parties data
 */
function loadParties() {
    ensureDataDir();
    
    try {
        if (fs.existsSync(PARTIES_FILE)) {
            const data = fs.readFileSync(PARTIES_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading parties', { error: error.message });
    }
    
    return { parties: [] };
}

/**
 * Saves parties to storage
 * @param {Object} data - Parties data
 */
function saveParties(data) {
    ensureDataDir();
    
    try {
        fs.writeFileSync(PARTIES_FILE, JSON.stringify(data, null, 2), 'utf8');
        logger.debug('Parties saved', { count: data.parties?.length || 0 });
    } catch (error) {
        logger.error('Error saving parties', { error: error.message });
        throw error;
    }
}

/**
 * Generates unique party ID
 * @returns {string} Party ID
 */
function generatePartyId() {
    return `party_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Creates a new party
 * @param {Object} partyData - Party information
 * @returns {Object} Created party
 */
function createParty(partyData) {
    const data = loadParties();
    
    const party = {
        id: generatePartyId(),
        instanceName: partyData.instanceName,
        description: partyData.description || '',
        creatorId: partyData.creatorId,
        creatorName: partyData.creatorName,
        guildId: partyData.guildId,
        channelId: partyData.channelId,
        messageId: null, // Set after message is sent
        scheduledAt: partyData.scheduledAt,
        maxSlots: partyData.maxSlots || 12,
        participants: [],
        status: 'open', // open, full, started, cancelled, completed
        notified: false,
        createdAt: new Date().toISOString()
    };
    
    data.parties.push(party);
    saveParties(data);
    
    logger.info('Party created', { 
        partyId: party.id, 
        instance: party.instanceName,
        creator: party.creatorId 
    });
    
    return party;
}

/**
 * Updates a party's message ID
 * @param {string} partyId - Party ID
 * @param {string} messageId - Discord message ID
 */
function setPartyMessageId(partyId, messageId) {
    const data = loadParties();
    const party = data.parties.find(p => p.id === partyId);
    
    if (party) {
        party.messageId = messageId;
        saveParties(data);
    }
}

/**
 * Adds a participant to a party
 * @param {string} partyId - Party ID
 * @param {string} userId - Discord user ID
 * @param {string} userName - Discord user name
 * @param {string} classType - Class type (TANK, DPS_MELEE, etc.)
 * @returns {Object} Result { success, error, party }
 */
function joinParty(partyId, userId, userName, classType) {
    const data = loadParties();
    const party = data.parties.find(p => p.id === partyId);
    
    if (!party) {
        return { success: false, error: 'Grupo não encontrado' };
    }
    
    if (party.status !== 'open') {
        return { success: false, error: 'Este grupo não está mais aceitando participantes' };
    }
    
    if (party.participants.length >= party.maxSlots) {
        return { success: false, error: 'Grupo está cheio' };
    }
    
    // Check if already in party
    const existingIndex = party.participants.findIndex(p => p.userId === userId);
    
    if (existingIndex >= 0) {
        // Update class if already in party
        party.participants[existingIndex].classType = classType;
        party.participants[existingIndex].className = CLASSES[classType]?.name || classType;
        saveParties(data);
        return { success: true, party, updated: true };
    }
    
    // Add new participant
    party.participants.push({
        userId,
        userName,
        classType,
        className: CLASSES[classType]?.name || classType,
        joinedAt: new Date().toISOString()
    });
    
    // Check if party is now full
    if (party.participants.length >= party.maxSlots) {
        party.status = 'full';
    }
    
    saveParties(data);
    
    logger.info('User joined party', { partyId, userId, classType });
    
    return { success: true, party };
}

/**
 * Removes a participant from a party
 * @param {string} partyId - Party ID
 * @param {string} userId - User ID to remove
 * @returns {Object} Result { success, error, party }
 */
function leaveParty(partyId, userId) {
    const data = loadParties();
    const party = data.parties.find(p => p.id === partyId);
    
    if (!party) {
        return { success: false, error: 'Grupo não encontrado' };
    }
    
    const initialLength = party.participants.length;
    party.participants = party.participants.filter(p => p.userId !== userId);
    
    if (party.participants.length === initialLength) {
        return { success: false, error: 'Você não está neste grupo' };
    }
    
    // Reopen if was full
    if (party.status === 'full') {
        party.status = 'open';
    }
    
    saveParties(data);
    
    logger.info('User left party', { partyId, userId });
    
    return { success: true, party };
}

/**
 * Gets a party by ID
 * @param {string} partyId - Party ID
 * @returns {Object|null} Party or null
 */
function getParty(partyId) {
    const data = loadParties();
    return data.parties.find(p => p.id === partyId) || null;
}

/**
 * Gets a party by message ID
 * @param {string} messageId - Discord message ID
 * @returns {Object|null} Party or null
 */
function getPartyByMessageId(messageId) {
    const data = loadParties();
    return data.parties.find(p => p.messageId === messageId) || null;
}

/**
 * Gets all active parties for a guild
 * @param {string} guildId - Guild ID
 * @returns {Array} Active parties
 */
function getActiveParties(guildId) {
    const data = loadParties();
    return data.parties.filter(p => 
        p.guildId === guildId && 
        ['open', 'full'].includes(p.status)
    );
}

/**
 * Gets parties that need notification (scheduled time reached)
 * @returns {Array} Parties to notify
 */
function getPartiesToNotify() {
    const data = loadParties();
    const now = new Date();
    
    return data.parties.filter(p => {
        if (p.status !== 'open' && p.status !== 'full') return false;
        if (p.notified) return false;
        
        const scheduledTime = new Date(p.scheduledAt);
        return scheduledTime <= now;
    });
}

/**
 * Marks a party as notified
 * @param {string} partyId - Party ID
 */
function markAsNotified(partyId) {
    const data = loadParties();
    const party = data.parties.find(p => p.id === partyId);
    
    if (party) {
        party.notified = true;
        party.status = 'started';
        saveParties(data);
    }
}

/**
 * Cancels a party
 * @param {string} partyId - Party ID
 * @param {string} userId - User requesting cancellation
 * @returns {Object} Result
 */
function cancelParty(partyId, userId) {
    const data = loadParties();
    const party = data.parties.find(p => p.id === partyId);
    
    if (!party) {
        return { success: false, error: 'Grupo não encontrado' };
    }
    
    if (party.creatorId !== userId) {
        return { success: false, error: 'Apenas o criador pode cancelar o grupo' };
    }
    
    if (party.status === 'cancelled') {
        return { success: false, error: 'Grupo já foi cancelado' };
    }
    
    party.status = 'cancelled';
    saveParties(data);
    
    logger.info('Party cancelled', { partyId, userId });
    
    return { success: true, party };
}

/**
 * Cleans up old parties (older than 7 days)
 */
function cleanupOldParties() {
    const data = loadParties();
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    const initialLength = data.parties.length;
    data.parties = data.parties.filter(p => {
        const createdAt = new Date(p.createdAt).getTime();
        return createdAt > cutoff || ['open', 'full'].includes(p.status);
    });
    
    if (data.parties.length < initialLength) {
        saveParties(data);
        logger.info('Cleaned up old parties', { 
            removed: initialLength - data.parties.length 
        });
    }
}

/**
 * Gets party statistics
 * @returns {Object} Stats
 */
function getStats() {
    const data = loadParties();
    const active = data.parties.filter(p => ['open', 'full'].includes(p.status));
    
    return {
        total: data.parties.length,
        active: active.length,
        open: data.parties.filter(p => p.status === 'open').length,
        full: data.parties.filter(p => p.status === 'full').length
    };
}

module.exports = {
    CLASSES,
    loadParties,
    saveParties,
    createParty,
    setPartyMessageId,
    joinParty,
    leaveParty,
    getParty,
    getPartyByMessageId,
    getActiveParties,
    getPartiesToNotify,
    markAsNotified,
    cancelParty,
    cleanupOldParties,
    getStats
};
