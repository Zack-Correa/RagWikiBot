/**
 * Divine Pride Forum Scraper
 * Monitors and scrapes changelog posts from the Divine Pride forum
 */

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../../utils/logger');

const FORUM_BASE = 'https://www.divine-pride.net/forum/index.php';
const CHANGELOG_URL = `${FORUM_BASE}?/forum/6-changelog/`;
const DP_SERVER = 'LATAM';

const MONTH_EN_TO_PT = {
    'january': 'Janeiro', 'february': 'Fevereiro', 'march': 'Março',
    'april': 'Abril', 'may': 'Maio', 'june': 'Junho',
    'july': 'Julho', 'august': 'Agosto', 'september': 'Setembro',
    'october': 'Outubro', 'november': 'Novembro', 'december': 'Dezembro'
};

function translateDateToPtBr(dateStr) {
    if (!dateStr) return dateStr;
    const match = dateStr.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
    if (!match) return dateStr;
    const monthPt = MONTH_EN_TO_PT[match[1].toLowerCase()];
    if (!monthPt) return dateStr;
    return `${match[2]} de ${monthPt}, ${match[3]}`;
}

/**
 * Ensures a Divine Pride database URL includes the /LATAM server suffix
 */
function ensureLatamUrl(url) {
    if (!url) return url;
    const match = url.match(/\/database\/(item|skill|monster|map)\/(\d+)(\/.*)?$/);
    if (!match) return url;
    const [, type, id, suffix] = match;
    if (suffix && suffix.length > 1) return url;
    return `https://www.divine-pride.net/database/${type}/${id}/${DP_SERVER}`;
}

const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
};
const REQUEST_TIMEOUT = 20000;

/**
 * Fetches the changelog forum listing and extracts topic links
 * @param {string} serverFilter - Server tag to filter (e.g., 'LATAM', 'iRO')
 * @returns {Promise<Array<{title: string, url: string, topicId: string, date: string}>>}
 */
async function fetchChangelogTopics(serverFilter = 'LATAM') {
    try {
        logger.debug('Fetching changelog topics', { serverFilter });

        const response = await axios.get(CHANGELOG_URL, {
            headers: REQUEST_HEADERS,
            timeout: REQUEST_TIMEOUT
        });

        const $ = cheerio.load(response.data);
        response.data = null;
        const topics = [];
        const filterLower = serverFilter.toLowerCase();

        $('h4, li[class*="ipsDataItem"]').each((_, el) => {
            const $el = $(el);
            const $link = $el.find('a').length ? $el.find('a').first() : $el.is('a') ? $el : null;

            if (!$link || !$link.length) return;

            const href = $link.attr('href') || '';
            const title = $link.text().trim();

            if (!href.includes('/topic/')) return;
            if (!title.toLowerCase().includes(filterLower)) return;

            const topicIdMatch = href.match(/\/topic\/(\d+)-/);
            if (!topicIdMatch) return;

            const dateMatch = title.match(/(\w+ \d{1,2},? \d{4})/i);

            topics.push({
                title,
                url: href.startsWith('http') ? href : `https://www.divine-pride.net${href}`,
                topicId: topicIdMatch[1],
                date: dateMatch ? translateDateToPtBr(dateMatch[1]) : null
            });
        });

        // Also try direct link extraction if h4 approach didn't work
        if (topics.length === 0) {
            $('a[href*="/topic/"]').each((_, link) => {
                const $link = $(link);
                const href = $link.attr('href') || '';
                const title = $link.text().trim();

                if (!title.toLowerCase().includes(filterLower)) return;
                if (!title.toLowerCase().includes('changelog')) return;

                const topicIdMatch = href.match(/\/topic\/(\d+)-/);
                if (!topicIdMatch) return;

                if (topics.find(t => t.topicId === topicIdMatch[1])) return;

                const dateMatch = title.match(/(\w+ \d{1,2},? \d{4})/i);

                topics.push({
                    title,
                    url: href.startsWith('http') ? href : `https://www.divine-pride.net${href}`,
                    topicId: topicIdMatch[1],
                    date: dateMatch ? translateDateToPtBr(dateMatch[1]) : null
                });
            });
        }

        // Deduplicate by topicId
        const seen = new Set();
        const uniqueTopics = topics.filter(t => {
            if (seen.has(t.topicId)) return false;
            seen.add(t.topicId);
            return true;
        });

        // Sort by topicId descending (higher ID = more recent post) as a reliable fallback
        // in case the forum page order changes (e.g. pinned topics)
        uniqueTopics.sort((a, b) => parseInt(b.topicId) - parseInt(a.topicId));

        logger.info('Changelog topics found', { serverFilter, count: uniqueTopics.length });
        return uniqueTopics;
    } catch (error) {
        logger.error('Error fetching changelog topics', { error: error.message });
        return [];
    }
}

