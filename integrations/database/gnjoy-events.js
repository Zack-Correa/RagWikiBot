/**
 * GNJoy Events Scraper
 * Scrapes event information from GNJoy LATAM website
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const eventsStorage = require('../../utils/eventsStorage');

// URLs to scrape
const URLS = {
    NEWS: 'https://ro.gnjoylatam.com/pt/news/notice',
    EVENTS: 'https://ro.gnjoylatam.com/pt/event/launch/gameevent',
    EVENT_LIST: 'https://ro.gnjoylatam.com/pt/news/event'
};

// News categories
const NEWS_CATEGORIES = {
    NOTICE: 'Aviso',
    EVENT: 'Eventos e Promoções',
    UPDATE: 'Atualização'
};

// Request timeout
const TIMEOUT = 15000;

// News cache file path
const NEWS_CACHE_FILE = path.join(__dirname, '../../data/news-cache.json');

// Days to refresh news (0 = Sunday, 1 = Monday, 2 = Tuesday, ..., 5 = Friday)
const REFRESH_DAYS = [2, 5]; // Tuesday and Friday

// In-memory cache (loaded from file)
let newsCache = {
    data: [],
    lastRefresh: null,  // ISO date string of last refresh
    lastRefreshDay: null // Day of week of last refresh (0-6)
};

/**
 * Loads news cache from file
 */
function loadNewsCache() {
    try {
        if (fs.existsSync(NEWS_CACHE_FILE)) {
            const data = fs.readFileSync(NEWS_CACHE_FILE, 'utf8');
            const parsed = JSON.parse(data);
            newsCache = {
                data: parsed.data || [],
                lastRefresh: parsed.lastRefresh || null,
                lastRefreshDay: parsed.lastRefreshDay ?? null
            };
            logger.info('Loaded news cache from file', { 
                newsCount: newsCache.data.length,
                lastRefresh: newsCache.lastRefresh 
            });
        }
    } catch (error) {
        logger.warn('Error loading news cache', { error: error.message });
    }
}

/**
 * Saves news cache to file
 */
function saveNewsCache() {
    try {
        const dir = path.dirname(NEWS_CACHE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(NEWS_CACHE_FILE, JSON.stringify(newsCache, null, 2), 'utf8');
        logger.debug('Saved news cache to file', { newsCount: newsCache.data.length });
    } catch (error) {
        logger.error('Error saving news cache', { error: error.message });
    }
}

/**
 * Checks if news should be refreshed based on day of week
 * Refreshes only on Tuesdays (2) and Fridays (5)
 * @returns {boolean} True if should refresh
 */
function shouldRefreshNews() {
    const now = new Date();
    const currentDay = now.getDay(); // 0-6 (Sunday-Saturday)
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // If no data, always refresh
    if (newsCache.data.length === 0) {
        logger.debug('News cache empty, should refresh');
        return true;
    }
    
    // If never refreshed, refresh
    if (!newsCache.lastRefresh) {
        logger.debug('Never refreshed news, should refresh');
        return true;
    }
    
    // Check if today is a refresh day (Tuesday or Friday)
    if (!REFRESH_DAYS.includes(currentDay)) {
        logger.debug('Today is not a refresh day', { currentDay, refreshDays: REFRESH_DAYS });
        return false;
    }
    
    // Check if already refreshed today
    const lastRefreshDate = newsCache.lastRefresh.split('T')[0];
    if (lastRefreshDate === today) {
        logger.debug('Already refreshed today', { lastRefreshDate, today });
        return false;
    }
    
    logger.debug('Should refresh news', { currentDay, lastRefresh: newsCache.lastRefresh });
    return true;
}

// Load cache on module initialization
loadNewsCache();

/**
 * Fetches page with RSC headers (React Server Components)
 * @param {string} url - URL to fetch
 * @returns {Promise<string|null>} Response text or null
 */
async function fetchPage(url) {
    // Try standard HTML request first (more reliable for news page)
    try {
        logger.info('Fetching news page', { url });
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: TIMEOUT
        });
        
        logger.info('Page fetched successfully', { 
            status: response.status, 
            contentType: response.headers['content-type'],
            dataLength: typeof response.data === 'string' ? response.data.length : 'not string'
        });
        
        return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    } catch (error) {
        logger.error('Error fetching page', { url, error: error.message, status: error.response?.status });
        return null;
    }
}

