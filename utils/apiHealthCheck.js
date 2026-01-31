/**
 * API Health Check - Monitora status das APIs externas
 * Detecta falhas consecutivas e fornece fallbacks graceful
 */

const logger = require('./logger');

// Status de cada API externa
const apiStatus = {
    divinePride: {
        name: 'Divine Pride',
        healthy: true,
        lastCheck: null,
        lastSuccess: null,
        failCount: 0,
        totalRequests: 0,
        totalFailures: 0,
        avgResponseTime: 0,
        responseTimeSum: 0
    },
    gnjoyMarket: {
        name: 'GNJoy Market',
        healthy: true,
        lastCheck: null,
        lastSuccess: null,
        failCount: 0,
        totalRequests: 0,
        totalFailures: 0,
        avgResponseTime: 0,
        responseTimeSum: 0
    },
    browiki: {
        name: 'Browiki',
        healthy: true,
        lastCheck: null,
        lastSuccess: null,
        failCount: 0,
        totalRequests: 0,
        totalFailures: 0,
        avgResponseTime: 0,
        responseTimeSum: 0
    }
};

// Configuração
const config = {
    failThreshold: 3,           // Número de falhas consecutivas para marcar como degraded
    recoveryThreshold: 2,       // Número de sucessos para marcar como healthy novamente
    healthCheckInterval: 60000, // Intervalo entre health checks automáticos (1 min)
    responseTimeWindow: 100     // Últimas N requisições para calcular média
};

// Mensagens de erro em português
const ERROR_MESSAGES = {
    divinePride: {
        unavailable: 'A busca de itens está temporariamente indisponível. Tente novamente em alguns minutos.',
        degraded: 'O serviço de busca de itens está lento. Os resultados podem demorar mais que o normal.',
        timeout: 'A busca de itens demorou muito para responder. Tente novamente.'
    },
    gnjoyMarket: {
        unavailable: 'O serviço de mercado está temporariamente indisponível. Tente novamente em alguns minutos.',
        degraded: 'O serviço de mercado está lento. Os resultados podem demorar mais que o normal.',
        timeout: 'A busca no mercado demorou muito para responder. Tente novamente.'
    },
    browiki: {
        unavailable: 'A wiki está temporariamente indisponível. Tente novamente em alguns minutos.',
        degraded: 'A wiki está lenta. Os resultados podem demorar mais que o normal.',
        timeout: 'A busca na wiki demorou muito para responder. Tente novamente.'
    }
};

/**
 * Registra uma requisição bem-sucedida
 * @param {string} apiName - Nome da API (divinePride, gnjoyMarket, browiki)
 * @param {number} responseTime - Tempo de resposta em ms
 */
function recordSuccess(apiName, responseTime = 0) {
    const api = apiStatus[apiName];
    if (!api) return;
    
    api.lastCheck = new Date().toISOString();
    api.lastSuccess = new Date().toISOString();
    api.totalRequests++;
    
    // Atualizar tempo de resposta médio
    if (responseTime > 0) {
        api.responseTimeSum += responseTime;
        api.avgResponseTime = Math.round(api.responseTimeSum / api.totalRequests);
    }
    
    // Reduzir contador de falhas consecutivas
    if (api.failCount > 0) {
        api.failCount--;
        
        // Recuperar status se atingir threshold
        if (api.failCount < config.recoveryThreshold && !api.healthy) {
            api.healthy = true;
            logger.info('API recovered', { api: apiName, name: api.name });
        }
    }
}

/**
 * Registra uma falha de requisição
 * @param {string} apiName - Nome da API
 * @param {Error} error - Erro ocorrido
 */
function recordFailure(apiName, error) {
    const api = apiStatus[apiName];
    if (!api) return;
    
    api.lastCheck = new Date().toISOString();
    api.totalRequests++;
    api.totalFailures++;
    api.failCount++;
    
    // Marcar como degraded se atingir threshold
    if (api.failCount >= config.failThreshold && api.healthy) {
        api.healthy = false;
        logger.warn('API marked as degraded', { 
            api: apiName, 
            name: api.name,
            failCount: api.failCount,
            error: error?.message 
        });
    }
}

/**
 * Verifica se uma API está saudável
 * @param {string} apiName - Nome da API
 * @returns {boolean} True se saudável
 */
function isHealthy(apiName) {
    const api = apiStatus[apiName];
    return api ? api.healthy : true;
}

