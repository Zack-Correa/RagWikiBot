/**
 * Parser utilities
 * Handles parsing of API responses and HTML content
 */

const logger = require('./logger');
const { ValidationError } = require('./errors');
const i18n = require('./i18n');

/**
 * Parses HTML content using regex to extract item, monster, or map information
 * @param {string} html - HTML content to parse
 * @param {string} type - Type of entity to search for: 'item', 'monster', or 'map' (default: 'item')
 * @returns {Array<string>|null} Parsed HTML fragments or null if no matches
 */
function parseHTMLByRegex(html, type = 'item') {
    if (!html || typeof html !== 'string') {
        logger.warn('Invalid HTML input for parsing');
        return null;
    }

    try {
        let regexp;
        let parsedHTML = null;
        
        // Define patterns based on entity type
        if (type === 'monster') {
            // Try to find the monster section in the HTML first
            // Look for rows (tr) that contain monster links specifically
            regexp = /<tr[^>]*>[\s\S]*?\/database\/monster\/\d+[\s\S]*?<\/tr>/gi;
            parsedHTML = html.match(regexp);
            
            // If that doesn't work, try table cells with monster links
            if (!parsedHTML || parsedHTML.length === 0) {
                regexp = /<td[^>]*>[\s\S]*?<a[^>]*href[^>]*\/database\/monster\/\d+[^>]*>[\s\S]*?<\/td>/gi;
                parsedHTML = html.match(regexp);
            }
            
            // Last resort: any element containing monster link
            if (!parsedHTML || parsedHTML.length === 0) {
                regexp = /<a[^>]*href="[^"]*\/database\/monster\/(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
                parsedHTML = html.match(regexp);
            }
        } else if (type === 'map') {
            // Try to find the map section in the HTML first
            // Look for rows (tr) that contain map links specifically
            regexp = /<tr[^>]*>[\s\S]*?\/database\/map\/[a-zA-Z0-9_]+[\s\S]*?<\/tr>/gi;
            parsedHTML = html.match(regexp);
            
            // If that doesn't work, try table cells with map links
            if (!parsedHTML || parsedHTML.length === 0) {
                regexp = /<td[^>]*>[\s\S]*?<a[^>]*href[^>]*\/database\/map\/[a-zA-Z0-9_]+[^>]*>[\s\S]*?<\/td>/gi;
                parsedHTML = html.match(regexp);
            }
            
            // Last resort: any element containing map link
            if (!parsedHTML || parsedHTML.length === 0) {
                regexp = /<a[^>]*href="[^"]*\/database\/map\/([a-zA-Z0-9_]+)"[^>]*>([\s\S]*?)<\/a>/gi;
                parsedHTML = html.match(regexp);
            }
        } else {
            // Default: item patterns
            // Pattern 1: Original pattern
            regexp = /<td>[\n\r]\s*<img(<a href)*((.|[\n\r])*?(<\/td>))/g;
            parsedHTML = html.match(regexp);
            
            // Pattern 2: More flexible pattern for table cells with links
            if (!parsedHTML || parsedHTML.length === 0) {
                regexp = /<td[^>]*>[\s\S]*?<a[^>]*href[^>]*item[^>]*>[\s\S]*?<\/td>/gi;
                parsedHTML = html.match(regexp);
            }
            
            // Pattern 3: Look for any table cell containing item links
            if (!parsedHTML || parsedHTML.length === 0) {
                regexp = /<td[^>]*>[\s\S]{0,500}?item\/\d+[\s\S]{0,500}?<\/td>/gi;
                parsedHTML = html.match(regexp);
            }
        }
        
        if (!parsedHTML || parsedHTML.length === 0) {
            logger.debug('No matches found with any regex pattern', {
                type,
                htmlLength: html.length,
                htmlPreview: html.substring(0, 1000)
            });
            return null;
        }

        // Split by <td> and filter empty items
        const result = parsedHTML.toString().split('<td>').filter(item => item.trim().length > 0);
        
        logger.debug('HTML parsed successfully', {
            type,
            matchesFound: parsedHTML.length,
            resultLength: result.length
        });
        
        return result;
    } catch (error) {
        logger.error('Error parsing HTML by regex', { type, error: error.message });
        return null;
    }
}

/**
 * Parses wiki API response
 * @param {Array|string} response - Wiki API response
 * @returns {Array<string>} Parsed response with search term and results
 */
