/**
 * String Cleaner Utilities
 * Centralized string cleaning and sanitization functions
 */

const logger = require('./logger');

/**
 * Cleans color codes from Divine Pride responses
 * Removes patterns like ^000000 (hex color codes)
 * @param {string} str - String to clean
 * @returns {string}
 */
function cleanColorCodes(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\^[0-9A-Fa-f]{6}/g, '');
}

/**
 * Cleans HTML entities from text
 * @param {string} str - String to clean
 * @returns {string}
 */
function cleanHTMLEntities(str) {
    if (typeof str !== 'string') return '';
    
    return str
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
            try {
                return String.fromCharCode(parseInt(hex, 16));
            } catch {
                return '';
            }
        })
        .replace(/&#(\d+);/g, (match, dec) => {
            try {
                return String.fromCharCode(parseInt(dec, 10));
            } catch {
                return '';
            }
        });
}

/**
 * Normalizes whitespace in text
 * @param {string} str - String to clean
 * @returns {string}
 */
function normalizeWhitespace(str) {
    if (typeof str !== 'string') return '';
    
    return str
        .replace(/\r\n/g, '\n')  // Normalize line breaks
        .replace(/\r/g, '\n')    // Convert remaining \r to \n
        .replace(/[ \t]+/g, ' ') // Normalize spaces and tabs
        .trim();
}

/**
 * Removes wiki template syntax from text
 * @param {string} str - String to clean
 * @returns {string}
 */
function cleanWikiSyntax(str) {
    if (typeof str !== 'string') return '';
    
    return str
        .replace(/\{\{.*?\}\}/g, '') // Remove template tags {{...}}
        .replace(/#REDIRECT/gi, '')  // Remove redirect text
        .replace(/\|\s*\w+\s*=/g, '') // Remove template parameters | param =
        .replace(/\|\s*qreward\s*=.*$/gi, '') // Remove qreward parameters
        .replace(/\|\s*\w+reward\s*=.*$/gi, '') // Remove any reward parameters
        .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (match, link, display) => {
            // Convert [[Link|Display]] to Display, or [[Link]] to Link
            return display || link;
        });
}

/**
 * Complete string cleaning (all cleaners combined)
 * @param {string} str - String to clean
 * @param {Object} options - Cleaning options
 * @param {boolean} options.colors - Clean color codes (default: true)
 * @param {boolean} options.html - Clean HTML entities (default: true)
 * @param {boolean} options.whitespace - Normalize whitespace (default: true)
 * @param {boolean} options.wiki - Clean wiki syntax (default: false)
 * @returns {string}
 */
function cleanString(str, options = {}) {
    if (typeof str !== 'string') return '';
    
    const {
        colors = true,
        html = true,
        whitespace = true,
        wiki = false
    } = options;
    
    let cleaned = str;
    
    if (colors) {
        cleaned = cleanColorCodes(cleaned);
    }
    
    if (html) {
        cleaned = cleanHTMLEntities(cleaned);
    }
    
    if (wiki) {
        cleaned = cleanWikiSyntax(cleaned);
    }
    
    if (whitespace) {
        cleaned = normalizeWhitespace(cleaned);
    }
    
    return cleaned;
}

/**
 * Removes specific pattern prefixes/suffixes from strings
 * @param {string} str - String to clean
 * @param {Array<string>} patterns - Patterns to remove
 * @returns {string}
 */
function removePatterns(str, patterns = []) {
    if (typeof str !== 'string') return '';
    
    let cleaned = str;
    
    for (const pattern of patterns) {
        if (typeof pattern === 'string') {
            // Simple string replacement
            cleaned = cleaned.replace(new RegExp(pattern, 'gi'), '');
        } else if (pattern instanceof RegExp) {
            // Regex replacement
            cleaned = cleaned.replace(pattern, '');
        }
    }
    
    return cleaned.trim();
}

/**
 * Truncates string to specified length with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} ellipsis - Ellipsis string (default: '...')
 * @returns {string}
 */
function truncate(str, maxLength, ellipsis = '...') {
    if (typeof str !== 'string') return '';
    if (str.length <= maxLength) return str;
    
    return str.substring(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Cleans and validates description text
 * Removes placeholder/meaningless content
 * @param {string} str - Description to clean
 * @param {number} maxLength - Maximum length (default: 200)
 * @returns {string}
 */
function cleanDescription(str, maxLength = 200) {
    if (typeof str !== 'string') return '';
    
    let cleaned = cleanString(str, { wiki: true });
    
    // Remove if too short or meaningless
    if (cleaned.length < 10 || 
        /^[\s\|\=\*]+$/.test(cleaned) ||
        cleaned === '...' ||
        cleaned === '') {
        return '';
    }
    
    // Truncate if too long
    if (cleaned.length > maxLength) {
        cleaned = truncate(cleaned, maxLength);
    }
    
    return cleaned;
}

/**
 * Sanitizes name for display (removes MVP crown, etc.)
 * @param {string} name - Name to sanitize
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
function sanitizeName(name, maxLength = 100) {
    if (typeof name !== 'string') return '';
    
    let sanitized = name
        .replace(/^👑\s*/, '') // Remove MVP crown
        .trim();
    
    sanitized = cleanString(sanitized);
    
    if (maxLength && sanitized.length > maxLength) {
        sanitized = truncate(sanitized, maxLength);
    }
    
    return sanitized;
}

/**
 * Formats a multiline description for Discord embeds
 * @param {string} description - Description to format
 * @param {number} maxLines - Maximum number of lines
 * @param {number} maxLength - Maximum total length
 * @returns {string}
 */
function formatDescription(description, maxLines = 10, maxLength = 2000) {
    if (typeof description !== 'string') return '';
    
    let formatted = cleanString(description);
    
    // Split into lines and limit
    const lines = formatted.split('\n').filter(line => line.trim());
    
    if (lines.length > maxLines) {
        formatted = lines.slice(0, maxLines).join('\n') + '\n...';
    } else {
        formatted = lines.join('\n');
    }
    
    // Truncate if still too long
    if (formatted.length > maxLength) {
        formatted = truncate(formatted, maxLength);
    }
    
    return formatted;
}

/**
 * Batch clean an array of strings
 * @param {Array<string>} strings - Array of strings to clean
 * @param {Object} options - Cleaning options
 * @returns {Array<string>}
 */
function cleanBatch(strings, options = {}) {
    if (!Array.isArray(strings)) return [];
    
    return strings
        .map(str => cleanString(str, options))
        .filter(str => str && str.length > 0);
}

module.exports = {
    cleanColorCodes,
    cleanHTMLEntities,
    normalizeWhitespace,
    cleanWikiSyntax,
    cleanString,
    removePatterns,
    truncate,
    cleanDescription,
    sanitizeName,
    formatDescription,
    cleanBatch
};

