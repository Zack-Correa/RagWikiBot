/**
 * Name Validator
 * Centralized validation logic for names from Divine Pride database
 * Prevents code duplication across commands
 */

const logger = require('./logger');

// Compiled regex patterns for better performance
const PATTERNS = {
    KOREAN: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/,
    ENCODING_ISSUES: /[\u0000-\u001F\uFFFD]/,
    ONLY_NUMBERS_SPECIAL: /^[\d\s\-_\.]+$/,
    PLACEHOLDER_PREFIX: /^\[ph\]/i
};

/**
 * Validates if a name is acceptable for display
 * @param {string} name - Name to validate
 * @param {Object} options - Validation options
 * @param {number} [options.minLength=2] - Minimum name length
 * @param {boolean} [options.allowKorean=false] - Allow Korean characters
 * @param {boolean} [options.logSkipped=true] - Log skipped names
 * @returns {boolean} True if name is valid
 */
function isValidName(name, { minLength = 2, allowKorean = false, logSkipped = true } = {}) {
    // Check if empty or too short
    if (!name || typeof name !== 'string' || name.trim().length < minLength) {
        return false;
    }
    
    const trimmedName = name.trim();
    
    // Skip Korean characters (unless explicitly allowed)
    if (!allowKorean && PATTERNS.KOREAN.test(trimmedName)) {
        if (logSkipped) {
            logger.debug('Skipping Korean name', { name: trimmedName });
        }
        return false;
    }
    
    // Skip encoding issues
    if (PATTERNS.ENCODING_ISSUES.test(trimmedName) || 
        trimmedName.includes('�') || 
        trimmedName.includes('&#x')) {
        if (logSkipped) {
            logger.debug('Skipping name with encoding issues', { name: trimmedName });
        }
        return false;
    }
    
    // Skip placeholder names
    const lowerName = trimmedName.toLowerCase();
    if (PATTERNS.PLACEHOLDER_PREFIX.test(trimmedName) ||
        lowerName.includes('placeholder') ||
        lowerName.includes('unknown') ||
        trimmedName === 'N/A' ||
        trimmedName === '?') {
        if (logSkipped) {
            logger.debug('Skipping placeholder name', { name: trimmedName });
        }
        return false;
    }
    
    // Skip names that are only numbers or special characters
    if (PATTERNS.ONLY_NUMBERS_SPECIAL.test(trimmedName)) {
        if (logSkipped) {
            logger.debug('Skipping name with only numbers/special chars', { name: trimmedName });
        }
        return false;
    }
    
    return true;
}

/**
 * Sanitizes a name for safe display
 * @param {string} name - Name to sanitize
 * @param {number} [maxLength=100] - Maximum length
 * @returns {string} Sanitized name
 */
function sanitizeName(name, maxLength = 100) {
    if (!name || typeof name !== 'string') {
        return '';
    }
    
    return name
        .trim()
        .replace(/\s+/g, ' ') // Normalize whitespace
        .substring(0, maxLength);
}

/**
 * Validates and sanitizes a name
 * @param {string} name - Name to process
 * @param {Object} options - Validation and sanitization options
 * @returns {string|null} Sanitized name or null if invalid
 */
function validateAndSanitize(name, options = {}) {
    if (!isValidName(name, options)) {
        return null;
    }
    
    return sanitizeName(name, options.maxLength);
}

/**
 * Filters an array of names, keeping only valid ones
 * @param {Array<string>} names - Array of names to filter
 * @param {Object} options - Validation options
 * @returns {Array<string>} Filtered and sanitized names
 */
function filterValidNames(names, options = {}) {
    if (!Array.isArray(names)) {
        return [];
    }
    
    return names
        .map(name => validateAndSanitize(name, options))
        .filter(name => name !== null);
}

module.exports = {
    isValidName,
    sanitizeName,
    validateAndSanitize,
    filterValidNames,
    PATTERNS
};

