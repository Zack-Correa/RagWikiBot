/**
 * Card Cache
 * Caches card data from Divine Pride for fast searching by effect/description
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'card-cache.json');

// Cache settings
const CACHE_MAX_AGE_DAYS = 7; // Refresh cache weekly
const CARD_ID_START = 4001; // Cards typically start around this ID
const CARD_ID_END = 32000; // Upper range for cards

// Divine Pride search URL
const DIVINE_PRIDE_SEARCH = 'https://www.divine-pride.net/database/item/card';
const DIVINE_PRIDE_ITEM_API = 'https://www.divine-pride.net/api/database/Item/';

/**
 * Ensures data directory exists
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Gets default cache structure
 * @returns {Object} Default cache object
 */
function getDefaultCache() {
    return {
        cards: [],
        lastUpdated: null,
        version: 1
    };
}

/**
 * Loads cache from file
 * @returns {Object} Cache data
 */
function loadCache() {
    ensureDataDir();
    
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = fs.readFileSync(CACHE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading card cache', { error: error.message });
    }
    
    return getDefaultCache();
}

/**
 * Saves cache to file
 * @param {Object} cache - Cache data to save
 */
function saveCache(cache) {
    ensureDataDir();
    
    try {
        cache.lastUpdated = new Date().toISOString();
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
        logger.info('Card cache saved', { cardCount: cache.cards.length });
    } catch (error) {
        logger.error('Error saving card cache', { error: error.message });
    }
}

/**
 * Checks if cache needs refresh
 * @returns {boolean} True if cache is stale
 */
function isCacheStale() {
    const cache = loadCache();
    
    if (!cache.lastUpdated || cache.cards.length === 0) {
        return true;
    }
    
    const lastUpdate = new Date(cache.lastUpdated);
    const now = new Date();
    const daysSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60 * 24);
    
    return daysSinceUpdate >= CACHE_MAX_AGE_DAYS;
}

/**
 * Adds a card to the cache
 * @param {Object} card - Card data
 */
function addCard(card) {
    if (!card || !card.id || !card.name) return;
    
    const cache = loadCache();
    
    // Check if card already exists
    const existingIndex = cache.cards.findIndex(c => c.id === card.id);
    
    const cardEntry = {
        id: card.id,
        name: card.name,
        description: card.description || '',
        imageUrl: card.imageUrl || null,
        prefix: card.prefix || '',
        suffix: card.suffix || ''
    };
    
    if (existingIndex >= 0) {
        cache.cards[existingIndex] = cardEntry;
    } else {
        cache.cards.push(cardEntry);
    }
    
    saveCache(cache);
}

/**
 * Adds multiple cards to cache
 * @param {Array} cards - Array of card data
 */
function addCards(cards) {
    if (!cards || cards.length === 0) return;
    
    const cache = loadCache();
    
    for (const card of cards) {
        if (!card || !card.id || !card.name) continue;
        
        const cardEntry = {
            id: card.id,
            name: card.name,
            description: card.description || '',
            imageUrl: card.imageUrl || null,
            prefix: card.prefix || '',
            suffix: card.suffix || ''
        };
        
        const existingIndex = cache.cards.findIndex(c => c.id === card.id);
        
        if (existingIndex >= 0) {
            cache.cards[existingIndex] = cardEntry;
        } else {
            cache.cards.push(cardEntry);
        }
    }
    
    saveCache(cache);
}

/**
 * Searches cards by effect/description
 * @param {string} searchTerm - Term to search in description
 * @param {number} [limit=20] - Maximum results
 * @returns {Array} Matching cards
 */
function searchByEffect(searchTerm, limit = 20) {
    const cache = loadCache();
    const searchLower = searchTerm.toLowerCase();
    const results = [];
    
    for (const card of cache.cards) {
        const descLower = (card.description || '').toLowerCase();
        const nameLower = card.name.toLowerCase();
        
        // Search in description and name
        if (descLower.includes(searchLower) || nameLower.includes(searchLower)) {
            results.push(card);
            
            if (results.length >= limit) break;
        }
    }
    
    // Sort by relevance (exact matches first, then by name length)
    results.sort((a, b) => {
        const aDesc = (a.description || '').toLowerCase();
        const bDesc = (b.description || '').toLowerCase();
        
        // Exact match in description gets priority
        const aExact = aDesc.includes(searchLower);
        const bExact = bDesc.includes(searchLower);
        
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        return a.name.length - b.name.length;
    });
    
    return results;
}

