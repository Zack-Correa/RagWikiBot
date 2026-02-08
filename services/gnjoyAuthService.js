/**
 * GNJoy Authentication Service
 * Automatically obtains auth tokens for RO game login via web authentication
 * 
 * This service attempts to authenticate with GNJoy web portal and extract
 * the game token needed for SSO login (packet 0x0825).
 */

const axios = require('axios');
const { authenticator } = require('otplib');
const logger = require('../utils/logger');

// GNJoy web endpoints
const ENDPOINTS = {
    BASE: 'https://ro.gnjoylatam.com',
    LOGIN: 'https://ro.gnjoylatam.com/api/auth/login',
    CSRF: 'https://ro.gnjoylatam.com/api/auth/csrf',
    SESSION: 'https://ro.gnjoylatam.com/api/auth/session',
    MEMBER_PORTAL: 'https://member.gnjoylatam.com/pt'
};

// Token cache
let cachedToken = null;
let tokenExpiresAt = null;
const TOKEN_CACHE_TTL = 50 * 60 * 1000; // 50 minutes (tokens typically last ~1 hour)

/**
 * Gets CSRF token from GNJoy
 * @returns {Promise<string>} CSRF token
 */
async function getCSRFToken() {
    try {
        const response = await axios.get(ENDPOINTS.CSRF, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': ENDPOINTS.BASE + '/pt'
            },
            timeout: 10000
        });

        if (response.data && response.data.csrfToken) {
            return response.data.csrfToken;
        }

        throw new Error('CSRF token not found in response');
    } catch (error) {
        logger.error('Failed to get CSRF token', { error: error.message });
        throw new Error(`CSRF token error: ${error.message}`);
    }
}

/**
 * Generates TOTP code from secret
 * @param {string} secret - TOTP secret (base32)
 * @returns {string} 6-digit TOTP code
 */
function generateTOTP(secret) {
    try {
        return authenticator.generate(secret);
    } catch (error) {
        logger.error('Failed to generate TOTP', { error: error.message });
        throw new Error(`TOTP generation failed: ${error.message}`);
    }
}

/**
 * Attempts web authentication with GNJoy
 * @param {string} email - Account email
 * @param {string} password - Account password
 * @param {string} [totpSecret] - TOTP secret for 2FA (optional)
 * @returns {Promise<Object>} Auth result with token
 */
