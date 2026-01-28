/**
 * Price History Storage
 * Handles persistent storage for market price history
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRICE_FILE = path.join(DATA_DIR, 'price-history.json');

// How many days of data to retain
const RETENTION_DAYS = 90;

/**
 * Ensures data directory exists
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Gets default price history structure
 * @returns {Object} Default price history object
 */
function getDefaultHistory() {
    return {
        items: {},
        lastUpdated: new Date().toISOString()
    };
}

/**
 * Loads price history from file
 * @returns {Object} Price history data
 */
function loadHistory() {
    ensureDataDir();
    
    try {
        if (fs.existsSync(PRICE_FILE)) {
            const data = fs.readFileSync(PRICE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading price history', { error: error.message });
    }
    
    return getDefaultHistory();
}

/**
 * Saves price history to file
 * @param {Object} data - Price history data to save
 */
function saveHistory(data) {
    ensureDataDir();
    
    try {
        data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(PRICE_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        logger.error('Error saving price history', { error: error.message });
    }
}

/**
 * Gets current date key (YYYY-MM-DD)
 * @returns {string} Date key
 */
function getDateKey() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Records price data for an item
 * @param {Object} params - Price data parameters
 * @param {string|number} params.itemId - Item ID
 * @param {string} params.itemName - Item name
 * @param {string} params.server - Server name (FREYA, NIDHOGG, YGGDRASIL)
 * @param {string} params.storeType - Store type (BUY or SELL)
 * @param {number} params.price - Item price
 */
function recordPrice({ itemId, itemName, server, storeType, price }) {
    if (!itemId || !price || price <= 0) return;
    
    const history = loadHistory();
    const dateKey = getDateKey();
    const itemKey = String(itemId);
    
    // Initialize item entry
    if (!history.items[itemKey]) {
        history.items[itemKey] = {
            name: itemName || `Item #${itemId}`,
            servers: {}
        };
    }
    
    // Update item name if provided and different
    if (itemName && history.items[itemKey].name !== itemName) {
        history.items[itemKey].name = itemName;
    }
    
    // Initialize server entry
    if (!history.items[itemKey].servers[server]) {
        history.items[itemKey].servers[server] = {};
    }
    
    // Initialize store type within server
    if (!history.items[itemKey].servers[server][storeType]) {
        history.items[itemKey].servers[server][storeType] = {};
    }
    
    // Initialize day entry
    if (!history.items[itemKey].servers[server][storeType][dateKey]) {
        history.items[itemKey].servers[server][storeType][dateKey] = {
            min: price,
            max: price,
            sum: price,
            samples: 1
        };
    } else {
        // Update existing day entry
        const dayData = history.items[itemKey].servers[server][storeType][dateKey];
        dayData.min = Math.min(dayData.min, price);
        dayData.max = Math.max(dayData.max, price);
        dayData.sum += price;
        dayData.samples++;
    }
    
    // Cleanup old data periodically (1% chance per write)
    if (Math.random() < 0.01) {
        cleanupOldData(history);
    }
    
    saveHistory(history);
}

/**
 * Records multiple prices from a market search result
 * @param {Array} items - Array of market items
 * @param {string} server - Server name
 * @param {string} storeType - Store type
 */
function recordMarketResults(items, server, storeType) {
    if (!items || items.length === 0) return;
    
    const history = loadHistory();
    const dateKey = getDateKey();
    
    // Group items by itemId
    const grouped = {};
    for (const item of items) {
        const itemKey = String(item.itemId);
        if (!grouped[itemKey]) {
            grouped[itemKey] = {
                name: item.itemName,
                prices: []
            };
        }
        grouped[itemKey].prices.push(item.itemPrice);
    }
    
    // Update history for each item
    for (const [itemKey, data] of Object.entries(grouped)) {
        // Initialize item entry
        if (!history.items[itemKey]) {
            history.items[itemKey] = {
                name: data.name,
                servers: {}
            };
        }
        
        // Update name
        if (data.name) {
            history.items[itemKey].name = data.name;
        }
        
        // Initialize server and storeType
        if (!history.items[itemKey].servers[server]) {
            history.items[itemKey].servers[server] = {};
        }
        if (!history.items[itemKey].servers[server][storeType]) {
            history.items[itemKey].servers[server][storeType] = {};
        }
        
        // Calculate stats for the day
        const prices = data.prices;
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const sum = prices.reduce((a, b) => a + b, 0);
        
        // Initialize or update day entry
        if (!history.items[itemKey].servers[server][storeType][dateKey]) {
            history.items[itemKey].servers[server][storeType][dateKey] = {
                min,
                max,
                sum,
                samples: prices.length
            };
        } else {
            const dayData = history.items[itemKey].servers[server][storeType][dateKey];
            dayData.min = Math.min(dayData.min, min);
            dayData.max = Math.max(dayData.max, max);
            dayData.sum += sum;
            dayData.samples += prices.length;
        }
    }
    
    saveHistory(history);
    
    logger.debug('Price history recorded', {
        server,
        storeType,
        itemCount: Object.keys(grouped).length
    });
}

/**
 * Removes data older than retention period
 * @param {Object} history - Price history object
 */
function cleanupOldData(history) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    const cutoffKey = cutoffDate.toISOString().split('T')[0];
    
    let cleanedCount = 0;
    
    for (const itemKey of Object.keys(history.items)) {
        const item = history.items[itemKey];
        
        for (const server of Object.keys(item.servers)) {
            for (const storeType of Object.keys(item.servers[server])) {
                for (const dateKey of Object.keys(item.servers[server][storeType])) {
                    if (dateKey < cutoffKey) {
                        delete item.servers[server][storeType][dateKey];
                        cleanedCount++;
                    }
                }
                
                // Remove empty storeType
                if (Object.keys(item.servers[server][storeType]).length === 0) {
                    delete item.servers[server][storeType];
                }
            }
            
            // Remove empty server
            if (Object.keys(item.servers[server]).length === 0) {
                delete item.servers[server];
            }
        }
        
        // Remove empty item
        if (Object.keys(item.servers).length === 0) {
            delete history.items[itemKey];
        }
    }
    
    if (cleanedCount > 0) {
        logger.info('Price history cleanup', { removedEntries: cleanedCount });
    }
}

/**
 * Gets price history for an item
 * @param {string|number} itemId - Item ID
 * @param {string} [server] - Optional server filter
 * @param {string} [storeType] - Optional store type filter
 * @param {number} [days=30] - Number of days to include
 * @returns {Object|null} Price history data
 */
function getItemHistory(itemId, server = null, storeType = null, days = 30) {
    const history = loadHistory();
    const itemKey = String(itemId);
    
    if (!history.items[itemKey]) {
        return null;
    }
    
    const item = history.items[itemKey];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffKey = cutoffDate.toISOString().split('T')[0];
    
    const result = {
        itemId: itemKey,
        name: item.name,
        servers: {}
    };
    
    const serversToProcess = server ? [server] : Object.keys(item.servers);
    
    for (const srv of serversToProcess) {
        if (!item.servers[srv]) continue;
        
        result.servers[srv] = {};
        
        const typesToProcess = storeType ? [storeType] : Object.keys(item.servers[srv]);
        
        for (const type of typesToProcess) {
            if (!item.servers[srv][type]) continue;
            
            const dailyData = [];
            
            for (const [dateKey, data] of Object.entries(item.servers[srv][type])) {
                if (dateKey >= cutoffKey) {
                    dailyData.push({
                        date: dateKey,
                        min: data.min,
                        max: data.max,
                        avg: Math.round(data.sum / data.samples),
                        samples: data.samples
                    });
                }
            }
            
            // Sort by date
            dailyData.sort((a, b) => a.date.localeCompare(b.date));
            
            if (dailyData.length > 0) {
                result.servers[srv][type] = dailyData;
            }
        }
        
        // Remove empty server
        if (Object.keys(result.servers[srv]).length === 0) {
            delete result.servers[srv];
        }
    }
    
    if (Object.keys(result.servers).length === 0) {
        return null;
    }
    
    return result;
}

/**
 * Searches items by name
 * @param {string} searchTerm - Search term
 * @param {number} [limit=20] - Maximum results
 * @returns {Array} Array of matching items
 */
function searchItems(searchTerm, limit = 20) {
    const history = loadHistory();
    const results = [];
    const searchLower = searchTerm.toLowerCase();
    
    for (const [itemId, item] of Object.entries(history.items)) {
        if (item.name.toLowerCase().includes(searchLower)) {
            // Get latest price data
            let latestPrice = null;
            let latestDate = null;
            
            for (const server of Object.keys(item.servers)) {
                for (const storeType of Object.keys(item.servers[server])) {
                    const dates = Object.keys(item.servers[server][storeType]).sort().reverse();
                    if (dates.length > 0) {
                        const dateKey = dates[0];
                        if (!latestDate || dateKey > latestDate) {
                            latestDate = dateKey;
                            const dayData = item.servers[server][storeType][dateKey];
                            latestPrice = {
                                server,
                                storeType,
                                min: dayData.min,
                                max: dayData.max,
                                avg: Math.round(dayData.sum / dayData.samples)
                            };
                        }
                    }
                }
            }
            
            results.push({
                itemId,
                name: item.name,
                latestPrice,
                latestDate
            });
            
            if (results.length >= limit) break;
        }
    }
    
    return results;
}

/**
 * Gets statistics summary
 * @returns {Object} Statistics
 */
function getStats() {
    const history = loadHistory();
    
    let totalItems = 0;
    let totalRecords = 0;
    const serverCounts = {};
    
    for (const item of Object.values(history.items)) {
        totalItems++;
        
        for (const [server, serverData] of Object.entries(item.servers)) {
            if (!serverCounts[server]) {
                serverCounts[server] = 0;
            }
            
            for (const storeType of Object.keys(serverData)) {
                serverCounts[server] += Object.keys(serverData[storeType]).length;
                totalRecords += Object.keys(serverData[storeType]).length;
            }
        }
    }
    
    return {
        totalItems,
        totalRecords,
        serverCounts,
        lastUpdated: history.lastUpdated
    };
}

module.exports = {
    loadHistory,
    saveHistory,
    recordPrice,
    recordMarketResults,
    getItemHistory,
    searchItems,
    getStats,
    cleanupOldData
};
