/**
 * Divine Pride API Integration
 * Handles all interactions with the Divine Pride database API
 */

const axios = require('axios');
const settings = require('../const.json');
const config = require('../../config');
const logger = require('../../utils/logger');
const { APIError } = require('../../utils/errors');

// API endpoints
const ENDPOINTS = {
    ITEM: settings.endpoints[1].url,
    SEARCH: settings.endpoints[2].url,
    MONSTER: settings.endpoints[4].url,
    MAP: settings.endpoints[5].url,
    SKILL: settings.endpoints[6].url,
    SET_SERVER: 'https://www.divine-pride.net/Api/Regions/SetServer',
    REFRESH_LANGUAGE: 'https://www.divine-pride.net/Api/Regions/RefreshLanguage/'
};

// Cookie cache for web scraping
// Format: { 'language-server': { cookies: 'cookie_string', timestamp: Date } }
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
    
    // Extract only the cookie name=value pairs, ignoring attributes
    return cookies.map(cookie => {
        const cookieParts = cookie.split(';')[0]; // Get only name=value part
        return cookieParts.trim();
    }).join('; ');
}

/**
 * Sets up Divine Pride server and language cookies for web scraping
 * @param {string} language - Language code (pt, en, es)
 * @param {string} server - Server to use (LATAM or BRO) - defaults to LATAM
 * @returns {Promise<string>} Cookie string to use in requests
 */
async function setupScrapingCookies(language, server = 'LATAM') {
    const cacheKey = `${language}-${server.toLowerCase()}`;
    
    // Check if we have valid cached cookies
    const cached = cookieCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < COOKIE_CACHE_TTL) {
        logger.debug('Using cached cookies', { language, server, cacheKey });
        return cached.cookies;
    }
    
    try {
        // Step 1: Set server
        logger.debug('Setting Divine Pride server', { language, server });
        const serverResponse = await axios.post(
            ENDPOINTS.SET_SERVER,
            { server: server },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        
        let cookies = extractCookies(serverResponse);
        
        // Step 2: Refresh language
        logger.debug('Refreshing Divine Pride language', { language, server });
        const languageConfig = config.languages[language.toLowerCase()];
        if (!languageConfig) {
            logger.warn('Invalid language, using default pt', { language });
        }
        
        const languageResponse = await axios.post(
            ENDPOINTS.REFRESH_LANGUAGE,
            { language: language.toLowerCase() },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookies
                },
                timeout: 10000
            }
        );
        
        // Merge cookies from both requests
        const languageCookies = extractCookies(languageResponse);
        if (languageCookies) {
            cookies = cookies ? `${cookies}; ${languageCookies}` : languageCookies;
        }
        
        // Ensure the 'lang' cookie is set (some responses don't include it)
        const langCookie = `lang=${language.toLowerCase()}`;
        if (!cookies || !cookies.includes('lang=')) {
            cookies = cookies ? `${cookies}; ${langCookie}` : langCookie;
        }
        
        // Cache the cookies
        cookieCache.set(cacheKey, {
            cookies: cookies,
            timestamp: Date.now()
        });
        
        logger.debug('Divine Pride cookies configured', { 
            language,
            server,
            cacheKey,
            hasCookies: !!cookies 
        });
        
        return cookies;
    } catch (error) {
        logger.error('Error setting up Divine Pride cookies', { 
            language,
            server,
            error: error.message 
        });
        
        // Return empty string on error, allowing scraping to proceed without cookies
        return '';
    }
}

/**
 * Makes a request to get item information by ID
 * @param {string} itemId - Item ID
 * @param {string} language - Language code (pt, en, es)
 * @returns {Promise<Object>} Item data from API
 * @throws {APIError} If request fails
 */
