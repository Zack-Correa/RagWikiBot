/**
 * Player Count Store
 * Persistent JSON storage for player count data captured by the proxy.
 * 
 * Schema (data/player-counts.json):
 * {
 *   latest: { timestamp, servers[], totalPlayers, source },
 *   history: [ { t, FREYA, NIDHOGG, YGGDRASIL, total } ],
 *   daily: { "YYYY-MM-DD": { captures, avgTotal, peak, low } },
 *   stats: { firstCapture, totalCaptures, peak, peakByServer }
 * }
 * 
 * Write: called by the token-capture proxy when a server list is captured.
 * Read:  called by /players command and admin dashboard.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'player-counts.json');

// Keep up to 90 days of history entries
const HISTORY_LIMIT = 10000;
const DAILY_RETENTION_DAYS = 90;

// ============================================================
// Internal helpers
// ============================================================

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function getDefaultData() {
    return {
        latest: null,
        history: [],
        daily: {},
        stats: {
            firstCapture: null,
            totalCaptures: 0,
            peak: null,        // { total, timestamp, servers }
            peakByServer: {}   // { FREYA: { count, timestamp }, ... }
        },
        lastUpdated: null
    };
}

function getDateKey(ts) {
    return new Date(ts).toISOString().split('T')[0];
}

function mapServerName(name) {
    if (!name) return null;
    const n = name.toUpperCase().trim();
    if (n.includes('FREY') || n.includes('FRE')) return 'FREYA';
    if (n.includes('NIDH') || n.includes('NID')) return 'NIDHOGG';
    if (n.includes('YGGD') || n.includes('YGG')) return 'YGGDRASIL';
    return null;
}

// ============================================================
// Load / Save
// ============================================================

function load() {
    ensureDataDir();
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (error) {
        logger.error('playerCountStore: error loading data', { error: error.message });
    }
    return getDefaultData();
}

function save(data) {
    ensureDataDir();
    try {
        data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        logger.error('playerCountStore: error saving data', { error: error.message });
    }
}

// ============================================================
// Write — called by proxy
// ============================================================

/**
 * Records a new player count snapshot captured by the proxy.
 * @param {Array<{name: string, playerCount: number, ip?: string, port?: number}>} servers
 * @param {string} [source='proxy_capture'] - Who wrote the data
 */
