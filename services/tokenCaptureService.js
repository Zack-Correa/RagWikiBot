/**
 * Token Capture Service
 * Automatically captures SSO tokens from Ragnarok Online game client
 * 
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Windows (sua máquina)                                          │
 * │  ┌────────────┐   hosts file    ┌─────────────────────────┐    │
 * │  │  ragexe.exe │──────────────>│ lt-account-01.gnjoylatam │    │
 * │  │  (jogo RO)  │    aponta p/  │  = IP do servidor Linux  │    │
 * │  └────────────┘   Linux local   └─────────────────────────┘    │
 * └──────────────────────────────────────────────────────────────────┘
 *                         │ TCP :6900
 *                         ▼
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Linux (servidor do bot)                                        │
 * │  ┌─────────────────────┐        ┌──────────────────────────┐   │
 * │  │  Token Capture Proxy │──────>│ lt-account-01.gnjoylatam  │   │
 * │  │  0.0.0.0:6900       │ fwd   │ (servidor real, IP real)  │   │
 * │  │                     │<──────│                           │   │
 * │  │  Captura 0x0825     │        └──────────────────────────┘   │
 * │  │  Salva .env         │                                       │
 * │  └─────────────────────┘                                       │
 * └──────────────────────────────────────────────────────────────────┘
 * 
 * Setup (uma vez):
 * 1. No Windows, editar C:\Windows\System32\drivers\etc\hosts:
 *    <IP_DO_LINUX>  lt-account-01.gnjoylatam.com
 * 2. No Linux, iniciar o bot com captura: /token-capture start
 * 3. Jogar normalmente - token capturado automaticamente
 */

const net = require('net');
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

const TARGET_HOST = 'lt-account-01.gnjoylatam.com';
const TARGET_PORT = 6900;
const SSO_PACKET_ID = 0x0825;

// Token field offsets in 0x0825 packet (417 bytes total)
const TOKEN_OFFSET = 92;  // Token starts at byte 92
const TOKEN_LENGTH = 325; // Base64 token is 325 bytes

// Callbacks for token capture events
let onTokenCaptured = null;

/**
 * Extracts SSO token from 0x0825 packet
 * @param {Buffer} packet - Raw packet data (should be 417 bytes)
 * @returns {string|null} Base64 token or null
 */
function extractTokenFromPacket(packet) {
    if (!packet || packet.length < TOKEN_OFFSET + 10) {
        return null;
    }

    const packetId = packet.readUInt16LE(0);
    if (packetId !== SSO_PACKET_ID) {
        return null;
    }

    // Verify packet length field matches (bytes 2-3)
    const packetLen = packet.readUInt16LE(2);
    if (packetLen !== 417 && packet.length < 417) {
        return null;
    }

    // Extract token (325 bytes Base64 string starting at offset 92)
    const endOffset = Math.min(TOKEN_OFFSET + TOKEN_LENGTH, packet.length);
    const tokenBuffer = packet.slice(TOKEN_OFFSET, endOffset);
    const nullIdx = tokenBuffer.indexOf(0);
    const token = tokenBuffer.toString('ascii', 0, nullIdx >= 0 ? nullIdx : tokenBuffer.length).trim();

    // Validate: should be Base64-like and substantial length
    if (token.length < 200) {
        return null;
    }

    // Basic Base64 validation
    if (!/^[A-Za-z0-9+/=_-]+$/.test(token)) {
        return null;
    }

    return token;
}

/**
 * Extracts username from 0x0825 packet
 * @param {Buffer} packet
 * @returns {string|null}
 */
function extractUsernameFromPacket(packet) {
    if (!packet || packet.length < 33) return null;
    const packetId = packet.readUInt16LE(0);
    if (packetId !== SSO_PACKET_ID) return null;

    // Username at offset 9, 24 bytes
    const userBuf = packet.slice(9, 33);
    const nullIdx = userBuf.indexOf(0);
    return userBuf.toString('ascii', 0, nullIdx >= 0 ? nullIdx : 24).trim();
}

/**
 * Updates .env file with new token and reloads process.env
 * @param {string} token - SSO token to save
 * @returns {boolean} success
 */