async function makeItemIdRequest(itemId, language) {
    if (!itemId || !language) {
        throw new Error('Item ID e idioma são obrigatórios');
    }

    const apiKey = config.api.divinePride.apiKey;
    if (!apiKey) {
        logger.warn('Divine Pride API key not configured');
    }

    // Always use LATAM server
    const server = 'LATAM';
    const endpoint = `${ENDPOINTS.ITEM}${itemId}?apiKey=${apiKey}&server=${server}`;
    const languageConfig = config.languages[language.toLowerCase()];
    const acceptLanguage = languageConfig?.acceptLanguage;

    try {
        logger.debug('Fetching item by ID', { itemId, language, server, acceptLanguage });
        
        const headers = {};
        if (acceptLanguage) {
            headers['Accept-Language'] = acceptLanguage;
        }
        
        const response = await axios.get(endpoint, { headers, timeout: 10000 });
        return response.data;
    } catch (error) {
        logger.error('Error fetching item by ID', { itemId, language, error: error.message });
        
        if (error.response?.status === 404) {
            throw new APIError('Item não encontrado', 404, 'Item não encontrado no banco de dados.');
        }
        
        throw new APIError(
            `Erro ao buscar item: ${error.message}`,
            error.response?.status,
            'Erro ao obter informações do item.'
        );
    }
}

/**
 * Makes a search query for items by name
 * @param {string} queryString - Search term
 * @param {string} language - Language code (pt, en, es)
 * @returns {Promise<Array>} Parsed HTML results
 * @throws {APIError} If request fails
 */
async function makeSearchQuery(queryString, language) {
    if (!queryString || !language) {
        throw new Error('Termo de busca e idioma são obrigatórios');
    }

    const parser = require('../../utils/parser');
    
    // Try LATAM first, then BRO as fallback (especially for Portuguese)
    const servers = language === 'pt' ? ['LATAM', 'BRO'] : ['LATAM'];
    
    for (const server of servers) {
        try {
            // Setup cookies for the correct server and language
            const cookies = await setupScrapingCookies(language, server);
            
            const queryEndpoint = `${ENDPOINTS.SEARCH}${encodeURIComponent(queryString)}`;
            
            const requestConfig = {
                method: 'GET',
                url: queryEndpoint,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://www.divine-pride.net/database',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'same-origin',
                    'Cache-Control': 'max-age=0'
                },
                timeout: 10000
            };

            if (cookies) {
                requestConfig.headers['Cookie'] = cookies;
            }

            logger.debug('Searching items', { queryString, language, server, hasCookies: !!cookies });
            const response = await axios(requestConfig);
            
            if (!response.data) {
                logger.warn('Empty response from server', { server });
                continue; // Try next server
            }

            const parsedBody = parser.parseHTMLByRegex(response.data, 'item');
            
            if (!parsedBody || parsedBody.length === 0) {
                logger.warn('No item results from HTML parsing', { 
                    queryString, 
                    language,
                    server,
                    responseLength: response.data?.length || 0
                });
                // Try next server if available
                if (server !== servers[servers.length - 1]) {
                    logger.info('Trying fallback server', { nextServer: servers[servers.indexOf(server) + 1] });
                    continue;
                }
                throw new APIError('Nenhum resultado encontrado', 200, 'Nenhum item encontrado para sua busca.');
            }

            logger.debug('Item HTML parsed successfully', {
                queryString,
                language,
                server,
                parsedBodyLength: parsedBody.length
            });

            return parsedBody;
        } catch (error) {
            // If this is the last server, throw the error
            if (server === servers[servers.length - 1]) {
                logger.error('Error searching items (all servers tried)', { queryString, language, servers, error: error.message });
                
                if (error.response) {
                    throw new APIError(
                        `Erro na API: ${error.response.status}`,
                        error.response.status,
                        'Erro ao buscar itens na base de dados.'
                    );
                }
                
                if (error instanceof APIError) {
                    throw error;
                }
                
                throw new APIError(
                    `Erro ao buscar itens: ${error.message}`,
                    null,
                    'Erro ao conectar com a base de dados.'
                );
            }
            
            // Log and try next server
            logger.warn('Error with server, trying fallback', { 
                server, 
                error: error.message,
                nextServer: servers[servers.indexOf(server) + 1]
            });
        }
    }
}

