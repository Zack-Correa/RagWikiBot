/**
 * Player Count Service
 * Monitors online player counts for Ragnarok Online LATAM servers
 * 
 * Strategies (in priority order):
 * 1. Login-based: Send login packet to get char server list with player counts
 *    (requires RO_PROBE_USERNAME and RO_PROBE_PASSWORD in .env)
 * 2. Port probing: Scan known/possible char server ports for responses
 * 3. Passive: Listen on login server connection for any initial data
 * 
 * Based on:
 * - RO Login Protocol (packets 0x0064, 0x0069)
 * - OpenKore server database
 * - SDxBacon/RagnarokOnlinePlayerMonitor
 */

const dns = require('dns');
const logger = require('../utils/logger');
const roProtocol = require('./roProtocol');
const fs = require('fs');
const path = require('path');

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
    // Account server (from OpenKore)
    accountServer: {
        host: 'lt-account-01.gnjoylatam.com',
        port: 6900
    },

    // OTP/Token server
    otpServer: {
        host: 'lt-account-01.gnjoylatam.com',
        port: 6951
    },

    // Known server names and IDs
    servers: {
        FREYA: { id: 3, index: 0 },
        NIDHOGG: { id: 4, index: 1 },
        YGGDRASIL: { id: 5, index: 2 }
    },

    // Confirmed open char server ports on GNJoy LATAM (discovered via probing)
    // All on lt-account-01.gnjoylatam.com
    discoveredPorts: {
        charServers: [6121, 6122, 6123, 6124, 6125, 6126, 6127, 6128, 6129, 6130],
        mapServers: [5121, 5122, 5123, 5124, 5125, 5126, 5127, 5128, 5129, 5130],
        accountServer: 6900,
        otpServer: 6951
    },

    // Possible char server hostnames to probe
    charServerHosts: [
        'lt-account-01.gnjoylatam.com',  // Confirmed: all services on this host
    ],

    // Char server ports to probe (confirmed open on GNJoy LATAM)
    charServerPorts: [6121, 6122, 6123, 6124, 6125, 6126, 6127, 6128, 6129, 6130],

    // Timing
    probeTimeoutMs: 5000,
    loginTimeoutMs: 8000,
    checkIntervalMs: 30 * 60 * 1000, // 30 minutes
    minCheckIntervalMs: 5 * 60 * 1000, // 5 minutes (rate limit)

    // Storage
    dataDir: path.join(__dirname, '..', 'data'),
    dataFile: 'player-count.json',
    historyLimit: 500, // Max history entries
};

// ============================================================
// State
// ============================================================

let intervalId = null;
let lastCheckTime = null;
let lastResult = null;
let discoveredCharServers = []; // Char servers found via login or probing

// ============================================================
// Storage
// ============================================================

function getDataFilePath() {
    return path.join(CONFIG.dataDir, CONFIG.dataFile);
}

function ensureDataDir() {
    if (!fs.existsSync(CONFIG.dataDir)) {
        fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    }
}

function loadData() {
    ensureDataDir();
    try {
        const filePath = getDataFilePath();
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        logger.error('Error loading player count data', { error: error.message });
    }

    return {
        lastCheck: null,
        lastSuccessfulCheck: null,
        servers: {},
        discoveredCharServers: [],
        history: [],
        probeResults: {}
    };
}

function saveData(data) {
    ensureDataDir();
    try {
        data.lastUpdated = new Date().toISOString();
        // Trim history
        if (data.history.length > CONFIG.historyLimit) {
            data.history = data.history.slice(0, CONFIG.historyLimit);
        }
        fs.writeFileSync(getDataFilePath(), JSON.stringify(data, null, 2));
    } catch (error) {
        logger.error('Error saving player count data', { error: error.message });
    }
}

// ============================================================
// Strategy 0: SSO Login with manual token (GNJoy LATAM)
// ============================================================

/**
 * Attempts to get player counts via SSO login with manual auth token
 * Requires RO_PROBE_USERNAME and RO_AUTH_TOKEN env vars
 * Token can be extracted from Wireshark capture of the game client
 * @returns {Promise<Object|null>} Server list with player counts, or null
 */