function record(servers, source = 'proxy_capture') {
    const data = load();
    const now = new Date().toISOString();
    const dateKey = getDateKey(now);

    // — Build normalized server list —
    const normalized = [];
    const historyEntry = { t: now };
    let totalPlayers = 0;

    for (const srv of servers) {
        const key = mapServerName(srv.name);
        if (!key) continue;

        const count = srv.playerCount || 0;
        normalized.push({
            name: srv.name,
            key,
            playerCount: count,
            ip: srv.ip || '',
            port: srv.port || 0
        });
        historyEntry[key] = count;
        totalPlayers += count;
    }

    if (normalized.length === 0) {
        logger.warn('playerCountStore: no valid servers to record');
        return;
    }

    historyEntry.total = totalPlayers;

    // — Update latest —
    data.latest = {
        timestamp: now,
        servers: normalized,
        totalPlayers,
        source
    };

    // — Append to history —
    data.history.unshift(historyEntry);
    if (data.history.length > HISTORY_LIMIT) {
        data.history = data.history.slice(0, HISTORY_LIMIT);
    }

    // — Update daily aggregates —
    if (!data.daily[dateKey]) {
        data.daily[dateKey] = {
            captures: 0,
            totalSum: 0,
            avgTotal: 0,
            peak: { total: 0, timestamp: null },
            low: { total: Infinity, timestamp: null },
            byServer: {}
        };
    }

    const day = data.daily[dateKey];
    day.captures++;
    day.totalSum = (day.totalSum || 0) + totalPlayers;
    day.avgTotal = Math.round(day.totalSum / day.captures);

    if (totalPlayers > (day.peak?.total || 0)) {
        day.peak = { total: totalPlayers, timestamp: now };
    }
    if (totalPlayers < (day.low?.total ?? Infinity)) {
        day.low = { total: totalPlayers, timestamp: now };
    }

    for (const srv of normalized) {
        if (!day.byServer[srv.key]) {
            day.byServer[srv.key] = { sum: 0, count: 0, peak: 0 };
        }
        const ds = day.byServer[srv.key];
        ds.sum += srv.playerCount;
        ds.count++;
        if (srv.playerCount > ds.peak) ds.peak = srv.playerCount;
    }

    // — Update global stats —
    if (!data.stats) data.stats = getDefaultData().stats;
    if (!data.stats.firstCapture) data.stats.firstCapture = now;
    data.stats.totalCaptures = (data.stats.totalCaptures || 0) + 1;

    if (!data.stats.peak || totalPlayers > data.stats.peak.total) {
        data.stats.peak = {
            total: totalPlayers,
            timestamp: now,
            servers: Object.fromEntries(normalized.map(s => [s.key, s.playerCount]))
        };
    }

    if (!data.stats.peakByServer) data.stats.peakByServer = {};
    for (const srv of normalized) {
        const prev = data.stats.peakByServer[srv.key];
        if (!prev || srv.playerCount > prev.count) {
            data.stats.peakByServer[srv.key] = {
                count: srv.playerCount,
                timestamp: now
            };
        }
    }

    // — Cleanup old daily data —
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DAILY_RETENTION_DAYS);
    const cutoffKey = cutoff.toISOString().split('T')[0];
    for (const key of Object.keys(data.daily)) {
        if (key < cutoffKey) delete data.daily[key];
    }

    save(data);

    logger.info('playerCountStore: recorded snapshot', {
        total: totalPlayers,
        servers: normalized.map(s => `${s.key}: ${s.playerCount}`),
        source
    });
}

// ============================================================
// Read — called by commands / dashboard
// ============================================================

/**
 * Returns the most recent player count data.
 * @returns {{ timestamp, servers[], totalPlayers, source } | null}
 */
function getLatest() {
    const data = load();
    return data.latest || null;
}

/**
 * Returns the full raw data (for API / export).
 * @returns {Object}
 */
function getRawData() {
    return load();
}

/**
 * Returns history entries within a time range.
 * @param {number} [hours=24] - How many hours back
 * @returns {Array<{ t, FREYA, NIDHOGG, YGGDRASIL, total }>}
 */
function getHistory(hours = 24) {
    const data = load();
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    return data.history.filter(h => h.t >= cutoff);
}

/**
 * Returns daily aggregates for a given range.
 * @param {number} [days=7] - Number of days
 * @returns {Object} Map of date -> { captures, avgTotal, peak, low, byServer }
 */
function getDailyStats(days = 7) {
    const data = load();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffKey = cutoff.toISOString().split('T')[0];

    const result = {};
    for (const [date, dayData] of Object.entries(data.daily || {})) {
        if (date >= cutoffKey) {
            result[date] = {
                captures: dayData.captures,
                avgTotal: dayData.avgTotal,
                peak: dayData.peak,
                low: dayData.low,
                byServer: dayData.byServer
            };
        }
    }
    return result;
}

/**
 * Returns global stats (peaks, first capture, total captures).
 * @returns {Object}
 */
function getStats() {
    const data = load();
    return data.stats || getDefaultData().stats;
}

/**
 * Checks if we have recent data (within maxAge ms).
 * @param {number} [maxAgeMs=7200000] - Default 2 hours
 * @returns {boolean}
 */
function hasRecentData(maxAgeMs = 2 * 60 * 60 * 1000) {
    const latest = getLatest();
    if (!latest) return false;
    return (Date.now() - new Date(latest.timestamp).getTime()) < maxAgeMs;
}

module.exports = {
    // Write
    record,

    // Read
    getLatest,
    getRawData,
    getHistory,
    getDailyStats,
    getStats,
    hasRecentData,

    // Internal (for testing)
    _load: load,
    _save: save,
    _mapServerName: mapServerName
};
