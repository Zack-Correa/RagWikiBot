/**
 * Pricing Service
 * Analyzes price history to provide intelligent pricing recommendations
 * Uses statistical methods (percentiles, mean, standard deviation)
 */

const priceHistoryStorage = require('../utils/priceHistoryStorage');
const logger = require('../utils/logger');

// Price level classifications
const PRICE_LEVELS = {
    VERY_CHEAP: { key: 'VERY_CHEAP', label: 'Muito Barato', emoji: '🟢', color: '#3BA55C' },
    CHEAP: { key: 'CHEAP', label: 'Barato', emoji: '🟡', color: '#FAA61A' },
    FAIR: { key: 'FAIR', label: 'Justo', emoji: '🟠', color: '#F5A623' },
    EXPENSIVE: { key: 'EXPENSIVE', label: 'Caro', emoji: '🔴', color: '#ED4245' },
    VERY_EXPENSIVE: { key: 'VERY_EXPENSIVE', label: 'Muito Caro', emoji: '⛔', color: '#8B0000' }
};

/**
 * Calculates percentile of a sorted array
 * @param {Array<number>} sortedArr - Sorted array of numbers
 * @param {number} p - Percentile (0-100)
 * @returns {number} Percentile value
 */
function percentile(sortedArr, p) {
    if (sortedArr.length === 0) return 0;
    if (sortedArr.length === 1) return sortedArr[0];
    
    const index = (p / 100) * (sortedArr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) return sortedArr[lower];
    
    const fraction = index - lower;
    return sortedArr[lower] * (1 - fraction) + sortedArr[upper] * fraction;
}

/**
 * Calculates standard deviation
 * @param {Array<number>} arr - Array of numbers
 * @param {number} mean - Pre-calculated mean
 * @returns {number} Standard deviation
 */
function standardDeviation(arr, mean) {
    if (arr.length <= 1) return 0;
    
    const squareDiffs = arr.map(value => {
        const diff = value - mean;
        return diff * diff;
    });
    
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(avgSquareDiff);
}

/**
 * Analyzes price level for a given price
 * @param {number} currentPrice - Current price to analyze
 * @param {Array<Object>} priceHistory - Array of daily price data with min, max, avg
 * @returns {Object} Analysis result
 */
function analyzePriceLevel(currentPrice, priceHistory) {
    if (!priceHistory || priceHistory.length === 0) {
        return {
            level: null,
            confidence: 'none',
            message: 'Dados insuficientes para análise'
        };
    }
    
    // Collect all average prices
    const prices = priceHistory.map(d => d.avg).sort((a, b) => a - b);
    
    if (prices.length < 3) {
        return {
            level: null,
            confidence: 'low',
            message: 'Poucos dados para análise precisa (mínimo 3 dias)'
        };
    }
    
    // Calculate statistics
    const p10 = percentile(prices, 10);
    const p25 = percentile(prices, 25);
    const p50 = percentile(prices, 50); // Median
    const p75 = percentile(prices, 75);
    const p90 = percentile(prices, 90);
    
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const stdDev = standardDeviation(prices, mean);
    
    // Determine confidence level
    let confidence = 'high';
    if (prices.length < 7) {
        confidence = 'medium';
    }
    if (prices.length < 5) {
        confidence = 'low';
    }
    
    // Classify the current price
    let level;
    if (currentPrice <= p10) {
        level = PRICE_LEVELS.VERY_CHEAP;
    } else if (currentPrice <= p25) {
        level = PRICE_LEVELS.CHEAP;
    } else if (currentPrice <= p75) {
        level = PRICE_LEVELS.FAIR;
    } else if (currentPrice <= p90) {
        level = PRICE_LEVELS.EXPENSIVE;
    } else {
        level = PRICE_LEVELS.VERY_EXPENSIVE;
    }
    
    // Calculate how far from median (as percentage)
    const deviationFromMedian = ((currentPrice - p50) / p50 * 100).toFixed(1);
    
    // Generate recommendation
    let recommendation;
    switch (level.key) {
        case 'VERY_CHEAP':
            recommendation = 'Excelente momento para comprar! Preço muito abaixo da média.';
            break;
        case 'CHEAP':
            recommendation = 'Bom momento para comprar. Preço abaixo da média.';
            break;
        case 'FAIR':
            recommendation = 'Preço dentro da faixa esperada.';
            break;
        case 'EXPENSIVE':
            recommendation = 'Preço acima da média. Considere aguardar.';
            break;
        case 'VERY_EXPENSIVE':
            recommendation = 'Preço muito acima do normal. Recomendamos aguardar.';
            break;
    }
    
    return {
        level,
        confidence,
        statistics: {
            min: Math.min(...prices),
            max: Math.max(...prices),
            mean: Math.round(mean),
            median: Math.round(p50),
            stdDev: Math.round(stdDev),
            p10: Math.round(p10),
            p25: Math.round(p25),
            p75: Math.round(p75),
            p90: Math.round(p90),
            samples: prices.length
        },
        deviationFromMedian,
        recommendation,
        suggestedRange: {
            min: Math.round(p25),
            max: Math.round(p75)
        }
    };
}