/**
 * Parses RSC response to extract news data
 * @param {string} responseText - RSC response text
 * @returns {Array} Parsed news items
 */
function parseRSCNews(responseText) {
    const news = [];
    
    try {
        const lines = responseText.split('\n');
        
        for (const line of lines) {
            // Look for lines containing news data - they have href patterns for news
            if (line.includes('/pt/news/notice/') || line.includes('/pt/news/event/')) {
                // Try to find JSON objects in the line
                const colonIndex = line.indexOf(':');
                if (colonIndex === -1) continue;
                
                const jsonPart = line.substring(colonIndex + 1);
                
                try {
                    // The line might be a JSON array like ["$","a",null,{...}]
                    const parsed = JSON.parse(jsonPart);
                    extractNewsFromParsed(parsed, news);
                } catch {
                    // Not valid JSON, try regex extraction
                }
            }
        }
        
        // Also try to find patterns directly in the text
        // Pattern: "href":"/pt/news/notice/123"
        const hrefPattern = /"href":"\/pt\/news\/(notice|event)\/(\d+)"/g;
        let match;
        const foundIds = new Set(news.map(n => n.id));
        
        while ((match = hrefPattern.exec(responseText)) !== null) {
            const type = match[1];
            const id = match[2];
            
            if (foundIds.has(id)) continue;
            foundIds.add(id);
            
            // Try to find the title near this href
            // Look for "children":"Title text" nearby
            const contextStart = Math.max(0, match.index - 500);
            const contextEnd = Math.min(responseText.length, match.index + 500);
            const context = responseText.substring(contextStart, contextEnd);
            
            // Find title - look for text that looks like a news title
            const titleMatch = context.match(/"children":"([^"]{10,200})"/);
            let title = titleMatch ? titleMatch[1] : null;
            
            // Clean up title
            if (title) {
                title = title.replace(/\\u[\dA-Fa-f]{4}/g, char => 
                    String.fromCharCode(parseInt(char.replace('\\u', ''), 16))
                );
            }
            
            // Find date nearby
            const dateMatch = context.match(/(\d{2}\/\d{2}\/\d{4})/);
            const date = dateMatch ? dateMatch[1] : null;
            
            if (title) {
                news.push({
                    id,
                    title: title.trim(),
                    type,
                    category: type === 'notice' ? NEWS_CATEGORIES.NOTICE : NEWS_CATEGORIES.EVENT,
                    date,
                    url: `https://ro.gnjoylatam.com/pt/news/${type}/${id}`
                });
            }
        }
        
    } catch (error) {
        logger.error('Error parsing RSC news', { error: error.message });
    }
    
    return news;
}

/**
 * Recursively extracts news from parsed JSON
 * @param {*} obj - Parsed object
 * @param {Array} news - News array to populate
 */
function extractNewsFromParsed(obj, news) {
    if (!obj) return;
    
    if (Array.isArray(obj)) {
        for (const item of obj) {
            extractNewsFromParsed(item, news);
        }
    } else if (typeof obj === 'object') {
        // Check if this is a link object with href to news
        if (obj.href && typeof obj.href === 'string') {
            const hrefMatch = obj.href.match(/\/pt\/news\/(notice|event)\/(\d+)/);
            if (hrefMatch) {
                const type = hrefMatch[1];
                const id = hrefMatch[2];
                
                // Try to find title in children
                let title = null;
                if (obj.children) {
                    if (typeof obj.children === 'string') {
                        title = obj.children;
                    } else if (Array.isArray(obj.children)) {
                        title = obj.children.find(c => typeof c === 'string');
                    }
                }
                
                if (title && !news.find(n => n.id === id)) {
                    news.push({
                        id,
                        title: title.trim(),
                        type,
                        category: type === 'notice' ? NEWS_CATEGORIES.NOTICE : NEWS_CATEGORIES.EVENT,
                        date: null,
                        url: `https://ro.gnjoylatam.com/pt/news/${type}/${id}`
                    });
                }
            }
        }
        
        // Recurse into object properties
        for (const key in obj) {
            extractNewsFromParsed(obj[key], news);
        }
    }
}

/**
 * Parses all news/announcements from response (RSC or HTML)
 * @param {string} response - Response text
 * @returns {Array} Parsed news items
 */
