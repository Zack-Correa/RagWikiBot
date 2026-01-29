/**
 * Party Storage Module
 * Handles persistence of instance parties/groups
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const PARTIES_FILE = path.join(__dirname, '..', 'data', 'parties.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

// RO 3rd Classes with emojis (Portuguese names from bROwiki)
const CLASSES = {
    // Espadachim branch
    RUNE_KNIGHT: { emoji: '⚔️', name: 'Cavaleiro Rúnico', description: 'Rune Knight' },
    ROYAL_GUARD: { emoji: '🛡️', name: 'Guardião Real', description: 'Royal Guard' },
    // Mago branch
    WARLOCK: { emoji: '🔮', name: 'Arcano', description: 'Warlock' },
    SORCERER: { emoji: '🌀', name: 'Feiticeiro', description: 'Sorcerer' },
    // Gatuno branch
    GUILLOTINE_CROSS: { emoji: '🗡️', name: 'Sicário', description: 'Guillotine Cross' },
    SHADOW_CHASER: { emoji: '🎭', name: 'Renegado', description: 'Shadow Chaser' },
    // Mercador branch
    MECHANIC: { emoji: '🔧', name: 'Mecânico', description: 'Mechanic' },
    GENETIC: { emoji: '🧬', name: 'Bioquímico', description: 'Genetic' },
    // Noviço branch
    ARCH_BISHOP: { emoji: '✨', name: 'Arcebispo', description: 'Arch Bishop' },
    SURA: { emoji: '👊', name: 'Shura', description: 'Sura' },
    // Arqueiro branch
    RANGER: { emoji: '🏹', name: 'Sentinela', description: 'Ranger' },
    MINSTREL: { emoji: '🎵', name: 'Trovador', description: 'Maestro/Minstrel' },
    WANDERER: { emoji: '💃', name: 'Musa', description: 'Wanderer' },
    // Expanded classes
    STAR_EMPEROR: { emoji: '⭐', name: 'Mestre Estelar', description: 'Star Emperor' },
    SOUL_REAPER: { emoji: '👻', name: 'Ceifador de Almas', description: 'Soul Reaper' },
    REBELLION: { emoji: '🔫', name: 'Insurgente', description: 'Rebellion' },
    KAGEROU: { emoji: '🥷', name: 'Kagerou', description: 'Kagerou' },
    OBORO: { emoji: '🌸', name: 'Oboro', description: 'Oboro' },
    SUMMONER: { emoji: '🐱', name: 'Invocador', description: 'Summoner/Doram' },
    SUPER_NOVICE: { emoji: '🌟', name: 'Superaprendiz', description: 'Super Novice' },
    // Flex option
    FLEX: { emoji: '🔄', name: 'Qualquer', description: 'Qualquer classe' }
};

// Instance templates with recommended class compositions
const INSTANCE_TEMPLATES = {
    'Torre sem Fim': {
        name: 'Torre sem Fim',
        maxSlots: 12,
        classLimits: {
            ROYAL_GUARD: 2,      // Tanks
            ARCH_BISHOP: 2,      // Healers
            GENETIC: 2,          // Support/DPS
            MINSTREL: 1,         // Bard
            WANDERER: 1          // Dancer
        }
    },
    'Laboratório Biológico 5': {
        name: 'Laboratório Biológico 5',
        maxSlots: 12,
        classLimits: {
            ROYAL_GUARD: 2,
            ARCH_BISHOP: 3,
            GENETIC: 2
        }
    },
    'Abyss Glast Heim': {
        name: 'Abyss Glast Heim',
        maxSlots: 6,
        classLimits: {
            ROYAL_GUARD: 1,
            ARCH_BISHOP: 1
        }
    },
    'Coração de Ymir': {
        name: 'Coração de Ymir',
        maxSlots: 12,
        classLimits: {
            ROYAL_GUARD: 2,
            ARCH_BISHOP: 2
        }
    },
    'Sala do Abismo': {
        name: 'Sala do Abismo',
        maxSlots: 12,
        classLimits: {}
    },
    'free': {
        name: 'Livre',
        maxSlots: 12,
        classLimits: {}
    }
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
    
    // Check for template
    const template = partyData.template ? INSTANCE_TEMPLATES[partyData.template] : null;
    
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
        maxSlots: Math.min(partyData.maxSlots || template?.maxSlots || 12, 120), // Max 120 slots
        classLimits: partyData.classLimits || template?.classLimits || {}, // Class limits
        participants: [],
        status: 'open', // open, full, started, cancelled, completed
        notified2h: false,   // 2 hours before - confirmation
        notified30m: false,  // 30 minutes before - reminder
        notified: false,     // Event start notification
        createdAt: new Date().toISOString()
    };
    
    data.parties.push(party);
    saveParties(data);
    
    logger.info('Party created', { 
        partyId: party.id, 
        instance: party.instanceName,
        creator: party.creatorId,
        hasClassLimits: Object.keys(party.classLimits).length > 0
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
    
    // Check class limits (if defined and not FLEX)
    if (classType !== 'FLEX' && party.classLimits && party.classLimits[classType] !== undefined) {
        const currentCount = party.participants.filter(p => p.classType === classType).length;
        const limit = party.classLimits[classType];
        
        // If user is changing class, don't count their current spot
        const adjustedCount = existingIndex >= 0 && party.participants[existingIndex].classType === classType 
            ? currentCount - 1 
            : currentCount;
        
        if (adjustedCount >= limit) {
            const className = CLASSES[classType]?.name || classType;
            return { 
                success: false, 
                error: `Limite de ${className} atingido (${limit}/${limit})`,
                classLimitReached: true
            };
        }
    }
    
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
 * Updates class limits for a party
 * @param {string} partyId - Party ID
 * @param {Object} classLimits - Object with class types as keys and limits as values
 * @returns {Object} Result
 */
