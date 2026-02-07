/**
 * General Helpers
 * Shared utility functions used across the application
 */

/**
 * Sleep/delay helper function
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after the delay
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Handles Discord DM errors gracefully
 * @param {Error} error - The error from Discord
 * @param {string} userId - User ID for logging
 * @param {Object} logger - Logger instance
 * @returns {boolean} True if error was handled (DM disabled), false otherwise
 */
function handleDMError(error, userId, logger) {
    if (error.code === 50007) {
        logger.warn('Cannot send DM to user (DMs disabled)', { userId });
        return true;
    }
    return false;
}

module.exports = {
    sleep,
    handleDMError
};
