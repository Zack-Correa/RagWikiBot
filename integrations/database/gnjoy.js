/**
 * GNJoy LATAM API Integration
 * Handles interactions with the Ragnarok Online LATAM market/trading API
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const { APIError } = require('../../utils/errors');
const priceHistoryStorage = require('../../utils/priceHistoryStorage');
const apiCache = require('../../utils/apiCache');

// API endpoints
const ENDPOINTS = {
    MARKET_SEARCH: 'https://ro.gnjoylatam.com/pt/intro/shop-search/trading',
    MARKET_PRICE: 'https://ro.gnjoylatam.com/pt/intro/shop-search/market-price',
    BASE_PAGE: 'https://ro.gnjoylatam.com/pt/intro/shop-search/trading'
};

// Server IDs mapping
const SERVER_IDS = {
    FREYA: 3,
    NIDHOGG: 4,
    YGGDRASIL: 5
};

// Available servers
const SERVERS = {
    FREYA: 'FREYA',
    NIDHOGG: 'NIDHOGG',
    YGGDRASIL: 'YGGDRASIL'
};

// Store types
const STORE_TYPES = {
    BUY: 'BUY',
    SELL: 'SELL'
};

// Cookie cache for session management
const cookieCache = new Map();
const COOKIE_CACHE_TTL = 1800000; // 30 minutes

/**
 * Extracts cookies from axios response headers
 * @param {Object} response - Axios response object
 * @returns {string} Cookie string
 */
function extractCookies(response) {
    const cookies = response.headers['set-cookie'];
    if (!cookies || !Array.isArray(cookies)) {
        return '';
    }
    
    return cookies.map(cookie => {
        const cookieParts = cookie.split(';')[0];
        return cookieParts.trim();
    }).join('; ');
}

/**
 * Sets up session cookies by visiting the base page first
 * @returns {Promise<string>} Cookie string to use in requests
 */
async function setupSessionCookies() {
    const cacheKey = 'gnjoy-session';
    
    // Check if we have valid cached cookies
    const cached = cookieCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < COOKIE_CACHE_TTL) {
        logger.debug('Using cached gnjoy cookies');
        return cached.cookies;
    }
    
    try {
        logger.debug('Setting up gnjoy session cookies');
        
        // Visit the base page to get cookies
        const response = await axios.get(ENDPOINTS.BASE_PAGE, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: 10000,
            maxRedirects: 5
        });
        
        const cookies = extractCookies(response);
        
        if (cookies) {
            cookieCache.set(cacheKey, {
                cookies: cookies,
                timestamp: Date.now()
            });
            logger.debug('GNJoy cookies configured', { hasCookies: !!cookies });
        }
        
        return cookies;
    } catch (error) {
        logger.warn('Failed to setup gnjoy session cookies', { error: error.message });
        return '';
    }
}

/**
 * Parses the React Server Components streaming response to extract JSON data
 * @param {string} responseText - Raw response text
 * @returns {Object|null} Parsed data object or null
 */
function parseRSCResponse(responseText) {
    try {
        // The RSC response contains lines like:
        // 10:["$","$L12",null,{"queryParams":...,"list":[...],"totalCount":...}]
        // We need to find the line with the actual data
        
        const lines = responseText.split('\n');
        
        for (const line of lines) {
            // Look for lines that contain "list" and "totalCount"
            if (line.includes('"list"') && line.includes('"totalCount"')) {
                // Extract the JSON object from the line
                // Format: 10:["$","$L12",null,{...data...}]
                const colonIndex = line.indexOf(':');
                if (colonIndex === -1) continue;
                
                const jsonPart = line.substring(colonIndex + 1);
                
                try {
                    const parsed = JSON.parse(jsonPart);
                    
                    // The array format is ["$", "$L12", null, {data}]
                    if (Array.isArray(parsed) && parsed.length >= 4) {
                        const data = parsed[3];
                        if (data && data.list && typeof data.totalCount !== 'undefined') {
                            return data;
                        }
                    }
                } catch (parseError) {
                    logger.debug('Failed to parse line as JSON', { line: line.substring(0, 100) });
                }
            }
        }
        
        return null;
    } catch (error) {
        logger.error('Error parsing RSC response', { error: error.message });
        return null;
    }
}

/**
 * Extracts market data from HTML script tags (fallback method)
 * @param {string} html - HTML response
 * @returns {Object|null} Parsed data or null
 */
