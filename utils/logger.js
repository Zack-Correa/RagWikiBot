/**
 * Simple logging utility
 * Provides structured logging with different log levels
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
        if (currentLogLevel >= LOG_LEVELS.ERROR) {
            console.error(formatLog('ERROR', message, data));
        }
    },
    
    warn: (message, data) => {
        if (currentLogLevel >= LOG_LEVELS.WARN) {
            console.warn(formatLog('WARN', message, data));
        }
    },
    
    info: (message, data) => {
        if (currentLogLevel >= LOG_LEVELS.INFO) {
            console.log(formatLog('INFO', message, data));
        }
    },
    
    debug: (message, data) => {
        if (currentLogLevel >= LOG_LEVELS.DEBUG) {
            console.log(formatLog('DEBUG', message, data));
        }
    }
};

module.exports = logger;

