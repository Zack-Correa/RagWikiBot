/**
 * Token Capture Proxy Service
 * Transparent TCP proxy that captures SSO tokens from Ragnarok Online game client
 * 
 * Architecture:
 *   Windows (ragexe.exe) --[hosts redirect]--> Linux (this proxy) --> Real GNJoy server
 * 
 * The client connects to multiple ports on lt-account-01.gnjoylatam.com:
 *   - Port 6951: TokenAgency / OTP server (client connects here FIRST)
 *   - Port 6900: Account server (SSO login with 0x0825 packet)
 * 
 * Since the hosts file redirects ALL traffic for that hostname to Linux,
 * the proxy must listen on BOTH ports and forward transparently.
 * Token capture (0x0825) only happens on port 6900.
 */

const net = require('net');
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const os = require('os');
const roProtocol = require('../../services/roProtocol');
const playerCountStore = require('../../utils/playerCountStore');

const TARGET_HOST = 'lt-account-01.gnjoylatam.com';

// All ports the game client connects to on this hostname
const PORTS = {
    ACCOUNT: 6900,       // SSO login — packet 0x0825 is captured here
    TOKEN_AGENCY: 6951,  // TokenAgency / OTP — must forward or client fails
};

const SSO_PACKET_ID = 0x0825;
const TOKEN_OFFSET = 92;
const TOKEN_LENGTH = 325;

let logger = console;
let _onTokenCaptured = null;

function setLogger(l) {
    logger = l;
}

// ============================================================
// Packet parsing
// ============================================================

function extractTokenFromPacket(packet) {
    if (!packet || packet.length < TOKEN_OFFSET + 10) return null;

    const packetId = packet.readUInt16LE(0);
    if (packetId !== SSO_PACKET_ID) return null;

    const packetLen = packet.readUInt16LE(2);
    if (packetLen !== 417 && packet.length < 417) return null;

    const endOffset = Math.min(TOKEN_OFFSET + TOKEN_LENGTH, packet.length);
    const tokenBuffer = packet.slice(TOKEN_OFFSET, endOffset);
    const nullIdx = tokenBuffer.indexOf(0);
    const token = tokenBuffer.toString('ascii', 0, nullIdx >= 0 ? nullIdx : tokenBuffer.length).trim();

    if (token.length < 200) return null;
    if (!/^[A-Za-z0-9+/=_-]+$/.test(token)) return null;

    return token;
}

function extractUsernameFromPacket(packet) {
    if (!packet || packet.length < 33) return null;
    const packetId = packet.readUInt16LE(0);
    if (packetId !== SSO_PACKET_ID) return null;

    const userBuf = packet.slice(9, 33);
    const nullIdx = userBuf.indexOf(0);
    return userBuf.toString('ascii', 0, nullIdx >= 0 ? nullIdx : 24).trim();
}

// ============================================================
// .env persistence
// ============================================================

function updateEnvToken(token, username) {
    const envPath = path.join(__dirname, '..', '..', '.env');

    if (!fs.existsSync(envPath)) {
        logger.warn('Token capture: .env not found, cannot save token');
        return false;
    }

    try {
        let content = fs.readFileSync(envPath, 'utf8');

        // Update RO_AUTH_TOKEN
        if (content.includes('RO_AUTH_TOKEN=')) {
            content = content.replace(/RO_AUTH_TOKEN=.*/, `RO_AUTH_TOKEN=${token}`);
        } else {
            content += `\nRO_AUTH_TOKEN=${token}\n`;
        }

        // Update RO_PROBE_USERNAME to match the captured token's owner
        if (username) {
            if (content.includes('RO_PROBE_USERNAME=')) {
                content = content.replace(/RO_PROBE_USERNAME=.*/, `RO_PROBE_USERNAME=${username}`);
            } else {
                content += `\nRO_PROBE_USERNAME=${username}\n`;
            }
            process.env.RO_PROBE_USERNAME = username;
        }

        fs.writeFileSync(envPath, content, 'utf8');
        process.env.RO_AUTH_TOKEN = token;

        logger.info('Token capture: Updated .env and process.env', {
            token: `${token.substring(0, 20)}...`,
            username: username || 'N/A'
        });
        return true;
    } catch (error) {
        logger.error('Token capture: Failed to update .env', { error: error.message });
        return false;
    }
}

// Player count storage is handled by playerCountStore (utils/playerCountStore.js)

// ============================================================
// Generic TCP forwarder (transparent, no inspection)
// ============================================================