function parseHTMLResponse(html) {
    try {
        // Look for JSON data embedded in script tags or in the page content
        // Pattern: "list":[...items...],"totalCount":N
        const listMatch = html.match(/"list":\s*\[([\s\S]*?)\],"totalCount":\s*(\d+)/);
        
        if (listMatch) {
            try {
                const listJson = `[${listMatch[1]}]`;
                const list = JSON.parse(listJson);
                const totalCount = parseInt(listMatch[2], 10);
                
                return { list, totalCount };
            } catch (e) {
                logger.debug('Failed to parse list from HTML match', { error: e.message });
            }
        }
        
        // Try to find the full data object
        const dataMatch = html.match(/\{"queryParams":\s*\{[^}]+\},"list":\s*\[[\s\S]*?\],"totalCount":\s*\d+\}/);
        if (dataMatch) {
            try {
                return JSON.parse(dataMatch[0]);
            } catch (e) {
                logger.debug('Failed to parse full data from HTML', { error: e.message });
            }
        }
        
        return null;
    } catch (error) {
        logger.error('Error parsing HTML response', { error: error.message });
        return null;
    }
}

/**
 * Searches for items in the market/trading system
 * @param {string} searchWord - Item name to search for
 * @param {Object} options - Search options
 * @param {string} [options.storeType='BUY'] - Type of store (BUY or SELL)
 * @param {string} [options.server='FREYA'] - Server to search (FREYA or THOR)
 * @returns {Promise<Object>} Search results with list and totalCount
 * @throws {APIError} If request fails
 */