function updateEnvToken(token) {
    const envPath = path.join(__dirname, '..', '.env');

    if (!fs.existsSync(envPath)) {
        logger.warn('Token capture: .env file not found, cannot save token');
        return false;
    }

    try {
        let envContent = fs.readFileSync(envPath, 'utf8');

        if (envContent.includes('RO_AUTH_TOKEN=')) {
            envContent = envContent.replace(/RO_AUTH_TOKEN=.*/, `RO_AUTH_TOKEN=${token}`);
        } else {
            envContent += `\nRO_AUTH_TOKEN=${token}\n`;
        }

        fs.writeFileSync(envPath, envContent, 'utf8');

        // Reload into current process
        process.env.RO_AUTH_TOKEN = token;

        logger.info('Token capture: Updated RO_AUTH_TOKEN in .env and process.env');
        return true;
    } catch (error) {
        logger.error('Token capture: Failed to update .env', { error: error.message });
        return false;
    }
}

// ============================================================
// TCP Transparent Proxy
// Listens on 0.0.0.0:6900 (or configurable port), forwards to
// the real game server, and captures SSO tokens in transit.
// Works cross-network: Windows game → Linux proxy → real server
// ============================================================

class TransparentProxy {
    constructor(options = {}) {
        this.listenPort = options.listenPort || TARGET_PORT;
        this.listenHost = options.listenHost || '0.0.0.0';
        this.targetIp = null;
        this.server = null;
        this.isRunning = false;
        this.lastToken = null;
        this.lastTokenTime = null;
        this.lastUsername = null;
        this.connections = 0;
        this.tokensCapured = 0;
    }

    async start() {
        // Resolve the REAL server IP before starting the proxy
        // This is critical: we need the actual IP so we don't loop back to ourselves
        this.targetIp = await this._resolveTargetIp();
        logger.info(`Token capture: Resolved ${TARGET_HOST} → ${this.targetIp}`);

        return new Promise((resolve, reject) => {
            this.server = net.createServer((clientSocket) => {
                this._handleConnection(clientSocket);
            });

            this.server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    // Port 6900 in use — try alternate port
                    if (this.listenPort === TARGET_PORT) {
                        logger.warn(`Token capture: Port ${TARGET_PORT} in use, trying ${TARGET_PORT + 10000}`);
                        this.listenPort = TARGET_PORT + 10000; // 16900
                        this.server.listen(this.listenPort, this.listenHost);
                        return;
                    }
                }
                logger.error('Token capture: Server error', { error: err.message });
                this.isRunning = false;
                reject(err);
            });

