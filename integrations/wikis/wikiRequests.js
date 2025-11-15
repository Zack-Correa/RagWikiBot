/**
 * Wiki API Integration
 * Handles requests to Browiki
 */

const axios = require('axios');
const settings = require('../const.json');
const logger = require('../../utils/logger');
const { APIError } = require('../../utils/errors');

// Wiki endpoints configuration
const WIKI_CONFIG = {
    wiki: {
        url: settings.endpoints[0].url,
        action: 'query', // Use full Action API instead of opensearch
        list: 'search',
        format: 'json'
    }
};

/**
 * Validates wiki type
 * @param {string} wikiType - Type of wiki (only 'wiki' is supported)
 * @returns {string} Validated wiki type (defaults to 'wiki')
 * @private
 */
function validateWikiType(wikiType) {
    const validTypes = Object.keys(WIKI_CONFIG);
    if (!validTypes.includes(wikiType)) {
        logger.warn(`Invalid wiki type: ${wikiType}, defaulting to 'wiki'`);
        return 'wiki';
    }
    return wikiType;
}

/**
 * Makes a request to the Browiki
 * @param {string} keyword - Search keyword
 * @param {string} wikiType - Type of wiki (only 'wiki' is supported, defaults to 'wiki')
 * @returns {Promise<Array>} Search results wrapped in array
 * @throws {APIError} If request fails
 */
async function makeRequest(keyword, wikiType = 'wiki') {
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
        throw new Error('Termo de busca é obrigatório');
    }

    const validatedWikiType = validateWikiType(wikiType);
    const config = WIKI_CONFIG[validatedWikiType];

    const requestConfig = {
        method: 'GET',
        url: config.url,
        params: {
            action: config.action,
            list: config.list,
            srsearch: keyword.trim(),
            srlimit: 10, // Limit to 10 results
            srnamespace: 0, // Main namespace only
            format: config.format,
            formatversion: 2 // Use formatversion 2 for cleaner JSON
        },
        timeout: 10000 // 10 second timeout
    };

    try {
        logger.debug('Searching wiki with Action API', { keyword, wikiType: validatedWikiType });
        const response = await axios(requestConfig);

        if (!response.data) {
            throw new APIError('Resposta vazia da API', 200, 'Nenhum resultado encontrado.');
        }

        // Return the full response object for better parsing
        return response.data;
    } catch (error) {
        logger.error('Error searching wiki', { 
            keyword, 
            wikiType: validatedWikiType, 
            error: error.message 
        });

        if (error.response) {
            throw new APIError(
                `Erro na API: ${error.response.status}`,
                error.response.status,
                'Erro ao buscar na wiki.'
            );
        }

        if (error instanceof APIError) {
            throw error;
        }

        throw new APIError(
            `Erro ao buscar na wiki: ${error.message}`,
            null,
            'Erro ao conectar com a wiki.'
        );
    }
}

module.exports = {
    makeRequest
};
