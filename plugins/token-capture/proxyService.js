/**
 * Token Capture Proxy Service
 * Transparent TCP proxy that captures SSO tokens from Ragnarok Online game client
 * 
 * Architecture:
 *   Windows (ragexe.exe) --[hosts redirect]--> Linux (this proxy) --> Real GNJoy server
 *   The proxy captures packet 0x0825 (CA_SSO_LOGIN_REQ, 417 bytes) in transit,
 *   extracts the Base64 token, saves it to .env, and forwards everything untouched.
 */

const net = require('net');
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TARGET_HOST = 'lt-account-01.gnjoylatam.com';
const TARGET_PORT = 6900;
const SSO_PACKET_ID = 0x0825;

const TOKEN_OFFSET = 92;
const TOKEN_LENGTH = 325;

let logger = console;

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

function updateEnvToken(token) {
    // Walk up to project root (plugins/token-capture -> project root)
    const envPath = path.join(__dirname, '..', '..', '.env');

    if (!fs.existsSync(envPath)) {
        logger.warn('Token capture: .env not found, cannot save token');
        return false;
    }

    try {
        let content = fs.readFileSync(envPath, 'utf8');

        if (content.includes('RO_AUTH_TOKEN=')) {
            content = content.replace(/RO_AUTH_TOKEN=.*/, `RO_AUTH_TOKEN=${token}`);
        } else {
            content += `\nRO_AUTH_TOKEN=${token}\n`;
        }

        fs.writeFileSync(envPath, content, 'utf8');
        process.env.RO_AUTH_TOKEN = token;

        logger.info('Token capture: Updated RO_AUTH_TOKEN in .env and process.env');
        return true;
    } catch (error) {
        logger.error('Token capture: Failed to update .env', { error: error.message });
        return false;
    }
}

// ============================================================
// Transparent TCP Proxy
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
        this.tokensCaptured = 0;
        this.onTokenCaptured = null;
    }

    async start() {
        this.targetIp = await this._resolveTargetIp();
        logger.info(`Token capture: Resolved ${TARGET_HOST} -> ${this.targetIp}`);

        return new Promise((resolve, reject) => {
            this.server = net.createServer((clientSocket) => {
                this._handleConnection(clientSocket);
            });

            this.server.on('error', (err) => {
                if (err.code === 'EADDRINUSE' && this.listenPort === TARGET_PORT) {
                    logger.warn(`Token capture: Port ${TARGET_PORT} in use, trying ${TARGET_PORT + 10000}`);
                    this.listenPort = TARGET_PORT + 10000;
                    this.server.listen(this.listenPort, this.listenHost);
                    return;
                }
                logger.error('Token capture: Server error', { error: err.message });
                this.isRunning = false;
                reject(err);
            });

            this.server.listen(this.listenPort, this.listenHost, () => {
                this.isRunning = true;
                logger.info(`Token capture: Proxy listening on ${this.listenHost}:${this.listenPort}`);
                logger.info(`Token capture: Forwarding to ${this.targetIp}:${TARGET_PORT}`);
                logger.info(`Token capture: Configure Windows hosts: ${this._getLocalIp()}  ${TARGET_HOST}`);
                resolve();
            });
        });
    }

    _handleConnection(clientSocket) {
        this.connections++;
        const clientAddr = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
        logger.info(`Token capture: New connection from ${clientAddr} (#${this.connections})`);

        const serverSocket = net.createConnection(TARGET_PORT, this.targetIp);
        let clientBuffer = Buffer.alloc(0);

        clientSocket.on('data', (data) => {
            clientBuffer = Buffer.concat([clientBuffer, data]);

            const token = extractTokenFromPacket(clientBuffer);
            if (token) {
                const username = extractUsernameFromPacket(clientBuffer);
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

                updateEnvToken(token);

                if (this.onTokenCaptured) {
                    try { this.onTokenCaptured(token, username); } catch (e) { /* ignore */ }
                }

                clientBuffer = Buffer.alloc(0);
            }

            serverSocket.write(data);
        });

        serverSocket.on('data', (data) => {
            clientSocket.write(data);
        });

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
            tokensCaptured: this.tokensCaptured,
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
// Singleton API
// ============================================================

let instance = null;

async function startCapture(options = {}) {
    if (instance) {
        logger.warn('Token capture: Already running, stopping previous instance');
        stopCapture();
    }

    instance = new TransparentProxy(options);

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

function onCapture(callback) {
    if (instance) {
        instance.onTokenCaptured = callback;
    }
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