function createForwarder(listenPort, targetIp, targetPort, label) {
    return new Promise((resolve, reject) => {
        const server = net.createServer((clientSocket) => {
            const clientAddr = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
            logger.info(`${label}: New connection from ${clientAddr}`);

            let serverConnected = false;
            let pending = [];

            const serverSocket = net.createConnection(targetPort, targetIp);

            serverSocket.on('connect', () => {
                serverConnected = true;
                logger.info(`${label}: Connected to real server ${targetIp}:${targetPort}`);
                for (const chunk of pending) serverSocket.write(chunk);
                pending = [];
            });

            clientSocket.on('data', (data) => {
                logPacket(label, 'Client -> Server', data);
                if (serverConnected) {
                    serverSocket.write(data);
                } else {
                    pending.push(data);
                }
            });

            serverSocket.on('data', (data) => {
                logPacket(label, 'Server -> Client', data);
                clientSocket.write(data);
            });

            clientSocket.on('close', () => {
                logger.info(`${label}: Client ${clientAddr} disconnected`);
                serverSocket.destroy();
            });
            serverSocket.on('close', () => {
                logger.info(`${label}: Server connection closed for ${clientAddr}`);
                clientSocket.destroy();
            });
            clientSocket.on('error', (err) => {
                logger.warn(`${label}: Client error`, { error: err.message });
                serverSocket.destroy();
            });
            serverSocket.on('error', (err) => {
                logger.warn(`${label}: Server error`, { error: err.message });
                clientSocket.destroy();
            });
        });

        server.on('error', (err) => {
            logger.error(`${label}: Listen error on port ${listenPort}`, { error: err.message });
            reject(err);
        });

        server.listen(listenPort, '0.0.0.0', () => {
            logger.info(`${label}: Forwarding 0.0.0.0:${listenPort} -> ${targetIp}:${targetPort}`);
            resolve(server);
        });
    });
}

/**
 * Logs a packet with direction, identification, and hex dump.
 */
function logPacket(label, direction, data) {
    if (!data || data.length === 0) return;

    const packetId = data.length >= 2 ? data.readUInt16LE(0) : 0;
    const packetLen = data.length >= 4 ? data.readUInt16LE(2) : data.length;
    const identified = roProtocol.identifyPacket(data);
    const hexPreview = data.slice(0, Math.min(80, data.length)).toString('hex');

    const idStr = `0x${packetId.toString(16).padStart(4, '0')}`;
    const desc = identified.identified ? identified.description : 'Unknown';

    logger.info(`[PACKET] ${label} | ${direction} | ${idStr} (${desc}) | len=${data.length} pktLen=${packetLen} | hex=${hexPreview}`);
}

// ============================================================
// Main Proxy (port 6900 — with token capture)
// ============================================================

class TokenCaptureProxy {
    constructor() {
        this.listenHost = '0.0.0.0';
        this.targetIp = null;
        this.servers = [];           // All TCP servers (account + forwarders)
        this.isRunning = false;
        this.lastToken = null;
        this.lastTokenTime = null;
        this.lastUsername = null;
        this.lastServerList = null;
        this.lastServerListTime = null;
        this.connections = 0;
        this.tokensCaptured = 0;
        this.listeningPorts = [];
    }

    async start() {
        this.targetIp = await this._resolveTargetIp();
        logger.info(`Token capture: Resolved ${TARGET_HOST} -> ${this.targetIp}`);

        // 1. Start the main account server proxy (port 6900) with token capture
        const accountServer = await this._startAccountProxy();
        this.servers.push(accountServer);
        this.listeningPorts.push(PORTS.ACCOUNT);

        // 2. Start transparent forwarders for other ports the client uses
        const otherPorts = [PORTS.TOKEN_AGENCY];
        for (const port of otherPorts) {
            try {
                const fwd = await createForwarder(
                    port, this.targetIp, port,
                    `Token capture [fwd:${port}]`
                );
                this.servers.push(fwd);
                this.listeningPorts.push(port);
            } catch (err) {
                // Non-fatal: log and continue (the main port 6900 is what matters)
                logger.warn(`Token capture: Could not listen on port ${port}: ${err.message}`);
            }
        }

        this.isRunning = true;
        logger.info(`Token capture: Proxy ready on ports [${this.listeningPorts.join(', ')}]`);
        logger.info(`Token capture: Configure Windows hosts: ${this._getLocalIp()}  ${TARGET_HOST}`);
    }

    _startAccountProxy() {
        return new Promise((resolve, reject) => {
            const server = net.createServer((clientSocket) => {
                this._handleConnection(clientSocket);
            });

            server.on('error', (err) => {
                logger.error(`Token capture: Account proxy error on port ${PORTS.ACCOUNT}`, { error: err.message });
                reject(err);
            });

            server.listen(PORTS.ACCOUNT, this.listenHost, () => {
                logger.info(`Token capture: Account proxy listening on ${this.listenHost}:${PORTS.ACCOUNT}`);
                logger.info(`Token capture: Forwarding to ${this.targetIp}:${PORTS.ACCOUNT}`);
                resolve(server);
            });
        });
    }