/**
 * Fetches the raw HTML content of a changelog topic post
 * @param {string} topicUrl - Full URL to the topic
 * @returns {Promise<{html: string}|null>}
 */
async function fetchTopicContent(topicUrl) {
    try {
        logger.debug('Fetching topic content', { url: topicUrl });

        const response = await axios.get(topicUrl, {
            headers: REQUEST_HEADERS,
            timeout: REQUEST_TIMEOUT
        });

        const $ = cheerio.load(response.data);
        response.data = null;
        const postContent = $('[data-role="commentContent"]').first();

        if (!postContent.length) {
            logger.warn('No post content found', { url: topicUrl });
            return null;
        }

        const html = postContent.html();

        return { html };
    } catch (error) {
        logger.error('Error fetching topic content', { url: topicUrl, error: error.message });
        return null;
    }
}

/**
 * Parses the raw post HTML into structured changelog sections
 * @param {string} html - Raw HTML from the post content
 * @returns {Object} Parsed changelog structure
 */
function parseChangelogHTML(html) {
    const $ = cheerio.load(`<div id="root">${html}</div>`);
    const root = $('#root');

    const changelog = {
        added: {},
        changed: {}
    };

    let currentSection = null; // 'added' or 'changed'
    let currentCategory = null;
    let currentSpoilerContent = [];

    function processSpoilerForItems(spoilerEl) {
        const $spoiler = $(spoilerEl);
        const $contents = $spoiler.find('.ipsSpoiler_contents');
        if (!$contents.length) return [];

        const items = [];
        const contentHtml = $contents.html();
        const idBlocks = contentHtml.split(/(?=Id:\s*\(\d+\))/);

        for (const block of idBlocks) {
            const idMatch = block.match(/Id:\s*\((\d+)\)/);
            if (!idMatch) continue;

            const itemId = idMatch[1];

            const linkMatch = block.match(/<a[^>]*href="([^"]*\/database\/item\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
            let itemUrl = linkMatch ? linkMatch[1] : '';
            const linkInner = linkMatch ? linkMatch[2] : '';
            const boldMatch = linkInner.match(/<b>([\s\S]*?)<\/b>/i);
            const itemName = boldMatch ? boldMatch[1].trim() : linkInner.replace(/<[^>]+>/g, '').trim();

            const plainText = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
            const autoParsedIdx = plainText.indexOf('====== auto-parsed ======');
            let description = '';
            if (autoParsedIdx > -1 && itemName) {
                const afterId = plainText.indexOf(itemName);
                if (afterId > -1) {
                    description = plainText.substring(afterId + itemName.length, autoParsedIdx).trim();
                }
            }

            const typeInfo = {};
            const autoParsed = autoParsedIdx > -1 ? plainText.substring(autoParsedIdx) : '';
            const typeMatches = autoParsed.matchAll(/(\w[\w\s]+?)\s*:\s*(.+?)(?=\s+\w[\w\s]+?:|$)/g);
            for (const m of typeMatches) {
                typeInfo[m[1].trim()] = m[2].trim();
            }

            const fullUrl = itemUrl.startsWith('http') ? itemUrl : `https://www.divine-pride.net${itemUrl}`;
            items.push({
                id: itemId,
                name: itemName,
                url: ensureLatamUrl(fullUrl),
                description: description.substring(0, 500),
                typeInfo
            });
        }

        return items;
    }

    function processSpoilerForSkills(spoilerEl) {
        const $spoiler = $(spoilerEl);
        const $contents = $spoiler.find('.ipsSpoiler_contents');
        if (!$contents.length) return [];

        const skills = [];
        const contentHtml = $contents.html();
        const idBlocks = contentHtml.split(/(?=Id:\s*\(\d+\))/);

        for (const block of idBlocks) {
            const idMatch = block.match(/Id:\s*\((\d+)\)/);
            if (!idMatch) continue;

            const skillId = idMatch[1];
            const linkMatch = block.match(/<a[^>]*href="[^"]*\/database\/skill\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
            const linkInner = linkMatch ? linkMatch[1] : '';
            const boldMatch = linkInner.match(/<b>([\s\S]*?)<\/b>/i);
            const skillName = boldMatch ? boldMatch[1].trim() : linkInner.replace(/<[^>]+>/g, '').trim();

            const plainText = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
            const descMatch = plainText.match(/Description:\s*([\s\S]*?)(?=====|$)/);
            const description = descMatch ? descMatch[1].trim().substring(0, 300) : '';

            skills.push({
                id: skillId,
                name: skillName,
                description,
                url: `https://www.divine-pride.net/database/skill/${skillId}/${DP_SERVER}`
            });
        }

        return skills;
    }

    function processSpoilerForCombiItems(spoilerEl) {
        const $spoiler = $(spoilerEl);
        const $contents = $spoiler.find('.ipsSpoiler_contents');
        if (!$contents.length) return [];

        const combis = [];
        const text = $contents.text();
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        for (const line of lines) {
            // Format: "itemId1_itemId2 Item Name 1 Item Name 2"
            const match = line.match(/^(\d+)_(\d+)\s+(.+)/);
            if (match) {
                combis.push({
                    sourceId: match[1],
                    targetId: match[2],
                    description: match[3].trim()
                });
            }
        }

        return combis;
    }

    function processSpoilerForMaps(spoilerEl) {
        const $spoiler = $(spoilerEl);
        const $contents = $spoiler.find('.ipsSpoiler_contents');
        if (!$contents.length) return [];

        const maps = [];
        const $links = $contents.find('a[href*="/database/map/"]');

        $links.each((_, link) => {
            const $link = $(link);
            const href = $link.attr('href') || '';
            const name = $link.text().trim();
            const mapIdMatch = href.match(/\/database\/map\/([^/]+)/);

            if (mapIdMatch) {
                const fullUrl = href.startsWith('http') ? href : `https://www.divine-pride.net${href}`;
                maps.push({
                    id: mapIdMatch[1],
                    name,
                    url: ensureLatamUrl(fullUrl)
                });
            }
        });

        // Also parse plain text map entries
        if (maps.length === 0) {
            const text = $contents.text();
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                if (line.match(/^[a-z_0-9]+$/i) || line.includes(' - ')) {
                    maps.push({ id: line.split(' ')[0], name: line });
                }
            }
        }

        return maps;
    }

    function processSpoilerForNpcs(spoilerEl) {
        const $spoiler = $(spoilerEl);
        const $contents = $spoiler.find('.ipsSpoiler_contents');
        if (!$contents.length) return [];

        const npcs = [];
        const text = $contents.text();
        const blocks = text.split(/(?=Id:\s*\d+)/);

        for (const block of blocks) {
            const idMatch = block.match(/Id:\s*(\d+)/);
            if (!idMatch) continue;

            const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
            const name = lines.find(l => l.startsWith('JT_') || l.startsWith('4_')) || '';

            npcs.push({
                id: idMatch[1],
                name
            });
        }

        return npcs;
    }

    function processSpoilerForLapine(spoilerEl, type) {
        const $spoiler = $(spoilerEl);
        const $contents = $spoiler.find('.ipsSpoiler_contents');
        if (!$contents.length) return [];

        const lapineItems = [];
        const $links = $contents.find('a[href*="/database/item/"]');

        // Get the main item info
        const mainLink = $links.first();
        const mainName = mainLink.find('b').text().trim() || mainLink.text().trim();
        const mainHref = mainLink.attr('href') || '';
        const mainIdMatch = mainHref.match(/\/database\/item\/(\d+)/);

        const text = $contents.text();
        const needSourceMatch = text.match(/NeedSourceString:\s*(.+)/);

        const entry = {
            id: mainIdMatch ? mainIdMatch[1] : '',
            name: mainName,
            url: ensureLatamUrl(mainHref.startsWith('http') ? mainHref : `https://www.divine-pride.net${mainHref}`),
            needSource: needSourceMatch ? needSourceMatch[1].trim() : '',
            type, // 'upgrade' or 'ddukddak'
            targetItems: []
        };

        // Extract target/source items list
        $contents.find('li').each((_, li) => {
            const $li = $(li);
            const $itemLink = $li.find('a[href*="/database/item/"]');
            if ($itemLink.length) {
                const href = $itemLink.attr('href') || '';
                const idM = href.match(/\/database\/item\/(\d+)/);
                entry.targetItems.push({
                    id: idM ? idM[1] : '',
                    name: $itemLink.find('b').text().trim() || $itemLink.text().trim(),
                    url: ensureLatamUrl(href.startsWith('http') ? href : `https://www.divine-pride.net${href}`)
                });
            }
        });

        lapineItems.push(entry);
        return lapineItems;
    }

    // Walk through the top-level nodes to identify sections and categories
    const topNodes = root.contents();
    let pendingSpoilerCategory = null;

    topNodes.each((i, node) => {
        const $node = $(node);

        if (node.type === 'tag') {
            // Section header: <span style="text-decoration:underline;"><font size="3">Added/Changed</font></span>
            if (node.tagName === 'span') {
                const text = $node.text().trim().toLowerCase();
                if (text === 'added') currentSection = 'added';
                else if (text === 'changed') currentSection = 'changed';
            }

            // Category header: <b>CategoryName</b>
            if (node.tagName === 'b' && currentSection) {
                const catText = $node.text().trim();
                if (catText && !catText.includes(':') && !catText.includes('Target') && !catText.includes('Source')) {
                    currentCategory = catText;
                    pendingSpoilerCategory = catText;
                }
            }

            // Spoiler content
            if ($node.hasClass('ipsSpoiler') && currentSection && pendingSpoilerCategory) {
                const section = changelog[currentSection];
                const cat = pendingSpoilerCategory;

                if (!section[cat]) section[cat] = [];

                switch (cat) {
                    case 'Item':
                        section[cat].push(...processSpoilerForItems(node));
                        break;
                    case 'Skill':
                        section[cat].push(...processSpoilerForSkills(node));
                        break;
                    case 'Combiitem':
                        section[cat].push(...processSpoilerForCombiItems(node));
                        break;
                    case 'Map':
                        section[cat].push(...processSpoilerForMaps(node));
                        break;
                    case 'NpcIdentity':
                        section[cat].push(...processSpoilerForNpcs(node));
                        break;
                    case 'LapineUpgradeBox':
                        section[cat].push(...processSpoilerForLapine(node, 'upgrade'));
                        break;
                    case 'LapineDdukddakBox':
                        section[cat].push(...processSpoilerForLapine(node, 'ddukddak'));
                        break;
                    case 'Quest':
                        // Store raw text for quests
                        const questText = $node.find('.ipsSpoiler_contents').text().trim();
                        section[cat].push({ raw: questText.substring(0, 500) });
                        break;
                    default:
                        // Generic: store raw text
                        const rawText = $node.find('.ipsSpoiler_contents').text().trim();
                        section[cat].push({ raw: rawText.substring(0, 500) });
                }

                pendingSpoilerCategory = null;
            }
        }
    });

    return changelog;
}

