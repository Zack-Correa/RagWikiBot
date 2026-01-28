/**
 * Price Check Command
 * Analyzes if a price is fair using live market data AND historical data
 * Queries both BUY and SELL prices for comprehensive analysis
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const pricingService = require('../services/pricingService');
const priceHistoryStorage = require('../utils/priceHistoryStorage');
const gnjoy = require('../integrations/database/gnjoy');
const logger = require('../utils/logger');

// Servers to query
const SERVERS = ['FREYA', 'NIDHOGG', 'YGGDRASIL'];
const STORE_TYPES = ['BUY', 'SELL'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('preco-justo')
        .setDescription('Analisa se o preço de um item está justo com base no mercado')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('Nome ou ID do item')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('preco')
                .setDescription('Preço a ser analisado (deixe vazio para usar preços do mercado)')
                .setRequired(false)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('servidor')
                .setDescription('Servidor (padrão: Todos)')
                .setRequired(false)
                .addChoices(
                    { name: 'Todos', value: 'ALL' },
                    { name: 'Freya', value: 'FREYA' },
                    { name: 'Nidhogg', value: 'NIDHOGG' },
                    { name: 'Yggdrasil', value: 'YGGDRASIL' }
                )),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const searchTerm = interaction.options.getString('item');
        const priceToAnalyze = interaction.options.getInteger('preco');
        const server = interaction.options.getString('servidor') || 'ALL';
        
        try {
            logger.info('Fetching prices for analysis', { searchTerm, server });
            
            // Determine which servers to query
            const serversToQuery = server === 'ALL' ? SERVERS : [server];
            
            // ============================================
            // STEP 1: FETCH FROM GNJOY API (PRIMARY SOURCE)
            // ============================================
            logger.info('Step 1: Querying GNJoy API...', { servers: serversToQuery, types: STORE_TYPES });
            
            const liveResults = [];
            const errors = [];
            let totalLiveItems = 0;
            
            for (const srv of serversToQuery) {
                for (const storeType of STORE_TYPES) {
                    try {
                        const result = await gnjoy.searchMarket(searchTerm, {
                            storeType,
                            server: srv
                        });
                        
                        if (result && result.list && result.list.length > 0) {
                            liveResults.push({
                                server: srv,
                                storeType,
                                items: result.list,
                                totalCount: result.totalCount
                            });
                            totalLiveItems += result.list.length;
                            logger.debug('API returned items', { server: srv, storeType, count: result.list.length });
                        }
                    } catch (error) {
                        logger.warn('Failed to fetch from server for pricing', { server: srv, storeType, error: error.message });
                        errors.push(`${srv}/${storeType}`);
                    }
                }
            }
            
            logger.info('GNJoy API results', { totalResults: liveResults.length, totalItems: totalLiveItems, errors: errors.length });
            
            // Group live items by itemId and collect all prices
            const itemsMap = new Map();
            
            for (const result of liveResults) {
                for (const item of result.items) {
                    const key = item.itemId;
                    
                    if (!itemsMap.has(key)) {
                        itemsMap.set(key, {
                            itemId: item.itemId,
                            itemName: item.itemName,
                            imgPath: item.databaseImgPath,
                            allPrices: [],
                            buyPrices: [],
                            sellPrices: [],
                            servers: {}
                        });
                    }
                    
                    const entry = itemsMap.get(key);
                    entry.allPrices.push(item.itemPrice);
                    
                    if (result.storeType === 'BUY') {
                        entry.buyPrices.push(item.itemPrice);
                    } else {
                        entry.sellPrices.push(item.itemPrice);
                    }
                    
                    if (!entry.servers[result.server]) {
                        entry.servers[result.server] = { buy: [], sell: [] };
                    }
                    entry.servers[result.server][result.storeType.toLowerCase()].push(item.itemPrice);
                }
            }
            
            // No live results - nothing to analyze
            if (itemsMap.size === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('❓ Item não encontrado')
                    .setDescription([
                        `Não encontrei **"${searchTerm}"** no mercado.`,
                        '',
                        '**Dica:** Tente um nome mais simples.',
                        'Ex: "Vida" ao invés de "Vida Verdejante"'
                    ].join('\n'))
                    .setFooter({ text: 'BeeWiki' })
                    .setTimestamp();
                
                return interaction.editReply({ embeds: [embed] });
            }
            
            // Find the best matching item from live data
            const items = Array.from(itemsMap.values());
            let targetItem = items.find(item => 
                item.itemName.toLowerCase() === searchTerm.toLowerCase()
            );
            
            if (!targetItem && items.length > 0) {
                targetItem = items.find(item =>
                    item.itemName.toLowerCase().includes(searchTerm.toLowerCase())
                ) || items[0];
            }
            
            // ============================================
            // STEP 2: FETCH GNJOY PRICE HISTORY API
            // ============================================
            let historicalPrices = [];
            let historyDays = 0;
            
            if (targetItem) {
                logger.info('Step 2: Fetching GNJoy price history...', { itemId: targetItem.itemId, server: serversToQuery[0] });
                
                // Fetch from GNJoy price history API
                const historyData = await gnjoy.getPriceHistory(targetItem.itemId, serversToQuery[0], 'ALL', targetItem.itemName);
                
                if (historyData && historyData.priceDetailChartList) {
                    for (const day of historyData.priceDetailChartList) {
                        historicalPrices.push(day.avgItemPrice);
                    }
                    historyDays = historyData.priceDetailChartList.length;
                    logger.info('GNJoy history fetched', { itemId: targetItem.itemId, days: historyDays });
                }
                
                // Fallback to local storage if GNJoy history failed
                if (historicalPrices.length === 0) {
                    logger.info('Falling back to local history...', { searchTerm });
                    const storedItems = priceHistoryStorage.searchItems(searchTerm, 5);
                    if (storedItems.length > 0) {
                        const histData = priceHistoryStorage.getItemHistory(storedItems[0].itemId, null, null, 90);
                        if (histData) {
                            for (const serverData of Object.values(histData.servers)) {
                                for (const typeData of Object.values(serverData)) {
                                    for (const dayData of typeData) {
                                        historicalPrices.push(dayData.avg);
                                    }
                                }
                            }
                            historyDays = historicalPrices.length;
                        }
                    }
                }
            }
            
            // ============================================
            // STEP 3: COMBINE AND ANALYZE
            // ============================================
            logger.info('Step 3: Combining data sources...', { 
                liveItems: itemsMap.size, 
                historicalPrices: historicalPrices.length 
            });
            
            // Combine all price sources
            let allPrices = [];
            let itemName = searchTerm;
            let itemId = null;
            let imgPath = null;
            
            if (targetItem) {
                allPrices = [...targetItem.allPrices];
                itemName = targetItem.itemName;
                itemId = targetItem.itemId;
                imgPath = targetItem.imgPath;
            }
            
            // Add historical prices to the analysis
            if (historicalPrices.length > 0) {
                allPrices = [...allPrices, ...historicalPrices];
            }
            
            // Sort all prices
            allPrices.sort((a, b) => a - b);
            
            if (allPrices.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('📊 Análise de Preço')
                    .setDescription(`Nenhum preço encontrado para **"${searchTerm}"**.`)
                    .setFooter({ text: 'BeeWiki • Análise de Preço' })
                    .setTimestamp();
                
                return interaction.editReply({ embeds: [embed] });
            }
            
            // Calculate statistics
            const min = allPrices[0];
            const max = allPrices[allPrices.length - 1];
            const median = allPrices[Math.floor(allPrices.length / 2)];
            const mean = Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length);
            const p25 = allPrices[Math.floor(allPrices.length * 0.25)] || min;
            const p75 = allPrices[Math.floor(allPrices.length * 0.75)] || max;
            
            // Price to check
            const priceToCheck = priceToAnalyze || median;
            
            // Calculate deviation from median
            const deviationFromMedian = median > 0 
                ? ((priceToCheck - median) / median * 100).toFixed(1)
                : 0;
            
            // Determine price level
            let level, recommendation;
            
            if (priceToCheck <= p25 * 0.9) {
                level = { key: 'VERY_CHEAP', label: 'Muito Barato', emoji: '🟢', color: '#3BA55C' };
                recommendation = 'Excelente oportunidade! Preço muito abaixo do mercado.';
            } else if (priceToCheck <= p25) {
                level = { key: 'CHEAP', label: 'Barato', emoji: '🟡', color: '#FAA61A' };
                recommendation = 'Bom preço, abaixo da média do mercado.';
            } else if (priceToCheck <= p75) {
                level = { key: 'FAIR', label: 'Justo', emoji: '🟠', color: '#F5A623' };
                recommendation = 'Preço dentro da faixa normal do mercado.';
            } else if (priceToCheck <= p75 * 1.1) {
                level = { key: 'EXPENSIVE', label: 'Caro', emoji: '🔴', color: '#ED4245' };
                recommendation = 'Preço acima da média. Considere negociar.';
            } else {
                level = { key: 'VERY_EXPENSIVE', label: 'Muito Caro', emoji: '⛔', color: '#8B0000' };
                recommendation = 'Preço muito acima do mercado. Não recomendado.';
            }
            
            // Build simplified embed
            const liveCount = targetItem ? targetItem.allPrices.length : 0;
            const histCount = historicalPrices.length;
            
            const embed = new EmbedBuilder()
                .setColor(level.color)
                .setTitle(`${level.emoji} ${itemName}`)
                .setDescription([
                    `### ${level.label}`,
                    '',
                    recommendation,
                    '',
                    priceToAnalyze 
                        ? `**Preço informado:** ${gnjoy.formatPrice(priceToCheck)}`
                        : `**Preço médio atual:** ${gnjoy.formatPrice(priceToCheck)}`
                ].join('\n'));
            
            // Main info - simple and clear
            embed.addFields({
                name: '💰 Preço Justo',
                value: `**${gnjoy.formatPrice(p25)}** a **${gnjoy.formatPrice(p75)}**`,
                inline: true
            });
            
            embed.addFields({
                name: '📊 No Mercado',
                value: `${gnjoy.formatPrice(min)} - ${gnjoy.formatPrice(max)}`,
                inline: true
            });
            
            embed.addFields({
                name: '📈 Mediana',
                value: gnjoy.formatPrice(median),
                inline: true
            });
            
            if (imgPath) {
                embed.setThumbnail(imgPath);
            }
            
            const sourceInfo = historyDays > 0 
                ? `${liveCount} anúncios + ${historyDays} dias de histórico`
                : `${liveCount} anúncios`;
            embed.setFooter({ text: `BeeWiki • ${sourceInfo}` });
            embed.setTimestamp();
            
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            logger.error('Error in price check', { 
                searchTerm, 
                error: error.message 
            });
            
            const embed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('❌ Erro')
                .setDescription('Não foi possível analisar o preço.')
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
