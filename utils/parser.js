/**
 * Parser utilities
 * Handles parsing of API responses and HTML content
 */

const logger = require('./logger');
const { ValidationError } = require('./errors');

/**
 * Parses HTML content using regex to extract item information
 * @param {string} html - HTML content to parse
 * @returns {Array<string>|null} Parsed HTML fragments or null if no matches
 */
function parseHTMLByRegex(html) {
    if (!html || typeof html !== 'string') {
        logger.warn('Invalid HTML input for parsing');
        return null;
    }

    try {
        // Try multiple regex patterns to find item rows
        // Pattern 1: Original pattern
    let regexp = /<td>[\n\r]\s*<img(<a href)*((.|[\n\r])*?(<\/td>))/g;
    let parsedHTML = html.match(regexp);
        
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
        
        if (!parsedHTML || parsedHTML.length === 0) {
            logger.debug('No matches found with any regex pattern', {
                htmlLength: html.length,
                htmlPreview: html.substring(0, 1000)
            });
            return null;
        }

        // Split by <td> and filter empty items
        const result = parsedHTML.toString().split('<td>').filter(item => item.trim().length > 0);
        
        logger.debug('HTML parsed successfully', {
            matchesFound: parsedHTML.length,
            resultLength: result.length
        });
        
        return result;
    } catch (error) {
        logger.error('Error parsing HTML by regex', { error: error.message });
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
 * @returns {Promise<string>} Formatted item information
 */
function parseDatabaseResponse(response, itemId) {
    return new Promise((resolve, reject) => {
        if (!response) {
            return reject(new ValidationError('Resposta vazia', 'Item não encontrado.'));
        }

        if (!itemId) {
            return reject(new ValidationError('ID do item não fornecido', 'ID do item é obrigatório.'));
        }

        try {
            // Remove illegal "^000000" color codes and format to JSON
            let formattedResponse = JSON.stringify(response);
            formattedResponse = JSON.parse(formattedResponse.replace(/(\^[0-9|a-z]{6,7})/gi, ''));

            if (!formattedResponse.name) {
                return reject(new ValidationError('Item inválido', 'Item não encontrado ou inválido.'));
            }

            const name = formattedResponse.name || 'Nome não disponível';
            const description = formattedResponse.description || 'Descrição não disponível';
            const url = `https://www.divine-pride.net/database/item/${itemId}`;

            logger.debug('Item parsed successfully', { itemId, name });
            
            resolve(`\nNome: ${name}\nDescrição: ${description}\n${url}`);
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
 * Parses monster data from API response
 * @param {Object} response - API response object
 * @param {string} monsterId - Monster ID for URL generation
 * @returns {Promise<string>} Formatted monster information
 */
function parseMonsterResponse(response, monsterId) {
    return new Promise((resolve, reject) => {
        if (!response) {
            return reject(new ValidationError('Resposta vazia', 'Monstro não encontrado.'));
        }

        if (!monsterId) {
            return reject(new ValidationError('ID do monstro não fornecido', 'ID do monstro é obrigatório.'));
        }

        try {
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
            
            // Extract race, element, scale - convert numbers to Portuguese names
            const raceMap = {
                0: 'Amorfo', 1: 'Morto-Vivo', 2: 'Bruto', 3: 'Planta', 4: 'Inseto',
                5: 'Peixe', 6: 'Demônio', 7: 'Humanoide', 8: 'Anjo', 9: 'Dragão'
            };
            
            // Element is a bitmask, but we'll show the number for now
            // Common elements: 0=Neutral, 1=Water, 2=Earth, 3=Fire, 4=Wind, 5=Poison, 6=Holy, 7=Dark, 8=Ghost, 9=Undead
            const elementMap = {
                0: 'Neutro', 1: 'Água', 2: 'Terra', 3: 'Fogo', 4: 'Vento',
                5: 'Veneno', 6: 'Sagrado', 7: 'Sombrio', 8: 'Fantasma', 9: 'Morto-Vivo'
            };
            
            const sizeMap = {
                0: 'Pequeno', 1: 'Médio', 2: 'Grande'
            };

            let race = 'N/A';
            if (stats.race !== undefined && stats.race !== null) {
                race = raceMap[stats.race] || `Raça ${stats.race}`;
            }

            let element = 'N/A';
            let weakElement = 'N/A';
            
            if (stats.element !== undefined && stats.element !== null) {
                // Element encoding in RO can be complex (bitmask)
                // Try to decode common values first
                const elementNames = {
                    0: 'Neutro', 1: 'Água', 2: 'Terra', 3: 'Fogo', 4: 'Vento',
                    5: 'Veneno', 6: 'Sagrado', 7: 'Sombrio', 8: 'Fantasma', 9: 'Morto-Vivo',
                    10: 'Arma', 11: 'Dotado', 12: 'Aleatório'
                };
                
                // Map of which element causes most damage to each element
                const weaknessMap = {
                    0: 'Todos', // Neutro recebe mais dano de todos
                    1: 'Vento', // Água recebe mais dano de Vento
                    2: 'Fogo', // Terra recebe mais dano de Fogo
                    3: 'Água', // Fogo recebe mais dano de Água
                    4: 'Terra', // Vento recebe mais dano de Terra
                    5: 'Sagrado', // Veneno recebe mais dano de Sagrado
                    6: 'Sombrio', // Sagrado recebe mais dano de Sombrio
                    7: 'Sagrado', // Sombrio recebe mais dano de Sagrado
                    8: 'Sagrado', // Fantasma recebe mais dano de Sagrado
                    9: 'Sagrado' // Morto-Vivo recebe mais dano de Sagrado
                };
                
                // If it's a simple value (0-12), use the name
                if (elementNames[stats.element]) {
                    element = elementNames[stats.element];
                    weakElement = weaknessMap[stats.element] || 'N/A';
                } else {
                    // For complex bitmasks, try to extract primary element
                    // Common pattern: element % 20 gives base element in some cases
                    const baseElement = stats.element % 20;
                    if (elementNames[baseElement]) {
                        element = elementNames[baseElement];
                        weakElement = weaknessMap[baseElement] || 'N/A';
                    } else {
                        element = `Elemento ${stats.element}`;
                    }
                }
            }

            let size = 'N/A';
            if (stats.scale !== undefined && stats.scale !== null) {
                size = sizeMap[stats.scale] || `Tamanho ${stats.scale}`;
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
                info += ` 👑 **MVP**`;
            }
            info += `\n`;
            
            info += `\n📊 **Estatísticas:**\n`;
            info += `• Nível: ${level}\n`;
            info += `• HP: ${hp}\n`;
            info += `• ATK: ${atk}\n`;
            info += `• DEF: ${def}\n`;
            info += `• MDEF: ${mdef}\n`;
            
            info += `\n🎯 **Informações:**\n`;
            info += `• Raça: ${race}\n`;
            info += `• Elemento: ${element}\n`;
            if (weakElement !== 'N/A') {
                info += `• Fraqueza: ${weakElement}\n`;
            }
            info += `• Tamanho: ${size}\n`;
            
            if (baseExp !== 'N/A' || jobExp !== 'N/A') {
                info += `\n💰 **Experiência:**\n`;
                if (baseExp !== 'N/A') info += `• Base EXP: ${baseExp}\n`;
                if (jobExp !== 'N/A') info += `• Job EXP: ${jobExp}\n`;
            }

            // Add spawn locations if available
            if (spawn.length > 0) {
                info += `\n\n🗺️ **Aparece em ${spawn.length} mapa(s):**\n`;
                const spawnList = spawn.slice(0, 5).map(s => {
                    return `• [${s.mapname}](https://www.divine-pride.net/database/map/${s.mapname}) (${s.amount} monstros)`;
                }).join('\n');
                info += spawnList;
                if (spawn.length > 5) {
                    info += `\n• ... e mais ${spawn.length - 5} mapa(s)`;
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
 * @returns {Promise<string>} Formatted map information
 */
function parseMapResponse(response, mapId) {
    return new Promise((resolve, reject) => {
        if (!response) {
            return reject(new ValidationError('Resposta vazia', 'Mapa não encontrado.'));
        }

        if (!mapId) {
            return reject(new ValidationError('ID do mapa não fornecido', 'ID do mapa é obrigatório.'));
        }

        try {
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
            info += `\n🗺️ **Informações do Mapa:**\n`;
            info += `• Mapname: ${mapname}\n`;
            if (music !== 'N/A' && music) {
                info += `• Música: ${music.replace(/\\/g, '/')}\n`;
            }

            if (monsters && monsters.length > 0) {
                info += `\n👹 **Monstros (${monsters.length} tipos):**\n`;
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
                    info += `\n• ... e mais ${monsters.length - 10} tipo(s) de monstro`;
                }
            }

            if (npcs && npcs.length > 0) {
                info += `\n\n👤 **NPCs (${npcs.length}):**\n`;
                const npcList = npcs.slice(0, 10).map(npc => {
                    const npcName = cleanString(npc.name || `NPC ID ${npc.id || 'N/A'}`);
                    return `• ${npcName}`;
                }).join('\n');
                info += npcList;
                if (npcs.length > 10) {
                    info += `\n• ... e mais ${npcs.length - 10} NPC(s)`;
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
    parseMonsterResponse,
    parseMapResponse
};
