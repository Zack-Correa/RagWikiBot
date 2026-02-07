/**
 * Ragnarok Online Protocol Module
 * Low-level packet handling for RO server communication
 * 
 * References:
 * - OpenKore: https://github.com/OpenKore/openkore
 * - rAthena packet DB: https://github.com/rathena/rathena
 * - SDxBacon/RagnarokOnlinePlayerMonitor
 * 
 * GNJoy LATAM servers:
 *   Account Server: lt-account-01.gnjoylatam.com:6900
 *   Servers: FREYA (3), NIDHOGG (4), YGGDRASIL (5)
 */

const net = require('net');
const logger = require('../utils/logger');

// ============================================================
// RO Packet Constants
// ============================================================

const PACKET_IDS = {
    // Client -> Login Server
    CA_LOGIN: 0x0064,               // Standard login (55 bytes)
    CA_LOGIN2: 0x01DD,              // Login with hash
    CA_LOGIN3: 0x01FA,              // Login with MD5
    CA_SSO_LOGIN_REQ: 0x0825,      // SSO Login (newer clients)
    CA_LOGIN_PCBANG: 0x0277,       // PC Bang login
    CA_LOGIN_HAN: 0x02B0,          // HAN login
    CA_CONNECT_INFO_CHANGED: 0x0200, // Connect info changed
    CA_EXE_HASHCHECK: 0x0204,      // Client hash check

    // Login Server -> Client
    AC_ACCEPT_LOGIN: 0x0069,       // Login accepted (contains server list!)
    AC_ACCEPT_LOGIN2: 0x0AC4,      // Login accepted (newer)
    AC_REFUSE_LOGIN: 0x006A,       // Login refused (standard, 23 bytes)
    AC_REFUSE_LOGIN3: 0x083E,      // Login refused v3 (GNJoy LATAM, 26 bytes)
    AC_ACK_HASH: 0x0205,           // Hash check ack

    // Client -> Char Server
    CH_ENTER: 0x0065,              // Enter char server
    CH_SELECT_CHAR: 0x0066,        // Select character
    CH_MAKE_CHAR: 0x0067,          // Create character
    PING: 0x0187,                  // Keep-alive ping
};

// Char server entry size in the login response
const CHAR_SERVER_ENTRY_SIZE = 32;

// ============================================================
// Binary Helpers
// ============================================================

/**
 * Writes a 16-bit unsigned integer (little-endian)
 */
function writeUInt16LE(value) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(value);
    return buf;
}

/**
 * Writes a 32-bit unsigned integer (little-endian)
 */
function writeUInt32LE(value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value);
    return buf;
}

/**
 * Writes a null-padded string
 */
function writeFixedString(str, length) {
    const buf = Buffer.alloc(length, 0);
    buf.write(str || '', 0, Math.min(str?.length || 0, length - 1), 'ascii');
    return buf;
}

/**
 * Reads a null-terminated string from buffer
 */
function readFixedString(buffer, offset, length) {
    const slice = buffer.slice(offset, offset + length);
    const nullIdx = slice.indexOf(0);
    return slice.toString('ascii', 0, nullIdx >= 0 ? nullIdx : length).trim();
}

// ============================================================
// Packet Builders
// ============================================================

/**
 * Builds a standard CA_LOGIN packet (0x0064)
 * @param {string} username - Account username (max 23 chars)
 * @param {string} password - Account password (max 23 chars)
 * @param {number} [clientVersion=20] - Client version number
 * @param {number} [clientType=2] - Client type (2 = normal)
 * @returns {Buffer} Login packet
 */
function buildLoginPacket(username, password, clientVersion = 20, clientType = 2) {
    // Packet: ID(2) + Version(4) + Username(24) + Password(24) + ClientType(1) = 55 bytes
    const packet = Buffer.alloc(55);
    let offset = 0;

    // Packet ID
    packet.writeUInt16LE(PACKET_IDS.CA_LOGIN, offset); offset += 2;
    // Client version
    packet.writeUInt32LE(clientVersion, offset); offset += 4;
    // Username (24 bytes, null-padded)
    writeFixedString(username, 24).copy(packet, offset); offset += 24;
    // Password (24 bytes, null-padded)
    writeFixedString(password, 24).copy(packet, offset); offset += 24;
    // Client type
    packet.writeUInt8(clientType, offset);

    return packet;
}

/**
 * Builds a PING packet (0x0187)
 * @param {number} accountId - Account ID
 * @returns {Buffer} Ping packet
 */
function buildPingPacket(accountId = 0) {
    const packet = Buffer.alloc(6);
    packet.writeUInt16LE(PACKET_IDS.PING, 0);
    packet.writeUInt32LE(accountId, 2);
    return packet;
}

