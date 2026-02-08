/**
 * Player Count Service
 * Thin wrapper around playerCountStore for background monitoring.
 * 
 * The main data source is the token-capture proxy, which writes
 * directly to the store on every game login. This service adds:
 *   - Periodic background checks via SSO re-login (if token still valid)
 *   - Standard login fallback (if password configured)
 * 
 * For reading data, use playerCountStore directly.
 */

const dns = require('dns');
const logger = require('../utils/logger');
const roProtocol = require('./roProtocol');
const playerCountStore = require('../utils/playerCountStore');

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
    accountServer: {
        host: 'lt-account-01.gnjoylatam.com',
        port: 6900
    },

    loginTimeoutMs: 8000,
    checkIntervalMs: 30 * 60 * 1000,     // 30 minutes
    minCheckIntervalMs: 5 * 60 * 1000,   // 5 minutes (rate limit)
};

// ============================================================
// State
// ============================================================

let intervalId = null;
let lastCheckTime = null;

// ============================================================
// Background check strategies
// ============================================================

/**
 * Attempts SSO login to refresh player counts.
 * Only works if RO_PROBE_USERNAME + RO_AUTH_TOKEN are set and token is still valid.
 */
async function trySSOStrategy() {
    const username = process.env.RO_PROBE_USERNAME;
    const authToken = process.env.RO_AUTH_TOKEN;

    if (!username || !authToken) {
        logger.debug('SSO strategy skipped: RO_PROBE_USERNAME or RO_AUTH_TOKEN not set');
        return null;
    }

    logger.info('Attempting SSO login strategy for player count...');

    try {
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        let macAddress = '50-EB-F6-26-B7-EE';
        let ipAddress = '127.0.0.1';

        for (const iface of Object.values(networkInterfaces)) {
            if (iface) {
                for (const addr of iface) {
                    if (addr.mac && addr.mac !== '00:00:00:00:00:00' && macAddress === '50-EB-F6-26-B7-EE') {
                        macAddress = addr.mac.replace(/:/g, '-');
                    }
                    if (addr.family === 'IPv4' && !addr.internal && ipAddress === '127.0.0.1') {
                        ipAddress = addr.address;
                    }
                }
            }
        }

        const result = await roProtocol.attemptSSOLogin(
            CONFIG.accountServer.host,
            CONFIG.accountServer.port,
            username, authToken, macAddress, ipAddress,
            CONFIG.loginTimeoutMs
        );

        if (result.success && result.servers) {
            logger.info('SSO strategy succeeded', {
                servers: result.servers.map(s => ({ name: s.name, players: s.playerCount }))
            });

            // Write to the store
            playerCountStore.record(result.servers, 'sso_login');
            return true;
        }

        if (result.type === 'login_refused') {
            logger.warn('SSO strategy: login refused', { errorCode: result.errorCode });
        } else if (result.error === 'timeout') {
            logger.warn('SSO strategy: timeout');
        } else {
            logger.warn('SSO strategy failed', { type: result.type, error: result.error });
        }

        return null;
    } catch (error) {
        logger.error('SSO strategy error', { error: error.message });
        return null;
    }
}

/**
 * Attempts standard login to refresh player counts.
 * Only works if RO_PROBE_USERNAME + RO_PROBE_PASSWORD are set.
 */
async function tryLoginStrategy() {
    const username = process.env.RO_PROBE_USERNAME;
    const password = process.env.RO_PROBE_PASSWORD;

    if (!username || !password) {
        logger.debug('Login strategy skipped: credentials not set');
        return null;
    }

    logger.info('Attempting login strategy for player count...');

    try {
        const result = await roProtocol.attemptLogin(
            CONFIG.accountServer.host,
            CONFIG.accountServer.port,
            username, password,
            CONFIG.loginTimeoutMs
        );

        if (result.success && result.servers) {
            logger.info('Login strategy succeeded', {
                servers: result.servers.map(s => ({ name: s.name, players: s.userCount }))
            });

            // Normalize and write to the store
            const normalized = result.servers.map(s => ({
                name: s.name,
                playerCount: s.userCount,
                ip: s.ip,
                port: s.port
            }));
            playerCountStore.record(normalized, 'login');
            return true;
        }

        logger.warn('Login strategy failed', { type: result.type, error: result.error });
        return null;
    } catch (error) {
        logger.error('Login strategy error', { error: error.message });
        return null;
    }
}

// ============================================================
// Background check
// ============================================================

/**
 * Runs a background check if data is stale.
 * Tries SSO first, then standard login.
 */
async function backgroundCheck() {
    // Skip if we already have recent data from the proxy
    if (playerCountStore.hasRecentData(30 * 60 * 1000)) { // 30 min
        logger.debug('Background check skipped: store has recent data');
        return;
    }

    logger.info('Background check: store data is stale, attempting refresh...');

    const sso = await trySSOStrategy();
    if (sso) return;

    await tryLoginStrategy();
}

// ============================================================
// Service Lifecycle
// ============================================================

function start(options = {}) {
    if (intervalId) {
        logger.warn('Player count service already running');
        return;
    }

    if (options.checkIntervalMs) {
        CONFIG.checkIntervalMs = options.checkIntervalMs;
    }

    // First check after 2 minutes
    setTimeout(() => {
        backgroundCheck().catch(err => {
            logger.error('Initial player count check failed', { error: err.message });
        });
    }, 2 * 60 * 1000);

    // Periodic checks
    intervalId = setInterval(() => {
        backgroundCheck().catch(err => {
            logger.error('Periodic player count check failed', { error: err.message });
        });
    }, CONFIG.checkIntervalMs);

    logger.info('Player count service started', {
        intervalMinutes: CONFIG.checkIntervalMs / 60000
    });
}

function stop() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info('Player count service stopped');
    }
}

/**
 * Forces an immediate background check.
 */
async function forceCheck() {
    lastCheckTime = Date.now();
    await backgroundCheck();
    return playerCountStore.getLatest();
}

// ============================================================
// Read helpers (delegate to store)
// ============================================================

function getPlayerCounts() {
    return playerCountStore.getLatest();
}

function getHistory(limit = 50) {
    return playerCountStore.getHistory(limit);
}

function getDiagnostics() {
    return {
        running: !!intervalId,
        lastCheckTime,
        store: playerCountStore.getStats(),
        hasRecentData: playerCountStore.hasRecentData()
    };
}

module.exports = {
    start,
    stop,
    forceCheck,
    getPlayerCounts,
    getHistory,
    getDiagnostics
};
