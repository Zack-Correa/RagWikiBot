/**
 * Server Status Service
 * Monitors Ragnarok Online LATAM server availability via TCP probes.
 * 
 * Probes each char server individually (lt-world-1/2/3) plus the
 * account server, every 5 minutes.
 */

const net = require('net');
const logger = require('../utils/logger');
const serverStatusStorage = require('../utils/serverStatusStorage');

// ============================================================
// Server endpoints (discovered via 0x0C32 login response)
// ============================================================

const SERVERS = {
    FREYA: {
        name: 'Freya',
        host: 'lt-world-1.gnjoylatam.com',
        port: 4500,
        emoji: '⚔️'
    },
    NIDHOGG: {
        name: 'Nidhogg',
        host: 'lt-world-2.gnjoylatam.com',
        port: 4500,
        emoji: '🐉'
    },
    YGGDRASIL: {
        name: 'Yggdrasil',
        host: 'lt-world-3.gnjoylatam.com',
        port: 4500,
        emoji: '🌳'
    },
    ACCOUNT: {
        name: 'Account Server',
        host: 'lt-account-01.gnjoylatam.com',
        port: 6900,
        emoji: '🔐'
    }
};

const CHECK_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes
const TCP_TIMEOUT_MS = 10000;              // 10 seconds

let intervalId = null;
let discordClient = null;
let notificationChannelId = null;
let lastResults = null;

// ============================================================
// TCP Probe
// ============================================================

/**
 * Probes a single TCP endpoint.
 * @returns {Promise<{online: boolean, responseTime: number, reason?: string}>}
 */
function probeServer(host, port) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const socket = new net.Socket();

        socket.setTimeout(TCP_TIMEOUT_MS);

        socket.on('connect', () => {
            const responseTime = Date.now() - startTime;
            socket.destroy();
            resolve({ online: true, responseTime });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ online: false, responseTime: TCP_TIMEOUT_MS, reason: 'Timeout' });
        });

        socket.on('error', (err) => {
            const responseTime = Date.now() - startTime;
            socket.destroy();
            resolve({ online: false, responseTime, reason: err.code || err.message });
        });

        socket.connect(port, host);
    });
}

// ============================================================
// Check all servers
// ============================================================

async function checkServers() {
    logger.info('Server status: starting probe cycle...');
    const results = {};
    let anyChanged = false;

    // Probe all servers in parallel
    const probes = Object.entries(SERVERS).map(async ([key, srv]) => {
        const probe = await probeServer(srv.host, srv.port);
        results[key] = {
            ...srv,
            online: probe.online,
            responseTime: probe.responseTime,
            reason: probe.reason || null
        };

        // Update storage (tracks history + transitions)
        const update = serverStatusStorage.updateServerStatus(key, probe.online, {
            responseTimeMs: probe.responseTime,
            reason: probe.reason
        });

        if (update.changed) {
            anyChanged = true;
            logger.info(`Server status CHANGED: ${srv.name} -> ${probe.online ? 'ONLINE' : 'OFFLINE'}`, {
                reason: probe.reason
            });
        }

        return { key, probe };
    });

    await Promise.all(probes);

    // Log summary
    const summary = Object.entries(results)
        .map(([k, r]) => `${r.online ? '🟢' : '🔴'} ${r.name}: ${r.responseTime}ms`)
        .join(' | ');
    logger.info(`Server status: ${summary}`);

    lastResults = {
        timestamp: new Date().toISOString(),
        servers: results
    };

    // Send Discord notification on status change
    if (anyChanged) {
        await sendStatusNotification(results);
    }

    return results;
}

// ============================================================
// Discord notification
// ============================================================

async function sendStatusNotification(results) {
    if (!discordClient || !notificationChannelId) return;

    try {
        const channel = await discordClient.channels.fetch(notificationChannelId);
        if (!channel) return;

        const { EmbedBuilder } = require('discord.js');

        const allOnline = Object.values(results).every(r => r.online);
        const gameServers = Object.entries(results).filter(([k]) => k !== 'ACCOUNT');

        const embed = new EmbedBuilder()
            .setColor(allOnline ? '#3BA55C' : '#ED4245')
            .setTitle(allOnline ? '🟢 Servidores Online' : '🔴 Mudança de Status')
            .setTimestamp();

        const lines = gameServers.map(([, r]) => {
            const icon = r.online ? '🟢' : '🔴';
            const status = r.online ? 'Online' : `Offline (${r.reason || '?'})`;
            return `${r.emoji} **${r.name}** — ${icon} ${status} (${r.responseTime}ms)`;
        });

        embed.setDescription(lines.join('\n'));
        embed.setFooter({ text: 'BeeWiki • Status Monitor' });

        await channel.send({ embeds: [embed] });
    } catch (error) {
        logger.error('Error sending status notification', { error: error.message });
    }
}

// ============================================================
// Lifecycle
// ============================================================

function initialize(client, channelId = null) {
    discordClient = client;
    notificationChannelId = channelId;
    logger.info('Server status service initialized');
}

function start() {
    if (intervalId) {
        logger.warn('Server status service already running');
        return;
    }

    // First check after 30 seconds
    setTimeout(() => {
        checkServers().catch(err => {
            logger.error('Initial server status check failed', { error: err.message });
        });
    }, 30 * 1000);

    intervalId = setInterval(() => {
        checkServers().catch(err => {
            logger.error('Periodic server status check failed', { error: err.message });
        });
    }, CHECK_INTERVAL_MS);

    logger.info('Server status service started', { intervalMinutes: CHECK_INTERVAL_MS / 60000 });
}

function stop() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info('Server status service stopped');
    }
}

async function forceCheck() {
    return await checkServers();
}

function getStatus() {
    return {
        running: !!intervalId,
        intervalMinutes: CHECK_INTERVAL_MS / 60000,
        servers: serverStatusStorage.getServerStatus(),
        lastCheck: lastResults,
        lastUpdated: serverStatusStorage.loadStatus().lastUpdated
    };
}

function setNotificationChannel(channelId) {
    notificationChannelId = channelId;
    logger.info('Notification channel set', { channelId });
}

module.exports = {
    SERVERS,
    initialize,
    start,
    stop,
    checkServers,
    forceCheck,
    getStatus,
    setNotificationChannel,
    probeServer,
    // Compat
    checkServer: checkServers,
    checkAllServers: checkServers
};
