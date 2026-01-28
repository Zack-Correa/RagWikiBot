/**
 * GNJoy LATAM API Integration
 * Handles interactions with the Ragnarok Online LATAM market/trading API
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const { APIError } = require('../../utils/errors');

// API endpoints
const ENDPOINTS = {
    MARKET_SEARCH: 'https://ro.gnjoylatam.com/pt/intro/shop-search/trading',
    BASE_PAGE: 'https://ro.gnjoylatam.com/pt/intro/shop-search/trading'
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

module.exports = {
    searchMarket,
    formatPrice,
    getStoreTypeLabel,
    SERVERS,
    STORE_TYPES,
    ENDPOINTS
};
