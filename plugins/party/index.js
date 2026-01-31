/**
 * Party Plugin
 * Instance group management system for Ragnarok Online LATAM
 * Features: scheduling, notifications, buttons, modals, class limits
 */

const partyService = require('../../services/partyService');
const partyStorage = require('../../utils/partyStorage');
const partyCommand = require('./command');

let pluginLogger = null;
let discordClient = null;

/**
 * Called when plugin is loaded
 */
function onLoad(context) {
    pluginLogger = context.logger;
    context.logger.info('Party plugin loaded');
}

/**
 * Called when plugin is enabled
 */
function onEnable(context) {
    discordClient = context.getClient();
    
    if (discordClient) {
        partyService.initialize(discordClient);
        context.logger.info('Party service initialized');
    }
    
    context.logger.info('Party plugin enabled');
}

/**
 * Called when plugin is disabled
 */
function onDisable(context) {
    partyService.shutdown();
    context.logger.info('Party plugin disabled');
}

/**
 * Called when plugin is unloaded
 */
function onUnload(context) {
    partyService.shutdown();
    context.logger.info('Party plugin unloaded');
}

// Export command
const commands = {
    'grupo': {
        data: partyCommand.data,
        execute: partyCommand.execute,
        autocomplete: partyCommand.autocomplete
    }
};

// Export plugin interface
module.exports = {
    onLoad,
    onEnable,
    onDisable,
    onUnload,
    commands,
    events: {},
    
    // Public API
    api: {
        // Service functions
        updatePartyMessage: partyService.updatePartyMessage,
        handleJoinButton: partyService.handleJoinButton,
        handleLeaveButton: partyService.handleLeaveButton,
        handleConfigButton: partyService.handleConfigButton,
        handleCancelButton: partyService.handleCancelButton,
        handleClassSelect: partyService.handleClassSelect,
        handleModalSubmit: partyService.handleModalSubmit,
        
        // Storage functions  
        loadParties: partyStorage.loadParties,
        saveParties: partyStorage.saveParties,
        createParty: partyStorage.createParty,
        getParty: partyStorage.getParty,
        joinParty: partyStorage.joinParty,
        leaveParty: partyStorage.leaveParty,
        cancelParty: partyStorage.cancelParty,
        getActiveParties: partyStorage.getActiveParties,
        getUserParties: partyStorage.getUserParties,
        updateClassLimits: partyStorage.updateClassLimits,
        getClassCounts: partyStorage.getClassCounts,
        getAvailableClasses: partyStorage.getAvailableClasses,
        
        // Loot functions
        addLoot: partyStorage.addLoot,
        removeLoot: partyStorage.removeLoot,
        rollLootItem: partyStorage.rollLootItem,
        rollAllLoot: partyStorage.rollAllLoot,
        getLoot: partyStorage.getLoot,
        clearLoot: partyStorage.clearLoot,
        
        // Constants
        INSTANCE_LIST: partyStorage.INSTANCE_LIST,
        INSTANCE_TEMPLATES: partyStorage.INSTANCE_TEMPLATES,
        CLASSES_3RD: partyStorage.CLASSES_3RD
    }
};