/**
 * Searches cards by name
 * @param {string} searchTerm - Term to search in name
 * @param {number} [limit=20] - Maximum results
 * @returns {Array} Matching cards
 */
function searchByName(searchTerm, limit = 20) {
    const cache = loadCache();
    const searchLower = searchTerm.toLowerCase();
    const results = [];
    
    for (const card of cache.cards) {
        if (card.name.toLowerCase().includes(searchLower)) {
            results.push(card);
            
            if (results.length >= limit) break;
        }
    }
    
    return results;
}

/**
 * Gets a card by ID
 * @param {number|string} cardId - Card ID
 * @returns {Object|null} Card data or null
 */
function getCard(cardId) {
    const cache = loadCache();
    return cache.cards.find(c => c.id === parseInt(cardId, 10)) || null;
}

/**
 * Gets cache statistics
 * @returns {Object} Cache stats
 */
function getStats() {
    const cache = loadCache();
    
    return {
        totalCards: cache.cards.length,
        lastUpdated: cache.lastUpdated,
        isStale: isCacheStale()
    };
}

/**
 * Fetches card details from Divine Pride API
 * @param {number} cardId - Card ID
 * @returns {Promise<Object|null>} Card data or null
 */
async function fetchCardFromAPI(cardId) {
    const apiKey = config.api?.divinePride?.apiKey;
    
    if (!apiKey) {
        logger.warn('Divine Pride API key not configured');
        return null;
    }
    
    try {
        const response = await axios.get(
            `${DIVINE_PRIDE_ITEM_API}${cardId}?apiKey=${apiKey}&server=LATAM`,
            {
                headers: {
                    'Accept-Language': 'pt-BR,pt;q=0.9'
                },
                timeout: 10000
            }
        );
        
        if (response.data) {
            const item = response.data;
            
            // Check if it's actually a card (item type 6 = card)
            if (item.itemTypeId === 6) {
                return {
                    id: item.id,
                    name: item.name,
                    description: item.description || '',
                    imageUrl: `https://static.divine-pride.net/images/items/item/${item.id}.png`,
                    prefix: item.prefix || '',
                    suffix: item.suffix || ''
                };
            }
        }
        
        return null;
    } catch (error) {
        logger.debug('Error fetching card from API', { cardId, error: error.message });
        return null;
    }
}

/**
 * Parses card data from Divine Pride HTML search results
 * @param {string} html - HTML content
 * @returns {Array} Array of card data
 */
function parseCardsFromHTML(html) {
    const cards = [];
    
    // Match card entries in the HTML
    // Pattern: <a href="/database/item/XXXX">Card Name</a>
    const cardPattern = /<a\s+href="\/database\/item\/(\d+)"[^>]*>([^<]+)<\/a>/gi;
    
    let match;
    while ((match = cardPattern.exec(html)) !== null) {
        const id = parseInt(match[1], 10);
        const name = match[2].trim();
        
        // Filter for card IDs (typically 4001-32000 range)
        if (id >= CARD_ID_START && id <= CARD_ID_END && name.includes('Card')) {
            cards.push({
                id,
                name,
                description: '', // Need to fetch individually for description
                imageUrl: `https://static.divine-pride.net/images/items/item/${id}.png`
            });
        }
    }
    
    return cards;
}

/**
 * Clears the cache
 */
function clearCache() {
    const defaultCache = getDefaultCache();
    saveCache(defaultCache);
    logger.info('Card cache cleared');
}

/**
 * Manual cache population from a list of known cards
 * @param {Array} cardList - Array of card objects with id, name, description
 */
function populateCache(cardList) {
    const cache = getDefaultCache();
    cache.cards = cardList.map(card => ({
        id: card.id,
        name: card.name,
        description: card.description || '',
        imageUrl: card.imageUrl || `https://static.divine-pride.net/images/items/item/${card.id}.png`,
        prefix: card.prefix || '',
        suffix: card.suffix || ''
    }));
    saveCache(cache);
}

module.exports = {
    loadCache,
    saveCache,
    addCard,
    addCards,
    searchByEffect,
    searchByName,
    getCard,
    getStats,
    fetchCardFromAPI,
    parseCardsFromHTML,
    clearCache,
    populateCache,
    isCacheStale
};
