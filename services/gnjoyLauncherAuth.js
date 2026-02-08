/**
 * GNJoy Launcher Authentication Service
 * Simulates the game launcher to obtain game tokens for SSO login (packet 0x0825)
 * 
 * The launcher flow:
 * 1. Login to web portal
 * 2. Request game token from launcher API
 * 3. Use token in 0x0825 packet
 */

const axios = require('axios');
const { authenticator } = require('otplib');
const logger = require('../utils/logger');

// Possible launcher API endpoints (to be discovered)
const LAUNCHER_ENDPOINTS = {
    // Common patterns for launcher APIs
    GAME_TOKEN: [
        'https://ro.gnjoylatam.com/api/game/token',
        'https://ro.gnjoylatam.com/api/launcher/token',
        'https://ro.gnjoylatam.com/api/auth/game-token',
        'https://ro.gnjoylatam.com/api/login/game-token',
        'https://member.gnjoylatam.com/api/game/token',
        'https://member.gnjoylatam.com/api/launcher/token',
        'https://api.gnjoylatam.com/game/token',
        'https://api.gnjoylatam.com/launcher/token',
    ],
    
    // Alternative: token might be in session after web login
    SESSION: 'https://ro.gnjoylatam.com/api/auth/session',
    MEMBER_SESSION: 'https://member.gnjoylatam.com/api/session',
};

// Token cache
let cachedGameToken = null;
let tokenExpiresAt = null;
const TOKEN_CACHE_TTL = 50 * 60 * 1000; // 50 minutes

/**
 * Attempts web login first to get session cookies
 * @param {string} email 
 * @param {string} password 
 * @param {string} [totpSecret] 
 * @returns {Promise<Object>} Session cookies and data
 */
async function loginWebPortal(email, password, totpSecret = null) {
    try {
        // Try to get CSRF token
        let csrfToken = null;
        try {
            const csrfResponse = await axios.get('https://ro.gnjoylatam.com/api/auth/csrf', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                },
                timeout: 10000
            });
            csrfToken = csrfResponse.data?.csrfToken;
        } catch (e) {
            logger.debug('CSRF token not available, continuing without it');
        }

        // Generate TOTP if needed
        let otp = null;
        if (totpSecret) {
            otp = authenticator.generate(totpSecret);
        }

        // Try login with various formats
        const loginPayloads = [
            { email, password, otp },
            { userId: email, userPw: password, otp },
            { id: email, pw: password, otp },
            { username: email, password, otp },
        ];

        let sessionCookies = '';
        let sessionData = null;

        for (const payload of loginPayloads) {
            const cleanPayload = Object.fromEntries(
                Object.entries(payload).filter(([_, v]) => v != null)
            );

            try {
                const response = await axios.post(
                    'https://ro.gnjoylatam.com/api/auth/login',
                    cleanPayload,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'application/json',
                            'Origin': 'https://ro.gnjoylatam.com',
                            'Referer': 'https://ro.gnjoylatam.com/pt',
                            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
                        },
                        timeout: 15000,
                        validateStatus: (status) => status < 500
                    }
                );

                // Extract cookies
                const setCookies = response.headers['set-cookie'];
                if (setCookies) {
                    sessionCookies = setCookies.map(c => c.split(';')[0]).join('; ');
                }

                if (response.status >= 200 && response.status < 300) {
                    sessionData = response.data;
                    logger.debug('Web login successful', { status: response.status });
                    break;
                }
            } catch (error) {
                continue;
            }
        }

        return {
            cookies: sessionCookies,
            sessionData,
            success: !!sessionCookies
        };

    } catch (error) {
        logger.error('Web portal login failed', { error: error.message });
        throw error;
    }
}

/**
 * Attempts to get game token from launcher API endpoints
 * @param {string} sessionCookies - Cookies from web login
 * @param {Object} [sessionData] - Session data from web login
 * @returns {Promise<string|null>} Game token or null
 */
