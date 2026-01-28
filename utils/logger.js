/**
 * Simple logging utility
 * Provides structured logging with different log levels
 * Includes circular buffer for storing recent logs (for admin panel)
 */

const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

const currentLogLevel = process.env.LOG_LEVEL 
    ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
    : LOG_LEVELS.INFO;

// Circular buffer for recent logs (for admin panel)
const LOG_BUFFER_SIZE = 500;
const logBuffer = [];

/**
 * Adds a log entry to the circular buffer
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {any} data - Additional data
 */
function addToBuffer(level, message, data) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        data: data || null
    };
    
    logBuffer.push(entry);
    
    // Keep buffer at max size (circular)
    if (logBuffer.length > LOG_BUFFER_SIZE) {
        logBuffer.shift();
    }
}

/**
 * Gets recent logs from the buffer
 * @param {Object} options - Filter options
 * @param {string} [options.level] - Filter by level (ERROR, WARN, INFO, DEBUG)
 * @param {number} [options.limit=100] - Maximum number of logs to return
 * @returns {Array} Array of log entries
 */
function getRecentLogs(options = {}) {
    const { level, limit = 100 } = options;
    
    let logs = [...logBuffer];
    
    // Filter by level if specified
    if (level) {
        logs = logs.filter(log => log.level === level.toUpperCase());
    }
    
    // Return last N logs (most recent first)
    return logs.slice(-limit).reverse();
}

/**
 * Clears the log buffer
 */
function clearLogs() {
    logBuffer.length = 0;
}

/**
 * Formats log message with timestamp
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {any} data - Additional data to log
 * @returns {string} Formatted log message
 */
function formatLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | Data: ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] ${message}${dataStr}`;
}

const logger = {
    error: (message, data) => {
        addToBuffer('ERROR', message, data);
        if (currentLogLevel >= LOG_LEVELS.ERROR) {
            console.error(formatLog('ERROR', message, data));
        }
    },
    
    warn: (message, data) => {
        addToBuffer('WARN', message, data);
        if (currentLogLevel >= LOG_LEVELS.WARN) {
            console.warn(formatLog('WARN', message, data));
        }
    },
    
    info: (message, data) => {
        addToBuffer('INFO', message, data);
        if (currentLogLevel >= LOG_LEVELS.INFO) {
            console.log(formatLog('INFO', message, data));
        }
    },
    
    debug: (message, data) => {
        addToBuffer('DEBUG', message, data);
        if (currentLogLevel >= LOG_LEVELS.DEBUG) {
            console.log(formatLog('DEBUG', message, data));
        }
    },
    
    // Admin panel functions
    getRecentLogs,
    clearLogs
};

module.exports = logger;

