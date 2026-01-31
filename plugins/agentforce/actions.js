/**
 * Actions Mapping
 * Maps Agentforce actions to existing bot APIs
 * Executes searches and returns formatted results
 */

const logger = require('../../utils/logger');

// Available actions with their handlers
const ACTIONS = {
    // Item search
    search_item: {
        description: 'Search for items by name or ID',
        params: ['query', 'language'],
        handler: async (params) => {
            const divinePride = require('../../integrations/database/divine-pride');
            const query = params.query || params.item || params.name;
            const language = params.language || 'pt';
            
            if (!query) {
                return { error: 'Query is required', type: 'item' };
            }
            
            // Check if it's a numeric ID
            if (/^\d+$/.test(query)) {
                const result = await divinePride.cached.makeItemIdRequest(query, language);
                return { data: [result], type: 'item', single: true };
            }
            
            const results = await divinePride.cached.makeSearchQuery(query, language);
            return { data: results, type: 'item' };
        }
    },
    
    // Monster search
    search_monster: {
        description: 'Search for monsters by name or ID',
        params: ['query', 'language'],
        handler: async (params) => {
            const divinePride = require('../../integrations/database/divine-pride');
            const query = params.query || params.monster || params.name;
            const language = params.language || 'pt';
            
            if (!query) {
                return { error: 'Query is required', type: 'monster' };
            }
            
            // Check if it's a numeric ID
            if (/^\d+$/.test(query)) {
                const result = await divinePride.cached.monsterSearch(query, language);
                return { data: result, type: 'monster', single: true };
            }
            
            const results = await divinePride.cached.makeMonsterSearchQuery(query, language);
            return { data: results, type: 'monster' };
        }
    },
    
    // Map search
    search_map: {
        description: 'Search for maps by name or ID',
        params: ['query', 'language'],
        handler: async (params) => {
            const divinePride = require('../../integrations/database/divine-pride');
            const query = params.query || params.map || params.name;
            const language = params.language || 'pt';
            
            if (!query) {
                return { error: 'Query is required', type: 'map' };
            }
            
            // Check if it's a map ID format (e.g., prt_fild01)
            if (/^[a-z_]+\d*$/i.test(query)) {
                const result = await divinePride.cached.mapSearch(query, language);
                return { data: result, type: 'map', single: true };
            }
            
            const results = await divinePride.cached.makeMapSearchQuery(query, language);
            return { data: results, type: 'map' };
        }
    },
    
    // Market search
    search_market: {
        description: 'Search for items in the market',
        params: ['query', 'server', 'type'],
        handler: async (params) => {
            const gnjoy = require('../../integrations/database/gnjoy');
            const query = params.query || params.item || params.name;
            const server = (params.server || 'FREYA').toUpperCase();
            const storeType = (params.type || params.storeType || 'SELL').toUpperCase();
            
            if (!query) {
                return { error: 'Query is required', type: 'market' };
            }
            
            const results = await gnjoy.cached.searchMarket(query, {
                server,
                storeType
            });
            
            return { 
                data: results, 
                type: 'market',
                server,
                storeType
            };
        }
    },
    
    // Wiki search
    search_wiki: {
        description: 'Search in Browiki',
        params: ['query'],
        handler: async (params) => {
            const wiki = require('../../integrations/wikis/wikiRequests');
            const query = params.query || params.term || params.search;
            
            if (!query) {
                return { error: 'Query is required', type: 'wiki' };
            }
            
            const results = await wiki.cached.makeRequest(query);
            return { data: results, type: 'wiki' };
        }
    },
    
    // Price check/analysis
    check_price: {
        description: 'Analyze if a price is fair',
        params: ['item', 'price', 'server'],
        handler: async (params) => {
            const gnjoy = require('../../integrations/database/gnjoy');
            const item = params.item || params.query || params.name;
            const price = parseInt(params.price, 10);
            const server = (params.server || 'FREYA').toUpperCase();
            
            if (!item) {
                return { error: 'Item name is required', type: 'price' };
            }
            
            // Get market data
            const marketResult = await gnjoy.cached.searchMarket(item, {
                server,
                storeType: 'SELL'
            });
            
            // Calculate price statistics
            const listings = marketResult.list || [];
            if (listings.length === 0) {
                return { 
                    error: 'Item not found in market', 
                    type: 'price',
                    item
                };
            }
            
            const prices = listings.map(l => l.price).sort((a, b) => a - b);
            const minPrice = prices[0];
            const maxPrice = prices[prices.length - 1];
            const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
            const medianPrice = prices[Math.floor(prices.length / 2)];
            
            let analysis = 'justo';
            let percentFromMedian = 0;
            
            if (price) {
                percentFromMedian = ((price - medianPrice) / medianPrice * 100).toFixed(1);
                
                if (price < minPrice * 0.8) {
                    analysis = 'muito_barato';
                } else if (price < medianPrice * 0.9) {
                    analysis = 'barato';
                } else if (price > maxPrice * 1.2) {
                    analysis = 'muito_caro';
                } else if (price > medianPrice * 1.1) {
                    analysis = 'caro';
                }
            }
            
            return {
                type: 'price',
                data: {
                    item: listings[0].itemName || item,
                    itemId: listings[0].itemId,
                    server,
                    inputPrice: price,
                    analysis,
                    percentFromMedian,
                    stats: {
                        min: minPrice,
                        max: maxPrice,
                        avg: avgPrice,
                        median: medianPrice,
                        count: listings.length
                    },
                    currentListings: listings.slice(0, 5)
                }
            };
        }
    },
    
    // Price history
    price_history: {
        description: 'Get price history for an item',
        params: ['item', 'server'],
        handler: async (params) => {
            const gnjoy = require('../../integrations/database/gnjoy');
            const item = params.item || params.query;
            const server = (params.server || 'FREYA').toUpperCase();
            
            if (!item) {
                return { error: 'Item name is required', type: 'history' };
            }
            
            const result = await gnjoy.cached.getMarketWithHistory(item, { server });
            
            return {
                type: 'history',
                data: result
            };
        }
    },
    
    // Server status
    server_status: {
        description: 'Get server status',
        params: [],
        handler: async () => {
            try {
                const serverStatusStorage = require('../../utils/serverStatusStorage');
                const status = serverStatusStorage.loadStatus();
                
                return {
                    type: 'server_status',
                    data: status
                };
            } catch (error) {
                return {
                    type: 'server_status',
                    error: 'Could not get server status'
                };
            }
        }
    }
};