    _handleConnection(clientSocket) {
        this.connections++;
        const clientAddr = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
        logger.info(`Token capture: New connection from ${clientAddr} (#${this.connections})`);

        let serverConnected = false;
        let pendingClientData = [];
        let clientBuffer = Buffer.alloc(0);
        let serverBuffer = Buffer.alloc(0);
        let capturedUsername = null;

        const serverSocket = net.createConnection(PORTS.ACCOUNT, this.targetIp);

        serverSocket.on('connect', () => {
            serverConnected = true;
            logger.info(`Token capture: Connected to real server ${this.targetIp}:${PORTS.ACCOUNT} for ${clientAddr}`);

            for (const chunk of pendingClientData) {
                serverSocket.write(chunk);
            }
            pendingClientData = [];
        });

        // Client -> Server (capture outgoing packets)
        clientSocket.on('data', (data) => {
            logPacket('Proxy:6900', 'Client -> Server', data);

            clientBuffer = Buffer.concat([clientBuffer, data]);

            const token = extractTokenFromPacket(clientBuffer);
            if (token) {
                const username = extractUsernameFromPacket(clientBuffer);
                capturedUsername = username;
                this.lastToken = token;
                this.lastTokenTime = new Date().toISOString();
                this.lastUsername = username;
                this.tokensCaptured++;

                logger.info('='.repeat(45));
                logger.info('Token capture: SSO TOKEN CAPTURED!');
                logger.info(`Token capture: User: ${username || 'unknown'}`);
                logger.info(`Token capture: Length: ${token.length} chars`);
                logger.info(`Token capture: Preview: ${token.substring(0, 40)}...`);
                logger.info('='.repeat(45));

                updateEnvToken(token, username);

                if (_onTokenCaptured) {
                    try { _onTokenCaptured(token, username); } catch (e) { /* ignore */ }
                }

                clientBuffer = Buffer.alloc(0);
            }

            if (serverConnected) {
                serverSocket.write(data);
            } else {
                pendingClientData.push(data);
            }
        });

        // Server -> Client (capture server response for player counts, then forward)
        serverSocket.on('data', (data) => {
            // Forward to the game client immediately (transparent)
            clientSocket.write(data);

            // Log every chunk from server
            logPacket('Proxy:6900', 'Server -> Client', data);

            // Accumulate server data to parse the login response
            serverBuffer = Buffer.concat([serverBuffer, data]);

            // Need at least 4 bytes for packet header
            if (serverBuffer.length < 4) return;

            const packetId = serverBuffer.readUInt16LE(0);
            const packetLen = serverBuffer.readUInt16LE(2);

            // For variable-length packets, wait for full data
            if (packetLen > 0 && serverBuffer.length < packetLen) {
                logger.info(`[PARSE] Waiting for more data (${serverBuffer.length}/${packetLen})`);
                return;
            }

            logger.info(`[PARSE] Full packet ready: 0x${packetId.toString(16).padStart(4, '0')} len=${packetLen} buffer=${serverBuffer.length}`);

            // Dump full hex for packets > header only (useful for reverse-engineering)
            if (serverBuffer.length > 10) {
                // Log in chunks of 64 chars (32 bytes) for readability
                const fullHex = serverBuffer.slice(0, Math.min(serverBuffer.length, packetLen)).toString('hex');
                const chunkSize = 64;
                for (let i = 0; i < fullHex.length; i += chunkSize) {
                    const offset = i / 2;
                    logger.info(`[HEX] +${String(offset).padStart(4, '0')}: ${fullHex.slice(i, i + chunkSize)}`);
                }
            }

            // Try to parse GNJoy login accepted (0x0C32)
            const parsed = roProtocol.parseGNJoyLoginAccepted(serverBuffer);
            if (parsed && parsed.servers && parsed.servers.length > 0) {
                logger.info('='.repeat(50));
                logger.info('[RESULT] SERVER LIST CAPTURED!');
                for (const srv of parsed.servers) {
                    logger.info(`  ${srv.name}: ${srv.playerCount} players | port=${srv.port} | ${srv.url || srv.ip || 'no url'}`);
                }
                logger.info('='.repeat(50));

                playerCountStore.record(parsed.servers);
                this.lastServerList = parsed.servers;
                this.lastServerListTime = new Date().toISOString();
            } else if (parsed && parsed.servers && parsed.servers.length === 0) {
                logger.warn('[RESULT] 0x0C32 packet recognized but 0 server entries parsed');
            } else {
                // Try login refused
                const errorInfo = roProtocol.parseLoginRefused(serverBuffer);
                if (errorInfo) {
                    logger.warn(`[RESULT] Login refused: error=${errorInfo.errorCode} reason="${roProtocol.getRefuseReason(errorInfo.errorCode)}"`);
                } else {
                    // Try standard login accepted (0x0069, 0x0AC4)
                    const stdParsed = roProtocol.parseLoginAccepted(serverBuffer);
                    if (stdParsed && stdParsed.servers && stdParsed.servers.length > 0) {
                        logger.info('='.repeat(50));
                        logger.info('[RESULT] SERVER LIST CAPTURED (standard format)!');
                        const normalized = stdParsed.servers.map(s => ({
                            name: s.name,
                            playerCount: s.userCount || 0,
                            ip: s.ip,
                            port: s.port
                        }));
                        for (const srv of normalized) {
                            logger.info(`  ${srv.name}: ${srv.playerCount} players`);
                        }
                        logger.info('='.repeat(50));

                        playerCountStore.record(normalized);
                        this.lastServerList = normalized;
                        this.lastServerListTime = new Date().toISOString();
                    } else {
                        logger.info(`[RESULT] Packet 0x${packetId.toString(16).padStart(4, '0')} not recognized as login response`);
                    }
                }
            }

            serverBuffer = Buffer.alloc(0);
        });

        // Cleanup
        clientSocket.on('close', () => {
            logger.info(`Token capture: Client ${clientAddr} disconnected`);
            serverSocket.destroy();
        });
        serverSocket.on('close', () => {
            logger.info(`Token capture: Server connection closed for ${clientAddr}`);
            clientSocket.destroy();
        });
        clientSocket.on('error', (err) => {
            logger.warn(`Token capture: Client error (${clientAddr})`, { error: err.message });
            serverSocket.destroy();
        });
        serverSocket.on('error', (err) => {
            logger.warn(`Token capture: Server connection error for ${clientAddr}`, { error: err.message });
            clientSocket.destroy();
        });
    }