async function parseAllNewsHTML(response) {
    const news = [];
    
    if (!response) return news;
    
    try {
        // Try to find __NEXT_DATA__ JSON (Next.js embeds data here)
        const nextDataMatch = response.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/i);
        if (nextDataMatch) {
            logger.info('Found __NEXT_DATA__, parsing...');
            try {
                const nextData = JSON.parse(nextDataMatch[1]);
                const extractedNews = extractNewsFromNextData(nextData);
                if (extractedNews.length > 0) {
                    logger.info('Extracted news from __NEXT_DATA__', { count: extractedNews.length });
                    return extractedNews;
                }
            } catch (e) {
                logger.warn('Failed to parse __NEXT_DATA__', { error: e.message });
            }
        }
        
        // Try to find self.__next_f.push data (RSC streaming data)
        // Pattern: self.__next_f.push([1,"..."]) or self.__next_f.push([0,"..."])
        const rscPushPattern = /self\.__next_f\.push\(\s*\[\s*\d+\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]\s*\)/g;
        let rscData = '';
        let pushMatch;
        let pushCount = 0;
        
        while ((pushMatch = rscPushPattern.exec(response)) !== null) {
            pushCount++;
            rscData += pushMatch[1];
        }
        
        logger.info('RSC push extraction', { pushCount, rscDataLength: rscData.length });
        
        if (rscData) {
            // Decode escaped characters
            rscData = rscData
                .replace(/\\n/g, '\n')
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\')
                .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
            
            // Check what patterns exist in the data
            const hasNoticePattern = rscData.includes('/notice/');
            const hasNewsPattern = rscData.includes('/news/');
            const hasNoticeText = rscData.includes('_NOTICE_');
            
            // Find where news content might be
            const noticeIdx = rscData.indexOf('/notice/');
            const sampleStart = noticeIdx > 0 ? Math.max(0, noticeIdx - 100) : 0;
            const sampleContent = rscData.substring(sampleStart, sampleStart + 600);
            
            logger.info('RSC data patterns', { hasNoticePattern, hasNewsPattern, hasNoticeText, sampleAroundNotice: sampleContent });
            
            // Try to extract titles from RSC data too
            const rscTitleMap = extractTitlesFromContent(rscData);
            const rscSimpleTitleMap = {};
            for (const [id, data] of Object.entries(rscTitleMap)) {
                rscSimpleTitleMap[id] = data.title;
            }
            
            // Look for news links directly in the decoded data
            const newsFromPush = extractNewsFromText(rscData, rscSimpleTitleMap);
            if (newsFromPush.length > 0) {
                logger.info('Extracted news from RSC push data', { count: newsFromPush.length });
                return newsFromPush;
            }
        }
        
        // Try direct RSC format
        if (response.match(/^\d+:/m)) {
            logger.info('Parsing as direct RSC response');
            const rscNews = parseRSCNews(response);
            if (rscNews.length > 0) {
                return rscNews;
            }
        }
        
        // Parse as regular HTML - look for any news patterns
        logger.info('Parsing as HTML response');
        
        // First, find all news IDs in the response
        const idPattern = /\/(?:pt\/)?news\/(notice|event)\/(\d+)/g;
        const newsItems = [];
        const seenIds = new Set();
        let idMatch;
        
        while ((idMatch = idPattern.exec(response)) !== null) {
            const type = idMatch[1];
            const id = idMatch[2];
            if (!seenIds.has(id)) {
                seenIds.add(id);
                newsItems.push({ id, type });
            }
        }
        
        logger.info('Found news IDs', { count: newsItems.length });
        
        if (newsItems.length > 0) {
            // Fetch titles individually for each news item
            const titleMap = await fetchNewsTitles(newsItems, 20);
            
            // Build news array with titles
            const newsWithTitles = [];
            for (const item of newsItems) {
                const titleData = titleMap[item.id];
                if (titleData && titleData.title) {
                    newsWithTitles.push({
                        id: item.id,
                        title: titleData.title,
                        type: item.type,
                        category: item.type === 'notice' ? NEWS_CATEGORIES.NOTICE : NEWS_CATEGORIES.EVENT,
                        date: titleData.date,
                        url: `https://ro.gnjoylatam.com/pt/news/${item.type}/${item.id}`
                    });
                }
            }
            
            if (newsWithTitles.length > 0) {
                logger.info('Built news list with fetched titles', { count: newsWithTitles.length });
                return newsWithTitles;
            }
        }
        
        // Fallback: try to extract from content directly
        const titleMap = extractTitlesFromContent(response);
        const simpleTitleMap = {};
        for (const [id, data] of Object.entries(titleMap)) {
            simpleTitleMap[id] = data.title;
        }
        
        const textNews = extractNewsFromText(response, simpleTitleMap);
        if (textNews.length > 0) {
            logger.info('Extracted news from full response text', { count: textNews.length });
            return textNews;
        }
        
        // Pattern to match news links in HTML
        const linkPattern = /<a[^>]*href="[^"]*\/news\/(notice|event)\/(\d+)"[^>]*>([^<]+)<\/a>/gi;
        let linkMatch;
        
        while ((linkMatch = linkPattern.exec(response)) !== null) {
            const type = linkMatch[1];
            const id = linkMatch[2];
            let title = linkMatch[3].trim();
            
            // Clean title
            title = title.replace(/^_NOTICE_/i, '').trim();
            
            if (!title || news.find(n => n.id === id)) continue;
            
            news.push({
                id,
                title,
                type,
                category: type === 'notice' ? NEWS_CATEGORIES.NOTICE : NEWS_CATEGORIES.EVENT,
                date: null,
                url: `https://ro.gnjoylatam.com/pt/news/${type}/${id}`
            });
        }
        
    } catch (error) {
        logger.error('Error parsing news', { error: error.message });
    }
    
    return news;
}

