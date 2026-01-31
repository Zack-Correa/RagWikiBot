/**
 * API Cache - Sistema de cache em memória com TTL e LRU eviction
 * Reduz chamadas repetidas às APIs externas
 */

const logger = require('./logger');

// Cache storage
const cache = new Map();

// Configuração
const config = {
    maxSize: 1000,           // Máximo de entradas no cache
    defaultTTL: 5 * 60 * 1000, // 5 minutos padrão
    cleanupInterval: 60 * 1000  // Limpar expirados a cada 1 minuto
};

// TTLs por categoria (em milissegundos)
const TTL = {
    WIKI_SEARCH: 30 * 60 * 1000,      // 30 minutos
    ITEM_SEARCH: 30 * 60 * 1000,      // 30 minutos
    MONSTER_SEARCH: 30 * 60 * 1000,   // 30 minutos
    MAP_SEARCH: 60 * 60 * 1000,       // 1 hora (mapas mudam pouco)
    MARKET_SEARCH: 5 * 60 * 1000,     // 5 minutos (preços mudam)
    PRICE_HISTORY: 15 * 60 * 1000,    // 15 minutos
    SERVER_STATUS: 1 * 60 * 1000,     // 1 minuto
    NEWS: 30 * 60 * 1000              // 30 minutos
};

// Estatísticas
const stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0
};

/**
 * Gera uma chave de cache baseada nos parâmetros
 * @param {string} category - Categoria do cache (ex: 'item', 'market')
 * @param {Object|string} params - Parâmetros da requisição
 * @returns {string} Chave única
 */
function generateKey(category, params) {
    const paramStr = typeof params === 'object' 
        ? JSON.stringify(params, Object.keys(params).sort())
        : String(params);
    return `${category}:${paramStr}`;
}

/**
 * Obtém um item do cache
 * @param {string} key - Chave do cache
 * @returns {*} Valor ou undefined se não existir/expirado
 */
function get(key) {
    const entry = cache.get(key);
    
    if (!entry) {
        stats.misses++;
        return undefined;
    }
    
    // Verificar se expirou
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        stats.expirations++;
        stats.misses++;
        return undefined;
    }
    
    // Atualizar lastAccess para LRU
    entry.lastAccess = Date.now();
    stats.hits++;
    
    return entry.value;
}

/**
 * Obtém item do cache mesmo se expirado (para fallback)
 * @param {string} key - Chave do cache
 * @returns {*} Valor ou undefined
 */
function getStale(key) {
    const entry = cache.get(key);
    return entry ? entry.value : undefined;
}

/**
 * Armazena um item no cache
 * @param {string} key - Chave do cache
 * @param {*} value - Valor a armazenar
 * @param {number} [ttl] - TTL em milissegundos (usa padrão se não informado)
 */
function set(key, value, ttl = config.defaultTTL) {
    // Verificar limite de tamanho
    if (cache.size >= config.maxSize) {
        evictLRU();
    }
    
    cache.set(key, {
        value,
        createdAt: Date.now(),
        expiresAt: Date.now() + ttl,
        lastAccess: Date.now()
    });
}

/**
 * Remove as entradas menos usadas recentemente (LRU)
 * @param {number} [count=1] - Quantidade a remover
 */
function evictLRU(count = 1) {
    const entries = Array.from(cache.entries())
        .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    
    for (let i = 0; i < count && i < entries.length; i++) {
        cache.delete(entries[i][0]);
        stats.evictions++;
    }
}

/**
 * Invalida entradas do cache por padrão
 * @param {string|RegExp} pattern - Padrão para match (string ou regex)
 */
function invalidate(pattern) {
    let removed = 0;
    
    for (const key of cache.keys()) {
        const matches = pattern instanceof RegExp 
            ? pattern.test(key)
            : key.startsWith(pattern);
        
        if (matches) {
            cache.delete(key);
            removed++;
        }
    }
    
    if (removed > 0) {
        logger.debug('Cache invalidated', { pattern: String(pattern), removed });
    }
    
    return removed;
}

/**
 * Limpa todo o cache
 */
function clear() {
    const size = cache.size;
    cache.clear();
    logger.info('Cache cleared', { entriesRemoved: size });
}

/**
 * Remove entradas expiradas
 */
function cleanup() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of cache.entries()) {
        if (now > entry.expiresAt) {
            cache.delete(key);
            removed++;
        }
    }
    
    if (removed > 0) {
        stats.expirations += removed;
        logger.debug('Cache cleanup', { removed });
    }
}

/**
 * Retorna estatísticas do cache
 * @returns {Object} Estatísticas
 */
function getStats() {
    const total = stats.hits + stats.misses;
    return {
        size: cache.size,
        maxSize: config.maxSize,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: total > 0 ? ((stats.hits / total) * 100).toFixed(1) + '%' : '0%',
        evictions: stats.evictions,
        expirations: stats.expirations
    };
}

/**
 * Reseta estatísticas
 */
function resetStats() {
    stats.hits = 0;
    stats.misses = 0;
    stats.evictions = 0;
    stats.expirations = 0;
}

// Wrapper de alto nível para uso simplificado
/**
 * Obtém ou busca um valor do cache
 * @param {string} category - Categoria (usado para TTL)
 * @param {Object|string} params - Parâmetros para a chave
 * @param {Function} fetchFn - Função async para buscar se não estiver em cache
 * @param {Object} [options] - Opções adicionais
 * @param {boolean} [options.useStaleOnError=true] - Usar cache expirado se fetch falhar
 * @returns {Promise<*>} Valor do cache ou buscado
 */
async function getOrFetch(category, params, fetchFn, options = {}) {
    const { useStaleOnError = true } = options;
    const key = generateKey(category, params);
    const ttl = TTL[category] || config.defaultTTL;
    
    // Tentar cache primeiro
    const cached = get(key);
    if (cached !== undefined) {
        return cached;
    }
    
    // Buscar novo valor
    try {
        const value = await fetchFn();
        
        if (value !== null && value !== undefined) {
            set(key, value, ttl);
        }
        
        return value;
    } catch (error) {
        // Tentar usar cache expirado como fallback
        if (useStaleOnError) {
            const stale = getStale(key);
            if (stale !== undefined) {
                logger.warn('Using stale cache due to fetch error', { 
                    category, 
                    error: error.message 
                });
                return stale;
            }
        }
        
        throw error;
    }
}

// Iniciar cleanup periódico
let cleanupTimer = null;

function startCleanup() {
    if (!cleanupTimer) {
        cleanupTimer = setInterval(cleanup, config.cleanupInterval);
        cleanupTimer.unref(); // Não impede o processo de terminar
    }
}

function stopCleanup() {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
    }
}

// Iniciar automaticamente
startCleanup();

module.exports = {
    // Constantes
    TTL,
    
    // Funções de baixo nível
    generateKey,
    get,
    getStale,
    set,
    
    // Funções de gerenciamento
    invalidate,
    clear,
    cleanup,
    
    // Estatísticas
    getStats,
    resetStats,
    
    // Wrapper de alto nível
    getOrFetch,
    
    // Lifecycle
    startCleanup,
    stopCleanup
};
