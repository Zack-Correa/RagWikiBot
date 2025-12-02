/**
 * HTML Parser using Cheerio
 * High-performance HTML parsing solution replacing complex regex patterns
 */

const cheerio = require('cheerio');
const logger = require('./logger');
const { isValidName } = require('./nameValidator');

/**
 * Parses HTML to extract items from Divine Pride search results
 * @param {string} html - HTML content
 * @returns {Array<{name: string, id: string, url: string}>}
 */
function parseItemsFromHTML(html) {
    if (!html || typeof html !== 'string') {
        logger.warn('Invalid HTML input for item parsing');
        return [];
    }

    try {
        const $ = cheerio.load(html);
        const items = [];
        const addedIds = new Set();

        // Find all table rows containing item links
        $('tr').each((_, row) => {
            const $row = $(row);
            
            // Look for item links in the row
            $row.find('a[href*="/database/item/"]').each((_, link) => {
                const $link = $(link);
                const href = $link.attr('href');
                
                if (!href) return;
                
                // Extract item ID from href
                const idMatch = href.match(/\/database\/item\/(\d+)/);
                if (!idMatch) return;
                
                const itemId = idMatch[1];
                
                // Skip duplicates
                if (addedIds.has(itemId)) return;
                
                // Get item name - try different sources
                let itemName = $link.text().trim();
                
                // If link text is empty, try data attributes or title
                if (!itemName) {
                    itemName = $link.attr('title') || $link.attr('data-name') || '';
                }
                
                // Validate name
                if (!isValidName(itemName, 'item')) {
                    logger.debug('Skipping invalid item name', { itemName, itemId });
                    return;
                }
                
                items.push({
                    name: itemName,
                    id: itemId,
                    url: `https://www.divine-pride.net/database/item/${itemId}`
                });
                
                addedIds.add(itemId);
            });
        });

        logger.debug('Items parsed from HTML', { 
            itemsFound: items.length,
            htmlLength: html.length
        });

        return items;
    } catch (error) {
        logger.error('Error parsing items from HTML', { error: error.message });
        return [];
    }
}

/**
 * Parses HTML to extract monsters from Divine Pride search results
 * @param {string} html - HTML content
 * @returns {Array<{name: string, id: string, url: string}>}
 */
function parseMonstersFromHTML(html) {
    if (!html || typeof html !== 'string') {
        logger.warn('Invalid HTML input for monster parsing');
        return [];
    }

    try {
        const $ = cheerio.load(html);
        const monsters = [];
        const addedIds = new Set();

        // Find all table rows containing monster links
        $('tr').each((_, row) => {
            const $row = $(row);
            
            // Look for monster links in the row
            $row.find('a[href*="/database/monster/"]').each((_, link) => {
                const $link = $(link);
                const href = $link.attr('href');
                
                if (!href) return;
                
                // Extract monster ID from href
                const idMatch = href.match(/\/database\/monster\/(\d+)/);
                if (!idMatch) return;
                
                const monsterId = idMatch[1];
                
                // Skip duplicates
                if (addedIds.has(monsterId)) return;
                
                // Get monster name
                let monsterName = $link.text().trim();
                
                // Remove MVP crown emoji if present
                monsterName = monsterName.replace(/^👑\s*/, '');
                
                // If link text is empty, try alternatives
                if (!monsterName) {
                    monsterName = $link.attr('title') || $link.attr('data-name') || '';
                }
                
                // Validate name
                if (!isValidName(monsterName, 'monster')) {
                    logger.debug('Skipping invalid monster name', { monsterName, monsterId });
                    return;
                }
                
                monsters.push({
                    name: monsterName,
                    id: monsterId,
                    url: `https://www.divine-pride.net/database/monster/${monsterId}`
                });
                
                addedIds.add(monsterId);
            });
        });

        logger.debug('Monsters parsed from HTML', { 
            monstersFound: monsters.length,
            htmlLength: html.length
        });

        return monsters;
    } catch (error) {
        logger.error('Error parsing monsters from HTML', { error: error.message });
        return [];
    }
}

/**
 * Parses HTML to extract maps from Divine Pride search results
 * @param {string} html - HTML content
 * @returns {Array<{name: string, id: string, url: string}>}
 */