/**
 * Builds a CH_ENTER packet (0x0065) - Enter char server
 * @param {number} accountId
 * @param {number} authCode
 * @param {number} userLevel
 * @param {number} gender
 * @returns {Buffer}
 */
function buildCharEnterPacket(accountId, authCode, userLevel, gender) {
    const packet = Buffer.alloc(17);
    let offset = 0;

    packet.writeUInt16LE(PACKET_IDS.CH_ENTER, offset); offset += 2;
    packet.writeUInt32LE(accountId, offset); offset += 4;
    packet.writeUInt32LE(authCode, offset); offset += 4;
    packet.writeUInt32LE(userLevel, offset); offset += 4;
    // 2 bytes padding + 1 byte gender
    packet.writeUInt8(0, offset); offset += 1;
    packet.writeUInt8(0, offset); offset += 1;
    packet.writeUInt8(gender, offset);

    return packet;
}

// ============================================================
// Packet Parsers
// ============================================================

/**
 * Parses login accepted response (0x0069 or 0x0AC4)
 * Extracts char server list with player counts
 * @param {Buffer} data - Raw packet data
 * @returns {Object|null} Parsed response with server list
 */
function parseLoginAccepted(data) {
    if (!data || data.length < 4) return null;

    const packetId = data.readUInt16LE(0);
    const packetLength = data.readUInt16LE(2);

    if (packetId !== PACKET_IDS.AC_ACCEPT_LOGIN && packetId !== PACKET_IDS.AC_ACCEPT_LOGIN2) {
        return null;
    }

    try {
        // Header: ID(2) + Length(2) + AuthCode(4) + AID(4) + UserLevel(4) + LastLoginIP(4) + LastLoginTime(26) + Gender(1) = 47 bytes
        const headerSize = 47;

        if (data.length < headerSize) return null;

        const authCode = data.readUInt32LE(4);
        const accountId = data.readUInt32LE(8);
        const userLevel = data.readUInt32LE(12);
        const gender = data.readUInt8(46);

        // Parse char server entries
        const servers = [];
        let offset = headerSize;

        while (offset + CHAR_SERVER_ENTRY_SIZE <= data.length && offset + CHAR_SERVER_ENTRY_SIZE <= packetLength) {
            const ip = `${data.readUInt8(offset)}.${data.readUInt8(offset + 1)}.${data.readUInt8(offset + 2)}.${data.readUInt8(offset + 3)}`;
            const port = data.readUInt16LE(offset + 4);
            const name = readFixedString(data, offset + 6, 20);
            const userCount = data.readUInt16LE(offset + 26);
            const serverType = data.readUInt16LE(offset + 28);
            const serverIndex = data.readUInt16LE(offset + 30);

            servers.push({
                ip,
                port,
                name,
                userCount,
                serverType,
                serverIndex
            });

            offset += CHAR_SERVER_ENTRY_SIZE;
        }

        return {
            packetId,
            authCode,
            accountId,
            userLevel,
            gender,
            servers
        };
    } catch (error) {
        logger.error('Error parsing login response', { error: error.message });
        return null;
    }
}

/**
 * Parses login refused response (0x006A standard or 0x083E newer)
 * @param {Buffer} data
 * @returns {Object|null}
 */
function parseLoginRefused(data) {
    if (!data || data.length < 3) return null;

    const packetId = data.readUInt16LE(0);

    // Standard refusal: 0x006A - ID(2) + ErrorCode(1) + BlockDate(20) = 23 bytes
    if (packetId === PACKET_IDS.AC_REFUSE_LOGIN) {
        const errorCode = data.readUInt8(2);
        return {
            packetId,
            packetName: 'AC_REFUSE_LOGIN',
            errorCode,
            reason: getRefuseReason(errorCode),
            blockDate: data.length >= 23 ? readFixedString(data, 3, 20) : null
        };
    }

    // Newer refusal: 0x083E - ID(2) + ErrorCode(4) + BlockDate(20) = 26 bytes
    // Used by GNJoy LATAM and other modern official servers
    if (packetId === PACKET_IDS.AC_REFUSE_LOGIN3) {
        const errorCode = data.readUInt32LE(2);
        return {
            packetId,
            packetName: 'AC_REFUSE_LOGIN3',
            errorCode,
            reason: getRefuseReason(errorCode),
            blockDate: data.length >= 26 ? readFixedString(data, 6, 20) : null
        };
    }

    return null;
}

/**
 * Gets human-readable refusal reason
 * @param {number} errorCode
 * @returns {string}
 */