function parseWikiResponse(response) {
    if (!response) {
        throw new ValidationError('Resposta vazia', 'Nenhum resultado encontrado!');
    }

    try {
        // Handle both old opensearch format and new Action API format
        let parsed;
        
        if (typeof response === 'string') {
            // Old format - string that needs parsing
            try {
                parsed = JSON.parse(response);
            } catch (parseError) {
                logger.error('JSON parse error', { 
                    error: parseError.message,
                    responsePreview: response.substring(0, 500)
                });
                throw new ValidationError('Erro ao processar JSON', 'Erro ao processar resposta da wiki.');
            }
        } else if (typeof response === 'object') {
            // New format - already parsed object from Action API
            parsed = response;
        } else {
            throw new ValidationError('Formato de resposta inválido', 'Erro ao processar resposta da wiki.');
        }

        logger.debug('Parsed wiki response', { 
            type: typeof parsed,
            hasQuery: !!parsed.query,
            hasSearch: !!parsed.query?.search
        });

        // Check if it's Action API format (new format)
        if (parsed.query && parsed.query.search) {
            const searchResults = parsed.query.search;
            const searchTerm = parsed.query?.searchinfo?.search || 'Busca';

            logger.debug('Action API response details', { 
                searchTerm,
                resultsCount: searchResults.length
            });

            // Check if no results found
            if (!searchResults || searchResults.length === 0) {
                logger.debug('No results found', { searchTerm });
                return { searchTerm, results: [], totalResults: 0 };
            }

            // Organize results similar to bROWiki format
            // Separate results that match in title vs results that match in text
            const allResults = [];

            for (const result of searchResults) {
                const title = result.title || '';
                const snippet = result.snippet || '';
                
                // Skip redirects - they have special indicators
                if (title.toLowerCase().includes('redirect') || 
                    snippet.toLowerCase().includes('redirect') ||
                    result.isredirect) {
                    logger.debug('Skipping redirect page', { title });
                    continue;
                }
                
                // Skip empty or invalid results
                if (!title || title.trim() === '') {
                    continue;
                }
                
                // Create wiki URL
                const wikiUrl = `https://browiki.org/wiki/${encodeURIComponent(title)}`;
                
                // Clean snippet (remove HTML tags and format)
                let cleanSnippet = snippet
                    .replace(/<span class="searchmatch">/g, '**') // Bold search matches
                    .replace(/<\/span>/g, '**')
                    .replace(/<[^>]+>/g, '') // Remove other HTML tags
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\*\*\*\*/g, '**') // Fix double bolds
                    .replace(/\{\{.*?\}\}/g, '') // Remove template tags
                    .replace(/#REDIRECT/gi, '') // Remove redirect text
                    .replace(/\|\s*\w+\s*=/g, '') // Remove template parameters like "| tipo ="
                    .replace(/\|\s*qreward\s*=.*$/gi, '') // Remove qreward parameters
                    .replace(/\|\s*\w+reward\s*=.*$/gi, '') // Remove any reward parameters
                    .replace(/\s+/g, ' ') // Normalize whitespace
                    .trim();
                
                // Remove if snippet is too short or meaningless after cleaning
                if (cleanSnippet.length < 10 || 
                    /^[\s\|\=\*]+$/.test(cleanSnippet) ||
                    cleanSnippet === '...' ||
                    cleanSnippet === '') {
                    cleanSnippet = '';
                }
                
                // Limit snippet length
                if (cleanSnippet && cleanSnippet.length > 200) {
                    cleanSnippet = cleanSnippet.substring(0, 197) + '...';
                }
                
                const resultData = {
                    title: title,
                    url: wikiUrl,
                    snippet: cleanSnippet || '',
                    isInTitle: title.toLowerCase().includes(searchTerm.toLowerCase())
                };
                
                allResults.push(resultData);
            }

            // Check if we have results after filtering
            if (allResults.length === 0) {
                logger.debug('No valid results after filtering', { searchTerm });
                return { searchTerm, results: [], totalResults: 0 };
            }

            return { 
                searchTerm, 
                results: allResults,
                totalResults: allResults.length
            };
        }
        
        // Fallback to old opensearch format for backwards compatibility
        if (Array.isArray(parsed) && parsed.length >= 3) {
            const searchTerm = parsed[0] || 'Busca';
            const titles = parsed[1] || [];
            const descriptions = parsed[2] || [];
            const urls = parsed[3] || [];

            if (!titles || titles.length === 0) {
                logger.debug('No results found (opensearch)', { searchTerm });
                return { searchTerm, results: [], totalResults: 0 };
            }

            const allResults = [];

            for (let i = 0; i < titles.length; i++) {
                const title = titles[i];
                const description = descriptions[i] || '';
                const url = urls[i] || '';
                
                // Skip redirects
                if (title.toLowerCase().includes('redirect') || 
                    description.toLowerCase().includes('redirect')) {
                    continue;
                }
                
                const wikiUrl = url || `https://browiki.org/wiki/${encodeURIComponent(title)}`;
                
                let cleanSnippet = description
                    .replace(/\{\{.*?\}\}/g, '')
                    .replace(/\[\[([^\]]+)\]\]/g, (match, linkText) => {
                        const linkParts = linkText.split('|');
                        const linkName = linkParts[0];
                        const displayText = linkParts[1] || linkName;
                        return `[${displayText}](https://browiki.org/wiki/${encodeURIComponent(linkName)})`;
                    })
                    .replace(/#REDIRECT/gi, '')
                    .replace(/\|\s*\w+\s*=/g, '') // Remove template parameters
                    .replace(/\|\s*qreward\s*=.*$/gi, '') // Remove qreward parameters
                    .replace(/\s+/g, ' ') // Normalize whitespace
                    .replace(/#/g, '')
                    .trim();
                
                // Remove if too short or meaningless
                if (cleanSnippet.length < 10 || 
                    /^[\s\|\=\*]+$/.test(cleanSnippet) ||
                    cleanSnippet === '...' ||
                    cleanSnippet === '') {
                    cleanSnippet = '';
                }
                
                if (cleanSnippet && cleanSnippet.length > 200) {
                    cleanSnippet = cleanSnippet.substring(0, 197) + '...';
                }
                
                allResults.push({
                    title: title,
                    url: wikiUrl,
                    snippet: cleanSnippet || '',
                    isInTitle: title.toLowerCase().includes(searchTerm.toLowerCase())
                });
            }
            
            return { 
                searchTerm, 
                results: allResults,
                totalResults: allResults.length
            };
        }

        throw new ValidationError('Estrutura de resposta inválida', 'Erro ao processar resposta da wiki.');
    } catch (error) {
        logger.error('Error parsing wiki response', { 
            error: error.message,
            stack: error.stack
        });
        
        if (error instanceof ValidationError) {
            throw error;
        }
        
        throw new ValidationError('Erro ao processar resposta da wiki', 'Erro ao processar os resultados da busca.');
    }
}

/**
 * Parses database response for item by ID
 * @param {Object} response - API response object
 * @param {string} itemId - Item ID for URL generation
 * @param {string} language - Language code for translations (default: 'pt-br')
 * @returns {Promise<string>} Formatted item information
 */
function parseDatabaseResponse(response, itemId, language = 'pt-br') {
    return new Promise((resolve, reject) => {
        if (!response) {
            return reject(new ValidationError('Resposta vazia', 'Item não encontrado.'));
        }

        if (!itemId) {
            return reject(new ValidationError('ID do item não fornecido', 'ID do item é obrigatório.'));
        }

        try {
            // Get translations for the specified language
            const t = i18n.getLanguage(language);
            // Remove illegal "^000000" color codes and format to JSON
            let formattedResponse = JSON.stringify(response);
            // Only remove valid color codes (^ followed by 6 hex digits)
            formattedResponse = JSON.parse(formattedResponse.replace(/\\\^[0-9A-Fa-f]{6}/g, ''));

            // Log full response for debugging
            logger.debug('Full item response', { 
                itemId, 
                responseKeys: Object.keys(formattedResponse),
                sampleData: JSON.stringify(formattedResponse).substring(0, 500)
            });

            if (!formattedResponse.name) {
                return reject(new ValidationError('Item inválido', 'Item não encontrado ou inválido.'));
            }

            // Clean string helper - preserves full text
            const cleanString = (str) => {
                if (typeof str !== 'string') return str;
                // Be more careful with color code removal - only remove if it starts with ^
                return str
                    .replace(/\^[0-9A-Fa-f]{6}/g, '') // Remove color codes like ^000000
                    .replace(/\r\n/g, '\n') // Normalize line breaks
                    .replace(/^\s+|\s+$/g, ''); // Remove only whitespace from edges, not characters
            };

            const name = cleanString(formattedResponse.name || 'Nome não disponível');
            const description = cleanString(formattedResponse.description || 'Descrição não disponível');
            const url = `https://www.divine-pride.net/database/item/${itemId}`;
            
            // Extract additional item info with proper cleaning
            const itemType = cleanString(formattedResponse.itemType || formattedResponse.type || '');
            const itemSubType = cleanString(formattedResponse.itemSubType || formattedResponse.subType || '');
            const attack = formattedResponse.attack || formattedResponse.atk || 0;
            const defense = formattedResponse.defense || formattedResponse.def || 0;
            const weight = formattedResponse.weight || 0;
            const requiredLevel = formattedResponse.requiredLevel || formattedResponse.levelRequirement || 0;
            const equipLevel = formattedResponse.equipLevel || formattedResponse.equipLevelMin || 0;
            const slots = formattedResponse.slots || formattedResponse.slot || 0;
            
            // Extract applicable classes/jobs
            let applicableJobs = '';
            if (formattedResponse.applicableJob) {
                applicableJobs = cleanString(formattedResponse.applicableJob);
            } else if (formattedResponse.applicableJobs && Array.isArray(formattedResponse.applicableJobs)) {
                applicableJobs = formattedResponse.applicableJobs.map(j => cleanString(j.name || j)).join(', ');
            } else if (formattedResponse.classes) {
                applicableJobs = cleanString(formattedResponse.classes);
            }
            
            // Build formatted info
            let info = `**${name}**\n\n`;
            info += `${t.item.description}\n${description}\n\n`;
            
            // Item properties
            info += `${t.item.properties}\n`;
            
            // Type
            if (itemType) {
                let typeText = itemType;
                if (itemSubType && itemSubType !== itemType) {
                    typeText += ` - ${itemSubType}`;
                }
                info += `• ${t.item.type}: ${typeText}\n`;
            }
            
            // Attack/Defense
            if (attack && attack > 0) {
                info += `• ${t.item.attack}: ${attack}\n`;
            }
            if (defense && defense > 0) {
                info += `• ${t.item.defense}: ${defense}\n`;
            }
            
            // Weight
            if (weight && weight > 0) {
                info += `• ${t.item.weight}: ${weight}\n`;
            }
            
            // Level requirement
            if (requiredLevel && requiredLevel > 0) {
                let levelText = `${requiredLevel}`;
                if (equipLevel && equipLevel !== requiredLevel && equipLevel > 0) {
                    levelText += ` (${t.item.equip}: ${equipLevel})`;
                }
                info += `• ${t.item.level}: ${levelText}\n`;
            }
            
            // Slots
            if (slots > 0) {
                info += `• ${t.item.slots}: ${slots}\n`;
            }
            
            // Applicable jobs/classes
            if (applicableJobs && applicableJobs !== 'N/A') {
                info += `• ${t.item.classes}: ${applicableJobs}\n`;
            }
            
            info += `\n🔗 [${t.item.viewMore}](${url})`;

            logger.debug('Item parsed successfully', { itemId, name });
            
            resolve(info);
        } catch (error) {
            logger.error('Error parsing database response', { itemId, error: error.message });
            reject(new ValidationError('Erro ao processar resposta', 'Erro ao processar informações do item.'));
        }
    });
}

/**
 * Parses database search response (HTML)
 * @param {string} searchedWord - Original search term
 * @param {Array<string>} response - Parsed HTML response array
 * @returns {Promise<Array<string>>} Parsed response with search term and results
 */
function parseDatabaseBodyResponse(searchedWord, response) {
    return new Promise((resolve, reject) => {
        if (!searchedWord) {
            return reject(new ValidationError('Termo de busca não fornecido', 'Termo de busca é obrigatório.'));
        }

        if (!response || !Array.isArray(response)) {
            return reject(new ValidationError('Resposta inválida', 'Não foram encontrados resultados!'));
        }

        if (response.length === 0) {
            return reject(new ValidationError('Nenhum resultado', 'Não foram encontrados resultados!'));
        }

        try {
            const parsedResponse = [searchedWord];

            // Remove first element (usually empty or garbage)
            const cleanedResponse = response.slice(1);

            // Process all results (Discord embed field limit is 1024 chars, we'll handle splitting if needed)
            let itemsFound = 0;
            for (let i = 0; i < cleanedResponse.length; i++) {
                const body = cleanedResponse[i];
                if (!body || typeof body !== 'string') continue;

                try {
                    // Try multiple patterns to extract item name and ID
                    // Pattern 1: alt="Item Name" and href with item/ID
                    let nameMatch = body.match(/alt="([^"]+)"/);
                    let idMatch = body.match(/item\/(\d+)/);
                    
                    // Pattern 2: Try href pattern with title
                    if (!nameMatch) {
                        nameMatch = body.match(/title="([^"]+)"/);
                    }
                    
                    // Pattern 3: Try href with item ID in different format
                    if (!idMatch) {
                        idMatch = body.match(/href="[^"]*item[\/=](\d+)/);
                    }
                    
                    // Pattern 4: Try to find item ID anywhere in the string
                    if (!idMatch) {
                        idMatch = body.match(/(?:item|id)[\/=](\d+)/i);
                    }

                    if (nameMatch && idMatch) {
                        let itemName = nameMatch[1]
                            .replace(/&#(\d+);/g, (match, code) => {
                                return String.fromCharCode(parseInt(code, 10));
                            })
                            .replace(/&quot;/g, '"')
                            .replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .trim();

                        const itemId = idMatch[1];
                        const itemURL = `https://www.divine-pride.net/database/item/${itemId}`;

                        // Format: [Item Name](URL)
                        parsedResponse.push(`[${itemName}](${itemURL})`);
                        itemsFound++;
                    } else {
                        // Log for debugging if we have HTML but can't parse it
                        logger.debug('Could not extract item data from HTML fragment', {
                            index: i,
                            hasNameMatch: !!nameMatch,
                            hasIdMatch: !!idMatch,
                            bodyPreview: body.substring(0, 200)
                        });
                    }
                } catch (parseError) {
                    logger.warn('Error parsing individual item', { 
                        index: i, 
                        error: parseError.message 
                    });
                    // Continue with next item
                }
            }
            
            logger.debug('Parsed items from response', {
                searchedWord,
                totalFragments: cleanedResponse.length,
                itemsFound: itemsFound
            });

            // Add full search URL at the end
            const searchURL = `\n\n[🔍 Pesquisa completa](${encodeURI(`https://www.divine-pride.net/database/search?q=${searchedWord}`)})`;
            parsedResponse.push(searchURL);

            // Check if we found any items (parsedResponse should have: searchedWord + items + searchURL)
            // If length is 2, it means only searchedWord + searchURL (no items found)
            if (parsedResponse.length <= 2 || itemsFound === 0) {
                // Only search term and URL, no results
                logger.warn('No items found in parsed response', {
                    searchedWord,
                    parsedResponseLength: parsedResponse.length,
                    itemsFound: itemsFound
                });
                return reject(new ValidationError('Nenhum resultado', 'Não foram encontrados resultados!'));
            }

            logger.debug('Database body parsed successfully', { 
                searchedWord, 
                resultsCount: parsedResponse.length - 2 
            });

            resolve(parsedResponse);
        } catch (error) {
            logger.error('Error parsing database body response', { 
                searchedWord, 
                error: error.message 
            });
            reject(new ValidationError('Erro ao processar resposta', 'Erro ao processar os resultados da busca.'));
        }
    });
}