function parseMapsFromHTML(html) {
    if (!html || typeof html !== 'string') {
        logger.warn('Invalid HTML input for map parsing');
        return [];
    }

    try {
        const $ = cheerio.load(html);
        const maps = [];
        const addedIds = new Set();

        // Find all table rows containing map links
        $('tr').each((_, row) => {
            const $row = $(row);
            
            // Look for map links in the row
            $row.find('a[href*="/database/map/"]').each((_, link) => {
                const $link = $(link);
                const href = $link.attr('href');
                
                if (!href) return;
                
                // Extract map ID from href (alphanumeric with underscores)
                const idMatch = href.match(/\/database\/map\/([a-zA-Z0-9_]+)/);
                if (!idMatch) return;
                
                const mapId = idMatch[1];
                
                // Skip duplicates
                if (addedIds.has(mapId)) return;
                
                // Get map name
                let mapName = $link.text().trim();
                
                // If link text is empty, try alternatives
                if (!mapName) {
                    mapName = $link.attr('title') || $link.attr('data-name') || '';
                }
                
                // Validate name
                if (!isValidName(mapName, 'map')) {
                    logger.debug('Skipping invalid map name', { mapName, mapId });
                    return;
                }
                
                maps.push({
                    name: mapName,
                    id: mapId,
                    url: `https://www.divine-pride.net/database/map/${mapId}`
                });
                
                addedIds.add(mapId);
            });
        });

        logger.debug('Maps parsed from HTML', { 
            mapsFound: maps.length,
            htmlLength: html.length
        });

        return maps;
    } catch (error) {
        logger.error('Error parsing maps from HTML', { error: error.message });
        return [];
    }
}

/**
 * Generic function to extract links from HTML based on pattern
 * @param {string} html - HTML content
 * @param {string} pattern - URL pattern to match (e.g., '/database/item/')
 * @param {RegExp} idPattern - Regex to extract ID from href
 * @param {string} type - Entity type for logging
 * @returns {Array<{name: string, id: string, url: string, raw: string}>}
 */
function extractLinksFromHTML(html, pattern, idPattern, type = 'entity') {
    if (!html || typeof html !== 'string') {
        logger.warn('Invalid HTML input for link extraction', { type });
        return [];
    }

    try {
        const $ = cheerio.load(html);
        const results = [];
        const addedIds = new Set();

        // Find all links matching the pattern
        $(`a[href*="${pattern}"]`).each((_, link) => {
            const $link = $(link);
            const href = $link.attr('href');
            
            if (!href) return;
            
            // Extract ID using provided pattern
            const idMatch = href.match(idPattern);
            if (!idMatch) return;
            
            const id = idMatch[1];
            
            // Skip duplicates
            if (addedIds.has(id)) return;
            
            // Get text content
            const name = $link.text().trim();
            
            // Get parent row context if available
            const $row = $link.closest('tr');
            const rowText = $row.length ? $row.text().trim() : '';
            
            results.push({
                name,
                id,
                url: href.startsWith('http') ? href : `https://www.divine-pride.net${href}`,
                raw: rowText || name
            });
            
            addedIds.add(id);
        });

        logger.debug(`Links extracted from HTML`, { 
            type,
            linksFound: results.length,
            htmlLength: html.length
        });

        return results;
    } catch (error) {
        logger.error(`Error extracting ${type} links from HTML`, { error: error.message });
        return [];
    }
}

/**
 * Cleans HTML entities and color codes from text
 * @param {string} text - Text to clean
 * @returns {string}
 */
function cleanText(text) {
    if (typeof text !== 'string') return '';
    
    return text
        .replace(/\^[0-9A-Fa-f]{6}/g, '') // Remove color codes like ^000000
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\r\n/g, '\n') // Normalize line breaks
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
}

/**
 * Extracts table data from HTML
 * @param {string} html - HTML content
 * @param {Object} options - Extraction options
 * @returns {Array<Object>}
 */
function extractTableData(html, options = {}) {
    const {
        tableSelector = 'table',
        rowSelector = 'tr',
        cellSelector = 'td',
        headerSelector = 'th',
        includeHeaders = false
    } = options;

    try {
        const $ = cheerio.load(html);
        const tableData = [];

        $(tableSelector).each((_, table) => {
            const $table = $(table);
            
            // Extract headers if requested
            let headers = [];
            if (includeHeaders) {
                $table.find(headerSelector).each((_, header) => {
                    headers.push($(header).text().trim());
                });
            }

            // Extract rows
            $table.find(rowSelector).each((_, row) => {
                const $row = $(row);
                const cells = [];
                
                $row.find(cellSelector).each((_, cell) => {
                    const $cell = $(cell);
                    cells.push({
                        text: $cell.text().trim(),
                        html: $cell.html(),
                        links: $cell.find('a').map((_, a) => ({
                            text: $(a).text().trim(),
                            href: $(a).attr('href')
                        })).get()
                    });
                });

                if (cells.length > 0) {
                    tableData.push({
                        cells,
                        headers: includeHeaders ? headers : undefined
                    });
                }
            });
        });

        return tableData;
    } catch (error) {
        logger.error('Error extracting table data', { error: error.message });
        return [];
    }
}

module.exports = {
    parseItemsFromHTML,
    parseMonstersFromHTML,
    parseMapsFromHTML,
    extractLinksFromHTML,
    cleanText,
    extractTableData
};

