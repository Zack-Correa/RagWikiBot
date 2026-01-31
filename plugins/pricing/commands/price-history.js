/**
 * Price History Command
 * Shows price history for items from market data
 * Fetches live data from GNJoy API and combines with stored history
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const priceHistoryStorage = require('../../../utils/priceHistoryStorage');
const gnjoy = require('../../../integrations/database/gnjoy');
const logger = require('../../../utils/logger');
const { getServerChoices, getStoreTypeChoices, SERVERS } = require('../../../utils/commandHelpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('historico-preco')
        .setDescription('Mostra o histórico de preços de um item do mercado')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('Nome do item para buscar')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('servidor')
                .setDescription('Servidor para filtrar')
                .setRequired(false)
                .addChoices(
                    { name: 'Todos', value: 'ALL' },
                    ...getServerChoices()
                ))
        .addStringOption(option =>
            option.setName('tipo')
                .setDescription('Tipo de transação')
                .setRequired(false)
                .addChoices(...getStoreTypeChoices())),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const searchTerm = interaction.options.getString('item');
        const server = interaction.options.getString('servidor') || 'ALL';
        const storeType = interaction.options.getString('tipo') || 'BUY';
        
        try {
            logger.info('Fetching price history from GNJoy API', { searchTerm, server, storeType });
            
            // Determine which servers to query
            const serversToQuery = server === 'ALL' ? SERVERS : [server];
            
            // Fetch live data from GNJoy API for each server
            const liveResults = [];
            const errors = [];
            
            for (const srv of serversToQuery) {
                try {
                    const result = await gnjoy.searchMarket(searchTerm, {
                        storeType,
                        server: srv
                    });
                    
                    if (result && result.list && result.list.length > 0) {
                        liveResults.push({
                            server: srv,
                            items: result.list,
                            totalCount: result.totalCount
                        });
                    }
                } catch (error) {
                    logger.warn('Failed to fetch from server', { server: srv, error: error.message });
                    errors.push(srv);
                }
            }
            
            // No live results - try stored history as fallback
            if (liveResults.length === 0) {
                logger.info('No live results, checking stored history', { searchTerm });
                
                const storedItems = priceHistoryStorage.searchItems(searchTerm, 10);
                
                if (storedItems.length > 0) {
                    // Use stored history as fallback
                    return showStoredHistory(interaction, searchTerm, storedItems, server === 'ALL' ? null : server, storeType, errors);
                }
                
                // No data anywhere
                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('📈 Histórico de Preços')
                    .setDescription(`Nenhum item encontrado para **"${searchTerm}"** no mercado.`)
                    .addFields({
                        name: '🔍 Servidores consultados',
                        value: serversToQuery.join(', '),
                        inline: true
                    }, {
                        name: '📊 Tipo',
                        value: gnjoy.getStoreTypeLabel(storeType),
                        inline: true
                    })
                    .setFooter({ text: 'BeeWiki • Histórico de Preços' })
                    .setTimestamp();
                
                if (errors.length > 0) {
                    embed.addFields({
                        name: '⚠️ Erros',
                        value: `Falha ao consultar: ${errors.join(', ')}`,
                        inline: false
                    });
                }
                
                return interaction.editReply({ embeds: [embed] });
            }
            
            // Group items by itemId across all servers
            const itemsMap = new Map();
            
            for (const result of liveResults) {
                for (const item of result.items) {
                    const key = item.itemId;
                    
                    if (!itemsMap.has(key)) {
                        itemsMap.set(key, {
                            itemId: item.itemId,
                            itemName: item.itemName,
                            imgPath: item.databaseImgPath,
                            servers: {}
                        });
                    }
                    
                    const entry = itemsMap.get(key);
                    
                    if (!entry.servers[result.server]) {
                        entry.servers[result.server] = {
                            prices: [],
                            min: Infinity,
                            max: 0,
                            total: 0,
                            count: 0
                        };
                    }
                    
                    const serverData = entry.servers[result.server];
                    serverData.prices.push({
                        price: item.itemPrice,
                        quantity: item.itemCnt,
                        seller: item.itemSellerCharName,
                        store: item.storeName
                    });
                    serverData.min = Math.min(serverData.min, item.itemPrice);
                    serverData.max = Math.max(serverData.max, item.itemPrice);
                    serverData.total += item.itemPrice;
                    serverData.count++;
                }
            }
            
            // Convert to array and sort by total listings
            const items = Array.from(itemsMap.values())
                .sort((a, b) => {
                    const countA = Object.values(a.servers).reduce((sum, s) => sum + s.count, 0);
                    const countB = Object.values(b.servers).reduce((sum, s) => sum + s.count, 0);
                    return countB - countA;
                });
            
            // Build embed
            const embed = new EmbedBuilder()
                .setColor('#F5A623')
                .setTitle(`📈 Histórico de Preços: "${searchTerm}"`)
                .setDescription(`Encontrados **${items.length}** itens diferentes no mercado.`);
            
            // Show top 5 items
            const topItems = items.slice(0, 5);
            
            for (const item of topItems) {
                const serverStats = [];
                
                for (const [serverName, data] of Object.entries(item.servers)) {
                    if (data.count === 0) continue;
                    
                    const avg = Math.round(data.total / data.count);
                    const minFormatted = gnjoy.formatPrice(data.min);
                    const maxFormatted = gnjoy.formatPrice(data.max);
                    const avgFormatted = gnjoy.formatPrice(avg);
                    
                    serverStats.push(
                        `**${serverName}** (${data.count} anúncios)\n` +
                        `├ Mínimo: ${minFormatted}\n` +
                        `├ Máximo: ${maxFormatted}\n` +
                        `└ Média: ${avgFormatted}`
                    );
                }
                
                if (serverStats.length > 0) {
                    embed.addFields({
                        name: `📦 ${item.itemName} (ID: ${item.itemId})`,
                        value: serverStats.join('\n\n').substring(0, 1024),
                        inline: false
                    });
                }
            }
            
            // Add summary
            const totalListings = items.reduce((sum, item) => 
                sum + Object.values(item.servers).reduce((s, srv) => s + srv.count, 0), 0
            );
            
            embed.addFields({
                name: '📊 Resumo',
                value: [
                    `• **Total de anúncios:** ${totalListings}`,
                    `• **Itens únicos:** ${items.length}`,
                    `• **Servidores:** ${serversToQuery.join(', ')}`,
                    `• **Tipo:** ${storeType === 'BUY' ? '🛒' : '💰'} ${gnjoy.getStoreTypeLabel(storeType)}`
                ].join('\n'),
                inline: false
            });
            
            // Get stored history if available
            const storedHistory = priceHistoryStorage.searchItems(searchTerm, 1);
            if (storedHistory.length > 0 && storedHistory[0].latestDate) {
                const historyData = priceHistoryStorage.getItemHistory(storedHistory[0].itemId, null, storeType, 7);
                if (historyData && Object.keys(historyData.servers).length > 0) {
                    let historyText = '**Últimos 7 dias:**\n';
                    
                    for (const [srv, srvData] of Object.entries(historyData.servers)) {
                        const typeData = srvData[storeType];
                        if (typeData && typeData.length > 0) {
                            const recent = typeData.slice(-3);
                            const trend = recent.map(d => `${d.date.slice(5)}: ${gnjoy.formatPrice(d.avg)}`).join(' → ');
                            historyText += `• ${srv}: ${trend}\n`;
                        }
                    }
                    
                    embed.addFields({
                        name: '📅 Histórico Armazenado',
                        value: historyText.substring(0, 1024),
                        inline: false
                    });
                }
            }
            
            if (items.length > 0 && items[0].imgPath) {
                embed.setThumbnail(items[0].imgPath);
            }
            
            embed.setFooter({ text: 'BeeWiki • Dados em tempo real do mercado oficial LATAM' });
            embed.setTimestamp();
            
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            logger.error('Error fetching price history', { 
                searchTerm, 
                error: error.message 
            });
            
            // Try stored history as fallback on error
            try {
                const storedItems = priceHistoryStorage.searchItems(searchTerm, 10);
                if (storedItems.length > 0) {
                    logger.info('Using stored history as fallback after API error', { searchTerm });
                    return showStoredHistory(interaction, searchTerm, storedItems, server === 'ALL' ? null : server, storeType, ['API Error']);
                }
            } catch (fallbackError) {
                logger.warn('Fallback to stored history also failed', { error: fallbackError.message });
            }
            
            const embed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('❌ Erro')
                .setDescription('Não foi possível obter os preços do mercado.')
                .addFields({
                    name: '💡 Detalhes',
                    value: error.message || 'Erro desconhecido',
                    inline: false
                })
                .setFooter({ text: 'BeeWiki' })
                .setTimestamp();
            
            return interaction.editReply({ embeds: [embed] });
        }
    }
};

/**
 * Shows stored price history as fallback
 */
