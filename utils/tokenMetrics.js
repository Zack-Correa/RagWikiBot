/**
 * Token Metrics Store
 * Tracks SSO token lifecycle: capture, usage, expiration.
 *
 * Schema (data/token-metrics.json):
 * {
 *   current: {
 *     token: "first8chars...",      // truncated for security
 *     capturedAt: ISO,              // when the proxy captured it
 *     username: "user@example.com",
 *     lastUsedAt: ISO,              // last successful SSO login
 *     lastFailedAt: ISO | null,     // first failure after capture
 *     useCount: number,             // successful uses since capture
 *     failCount: number,            // failed uses since capture
 *     status: "active" | "expired" | "unknown",
 *     estimatedTTLms: number | null // lastFailedAt - capturedAt
 *   },
 *   history: [
 *     {
 *       token: "first8chars...",
 *       capturedAt: ISO,
 *       expiredAt: ISO | null,
 *       ttlMs: number | null,       // actual measured TTL
 *       ttlHuman: "Xh Ym",
 *       useCount: number,
 *       failCount: number,
 *       username: string
 *     }
 *   ],
 *   stats: {
 *     totalTokens: number,
 *     avgTTLms: number | null,
 *     minTTLms: number | null,
 *     maxTTLms: number | null,
 *     lastUpdated: ISO
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'token-metrics.json');
const HISTORY_LIMIT = 200;

// ============================================================
// Helpers
// ============================================================

function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function truncateToken(token) {
    if (!token) return '?';
    return token.substring(0, 8) + '...';
}

function msToHuman(ms) {
    if (ms == null) return null;
    const totalMin = Math.floor(ms / 60000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function getDefault() {
    return {
        current: null,
        history: [],
        stats: {
            totalTokens: 0,
            avgTTLms: null,
            minTTLms: null,
            maxTTLms: null,
            lastUpdated: null
        }
    };
}

function load() {
    ensureDir();
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (err) {
        logger.error('Error loading token metrics', { error: err.message });
    }
    return getDefault();
}

function save(data) {
    ensureDir();
    try {
        data.stats.lastUpdated = new Date().toISOString();
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        logger.error('Error saving token metrics', { error: err.message });
    }
}

function recomputeStats(data) {
    const ttls = data.history
        .map(h => h.ttlMs)
        .filter(t => t != null && t > 0);

    data.stats.totalTokens = data.history.length + (data.current ? 1 : 0);

    if (ttls.length > 0) {
        data.stats.avgTTLms = Math.round(ttls.reduce((a, b) => a + b, 0) / ttls.length);
        data.stats.minTTLms = Math.min(...ttls);
        data.stats.maxTTLms = Math.max(...ttls);
    }
}

// ============================================================
// Public API
// ============================================================

/**
 * Records a new token capture from the proxy.
 * If there's a current token, archives it to history first.
 */
function recordCapture(token, username) {
    const data = load();
    const now = new Date().toISOString();

    // Archive previous token if exists
    if (data.current) {
        archiveCurrent(data);
    }

    data.current = {
        token: truncateToken(token),
        capturedAt: now,
        username: username || null,
        lastUsedAt: null,
        lastFailedAt: null,
        useCount: 0,
        failCount: 0,
        status: 'active',
        estimatedTTLms: null
    };

    recomputeStats(data);
    save(data);

    logger.info('[TokenMetrics] New token captured', {
        token: truncateToken(token),
        username
    });
}

/**
 * Records a successful SSO login using the current token.
 */
function recordSuccess(source = 'sso_login') {
    const data = load();
    if (!data.current) return;

    const now = new Date().toISOString();
    data.current.lastUsedAt = now;
    data.current.useCount++;
    data.current.status = 'active';

    save(data);

    logger.debug('[TokenMetrics] Token use SUCCESS', {
        token: data.current.token,
        useCount: data.current.useCount,
        source
    });
}

/**
 * Records a failed SSO login (likely token expired or invalid).
 * @param {string} reason - e.g. "login_refused", "timeout", error message
 * @param {number} [errorCode] - RO refuse error code if available
 */
function recordFailure(reason, errorCode = null) {
    const data = load();
    if (!data.current) return;

    const now = new Date().toISOString();

    // Only set lastFailedAt on the first failure (marks expiration point)
    if (!data.current.lastFailedAt) {
        data.current.lastFailedAt = now;
        data.current.estimatedTTLms =
            new Date(now).getTime() - new Date(data.current.capturedAt).getTime();
        data.current.status = 'expired';

        logger.warn('[TokenMetrics] Token EXPIRED', {
            token: data.current.token,
            ttl: msToHuman(data.current.estimatedTTLms),
            ttlMs: data.current.estimatedTTLms,
            reason,
            errorCode,
            capturedAt: data.current.capturedAt,
            useCount: data.current.useCount
        });
    }

    data.current.failCount++;
    save(data);
}

/**
 * Archives the current token into history.
 */
function archiveCurrent(data) {
    if (!data.current) return;

    const cur = data.current;
    const ttlMs = cur.estimatedTTLms || (
        cur.lastUsedAt
            ? new Date(cur.lastUsedAt).getTime() - new Date(cur.capturedAt).getTime()
            : null
    );

    data.history.unshift({
        token: cur.token,
        capturedAt: cur.capturedAt,
        expiredAt: cur.lastFailedAt || null,
        ttlMs,
        ttlHuman: msToHuman(ttlMs),
        useCount: cur.useCount,
        failCount: cur.failCount,
        username: cur.username
    });

    // Trim
    if (data.history.length > HISTORY_LIMIT) {
        data.history = data.history.slice(0, HISTORY_LIMIT);
    }

    data.current = null;
}

/**
 * Returns the current token status.
 */
function getCurrent() {
    const data = load();
    if (!data.current) return null;

    const cur = data.current;
    const age = Date.now() - new Date(cur.capturedAt).getTime();

    return {
        ...cur,
        ageMs: age,
        ageHuman: msToHuman(age),
        ttlHuman: msToHuman(cur.estimatedTTLms)
    };
}

/**
 * Returns token history.
 */
function getHistory(limit = 20) {
    const data = load();
    return data.history.slice(0, limit);
}

/**
 * Returns aggregate stats about token TTLs.
 */
function getStats() {
    const data = load();
    recomputeStats(data);
    return {
        ...data.stats,
        avgTTLhuman: msToHuman(data.stats.avgTTLms),
        minTTLhuman: msToHuman(data.stats.minTTLms),
        maxTTLhuman: msToHuman(data.stats.maxTTLms),
        currentToken: getCurrent()
    };
}

/**
 * Returns the full raw data for export.
 */
function getRawData() {
    return load();
}

module.exports = {
    recordCapture,
    recordSuccess,
    recordFailure,
    getCurrent,
    getHistory,
    getStats,
    getRawData
};