// Aliases for common variations
const ACTION_ALIASES = {
    'buscar_item': 'search_item',
    'item': 'search_item',
    'buscar_monstro': 'search_monster',
    'monster': 'search_monster',
    'monstro': 'search_monster',
    'buscar_mapa': 'search_map',
    'map': 'search_map',
    'mapa': 'search_map',
    'buscar_mercado': 'search_market',
    'market': 'search_market',
    'mercado': 'search_market',
    'preco': 'search_market',
    'buscar_wiki': 'search_wiki',
    'wiki': 'search_wiki',
    'verificar_preco': 'check_price',
    'preco_justo': 'check_price',
    'price': 'check_price',
    'historico': 'price_history',
    'historico_preco': 'price_history',
    'history': 'price_history',
    'servidor': 'server_status',
    'status': 'server_status'
};

/**
 * Execute an action by name
 * @param {string} actionName - Name of the action
 * @param {Object} params - Action parameters
 * @returns {Promise<Object>} Action result
 */
async function executeAction(actionName, params = {}) {
    // Resolve alias
    const resolvedName = ACTION_ALIASES[actionName?.toLowerCase()] || actionName?.toLowerCase();
    
    const action = ACTIONS[resolvedName];
    
    if (!action) {
        logger.warn('Unknown action', { actionName, resolvedName });
        return {
            error: `Unknown action: ${actionName}`,
            availableActions: Object.keys(ACTIONS)
        };
    }
    
    try {
        logger.debug('Executing action', { action: resolvedName, params });
        const result = await action.handler(params);
        logger.debug('Action completed', { action: resolvedName, hasData: !!result.data });
        return result;
    } catch (error) {
        logger.error('Action execution failed', { 
            action: resolvedName, 
            error: error.message 
        });
        return {
            error: error.message,
            type: resolvedName
        };
    }
}

/**
 * Get list of available actions
 * @returns {Array} List of action names and descriptions
 */
function getAvailableActions() {
    return Object.entries(ACTIONS).map(([name, action]) => ({
        name,
        description: action.description,
        params: action.params
    }));
}

/**
 * Check if an action exists
 * @param {string} actionName - Action name to check
 * @returns {boolean} True if action exists
 */
function hasAction(actionName) {
    const resolvedName = ACTION_ALIASES[actionName?.toLowerCase()] || actionName?.toLowerCase();
    return !!ACTIONS[resolvedName];
}

module.exports = {
    executeAction,
    getAvailableActions,
    hasAction,
    ACTIONS,
    ACTION_ALIASES
};