function getRefuseReason(errorCode) {
    const reasons = {
        0: 'Unregistered ID',
        1: 'Incorrect password',
        2: 'Account expired',
        3: 'Rejected from server',
        4: 'Blocked by GM',
        5: 'Not latest game EXE',
        6: 'Banned',
        7: 'Server over-population',
        8: 'Account limit from company',
        9: 'Ban by DBA',
        10: 'Email not confirmed',
        11: 'Ban by GM',
        12: 'Working in DB',
        13: 'Self Lock',
        14: 'Not permitted group',
        15: 'Not permitted group',
        99: 'Account gone',
        100: 'Login info remains',
        5011: 'Authentication failed (GNJoy)',
    };

    return reasons[errorCode] || `Unknown error (${errorCode})`;
}

/**
 * Tries to identify any RO packet in raw data
 * @param {Buffer} data
 * @returns {Object} Identification result
 */
function identifyPacket(data) {
    if (!data || data.length < 2) {
        return { identified: false, reason: 'Data too short' };
    }

    const packetId = data.readUInt16LE(0);
    const packetLength = data.length >= 4 ? data.readUInt16LE(2) : data.length;

    // Known responses
    const knownPackets = {
        [PACKET_IDS.AC_ACCEPT_LOGIN]: 'Login Accepted (server list with player counts)',
        [PACKET_IDS.AC_ACCEPT_LOGIN2]: 'Login Accepted v2 (server list with player counts)',
        [PACKET_IDS.AC_REFUSE_LOGIN]: 'Login Refused (standard)',
        [PACKET_IDS.AC_REFUSE_LOGIN3]: 'Login Refused v3 (GNJoy)',
        [PACKET_IDS.AC_ACK_HASH]: 'Hash Check Acknowledgement',
    };

    if (knownPackets[packetId]) {
        return {
            identified: true,
            packetId: `0x${packetId.toString(16).padStart(4, '0')}`,
            description: knownPackets[packetId],
            dataLength: data.length,
            packetLength
        };
    }

    return {
        identified: false,
        packetId: `0x${packetId.toString(16).padStart(4, '0')}`,
        reason: 'Unknown packet ID',
        dataLength: data.length,
        rawHex: data.slice(0, Math.min(32, data.length)).toString('hex')
    };
}

// ============================================================
// Connection Helpers
// ============================================================

/**
 * Connects to a host:port and collects any initial data sent by the server
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs=5000] - Timeout in ms
 * @returns {Promise<Object>} Connection result
 */
function probePort(host, port, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const socket = new net.Socket();
        const receivedData = [];

        socket.setTimeout(timeoutMs);

        socket.on('connect', () => {
            const connectTime = Date.now() - startTime;
            // Wait a moment for any initial data the server might send
            setTimeout(() => {
                const data = receivedData.length > 0 ? Buffer.concat(receivedData) : null;
                socket.destroy();
                resolve({
                    open: true,
                    connectTime,
                    host,
                    port,
                    receivedData: data,
                    receivedBytes: data?.length || 0,
                    packetInfo: data ? identifyPacket(data) : null
                });
            }, 1500); // Wait 1.5s for server to send data
        });

        socket.on('data', (chunk) => {
            receivedData.push(chunk);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({
                open: false,
                host,
                port,
                error: 'timeout',
                elapsed: Date.now() - startTime
            });
        });

        socket.on('error', (err) => {
            socket.destroy();
            resolve({
                open: false,
                host,
                port,
                error: err.code || err.message,
                elapsed: Date.now() - startTime
            });
        });

        socket.connect(port, host);
    });
}

/**
 * Connects to a server, sends a packet, and collects the response
 * @param {string} host
 * @param {number} port
 * @param {Buffer} packet - Packet to send
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<Object>} Result with response data
 */
function sendPacket(host, port, packet, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const socket = new net.Socket();
        const receivedData = [];

        socket.setTimeout(timeoutMs);

        socket.on('connect', () => {
            socket.write(packet);
        });

        socket.on('data', (chunk) => {
            receivedData.push(chunk);
            // Got a response, wait a bit more for the full packet
            setTimeout(() => {
                socket.destroy();
            }, 500);
        });

        socket.on('close', () => {
            const data = receivedData.length > 0 ? Buffer.concat(receivedData) : null;
            resolve({
                success: receivedData.length > 0,
                host,
                port,
                responseTime: Date.now() - startTime,
                receivedData: data,
                receivedBytes: data?.length || 0,
                packetInfo: data ? identifyPacket(data) : null
            });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({
                success: false,
                host,
                port,
                error: 'timeout',
                elapsed: Date.now() - startTime
            });
        });

        socket.on('error', (err) => {
            socket.destroy();
            resolve({
                success: false,
                host,
                port,
                error: err.code || err.message,
                elapsed: Date.now() - startTime
            });
        });

        socket.connect(port, host);
    });
}