/**
 * Analyzes an item's price across all available data
 * @param {string|number} itemId - Item ID
 * @param {string} [server] - Optional server filter
 * @param {string} [storeType] - Optional store type filter
 * @param {number} [days=30] - Days of history to consider
 * @returns {Object|null} Complete analysis or null if not found
 */
function analyzeItem(itemId, server = null, storeType = null, days = 30) {
    const history = priceHistoryStorage.getItemHistory(itemId, server, storeType, days);
    
    if (!history) {
        return null;
    }
    
    const result = {
        itemId: history.itemId,
        name: history.name,
        days,
        servers: {}
    };
    
    for (const [serverName, serverData] of Object.entries(history.servers)) {
        result.servers[serverName] = {};
        
        for (const [type, priceData] of Object.entries(serverData)) {
            // Get latest price as the "current" price to analyze
            const latestData = priceData[priceData.length - 1];
            const currentPrice = latestData?.avg || 0;
            
            const analysis = analyzePriceLevel(currentPrice, priceData);
            
            result.servers[serverName][type] = {
                currentPrice,
                latestDate: latestData?.date,
                ...analysis
            };
        }
    }
    
    return result;
}

/**
 * Analyzes a specific price for an item (for real-time analysis)
 * @param {string|number} itemId - Item ID
 * @param {number} priceToAnalyze - Price to analyze
 * @param {string} server - Server
 * @param {string} storeType - Store type
 * @param {number} [days=30] - Days of history to consider
 * @returns {Object|null} Analysis or null if not found
 */
function analyzePrice(itemId, priceToAnalyze, server, storeType, days = 30) {
    const history = priceHistoryStorage.getItemHistory(itemId, server, storeType, days);
    
    if (!history || !history.servers[server] || !history.servers[server][storeType]) {
        return null;
    }
    
    const priceData = history.servers[server][storeType];
    const analysis = analyzePriceLevel(priceToAnalyze, priceData);
    
    return {
        itemId: history.itemId,
        name: history.name,
        analyzedPrice: priceToAnalyze,
        server,
        storeType,
        days,
        ...analysis
    };
}

/**
 * Detects price anomalies in recent data
 * @param {string|number} itemId - Item ID
 * @param {string} server - Server
 * @param {string} storeType - Store type
 * @returns {Object|null} Anomaly detection result
 */
function detectAnomalies(itemId, server, storeType) {
    const history = priceHistoryStorage.getItemHistory(itemId, server, storeType, 30);
    
    if (!history || !history.servers[server] || !history.servers[server][storeType]) {
        return null;
    }
    
    const priceData = history.servers[server][storeType];
    if (priceData.length < 7) {
        return { anomalies: [], message: 'Dados insuficientes para detecção de anomalias' };
    }
    
    const prices = priceData.map(d => d.avg);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const stdDev = standardDeviation(prices, mean);
    
    // Detect anomalies (prices more than 2 standard deviations from mean)
    const anomalies = [];
    for (const data of priceData) {
        const zScore = (data.avg - mean) / stdDev;
        if (Math.abs(zScore) > 2) {
            anomalies.push({
                date: data.date,
                price: data.avg,
                zScore: zScore.toFixed(2),
                type: zScore > 0 ? 'high' : 'low'
            });
        }
    }
    
    return {
        anomalies,
        statistics: {
            mean: Math.round(mean),
            stdDev: Math.round(stdDev)
        }
    };
}

/**
 * Gets trending items (items with significant price changes)
 * @param {number} [days=7] - Days to analyze
 * @param {number} [minChange=10] - Minimum percentage change to consider
 * @returns {Array} Array of trending items
 */
function getTrendingItems(days = 7, minChange = 10) {
    const historyData = priceHistoryStorage.loadHistory();
    const trending = [];
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffKey = cutoffDate.toISOString().split('T')[0];
    
    for (const [itemId, item] of Object.entries(historyData.items)) {
        for (const [server, serverData] of Object.entries(item.servers)) {
            for (const [storeType, typeData] of Object.entries(serverData)) {
                // Get data for the period
                const periodData = Object.entries(typeData)
                    .filter(([date]) => date >= cutoffKey)
                    .sort(([a], [b]) => a.localeCompare(b));
                
                if (periodData.length < 2) continue;
                
                const [oldestDate, oldestData] = periodData[0];
                const [latestDate, latestData] = periodData[periodData.length - 1];
                
                const oldPrice = oldestData.sum / oldestData.samples;
                const newPrice = latestData.sum / latestData.samples;
                const changePercent = ((newPrice - oldPrice) / oldPrice) * 100;
                
                if (Math.abs(changePercent) >= minChange) {
                    trending.push({
                        itemId,
                        name: item.name,
                        server,
                        storeType,
                        oldPrice: Math.round(oldPrice),
                        newPrice: Math.round(newPrice),
                        changePercent: changePercent.toFixed(1),
                        direction: changePercent > 0 ? 'up' : 'down',
                        samples: latestData.samples
                    });
                }
            }
        }
    }
    
    // Sort by absolute change
    trending.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    
    return trending.slice(0, 20);
}

module.exports = {
    analyzePriceLevel,
    analyzeItem,
    analyzePrice,
    detectAnomalies,
    getTrendingItems,
    PRICE_LEVELS
};