/**
 * Extracts news from raw text by finding patterns
 * @param {string} text - Text to search
 * @param {Object} titleMap - Optional map of ID to title
 * @returns {Array} News items
 */
function extractNewsFromText(text, titleMap = {}) {
    const news = [];
    const foundIds = new Set();
    
    try {
        // Look for href patterns to news pages
        const hrefPattern = /(?:\/pt)?\/news\/(notice|event)\/(\d+)/g;
        let match;
        let matchCount = 0;
        
        while ((match = hrefPattern.exec(text)) !== null) {
            matchCount++;
            const type = match[1];
            const id = match[2];
            
            if (foundIds.has(id)) continue;
            foundIds.add(id);
            
            // Get title from titleMap if available
            let title = titleMap[id] || null;
            let date = null;
            
            if (!title) {
                // Try to find title near this ID
                const contextStart = Math.max(0, match.index - 500);
                const contextEnd = Math.min(text.length, match.index + 500);
                const context = text.substring(contextStart, contextEnd);
                
                // Try multiple patterns
                const childrenMatch = context.match(/"children"\s*:\s*"([^"]{5,200})"/);
                if (childrenMatch) title = childrenMatch[1];
                
                if (!title) {
                    const titleMatch = context.match(/"title"\s*:\s*"([^"]{5,200})"/);
                    if (titleMatch) title = titleMatch[1];
                }
                
                const dateMatch = context.match(/(\d{2}\/\d{2}\/\d{4})/);
                date = dateMatch ? dateMatch[1] : null;
            }
            
            if (title) {
                title = title
                    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                    .replace(/\\n/g, ' ')
                    .replace(/\\"/g, '"')
                    .replace(/_NOTICE_/g, '')
                    .trim();
                
                if (title.length > 3) {
                    news.push({
                        id,
                        title,
                        type,
                        category: type === 'notice' ? NEWS_CATEGORIES.NOTICE : NEWS_CATEGORIES.EVENT,
                        date,
                        url: `https://ro.gnjoylatam.com/pt/news/${type}/${id}`
                    });
                }
            }
        }
        
        logger.info('extractNewsFromText results', { matchCount, newsCount: news.length, foundIds: Array.from(foundIds) });
        
    } catch (error) {
        logger.error('Error extracting news from text', { error: error.message });
    }
    
    return news;
}

/**
 * Fetches a single news item to get its title
 * @param {string} id - News ID
 * @param {string} type - 'notice' or 'event'
 * @returns {Promise<{title: string, date: string}|null>}
 */
