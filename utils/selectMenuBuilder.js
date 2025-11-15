/**
 * Select Menu Builder
 * Provides utilities for creating Discord select menus with validation
 */

const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { isValidName, sanitizeName } = require('./nameValidator');
const logger = require('./logger');

// Constants
const LIMITS = {
    MAX_OPTIONS: 25,
    MAX_LABEL_LENGTH: 100,
    MAX_DESCRIPTION_LENGTH: 100
};

/**
 * Extracts item information from search results
 * @param {Array<string>} results - Search results array
 * @param {Object} patterns - Regex patterns for extraction
 * @param {RegExp} patterns.name - Pattern to extract name
 * @param {RegExp} patterns.id - Pattern to extract ID
 * @returns {Array<Object>} Array of {name, id} objects
 */
function extractItemsFromResults(results, patterns) {
    const items = [];
    const addedIds = new Set();
    
    for (const result of results) {
        const nameMatch = result.match(patterns.name);
        const idMatch = result.match(patterns.id);
        
        if (nameMatch && idMatch) {
            const name = nameMatch[1];
            const id = idMatch[1];
            
            // Skip duplicates
            if (addedIds.has(id)) {
                logger.debug('Skipping duplicate ID in select menu', { id, name });
                continue;
            }
            
            // Validate name
            if (!isValidName(name, { logSkipped: false })) {
                continue;
            }
            
            items.push({ name, id });
            addedIds.add(id);
            
            // Respect Discord's limit
            if (items.length >= LIMITS.MAX_OPTIONS) {
                break;
            }
        }
    }
    
    return items;
}

/**
 * Creates select menu options from items
 * @param {Array<Object>} items - Array of items with {name, id} structure
 * @param {Object} config - Configuration options
 * @param {string} config.valuePrefix - Prefix for option values (e.g., 'item_', 'monster_')
 * @param {Function} [config.formatLabel] - Custom label formatter
 * @param {Function} [config.formatDescription] - Custom description formatter
 * @returns {Array<Object>} Array of Discord select menu options
 */
function createSelectOptions(items, { valuePrefix, formatLabel, formatDescription }) {
    return items.map(item => {
        const label = formatLabel 
            ? formatLabel(item) 
            : sanitizeName(item.name, LIMITS.MAX_LABEL_LENGTH);
        
        const description = formatDescription
            ? formatDescription(item)
            : `ID: ${item.id}`.substring(0, LIMITS.MAX_DESCRIPTION_LENGTH);
        
        return {
            label,
            value: `${valuePrefix}${item.id}`,
            description
        };
    });
}

/**
 * Creates a complete select menu component
 * @param {Object} options - Menu options
 * @param {string} options.customId - Custom ID for the menu
 * @param {string} options.placeholder - Placeholder text
 * @param {Array<Object>} options.selectOptions - Array of menu options
 * @returns {ActionRowBuilder|null} Action row with select menu or null if no options
 */
function createSelectMenu({ customId, placeholder, selectOptions }) {
    if (!selectOptions || selectOptions.length === 0) {
        return null;
    }
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .addOptions(selectOptions);
    
    return new ActionRowBuilder().addComponents(selectMenu);
}

/**
 * Creates a complete select menu from search results (convenience function)
 * @param {Object} config - Configuration object
 * @param {Array<string>} config.results - Search results
 * @param {Object} config.patterns - Extraction patterns
 * @param {string} config.customId - Menu custom ID
 * @param {string} config.placeholder - Menu placeholder
 * @param {string} config.valuePrefix - Value prefix
 * @param {Function} [config.formatLabel] - Label formatter
 * @param {Function} [config.formatDescription] - Description formatter
 * @returns {ActionRowBuilder|null}
 */
function buildSelectMenuFromResults(config) {
    const items = extractItemsFromResults(config.results, config.patterns);
    
    if (items.length === 0) {
        logger.debug('No valid items for select menu', { resultsCount: config.results.length });
        return null;
    }
    
    const selectOptions = createSelectOptions(items, {
        valuePrefix: config.valuePrefix,
        formatLabel: config.formatLabel,
        formatDescription: config.formatDescription
    });
    
    return createSelectMenu({
        customId: config.customId,
        placeholder: config.placeholder,
        selectOptions
    });
}

/**
 * Extracts map information from search results (special format)
 * @param {Array<string>} results - Map search results
 * @returns {Array<Object>} Array of {name, id} objects
 */
function extractMapsFromResults(results) {
    const maps = [];
    const addedIds = new Set();
    
    for (const result of results) {
        const parts = result.split('\n');
        if (parts.length < 2) continue;
        
        const nameMatch = parts[0].match(/\*\*(.+?)\*\*/);
        const idMatch = parts[1].match(/\[([a-zA-Z0-9_]+)\]/);
        
        if (nameMatch && idMatch) {
            const name = nameMatch[1].trim();
            const id = idMatch[1].trim();
            
            if (addedIds.has(id)) continue;
            if (!isValidName(name, { logSkipped: false })) continue;
            
            maps.push({ name, id });
            addedIds.add(id);
            
            if (maps.length >= LIMITS.MAX_OPTIONS) break;
        }
    }
    
    return maps;
}

module.exports = {
    LIMITS,
    extractItemsFromResults,
    extractMapsFromResults,
    createSelectOptions,
    createSelectMenu,
    buildSelectMenuFromResults
};