async function authenticateWeb(email, password, totpSecret = null) {
    try {
        // Step 1: Get CSRF token
        logger.debug('Getting CSRF token...');
        const csrfToken = await getCSRFToken();

        // Step 2: Generate TOTP if secret provided
        let otp = null;
        if (totpSecret) {
            otp = generateTOTP(totpSecret);
            logger.debug('Generated TOTP code', { code: otp });
        }

        // Step 3: Attempt login with various payload formats
        const loginPayloads = [
            // Format 1: email + password + otp
            { email, password, otp },
            // Format 2: userId + userPw + otp
            { userId: email, userPw: password, otp },
            // Format 3: id + pw + otp
            { id: email, pw: password, otp },
            // Format 4: username + password + otp
            { username: email, password, otp },
            // Format 5: account + password + otp
            { account: email, password, otp },
            // Format 6: loginId + loginPwd + otpCode
            { loginId: email, loginPwd: password, otpCode: otp },
            // Format 7: user_id + user_pw + totp
            { user_id: email, user_pw: password, totp: otp },
        ];

        for (const payload of loginPayloads) {
            // Remove undefined/null values
            const cleanPayload = Object.fromEntries(
                Object.entries(payload).filter(([_, v]) => v != null)
            );

            try {
                logger.debug('Attempting login with payload format', { 
                    keys: Object.keys(cleanPayload),
                    hasOtp: !!cleanPayload.otp || !!cleanPayload.otpCode || !!cleanPayload.totp
                });

                const response = await axios.post(
                    ENDPOINTS.LOGIN,
                    cleanPayload,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'application/json',
                            'Origin': ENDPOINTS.BASE,
                            'Referer': ENDPOINTS.BASE + '/pt',
                            'X-CSRF-Token': csrfToken
                        },
                        timeout: 15000,
                        validateStatus: (status) => status < 500 // Don't throw on 4xx
                    }
                );

                // Check for success (200-299)
                if (response.status >= 200 && response.status < 300) {
                    const data = response.data;

                    // Look for token in various possible fields
                    const token = data.token || 
                                 data.authToken || 
                                 data.accessToken || 
                                 data.sessionToken ||
                                 data.gameToken ||
                                 data.loginToken ||
                                 data.token;

                    if (token) {
                        logger.info('Web authentication successful', {
                            status: response.status,
                            tokenLength: token.length
                        });

                        // Cache token
                        cachedToken = token;
                        tokenExpiresAt = Date.now() + TOKEN_CACHE_TTL;

                        return {
                            success: true,
                            token,
                            expiresIn: TOKEN_CACHE_TTL,
                            data: data
                        };
                    }

                    // Check if response indicates success but no token field
                    if (data.success || data.authenticated) {
                        logger.warn('Login successful but no token found in response', {
                            responseKeys: Object.keys(data)
                        });
                        // Try to get session info
                        return await getSessionInfo();
                    }
                }

                // If we got a specific error (not "Bad request"), log it
                if (response.status !== 400) {
                    logger.debug('Login attempt returned status', {
                        status: response.status,
                        data: typeof response.data === 'string' ? response.data.substring(0, 200) : response.data
                    });
                }

            } catch (error) {
                // If it's not a 400 Bad Request, it might be a different issue
                if (error.response && error.response.status !== 400) {
                    logger.debug('Login attempt error', {
                        status: error.response.status,
                        data: error.response.data
                    });
                }
                // Continue to next payload format
                continue;
            }
        }

        // If all formats failed, try form-urlencoded
        logger.debug('Trying form-urlencoded login...');
        try {
            const formData = new URLSearchParams();
            formData.append('email', email);
            formData.append('password', password);
            if (otp) formData.append('otp', otp);

            const response = await axios.post(
                ENDPOINTS.LOGIN,
                formData.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': '*/*',
                        'Origin': ENDPOINTS.BASE,
                        'Referer': ENDPOINTS.BASE + '/pt',
                        'X-CSRF-Token': csrfToken
                    },
                    timeout: 15000,
                    validateStatus: (status) => status < 500
                }
            );

            if (response.status >= 200 && response.status < 300) {
                const token = response.data?.token || response.data?.authToken;
                if (token) {
                    cachedToken = token;
                    tokenExpiresAt = Date.now() + TOKEN_CACHE_TTL;
                    return { success: true, token, expiresIn: TOKEN_CACHE_TTL };
                }
            }
        } catch (error) {
            // Ignore form-urlencoded errors
        }

        throw new Error('All login attempts failed - could not obtain token from web auth');

    } catch (error) {
        logger.error('Web authentication failed', { 
            error: error.message,
            email: email.substring(0, 5) + '...'
        });
        throw error;
    }
}

/**
 * Gets session info (may contain token)
 * @returns {Promise<Object>} Session data
 */
async function getSessionInfo() {
    try {
        const response = await axios.get(ENDPOINTS.SESSION, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        return {
            success: true,
            session: response.data
        };
    } catch (error) {
        logger.debug('Failed to get session info', { error: error.message });
        return { success: false, error: error.message };
    }
}

/**
 * Gets a valid auth token (from cache or by authenticating)
 * @param {string} email - Account email
 * @param {string} password - Account password
 * @param {string} [totpSecret] - TOTP secret for 2FA
 * @returns {Promise<string>} Auth token
 */
async function getAuthToken(email, password, totpSecret = null) {
    // Return cached token if still valid
    if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
        logger.debug('Using cached auth token');
        return cachedToken;
    }

    // Authenticate to get new token
    logger.info('Authenticating with GNJoy web portal to obtain game token...');
    const result = await authenticateWeb(email, password, totpSecret);

    if (result.success && result.token) {
        return result.token;
    }

    throw new Error('Failed to obtain auth token from web authentication');
}

/**
 * Clears cached token (force refresh on next request)
 */
function clearTokenCache() {
    cachedToken = null;
    tokenExpiresAt = null;
    logger.debug('Token cache cleared');
}

module.exports = {
    authenticateWeb,
    getAuthToken,
    getCSRFToken,
    generateTOTP,
    getSessionInfo,
    clearTokenCache
};