/**
 * Searches for monster information by ID
 * @param {string} monsterId - Monster ID
 * @returns {Promise<Object>} Monster data from API
 * @throws {APIError} If request fails
 */
async function monsterSearch(monsterId, server = null) {
    if (!monsterId) {
        throw new Error('ID do monstro é obrigatório');
    }

    const apiKey = config.api.divinePride.apiKey;
    if (!apiKey) {
        logger.warn('Divine Pride API key not configured');
    }

    const endpoint = `${ENDPOINTS.MONSTER}${monsterId}?apiKey=${apiKey}`;
    
    // Get language preference based on server or default
    let acceptLanguage = 'pt-BR'; // Default to Portuguese
    if (server) {
        const languageConfig = config.languages[server.toLowerCase()];
        if (languageConfig?.acceptLanguage) {
            acceptLanguage = languageConfig.acceptLanguage;
        }
    } else {
        // Use environment variable or default
        acceptLanguage = process.env.API_LANGUAGE || acceptLanguage;
    }

    try {
        logger.debug('Fetching monster by ID', { monsterId, endpoint, acceptLanguage });
        const response = await axios.get(endpoint, { 
            headers: {
                'Accept-Language': acceptLanguage
            },
            timeout: 10000 
        });
        
        if (!response.data) {
            throw new APIError('Resposta vazia da API', 200, 'Nenhum dado retornado para o monstro.');
        }

        logger.debug('Monster data received', { 
            monsterId, 
            dataLength: JSON.stringify(response.data).length,
            hasName: !!response.data.name,
            hasGlobalization: !!response.data.globalization,
            responseKeys: Object.keys(response.data || {})
        });
        
        return response.data;
    } catch (error) {
        logger.error('Error fetching monster', { monsterId, error: error.message });
        
        if (error.response?.status === 404) {
            throw new APIError('Monstro não encontrado', 404, 'Monstro não encontrado no banco de dados.');
        }
        
        throw new APIError(
            `Erro ao buscar monstro: ${error.message}`,
            error.response?.status,
            'Erro ao obter informações do monstro.'
        );
    }
}

/**
 * Searches for map information by ID
 * @param {string} mapId - Map ID
 * @returns {Promise<Object>} Map data from API
 * @throws {APIError} If request fails
 */
async function mapSearch(mapId, server = null) {
    if (!mapId) {
        throw new Error('ID do mapa é obrigatório');
    }

    const apiKey = config.api.divinePride.apiKey;
    const endpoint = `${ENDPOINTS.MAP}${mapId}?apiKey=${apiKey}`;
    
    // Get language preference based on server or default
    let acceptLanguage = 'pt-BR'; // Default to Portuguese
    if (server) {
        const languageConfig = config.languages[server.toLowerCase()];
        if (languageConfig?.acceptLanguage) {
            acceptLanguage = languageConfig.acceptLanguage;
        }
    } else {
        // Use environment variable or default
        acceptLanguage = process.env.API_LANGUAGE || acceptLanguage;
    }

    try {
        logger.debug('Fetching map by ID', { mapId, endpoint, acceptLanguage });
        const response = await axios.get(endpoint, { 
            headers: {
                'Accept-Language': acceptLanguage
            },
            timeout: 10000 
        });
        
        if (!response.data) {
            throw new APIError('Resposta vazia da API', 200, 'Nenhum dado retornado para o mapa.');
        }

        logger.debug('Map data received', { 
            mapId,
            hasName: !!response.data.name,
            hasMapname: !!response.data.mapname,
            hasSpawn: !!response.data.spawn,
            spawnLength: response.data.spawn?.length || 0,
            npcsLength: response.data.npcs?.length || 0
        });
        
        return response.data;
    } catch (error) {
        logger.error('Error fetching map', { mapId, error: error.message });
        throw new APIError(
            `Erro ao buscar mapa: ${error.message}`,
            error.response?.status,
            'Erro ao obter informações do mapa.'
        );
    }
}

