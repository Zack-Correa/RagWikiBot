/**
 * Server Status Service
 * Monitors Ragnarok Online LATAM server availability via TCP connection
 */

const net = require('net');
const { EmbedBuilder } = require('discord.js');
const storage = require('./storage');

// Account Server Configuration (from OpenKore servers.txt)
const ACCOUNT_SERVER = {
    host: 'lt-account-01.gnjoylatam.com',
    port: 6900
};

// Check interval (6 hours)
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Timeout for TCP check (10 seconds)
const TCP_TIMEOUT_MS = 10000;

let intervalId = null;
let discordClient = null;
let notificationChannelId = null;
let logger = console;

/**
 * Sets the logger instance
 */
function setLogger(loggerInstance) {
    logger = loggerInstance;
}

/**
 * Initializes the server status service
 */
function initialize(client, channelId = null) {
    discordClient = client;
    notificationChannelId = channelId;
    logger.info('Server status service initialized', {
        server: `${ACCOUNT_SERVER.host}:${ACCOUNT_SERVER.port}`,
        intervalHours: CHECK_INTERVAL_MS / (60 * 60 * 1000)
    });
}

/**
 * Starts the server status monitoring
 */
function start() {
    if (intervalId) {
        logger.warn('Server status service already running');
        return;
    }
    
    // Run first check after 1 minute
    setTimeout(() => {
        checkServers();
    }, 60000);
    
    // Then run every 6 hours
    intervalId = setInterval(checkServers, CHECK_INTERVAL_MS);
    
    logger.info('Server status service started', { 
        intervalHours: CHECK_INTERVAL_MS / (60 * 60 * 1000) 
    });
}

/**
 * Stops the monitoring
 */
function stop() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info('Server status service stopped');
    }
}

/**
 * Checks if the account server is online via TCP connection
 */
function checkAccountServer() {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const socket = new net.Socket();
        
        socket.setTimeout(TCP_TIMEOUT_MS);
        
        socket.on('connect', () => {
            const responseTime = Date.now() - startTime;
            socket.destroy();
            logger.info('Server is ONLINE', {
                host: ACCOUNT_SERVER.host,
                port: ACCOUNT_SERVER.port,
                responseTime
            });
            resolve({
                online: true,
                responseTime
            });
        });
        
        socket.on('timeout', () => {
            socket.destroy();
            logger.warn('Server check TIMEOUT', {
                host: ACCOUNT_SERVER.host,
                port: ACCOUNT_SERVER.port,
                timeout: TCP_TIMEOUT_MS
            });
            resolve({
                online: false,
                responseTime: TCP_TIMEOUT_MS,
                reason: 'Timeout'
            });
        });
        
        socket.on('error', (err) => {
            const responseTime = Date.now() - startTime;
            socket.destroy();
            logger.warn('Server check FAILED', {
                host: ACCOUNT_SERVER.host,
                port: ACCOUNT_SERVER.port,
                error: err.code || err.message,
                responseTime
            });
            resolve({
                online: false,
                responseTime,
                reason: err.code || err.message
            });
        });
        
        socket.connect(ACCOUNT_SERVER.port, ACCOUNT_SERVER.host);
    });
}

/**
 * Main server check - updates status for all servers
 */
async function checkServers() {
    logger.info('Starting server status check...', {
        server: `${ACCOUNT_SERVER.host}:${ACCOUNT_SERVER.port}`
    });
    
    const result = await checkAccountServer();
    
    // Update status for all servers
    const servers = storage.SERVERS;
    const results = {};
    let statusChanged = false;
    
    for (const server of servers) {
        const updateResult = storage.updateServerStatus(server, result.online, {
            responseTimeMs: result.responseTime,
            reason: result.reason
        });
        
        results[server] = { 
            online: result.online, 
            responseTime: result.responseTime 
        };
        
        if (updateResult.changed) {
            statusChanged = true;
        }
    }
    
    // Send notification if status changed
    if (statusChanged) {
        await sendStatusNotification(result.online, result.reason);
    }
    
    return results;
}

/**
 * Sends a status change notification
 */
async function sendStatusNotification(online, reason = null) {
    if (!discordClient || !notificationChannelId) {
        return;
    }
    
    try {
        const channel = await discordClient.channels.fetch(notificationChannelId);
        
        if (!channel) {
            logger.warn('Notification channel not found', { channelId: notificationChannelId });
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTimestamp();
        
        if (online) {
            embed
                .setColor('#3BA55C')
                .setTitle('🟢 Servidores Online')
                .setDescription('Os servidores de **Ragnarok Online LATAM** estão online!')
                .addFields({
                    name: 'Servidores',
                    value: '• Freya\n• Nidhogg\n• Yggdrasil',
                    inline: true
                });
        } else {
            embed
                .setColor('#ED4245')
                .setTitle('🔴 Servidores Offline')
                .setDescription('Os servidores de **Ragnarok Online LATAM** estão offline.')
                .addFields({
                    name: 'Servidores Afetados',
                    value: '• Freya\n• Nidhogg\n• Yggdrasil',
                    inline: true
                }, {
                    name: 'Motivo',
                    value: reason || 'Desconhecido',
                    inline: true
                });
        }
        
        embed.setFooter({ text: 'BeeWiki • Status do Servidor' });
        
        await channel.send({ embeds: [embed] });
        logger.info('Status notification sent', { online, channelId: notificationChannelId });
        
    } catch (error) {
        logger.error('Error sending status notification', { error: error.message });
    }
}

/**
 * Forces an immediate check
 */
async function forceCheck() {
    return await checkServers();
}

/**
 * Gets current status
 */
function getStatus() {
    const statusData = storage.loadStatus();
    return {
        running: !!intervalId,
        intervalHours: CHECK_INTERVAL_MS / (60 * 60 * 1000),
        accountServer: `${ACCOUNT_SERVER.host}:${ACCOUNT_SERVER.port}`,
        servers: storage.getServerStatus(),
        lastUpdated: statusData.lastUpdated
    };
}

/**
 * Sets the notification channel
 */
function setNotificationChannel(channelId) {
    notificationChannelId = channelId;
    logger.info('Notification channel set', { channelId });
}

module.exports = {
    setLogger,
    initialize,
    start,
    stop,
    checkServers,
    forceCheck,
    getStatus,
    setNotificationChannel,
    checkServer: checkServers,
    checkAllServers: checkServers
};