            this.server.listen(this.listenPort, this.listenHost, () => {
                this.isRunning = true;
                const localIp = this._getLocalIp();
                logger.info(`Token capture: Proxy listening on ${this.listenHost}:${this.listenPort}`);
                logger.info(`Token capture: Forwarding to ${this.targetIp}:${TARGET_PORT}`);
                logger.info(`Token capture: Configure Windows hosts: ${localIp}  ${TARGET_HOST}`);
                resolve();
            });
        });
    }

    _handleConnection(clientSocket) {
        this.connections++;
        const clientAddr = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
        logger.info(`Token capture: New connection from ${clientAddr} (#${this.connections})`);

        // Connect to the real game server
        const serverSocket = net.createConnection(TARGET_PORT, this.targetIp);
        let clientBuffer = Buffer.alloc(0);

        // Client → Server (capture outgoing packets)
        clientSocket.on('data', (data) => {
            // Accumulate data in case packet is fragmented
            clientBuffer = Buffer.concat([clientBuffer, data]);

            // Try to extract token from accumulated data
            const token = extractTokenFromPacket(clientBuffer);
            if (token) {
                const username = extractUsernameFromPacket(clientBuffer);
                this.lastToken = token;
                this.lastTokenTime = new Date().toISOString();
                this.lastUsername = username;
                this.tokensCapured++;

                logger.info('═══════════════════════════════════════════');
                logger.info('Token capture: ✅ SSO TOKEN CAPTURED!');
                logger.info(`Token capture: User: ${username || 'unknown'}`);
                logger.info(`Token capture: Length: ${token.length} chars`);
                logger.info(`Token capture: Preview: ${token.substring(0, 40)}...`);
                logger.info('═══════════════════════════════════════════');

                updateEnvToken(token);

                // Notify callback if registered
                if (onTokenCaptured) {
                    try { onTokenCaptured(token, username); } catch (e) { /* ignore */ }
                }

                // Reset buffer after successful extraction
                clientBuffer = Buffer.alloc(0);
            }

            // Forward to real server
            serverSocket.write(data);
        });

        // Server → Client (forward responses transparently)
        serverSocket.on('data', (data) => {
            clientSocket.write(data);
        });

        // Cleanup
        clientSocket.on('close', () => {
            logger.debug(`Token capture: Client ${clientAddr} disconnected`);
            serverSocket.destroy();
        });

        serverSocket.on('close', () => {
            clientSocket.destroy();
        });

        clientSocket.on('error', (err) => {
            logger.debug('Token capture: Client error', { error: err.message });
            serverSocket.destroy();
        });

        serverSocket.on('error', (err) => {
            logger.debug('Token capture: Server error', { error: err.message });
            clientSocket.destroy();
        });
    }

    /**
     * Resolve the real IP of the game server.
     * Must bypass any local hosts file override.
     */
    _resolveTargetIp() {
        return new Promise((resolve, reject) => {
            // Use DNS resolver directly to bypass hosts file
            const resolver = new dns.Resolver();
            // Use public DNS to ensure we get the REAL IP, not our proxy
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

    /**
     * Get the local IP address to display in setup instructions
     */
    _getLocalIp() {
        const interfaces = os.networkInterfaces();
        for (const [name, addrs] of Object.entries(interfaces)) {
            for (const addr of addrs) {
                if (addr.family === 'IPv4' && !addr.internal) {
                    return addr.address;
                }
            }
        }
        return '127.0.0.1';
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.isRunning = false;
            logger.info('Token capture: Proxy stopped');
        }
    }

    getStatus() {
        return {
            running: this.isRunning,
            method: 'transparent_proxy',
            listenHost: this.listenHost,
            listenPort: this.listenPort,
            localIp: this._getLocalIp(),
            targetHost: TARGET_HOST,
            targetPort: TARGET_PORT,
            targetIp: this.targetIp,
            connections: this.connections,
            tokensCaptured: this.tokensCapured,
            lastToken: this.lastToken ? {
                preview: this.lastToken.substring(0, 30) + '...',
                length: this.lastToken.length,
                capturedAt: this.lastTokenTime,
                username: this.lastUsername
            } : null
        };
    }
}

// ============================================================
// Main Service API
// ============================================================

let captureInstance = null;

/**
 * Start token capture service.
 * Runs a transparent TCP proxy that intercepts game login traffic
 * and extracts the SSO token automatically.
 * 
 * Works cross-platform and cross-network:
 * - Linux server on same LAN as Windows game client
 * - Windows game → (hosts file) → Linux proxy → real server
 * 
 * @param {Object} options
 * @param {number} options.listenPort - Port to listen on (default: 6900)
 * @param {string} options.listenHost - Interface to bind (default: 0.0.0.0)
 * @returns {Promise<Object>} Status object
 */
async function startCapture(options = {}) {
    if (captureInstance) {
        logger.warn('Token capture: Already running, stopping previous instance');
        stopCapture();
    }

    captureInstance = new TransparentProxy(options);

    try {
        await captureInstance.start();
        return captureInstance.getStatus();
    } catch (error) {
        logger.error('Token capture: Failed to start', { error: error.message });
        captureInstance = null;
        throw error;
    }
}

/**
 * Stop token capture service
 */
function stopCapture() {
    if (captureInstance) {
        captureInstance.stop();
        captureInstance = null;
    }
}

/**
 * Get current capture status
 */
function getStatus() {
    if (!captureInstance) {
        return { running: false };
    }
    return captureInstance.getStatus();
}

/**
 * Register a callback for when a token is captured
 * @param {Function} callback - (token, username) => void
 */
function onCapture(callback) {
    onTokenCaptured = callback;
}

module.exports = {
    startCapture,
    stopCapture,
    getStatus,
    onCapture,
    extractTokenFromPacket,
    updateEnvToken
};