/**
 * Searches for skill information by ID
 * @param {string} skillId - Skill ID
 * @param {string} server - Server identifier (optional)
 * @returns {Promise<Object>} Skill data from API
 * @throws {APIError} If request fails
 */
async function skillSearch(skillId, server = null) {
    if (!skillId) {
        throw new Error('ID da skill é obrigatório');
    }

    const apiKey = config.api.divinePride.apiKey;
    const endpoint = `${ENDPOINTS.SKILL}${skillId}?apiKey=${apiKey}`;
    
    // Get language preference based on server or default
    let acceptLanguage = 'pt-BR'; // Default to Portuguese
    if (server) {
        const languageConfig = config.languages[server.toLowerCase()];
        if (languageConfig?.acceptLanguage) {
            acceptLanguage = languageConfig.acceptLanguage;
        }
    } else {
        // Use environment variable or default
        acceptLanguage = process.env.API_LANGUAGE || acceptLanguage;
    }

    try {
        logger.debug('Fetching skill by ID', { skillId, acceptLanguage });
        const response = await axios.get(endpoint, { 
            headers: {
                'Accept-Language': acceptLanguage
            },
            timeout: 10000 
        });
        
        // TODO: Implement proper parsing when feature is complete
        logger.debug('Skill data received', { skillId });
        return response.data;
    } catch (error) {
        logger.error('Error fetching skill', { skillId, error: error.message });
        throw new APIError(
            `Erro ao buscar skill: ${error.message}`,
            error.response?.status,
            'Erro ao obter informações da skill.'
        );
    }
}

/**
 * Makes a search query for monsters by name
 * @param {string} queryString - Search term
 * @param {string} language - Language code (pt, en, es)
 * @returns {Promise<Array>} Parsed HTML results
 * @throws {APIError} If request fails
 */
async function makeMonsterSearchQuery(queryString, language) {
    if (!queryString || !language) {
        throw new Error('Termo de busca e idioma são obrigatórios');
    }

    const parser = require('../../utils/parser');
    
    // Try LATAM first, then BRO as fallback (especially for Portuguese)
    const servers = language === 'pt' ? ['LATAM', 'BRO'] : ['LATAM'];
    
    for (const server of servers) {
        try {
            // Setup cookies for the correct server and language
            const cookies = await setupScrapingCookies(language, server);
            
            const queryEndpoint = `${ENDPOINTS.SEARCH}${encodeURIComponent(queryString)}`;
            
            const requestConfig = {
                method: 'GET',
                url: queryEndpoint,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://www.divine-pride.net/database',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'same-origin',
                    'Cache-Control': 'max-age=0'
                },
                timeout: 10000
            };

            if (cookies) {
                requestConfig.headers['Cookie'] = cookies;
            }

            logger.debug('Searching monsters', { queryString, language, server, hasCookies: !!cookies });
            const response = await axios(requestConfig);
            
            if (!response.data) {
                logger.warn('Empty response from server', { server });
                continue; // Try next server
            }

            const parsedBody = parser.parseHTMLByRegex(response.data, 'monster');
            
            if (!parsedBody || parsedBody.length === 0) {
                logger.warn('No monster results from HTML parsing', { 
                    queryString, 
                    language,
                    server,
                    responseLength: response.data?.length || 0
                });
                // Try next server if available
                if (server !== servers[servers.length - 1]) {
                    logger.info('Trying fallback server', { nextServer: servers[servers.indexOf(server) + 1] });
                    continue;
                }
                throw new APIError('Nenhum resultado encontrado', 200, 'Nenhum monstro encontrado para sua busca.');
            }

            logger.debug('Monster HTML parsed successfully', {
                queryString,
                language,
                server,
                parsedBodyLength: parsedBody.length
            });

            return parsedBody;
        } catch (error) {
            // If this is the last server, throw the error
            if (server === servers[servers.length - 1]) {
                logger.error('Error searching monsters (all servers tried)', { 
                    queryString, 
                    language,
                    servers,
                    error: error.message 
                });
                
                if (error.response) {
                    throw new APIError(
                        `Erro na API: ${error.response.status}`,
                        error.response.status,
                        'Erro ao buscar monstros na base de dados.'
                    );
                }
                
                if (error instanceof APIError) {
                    throw error;
                }
                
                throw new APIError(
                    `Erro ao buscar monstros: ${error.message}`,
                    500,
                    'Erro ao buscar monstros na base de dados.'
                );
            }
            
            // Log and try next server
            logger.warn('Error with server, trying fallback', { 
                server, 
                error: error.message,
                nextServer: servers[servers.indexOf(server) + 1]
            });
        }
    }
}

