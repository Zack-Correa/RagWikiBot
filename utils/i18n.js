/**
 * Internationalization (i18n) module
 * Contains all text labels in multiple languages
 */

const translations = {
    'pt': {
        // Common
        language: 'Português',
        loading: 'Carregando...',
        error: 'Erro',
        notFound: 'Não encontrado',
        
        // Commands descriptions
        commands: {
            item: {
                name: 'buscar-item',
                description: 'Busca itens por nome ou ID no banco de dados Divine Pride (servidor LATAM)',
                options: {
                    search: {
                        name: 'busca',
                        description: 'Nome ou ID do item'
                    },
                    language: {
                        name: 'idioma',
                        description: 'Idioma da busca (padrão: Português)'
                    }
                }
            },
            monster: {
                name: 'buscar-monstro',
                description: 'Busca monstros por nome ou ID no banco de dados Divine Pride (servidor LATAM)',
                options: {
                    search: {
                        name: 'busca',
                        description: 'Nome ou ID do monstro'
                    },
                    language: {
                        name: 'idioma',
                        description: 'Idioma da busca (padrão: Português)'
                    }
                }
            },
            map: {
                name: 'buscar-mapa',
                description: 'Busca mapas por nome ou ID no banco de dados Divine Pride (servidor LATAM)',
                options: {
                    search: {
                        name: 'busca',
                        description: 'Nome ou ID do mapa'
                    },
                    language: {
                        name: 'idioma',
                        description: 'Idioma da busca (padrão: Português)'
                    }
                }
            }
        },
        
        // Search results
        search: {
            title: 'Resultado da pesquisa',
            titleItems: 'Resultado da pesquisa',
            titleMonsters: 'Resultado da pesquisa de monstros',
            titleMaps: 'Resultado da pesquisa de mapas',
            resultsFor: 'Resultados para',
            found: 'encontrados',
            noResults: 'Nenhum resultado encontrado',
            fullSearch: '🔍 Pesquisa completa',
            selectPlaceholder: 'Selecione um item para ver detalhes',
            selectPlaceholderMonster: '👑 Selecione um monstro para ver detalhes',
            selectPlaceholderMap: 'Ver detalhes de um mapa',
            page: 'Página'
        },
        
        // Item details
        item: {
            title: 'Informações do Item',
            description: '📝 **Descrição:**',
            properties: '🏷️ **Propriedades:**',
            type: 'Tipo',
            attack: 'Ataque',
            defense: 'Defesa',
            weight: 'Peso',
            level: 'Nível',
            equip: 'Equip',
            slots: 'Slots',
            classes: 'Classes',
            viewMore: 'Ver mais detalhes'
        },
        
        // Monster details
        monster: {
            title: 'Informações do Monstro',
            mvp: 'MVP',
            stats: '📊 **Estatísticas:**',
            info: '🎯 **Informações:**',
            experience: '💰 **Experiência:**',
            appearsIn: '🗺️ **Aparece em',
            maps: 'mapa(s):**',
            andMore: '... e mais',
            level: 'Nível',
            hp: 'HP',
            atk: 'ATK',
            def: 'DEF',
            mdef: 'MDEF',
            race: 'Raça',
            element: 'Elemento',
            weakness: 'Fraqueza',
            size: 'Tamanho',
            baseExp: 'Base EXP',
            jobExp: 'Job EXP',
            monsters: 'monstros'
        },
        
        // Map details
        map: {
            title: 'Informações do Mapa',
            info: '🗺️ **Informações do Mapa:**',
            mapname: 'Mapname',
            music: 'Música',
            monsters: '👹 **Monstros',
            types: 'tipos',
            npcs: '👤 **NPCs',
            andMore: '... e mais',
            monsterType: 'tipo(s) de monstro'
        },
        
        // Errors
        errors: {
            generic: '❌ Não foi possível completar a operação.',
            itemNotFound: '❌ Não foi possível buscar o item solicitado.',
            monsterNotFound: '❌ Não foi possível buscar o monstro solicitado.',
            mapNotFound: '❌ Não foi possível buscar o mapa solicitado.',
            itemDetails: '❌ Erro ao buscar detalhes do item.',
            monsterDetails: '❌ Erro ao buscar detalhes do monstro.',
            mapDetails: '❌ Erro ao buscar detalhes do mapa.',
            invalidId: '❌ O ID do item deve ser um número.'
        },
        
        // Credits
        credits: {
            divinePride: '*Conteúdo fornecido por [Divine Pride](https://www.divine-pride.net)*',
            browiki: '*Conteúdo fornecido pela [bROWiki](https://browiki.org)*',
            gnjoy: '*Dados do mercado oficial Ragnarok Online LATAM*'
        },
        
        // Market
        market: {
            title: 'Mercado - Ragnarok Online',
            searchInfo: 'Informações da Busca',
            results: 'Resultados',
            listings: 'anúncios',
            selectPlaceholder: 'Selecione um item para ver detalhes',
            credits: '*Dados do mercado oficial Ragnarok Online LATAM*',
            error: '❌ Não foi possível buscar no mercado. Tente novamente mais tarde.',
            storeTypes: {
                buy: 'Comprando',
                sell: 'Vendendo'
            },
            fields: {
                price: 'Preço',
                quantity: 'Quantidade',
                type: 'Tipo',
                store: 'Loja',
                seller: 'Vendedor',
                slots: 'Slots',
                category: 'Categoria',
                itemId: 'Item ID',
                links: 'Links'
            }
        },
        
        // Monster races
        races: {
            0: 'Amorfo',
            1: 'Morto-Vivo',
            2: 'Bruto',
            3: 'Planta',
            4: 'Inseto',
            5: 'Peixe',
            6: 'Demônio',
            7: 'Humanoide',
            8: 'Anjo',
            9: 'Dragão'
        },
        
        // Elements
        elements: {
            0: 'Neutro',
            1: 'Água',
            2: 'Terra',
            3: 'Fogo',
            4: 'Vento',
            5: 'Veneno',
            6: 'Sagrado',
            7: 'Sombrio',
            8: 'Fantasma',
            9: 'Morto-Vivo',
            10: 'Arma',
            11: 'Dotado',
            12: 'Aleatório'
        },
        
        // Sizes
        sizes: {
            0: 'Pequeno',
            1: 'Médio',
            2: 'Grande'
        }
    },
    
    'en': {
        // Common
        language: 'English',
        loading: 'Loading...',
        error: 'Error',
        notFound: 'Not found',
        
        // Commands descriptions
        commands: {
            item: {
                name: 'search-item',
                description: 'Search for items by name or ID in Divine Pride database (LATAM server)',
                options: {
                    search: {
                        name: 'search',
                        description: 'Item name or ID'
                    },
                    language: {
                        name: 'language',
                        description: 'Search language (default: Portuguese)'
                    }
                }
            },
            monster: {
                name: 'search-monster',
                description: 'Search for monsters by name or ID in Divine Pride database (LATAM server)',
                options: {
                    search: {
                        name: 'search',
                        description: 'Monster name or ID'
                    },
                    language: {
                        name: 'language',
                        description: 'Search language (default: Portuguese)'
                    }
                }
            },
            map: {
                name: 'search-map',
                description: 'Search for maps by name or ID in Divine Pride database (LATAM server)',
                options: {
                    search: {
                        name: 'search',
                        description: 'Map name or ID'
                    },
                    language: {
                        name: 'language',
                        description: 'Search language (default: Portuguese)'
                    }
                }
            }
        },
        
        // Search results
        search: {
            title: 'Search Results',
            titleItems: 'Search Results',
            titleMonsters: 'Monster Search Results',
            titleMaps: 'Map Search Results',
            resultsFor: 'Results for',
            found: 'found',
            noResults: 'No results found',
            fullSearch: '🔍 Full search',
            selectPlaceholder: 'Select an item to view details',
            selectPlaceholderMonster: '👑 Select a monster to view details',
            selectPlaceholderMap: 'View map details',
            page: 'Page'
        },
        
        // Item details
        item: {
            title: 'Item Information',
            description: '📝 **Description:**',
            properties: '🏷️ **Properties:**',
            type: 'Type',
            attack: 'Attack',
            defense: 'Defense',
            weight: 'Weight',
            level: 'Level',
            equip: 'Equip',
            slots: 'Slots',
            classes: 'Classes',
            viewMore: 'View more details'
        },
        
        // Monster details
        monster: {
            title: 'Monster Information',
            mvp: 'MVP',
            stats: '📊 **Statistics:**',
            info: '🎯 **Information:**',
            experience: '💰 **Experience:**',
            appearsIn: '🗺️ **Appears in',
            maps: 'map(s):**',
            andMore: '... and more',
            level: 'Level',
            hp: 'HP',
            atk: 'ATK',
            def: 'DEF',
            mdef: 'MDEF',
            race: 'Race',
            element: 'Element',
            weakness: 'Weakness',
            size: 'Size',
            baseExp: 'Base EXP',
            jobExp: 'Job EXP',
            monsters: 'monsters'
        },
        
        // Map details
        map: {
            title: 'Map Information',
            info: '🗺️ **Map Information:**',
            mapname: 'Mapname',
            music: 'Music',
            monsters: '👹 **Monsters',
            types: 'types',
            npcs: '👤 **NPCs',
            andMore: '... and more',
            monsterType: 'monster type(s)'
        },
        
        // Errors
        errors: {
            generic: '❌ Could not complete the operation.',
            itemNotFound: '❌ Could not fetch the requested item.',
            monsterNotFound: '❌ Could not fetch the requested monster.',
            mapNotFound: '❌ Could not fetch the requested map.',
            itemDetails: '❌ Error fetching item details.',
            monsterDetails: '❌ Error fetching monster details.',
            mapDetails: '❌ Error fetching map details.',
            invalidId: '❌ Item ID must be a number.'
        },
        
        // Credits
        credits: {
            divinePride: '*Content provided by [Divine Pride](https://www.divine-pride.net)*',
            browiki: '*Content provided by [bROWiki](https://browiki.org)*',
            gnjoy: '*Data from official Ragnarok Online LATAM market*'
        },
        
        // Market
        market: {
            title: 'Market - Ragnarok Online',
            searchInfo: 'Search Information',
            results: 'Results',
            listings: 'listings',
            selectPlaceholder: 'Select an item to view details',
            credits: '*Data from official Ragnarok Online LATAM market*',
            error: '❌ Could not search the market. Please try again later.',
            storeTypes: {
                buy: 'Buying',
                sell: 'Selling'
            },
            fields: {
                price: 'Price',
                quantity: 'Quantity',
                type: 'Type',
                store: 'Store',
                seller: 'Seller',
                slots: 'Slots',
                category: 'Category',
                itemId: 'Item ID',
                links: 'Links'
            }
        },
        
        // Monster races
        races: {
            0: 'Formless',
            1: 'Undead',
            2: 'Brute',
            3: 'Plant',
            4: 'Insect',
            5: 'Fish',
            6: 'Demon',
            7: 'Demi-Human',
            8: 'Angel',
            9: 'Dragon'
        },
        
        // Elements
        elements: {
            0: 'Neutral',
            1: 'Water',
            2: 'Earth',
            3: 'Fire',
            4: 'Wind',
            5: 'Poison',
            6: 'Holy',
            7: 'Shadow',
            8: 'Ghost',
            9: 'Undead',
            10: 'Weapon',
            11: 'Endowed',
            12: 'Random'
        },
        
        // Sizes
        sizes: {
            0: 'Small',
            1: 'Medium',
            2: 'Large'
        }
    },
    
    'es': {
        // Common
        language: 'Español',
        loading: 'Cargando...',
        error: 'Error',
        notFound: 'No encontrado',
        
        // Commands descriptions
        commands: {
            item: {
                name: 'buscar-item',
                description: 'Busca ítems por nombre o ID en la base de datos Divine Pride (servidor LATAM)',
                options: {
                    search: {
                        name: 'busca',
                        description: 'Nombre o ID del ítem'
                    },
                    language: {
                        name: 'idioma',
                        description: 'Idioma de búsqueda (predeterminado: Portugués)'
                    }
                }
            },
            monster: {
                name: 'buscar-monstruo',
                description: 'Busca monstruos por nombre o ID en la base de datos Divine Pride (servidor LATAM)',
                options: {
                    search: {
                        name: 'busca',
                        description: 'Nombre o ID del monstruo'
                    },
                    language: {
                        name: 'idioma',
                        description: 'Idioma de búsqueda (predeterminado: Portugués)'
                    }
                }
            },
            map: {
                name: 'buscar-mapa',
                description: 'Busca mapas por nombre o ID en la base de datos Divine Pride (servidor LATAM)',
                options: {
                    search: {
                        name: 'busca',
                        description: 'Nombre o ID del mapa'
                    },
                    language: {
                        name: 'idioma',
                        description: 'Idioma de búsqueda (predeterminado: Portugués)'
                    }
                }
            }
        },
        
        // Search results
        search: {
            title: 'Resultados de búsqueda',
            titleItems: 'Resultados de búsqueda',
            titleMonsters: 'Resultados de búsqueda de monstruos',
            titleMaps: 'Resultados de búsqueda de mapas',
            resultsFor: 'Resultados para',
            found: 'encontrados',
            noResults: 'No se encontraron resultados',
            fullSearch: '🔍 Búsqueda completa',
            selectPlaceholder: 'Seleccione un ítem para ver detalles',
            selectPlaceholderMonster: '👑 Seleccione un monstruo para ver detalles',
            selectPlaceholderMap: 'Ver detalles de un mapa',
            page: 'Página'
        },
        
        // Item details
        item: {
            title: 'Información del Ítem',
            description: '📝 **Descripción:**',
            properties: '🏷️ **Propiedades:**',
            type: 'Tipo',
            attack: 'Ataque',
            defense: 'Defensa',
            weight: 'Peso',
            level: 'Nivel',
            equip: 'Equip',
            slots: 'Ranuras',
            classes: 'Clases',
            viewMore: 'Ver más detalles'
        },
        
        // Monster details
        monster: {
            title: 'Información del Monstruo',
            mvp: 'MVP',
            stats: '📊 **Estadísticas:**',
            info: '🎯 **Información:**',
            experience: '💰 **Experiencia:**',
            appearsIn: '🗺️ **Aparece en',
            maps: 'mapa(s):**',
            andMore: '... y más',
            level: 'Nivel',
            hp: 'HP',
            atk: 'ATK',
            def: 'DEF',
            mdef: 'MDEF',
            race: 'Raza',
            element: 'Elemento',
            weakness: 'Debilidad',
            size: 'Tamaño',
            baseExp: 'EXP Base',
            jobExp: 'EXP Job',
            monsters: 'monstruos'
        },
        
        // Map details
        map: {
            title: 'Información del Mapa',
            info: '🗺️ **Información del Mapa:**',
            mapname: 'Nombre del mapa',
            music: 'Música',
            monsters: '👹 **Monstruos',
            types: 'tipos',
            npcs: '👤 **NPCs',
            andMore: '... y más',
            monsterType: 'tipo(s) de monstruo'
        },
        
        // Errors
        errors: {
            generic: '❌ No se pudo completar la operación.',
            itemNotFound: '❌ No se pudo buscar el ítem solicitado.',
            monsterNotFound: '❌ No se pudo buscar el monstruo solicitado.',
            mapNotFound: '❌ No se pudo buscar el mapa solicitado.',
            itemDetails: '❌ Error al buscar detalles del ítem.',
            monsterDetails: '❌ Error al buscar detalles del monstruo.',
            mapDetails: '❌ Error al buscar detalles del mapa.',
            invalidId: '❌ El ID del ítem debe ser un número.'
        },
        
        // Credits
        credits: {
            divinePride: '*Contenido proporcionado por [Divine Pride](https://www.divine-pride.net)*',
            browiki: '*Contenido proporcionado por [bROWiki](https://browiki.org)*',
            gnjoy: '*Datos del mercado oficial de Ragnarok Online LATAM*'
        },
        
        // Market
        market: {
            title: 'Mercado - Ragnarok Online',
            searchInfo: 'Información de Búsqueda',
            results: 'Resultados',
            listings: 'anuncios',
            selectPlaceholder: 'Seleccione un ítem para ver detalles',
            credits: '*Datos del mercado oficial de Ragnarok Online LATAM*',
            error: '❌ No se pudo buscar en el mercado. Inténtelo de nuevo más tarde.',
            storeTypes: {
                buy: 'Comprando',
                sell: 'Vendiendo'
            },
            fields: {
                price: 'Precio',
                quantity: 'Cantidad',
                type: 'Tipo',
                store: 'Tienda',
                seller: 'Vendedor',
                slots: 'Ranuras',
                category: 'Categoría',
                itemId: 'ID del Ítem',
                links: 'Enlaces'
            }
        },
        
        // Monster races
        races: {
            0: 'Amorfo',
            1: 'No-Muerto',
            2: 'Bruto',
            3: 'Planta',
            4: 'Insecto',
            5: 'Pez',
            6: 'Demonio',
            7: 'Humanoide',
            8: 'Ángel',
            9: 'Dragón'
        },
        
        // Elements
        elements: {
            0: 'Neutro',
            1: 'Agua',
            2: 'Tierra',
            3: 'Fuego',
            4: 'Viento',
            5: 'Veneno',
            6: 'Sagrado',
            7: 'Sombra',
            8: 'Fantasma',
            9: 'No-Muerto',
            10: 'Arma',
            11: 'Dotado',
            12: 'Aleatorio'
        },
        
        // Sizes
        sizes: {
            0: 'Pequeño',
            1: 'Mediano',
            2: 'Grande'
        }
    }
};

/**
 * Get translation for a specific language
 * @param {string} language - Language code (pt, en, es)
 * @param {string} key - Translation key (dot notation supported)
 * @returns {string|object} Translation or key if not found
 */
function t(language, key) {
    const lang = translations[language] || translations['pt'];
    
    // Support dot notation (e.g., 'search.title')
    const keys = key.split('.');
    let value = lang;
    
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            return key; // Return key if translation not found
        }
    }
    
    return value;
}

/**
 * Get all translations for a specific language
 * @param {string} language - Language code (pt, en, es)
 * @returns {object} All translations for the language
 */
function getLanguage(language) {
    return translations[language] || translations['pt'];
}

/**
 * Get available languages
 * @returns {array} Array of language codes
 */
function getAvailableLanguages() {
    return Object.keys(translations);
}

module.exports = {
    t,
    getLanguage,
    getAvailableLanguages,
    translations
};