function updateClassLimits(partyId, classLimits) {
    const data = loadParties();
    const party = data.parties.find(p => p.id === partyId);
    
    if (!party) {
        return { success: false, error: 'Grupo não encontrado' };
    }
    
    party.classLimits = classLimits || {};
    saveParties(data);
    
    logger.info('Party class limits updated', { partyId, classLimits });
    
    return { success: true, party };
}

/**
 * Gets class counts for a party
 * @param {string} partyId - Party ID
 * @returns {Object} Class counts
 */
function getClassCounts(partyId) {
    const data = loadParties();
    const party = data.parties.find(p => p.id === partyId);
    
    if (!party) {
        return null;
    }
    
    const counts = {};
    for (const participant of party.participants) {
        counts[participant.classType] = (counts[participant.classType] || 0) + 1;
    }
    
    return counts;
}

/**
 * Gets available classes for a party (respecting limits)
 * @param {string} partyId - Party ID
 * @returns {Array} Available class types
 */
function getAvailableClasses(partyId) {
    const data = loadParties();
    const party = data.parties.find(p => p.id === partyId);
    
    if (!party) {
        return Object.keys(CLASSES);
    }
    
    // If no limits defined, all classes are available
    if (!party.classLimits || Object.keys(party.classLimits).length === 0) {
        return Object.keys(CLASSES);
    }
    
    const counts = getClassCounts(partyId) || {};
    const available = [];
    
    for (const classType of Object.keys(CLASSES)) {
        if (classType === 'FLEX') {
            available.push(classType);
            continue;
        }
        
        const limit = party.classLimits[classType];
        const currentCount = counts[classType] || 0;
        
        // If no limit defined for this class, it's available
        // If limit is defined and not reached, it's available
        if (limit === undefined || currentCount < limit) {
            available.push(classType);
        }
    }
    
    return available;
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
 * Gets parties that need notification based on time
 * @param {string} type - Notification type: '2h', '30m', or 'start'
 * @returns {Array} Parties to notify
 */
function getPartiesToNotify(type = 'start') {
    const data = loadParties();
    const now = new Date();
    
    return data.parties.filter(p => {
        if (p.status !== 'open' && p.status !== 'full') return false;
        
        const scheduledTime = new Date(p.scheduledAt);
        const timeDiff = scheduledTime - now; // milliseconds until event
        
        switch (type) {
            case '2h':
                // Notify 2 hours before (between 2h and 1h50m before)
                if (p.notified2h) return false;
                return timeDiff <= 2 * 60 * 60 * 1000 && timeDiff > 110 * 60 * 1000;
            
            case '30m':
                // Notify 30 minutes before (between 30m and 20m before)
                if (p.notified30m) return false;
                return timeDiff <= 30 * 60 * 1000 && timeDiff > 20 * 60 * 1000;
            
            case 'start':
            default:
                // Notify at event start
                if (p.notified) return false;
                return scheduledTime <= now;
        }
    });
}

/**
 * Marks a party as notified
 * @param {string} partyId - Party ID
 * @param {string} type - Notification type: '2h', '30m', or 'start'
 */
function markAsNotified(partyId, type = 'start') {
    const data = loadParties();
    const party = data.parties.find(p => p.id === partyId);
    
    if (party) {
        switch (type) {
            case '2h':
                party.notified2h = true;
                break;
            case '30m':
                party.notified30m = true;
                break;
            case 'start':
            default:
                party.notified = true;
                party.status = 'started';
                break;
        }
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
    INSTANCE_TEMPLATES,
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
    getStats,
    updateClassLimits,
    getClassCounts,
    getAvailableClasses
};