const PT_BR_CHARS = /[ãçéêúíóâõÃÇÉÊÚÍÓÂÕ]/;
const ES_CHARS = /[ñ¡¿Ñ]/;

/**
 * Generic language deduplication.
 * Groups entries by a key, picks the PT-BR version (index 1 in the EN/PT/ES order).
 * @param {Array} entries - Array of parsed entries
 * @param {Function} keyFn - Function to extract grouping key from an entry
 * @param {Object} options - { mergeFn: optional function to merge data from EN version }
 * @returns {Array} Deduplicated entries
 */
function deduplicateByLanguage(entries, keyFn, options = {}) {
    if (!entries || entries.length === 0) return entries || [];

    const grouped = new Map();
    for (const entry of entries) {
        const key = keyFn(entry);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(entry);
    }

    const result = [];
    for (const [, versions] of grouped) {
        if (versions.length === 1) {
            result.push(versions[0]);
            continue;
        }

        const textOf = v => `${v.name || ''} ${v.description || ''} ${v.raw || ''}`;
        const ptBr = versions.find(v => PT_BR_CHARS.test(textOf(v)));
        const spanish = versions.find(v => ES_CHARS.test(textOf(v)));

        let selected;
        if (ptBr) {
            selected = ptBr;
        } else if (versions.length === 3) {
            selected = versions[1];
        } else if (versions.length === 2 && spanish) {
            selected = versions.find(v => v !== spanish) || versions[0];
        } else {
            selected = versions[1] || versions[0];
        }

        const enVersion = versions[0];
        if (enVersion && enVersion !== selected) {
            selected.nameEn = enVersion.name;
            if (options.mergeFn) options.mergeFn(selected, enVersion);
        }

        result.push(selected);
    }

    return result;
}

