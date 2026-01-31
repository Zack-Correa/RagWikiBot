/**
 * Embed Builder
 * Builds Discord embeds from action results
 */

const { EmbedBuilder } = require('discord.js');

// Colors for different types
const COLORS = {
    item: 0x3498DB,      // Blue
    monster: 0xE74C3C,   // Red
    map: 0x2ECC71,       // Green
    market: 0xF39C12,    // Orange
    wiki: 0x9B59B6,      // Purple
    price: 0x1ABC9C,     // Teal
    history: 0xE67E22,   // Dark Orange
    server_status: 0x95A5A6, // Gray
    error: 0xE74C3C      // Red
};

/**
 * Build response embeds from action result
 * @param {string} text - Agent text response
 * @param {Object} result - Action result
 * @returns {Array<EmbedBuilder>} Array of embeds
 */
function buildResponse(text, result) {
    if (!result) return [];
    
    if (result.error) {
        return [buildErrorEmbed(result.error, result.type)];
    }
    
    switch (result.type) {
        case 'item':
            return buildItemEmbeds(result.data, result.single);
        case 'monster':
            return buildMonsterEmbeds(result.data, result.single);
        case 'map':
            return buildMapEmbeds(result.data, result.single);
        case 'market':
            return buildMarketEmbeds(result.data, result.server, result.storeType);
        case 'wiki':
            return buildWikiEmbeds(result.data);
        case 'price':
            return buildPriceEmbeds(result.data);
        case 'history':
            return buildHistoryEmbeds(result.data);
        case 'server_status':
            return buildServerStatusEmbeds(result.data);
        default:
            return [];
    }
}

/**
 * Build error embed
 */
function buildErrorEmbed(message, type) {
    return new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('Erro')
        .setDescription(message)
        .setFooter({ text: type ? `Tipo: ${type}` : 'Agentforce' });
}

/**
 * Build item embeds
 */
function buildItemEmbeds(data, single = false) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
        return [buildErrorEmbed('Nenhum item encontrado', 'item')];
    }
    
    const items = Array.isArray(data) ? data : [data];
    const embeds = [];
    
    // Limit to 3 items
    const displayItems = items.slice(0, 3);
    
    for (const item of displayItems) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.item)
            .setTitle(item.name || item.Name || 'Item')
            .setURL(item.url || `https://www.divine-pride.net/database/item/${item.id || item.Id}`)
            .setFooter({ text: `ID: ${item.id || item.Id || 'N/A'}` });
        
        if (item.description || item.Description) {
            embed.setDescription((item.description || item.Description).substring(0, 4096));
        }
        
        // Add fields based on available data
        const fields = [];
        
        if (item.type || item.Type) {
            fields.push({ name: 'Tipo', value: String(item.type || item.Type), inline: true });
        }
        if (item.weight !== undefined) {
            fields.push({ name: 'Peso', value: String(item.weight), inline: true });
        }
        if (item.price !== undefined || item.sell !== undefined) {
            fields.push({ name: 'Preço NPC', value: formatNumber(item.price || item.sell) + 'z', inline: true });
        }
        if (item.attack !== undefined) {
            fields.push({ name: 'Ataque', value: String(item.attack), inline: true });
        }
        if (item.defense !== undefined) {
            fields.push({ name: 'Defesa', value: String(item.defense), inline: true });
        }
        if (item.slots !== undefined) {
            fields.push({ name: 'Slots', value: String(item.slots), inline: true });
        }
        
        if (fields.length > 0) {
            embed.addFields(fields.slice(0, 25));
        }
        
        if (item.image || item.icon) {
            embed.setThumbnail(item.image || item.icon);
        }
        
        embeds.push(embed);
    }
    
    if (items.length > 3) {
        embeds.push(new EmbedBuilder()
            .setColor(COLORS.item)
            .setDescription(`... e mais ${items.length - 3} resultados. Seja mais específico para refinar a busca.`));
    }
    
    return embeds;
}

/**
 * Build monster embeds
 */