/**
 * Parses search results for monsters
 * @param {string} searchedWord - The search term
 * @param {Array} response - Array of parsed HTML fragments
 * @param {string} server - Server identifier for MVP checking
 * @returns {Promise<Array>} Formatted results array
 */
function parseMonsterSearchBodyResponse(searchedWord, response, server = null) {
    return new Promise(async (resolve, reject) => {
        if (!searchedWord) {
            return reject(new ValidationError('Termo de busca não fornecido', 'Termo de busca é obrigatório.'));
        }

        if (!response || !Array.isArray(response)) {
            return reject(new ValidationError('Resposta inválida', 'Não foram encontrados resultados!'));
        }

        if (response.length === 0) {
            return reject(new ValidationError('Nenhum resultado', 'Não foram encontrados resultados!'));
        }

        try {
            const parsedResponse = [searchedWord];
            const cleanedResponse = response.slice(1);
            let monstersFound = 0;
            const tempMonsters = []; // Store temporarily to check MVP status

            for (let i = 0; i < cleanedResponse.length; i++) {
                const body = cleanedResponse[i];
                if (!body || typeof body !== 'string') continue;

                try {
                    // First, ensure this is actually a monster (not an item or map)
                    // Check if the body contains a link to /database/monster/
                    if (!body.includes('/database/monster/') && !body.includes('monster/')) {
                        continue; // Skip this entry, it's not a monster
                    }
                    
                    // Also skip if it contains item or map links
                    if (body.includes('/database/item/') || body.includes('/database/map/')) {
                        continue;
                    }
                    
                    let nameMatch = body.match(/alt="([^"]+)"/);
                    let idMatch = body.match(/\/database\/monster\/(\d+)/);
                    
                    if (!nameMatch) {
                        nameMatch = body.match(/title="([^"]+)"/);
                    }
                    
                    if (!nameMatch) {
                        // Try to extract from link text
                        nameMatch = body.match(/>([^<]+)<\/a>/);
                    }
                    
                    if (!idMatch) {
                        idMatch = body.match(/monster[\/=](\d+)/);
                    }

                    if (nameMatch && idMatch) {
                        let monsterName = nameMatch[1]
                            .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(parseInt(code, 10)))
                            .replace(/&quot;/g, '"')
                            .replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/(\^[0-9|a-z]{6,7})/gi, '') // Remove color codes
                            .trim();
                        
                        // Skip if name is empty or invalid
                        if (!monsterName || monsterName.length === 0) {
                            continue;
                        }
                        
                        // Skip Korean characters (Hangul unicode range: \uAC00-\uD7AF)
                        if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(monsterName)) {
                            logger.debug('Skipping Korean monster name', { monsterName });
                            continue;
                        }
                        
                        // Skip names with encoding issues (common patterns)
                        if (/[\u0000-\u001F\uFFFD]/.test(monsterName) || // Control chars or replacement char
                            monsterName.includes('�') || // Replacement character
                            monsterName.includes('&#x') || // Unprocessed HTML entities
                            /[^\x00-\x7F\u00A0-\u024F\u0400-\u04FF\u2000-\u206F\u3000-\u303F\uFF00-\uFFEF]/.test(monsterName)) {
                            logger.debug('Skipping monster with encoding issues', { monsterName });
                            continue;
                        }
                        
                        // Skip placeholder names
                        if (monsterName.toLowerCase().includes('[ph]') ||
                            monsterName.toLowerCase().includes('placeholder') ||
                            monsterName.toLowerCase().includes('unknown') ||
                            monsterName === 'N/A' ||
                            monsterName === '?') {
                            continue;
                        }

                        const monsterId = idMatch[1];
                        const monsterURL = `https://www.divine-pride.net/database/monster/${monsterId}`;

                        tempMonsters.push({
                            name: monsterName,
                            id: monsterId,
                            url: monsterURL
                        });
                        monstersFound++;
                    } else {
                        logger.debug('Could not extract monster data from HTML fragment', {
                            index: i,
                            hasNameMatch: !!nameMatch,
                            hasIdMatch: !!idMatch,
                            bodyPreview: body.substring(0, 200)
                        });
                    }
                } catch (parseError) {
                    logger.warn('Error parsing individual monster', { 
                        index: i, 
                        error: parseError.message 
                    });
                }
            }
            
            logger.debug('Parsed monsters from response', {
                searchedWord,
                totalFragments: cleanedResponse.length,
                monstersFound: monstersFound
            });

            if (monstersFound === 0) {
                logger.warn('No monsters found in parsed response', {
                    searchedWord,
                    parsedResponseLength: parsedResponse.length,
                    monstersFound: monstersFound
                });
                return reject(new ValidationError('Nenhum resultado', 'Não foram encontrados resultados!'));
            }

            // Check MVP status in parallel (with timeout)
            try {
                const divinePride = require('../integrations/database/divine-pride');
                
                const mvpCheckPromises = tempMonsters.map(async (monster) => {
                    try {
                        const monsterData = await divinePride.monsterSearch(monster.id, server);
                        const isMvp = monsterData?.stats?.mvp === 1;
                        return { id: monster.id, isMvp };
                    } catch {
                        return { id: monster.id, isMvp: false };
                    }
                });
                
                // Wait for all checks with a timeout of 4 seconds
                const mvpResults = await Promise.race([
                    Promise.all(mvpCheckPromises),
                    new Promise((resolve) => setTimeout(() => resolve([]), 4000))
                ]);
                
                // Create map of MVP status
                const mvpMap = new Map();
                if (Array.isArray(mvpResults)) {
                    mvpResults.forEach(r => mvpMap.set(r.id, r.isMvp));
                }
                
                // Add formatted results with MVP indicators
                tempMonsters.forEach(monster => {
                    const isMvp = mvpMap.get(monster.id) || false;
                    if (isMvp) {
                        // Place crown inside the link for better visibility
                        parsedResponse.push(`[👑 ${monster.name}](${monster.url})`);
                    } else {
                        parsedResponse.push(`[${monster.name}](${monster.url})`);
                    }
                });
                
                logger.debug('MVP status checked', {
                    searchedWord,
                    mvpCount: Array.from(mvpMap.values()).filter(v => v).length
                });
            } catch (error) {
                logger.warn('Error checking MVP status, continuing without indicators', {
                    error: error.message
                });
                
                // Fallback: add without MVP indicators
                tempMonsters.forEach(monster => {
                    parsedResponse.push(`[${monster.name}](${monster.url})`);
                });
            }

            const searchURL = `\n\n[🔍 Pesquisa completa](${encodeURI(`https://www.divine-pride.net/database/search?q=${searchedWord}`)})`;
            parsedResponse.push(searchURL);

            logger.debug('Monster search parsed successfully', { 
                searchedWord, 
                resultsCount: parsedResponse.length - 2 
            });

            resolve(parsedResponse);
        } catch (error) {
            logger.error('Error parsing monster search response', { 
                searchedWord, 
                error: error.message 
            });
            reject(new ValidationError('Erro ao processar resposta', 'Erro ao processar os resultados da busca.'));
        }
    });
}

