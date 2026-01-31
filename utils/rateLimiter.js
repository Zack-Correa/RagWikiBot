/**
 * Rate Limiter - Limita requisições por usuário
 * Com feedback visual e configuração por tipo de comando
 */

const logger = require('./logger');

// Configuração de limites por categoria de comando
const LIMITS = {
    search: { 
        requests: 10, 
        windowMs: 60000,     // 10 requisições por minuto
        description: 'Busca de itens/monstros'
    },
    party: { 
        requests: 5, 
        windowMs: 60000,     // 5 requisições por minuto
        description: 'Comandos de grupo'
    },
    alert: { 
        requests: 3, 
        windowMs: 60000,     // 3 requisições por minuto
        description: 'Alertas de mercado'
    },
    market: {
        requests: 8,
        windowMs: 60000,     // 8 requisições por minuto
        description: 'Busca de mercado'
    },
    wiki: {
        requests: 15,
        windowMs: 60000,     // 15 requisições por minuto
        description: 'Busca na wiki'
    },
    default: { 
        requests: 20, 
        windowMs: 60000,     // 20 requisições por minuto (padrão)
        description: 'Comandos gerais'
    }
};

// Mapeamento de comandos para categorias
const COMMAND_CATEGORIES = {
    // Search commands
    'item': 'search',
    'monster': 'search',
    'monstro': 'search',
    'map': 'search',
    'mapa': 'search',
    
    // Party commands
    'grupo': 'party',
    'party': 'party',
    
    // Alert commands
    'alerta': 'alert',
    'alert': 'alert',
    
    // Market commands
    'mercado': 'market',
    'market': 'market',
    'preco': 'market',
    'price': 'market',
    
    // Wiki commands
    'wiki': 'wiki',
    'browiki': 'wiki'
};

// Armazenamento de requisições por usuário
// Estrutura: { 'userId:category': [timestamp1, timestamp2, ...] }
const userRequests = new Map();

// Estatísticas
const stats = {
    totalRequests: 0,
    totalLimited: 0,
    limitsByCategory: {}
};

/**
 * Obtém a categoria de rate limit para um comando
 * @param {string} commandName - Nome do comando
 * @returns {string} Categoria do comando
 */
function getCommandCategory(commandName) {
    return COMMAND_CATEGORIES[commandName?.toLowerCase()] || 'default';
}

/**
 * Obtém configuração de limite para uma categoria
 * @param {string} category - Categoria do comando
 * @returns {Object} Configuração de limite
 */
function getLimitConfig(category) {
    return LIMITS[category] || LIMITS.default;
}

/**
 * Verifica se um usuário atingiu o rate limit
 * @param {string} userId - ID do usuário
 * @param {string} commandName - Nome do comando
 * @returns {Object} Resultado da verificação
 */
function checkLimit(userId, commandName) {
    const category = getCommandCategory(commandName);
    const config = getLimitConfig(category);
    const key = `${userId}:${category}`;
    const now = Date.now();
    
    // Obter requisições anteriores
    let requests = userRequests.get(key) || [];
    
    // Remover requisições fora da janela de tempo
    const windowStart = now - config.windowMs;
    requests = requests.filter(timestamp => timestamp > windowStart);
    
    stats.totalRequests++;
    
    // Verificar se atingiu o limite
    if (requests.length >= config.requests) {
        stats.totalLimited++;
        
        // Atualizar estatísticas por categoria
        if (!stats.limitsByCategory[category]) {
            stats.limitsByCategory[category] = 0;
        }
        stats.limitsByCategory[category]++;
        
        // Calcular tempo restante
        const oldestRequest = Math.min(...requests);
        const resetTime = oldestRequest + config.windowMs;
        const remainingMs = resetTime - now;
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        
        logger.debug('Rate limit exceeded', { 
            userId, 
            category, 
            commandName,
            requests: requests.length,
            limit: config.requests
        });
        
        return {
            limited: true,
            category,
            limit: config.requests,
            windowMs: config.windowMs,
            windowSeconds: Math.round(config.windowMs / 1000),
            currentRequests: requests.length,
            remainingMs,
            remainingSeconds,
            resetAt: new Date(resetTime).toISOString(),
            description: config.description
        };
    }
    
    // Adicionar requisição atual
    requests.push(now);
    userRequests.set(key, requests);
    
    return {
        limited: false,
        category,
        limit: config.requests,
        windowMs: config.windowMs,
        currentRequests: requests.length,
        remaining: config.requests - requests.length,
        description: config.description
    };
}

/**
 * Cria uma barra de progresso visual
 * @param {number} remainingSeconds - Segundos restantes
 * @param {number} totalSeconds - Total de segundos do cooldown
 * @param {number} width - Largura da barra em caracteres
 * @returns {string} Barra de progresso
 */