async function trySSOStrategy() {
    const username = process.env.RO_PROBE_USERNAME;
    const authToken = process.env.RO_AUTH_TOKEN;

    if (!username || !authToken) {
        logger.debug('SSO strategy skipped: RO_PROBE_USERNAME/RO_AUTH_TOKEN not set');
        return null;
    }

    logger.info('Attempting SSO login strategy (GNJoy LATAM) for player count...');

    try {
        // Get MAC address (use a consistent one or random)
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        let macAddress = '50-EB-F6-26-B7-EE'; // Default from capture
        for (const iface of Object.values(networkInterfaces)) {
            if (iface) {
                for (const addr of iface) {
                    if (addr.mac && addr.mac !== '00:00:00:00:00:00') {
                        macAddress = addr.mac.replace(/:/g, '-');
                        break;
                    }
                }
                if (macAddress !== '50-EB-F6-26-B7-EE') break;
            }
        }

        // Get local IP
        let ipAddress = '127.0.0.1';
        for (const iface of Object.values(networkInterfaces)) {
            if (iface) {
                for (const addr of iface) {
                    if (addr.family === 'IPv4' && !addr.internal) {
                        ipAddress = addr.address;
                        break;
                    }
                }
                if (ipAddress !== '127.0.0.1') break;
            }
        }

        const result = await roProtocol.attemptSSOLogin(
            CONFIG.accountServer.host,
            CONFIG.accountServer.port,
            username,
            authToken,
            macAddress,
            ipAddress,
            CONFIG.loginTimeoutMs
        );

        if (result.success && result.servers) {
            logger.info('SSO strategy succeeded', {
                serverCount: result.servers.length,
                servers: result.servers.map(s => ({ name: s.name, players: s.playerCount }))
            });

            // Save discovered char servers
            discoveredCharServers = result.servers.map(s => ({
                name: s.name,
                ip: s.ip || s.url?.split(':')[0] || '',
                port: s.port,
                discoveredAt: new Date().toISOString()
            }));

            return {
                strategy: 'sso',
                timestamp: new Date().toISOString(),
                responseTime: result.responseTime,
                servers: result.servers.map(s => ({
                    name: s.name,
                    playerCount: s.playerCount || s.userCount || 0,
                    ip: s.ip || s.url?.split(':')[0] || '',
                    port: s.port,
                    url: s.url,
                    serverType: s.serverType || 0,
                    serverIndex: s.serverIndex || 0
                }))
            };
        }

        if (result.type === 'server_notification') {
            logger.warn('SSO strategy: server notification', {
                errorCode: result.errorCode,
                reason: result.reason
            });
            // Error 8 = already logged in, but token format is correct!
            if (result.errorCode === 8) {
                logger.info('Token format is valid! Account is just already logged in.');
            }
        } else if (result.type === 'login_refused') {
            logger.warn('SSO strategy: login refused', {
                errorCode: result.errorCode,
                reason: result.reason
            });
        } else {
            logger.warn('SSO strategy failed', {
                type: result.type,
                error: result.error
            });
        }

        return null;
    } catch (error) {
        logger.error('SSO strategy error', { error: error.message });
        return null;
    }
}

// ============================================================
// Strategy 1: Login-based (standard RO protocol)
// ============================================================

/**
 * Attempts to get player counts via login packet
 * Requires RO_PROBE_USERNAME and RO_PROBE_PASSWORD env vars
 * @returns {Promise<Object|null>} Server list with player counts, or null
 */
async function tryLoginStrategy() {
    const username = process.env.RO_PROBE_USERNAME;
    const password = process.env.RO_PROBE_PASSWORD;

    if (!username || !password) {
        logger.debug('Login strategy skipped: RO_PROBE_USERNAME/RO_PROBE_PASSWORD not set');
        return null;
    }

    logger.info('Attempting login strategy for player count...');

    try {
        const result = await roProtocol.attemptLogin(
            CONFIG.accountServer.host,
            CONFIG.accountServer.port,
            username,
            password,
            CONFIG.loginTimeoutMs
        );

        if (result.success && result.servers) {
            logger.info('Login strategy succeeded', {
                serverCount: result.servers.length,
                servers: result.servers.map(s => ({ name: s.name, players: s.userCount }))
            });

            // Save discovered char servers
            discoveredCharServers = result.servers.map(s => ({
                name: s.name,
                ip: s.ip,
                port: s.port,
                discoveredAt: new Date().toISOString()
            }));

            return {
                strategy: 'login',
                timestamp: new Date().toISOString(),
                responseTime: result.responseTime,
                servers: result.servers.map(s => ({
                    name: s.name,
                    playerCount: s.userCount,
                    ip: s.ip,
                    port: s.port,
                    serverType: s.serverType,
                    serverIndex: s.serverIndex
                }))
            };
        }

        if (result.type === 'login_refused') {
            logger.warn('Login strategy: login refused', {
                errorCode: result.errorCode,
                reason: result.reason
            });
        } else {
            logger.warn('Login strategy failed', {
                type: result.type,
                error: result.error
            });
        }

        return null;
    } catch (error) {
        logger.error('Login strategy error', { error: error.message });
        return null;
    }
}