/**
 * Parses search results for maps
 * @param {string} searchedWord - The search term
 * @param {Array} response - Array of parsed HTML fragments
 * @returns {Promise<Array>} Formatted results array
 */
function parseMapSearchBodyResponse(searchedWord, response) {
    return new Promise((resolve, reject) => {
        if (!searchedWord) {
            return reject(new ValidationError('Termo de busca não fornecido', 'Termo de busca é obrigatório.'));
        }

        if (!response || !Array.isArray(response)) {
            return reject(new ValidationError('Resposta inválida', 'Não foram encontrados resultados!'));
        }

        if (response.length === 0) {
            return reject(new ValidationError('Nenhum resultado', 'Não foram encontrados resultados!'));
        }

        try {
            const parsedResponse = [searchedWord];
            const cleanedResponse = response.slice(1);
            const tempMaps = {}; // Store maps by ID to filter duplicates

            for (let i = 0; i < cleanedResponse.length; i++) {
                const body = cleanedResponse[i];
                if (!body || typeof body !== 'string') continue;

                try {
                    // First, ensure this is actually a map (not an item or monster)
                    // Check if the body contains a link to /database/map/
                    if (!body.includes('/database/map/') && !body.includes('map/')) {
                        continue; // Skip this entry, it's not a map
                    }
                    
                    // Also skip if it contains item or monster links
                    if (body.includes('/database/item/') || body.includes('/database/monster/')) {
                        continue;
                    }
                    
                    let nameMatch = body.match(/alt="([^"]+)"/);
                    let idMatch = body.match(/\/database\/map\/([a-zA-Z0-9_]+)/);
                    
                    if (!nameMatch) {
                        nameMatch = body.match(/title="([^"]+)"/);
                    }
                    
                    if (!nameMatch) {
                        // Try to extract from link text
                        nameMatch = body.match(/>([^<]+)<\/a>/);
                    }
                    
                    if (!idMatch) {
                        idMatch = body.match(/map[\/=]([a-zA-Z0-9_]+)/);
                    }

                    if (nameMatch && idMatch) {
                        let mapName = nameMatch[1]
                            .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(parseInt(code, 10)))
                            .replace(/&quot;/g, '"')
                            .replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/(\^[0-9|a-z]{6,7})/gi, '') // Remove color codes
                            .trim();
                        
                        // Skip if name is empty or invalid
                        if (!mapName || mapName.length === 0) {
                            continue;
                        }
                        
                        // Skip Korean characters (Hangul unicode range: \uAC00-\uD7AF)
                        if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(mapName)) {
                            logger.debug('Skipping Korean map name', { mapName });
                            continue;
                        }
                        
                        // Skip names with encoding issues (common patterns)
                        if (/[\u0000-\u001F\uFFFD]/.test(mapName) || // Control chars or replacement char
                            mapName.includes('�') || // Replacement character
                            mapName.includes('&#x') || // Unprocessed HTML entities
                            /[^\x00-\x7F\u00A0-\u024F\u0400-\u04FF\u2000-\u206F\u3000-\u303F\uFF00-\uFFEF]/.test(mapName)) {
                            logger.debug('Skipping map with encoding issues', { mapName });
                            continue;
                        }
                        
                        // Skip placeholder names
                        if (mapName.toLowerCase().includes('[ph]') ||
                            mapName.toLowerCase().includes('placeholder') ||
                            mapName.toLowerCase().includes('unknown') ||
                            mapName === 'N/A' ||
                            mapName === '?') {
                            continue;
                        }

                        const mapId = idMatch[1];
                        const mapURL = `https://www.divine-pride.net/database/map/${mapId}`;
                        
                        // Check if name is descriptive (different from ID)
                        const isDescriptive = mapName.toLowerCase() !== mapId.toLowerCase();

                        // Store map, prioritizing descriptive names
                        if (!tempMaps[mapId] || (isDescriptive && !tempMaps[mapId].isDescriptive)) {
                            tempMaps[mapId] = {
                                name: mapName,
                                id: mapId,
                                url: mapURL,
                                isDescriptive: isDescriptive
                            };
                        }
                    } else {
                        logger.debug('Could not extract map data from HTML fragment', {
                            index: i,
                            hasNameMatch: !!nameMatch,
                            hasIdMatch: !!idMatch,
                            bodyPreview: body.substring(0, 200)
                        });
                    }
                } catch (parseError) {
                    logger.warn('Error parsing individual map', { 
                        index: i, 
                        error: parseError.message 
                    });
                }
            }
            
            // Convert to array and format
            let mapsFound = 0;
            for (const mapId in tempMaps) {
                const map = tempMaps[mapId];
                parsedResponse.push(`**${map.name}**\n[${map.id}](${map.url})`);
                mapsFound++;
            }
            
            logger.debug('Parsed maps from response', {
                searchedWord,
                totalFragments: cleanedResponse.length,
                mapsFound: mapsFound
            });

            const searchURL = `\n\n[🔍 Pesquisa completa](${encodeURI(`https://www.divine-pride.net/database/search?q=${searchedWord}`)})`;
            parsedResponse.push(searchURL);

            if (parsedResponse.length <= 2 || mapsFound === 0) {
                logger.warn('No maps found in parsed response', {
                    searchedWord,
                    parsedResponseLength: parsedResponse.length,
                    mapsFound: mapsFound
                });
                return reject(new ValidationError('Nenhum resultado', 'Não foram encontrados resultados!'));
            }

            logger.debug('Map search parsed successfully', { 
                searchedWord, 
                resultsCount: parsedResponse.length - 2 
            });

            resolve(parsedResponse);
        } catch (error) {
            logger.error('Error parsing map search response', { 
                searchedWord, 
                error: error.message 
            });
            reject(new ValidationError('Erro ao processar resposta', 'Erro ao processar os resultados da busca.'));
        }
    });
}