/**
 * Deduplicates items, preserving typeInfo from the EN version if missing in PT-BR.
 */
function deduplicateItemsByLanguage(items) {
    return deduplicateByLanguage(items, i => i.id, {
        mergeFn: (selected, en) => {
            if (en.typeInfo && (!selected.typeInfo || Object.keys(selected.typeInfo).length === 0)) {
                selected.typeInfo = en.typeInfo;
            }
        }
    });
}

/**
 * Deduplicates all sections of a parsed changelog (Item, Skill, Combiitem, Map, NPC, Lapine, Quest).
 * Should be called after parseChangelogHTML.
 */
const DP_LANG_COOKIES = `lang=pt; server=latam`;
const TITLE_REGEX = /<title[^>]*>Divine Pride - (?:Item|Skill) - ([^<]+)<\/title>/i;

/**
 * Fetches item names from the Divine Pride website in PT-BR.
 * Extracts from <title> using regex (no DOM parsing) to save memory.
 * Best-effort: silently skips on errors.
 */
async function fetchItemNames(missingIds) {
    if (missingIds.length === 0) return new Map();

    const results = new Map();
    const batchSize = 3;

    for (let i = 0; i < missingIds.length; i += batchSize) {
        const batch = missingIds.slice(i, i + batchSize);
        const promises = batch.map(async (id) => {
            try {
                const resp = await axios.get(`https://www.divine-pride.net/database/item/${id}/${DP_SERVER}`, {
                    headers: { ...REQUEST_HEADERS, 'Cookie': DP_LANG_COOKIES },
                    timeout: 8000,
                    responseType: 'text'
                });
                const titleMatch = typeof resp.data === 'string' ? resp.data.match(TITLE_REGEX) : null;
                resp.data = null;
                if (titleMatch && titleMatch[1]) results.set(id, titleMatch[1].trim());
            } catch (err) {
                logger.debug('Failed to fetch item name', { id, error: err.message });
            }
        });
        await Promise.all(promises);
    }

    logger.debug('Fetched missing item names from web', { requested: missingIds.length, resolved: results.size });
    return results;
}

