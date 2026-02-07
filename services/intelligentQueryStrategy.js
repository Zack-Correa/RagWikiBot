/**
 * Intelligent Query Strategy Service
 * Provides smart query optimization for market alerts:
 * - Adaptive caching based on item volatility
 * - Dynamic prioritization of alerts
 * - Intelligent skip logic based on patterns
 * - Trend analysis for optimal check timing
 */

const logger = require('../utils/logger');
const alertStorage = require('../utils/alertStorage');
const priceHistoryStorage = require('../utils/priceHistoryStorage');

// Cache for query results with TTL
const queryCache = new Map();

// Statistics tracking for each alert group
const groupStats = new Map();

// Configuration constants
const CACHE_CONFIG = {
    // Base TTL in milliseconds
    BASE_TTL_MS: 5 * 60 * 1000, // 5 minutes
    
    // Volatility multipliers
    HIGH_VOLATILITY_MULTIPLIER: 0.5,  // Cache for less time if volatile
    LOW_VOLATILITY_MULTIPLIER: 2.0,   // Cache for more time if stable
    
    // Minimum and maximum TTL
    MIN_TTL_MS: 1 * 60 * 1000,  // 1 minute minimum
    MAX_TTL_MS: 30 * 60 * 1000, // 30 minutes maximum
};

const PRIORITY_CONFIG = {
    // Priority factors
    HAS_RESULTS_BONUS: 10,           // Alert that found items gets priority
    RECENT_ACTIVITY_BONUS: 5,        // Recent notifications boost priority
    PRICE_DROP_BONUS: 15,            // Price drops get highest priority
    NO_RESULTS_PENALTY: -5,          // No results reduces priority
    STALE_ALERT_BONUS: 3,            // Old alerts without checks get bonus
};

const SKIP_CONFIG = {
    // Skip conditions
    MAX_CONSECUTIVE_EMPTY: 5,        // Skip after N empty results
    STABLE_PRICE_THRESHOLD: 0.02,    // 2% price variation = stable
    STABLE_HOURS: 6,                 // Hours of stable price to skip
    MIN_CHECK_INTERVAL_MS: 10 * 60 * 1000, // Never skip if last check > 10min ago
};

/**
 * Gets cache key for a query group
 */
function getCacheKey(searchTerm, server, storeType) {
    return `${searchTerm.toLowerCase()}|${server}|${storeType}`;
}

/**
 * Calculates item volatility based on price history
 * @param {string} searchTerm - Item search term
 * @param {string} server - Server name
 * @param {string} storeType - Store type
 * @returns {number} Volatility score (0-1, higher = more volatile)
 */
function calculateVolatility(searchTerm, server, storeType) {
    try {
        // Try to find item ID from recent alerts or cache
        // For now, we'll use a simplified approach based on group stats
        const stats = groupStats.get(getCacheKey(searchTerm, server, storeType));
        
        if (!stats || !stats.priceHistory || stats.priceHistory.length < 2) {
            // No history, assume medium volatility
            return 0.5;
        }
        
        const prices = stats.priceHistory;
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        
        if (avgPrice === 0) return 0.5;
        
        // Calculate coefficient of variation (std dev / mean)
        const variance = prices.reduce((sum, price) => {
            return sum + Math.pow(price - avgPrice, 2);
        }, 0) / prices.length;
        
        const stdDev = Math.sqrt(variance);
        const coefficientOfVariation = stdDev / avgPrice;
        
        // Normalize to 0-1 range (cap at 1.0 for very volatile items)
        return Math.min(1.0, coefficientOfVariation * 2);
    } catch (error) {
        logger.debug('Error calculating volatility', { error: error.message });
        return 0.5; // Default to medium volatility
    }
}

/**
 * Calculates adaptive TTL based on volatility and activity
 * @param {string} searchTerm - Item search term
 * @param {string} server - Server name
 * @param {string} storeType - Store type
 * @param {boolean} hasResults - Whether last query had results
 * @returns {number} TTL in milliseconds
 */
function calculateAdaptiveTTL(searchTerm, server, storeType, hasResults) {
    const volatility = calculateVolatility(searchTerm, server, storeType);
    const cacheKey = getCacheKey(searchTerm, server, storeType);
    const stats = groupStats.get(cacheKey) || {};
    
    let multiplier = 1.0;
    
    // Adjust based on volatility
    if (volatility > 0.7) {
        // High volatility - cache for less time
        multiplier = CACHE_CONFIG.HIGH_VOLATILITY_MULTIPLIER;
    } else if (volatility < 0.3) {
        // Low volatility - cache for more time
        multiplier = CACHE_CONFIG.LOW_VOLATILITY_MULTIPLIER;
    }
    
    // Adjust based on results
    if (!hasResults && stats.consecutiveEmpty > 3) {
        // Many empty results - cache longer (item might be rare)
        multiplier *= 1.5;
    }
    
    // Adjust based on recent activity
    if (stats.lastResultTime) {
        const timeSinceResult = Date.now() - stats.lastResultTime;
        const hoursSinceResult = timeSinceResult / (60 * 60 * 1000);
        
        if (hoursSinceResult > 12) {
            // No results for 12+ hours - cache longer
            multiplier *= 1.3;
        }
    }
    
    const ttl = CACHE_CONFIG.BASE_TTL_MS * multiplier;
    
    // Clamp to min/max
    return Math.max(
        CACHE_CONFIG.MIN_TTL_MS,
        Math.min(CACHE_CONFIG.MAX_TTL_MS, ttl)
    );
}