async function fetchNewsTitle(id, type = 'notice') {
    try {
        const url = `https://ro.gnjoylatam.com/pt/news/${type}/${id}`;
        
        // Fetch HTML page directly
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: 8000
        });
        
        const html = typeof response.data === 'string' ? response.data : '';
        let title = null;
        let date = null;
        
        // Method 1: Look for title in page_tt__tyOvB class (main title element)
        // Pattern: <p class="page_tt__tyOvB">Title Here</p>
        const titleClassPattern = /class="page_tt__[^"]*"[^>]*>([^<]+)</i;
        let match = html.match(titleClassPattern);
        if (match && match[1]) {
            title = match[1].trim();
        }
        
        // Method 2: Look for title in page_top section with class containing "tt"
        if (!title) {
            const topTitlePattern = /page_top[^>]*>[\s\S]*?class="[^"]*tt[^"]*"[^>]*>([^<]{5,200})</i;
            match = html.match(topTitlePattern);
            if (match && match[1]) {
                title = match[1].trim();
            }
        }
        
        // Method 3: Look in RSC data for title pattern
        if (!title) {
            // RSC format: ["$","p",null,{"className":"page_tt__tyOvB","children":"Title"}]
            const rscTitlePattern = /page_tt__[^"]*"[^}]*"children"\s*:\s*"([^"]{5,200})"/i;
            match = html.match(rscTitlePattern);
            if (match && match[1]) {
                title = match[1].trim();
            }
        }
        
        // Method 4: Alternative RSC pattern
        if (!title) {
            const altRscPattern = /"className"\s*:\s*"page_tt__[^"]*"[^}]*"children"\s*:\s*"([^"]+)"/i;
            match = html.match(altRscPattern);
            if (match && match[1]) {
                title = match[1].trim();
            }
        }
        
        // Look for date in page_st__RuBSZ class or similar
        const dateClassPattern = /class="page_st__[^"]*"[^>]*>([^<]*\d{2}[\.\/]\d{2}[\.\/]\d{4}[^<]*)</i;
        match = html.match(dateClassPattern);
        if (match && match[1]) {
            const dateText = match[1].trim();
            const dateMatch = dateText.match(/(\d{2})[\.\/](\d{2})[\.\/](\d{4})/);
            if (dateMatch) {
                date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
            }
        }
        
        // Fallback date pattern
        if (!date) {
            const fallbackDateMatch = html.match(/(\d{2})[\.\/](\d{2})[\.\/](\d{4})/);
            if (fallbackDateMatch) {
                date = `${fallbackDateMatch[1]}/${fallbackDateMatch[2]}/${fallbackDateMatch[3]}`;
            }
        }
        
        if (title) {
            // Clean up title
            title = title
                .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                .replace(/\\n/g, ' ')
                .replace(/\\"/g, '"')
                .replace(/_NOTICE_/g, '')
                .replace(/\s*[–\-|]\s*Ragnarok Online.*$/i, '')
                .replace(/\s*[–\-|]\s*O Clássico.*$/i, '')
                .trim();
            
            // Validate title
            if (title.length > 5 && !title.includes('static/') && !title.includes('chunk')) {
                logger.debug('Found title', { id, title: title.substring(0, 50) });
                return { title, date };
            }
        }
        
        // Log sample for debugging if no title found
        logger.debug('No title found for news', { 
            id, 
            htmlLength: html.length,
            hasNotice: html.includes('_NOTICE_'),
            sample: html.substring(0, 1000)
        });
        
        return null;
    } catch (error) {
        logger.warn('Error fetching news title', { id, error: error.message });
        return null;
    }
}

/**
 * Fetches titles for multiple news IDs (with rate limiting)
 * @param {Array<{id: string, type: string}>} items - News items to fetch
 * @param {number} limit - Max items to fetch
 * @returns {Promise<Object>} Map of ID to {title, date}
 */
