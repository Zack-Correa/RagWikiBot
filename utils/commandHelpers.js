/**
 * Command Helpers
 * Shared utilities for slash command definitions
 */

/**
 * Returns server choices for Discord slash commands
 * @returns {Array} Array of choice objects
 */
function getServerChoices() {
    return [
        { name: 'Freya', value: 'FREYA' },
        { name: 'Nidhogg', value: 'NIDHOGG' },
        { name: 'Yggdrasil', value: 'YGGDRASIL' }
    ];
}

/**
 * Returns store type choices for Discord slash commands
 * @returns {Array} Array of choice objects
 */
function getStoreTypeChoices() {
    return [
        { name: 'Comprando', value: 'BUY' },
        { name: 'Vendendo', value: 'SELL' }
    ];
}

/**
 * Server names constant
 */
const SERVERS = ['FREYA', 'NIDHOGG', 'YGGDRASIL'];

/**
 * Store types constant
 */
const STORE_TYPES = ['BUY', 'SELL'];

module.exports = {
    getServerChoices,
    getStoreTypeChoices,
    SERVERS,
    STORE_TYPES
};
