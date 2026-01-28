/**
 * Application Constants
 * Centralized configuration values and magic numbers
 */

module.exports = {
    // Timeouts (in milliseconds)
    TIMEOUTS: {
        COLLECTOR: 300000,        // 5 minutes
        PAGINATION: 180000,       // 3 minutes
        API_REQUEST: 10000,       // 10 seconds
        COOKIE_CACHE: 1800000     // 30 minutes
    },
    
    // Pagination limits
    PAGINATION: {
        ITEMS_PER_PAGE: 10,
        MAX_PAGES: 100
    },
    
    // Select menu limits
    SELECT_MENU: {
        MAX_OPTIONS: 25,
        MAX_LABEL_LENGTH: 100,
        MAX_DESCRIPTION_LENGTH: 100
    },
    
    // Search limits
    SEARCH: {
        MIN_TERM_LENGTH: 2,
        MAX_TERM_LENGTH: 100,
        MAX_RESULTS: 100
    },
    
    // Validation patterns
    PATTERNS: {
        NUMERIC_ID: /^\d+$/,
        MAP_ID: /^[a-zA-Z0-9_]+$/,
        KOREAN: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/,
        ENCODING_ISSUES: /[\u0000-\u001F\uFFFD]/,
        ONLY_NUMBERS_SPECIAL: /^[\d\s\-_\.]+$/,
        PLACEHOLDER_PREFIX: /^\[ph\]/i
    },
    
    // Extraction patterns
    EXTRACT_PATTERNS: {
        ITEM: {
            name: /\[([^\]]+)\]/,
            id: /item\/(\d+)/
        },
        MONSTER: {
            name: /\[([^\]]+)\]/,
            id: /monster\/(\d+)/
        },
        MAP: {
            name: /\*\*(.+?)\*\*/,
            id: /\[([a-zA-Z0-9_]+)\]/
        }
    },
    
    // Embed colors
    COLORS: {
        PRIMARY: '#0099ff',
        WARNING: '#ff9900',
        ERROR: '#ff0000',
        SUCCESS: '#00ff00'
    },
    
    // Custom IDs for components
    CUSTOM_IDS: {
        ITEM_MENU: 'item_details_menu',
        MONSTER_MENU: 'monster_details_menu',
        MAP_MENU: 'map_details_menu',
        MARKET_MENU: 'market_item_select'
    },
    
    // Image URLs patterns
    IMAGES: {
        ITEM: (id) => `https://www.divine-pride.net/img/items/collection/kro/${id}`,
        MONSTER: (id) => `https://static.divine-pride.net/images/mobs/png/${id}.png`,
        MAP_ORIGINAL: (id) => `https://www.divine-pride.net/img/map/original/${id}`,
        MAP_RAW: (id) => `https://www.divine-pride.net/img/map/raw/${id}`,
        GNJOY_THUMBNAIL: 'https://assets.gnjoylatam.com/static/web/ro/assets/images/ro_og.webp'
    },
    
    // Market/Trading constants
    MARKET: {
        ITEMS_PER_PAGE: 10,
        SERVERS: {
            FREYA: 'FREYA',
            NIDHOGG: 'NIDHOGG',
            YGGDRASIL: 'YGGDRASIL'
        },
        STORE_TYPES: {
            BUY: 'BUY',
            SELL: 'SELL'
        }
    },
    
    // API Configuration
    API: {
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000
    }
};