// ============================================================
// Strategy 2: Port probing
// ============================================================

/**
 * Resolves hostname to IPs for probing
 * @param {string} hostname
 * @returns {Promise<string[]>}
 */
function resolveHost(hostname) {
    return new Promise((resolve) => {
        dns.resolve4(hostname, (err, addresses) => {
            if (err) {
                resolve([]);
            } else {
                resolve(addresses);
            }
        });
    });
}

/**
 * Probes known/possible char server ports for any response data
 * @returns {Promise<Object>} Probe results
 */
async function tryProbeStrategy() {
    logger.info('Attempting port probe strategy...');
    const results = { hosts: {}, openPorts: [], responses: [] };

    // First, resolve all hostnames
    const hostsToProbe = new Map();

    for (const hostname of CONFIG.charServerHosts) {
        const ips = await resolveHost(hostname);
        if (ips.length > 0) {
            hostsToProbe.set(hostname, ips[0]);
            results.hosts[hostname] = ips[0];
            logger.debug(`Resolved ${hostname} -> ${ips[0]}`);
        } else {
            logger.debug(`Could not resolve ${hostname}`);
        }
    }

    if (hostsToProbe.size === 0) {
        logger.warn('No hosts resolved for probing');
        return results;
    }

    // Deduplicate IPs
    const uniqueIPs = [...new Set(hostsToProbe.values())];

    // Probe each unique IP on each port (parallel per IP, sequential per port group)
    for (const ip of uniqueIPs) {
        const hostname = [...hostsToProbe.entries()].find(([_, v]) => v === ip)?.[0] || ip;
        logger.info(`Probing ${hostname} (${ip}) on ${CONFIG.charServerPorts.length} ports...`);

        // Probe ports in parallel batches of 5
        for (let i = 0; i < CONFIG.charServerPorts.length; i += 5) {
            const batch = CONFIG.charServerPorts.slice(i, i + 5);
            const probePromises = batch.map(port =>
                roProtocol.probePort(ip, port, CONFIG.probeTimeoutMs)
            );

            const probeResults = await Promise.all(probePromises);

            for (const result of probeResults) {
                if (result.open) {
                    results.openPorts.push({
                        host: hostname,
                        ip,
                        port: result.port,
                        connectTime: result.connectTime,
                        receivedBytes: result.receivedBytes
                    });

                    logger.info(`Port ${result.port} OPEN on ${hostname}`, {
                        connectTime: result.connectTime,
                        receivedBytes: result.receivedBytes,
                        packetInfo: result.packetInfo
                    });

                    // If we got data, try to parse it
                    if (result.receivedData) {
                        results.responses.push({
                            host: hostname,
                            ip,
                            port: result.port,
                            data: result.receivedData.toString('hex'),
                            packetInfo: result.packetInfo
                        });
                    }

                    // Also try sending a ping packet to open ports
                    const pingResult = await roProtocol.sendPacket(
                        ip, result.port,
                        roProtocol.buildPingPacket(0),
                        CONFIG.probeTimeoutMs
                    );

                    if (pingResult.success && pingResult.receivedData) {
                        logger.info(`Got ping response from ${hostname}:${result.port}`, {
                            bytes: pingResult.receivedBytes,
                            packetInfo: pingResult.packetInfo
                        });
                        results.responses.push({
                            host: hostname,
                            ip,
                            port: result.port,
                            type: 'ping_response',
                            data: pingResult.receivedData.toString('hex'),
                            packetInfo: pingResult.packetInfo
                        });
                    }
                }
            }
        }
    }

    // Also probe the account server itself for initial data
    logger.info('Probing account server for initial data...');
    const accountProbe = await roProtocol.probePort(
        CONFIG.accountServer.host,
        CONFIG.accountServer.port,
        CONFIG.probeTimeoutMs
    );

    if (accountProbe.open && accountProbe.receivedData) {
        logger.info('Account server sent initial data!', {
            bytes: accountProbe.receivedBytes,
            packetInfo: accountProbe.packetInfo
        });
        results.responses.push({
            host: CONFIG.accountServer.host,
            port: CONFIG.accountServer.port,
            type: 'account_server_initial',
            data: accountProbe.receivedData.toString('hex'),
            packetInfo: accountProbe.packetInfo
        });
    }

    logger.info('Port probe complete', {
        hostsResolved: hostsToProbe.size,
        openPorts: results.openPorts.length,
        responses: results.responses.length
    });

    return results;
}