function createProgressBar(remainingSeconds, totalSeconds, width = 16) {
    const progress = Math.max(0, Math.min(1, remainingSeconds / totalSeconds));
    const filled = Math.round(width * progress);
    const empty = width - filled;
    
    return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Gera mensagem de rate limit com visual
 * @param {Object} limitResult - Resultado do checkLimit
 * @returns {Object} Objeto com embed e componentes para Discord
 */
function getRateLimitMessage(limitResult) {
    const progressBar = createProgressBar(
        limitResult.remainingSeconds, 
        limitResult.windowSeconds
    );
    
    return {
        embeds: [{
            color: 0xFFA500, // Laranja
            title: '⏳ Limite de uso atingido',
            description: `Você está enviando comandos muito rápido.\n\n` +
                `Você pode usar comandos de **${limitResult.description}** novamente em **${limitResult.remainingSeconds}** segundos.`,
            fields: [
                {
                    name: 'Cooldown',
                    value: `\`[${progressBar}]\` ${limitResult.remainingSeconds}s restantes`,
                    inline: false
                },
                {
                    name: 'Limite',
                    value: `${limitResult.limit} comandos por ${limitResult.windowSeconds} segundos`,
                    inline: true
                },
                {
                    name: 'Categoria',
                    value: limitResult.category,
                    inline: true
                }
            ],
            footer: {
                text: 'Este limite existe para garantir a estabilidade do bot'
            },
            timestamp: new Date().toISOString()
        }],
        ephemeral: true
    };
}

/**
 * Reseta o rate limit para um usuário
 * @param {string} userId - ID do usuário
 * @param {string} [category] - Categoria específica (ou null para todas)
 */
function resetUser(userId, category = null) {
    if (category) {
        userRequests.delete(`${userId}:${category}`);
    } else {
        // Remover todas as categorias do usuário
        for (const key of userRequests.keys()) {
            if (key.startsWith(`${userId}:`)) {
                userRequests.delete(key);
            }
        }
    }
    
    logger.debug('User rate limit reset', { userId, category });
}

/**
 * Limpa requisições antigas de todos os usuários
 * (Executar periodicamente para limpar memória)
 */
function cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, requests] of userRequests.entries()) {
        const category = key.split(':')[1];
        const config = getLimitConfig(category);
        const windowStart = now - config.windowMs;
        
        const filtered = requests.filter(timestamp => timestamp > windowStart);
        
        if (filtered.length === 0) {
            userRequests.delete(key);
            cleaned++;
        } else if (filtered.length !== requests.length) {
            userRequests.set(key, filtered);
        }
    }
    
    if (cleaned > 0) {
        logger.debug('Rate limiter cleanup', { cleaned });
    }
}

/**
 * Obtém estatísticas do rate limiter
 * @returns {Object} Estatísticas
 */
function getStats() {
    return {
        ...stats,
        activeUsers: userRequests.size,
        limitRate: stats.totalRequests > 0 
            ? ((stats.totalLimited / stats.totalRequests) * 100).toFixed(2) + '%'
            : '0%',
        limits: LIMITS
    };
}

/**
 * Reseta estatísticas
 */
function resetStats() {
    stats.totalRequests = 0;
    stats.totalLimited = 0;
    stats.limitsByCategory = {};
}

/**
 * Obtém info de rate limit para um usuário
 * @param {string} userId - ID do usuário
 * @returns {Object} Info de todas as categorias
 */
function getUserInfo(userId) {
    const info = {};
    
    for (const category of Object.keys(LIMITS)) {
        const key = `${userId}:${category}`;
        const requests = userRequests.get(key) || [];
        const config = LIMITS[category];
        
        const now = Date.now();
        const windowStart = now - config.windowMs;
        const activeRequests = requests.filter(t => t > windowStart);
        
        info[category] = {
            currentRequests: activeRequests.length,
            limit: config.requests,
            remaining: Math.max(0, config.requests - activeRequests.length),
            limited: activeRequests.length >= config.requests
        };
    }
    
    return info;
}

// Configurar limpeza periódica (a cada 5 minutos)
let cleanupTimer = null;

function startCleanup() {
    if (!cleanupTimer) {
        cleanupTimer = setInterval(cleanup, 5 * 60 * 1000);
        cleanupTimer.unref();
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
    LIMITS,
    COMMAND_CATEGORIES,
    
    // Funções principais
    checkLimit,
    getCommandCategory,
    getLimitConfig,
    
    // Visual
    getRateLimitMessage,
    createProgressBar,
    
    // Gerenciamento
    resetUser,
    cleanup,
    
    // Estatísticas
    getStats,
    resetStats,
    getUserInfo,
    
    // Lifecycle
    startCleanup,
    stopCleanup
};