/**
 * Deduplicates all sections of a parsed changelog and resolves combo item names to PT-BR.
 * Should be called after parseChangelogHTML.
 */
async function deduplicateChangelog(changelog) {
    const itemNameMap = new Map();

    for (const section of ['added', 'changed']) {
        if (!changelog[section]) continue;
        const s = changelog[section];

        if (s.Item) s.Item = deduplicateItemsByLanguage(s.Item);
        if (s.Skill) s.Skill = deduplicateByLanguage(s.Skill, sk => sk.id);
        if (s.Map) s.Map = deduplicateByLanguage(s.Map, m => m.id);
        if (s.NpcIdentity) s.NpcIdentity = deduplicateByLanguage(s.NpcIdentity, n => n.id);
        if (s.Quest && s.Quest.length > 1) {
            const totalQuests = s.Quest.length;
            if (totalQuests % 3 === 0) {
                s.Quest = s.Quest.filter((_, i) => i % 3 === 1);
            } else if (totalQuests % 2 === 0) {
                s.Quest = s.Quest.filter((_, i) => i % 2 === 1);
            }
        }

        for (const key of ['LapineUpgradeBox', 'LapineDdukddakBox']) {
            if (s[key]) s[key] = deduplicateByLanguage(s[key], l => l.id);
        }

        if (s.Item) {
            for (const item of s.Item) {
                if (item.id && item.name) itemNameMap.set(item.id, item.name);
            }
        }
    }

    // Collect all combo item IDs missing from the name map
    const missingIds = new Set();
    for (const section of ['added', 'changed']) {
        if (!changelog[section]?.Combiitem) continue;
        for (const combo of changelog[section].Combiitem) {
            if (!itemNameMap.has(combo.sourceId)) missingIds.add(combo.sourceId);
            if (!itemNameMap.has(combo.targetId)) missingIds.add(combo.targetId);
        }
    }

    // Fetch missing names from the API
    if (missingIds.size > 0) {
        const fetched = await fetchItemNames([...missingIds]);
        for (const [id, name] of fetched) {
            itemNameMap.set(id, name);
        }
    }

    // Resolve combo names using the complete name map
    for (const section of ['added', 'changed']) {
        if (!changelog[section]?.Combiitem) continue;
        for (const combo of changelog[section].Combiitem) {
            const srcName = itemNameMap.get(combo.sourceId);
            const tgtName = itemNameMap.get(combo.targetId);
            if (srcName) combo.sourceName = srcName;
            if (tgtName) combo.targetName = tgtName;
        }
    }

    return changelog;
}

module.exports = {
    fetchChangelogTopics,
    fetchTopicContent,
    parseChangelogHTML,
    deduplicateItemsByLanguage,
    deduplicateChangelog,
    CHANGELOG_URL
};