/**
 * Verifica se uma API está em modo degradado
 * @param {string} apiName - Nome da API
 * @returns {boolean} True se degradado
 */
function isDegraded(apiName) {
    const api = apiStatus[apiName];
    return api ? !api.healthy : false;
}

/**
 * Obtém mensagem de erro apropriada
 * @param {string} apiName - Nome da API
 * @param {string} errorType - Tipo de erro (unavailable, degraded, timeout)
 * @returns {string} Mensagem de erro em português
 */
function getErrorMessage(apiName, errorType = 'unavailable') {
    const messages = ERROR_MESSAGES[apiName];
    if (!messages) {
        return 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.';
    }
    return messages[errorType] || messages.unavailable;
}

/**
 * Obtém o status de todas as APIs
 * @returns {Object} Status de todas as APIs
 */
function getAllStatus() {
    const status = {};
    
    for (const [key, api] of Object.entries(apiStatus)) {
        status[key] = {
            name: api.name,
            healthy: api.healthy,
            lastCheck: api.lastCheck,
            lastSuccess: api.lastSuccess,
            failCount: api.failCount,
            totalRequests: api.totalRequests,
            totalFailures: api.totalFailures,
            failureRate: api.totalRequests > 0 
                ? ((api.totalFailures / api.totalRequests) * 100).toFixed(1) + '%'
                : '0%',
            avgResponseTime: api.avgResponseTime + 'ms'
        };
    }
    
    return status;
}

/**
 * Obtém status resumido para health check endpoint
 * @returns {Object} Status resumido
 */
function getHealthSummary() {
    const allHealthy = Object.values(apiStatus).every(api => api.healthy);
    const degradedApis = Object.entries(apiStatus)
        .filter(([_, api]) => !api.healthy)
        .map(([key, api]) => api.name);
    
    return {
        status: allHealthy ? 'healthy' : 'degraded',
        allHealthy,
        degradedApis,
        apis: getAllStatus()
    };
}

/**
 * Reseta o status de uma API
 * @param {string} apiName - Nome da API
 */
function resetStatus(apiName) {
    const api = apiStatus[apiName];
    if (!api) return;
    
    api.healthy = true;
    api.failCount = 0;
    api.lastCheck = null;
    logger.info('API status reset', { api: apiName });
}

/**
 * Reseta todas as estatísticas
 */
function resetAllStats() {
    for (const api of Object.values(apiStatus)) {
        api.healthy = true;
        api.lastCheck = null;
        api.lastSuccess = null;
        api.failCount = 0;
        api.totalRequests = 0;
        api.totalFailures = 0;
        api.avgResponseTime = 0;
        api.responseTimeSum = 0;
    }
    logger.info('All API stats reset');
}

/**
 * Wrapper para fazer requisições com tracking de health
 * @param {string} apiName - Nome da API
 * @param {Function} requestFn - Função de requisição async
 * @param {Object} [options] - Opções
 * @param {boolean} [options.throwOnDegraded=false] - Lançar erro se API degradada
 * @returns {Promise<*>} Resultado da requisição
 */
async function withHealthTracking(apiName, requestFn, options = {}) {
    const { throwOnDegraded = false } = options;
    
    // Verificar se API está degradada
    if (throwOnDegraded && isDegraded(apiName)) {
        const error = new Error(getErrorMessage(apiName, 'unavailable'));
        error.apiDegraded = true;
        throw error;
    }
    
    const startTime = Date.now();
    
    try {
        const result = await requestFn();
        const responseTime = Date.now() - startTime;
        
        recordSuccess(apiName, responseTime);
        
        return result;
    } catch (error) {
        recordFailure(apiName, error);
        
        // Adicionar informação de degradação ao erro
        if (isDegraded(apiName)) {
            error.userMessage = getErrorMessage(apiName, 'unavailable');
        }
        
        throw error;
    }
}

module.exports = {
    // Status tracking
    recordSuccess,
    recordFailure,
    isHealthy,
    isDegraded,
    
    // Status queries
    getAllStatus,
    getHealthSummary,
    getErrorMessage,
    
    // Management
    resetStatus,
    resetAllStats,
    
    // Wrapper
    withHealthTracking,
    
    // Configuration
    config,
    
    // API names for reference
    API_NAMES: {
        DIVINE_PRIDE: 'divinePride',
        GNJOY_MARKET: 'gnjoyMarket',
        BROWIKI: 'browiki'
    }
};