/**
 * Checks if a query result is cached and still valid
 * @param {string} searchTerm - Item search term
 * @param {string} server - Server name
 * @param {string} storeType - Store type
 * @returns {Object|null} Cached result or null
 */
function getCachedResult(searchTerm, server, storeType) {
    const cacheKey = getCacheKey(searchTerm, server, storeType);
    const cached = queryCache.get(cacheKey);
    
    if (!cached) {
        return null;
    }
    
    const age = Date.now() - cached.timestamp;
    
    if (age > cached.ttl) {
        // Cache expired
        queryCache.delete(cacheKey);
        return null;
    }
    
    logger.debug('Using cached result', {
        searchTerm,
        server,
        storeType,
        ageMs: age,
        ttlMs: cached.ttl
    });
    
    return cached.data;
}

/**
 * Stores a query result in cache
 * @param {string} searchTerm - Item search term
 * @param {string} server - Server name
 * @param {string} storeType - Store type
 * @param {Object} result - Query result
 */
function cacheResult(searchTerm, server, storeType, result) {
    const cacheKey = getCacheKey(searchTerm, server, storeType);
    const hasResults = result && result.list && result.list.length > 0;
    
    // Update stats
    updateGroupStats(cacheKey, result);
    
    // Calculate adaptive TTL
    const ttl = calculateAdaptiveTTL(searchTerm, server, storeType, hasResults);
    
    queryCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
        ttl: ttl
    });
    
    logger.debug('Cached query result', {
        searchTerm,
        server,
        storeType,
        ttlMinutes: Math.round(ttl / 60000),
        hasResults
    });
}

/**
 * Updates statistics for an alert group
 * @param {string} cacheKey - Cache key
 * @param {Object} result - Query result
 */
function updateGroupStats(cacheKey, result) {
    const stats = groupStats.get(cacheKey) || {
        queryCount: 0,
        resultCount: 0,
        consecutiveEmpty: 0,
        consecutiveWithResults: 0,
        priceHistory: [],
        lastResultTime: null,
        lastEmptyTime: null
    };
    
    stats.queryCount++;
    
    const hasResults = result && result.list && result.list.length > 0;
    
    if (hasResults) {
        stats.resultCount++;
        stats.consecutiveEmpty = 0;
        stats.consecutiveWithResults++;
        stats.lastResultTime = Date.now();
        
        // Track price history (keep last 20 prices)
        const prices = result.list.map(item => item.itemPrice).sort((a, b) => a - b);
        if (prices.length > 0) {
            stats.priceHistory.push(prices[0]); // Track lowest price
            if (stats.priceHistory.length > 20) {
                stats.priceHistory.shift(); // Keep only last 20
            }
        }
    } else {
        stats.consecutiveEmpty++;
        stats.consecutiveWithResults = 0;
        stats.lastEmptyTime = Date.now();
    }
    
    groupStats.set(cacheKey, stats);
}

/**
 * Calculates priority score for an alert group
 * @param {Object} group - Alert group
 * @returns {number} Priority score (higher = more priority)
 */
function calculatePriority(group) {
    const cacheKey = getCacheKey(group.searchTerm, group.server, group.storeType);
    const stats = groupStats.get(cacheKey) || {};
    const alerts = group.alerts || [];
    
    let priority = 0;
    
    // Base priority from number of alerts
    priority += alerts.length;
    
    // Bonus for alerts that have found results
    if (stats.resultCount > 0) {
        priority += PRIORITY_CONFIG.HAS_RESULTS_BONUS;
    }
    
    // Bonus for recent activity
    if (stats.lastResultTime) {
        const hoursSinceResult = (Date.now() - stats.lastResultTime) / (60 * 60 * 1000);
        if (hoursSinceResult < 2) {
            priority += PRIORITY_CONFIG.RECENT_ACTIVITY_BONUS;
        }
    }
    
    // Check if any alert has price drop detection
    const hasPriceDropAlerts = alerts.some(alert => {
        const freshAlert = alertStorage.getAlert(alert.id);
        return freshAlert && freshAlert.lowestPriceSeen !== null;
    });
    
    if (hasPriceDropAlerts && stats.priceHistory && stats.priceHistory.length >= 2) {
        const recentPrices = stats.priceHistory.slice(-5);
        const olderPrices = stats.priceHistory.slice(0, -5);
        
        if (olderPrices.length > 0) {
            const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
            const olderAvg = olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length;
            
            if (recentAvg < olderAvg * 0.95) {
                // Price dropped 5%+ - high priority
                priority += PRIORITY_CONFIG.PRICE_DROP_BONUS;
            }
        }
    }
    
    // Penalty for many empty results
    if (stats.consecutiveEmpty > SKIP_CONFIG.MAX_CONSECUTIVE_EMPTY) {
        priority += PRIORITY_CONFIG.NO_RESULTS_PENALTY;
    }
    
    // Bonus for stale alerts (haven't been checked recently)
    const lastCheck = stats.lastCheckTime || 0;
    const hoursSinceCheck = (Date.now() - lastCheck) / (60 * 60 * 1000);
    if (hoursSinceCheck > 24) {
        priority += PRIORITY_CONFIG.STALE_ALERT_BONUS;
    }
    
    return priority;
}

