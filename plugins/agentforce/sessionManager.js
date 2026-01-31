/**
 * Session Manager
 * Manages Agentforce sessions per Discord user
 * Handles session creation, retrieval, expiration, and cleanup
 */

const agentforceClient = require('./client');

// Session storage (userId -> session)
const sessions = new Map();

// Configuration
let config = {
    timeoutMinutes: 30,
    logger: console
};

// Cleanup interval
let cleanupInterval = null;

/**
 * Initialize the session manager
 * @param {Object} options - Configuration options
 */
function initialize(options = {}) {
    config = { ...config, ...options };
    
    // Start cleanup interval (every 5 minutes)
    if (!cleanupInterval) {
        cleanupInterval = setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
        cleanupInterval.unref(); // Don't prevent process exit
    }
    
    config.logger.info('Session manager initialized', {
        timeoutMinutes: config.timeoutMinutes
    });
}

/**
 * Shutdown the session manager
 */
function shutdown() {
    // Clear cleanup interval
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
    
    // End all sessions
    for (const [userId, session] of sessions) {
        try {
            agentforceClient.endSession(session.sessionId).catch(() => {});
        } catch (e) {
            // Ignore errors during shutdown
        }
    }
    
    sessions.clear();
    config.logger.info('Session manager shutdown');
}

/**
 * Get an existing session for a user
 * @param {string} userId - Discord user ID
 * @returns {Object|null} Session data or null
 */
function getSession(userId) {
    const session = sessions.get(userId);
    
    if (!session) return null;
    
    // Check if session is expired
    if (isExpired(session)) {
        // End the expired session
        clearSession(userId);
        return null;
    }
    
    // Update last activity
    session.lastActivity = Date.now();
    
    return session;
}

/**
 * Create a new session for a user
 * @param {string} userId - Discord user ID
 * @param {Object} sessionData - Session data from Agentforce
 * @returns {Object} Created session
 */
function createSession(userId, sessionData) {
    // Clear any existing session
    if (sessions.has(userId)) {
        clearSession(userId);
    }
    
    const session = {
        userId,
        sessionId: sessionData.sessionId,
        externalKey: sessionData.externalKey,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0
    };
    
    sessions.set(userId, session);
    
    config.logger.debug('Session created', {
        userId,
        sessionId: session.sessionId
    });
    
    return session;
}

/**
 * Update session activity (called after each message)
 * @param {string} userId - Discord user ID
 */
function updateActivity(userId) {
    const session = sessions.get(userId);
    
    if (session) {
        session.lastActivity = Date.now();
        session.messageCount++;
    }
}

/**
 * Clear/end a user's session
 * @param {string} userId - Discord user ID
 * @returns {boolean} True if session was cleared
 */
function clearSession(userId) {
    const session = sessions.get(userId);
    
    if (!session) return false;
    
    // Try to end the session on Agentforce
    agentforceClient.endSession(session.sessionId).catch((error) => {
        config.logger.debug('Error ending session on Agentforce', {
            userId,
            error: error.message
        });
    });
    
    sessions.delete(userId);
    
    config.logger.debug('Session cleared', { userId });
    
    return true;
}

/**
 * Check if a session is expired
 * @param {Object} session - Session object
 * @returns {boolean} True if expired
 */
function isExpired(session) {
    if (!session) return true;
    
    const timeoutMs = config.timeoutMinutes * 60 * 1000;
    const timeSinceActivity = Date.now() - session.lastActivity;
    
    return timeSinceActivity > timeoutMs;
}

/**
 * Cleanup expired sessions
 */
function cleanupExpiredSessions() {
    let cleaned = 0;
    
    for (const [userId, session] of sessions) {
        if (isExpired(session)) {
            clearSession(userId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        config.logger.debug('Cleaned up expired sessions', { count: cleaned });
    }
}

/**
 * Get all active sessions
 * @returns {Array} Array of session info
 */
function getAllSessions() {
    const result = [];
    
    for (const [userId, session] of sessions) {
        result.push({
            userId,
            sessionId: session.sessionId,
            createdAt: new Date(session.createdAt).toISOString(),
            lastActivity: new Date(session.lastActivity).toISOString(),
            messageCount: session.messageCount,
            isExpired: isExpired(session)
        });
    }
    
    return result;
}

/**
 * Get session statistics
 * @returns {Object} Session stats
 */
function getStats() {
    let totalMessages = 0;
    let expiredCount = 0;
    
    for (const session of sessions.values()) {
        totalMessages += session.messageCount;
        if (isExpired(session)) expiredCount++;
    }
    
    return {
        activeSessions: sessions.size,
        expiredSessions: expiredCount,
        totalMessages,
        timeoutMinutes: config.timeoutMinutes
    };
}

/**
 * Check if a user has an active session
 * @param {string} userId - Discord user ID
 * @returns {boolean} True if has active session
 */
function hasSession(userId) {
    const session = sessions.get(userId);
    return session && !isExpired(session);
}

module.exports = {
    initialize,
    shutdown,
    getSession,
    createSession,
    updateActivity,
    clearSession,
    isExpired,
    cleanupExpiredSessions,
    getAllSessions,
    getStats,
    hasSession
};