async function searchMarket(searchWord, options = {}) {
    if (!searchWord) {
        throw new Error('Termo de busca é obrigatório');
    }

    const storeType = options.storeType || STORE_TYPES.BUY;
    const server = options.server || SERVERS.FREYA;

    const url = `${ENDPOINTS.MARKET_SEARCH}`;
    const params = {
        storeType: storeType,
        serverType: server,
        searchWord: searchWord
    };

    // Setup session cookies first
    const cookies = await setupSessionCookies();

    // Try multiple request strategies
    const strategies = [
        // Strategy 1: RSC request with cookies (Next.js streaming)
        {
            name: 'RSC',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/x-component',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://ro.gnjoylatam.com/pt/intro/shop-search/trading',
                'RSC': '1',
                'Next-Router-State-Tree': '%5B%22%22%2C%7B%22children%22%3A%5B%5B%22locale%22%2C%22pt%22%2C%22d%22%5D%2C%7B%22children%22%3A%5B%22(primary)%22%2C%7B%22children%22%3A%5B%22intro%22%2C%7B%22children%22%3A%5B%22shop-search%22%2C%7B%22children%22%3A%5B%5B%22id%22%2C%22trading%22%2C%22d%22%5D%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%5D%7D%5D%7D%5D%7D%5D%7D%5D%7D%5D',
                'Next-URL': '/pt/intro/shop-search/trading',
                ...(cookies && { 'Cookie': cookies })
            },
            parser: parseRSCResponse
        },
        // Strategy 2: Regular HTML request with cookies
        {
            name: 'HTML',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://ro.gnjoylatam.com/pt/intro/shop-search',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                ...(cookies && { 'Cookie': cookies })
            },
            parser: (data) => parseRSCResponse(data) || parseHTMLResponse(data)
        },
        // Strategy 3: Minimal headers (fallback)
        {
            name: 'Minimal',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*'
            },
            parser: (data) => parseRSCResponse(data) || parseHTMLResponse(data)
        }
    ];

    let lastError = null;

    for (const strategy of strategies) {
        try {
            logger.debug('Searching market', { searchWord, storeType, server, strategy: strategy.name });
            
            const response = await axios.get(url, {
                params,
                headers: strategy.headers,
                timeout: 15000,
                validateStatus: (status) => status < 500 // Accept anything below 500
            });

            if (!response.data) {
                logger.warn('Empty response from market API', { strategy: strategy.name });
                continue;
            }

            // Log response info for debugging
            logger.debug('Market response received', {
                strategy: strategy.name,
                status: response.status,
                contentType: response.headers['content-type'],
                dataLength: typeof response.data === 'string' ? response.data.length : JSON.stringify(response.data).length
            });

            // Parse the response
            const data = strategy.parser(typeof response.data === 'string' ? response.data : JSON.stringify(response.data));
            
            if (data && data.list) {
                logger.debug('Market search completed', {
                    searchWord,
                    storeType,
                    server,
                    strategy: strategy.name,
                    totalCount: data.totalCount,
                    listLength: data.list?.length || 0
                });

                // Record price history
                if (data.list.length > 0) {
                    try {
                        priceHistoryStorage.recordMarketResults(data.list, server, storeType);
                    } catch (historyError) {
                        logger.warn('Failed to record price history', { error: historyError.message });
                    }
                }

                return {
                    list: data.list || [],
                    totalCount: data.totalCount || 0,
                    queryParams: data.queryParams || { storeType, serverType: server, searchWord }
                };
            }

            logger.warn('Could not parse market response', { 
                searchWord,
                strategy: strategy.name,
                responseLength: response.data?.length || 0 
            });
        } catch (error) {
            lastError = error;
            
            // Log detailed error info for debugging
            const errorDetails = {
                strategy: strategy.name,
                error: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                responseData: error.response?.data ? 
                    (typeof error.response.data === 'string' ? 
                        error.response.data.substring(0, 500) : 
                        JSON.stringify(error.response.data).substring(0, 500)) : 
                    null
            };
            
            logger.warn('Strategy failed', errorDetails);
            
            // If we got a 500, wait a bit before trying the next strategy
            if (error.response?.status === 500) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    // All strategies failed
    logger.error('All market search strategies failed', { 
        searchWord, 
        storeType, 
        server,
        lastError: lastError?.message 
    });

    if (lastError?.response?.status === 404) {
        throw new APIError('Serviço não disponível', 404, 'O serviço de mercado está temporariamente indisponível.');
    }

    throw new APIError(
        `Erro ao buscar no mercado: ${lastError?.message || 'Todas as estratégias falharam'}`,
        lastError?.response?.status || 500,
        'Erro ao conectar com o serviço de mercado. O serviço pode estar temporariamente indisponível.'
    );
}

/**
 * Formats a price value to a readable string with thousands separators
 * @param {number} price - Price value
 * @returns {string} Formatted price string
 */
function formatPrice(price) {
    if (typeof price !== 'number') return String(price);
    return price.toLocaleString('pt-BR');
}

/**
 * Gets the store type label in Portuguese
 * @param {string} storeType - Store type (BUY or SELL)
 * @returns {string} Portuguese label
 */
function getStoreTypeLabel(storeType) {
    return storeType === STORE_TYPES.BUY ? 'Comprando' : 'Vendendo';
}

/**
 * Fetches price history for an item from GNJoy API
 * @param {number} itemId - Item ID
 * @param {string} server - Server name (FREYA, NIDHOGG, YGGDRASIL)
 * @param {string} period - Period (ALL, WEEK, MONTH)
 * @param {string} searchWord - Search term used to find the item
 * @returns {Promise<Object>} Price history data
 */
async function getPriceHistory(itemId, server = 'FREYA', period = 'ALL', searchWord = '') {
    const svrId = SERVER_IDS[server] || 3;
    
    logger.info('Fetching price history from GNJoy', { itemId, server, svrId, period, searchWord });
    
    const url = `${ENDPOINTS.MARKET_PRICE}?serverType=${server}&period=${period}&searchWord=${encodeURIComponent(searchWord)}`;
    
    // POST body as JSON array (original format from user)
    const payload = [{
        type: 'price',
        params: {
            itemId: parseInt(itemId, 10),
            svrId: svrId,
            page: 1,
            limit: 100,
            period: '$undefined'
        }
    }];
    
    try {
        const response = await axios.post(url, JSON.stringify(payload), {
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'Accept': 'text/x-component',
                'Next-Action': '4001690b22958ed4f4bf2bb55797244baa7ebb95e5',
                'Next-Router-State-Tree': '%5B%22%22%2C%7B%22children%22%3A%5B%5B%22locale%22%2C%22pt%22%2C%22d%22%5D%2C%7B%22children%22%3A%5B%22(primary)%22%2C%7B%22children%22%3A%5B%22intro%22%2C%7B%22children%22%3A%5B%22shop-search%22%2C%7B%22children%22%3A%5B%5B%22id%22%2C%22market-price%22%2C%22d%22%5D%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%5D%7D%5D%7D%5D%7D%5D%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
                'Origin': 'https://ro.gnjoylatam.com',
                'Referer': url
            },
            timeout: 15000
        });
        
        // Parse RSC response
        // Format: 0:{"a":"$@1",...}\n1:{"data":{...},"success":true}
        const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        
        logger.debug('Price history response', { 
            length: text.length,
            sample: text.substring(0, 200)
        });
        
        // Split by newline and find line starting with "1:"
        const lines = text.split('\n');
        
        for (const line of lines) {
            // Look for the data line (usually "1:{...}")
            if (line.startsWith('1:') && line.includes('"data"') && line.includes('"success"')) {
                try {
                    const jsonPart = line.substring(2); // Remove "1:"
                    const parsed = JSON.parse(jsonPart);
                    
                    if (parsed && parsed.data && parsed.success) {
                        logger.info('Price history fetched successfully', { 
                            itemId,
                            server,
                            dataPoints: parsed.data.priceDetailChartList?.length || 0,
                            minPrice: parsed.data.itemPriceMin,
                            maxPrice: parsed.data.itemPriceMax
                        });
                        return parsed.data;
                    }
                } catch (e) {
                    logger.debug('Failed to parse line 1', { error: e.message });
                }
            }
        }
        
        // Fallback: try to find JSON anywhere in text
        const jsonMatch = text.match(/\{"data":\{[^}]*"itemPriceMin"[\s\S]*?"success":true\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.data) {
                    logger.info('Price history fetched (fallback)', { 
                        itemId,
                        dataPoints: parsed.data.priceDetailChartList?.length || 0
                    });
                    return parsed.data;
                }
            } catch (e) {
                logger.debug('Fallback parse failed', { error: e.message });
            }
        }
        
        logger.warn('Could not parse price history response', { 
            itemId, 
            server, 
            responseLength: text.length,
            hasData: text.includes('"data"'),
            hasSuccess: text.includes('"success"')
        });
        return null;
        
    } catch (error) {
        logger.error('Error fetching price history', { 
            itemId, 
            server, 
            error: error.message 
        });
        return null;
    }
}