async function showStoredHistory(interaction, searchTerm, storedItems, server, storeType, errors = []) {
    const embed = new EmbedBuilder()
        .setColor('#F5A623')
        .setTitle(`📈 Histórico de Preços: "${searchTerm}"`)
        .setDescription(`Mostrando **dados armazenados** (API indisponível ou sem resultados em tempo real).`);
    
    if (errors.length > 0) {
        embed.addFields({
            name: '⚠️ Aviso',
            value: `Não foi possível obter dados em tempo real. Usando histórico salvo.`,
            inline: false
        });
    }
    
    // Show up to 5 items from stored history
    const itemsToShow = storedItems.slice(0, 5);
    
    for (const item of itemsToShow) {
        const historyData = priceHistoryStorage.getItemHistory(item.itemId, server, storeType, 30);
        
        if (!historyData || Object.keys(historyData.servers).length === 0) {
            continue;
        }
        
        const serverStats = [];
        
        for (const [serverName, serverData] of Object.entries(historyData.servers)) {
            for (const [type, priceData] of Object.entries(serverData)) {
                if (priceData.length === 0) continue;
                if (storeType && type !== storeType) continue;
                
                const typeLabel = type === 'BUY' ? `🛒 ${gnjoy.getStoreTypeLabel(type)}` : `💰 ${gnjoy.getStoreTypeLabel(type)}`;
                
                // Calculate statistics
                const allPrices = priceData.flatMap(d => [d.min, d.max]);
                const allAvgs = priceData.map(d => d.avg);
                const minPrice = Math.min(...allPrices);
                const maxPrice = Math.max(...allPrices);
                const avgPrice = Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length);
                const totalSamples = priceData.reduce((sum, d) => sum + d.samples, 0);
                
                // Get trend
                const latestPrice = priceData[priceData.length - 1]?.avg || 0;
                const oldestPrice = priceData[0]?.avg || 0;
                const trend = latestPrice > oldestPrice ? '📈' : (latestPrice < oldestPrice ? '📉' : '➡️');
                const trendPercent = oldestPrice > 0 
                    ? ((latestPrice - oldestPrice) / oldestPrice * 100).toFixed(1)
                    : 0;
                
                // Recent data
                const recentData = priceData.slice(-5);
                const historyLine = recentData.map(d => `${d.date.slice(5)}: ${gnjoy.formatPrice(d.avg)}`).join('\n');
                
                serverStats.push(
                    `**${serverName} - ${typeLabel}**\n` +
                    `├ Mínimo: ${gnjoy.formatPrice(minPrice)}\n` +
                    `├ Máximo: ${gnjoy.formatPrice(maxPrice)}\n` +
                    `├ Média: ${gnjoy.formatPrice(avgPrice)}\n` +
                    `├ Amostras: ${totalSamples}\n` +
                    `└ Tendência: ${trend} ${trendPercent}%\n\n` +
                    `**Histórico:**\n${historyLine}`
                );
            }
        }
        
        if (serverStats.length > 0) {
            embed.addFields({
                name: `📦 ${item.name} (ID: ${item.itemId})`,
                value: serverStats.join('\n\n').substring(0, 1024),
                inline: false
            });
        }
    }
    
    // If no fields were added
    if (embed.data.fields?.length <= 1) {
        embed.addFields({
            name: '📭 Sem dados',
            value: 'Nenhum histórico detalhado disponível para este filtro.',
            inline: false
        });
    }
    
    embed.setFooter({ text: 'BeeWiki • Dados do histórico armazenado' });
    embed.setTimestamp();
    
    return interaction.editReply({ embeds: [embed] });
}
