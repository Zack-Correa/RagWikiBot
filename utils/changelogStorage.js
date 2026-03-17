/**
 * Changelog Storage
 * Persists processed changelog topic IDs and generated summaries
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const STORAGE_FILE = path.join(__dirname, '../data/changelog-cache.json');

let cache = {
    processedTopics: {},
    initialized: false,
    lastCheck: null,
    lastChangelog: null,
    channels: {},
    config: {
        channelId: null,
        serverFilter: 'LATAM',
        autoPost: true
    }
};

function load() {
    try {
        if (fs.existsSync(STORAGE_FILE)) {
            const data = fs.readFileSync(STORAGE_FILE, 'utf8');
            const parsed = JSON.parse(data);
            cache = {
                processedTopics: parsed.processedTopics || {},
                initialized: parsed.initialized || false,
                lastCheck: parsed.lastCheck || null,
                lastChangelog: parsed.lastChangelog || null,
                channels: parsed.channels || {},
                config: { ...cache.config, ...parsed.config }
            };
            // Migrate legacy single channelId into per-guild map
            if (cache.config.channelId && Object.keys(cache.channels).length === 0) {
                cache.channels['_legacy'] = cache.config.channelId;
            }
            logger.debug('Changelog cache loaded', {
                topicCount: Object.keys(cache.processedTopics).length
            });
        }
    } catch (error) {
        logger.warn('Error loading changelog cache', { error: error.message });
    }
}

function save() {
    try {
        const dir = path.dirname(STORAGE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (error) {
        logger.error('Error saving changelog cache', { error: error.message });
    }
}

load();

/**
 * Checks if a topic has already been processed
 * @param {string} topicId - Forum topic ID
 * @returns {boolean}
 */
function isProcessed(topicId) {
    return !!cache.processedTopics[topicId];
}

/**
 * Marks a topic as processed
 * @param {string} topicId - Forum topic ID
 * @param {Object} metadata - Topic metadata
 */
function markProcessed(topicId, metadata = {}) {
    cache.processedTopics[topicId] = {
        processedAt: new Date().toISOString(),
        ...metadata
    };
    save();
}

/**
 * Gets the list of all processed topic IDs
 * @returns {Object}
 */
function getProcessedTopics() {
    return { ...cache.processedTopics };
}

/**
 * Updates the last check timestamp
 */
function updateLastCheck() {
    cache.lastCheck = new Date().toISOString();
    save();
}

/**
 * Gets the last check timestamp
 * @returns {string|null}
 */
function getLastCheck() {
    return cache.lastCheck;
}

/**
 * Gets configuration
 * @returns {Object}
 */
function getConfig() {
    return { ...cache.config };
}

/**
 * Updates configuration
 * @param {Object} newConfig - Partial config to merge
 */
function setConfig(newConfig) {
    cache.config = { ...cache.config, ...newConfig };
    save();
}

/**
 * Gets storage stats
 * @returns {Object}
 */
function getStats() {
    return {
        processedCount: Object.keys(cache.processedTopics).length,
        lastCheck: cache.lastCheck,
        config: cache.config
    };
}

/**
 * Stores the last changelog result for quick access.
 * @param {Object} data - { topicId, topicMeta, pages, markdown, generatedAt }
 */
function setLastChangelog(data) {
    cache.lastChangelog = data ? {
        ...data,
        generatedAt: data.generatedAt || new Date().toISOString()
    } : null;
    save();
}

/**
 * Gets the last cached changelog result.
 * @returns {Object|null}
 */
function getLastChangelog() {
    return cache.lastChangelog;
}

function isInitialized() {
    return !!cache.initialized;
}

function setInitialized() {
    cache.initialized = true;
    save();
}

/**
 * Clears all processed topics (for reset — does NOT clear initialized flag)
 */
function clearProcessed() {
    cache.processedTopics = {};
    save();
}

/**
 * Sets the changelog channel for a specific guild.
 * @param {string} guildId
 * @param {string} channelId
 */
function setGuildChannel(guildId, channelId) {
    cache.channels[guildId] = channelId;
    save();
}

/**
 * Removes the changelog channel for a specific guild.
 * @param {string} guildId
 */
function removeGuildChannel(guildId) {
    delete cache.channels[guildId];
    save();
}

/**
 * Gets all configured guild→channel mappings.
 * @returns {Object} guildId→channelId map
 */
function getGuildChannels() {
    return { ...cache.channels };
}

/**
 * Gets the channel ID for a specific guild.
 * @param {string} guildId
 * @returns {string|null}
 */
function getGuildChannel(guildId) {
    return cache.channels[guildId] || null;
}

module.exports = {
    isProcessed,
    markProcessed,
    getProcessedTopics,
    isInitialized,
    setInitialized,
    updateLastCheck,
    getLastCheck,
    getConfig,
    setConfig,
    getStats,
    clearProcessed,
    setLastChangelog,
    getLastChangelog,
    setGuildChannel,
    removeGuildChannel,
    getGuildChannels,
    getGuildChannel
};