/**
 * Attempts login with a specific client version and returns the result
 * @param {string} host
 * @param {number} port
 * @param {string} username
 * @param {string} password
 * @param {number} [clientVersion=20]
 * @param {number} [timeoutMs=8000]
 * @returns {Promise<Object>} Login result
 */
function attemptLoginSingle(host, port, username, password, clientVersion = 20, timeoutMs = 8000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const socket = new net.Socket();
        const receivedData = [];

        socket.setTimeout(timeoutMs);

        socket.on('connect', () => {
            const loginPacket = buildLoginPacket(username, password, clientVersion);
            socket.write(loginPacket);
        });

        socket.on('data', (chunk) => {
            receivedData.push(chunk);
            // Got response, give server a moment to send full data
            setTimeout(() => {
                socket.destroy();
            }, 500);
        });

        socket.on('close', () => {
            const data = receivedData.length > 0 ? Buffer.concat(receivedData) : null;
            const responseTime = Date.now() - startTime;

            if (!data) {
                return resolve({
                    success: false,
                    error: 'No response data',
                    responseTime,
                    clientVersion
                });
            }

            // Try to parse as login accepted
            const loginResult = parseLoginAccepted(data);
            if (loginResult) {
                return resolve({
                    success: true,
                    type: 'login_accepted',
                    servers: loginResult.servers,
                    authData: {
                        accountId: loginResult.accountId,
                        authCode: loginResult.authCode,
                        userLevel: loginResult.userLevel,
                        gender: loginResult.gender
                    },
                    responseTime,
                    clientVersion
                });
            }

            // Try to parse as login refused (standard 0x006A or newer 0x083E)
            const refusedResult = parseLoginRefused(data);
            if (refusedResult) {
                return resolve({
                    success: false,
                    type: 'login_refused',
                    packetName: refusedResult.packetName,
                    errorCode: refusedResult.errorCode,
                    reason: refusedResult.reason,
                    responseTime,
                    clientVersion
                });
            }

            // Unknown response
            const packetInfo = identifyPacket(data);
            resolve({
                success: false,
                type: 'unknown_response',
                packetInfo,
                rawHex: data.slice(0, 64).toString('hex'),
                responseTime,
                clientVersion
            });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({
                success: false,
                error: 'timeout',
                elapsed: Date.now() - startTime,
                clientVersion
            });
        });

        socket.on('error', (err) => {
            socket.destroy();
            resolve({
                success: false,
                error: err.code || err.message,
                elapsed: Date.now() - startTime,
                clientVersion
            });
        });

        socket.connect(port, host);
    });
}

/**
 * Attempts login trying multiple client versions for compatibility
 * GNJoy LATAM tested versions:
 *   - v20: responds with 0x083E (newer refusal, error 5011)
 *   - v46: responds with 0x006A (standard refusal) or 0x083E
 *   - v55: responds with 0x083E (newer refusal, error 5011)
 * 
 * @param {string} host
 * @param {number} port
 * @param {string} username
 * @param {string} password
 * @param {number} [timeoutMs=8000]
 * @returns {Promise<Object>} Best login result
 */
async function attemptLogin(host, port, username, password, timeoutMs = 8000) {
    // Try versions in order of most likely to succeed on GNJoy LATAM
    const versions = [20, 46, 55];

    for (const version of versions) {
        logger.debug(`Attempting login with client version ${version}...`);

        const result = await attemptLoginSingle(host, port, username, password, version, timeoutMs);

        // If we got the server list, return immediately
        if (result.success) {
            logger.info(`Login succeeded with version ${version}`, {
                serverCount: result.servers?.length
            });
            return result;
        }

        // If we got a definitive refusal (wrong password, etc), 
        // no point trying other versions
        if (result.type === 'login_refused' && 
            (result.errorCode === 1 || result.errorCode === 0)) {
            logger.debug(`Login refused with version ${version}: ${result.reason}`);
            return result;
        }

        logger.debug(`Version ${version} result: ${result.type || result.error}`);
    }

    // Return the last result
    return {
        success: false,
        error: 'All client versions failed',
        versionsAttempted: versions
    };
}

module.exports = {
    PACKET_IDS,
    buildLoginPacket,
    buildPingPacket,
    buildCharEnterPacket,
    parseLoginAccepted,
    parseLoginRefused,
    getRefuseReason,
    identifyPacket,
    probePort,
    sendPacket,
    attemptLogin,
    attemptLoginSingle,
    // Helpers
    writeUInt16LE,
    writeUInt32LE,
    writeFixedString,
    readFixedString
};