async function fetchNewsTitles(items, limit = 20) {
    const titleMap = {};
    const toFetch = items.slice(0, limit);
    
    logger.info('Fetching individual news titles', { count: toFetch.length });
    
    // Fetch in parallel with small batches to avoid overwhelming the server
    const batchSize = 5;
    for (let i = 0; i < toFetch.length; i += batchSize) {
        const batch = toFetch.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map(item => fetchNewsTitle(item.id, item.type))
        );
        
        batch.forEach((item, idx) => {
            if (results[idx]) {
                titleMap[item.id] = results[idx];
            }
        });
        
        // Small delay between batches
        if (i + batchSize < toFetch.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    logger.info('Fetched news titles', { found: Object.keys(titleMap).length });
    return titleMap;
}

/**
 * Extracts titles from HTML/RSC looking for various patterns
 * @param {string} content - HTML/RSC content
 * @returns {Object} Map of ID to {title, date}
 */
function extractTitlesFromContent(content) {
    const titleMap = {};
    
    try {
        // Method 1: Look for JSON-like patterns with title and ID
        // Pattern: "children":"Title" near /notice/ID
        const newsBlockPattern = /notice\/(\d+)[^}]*?"children"\s*:\s*"([^"]{5,200})"/g;
        let match;
        
        while ((match = newsBlockPattern.exec(content)) !== null) {
            const id = match[1];
            const title = match[2];
            if (!titleMap[id]) {
                titleMap[id] = { title, date: null };
            }
        }
        
        // Method 2: Reverse - find title then ID nearby
        const reversePattern = /"children"\s*:\s*"([^"]{10,200})"[^}]*?notice\/(\d+)/g;
        while ((match = reversePattern.exec(content)) !== null) {
            const title = match[1];
            const id = match[2];
            if (!titleMap[id]) {
                titleMap[id] = { title, date: null };
            }
        }
        
        // Method 3: Look for escaped _NOTICE_ pattern in RSC
        const escapedNoticePattern = /_NOTICE_([^"\\]{5,200}?)(?:\\u|"|\d{2}\/\d{2}\/\d{4})/g;
        const noticeIds = [];
        const noticeTitles = [];
        
        // First collect all notice IDs in order
        const idPattern = /notice\/(\d+)/g;
        while ((match = idPattern.exec(content)) !== null) {
            if (!noticeIds.includes(match[1])) {
                noticeIds.push(match[1]);
            }
        }
        
        // Collect all _NOTICE_ titles
        while ((match = escapedNoticePattern.exec(content)) !== null) {
            noticeTitles.push(match[1].trim());
        }
        
        // Match them up
        for (let i = 0; i < Math.min(noticeIds.length, noticeTitles.length); i++) {
            if (!titleMap[noticeIds[i]]) {
                titleMap[noticeIds[i]] = { title: noticeTitles[i], date: null };
            }
        }
        
        // Method 4: Look for date patterns and associate
        const datePattern = /(\d{2}\/\d{2}\/\d{4})/g;
        const dates = [];
        while ((match = datePattern.exec(content)) !== null) {
            dates.push(match[1]);
        }
        
        // Assign dates to entries that don't have them
        let dateIdx = 0;
        for (const id of noticeIds) {
            if (titleMap[id] && !titleMap[id].date && dateIdx < dates.length) {
                titleMap[id].date = dates[dateIdx];
                dateIdx++;
            }
        }
        
        logger.info('Title extraction', { 
            titlesFound: Object.keys(titleMap).length, 
            idsFound: noticeIds.length,
            noticeTitlesFound: noticeTitles.length,
            sampleTitles: Object.entries(titleMap).slice(0, 3).map(([id, data]) => ({ id, title: data.title?.substring(0, 50) }))
        });
        
    } catch (error) {
        logger.error('Error extracting titles', { error: error.message });
    }
    
    return titleMap;
}

/**
 * Extracts news from Next.js __NEXT_DATA__
 * @param {Object} data - Parsed __NEXT_DATA__ object
 * @returns {Array} News items
 */
function extractNewsFromNextData(data) {
    const news = [];
    
    try {
        // Recursively search for news data in the object
        const searchForNews = (obj, path = '') => {
            if (!obj || typeof obj !== 'object') return;
            
            // Check if this looks like a news item
            if (obj.seq && obj.title && (obj.noticeNo || obj.eventNo)) {
                const id = obj.noticeNo || obj.eventNo || obj.seq;
                const type = obj.noticeNo ? 'notice' : 'event';
                
                if (!news.find(n => n.id === String(id))) {
                    news.push({
                        id: String(id),
                        title: obj.title,
                        type,
                        category: type === 'notice' ? NEWS_CATEGORIES.NOTICE : NEWS_CATEGORIES.EVENT,
                        date: obj.regDt || obj.createDt || null,
                        url: `https://ro.gnjoylatam.com/pt/news/${type}/${id}`
                    });
                }
            }
            
            // Recurse into arrays and objects
            if (Array.isArray(obj)) {
                obj.forEach((item, i) => searchForNews(item, `${path}[${i}]`));
            } else {
                Object.keys(obj).forEach(key => searchForNews(obj[key], `${path}.${key}`));
            }
        };
        
        searchForNews(data);
        
    } catch (error) {
        logger.error('Error extracting news from NextData', { error: error.message });
    }
    
    return news;
}