/**
 * Parses monster data from API response
 * @param {Object} response - API response object
 * @param {string} monsterId - Monster ID for URL generation
 * @param {string} language - Language code for translations (default: 'pt-br')
 * @returns {Promise<string>} Formatted monster information
 */
function parseMonsterResponse(response, monsterId, language = 'pt-br') {
    return new Promise((resolve, reject) => {
        if (!response) {
            return reject(new ValidationError('Resposta vazia', 'Monstro não encontrado.'));
        }

        if (!monsterId) {
            return reject(new ValidationError('ID do monstro não fornecido', 'ID do monstro é obrigatório.'));
        }

        try {
            // Get translations for the specified language
            const t = i18n.getLanguage(language);
            // Log raw response for debugging
            logger.debug('Raw monster response', { 
                monsterId, 
                responseKeys: Object.keys(response || {}),
                hasName: !!response.name,
                hasStats: !!response.stats
            });

            // Remove illegal "^000000" color codes from strings
            const cleanString = (str) => {
                if (typeof str !== 'string') return str;
                return str.replace(/(\^[0-9|a-z]{6,7})/gi, '');
            };

            // Extract name
            const name = cleanString(response.name || 'Nome não disponível');

            if (!name || name === 'Nome não disponível') {
                logger.warn('Monster name not found', { 
                    monsterId, 
                    responseKeys: Object.keys(response),
                    responseSample: JSON.stringify(response).substring(0, 500)
                });
                return reject(new ValidationError('Monstro inválido', 'Monstro não encontrado ou inválido.'));
            }

            // Extract stats from stats object
            const stats = response.stats || {};
            
            // Helper to format values
            const formatValue = (value) => {
                if (value === null || value === undefined) return 'N/A';
                if (typeof value === 'number') return value.toString();
                if (typeof value === 'string' && value.trim() === '') return 'N/A';
                return value;
            };

            // Extract stats - using the correct API structure
            const level = formatValue(stats.level);
            const hp = formatValue(stats.health);
            
            // Attack can be an object with minimum and maximum
            let atk = 'N/A';
            if (stats.attack) {
                if (typeof stats.attack === 'object' && stats.attack.minimum !== undefined && stats.attack.maximum !== undefined) {
                    atk = `${stats.attack.minimum}-${stats.attack.maximum}`;
                } else {
                    atk = formatValue(stats.attack);
                }
            }
            
            const def = formatValue(stats.defense);
            const mdef = formatValue(stats.magicDefense);
            const baseExp = formatValue(stats.baseExperience);
            const jobExp = formatValue(stats.jobExperience);
            
            // Get translated race
            let race = 'N/A';
            if (stats.race !== undefined && stats.race !== null) {
                race = t.races[stats.race] || `${t.monster.race} ${stats.race}`;
            }

            // Get translated element and weakness
            let element = 'N/A';
            let weakElement = 'N/A';
            
            if (stats.element !== undefined && stats.element !== null) {
                // Map of which element causes most damage to each element
                const weaknessMap = {
                    0: t.elements[0], // Neutro recebe mais dano de todos
                    1: t.elements[4], // Água recebe mais dano de Vento
                    2: t.elements[3], // Terra recebe mais dano de Fogo
                    3: t.elements[1], // Fogo recebe mais dano de Água
                    4: t.elements[2], // Vento recebe mais dano de Terra
                    5: t.elements[6], // Veneno recebe mais dano de Sagrado
                    6: t.elements[7], // Sagrado recebe mais dano de Sombrio
                    7: t.elements[6], // Sombrio recebe mais dano de Sagrado
                    8: t.elements[6], // Fantasma recebe mais dano de Sagrado
                    9: t.elements[6]  // Morto-Vivo recebe mais dano de Sagrado
                };
                
                // If it's a simple value (0-12), use the name
                if (t.elements[stats.element]) {
                    element = t.elements[stats.element];
                    weakElement = weaknessMap[stats.element] || 'N/A';
                } else {
                    // For complex bitmasks, try to extract primary element
                    const baseElement = stats.element % 20;
                    if (t.elements[baseElement]) {
                        element = t.elements[baseElement];
                        weakElement = weaknessMap[baseElement] || 'N/A';
                    } else {
                        element = `${t.monster.element} ${stats.element}`;
                    }
                }
            }

            // Get translated size
            let size = 'N/A';
            if (stats.scale !== undefined && stats.scale !== null) {
                size = t.sizes[stats.scale] || `${t.monster.size} ${stats.scale}`;
            }
            
            // Extract additional info
            const drops = response.drops || [];
            const spawn = response.spawn || [];
            const skills = response.skill || [];
            const isMvp = stats.mvp === 1;

            const url = `https://www.divine-pride.net/database/monster/${monsterId}`;
            const monsterImage = `https://static.divine-pride.net/images/mobs/png/${monsterId}.png`;

            let info = `\n# [**${name}**](${url})`;
            if (isMvp) {
                info += ` 👑 **${t.monster.mvp}**`;
            }
            info += `\n`;
            
            info += `\n${t.monster.stats}\n`;
            info += `• ${t.monster.level}: ${level}\n`;
            info += `• ${t.monster.hp}: ${hp}\n`;
            info += `• ${t.monster.atk}: ${atk}\n`;
            info += `• ${t.monster.def}: ${def}\n`;
            info += `• ${t.monster.mdef}: ${mdef}\n`;
            
            info += `\n${t.monster.info}\n`;
            info += `• ${t.monster.race}: ${race}\n`;
            info += `• ${t.monster.element}: ${element}\n`;
            if (weakElement !== 'N/A') {
                info += `• ${t.monster.weakness}: ${weakElement}\n`;
            }
            info += `• ${t.monster.size}: ${size}\n`;
            
            if (baseExp !== 'N/A' || jobExp !== 'N/A') {
                info += `\n${t.monster.experience}\n`;
                if (baseExp !== 'N/A') info += `• ${t.monster.baseExp}: ${baseExp}\n`;
                if (jobExp !== 'N/A') info += `• ${t.monster.jobExp}: ${jobExp}\n`;
            }

            // Add spawn locations if available
            if (spawn.length > 0) {
                info += `\n\n${t.monster.appearsIn} ${spawn.length} ${t.monster.maps}\n`;
                const spawnList = spawn.slice(0, 5).map(s => {
                    return `• [${s.mapname}](https://www.divine-pride.net/database/map/${s.mapname}) (${s.amount} ${t.monster.monsters})`;
                }).join('\n');
                info += spawnList;
                if (spawn.length > 5) {
                    info += `\n• ${t.monster.andMore} ${spawn.length - 5} ${t.monster.maps.replace(':**', '')}`;
                }
            }

            logger.debug('Monster parsed successfully', { monsterId, name, level, hp });
            
            resolve(info);
        } catch (error) {
            logger.error('Error parsing monster response', { 
                monsterId, 
                error: error.message,
                stack: error.stack,
                responseSample: JSON.stringify(response).substring(0, 500)
            });
            reject(new ValidationError('Erro ao processar resposta', 'Erro ao processar informações do monstro.'));
        }
    });
}