function buildMonsterEmbeds(data, single = false) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
        return [buildErrorEmbed('Nenhum monstro encontrado', 'monster')];
    }
    
    const monsters = Array.isArray(data) ? data : [data];
    const embeds = [];
    
    const displayMonsters = monsters.slice(0, 3);
    
    for (const monster of displayMonsters) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.monster)
            .setTitle(monster.name || monster.Name || 'Monstro')
            .setURL(`https://www.divine-pride.net/database/monster/${monster.id || monster.Id}`)
            .setFooter({ text: `ID: ${monster.id || monster.Id || 'N/A'}` });
        
        const fields = [];
        
        if (monster.level || monster.Level) {
            fields.push({ name: 'Level', value: String(monster.level || monster.Level), inline: true });
        }
        if (monster.hp || monster.HP) {
            fields.push({ name: 'HP', value: formatNumber(monster.hp || monster.HP), inline: true });
        }
        if (monster.baseExp || monster.baseExperience) {
            fields.push({ name: 'Base EXP', value: formatNumber(monster.baseExp || monster.baseExperience), inline: true });
        }
        if (monster.jobExp || monster.jobExperience) {
            fields.push({ name: 'Job EXP', value: formatNumber(monster.jobExp || monster.jobExperience), inline: true });
        }
        if (monster.attack || monster.atk1) {
            fields.push({ name: 'Ataque', value: String(monster.attack || monster.atk1), inline: true });
        }
        if (monster.defense || monster.def) {
            fields.push({ name: 'Defesa', value: String(monster.defense || monster.def), inline: true });
        }
        if (monster.race || monster.Race) {
            fields.push({ name: 'Raça', value: String(monster.race || monster.Race), inline: true });
        }
        if (monster.element || monster.Element) {
            fields.push({ name: 'Elemento', value: String(monster.element || monster.Element), inline: true });
        }
        if (monster.size || monster.Scale) {
            fields.push({ name: 'Tamanho', value: String(monster.size || monster.Scale), inline: true });
        }
        
        // MVP indicator
        if (monster.mvp || monster.isMvp || monster.MVP) {
            embed.setDescription('**MVP Boss**');
        }
        
        if (fields.length > 0) {
            embed.addFields(fields.slice(0, 25));
        }
        
        if (monster.image) {
            embed.setThumbnail(monster.image);
        }
        
        embeds.push(embed);
    }
    
    return embeds;
}

/**
 * Build map embeds
 */
function buildMapEmbeds(data, single = false) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
        return [buildErrorEmbed('Nenhum mapa encontrado', 'map')];
    }
    
    const maps = Array.isArray(data) ? data : [data];
    const embeds = [];
    
    const displayMaps = maps.slice(0, 3);
    
    for (const map of displayMaps) {
        const mapId = map.id || map.Id || map.name || map.mapname;
        const embed = new EmbedBuilder()
            .setColor(COLORS.map)
            .setTitle(map.name || map.Name || mapId || 'Mapa')
            .setURL(`https://www.divine-pride.net/database/map/${mapId}`)
            .setFooter({ text: `ID: ${mapId}` });
        
        if (map.mapname && map.mapname !== map.name) {
            embed.setDescription(`**ID do Mapa:** ${map.mapname}`);
        }
        
        if (map.image) {
            embed.setImage(map.image);
        }
        
        embeds.push(embed);
    }
    
    return embeds;
}

/**
 * Build market embeds
 */
function buildMarketEmbeds(data, server, storeType) {
    const list = data?.list || data || [];
    
    if (!list || list.length === 0) {
        return [buildErrorEmbed('Nenhum item encontrado no mercado', 'market')];
    }
    
    const embed = new EmbedBuilder()
        .setColor(COLORS.market)
        .setTitle(`Mercado - ${server || 'FREYA'}`)
        .setDescription(`**Tipo:** ${storeType === 'BUY' ? 'Comprando' : 'Vendendo'}\n**Resultados:** ${list.length} encontrados`)
        .setFooter({ text: 'Dados do GNJoy LATAM' })
        .setTimestamp();
    
    // Add top 10 listings
    const fields = [];
    const displayList = list.slice(0, 10);
    
    for (let i = 0; i < displayList.length; i++) {
        const item = displayList[i];
        fields.push({
            name: `${i + 1}. ${item.itemName || item.name || 'Item'}`,
            value: `**Preço:** ${formatNumber(item.price)}z\n**Qtd:** ${item.amount || item.quantity || 1}\n**Vendedor:** ${item.shopName || item.vendor || 'N/A'}`,
            inline: true
        });
    }
    
    if (fields.length > 0) {
        embed.addFields(fields.slice(0, 25));
    }
    
    return [embed];
}

/**
 * Build wiki embeds
 */
function buildWikiEmbeds(data) {
    const results = data?.query?.search || data?.search || data || [];
    
    if (!results || results.length === 0) {
        return [buildErrorEmbed('Nenhum resultado encontrado na wiki', 'wiki')];
    }
    
    const embed = new EmbedBuilder()
        .setColor(COLORS.wiki)
        .setTitle('Resultados da Browiki')
        .setFooter({ text: 'Browiki - Ragnarok Online Brasil' });
    
    const fields = [];
    const displayResults = Array.isArray(results) ? results.slice(0, 10) : [results];
    
    for (const result of displayResults) {
        const title = result.title || result.name || 'Artigo';
        const snippet = result.snippet 
            ? result.snippet.replace(/<[^>]*>/g, '').substring(0, 100) + '...'
            : 'Sem descrição';
        
        fields.push({
            name: title,
            value: `${snippet}\n[Ver artigo](https://browiki.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))})`,
            inline: false
        });
    }
    
    if (fields.length > 0) {
        embed.addFields(fields.slice(0, 10));
    }
    
    return [embed];
}