/**
 * Checks if a query should be skipped based on intelligent analysis
 * @param {string} searchTerm - Item search term
 * @param {string} server - Server name
 * @param {string} storeType - Store type
 * @returns {Object} { shouldSkip: boolean, reason: string }
 */
function shouldSkipQuery(searchTerm, server, storeType) {
    const cacheKey = getCacheKey(searchTerm, server, storeType);
    const stats = groupStats.get(cacheKey);
    
    if (!stats) {
        // No stats yet - don't skip
        return { shouldSkip: false, reason: null };
    }
    
    // Never skip if we have cached data that's still fresh
    const cached = queryCache.get(cacheKey);
    if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < cached.ttl) {
            return { shouldSkip: true, reason: 'cached' };
        }
    }
    
    // Skip if too many consecutive empty results
    if (stats.consecutiveEmpty >= SKIP_CONFIG.MAX_CONSECUTIVE_EMPTY) {
        const lastEmptyTime = stats.lastEmptyTime || 0;
        const hoursSinceEmpty = (Date.now() - lastEmptyTime) / (60 * 60 * 1000);
        
        // But check again after some time
        if (hoursSinceEmpty < SKIP_CONFIG.STABLE_HOURS) {
            return { 
                shouldSkip: true, 
                reason: `many_empty_results (${stats.consecutiveEmpty} consecutive)` 
            };
        }
    }
    
    // Skip if price is very stable (low volatility, no recent changes)
    if (stats.priceHistory && stats.priceHistory.length >= 10) {
        const recentPrices = stats.priceHistory.slice(-5);
        const olderPrices = stats.priceHistory.slice(-10, -5);
        
        if (olderPrices.length > 0) {
            const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
            const olderAvg = olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length;
            
            const variation = Math.abs(recentAvg - olderAvg) / olderAvg;
            
            if (variation < SKIP_CONFIG.STABLE_PRICE_THRESHOLD) {
                // Price is very stable
                const lastCheck = stats.lastCheckTime || 0;
                const minutesSinceCheck = (Date.now() - lastCheck) / (60 * 1000);
                
                // Skip if checked recently and price is stable
                if (minutesSinceCheck < SKIP_CONFIG.MIN_CHECK_INTERVAL_MS / 60000) {
                    return { 
                        shouldSkip: true, 
                        reason: `stable_price (${(variation * 100).toFixed(1)}% variation)` 
                    };
                }
            }
        }
    }
    
    return { shouldSkip: false, reason: null };
}

/**
 * Sorts alert groups by priority
 * @param {Array} groups - Array of alert groups
 * @returns {Array} Sorted groups (highest priority first)
 */
function prioritizeGroups(groups) {
    return groups
        .map(group => ({
            group,
            priority: calculatePriority(group)
        }))
        .sort((a, b) => b.priority - a.priority)
        .map(item => item.group);
}

/**
 * Records that a check was performed for a group
 * @param {string} searchTerm - Item search term
 * @param {string} server - Server name
 * @param {string} storeType - Store type
 */
function recordCheck(searchTerm, server, storeType) {
    const cacheKey = getCacheKey(searchTerm, server, storeType);
    const stats = groupStats.get(cacheKey) || {};
    stats.lastCheckTime = Date.now();
    groupStats.set(cacheKey, stats);
}

/**
 * Clears cache (useful for testing or manual refresh)
 */
function clearCache() {
    queryCache.clear();
    logger.info('Query cache cleared');
}

/**
 * Gets cache statistics
 * @returns {Object} Cache stats
 */
function getCacheStats() {
    return {
        cacheSize: queryCache.size,
        groupStatsSize: groupStats.size,
        cacheEntries: Array.from(queryCache.entries()).map(([key, value]) => ({
            key,
            ageMs: Date.now() - value.timestamp,
            ttlMs: value.ttl,
            hasResults: value.data?.list?.length > 0
        }))
    };
}

module.exports = {
    getCachedResult,
    cacheResult,
    shouldSkipQuery,
    prioritizeGroups,
    recordCheck,
    clearCache,
    getCacheStats,
    calculateVolatility,
    calculatePriority
};