// ============================================================
// Main Check Function
// ============================================================

/**
 * Performs a full player count check using all available strategies
 * @param {boolean} [force=false] - Force check even if rate limited
 * @returns {Promise<Object>} Check result
 */
async function checkPlayerCount(force = false) {
    // Rate limiting
    if (!force && lastCheckTime) {
        const elapsed = Date.now() - lastCheckTime;
        if (elapsed < CONFIG.minCheckIntervalMs) {
            logger.debug('Player count check rate limited', {
                elapsedMs: elapsed,
                minIntervalMs: CONFIG.minCheckIntervalMs
            });
            return lastResult;
        }
    }

    logger.info('Starting player count check...');
    const checkStart = Date.now();
    lastCheckTime = Date.now();

    const data = loadData();
    const checkResult = {
        timestamp: new Date().toISOString(),
        strategy: null,
        success: false,
        servers: [],
        probeResults: null,
        error: null
    };

    // Strategy 0: SSO Login with manual token (GNJoy LATAM - highest priority)
    const ssoResult = await trySSOStrategy();
    
    // Strategy 1: Login-based (standard RO protocol - fallback)
    const loginResult = ssoResult ? null : await tryLoginStrategy();
    
    // Use SSO result if available, otherwise fallback to standard login
    const authResult = ssoResult || loginResult;
    if (authResult) {
        checkResult.strategy = authResult.strategy;
        checkResult.success = true;
        checkResult.servers = authResult.servers;
        checkResult.responseTime = authResult.responseTime;

        // Update stored data
        data.lastSuccessfulCheck = checkResult.timestamp;
        data.discoveredCharServers = discoveredCharServers;

        // Map to server names
        for (const server of authResult.servers) {
            const serverKey = mapServerName(server.name);
            if (serverKey) {
                data.servers[serverKey] = {
                    name: server.name,
                    playerCount: server.playerCount,
                    lastUpdated: checkResult.timestamp,
                    ip: server.ip,
                    port: server.port
                };
            }
        }

        // Add to history
        data.history.unshift({
            timestamp: checkResult.timestamp,
            strategy: authResult.strategy,
            servers: authResult.servers.map(s => ({
                name: s.name,
                playerCount: s.playerCount
            })),
            totalPlayers: authResult.servers.reduce((sum, s) => sum + (s.playerCount || 0), 0)
        });
    }

    // Strategy 2: Port probing (if login didn't work or for discovery)
    if (!loginResult) {
        const probeResult = await tryProbeStrategy();
        checkResult.probeResults = {
            hostsResolved: Object.keys(probeResult.hosts).length,
            openPorts: probeResult.openPorts.length,
            responses: probeResult.responses.length,
            details: probeResult
        };

        // Save probe data for analysis
        data.probeResults = {
            lastProbe: checkResult.timestamp,
            hosts: probeResult.hosts,
            openPorts: probeResult.openPorts,
            responses: probeResult.responses.map(r => ({
                host: r.host,
                port: r.port,
                type: r.type,
                packetInfo: r.packetInfo,
                dataPreview: r.data?.substring(0, 128)
            }))
        };

        // If we found char servers with player count data in probes, extract it
        for (const response of probeResult.responses) {
            if (response.packetInfo?.identified && response.data) {
                const rawData = Buffer.from(response.data, 'hex');
                const parsed = roProtocol.parseLoginAccepted(rawData);
                if (parsed?.servers) {
                    checkResult.strategy = 'probe';
                    checkResult.success = true;
                    checkResult.servers = parsed.servers.map(s => ({
                        name: s.name,
                        playerCount: s.userCount,
                        ip: s.ip,
                        port: s.port
                    }));
                    break;
                }
            }
        }

        if (!checkResult.success && probeResult.openPorts.length > 0) {
            // We found open ports but couldn't extract player counts
            checkResult.strategy = 'probe';
            checkResult.error = 'Found open char server ports but could not extract player counts';
            checkResult.openPorts = probeResult.openPorts;
        }
    }

    data.lastCheck = checkResult.timestamp;
    checkResult.elapsed = Date.now() - checkStart;
    saveData(data);

    lastResult = checkResult;

    logger.info('Player count check complete', {
        strategy: checkResult.strategy,
        success: checkResult.success,
        elapsed: checkResult.elapsed,
        serverCount: checkResult.servers?.length || 0
    });

    return checkResult;
}