    _resolveTargetIp() {
        return new Promise((resolve, reject) => {
            const resolver = new dns.Resolver();
            resolver.setServers(['8.8.8.8', '1.1.1.1']);
            resolver.resolve4(TARGET_HOST, (err, addresses) => {
                if (err || !addresses || addresses.length === 0) {
                    reject(new Error(`Failed to resolve ${TARGET_HOST}: ${err?.message}`));
                    return;
                }
                resolve(addresses[0]);
            });
        });
    }

    _getLocalIp() {
        const interfaces = os.networkInterfaces();
        for (const [, addrs] of Object.entries(interfaces)) {
            for (const addr of addrs) {
                if (addr.family === 'IPv4' && !addr.internal) {
                    return addr.address;
                }
            }
        }
        return '127.0.0.1';
    }

    stop() {
        for (const server of this.servers) {
            try { server.close(); } catch (e) { /* ignore */ }
        }
        this.servers = [];
        this.listeningPorts = [];
        this.isRunning = false;
        logger.info('Token capture: All proxies stopped');
    }

    getStatus() {
        return {
            running: this.isRunning,
            method: 'transparent_proxy',
            listenHost: this.listenHost,
            listeningPorts: this.listeningPorts,
            localIp: this._getLocalIp(),
            targetHost: TARGET_HOST,
            targetIp: this.targetIp,
            connections: this.connections,
            tokensCaptured: this.tokensCaptured,
            lastToken: this.lastToken ? {
                preview: this.lastToken.substring(0, 30) + '...',
                length: this.lastToken.length,
                capturedAt: this.lastTokenTime,
                username: this.lastUsername
            } : null,
            lastServerList: this.lastServerList ? {
                capturedAt: this.lastServerListTime,
                servers: this.lastServerList.map(s => ({
                    name: s.name,
                    playerCount: s.playerCount
                }))
            } : null
        };
    }
}

// ============================================================
// Singleton API
// ============================================================

let instance = null;

async function startCapture(options = {}) {
    if (instance) {
        logger.warn('Token capture: Already running, stopping previous instance');
        stopCapture();
    }

    instance = new TokenCaptureProxy();

    try {
        await instance.start();
        return instance.getStatus();
    } catch (error) {
        logger.error('Token capture: Failed to start', { error: error.message });
        instance = null;
        throw error;
    }
}

function stopCapture() {
    if (instance) {
        instance.stop();
        instance = null;
    }
}

function getStatus() {
    if (!instance) return { running: false };
    return instance.getStatus();
}

/**
 * Register a callback for when a token is captured.
 * Can be called before or after startCapture.
 * @param {Function} callback - (token, username) => void
 */
function onCapture(callback) {
    _onTokenCaptured = callback;
}

function getToken() {
    return process.env.RO_AUTH_TOKEN || null;
}

module.exports = {
    setLogger,
    startCapture,
    stopCapture,
    getStatus,
    getToken,
    onCapture
};
