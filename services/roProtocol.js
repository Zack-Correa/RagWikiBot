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
    AC_ACCEPT_LOGIN3: 0x0C32,      // Login accepted v3 (GNJoy LATAM, 559 bytes)
    AC_REFUSE_LOGIN: 0x006A,       // Login refused (standard, 23 bytes)
    AC_REFUSE_LOGIN3: 0x083E,      // Login refused v3 (GNJoy LATAM, 26 bytes)
    AC_ACK_HASH: 0x0205,           // Hash check ack
    SC_NOTIFY_BAN: 0x0081,         // Server notification (already logged in, banned, etc.)

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
 * Builds a guest login packet (0x0064) - user=guest, pass=guest, version=1
 * Used by some servers to allow anonymous server list / population check.
 * @param {number} [clientVersion=1] - Client version (from clientinfo.xml)
 * @param {number} [clientType=1] - Client type (master_ver)
 * @returns {Buffer} Login packet (55 bytes)
 */
function buildGuestLoginPacket(clientVersion = 1, clientType = 1) {
    return buildLoginPacket('guest', 'guest', clientVersion, clientType);
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

/**
 * Builds GNJoy LATAM SSO Login packet (0x0825)
 * Based on Wireshark capture analysis
 * 
 * Structure:
 *   Offset  Size  Field
 *   0       2     Packet ID: 0x0825
 *   2       2     Packet Length: 417
 *   4       4     Version: 1
 *   8       1     Client Type: 0x16
 *   9       24    Username (email)
 *   33      27    Passcode/Hash (binary)
 *   60      17    MAC Address: "50-EB-F6-26-B7-EE"
 *   77      15    IP Address: "192.168.1.171"
 *   92      325   Auth Token (Base64 string)
 * 
 * @param {string} username - Email/username
 * @param {string} authToken - Base64 auth token (from launcher/web auth)
 * @param {string} [macAddress] - MAC address (default: random)
 * @param {string} [ipAddress] - IP address (default: 127.0.0.1)
 * @param {number} [version=1] - Client version
 * @param {number} [clientType=0x16] - Client type
 * @returns {Buffer} SSO login packet (417 bytes)
 */
function buildSSOLoginPacket(username, authToken, macAddress = null, ipAddress = null, version = 1, clientType = 0x16) {
    const packet = Buffer.alloc(417, 0);
    let offset = 0;

    // Packet ID
    packet.writeUInt16LE(0x0825, offset); offset += 2;
    // Packet Length
    packet.writeUInt16LE(417, offset); offset += 2;
    // Version
    packet.writeUInt32LE(version, offset); offset += 4;
    // Client Type
    packet.writeUInt8(clientType, offset); offset += 1;
    
    // Username (24 bytes)
    // Note: Original capture shows username field may have special byte at end (0x60)
    // We'll write username and let it be padded naturally
    const usernameBuf = Buffer.from(username, 'ascii');
    const usernameLen = Math.min(usernameBuf.length, 23);
    usernameBuf.copy(packet, offset, 0, usernameLen);
    // Copy the exact structure from capture: username ends with null, then 0x60 byte
    // But for now, just null-pad normally
    if (usernameLen < 24) {
        packet[offset + usernameLen] = 0; // Null terminator
        // Original has 0x60 at offset 32, but we'll leave it as padding for now
    }
    offset += 24;
    
    // Passcode/Hash (27 bytes) - appears to be some kind of hash or encrypted data
    // From capture: 305400a869c119efff7f3f00000000ac05f913fecaadba00000000
    // This might be a hash of password+OTP or similar. Using captured value for now.
    const passcodeHex = '305400a869c119efff7f3f00000000ac05f913fecaadba00000000';
    const passcodeBuf = Buffer.from(passcodeHex, 'hex');
    passcodeBuf.copy(packet, offset, 0, 27);
    offset += 27;
    
    // MAC Address (17 bytes, null-terminated string)
    const mac = macAddress || '50-EB-F6-26-B7-EE';
    const macBuf = Buffer.from(mac, 'ascii');
    const macLen = Math.min(macBuf.length, 16);
    macBuf.copy(packet, offset, 0, macLen);
    // Ensure null terminator if string is shorter than 16
    if (macLen < 16) {
        packet[offset + macLen] = 0;
    }
    offset += 17;
    
    // IP Address (15 bytes, null-terminated string)
    const ip = ipAddress || '127.0.0.1';
    const ipBuf = Buffer.from(ip, 'ascii');
    const ipLen = Math.min(ipBuf.length, 14);
    ipBuf.copy(packet, offset, 0, ipLen);
    // Ensure null terminator if string is shorter than 14
    if (ipLen < 14) {
        packet[offset + ipLen] = 0;
    }
    offset += 15;
    
    // Auth Token (325 bytes, Base64 string, null-terminated)
    const tokenBuf = Buffer.from(authToken, 'ascii');
    const tokenLen = Math.min(tokenBuf.length, 324);
    tokenBuf.copy(packet, offset, 0, tokenLen);
    // Ensure null terminator at the end
    if (tokenLen < 324) {
        packet[offset + tokenLen] = 0;
    }
    
    return packet;
}

// ============================================================
// Packet Parsers
// ============================================================

/**
 * Parses GNJoy LATAM login accepted response (0x0C32)
 * Structure: Header (67 bytes) + Server entries (165 bytes each)
 * Each server entry:
 *   Offset  Size  Field
 *   0       2     Padding (0x0000)
 *   2       2     Port (0x1194 = 4500)
 *   4       20    Server name (null-padded)
 *   24      2     Player count (uint16LE)
 *   26      4     Padding
 *   30      128   URL string (null-terminated)
 *   158     7     Suffix data
 * 
 * @param {Buffer} data - Raw packet data
 * @returns {Object|null} Parsed response with server list
 */
function parseGNJoyLoginAccepted(data) {
    if (!data || data.length < 4) return null;

    const packetId = data.readUInt16LE(0);
    const packetLength = data.readUInt16LE(2);

    if (packetId !== PACKET_IDS.AC_ACCEPT_LOGIN3) {
        return null;
    }

    try {
        // Header: ID(2) + Length(2) + AuthCode(4) + AccountID(4) + padding/session = 64 bytes
        const headerSize = 64;
        const entrySize = 165;

        if (data.length < headerSize) {
            logger.warn('GNJoy parse: packet too short for header', { length: data.length, headerSize });
            return null;
        }

        const authCode = data.readUInt32LE(4);
        const accountId = data.readUInt32LE(8);

        const dataRegion = Math.min(data.length, packetLength);
        const numEntries = Math.floor((dataRegion - headerSize) / entrySize);

        logger.debug('GNJoy parse: header OK', {
            packetLength,
            dataLength: data.length,
            headerSize,
            entrySize,
            numEntries
        });

        const servers = [];

        for (let i = 0; i < numEntries; i++) {
            const entryStart = headerSize + (i * entrySize);
            if (entryStart + entrySize > dataRegion) break;

            // Entry layout (165 bytes) — same as CHAR_SERVER_INFO but extended:
            //   [0-3]   IP address (4 bytes, often 0.0.0.0 when URL is used)
            //   [4-5]   port (LE16, e.g. 4500)
            //   [6-25]  server name (20 bytes, null-terminated)
            //   [26-27] player count (LE16)
            //   [28-29] server type (LE16)
            //   [30-31] server index (LE16)
            //   [32+]   URL string + padding (e.g. "lt-world-1.gnjoylatam.com:4500")
            const port = data.readUInt16LE(entryStart + 4);
            const nameStart = entryStart + 6;
            const nameRaw = data.slice(nameStart, nameStart + 20);
            const nullIdx = nameRaw.indexOf(0);
            const serverName = nameRaw.toString('ascii', 0, nullIdx >= 0 ? nullIdx : 20).trim();

            const playerCount = data.readUInt16LE(entryStart + 26);

            const serverType = data.readUInt16LE(entryStart + 28);
            const serverIndex = data.readUInt16LE(entryStart + 30);

            // Search for URL pattern "lt-" in the extended part of the entry (offset 32+)
            const entryEnd = entryStart + entrySize;
            const urlSearchStart = entryStart + 32;
            const urlMarker = Buffer.from('lt-');
            const urlStart = data.indexOf(urlMarker, urlSearchStart);
            let serverUrl = '';
            let ip = '';

            if (urlStart >= 0 && urlStart < entryEnd) {
                const urlEnd = data.indexOf(0, urlStart);
                serverUrl = data.slice(urlStart, urlEnd > urlStart && urlEnd < entryEnd ? urlEnd : Math.min(urlStart + 60, entryEnd)).toString('ascii').trim();
                const urlMatch = serverUrl.match(/^([^:]+):(\d+)$/);
                if (urlMatch) {
                    ip = urlMatch[1];
                }
            }

            if (serverName) {
                servers.push({
                    name: serverName,
                    playerCount,
                    ip,
                    port,
                    url: serverUrl,
                    serverType,
                    serverIndex
                });

                logger.debug(`GNJoy parse: entry ${i}`, {
                    name: serverName,
                    playerCount,
                    port,
                    serverType,
                    serverIndex,
                    url: serverUrl || '(none)'
                });
            }
        }

        // If positional parsing found nothing, try heuristic search for server names
        if (servers.length === 0 && dataRegion > headerSize) {
            logger.info('GNJoy parse: positional parsing found 0 entries, trying heuristic scan...');
            const knownNames = ['Freya', 'Nidhogg', 'Yggdrasil', 'FREYA', 'NIDHOGG', 'YGGDRASIL'];

            for (const name of knownNames) {
                const nameBuffer = Buffer.from(name, 'ascii');
                let searchStart = headerSize;

                while (searchStart < dataRegion) {
                    const idx = data.indexOf(nameBuffer, searchStart);
                    if (idx === -1 || idx >= dataRegion) break;

                    // Try to read player count 20 bytes after name start
                    const pcOffset = idx + 20;
                    if (pcOffset + 2 <= dataRegion) {
                        const playerCount = data.readUInt16LE(pcOffset);
                        // Sanity check: player count should be reasonable (0-50000)
                        if (playerCount >= 0 && playerCount < 50000) {
                            // Avoid duplicates
                            if (!servers.find(s => s.name === name)) {
                                servers.push({
                                    name,
                                    playerCount,
                                    ip: '',
                                    port: 0,
                                    url: '',
                                    serverType: 0,
                                    serverIndex: servers.length
                                });
                                logger.info(`GNJoy parse: heuristic found "${name}" with ${playerCount} players at offset ${idx}`);
                            }
                        }
                    }
                    searchStart = idx + name.length;
                }
            }
        }

        return {
            packetId,
            authCode,
            accountId,
            servers
        };
    } catch (error) {
        logger.error('Error parsing GNJoy login response', { error: error.message });
        return null;
    }
}

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

    // Try GNJoy format first
    if (packetId === PACKET_IDS.AC_ACCEPT_LOGIN3) {
        return parseGNJoyLoginAccepted(data);
    }

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
        [PACKET_IDS.AC_ACCEPT_LOGIN3]: 'Login Accepted v3 (GNJoy LATAM, server list with player counts)',
        [PACKET_IDS.AC_REFUSE_LOGIN]: 'Login Refused (standard)',
        [PACKET_IDS.AC_REFUSE_LOGIN3]: 'Login Refused v3 (GNJoy)',
        [PACKET_IDS.AC_ACK_HASH]: 'Hash Check Acknowledgement',
        [PACKET_IDS.SC_NOTIFY_BAN]: 'Server Notification (already logged in, banned, etc.)',
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
 * Attempts GNJoy SSO login with manual auth token
 * @param {string} host
 * @param {number} port
 * @param {string} username - Email/username
 * @param {string} authToken - Base64 auth token (from Wireshark capture or manual)
 * @param {string} [macAddress] - MAC address
 * @param {string} [ipAddress] - IP address
 * @param {number} [timeoutMs=8000]
 * @returns {Promise<Object>} Login result
 */
function attemptSSOLogin(host, port, username, authToken, macAddress = null, ipAddress = null, timeoutMs = 8000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const socket = new net.Socket();
        const receivedData = [];

        socket.setTimeout(timeoutMs);

        socket.on('connect', () => {
            const ssoPacket = buildSSOLoginPacket(username, authToken, macAddress, ipAddress);
            socket.write(ssoPacket);
        });

        socket.on('data', (chunk) => {
            receivedData.push(chunk);
            // Give server a moment to send full data
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
                    strategy: 'sso'
                });
            }

            // Try to parse as login accepted (0x0069, 0x0AC4, or 0x0C32)
            const loginResult = parseLoginAccepted(data);
            if (loginResult) {
                return resolve({
                    success: true,
                    type: 'login_accepted',
                    strategy: 'sso',
                    servers: loginResult.servers,
                    authData: {
                        accountId: loginResult.accountId,
                        authCode: loginResult.authCode
                    },
                    responseTime
                });
            }

            // Check for server notification (0x0081)
            const respPktId = data.readUInt16LE(0);
            if (respPktId === PACKET_IDS.SC_NOTIFY_BAN && data.length >= 3) {
                const errorCode = data.readUInt8(2);
                const reasons = {
                    0: 'Server shut down',
                    1: 'Someone logged in with this ID',
                    2: 'Timed out / connection lost',
                    3: 'Out of memory',
                    4: 'Server full',
                    5: 'Underaged',
                    8: 'Already logged in / Server still recognizes last login',
                    9: 'Too many connections from this IP',
                    10: 'Banned',
                    15: 'IP not allowed',
                };
                return resolve({
                    success: false,
                    type: 'server_notification',
                    strategy: 'sso',
                    errorCode,
                    reason: reasons[errorCode] || `Unknown notification (${errorCode})`,
                    responseTime
                });
            }

            // Try to parse as login refused
            const refusedResult = parseLoginRefused(data);
            if (refusedResult) {
                return resolve({
                    success: false,
                    type: 'login_refused',
                    strategy: 'sso',
                    packetName: refusedResult.packetName,
                    errorCode: refusedResult.errorCode,
                    reason: refusedResult.reason,
                    responseTime
                });
            }

            // Unknown response
            const packetInfo = identifyPacket(data);
            resolve({
                success: false,
                type: 'unknown_response',
                strategy: 'sso',
                packetInfo,
                rawHex: data.slice(0, 64).toString('hex'),
                responseTime
            });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({
                success: false,
                error: 'timeout',
                elapsed: Date.now() - startTime,
                strategy: 'sso'
            });
        });

        socket.on('error', (err) => {
            socket.destroy();
            resolve({
                success: false,
                error: err.code || err.message,
                elapsed: Date.now() - startTime,
                strategy: 'sso'
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
    buildGuestLoginPacket,
    buildSSOLoginPacket,
    buildPingPacket,
    buildCharEnterPacket,
    parseLoginAccepted,
    parseGNJoyLoginAccepted,
    parseLoginRefused,
    getRefuseReason,
    identifyPacket,
    probePort,
    sendPacket,
    attemptLogin,
    attemptLoginSingle,
    attemptSSOLogin,
    // Helpers
    writeUInt16LE,
    writeUInt32LE,
    writeFixedString,
    readFixedString
};
