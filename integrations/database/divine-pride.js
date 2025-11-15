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
    SKILL: settings.endpoints[6].url
};

/**
 * Validates server parameter
 * @param {string} server - Server identifier
 * @returns {string|null} Language cookie value or null
 * @throws {ValidationError} If server is invalid
 */
function getServerLanguage(server) {
    const serverConfig = config.servers[server.toLowerCase()];
    if (!serverConfig) {
        throw new Error(`Servidor inválido: ${server}. Servidores disponíveis: ${Object.keys(config.servers).join(', ')}`);
    }
    return serverConfig.lang;
}

/**
 * Makes a request to get item information by ID
 * @param {string} itemId - Item ID
 * @param {string} server - Server identifier (iro, kro, bro, jro)
 * @returns {Promise<Object>} Item data from API
 * @throws {APIError} If request fails
 */
async function makeItemIdRequest(itemId, server) {
    if (!itemId || !server) {
        throw new Error('Item ID e servidor são obrigatórios');
    }

    const apiKey = config.api.divinePride.apiKey;
    if (!apiKey) {
        logger.warn('Divine Pride API key not configured');
    }

    const endpoint = `${ENDPOINTS.ITEM}${itemId}?apiKey=${apiKey}&server=${server}`;
    const serverConfig = config.servers[server.toLowerCase()];
    const acceptLanguage = serverConfig?.acceptLanguage;

    try {
        logger.debug('Fetching item by ID', { itemId, server, acceptLanguage });
        
        const headers = {};
        if (acceptLanguage) {
            headers['Accept-Language'] = acceptLanguage;
        }
        
        const response = await axios.get(endpoint, { headers, timeout: 10000 });
        return response.data;
    } catch (error) {
        logger.error('Error fetching item by ID', { itemId, server, error: error.message });
        
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
 * @param {string} server - Server identifier
 * @returns {Promise<Array>} Parsed HTML results
 * @throws {APIError} If request fails
 */
async function makeSearchQuery(queryString, server) {
    if (!queryString || !server) {
        throw new Error('Termo de busca e servidor são obrigatórios');
    }

    const langCookie = getServerLanguage(server);
    const queryEndpoint = `${ENDPOINTS.SEARCH}${encodeURIComponent(queryString)}`;
    
    const requestConfig = {
        method: 'GET',
        url: queryEndpoint,
        headers: {},
        timeout: 10000 // 10 second timeout
    };

    if (langCookie) {
        requestConfig.headers['Cookie'] = langCookie;
    }

    try {
        logger.debug('Searching items', { queryString, server });
        const response = await axios(requestConfig);
        
        if (!response.data) {
            throw new APIError('Resposta vazia da API', 200, 'Nenhum resultado encontrado.');
        }

        const parser = require('../../utils/parser');
        const parsedBody = parser.parseHTMLByRegex(response.data);
        
        if (!parsedBody) {
            logger.warn('No results from HTML parsing', { 
                queryString, 
                server,
                responseLength: response.data?.length || 0,
                responsePreview: typeof response.data === 'string' ? response.data.substring(0, 500) : 'Not a string'
            });
            throw new APIError('Nenhum resultado encontrado', 200, 'Nenhum resultado encontrado para sua busca.');
        }

        logger.debug('HTML parsed successfully', {
            queryString,
            parsedBodyLength: parsedBody.length
        });

        return parsedBody;
    } catch (error) {
        logger.error('Error searching items', { queryString, server, error: error.message });
        
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
        const serverConfig = config.servers[server.toLowerCase()];
        if (serverConfig?.acceptLanguage) {
            acceptLanguage = serverConfig.acceptLanguage;
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
        const serverConfig = config.servers[server.toLowerCase()];
        if (serverConfig?.acceptLanguage) {
            acceptLanguage = serverConfig.acceptLanguage;
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
        const serverConfig = config.servers[server.toLowerCase()];
        if (serverConfig?.acceptLanguage) {
            acceptLanguage = serverConfig.acceptLanguage;
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

module.exports = {
    makeItemIdRequest,
    makeSearchQuery,
    monsterSearch,
    mapSearch,
    skillSearch
};