async function requestGameToken(sessionCookies, sessionData = null) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(sessionCookies ? { 'Cookie': sessionCookies } : {})
    };

    // Try each possible endpoint
    for (const endpoint of LAUNCHER_ENDPOINTS.GAME_TOKEN) {
        try {
            logger.debug(`Trying launcher endpoint: ${endpoint}`);
            
            // Try GET first
            const getResponse = await axios.get(endpoint, {
                headers,
                timeout: 10000,
                validateStatus: (status) => status < 500
            });

            if (getResponse.status >= 200 && getResponse.status < 300) {
                const token = getResponse.data?.token || 
                             getResponse.data?.gameToken || 
                             getResponse.data?.authToken ||
                             getResponse.data?.loginToken;
                
                if (token && typeof token === 'string' && token.length > 100) {
                    logger.info(`Game token found at ${endpoint} (GET)`);
                    return token;
                }
            }

            // Try POST with session data
            if (sessionData) {
                const postResponse = await axios.post(
                    endpoint,
                    sessionData,
                    {
                        headers,
                        timeout: 10000,
                        validateStatus: (status) => status < 500
                    }
                );

                if (postResponse.status >= 200 && postResponse.status < 300) {
                    const token = postResponse.data?.token || 
                                 postResponse.data?.gameToken || 
                                 postResponse.data?.authToken;
                    
                    if (token && typeof token === 'string' && token.length > 100) {
                        logger.info(`Game token found at ${endpoint} (POST)`);
                        return token;
                    }
                }
            }

        } catch (error) {
            // Continue to next endpoint
            if (error.response?.status !== 404) {
                logger.debug(`Endpoint ${endpoint} error: ${error.message}`);
            }
            continue;
        }
    }

    // Check session endpoints for token
    for (const sessionEndpoint of [LAUNCHER_ENDPOINTS.SESSION, LAUNCHER_ENDPOINTS.MEMBER_SESSION]) {
        try {
            const response = await axios.get(sessionEndpoint, {
                headers,
                timeout: 10000,
                validateStatus: (status) => status < 500
            });

            if (response.status >= 200 && response.status < 300) {
                const data = response.data;
                const token = data?.gameToken || 
                             data?.token || 
                             data?.authToken ||
                             data?.loginToken ||
                             (data?.user && data.user.gameToken);

                if (token && typeof token === 'string' && token.length > 100) {
                    logger.info(`Game token found in session at ${sessionEndpoint}`);
                    return token;
                }

                // Check if token is in nested structure
                if (data && typeof data === 'object') {
                    const deepToken = findTokenInObject(data);
                    if (deepToken) {
                        logger.info(`Game token found deep in session at ${sessionEndpoint}`);
                        return deepToken;
                    }
                }
            }
        } catch (error) {
            continue;
        }
    }

    return null;
}

/**
 * Recursively searches for token-like strings in object
 * @param {Object} obj 
 * @returns {string|null}
 */
function findTokenInObject(obj, depth = 0) {
    if (depth > 5) return null; // Prevent infinite recursion
    
    if (typeof obj === 'string' && obj.length > 100 && /^[A-Za-z0-9+/=]+$/.test(obj)) {
        // Looks like Base64 token
        return obj;
    }

    if (typeof obj === 'object' && obj !== null) {
        for (const value of Object.values(obj)) {
            const found = findTokenInObject(value, depth + 1);
            if (found) return found;
        }
    }

    return null;
}

/**
 * Gets game token for SSO login (packet 0x0825)
 * @param {string} email 
 * @param {string} password 
 * @param {string} [totpSecret] 
 * @returns {Promise<string>} Game token (Base64, ~325 bytes)
 */
async function getGameToken(email, password, totpSecret = null) {
    // Check cache
    if (cachedGameToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
        logger.debug('Using cached game token');
        return cachedGameToken;
    }

    logger.info('Attempting to obtain game token via launcher flow...');

    // Step 1: Login to web portal
    const webLogin = await loginWebPortal(email, password, totpSecret);
    
    if (!webLogin.success) {
        throw new Error('Failed to login to web portal');
    }

    // Step 2: Request game token
    const gameToken = await requestGameToken(webLogin.cookies, webLogin.sessionData);

    if (!gameToken) {
        // If we can't find it automatically, log what we got for debugging
        logger.warn('Game token not found in API responses', {
            hasCookies: !!webLogin.cookies,
            sessionKeys: webLogin.sessionData ? Object.keys(webLogin.sessionData) : []
        });
        
        throw new Error('Game token not found. The launcher API endpoint may need to be discovered via network capture.');
    }

    // Cache token
    cachedGameToken = gameToken;
    tokenExpiresAt = Date.now() + TOKEN_CACHE_TTL;

    logger.info('Game token obtained successfully', {
        tokenLength: gameToken.length,
        tokenPreview: gameToken.substring(0, 50) + '...'
    });

    return gameToken;
}

/**
 * Clears cached token
 */
function clearTokenCache() {
    cachedGameToken = null;
    tokenExpiresAt = null;
    logger.debug('Game token cache cleared');
}

module.exports = {
    getGameToken,
    loginWebPortal,
    requestGameToken,
    clearTokenCache
};
