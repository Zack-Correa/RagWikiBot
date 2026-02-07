/**
 * Pricing Plugin
 * Price analysis and market history for Ragnarok Online LATAM
 */

// Reference existing service files
const pricingService = require('../../services/pricingService');
const priceHistoryStorage = require('../../utils/priceHistoryStorage');

// Load commands from plugin folder
const priceCheckCommand = require('./commands/price-check');
const priceHistoryCommand = require('./commands/price-history');

let pluginLogger = null;

/**
 * Called when plugin is loaded
 */
function onLoad(context) {
    pluginLogger = context.logger;
    context.logger.info('Pricing plugin loaded');
}

/**
 * Called when plugin is enabled
 */
function onEnable(context) {
    context.logger.info('Pricing plugin enabled');
}

/**
 * Called when plugin is disabled
 */
function onDisable(context) {
    context.logger.info('Pricing plugin disabled');
}

/**
 * Called when plugin is unloaded
 */
function onUnload(context) {
    context.logger.info('Pricing plugin unloaded');
}

// Export commands
const commands = {
    'preco-justo': {
        data: priceCheckCommand.data,
        execute: priceCheckCommand.execute
    },
    'historico-preco': {
        data: priceHistoryCommand.data,
        execute: priceHistoryCommand.execute
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
        analyzePriceLevel: pricingService.analyzePriceLevel,
        analyzeItem: pricingService.analyzeItem,
        analyzePrice: pricingService.analyzePrice,
        detectAnomalies: pricingService.detectAnomalies,
        getTrendingItems: pricingService.getTrendingItems,
        PRICE_LEVELS: pricingService.PRICE_LEVELS,
        getItemHistory: priceHistoryStorage.getItemHistory,
        recordPrice: priceHistoryStorage.recordPrice
    }
};