/**
 * Parses news/events from HTML (for event filtering)
 * @param {string} html - HTML content
 * @returns {Promise<Array>} Parsed events
 */
async function parseNewsHTML(html) {
    const allNews = await parseAllNewsHTML(html);
    return allNews.filter(item => isEventTitle(item.title));
}

/**
 * Checks if a title looks like an event
 * @param {string} title - Title to check
 * @returns {boolean} Whether it's an event
 */
function isEventTitle(title) {
    const eventKeywords = [
        'evento', 'event',
        'promo', 'promoção',
        'woe', 'war of emperium',
        'gvg', 'guild vs guild',
        'exp', 'experiência', 'dobro',
        'drop', 'bônus', 'bonus',
        'torneio', 'tournament',
        'competição', 'competition',
        'campanha', 'campaign',
        'festival', 'celebração',
        'atualização', 'update',
        'manutenção', 'maintenance'
    ];
    
    const titleLower = title.toLowerCase();
    return eventKeywords.some(keyword => titleLower.includes(keyword));
}

/**
 * Fetches and returns the latest news from GNJoy
 * @param {boolean} forceRefresh - Force refresh cache
 * @returns {Promise<Array>} Latest news items
 */
async function getLatestNews(forceRefresh = false) {
    // Check if should use cache (only refresh on Tuesdays and Fridays)
    if (!forceRefresh && !shouldRefreshNews()) {
        logger.debug('Using cached news (refresh only on Tue/Fri)', { 
            count: newsCache.data.length,
            lastRefresh: newsCache.lastRefresh
        });
        return newsCache.data;
    }
    
    try {
        logger.info('Fetching latest news from GNJoy...', { 
            reason: forceRefresh ? 'force refresh' : 'scheduled refresh day'
        });
        const response = await fetchPage(URLS.NEWS);
        
        if (!response) {
            logger.warn('No response from GNJoy news page');
            return newsCache.data;
        }
        
        const hasNextData = response.includes('__NEXT_DATA__');
        const hasNextPush = response.includes('self.__next_f.push');
        const hasNewsLinks = response.includes('/pt/news/notice/') || response.includes('/news/notice/');
        
        logger.info('Got response from GNJoy', { 
            length: response.length, 
            hasNextData,
            hasNextPush,
            hasNewsLinks
        });
        
        const news = await parseAllNewsHTML(response);
        
        // Update cache only if we got results
        if (news.length > 0) {
            const now = new Date();
            newsCache = {
                data: news,
                lastRefresh: now.toISOString(),
                lastRefreshDay: now.getDay()
            };
            // Save to file for persistence
            saveNewsCache();
        }
        
        logger.info('News fetched and cached successfully', { count: news.length });
        return news;
        
    } catch (error) {
        logger.error('Error fetching latest news', { error: error.message });
        return newsCache.data; // Return cached data on error
    }
}

/**
 * Categorizes news by type
 * @param {Array} news - News items
 * @returns {Object} Categorized news
 */
function categorizeNews(news) {
    const categories = {
        avisos: [],
        eventos: [],
        atualizacoes: [],
        outros: []
    };
    
    for (const item of news) {
        const titleLower = item.title.toLowerCase();
        
        if (titleLower.includes('patch') || titleLower.includes('manutenção') || titleLower.includes('atualização')) {
            categories.atualizacoes.push(item);
        } else if (titleLower.includes('evento') || titleLower.includes('promo') || titleLower.includes('bônus') || 
                   titleLower.includes('maratona') || titleLower.includes('passe')) {
            categories.eventos.push(item);
        } else if (titleLower.includes('aviso') || titleLower.includes('importante') || titleLower.includes('problema')) {
            categories.avisos.push(item);
        } else {
            categories.outros.push(item);
        }
    }
    
    return categories;
}