/**
 * Maps a char server name to our known server names
 * @param {string} name - Char server name from packet
 * @returns {string|null} Matched server key
 */
function mapServerName(name) {
    if (!name) return null;
    const normalized = name.toUpperCase().trim();

    for (const [key] of Object.entries(CONFIG.servers)) {
        if (normalized.includes(key)) {
            return key;
        }
    }

    // Fuzzy match
    if (normalized.includes('FREY') || normalized.includes('FRE')) return 'FREYA';
    if (normalized.includes('NIDH') || normalized.includes('NID')) return 'NIDHOGG';
    if (normalized.includes('YGGD') || normalized.includes('YGG')) return 'YGGDRASIL';

    return null;
}

// ============================================================
// Service Lifecycle
// ============================================================

/**
 * Starts the player count monitoring service
 * @param {Object} [options] - Configuration overrides
 */
function start(options = {}) {
    if (intervalId) {
        logger.warn('Player count service already running');
        return;
    }

    if (options.checkIntervalMs) {
        CONFIG.checkIntervalMs = options.checkIntervalMs;
    }

    // First check after 2 minutes (give bot time to start)
    setTimeout(() => {
        checkPlayerCount(true).catch(err => {
            logger.error('Initial player count check failed', { error: err.message });
        });
    }, 2 * 60 * 1000);

    // Periodic checks
    intervalId = setInterval(() => {
        checkPlayerCount(true).catch(err => {
            logger.error('Periodic player count check failed', { error: err.message });
        });
    }, CONFIG.checkIntervalMs);

    logger.info('Player count service started', {
        intervalMinutes: CONFIG.checkIntervalMs / (60 * 1000),
        loginStrategy: !!(process.env.RO_PROBE_USERNAME && process.env.RO_PROBE_PASSWORD)
    });
}

/**
 * Stops the monitoring service
 */
function stop() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info('Player count service stopped');
    }
}

/**
 * Forces an immediate check
 * @returns {Promise<Object>}
 */
async function forceCheck() {
    return await checkPlayerCount(true);
}

/**
 * Gets the latest player count data
 * @returns {Object} Current data
 */
function getPlayerCounts() {
    const data = loadData();
    return {
        running: !!intervalId,
        lastCheck: data.lastCheck,
        lastSuccessfulCheck: data.lastSuccessfulCheck,
        servers: data.servers,
        discoveredCharServers: data.discoveredCharServers || [],
        cachedResult: lastResult
    };
}

/**
 * Gets player count history
 * @param {number} [limit=50]
 * @returns {Array}
 */
function getHistory(limit = 50) {
    const data = loadData();
    return data.history.slice(0, limit);
}

/**
 * Gets probe/diagnostic data
 * @returns {Object}
 */
function getDiagnostics() {
    const data = loadData();
    return {
        config: {
            accountServer: CONFIG.accountServer,
            charServerHosts: CONFIG.charServerHosts,
            charServerPorts: CONFIG.charServerPorts,
            checkIntervalMs: CONFIG.checkIntervalMs,
            loginStrategyEnabled: !!(process.env.RO_PROBE_USERNAME && process.env.RO_PROBE_PASSWORD),
        ssoStrategyEnabled: !!(process.env.RO_PROBE_USERNAME && process.env.RO_AUTH_TOKEN)
        },
        probeResults: data.probeResults || {},
        discoveredCharServers: data.discoveredCharServers || [],
        lastCheck: data.lastCheck,
        historyCount: data.history?.length || 0
    };
}

module.exports = {
    start,
    stop,
    forceCheck,
    checkPlayerCount,
    getPlayerCounts,
    getHistory,
    getDiagnostics,
    // For testing
    tryLoginStrategy,
    tryProbeStrategy
};