/**
 * Searches market and gets price history for an item
 * Returns both current listings and historical data
 * @param {string} searchTerm - Item name to search
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Combined market and history data
 */
async function getMarketWithHistory(searchTerm, options = {}) {
    const { server = 'FREYA', storeType = 'BUY' } = options;
    
    // First, search the market to find items
    const marketResult = await searchMarket(searchTerm, { server, storeType });
    
    if (!marketResult || !marketResult.list || marketResult.list.length === 0) {
        return { market: null, history: null };
    }
    
    // Get the first matching item's ID
    const firstItem = marketResult.list[0];
    const itemId = firstItem.itemId;
    
    // Fetch price history for this item
    const history = await getPriceHistory(itemId, server, 'ALL');
    
    return {
        market: marketResult,
        history: history,
        itemId: itemId,
        itemName: firstItem.itemName
    };
}

// ==================== CACHED WRAPPERS ====================

/**
 * Cached version of searchMarket
 * Cache TTL: 5 minutes (market prices change frequently)
 */
async function searchMarketCached(searchWord, options = {}) {
    const storeType = options.storeType || STORE_TYPES.BUY;
    const server = options.server || SERVERS.FREYA;
    
    return apiCache.getOrFetch('MARKET_SEARCH', { searchWord, storeType, server }, 
        () => searchMarket(searchWord, options)
    );
}

/**
 * Cached version of getPriceHistory
 * Cache TTL: 15 minutes (history changes less frequently)
 */
async function getPriceHistoryCached(itemId, server = 'FREYA', period = 'ALL', searchWord = '') {
    return apiCache.getOrFetch('PRICE_HISTORY', { itemId, server, period }, 
        () => getPriceHistory(itemId, server, period, searchWord)
    );
}

/**
 * Cached version of getMarketWithHistory
 */
async function getMarketWithHistoryCached(searchTerm, options = {}) {
    const { server = 'FREYA', storeType = 'BUY' } = options;
    
    return apiCache.getOrFetch('MARKET_SEARCH', { searchTerm, server, storeType, withHistory: true }, 
        () => getMarketWithHistory(searchTerm, options)
    );
}

module.exports = {
    // Original functions
    searchMarket,
    getPriceHistory,
    getMarketWithHistory,
    formatPrice,
    getStoreTypeLabel,
    SERVERS,
    STORE_TYPES,
    SERVER_IDS,
    ENDPOINTS,
    
    // Cached versions
    cached: {
        searchMarket: searchMarketCached,
        getPriceHistory: getPriceHistoryCached,
        getMarketWithHistory: getMarketWithHistoryCached
    }
};