/**
 * Makes a search query for maps by name
 * @param {string} queryString - Search term
 * @param {string} language - Language code (pt, en, es)
 * @returns {Promise<Array>} Parsed HTML results
 * @throws {APIError} If request fails
 */
async function makeMapSearchQuery(queryString, language) {
    if (!queryString || !language) {
        throw new Error('Termo de busca e idioma são obrigatórios');
    }

    try {
        // Setup cookies for the correct server and language
        const cookies = await setupScrapingCookies(language);
        
        const queryEndpoint = `${ENDPOINTS.SEARCH}${encodeURIComponent(queryString)}`;
        
        const requestConfig = {
            method: 'GET',
            url: queryEndpoint,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.divine-pride.net/database',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Cache-Control': 'max-age=0'
            },
            timeout: 10000
        };

        if (cookies) {
            requestConfig.headers['Cookie'] = cookies;
        }

        logger.debug('Searching maps', { queryString, language, hasCookies: !!cookies });
        const response = await axios(requestConfig);
        
        if (!response.data) {
            throw new APIError('Resposta vazia da API', 200, 'Nenhum resultado encontrado.');
        }

        // Log a sample of the HTML to debug regex patterns
        if (response.data && typeof response.data === 'string') {
            // Look for any links that might be maps
            const allLinks = response.data.match(/<a[^>]*href=[^>]*>/gi);
            if (allLinks) {
                // Filter for map-related links
                const mapLinks = allLinks.filter(link => 
                    link.toLowerCase().includes('map') || 
                    link.includes('/database/map/')
                );
                
                if (mapLinks.length > 0) {
                    logger.debug('Map links found in HTML', { 
                        totalLinks: allLinks.length,
                        mapLinksCount: mapLinks.length,
                        samples: mapLinks.slice(0, 5).map(link => link.substring(0, 200))
                    });
                } else {
                    logger.debug('No map links found in HTML', {
                        totalLinks: allLinks.length,
                        sampleLinks: allLinks.slice(0, 3).map(link => link.substring(0, 100))
                    });
                }
            }
        }

        const parser = require('../../utils/parser');
        const parsedBody = parser.parseHTMLByRegex(response.data, 'map');
        
        if (!parsedBody) {
            logger.warn('No map results from HTML parsing', { 
                queryString, 
                language,
                responseLength: response.data?.length || 0
            });
            throw new APIError('Nenhum resultado encontrado', 200, 'Nenhum mapa encontrado para sua busca.');
        }

        logger.debug('Map HTML parsed successfully', {
            queryString,
            language,
            parsedBodyLength: parsedBody.length
        });

        return parsedBody;
    } catch (error) {
        logger.error('Error searching maps', { queryString, language, error: error.message });
        
        if (error.response) {
            throw new APIError(
                `Erro na API: ${error.response.status}`,
                error.response.status,
                'Erro ao buscar mapas na base de dados.'
            );
        }
        
        if (error instanceof APIError) {
            throw error;
        }
        
        throw new APIError(
            `Erro ao buscar mapas: ${error.message}`,
            500,
            'Erro ao buscar mapas na base de dados.'
        );
    }
}

module.exports = {
    makeItemIdRequest,
    makeSearchQuery,
    makeMonsterSearchQuery,
    makeMapSearchQuery,
    monsterSearch,
    mapSearch,
    skillSearch
};