/**
 * Build price analysis embeds
 */
function buildPriceEmbeds(data) {
    if (!data) {
        return [buildErrorEmbed('Dados de preço não disponíveis', 'price')];
    }
    
    const analysis = data.analysis || 'justo';
    const analysisText = {
        'muito_barato': '🟢 Muito Barato',
        'barato': '🟢 Barato',
        'justo': '🟡 Preço Justo',
        'caro': '🟠 Caro',
        'muito_caro': '🔴 Muito Caro'
    };
    
    const embed = new EmbedBuilder()
        .setColor(COLORS.price)
        .setTitle(`Análise de Preço: ${data.item || 'Item'}`)
        .setFooter({ text: `Servidor: ${data.server || 'FREYA'}` })
        .setTimestamp();
    
    const fields = [];
    
    if (data.inputPrice) {
        fields.push({
            name: 'Preço Informado',
            value: `${formatNumber(data.inputPrice)}z`,
            inline: true
        });
        fields.push({
            name: 'Análise',
            value: analysisText[analysis] || analysis,
            inline: true
        });
        fields.push({
            name: 'Diferença da Mediana',
            value: `${data.percentFromMedian > 0 ? '+' : ''}${data.percentFromMedian}%`,
            inline: true
        });
    }
    
    if (data.stats) {
        fields.push({
            name: 'Preço Mínimo',
            value: formatNumber(data.stats.min) + 'z',
            inline: true
        });
        fields.push({
            name: 'Preço Mediano',
            value: formatNumber(data.stats.median) + 'z',
            inline: true
        });
        fields.push({
            name: 'Preço Máximo',
            value: formatNumber(data.stats.max) + 'z',
            inline: true
        });
        fields.push({
            name: 'Preço Médio',
            value: formatNumber(data.stats.avg) + 'z',
            inline: true
        });
        fields.push({
            name: 'Listagens',
            value: String(data.stats.count),
            inline: true
        });
    }
    
    if (fields.length > 0) {
        embed.addFields(fields);
    }
    
    return [embed];
}

/**
 * Build price history embeds
 */
function buildHistoryEmbeds(data) {
    if (!data || !data.history) {
        return [buildErrorEmbed('Histórico não disponível', 'history')];
    }
    
    const embed = new EmbedBuilder()
        .setColor(COLORS.history)
        .setTitle(`Histórico de Preço: ${data.itemName || 'Item'}`)
        .setFooter({ text: 'Dados históricos do GNJoy' });
    
    const history = data.history;
    const fields = [];
    
    if (history.itemPriceMin !== undefined) {
        fields.push({
            name: 'Preço Mínimo Histórico',
            value: formatNumber(history.itemPriceMin) + 'z',
            inline: true
        });
    }
    if (history.itemPriceMax !== undefined) {
        fields.push({
            name: 'Preço Máximo Histórico',
            value: formatNumber(history.itemPriceMax) + 'z',
            inline: true
        });
    }
    if (history.itemPriceAvg !== undefined) {
        fields.push({
            name: 'Preço Médio',
            value: formatNumber(history.itemPriceAvg) + 'z',
            inline: true
        });
    }
    
    if (fields.length > 0) {
        embed.addFields(fields);
    }
    
    return [embed];
}

/**
 * Build server status embeds
 */
function buildServerStatusEmbeds(data) {
    if (!data || !data.servers) {
        return [buildErrorEmbed('Status não disponível', 'server_status')];
    }
    
    const embed = new EmbedBuilder()
        .setColor(COLORS.server_status)
        .setTitle('Status dos Servidores')
        .setFooter({ text: 'Ragnarok Online LATAM' })
        .setTimestamp();
    
    const fields = [];
    
    for (const [name, status] of Object.entries(data.servers)) {
        const statusEmoji = status.online ? '🟢' : '🔴';
        const statusText = status.online ? 'Online' : 'Offline';
        
        fields.push({
            name: `${statusEmoji} ${name}`,
            value: statusText,
            inline: true
        });
    }
    
    if (fields.length > 0) {
        embed.addFields(fields);
    }
    
    if (data.lastCheck) {
        embed.setDescription(`Última verificação: ${new Date(data.lastCheck).toLocaleString('pt-BR')}`);
    }
    
    return [embed];
}

/**
 * Format a number with thousands separators
 */
function formatNumber(num) {
    if (num === undefined || num === null) return 'N/A';
    return Number(num).toLocaleString('pt-BR');
}

module.exports = {
    buildResponse,
    buildErrorEmbed,
    buildItemEmbeds,
    buildMonsterEmbeds,
    buildMapEmbeds,
    buildMarketEmbeds,
    buildWikiEmbeds,
    buildPriceEmbeds,
    buildHistoryEmbeds,
    buildServerStatusEmbeds,
    COLORS
};