/**
 * Parses map data from API response
 * @param {Object} response - API response object
 * @param {string} mapId - Map ID for URL generation
 * @param {string} language - Language code for translations (default: 'pt-br')
 * @returns {Promise<string>} Formatted map information
 */
function parseMapResponse(response, mapId, language = 'pt-br') {
    return new Promise((resolve, reject) => {
        if (!response) {
            return reject(new ValidationError('Resposta vazia', 'Mapa não encontrado.'));
        }

        if (!mapId) {
            return reject(new ValidationError('ID do mapa não fornecido', 'ID do mapa é obrigatório.'));
        }

        try {
            // Get translations for the specified language
            const t = i18n.getLanguage(language);
            // Log raw response for debugging
            logger.debug('Raw map response', { 
                mapId, 
                responseKeys: Object.keys(response || {}),
                hasName: !!response.name,
                hasMapname: !!response.mapname
            });

            // Remove illegal "^000000" color codes from strings
            const cleanString = (str) => {
                if (typeof str !== 'string') return str;
                return str.replace(/(\^[0-9|a-z]{6,7})/gi, '');
            };

            // Extract map name - API uses 'name' field
            const name = cleanString(response.name || response.mapname || 'Nome não disponível');
            
            if (!name || name === 'Nome não disponível') {
                logger.warn('Map name not found', { 
                    mapId, 
                    responseKeys: Object.keys(response),
                    responseSample: JSON.stringify(response).substring(0, 500)
                });
                return reject(new ValidationError('Mapa inválido', 'Mapa não encontrado ou inválido.'));
            }

            const mapname = response.mapname || mapId;
            const music = cleanString(response.mp3 || response.music || 'N/A');
            
            // Extract monsters from spawn array
            const spawn = response.spawn || [];
            const monsters = [];
            const monsterCounts = {};
            
            spawn.forEach(spawnEntry => {
                if (spawnEntry.id) {
                    const monsterId = spawnEntry.id;
                    if (!monsterCounts[monsterId]) {
                        monsterCounts[monsterId] = {
                            id: monsterId,
                            name: spawnEntry.name || `Monstro ID ${monsterId}`,
                            count: 0
                        };
                        monsters.push(monsterCounts[monsterId]);
                    }
                    monsterCounts[monsterId].count += (spawnEntry.amount || 1);
                }
            });

            // Extract NPCs
            const npcs = response.npcs || [];

            const url = `https://www.divine-pride.net/database/map/${mapname}`;

            let info = `\n**${name}**\n`;
            info += `\n${t.map.info}\n`;
            info += `• ${t.map.mapname}: ${mapname}\n`;
            if (music !== 'N/A' && music) {
                info += `• ${t.map.music}: ${music.replace(/\\/g, '/')}\n`;
            }

            if (monsters && monsters.length > 0) {
                info += `\n${t.map.monsters} (${monsters.length} ${t.map.types}):**\n`;
                const monsterList = monsters.slice(0, 10).map(m => {
                    const monsterName = cleanString(m.name);
                    const monsterId = m.id || '';
                    const count = m.count > 1 ? ` (${m.count})` : '';
                    if (monsterId) {
                        return `• [${monsterName}${count}](https://www.divine-pride.net/database/monster/${monsterId})`;
                    }
                    return `• ${monsterName}${count}`;
                }).join('\n');
                info += monsterList;
                if (monsters.length > 10) {
                    info += `\n• ${t.map.andMore} ${monsters.length - 10} ${t.map.monsterType}`;
                }
            }

            if (npcs && npcs.length > 0) {
                info += `\n\n${t.map.npcs} (${npcs.length}):**\n`;
                const npcList = npcs.slice(0, 10).map(npc => {
                    const npcName = cleanString(npc.name || `NPC ID ${npc.id || 'N/A'}`);
                    return `• ${npcName}`;
                }).join('\n');
                info += npcList;
                if (npcs.length > 10) {
                    info += `\n• ${t.map.andMore} ${npcs.length - 10} NPCs`;
                }
            }

            info += `\n\n🔗 ${url}`;

            logger.debug('Map parsed successfully', { mapId, name, monstersCount: monsters.length, npcsCount: npcs.length });
            
            resolve(info);
        } catch (error) {
            logger.error('Error parsing map response', { 
                mapId, 
                error: error.message,
                stack: error.stack,
                responseSample: JSON.stringify(response).substring(0, 500)
            });
            reject(new ValidationError('Erro ao processar resposta', 'Erro ao processar informações do mapa.'));
        }
    });
}

module.exports = {
    parseHTMLByRegex,
    parseWikiResponse,
    parseDatabaseResponse,
    parseDatabaseBodyResponse,
    parseMonsterSearchBodyResponse,
    parseMapSearchBodyResponse,
    parseMonsterResponse,
    parseMapResponse
};