/**
 * Scrapes events from GNJoy
 * @returns {Promise<Array>} Scraped events
 */
async function scrapeEvents() {
    const allEvents = [];
    
    try {
        // Scrape news page
        logger.info('Scraping GNJoy news...');
        const newsHTML = await fetchPage(URLS.NEWS);
        const newsEvents = parseNewsHTML(newsHTML);
        allEvents.push(...newsEvents);
        
        // Scrape events page
        logger.info('Scraping GNJoy events page...');
        const eventsHTML = await fetchPage(URLS.EVENTS);
        const pageEvents = parseNewsHTML(eventsHTML);
        allEvents.push(...pageEvents);
        
        // Scrape event list
        logger.info('Scraping GNJoy event list...');
        const eventListHTML = await fetchPage(URLS.EVENT_LIST);
        const listEvents = parseNewsHTML(eventListHTML);
        allEvents.push(...listEvents);
        
        // Remove duplicates
        const unique = [];
        const seen = new Set();
        
        for (const event of allEvents) {
            const key = event.title.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(event);
            }
        }
        
        logger.info('GNJoy scraping completed', { 
            totalFound: allEvents.length, 
            unique: unique.length 
        });
        
        return unique;
        
    } catch (error) {
        logger.error('Error scraping GNJoy events', { error: error.message });
        return [];
    }
}

/**
 * Syncs scraped events to storage
 * @returns {Promise<Object>} Sync result
 */
async function syncEvents() {
    const scraped = await scrapeEvents();
    
    if (scraped.length === 0) {
        return { added: 0, updated: 0, scraped: 0 };
    }
    
    const existingEvents = eventsStorage.getEvents({ source: eventsStorage.EVENT_SOURCES.GNJOY });
    
    let added = 0;
    let updated = 0;
    
    for (const event of scraped) {
        // Check if event already exists (by title similarity)
        const existing = existingEvents.find(e => 
            e.title.toLowerCase() === event.title.toLowerCase() ||
            (event.externalId && e.sourceUrl?.includes(event.externalId))
        );
        
        if (!existing) {
            // Add new event
            // Set dates - default to 7 days from now if we can't determine
            const now = new Date();
            const defaultEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            
            eventsStorage.addEvent({
                title: event.title,
                description: `Evento obtido automaticamente do site do GNJoy LATAM`,
                source: eventsStorage.EVENT_SOURCES.GNJOY,
                sourceUrl: event.sourceUrl,
                startDate: now.toISOString(),
                endDate: defaultEnd.toISOString(),
                notifyMinutesBefore: [60, 15]
            });
            
            added++;
        }
    }
    
    // Update last scraped timestamp
    eventsStorage.updateLastScraped();
    
    logger.info('Event sync completed', { added, updated, scraped: scraped.length });
    
    return { added, updated, scraped: scraped.length };
}

/**
 * Gets scraping status
 * @returns {Object} Status info
 */
function getStatus() {
    const stats = eventsStorage.getStats();
    
    return {
        lastScraped: stats.lastScraped,
        gnjoyEvents: stats.gnjoyEvents,
        urls: URLS
    };
}

/**
 * Gets news cache information
 * @returns {Object} Cache info
 */
function getNewsCacheInfo() {
    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const refreshDayNames = REFRESH_DAYS.map(d => dayNames[d]);
    
    return {
        newsCount: newsCache.data.length,
        lastRefresh: newsCache.lastRefresh,
        lastRefreshDay: newsCache.lastRefreshDay !== null ? dayNames[newsCache.lastRefreshDay] : null,
        refreshDays: refreshDayNames,
        shouldRefresh: shouldRefreshNews()
    };
}

/**
 * Forces a news cache refresh
 * @returns {Promise<Object>} Result with news count
 */
async function forceRefreshNews() {
    logger.info('Forcing news cache refresh...');
    const news = await getLatestNews(true);
    return {
        success: news.length > 0,
        newsCount: news.length,
        lastRefresh: newsCache.lastRefresh
    };
}

module.exports = {
    fetchPage,
    parseNewsHTML,
    parseAllNewsHTML,
    scrapeEvents,
    syncEvents,
    getStatus,
    getLatestNews,
    categorizeNews,
    getNewsCacheInfo,
    forceRefreshNews,
    URLS,
    NEWS_CATEGORIES
};
