/**
 * Slash Command: /buscar-mercado
 * Searches for items in the Ragnarok Online LATAM market (trading system)
 * Includes interactive select menu to view detailed item information
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const gnjoy = require('../integrations/database/gnjoy');
const logger = require('../utils/logger');
const config = require('../config');
const i18n = require('../utils/i18n');
const { ValidationError, CommandError, APIError } = require('../utils/errors');
const { COLORS, TIMEOUTS, SELECT_MENU } = require('../utils/constants');

// Market-specific constants
const ITEMS_PER_PAGE = 10;
const GNJOY_THUMBNAIL = 'https://assets.gnjoylatam.com/static/web/ro/assets/images/ro_og.webp';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buscar-mercado')
        .setDescription('Busca itens no mercado do servidor Ragnarok Online LATAM')
        .addStringOption(option =>
            option
                .setName('busca')
                .setDescription('Nome do item a buscar')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('tipo')
                .setDescription('Tipo de transação (padrão: Comprando)')
                .setRequired(false)
                .addChoices(
                    { name: 'Comprando', value: 'BUY' },
                    { name: 'Vendendo', value: 'SELL' }
                )
        )
        .addStringOption(option =>
            option
                .setName('servidor')
                .setDescription('Servidor (padrão: Freya)')
                .setRequired(false)
                .addChoices(
                    { name: 'Freya', value: 'FREYA' },
                    { name: 'Thor', value: 'THOR' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const searchTerm = interaction.options.getString('busca');
        const storeType = interaction.options.getString('tipo') || 'BUY';
        const server = interaction.options.getString('servidor') || 'FREYA';
        const language = config.defaultLanguage || 'pt';
        const t = i18n.getLanguage(language);

        try {
            // Validate search term
            if (searchTerm.length < 2) {
                throw new ValidationError('Termo de busca muito curto', 'O termo de busca deve ter pelo menos 2 caracteres.');
            }

            // Search in the market
            const result = await gnjoy.searchMarket(searchTerm, {
                storeType,
                server
            });

            const { list, totalCount } = result;

            if (!list || list.length === 0) {
                const noResultsEmbed = createMarketEmbed({
                    title: t.market?.title || 'Mercado - Ragnarok Online',
                    description: `${t.search.resultsFor} **"${searchTerm}"**\n\n${t.search.noResults}`,
                    searchTerm,
                    storeType,
                    server,
                    color: COLORS.WARNING,
                    t
                });

                return interaction.editReply({ embeds: [noResultsEmbed] });
            }

            // Format results for display
            const formattedItems = list.map((item, index) => {
                const price = gnjoy.formatPrice(item.itemPrice);
                const slots = item.slotMaxCount ? ` ${item.slotMaxCount}` : '';
                const storeLabel = storeType === 'BUY' ? 'compra' : 'vende';
                
                return `**${index + 1}.** [${item.itemName}](https://www.divine-pride.net/database/item/${item.itemId})${slots}\n` +
                       `   💰 **${price}** z | 📦 x${item.itemCnt}\n` +
                       `   🏪 ${item.storeName} (${item.itemSellerCharName})`;
            });

            // Paginate if needed
            const totalPages = Math.ceil(formattedItems.length / ITEMS_PER_PAGE);
            const currentPage = 1;
            const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
            const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, formattedItems.length);
            const pageItems = formattedItems.slice(startIndex, endIndex);

            const storeTypeLabel = gnjoy.getStoreTypeLabel(storeType);
            const description = pageItems.join('\n\n');

            const embed = createMarketEmbed({
                title: t.market?.title || 'Mercado - Ragnarok Online',
                description,
                searchTerm,
                storeType,
                server,
                totalCount,
                currentPage,
                totalPages,
                t
            });

            // Create select menu for item details
            const components = [];
            if (list.length > 0) {
                const selectMenu = createMarketSelectMenu(list.slice(0, SELECT_MENU.MAX_OPTIONS), t);
                if (selectMenu) {
                    components.push(selectMenu);
                }
            }

            const reply = await interaction.editReply({ 
                embeds: [embed],
                components
            });

            // Setup pagination if multiple pages
            if (totalPages > 1) {
                await setupMarketPagination(reply, {
                    items: formattedItems,
                    list,
                    searchTerm,
                    storeType,
                    server,
                    totalCount,
                    totalPages,
                    itemsPerPage: ITEMS_PER_PAGE,
                    t
                });
            }

            // Setup collector for item selection
            if (components.length > 0) {
                setupMarketItemCollector(reply, list, t);
            }

            return;
        } catch (error) {
            logger.error('Error searching market', { searchTerm, storeType, server, error: error.message });
            
            if (error instanceof ValidationError || error instanceof CommandError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            if (error instanceof APIError) {
                return interaction.editReply(`❌ ${error.userMessage}`);
            }
            
            return interaction.editReply(t.market?.error || '❌ Não foi possível buscar no mercado. Tente novamente mais tarde.');
        }
    }
};

/**
 * Creates a market embed with consistent styling
 */
function createMarketEmbed(options) {
    const { 
        title, 
        description, 
        searchTerm, 
        storeType, 
        server, 
        totalCount,
        currentPage,
        totalPages,
        color = COLORS.PRIMARY,
        t 
    } = options;

    const storeTypeLabel = gnjoy.getStoreTypeLabel(storeType);
    
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setThumbnail(GNJOY_THUMBNAIL)
        .setTimestamp();

    // Header with search info
    const headerParts = [
        `🔍 **${t.search.resultsFor}:** "${searchTerm}"`,
        `📊 **Tipo:** ${storeTypeLabel}`,
        `🌐 **Servidor:** ${server}`
    ];
    
    if (typeof totalCount !== 'undefined') {
        headerParts.push(`📋 **Total:** ${totalCount} ${t.market?.listings || 'anúncios'}`);
    }

    embed.addFields({
        name: t.market?.searchInfo || 'Informações da Busca',
        value: headerParts.join('\n'),
        inline: false
    });

    // Results
    if (description) {
        // Split description if too long (Discord has 1024 char limit per field)
        const MAX_FIELD_LENGTH = 1024;
        
        if (description.length <= MAX_FIELD_LENGTH) {
            embed.addFields({
                name: t.market?.results || 'Resultados',
                value: description,
                inline: false
            });
        } else {
            // Split by double newlines (item separators)
            const items = description.split('\n\n');
            let currentField = '';
            let fieldCount = 1;
            
            for (const item of items) {
                const testField = currentField ? currentField + '\n\n' + item : item;
                
                if (testField.length > MAX_FIELD_LENGTH && currentField) {
                    embed.addFields({
                        name: `${t.market?.results || 'Resultados'} (${fieldCount})`,
                        value: currentField,
                        inline: false
                    });
                    currentField = item;
                    fieldCount++;
                } else {
                    currentField = testField;
                }
            }
            
            if (currentField) {
                embed.addFields({
                    name: fieldCount > 1 ? `${t.market?.results || 'Resultados'} (${fieldCount})` : t.market?.results || 'Resultados',
                    value: currentField,
                    inline: false
                });
            }
        }
    }

    // Footer with page info and credits
    let footerText = t.market?.credits || '*Dados do mercado oficial Ragnarok Online LATAM*';
    if (currentPage && totalPages) {
        footerText = `${t.search.page} ${currentPage}/${totalPages} | ${footerText}`;
    }
    
    embed.setFooter({ text: footerText });

    return embed;
}

/**
 * Creates a select menu for market items
 */
function createMarketSelectMenu(items, t) {
    if (!items || items.length === 0) return null;

    const options = items.slice(0, SELECT_MENU.MAX_OPTIONS).map((item, index) => {
        const price = gnjoy.formatPrice(item.itemPrice);
        const label = item.itemName.length > SELECT_MENU.MAX_LABEL_LENGTH 
            ? item.itemName.substring(0, SELECT_MENU.MAX_LABEL_LENGTH - 3) + '...'
            : item.itemName;
        
        const description = `${price}z - ${item.storeName}`.substring(0, SELECT_MENU.MAX_DESCRIPTION_LENGTH);
        
        return {
            label: label,
            description: description,
            value: `market_${index}_${item.itemId}`,
            emoji: '🏪'
        };
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('market_item_select')
        .setPlaceholder(t.market?.selectPlaceholder || 'Selecione um item para ver detalhes')
        .addOptions(options);

    return new ActionRowBuilder().addComponents(selectMenu);
}

/**
 * Sets up pagination for market results
 */
async function setupMarketPagination(message, paginationData) {
    const { totalPages, t } = paginationData;
    
    if (totalPages <= 1) return;

    const EMOJIS = {
        FIRST: '⏮️',
        PREV: '⬅️',
        NEXT: '➡️',
        LAST: '⏭️'
    };

    // Add navigation emojis
    for (const emoji of Object.values(EMOJIS)) {
        try {
            await message.react(emoji);
        } catch (error) {
            logger.warn('Failed to add market pagination reaction', { emoji, error: error.message });
        }
    }

    const filter = (reaction, user) => {
        return Object.values(EMOJIS).includes(reaction.emoji.name) && !user.bot;
    };

    const collector = message.createReactionCollector({
        filter,
        time: TIMEOUTS.PAGINATION,
        dispose: true
    });

    let currentPage = 1;

    collector.on('collect', async (reaction, user) => {
        try {
            await reaction.users.remove(user.id).catch(() => {});

            const emoji = reaction.emoji.name;
            let newPage = currentPage;

            switch (emoji) {
                case EMOJIS.FIRST:
                    newPage = 1;
                    break;
                case EMOJIS.PREV:
                    newPage = Math.max(1, currentPage - 1);
                    break;
                case EMOJIS.NEXT:
                    newPage = Math.min(totalPages, currentPage + 1);
                    break;
                case EMOJIS.LAST:
                    newPage = totalPages;
                    break;
            }

            if (newPage !== currentPage) {
                currentPage = newPage;
                
                const startIndex = (currentPage - 1) * paginationData.itemsPerPage;
                const endIndex = Math.min(startIndex + paginationData.itemsPerPage, paginationData.items.length);
                const pageItems = paginationData.items.slice(startIndex, endIndex);
                const description = pageItems.join('\n\n');

                const newEmbed = createMarketEmbed({
                    title: t.market?.title || 'Mercado - Ragnarok Online',
                    description,
                    searchTerm: paginationData.searchTerm,
                    storeType: paginationData.storeType,
                    server: paginationData.server,
                    totalCount: paginationData.totalCount,
                    currentPage,
                    totalPages,
                    t
                });

                await message.edit({ embeds: [newEmbed] }).catch(error => {
                    logger.error('Failed to edit market pagination', { error: error.message });
                });
            }
        } catch (error) {
            logger.error('Error handling market pagination', { error: error.message });
        }
    });

    collector.on('end', async () => {
        try {
            await message.reactions.removeAll().catch(() => {});
        } catch (error) {
            logger.warn('Failed to remove market reactions', { error: error.message });
        }
    });
}

/**
 * Sets up collector for item selection in market
 */
function setupMarketItemCollector(message, items, t) {
    const filter = (interaction) => {
        return interaction.customId === 'market_item_select';
    };

    const collector = message.createMessageComponentCollector({
        filter,
        time: TIMEOUTS.COLLECTOR
    });

    collector.on('collect', async (interaction) => {
        try {
            const [, indexStr, itemId] = interaction.values[0].split('_');
            const index = parseInt(indexStr, 10);
            const item = items[index];

            if (!item) {
                await interaction.reply({ content: '❌ Item não encontrado.', ephemeral: true });
                return;
            }

            const detailEmbed = createMarketItemDetailEmbed(item, t);
            await interaction.reply({ embeds: [detailEmbed], ephemeral: true });
        } catch (error) {
            logger.error('Error showing market item details', { error: error.message });
            await interaction.reply({ 
                content: '❌ Erro ao mostrar detalhes do item.', 
                ephemeral: true 
            }).catch(() => {});
        }
    });

    collector.on('end', () => {
        // Optionally disable the select menu
        logger.debug('Market item collector ended');
    });
}

/**
 * Creates a detailed embed for a market item
 */
function createMarketItemDetailEmbed(item, t) {
    const price = gnjoy.formatPrice(item.itemPrice);
    const storeTypeLabel = item.storeTypeName === 'BUY' ? 'Comprando' : 'Vendendo';
    const slots = item.slotMaxCount || 'N/A';
    
    const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`🏪 ${item.itemName}`)
        .setThumbnail(item.databaseImgPath)
        .setTimestamp();

    embed.addFields(
        { name: '💰 Preço', value: `${price} zeny`, inline: true },
        { name: '📦 Quantidade', value: `${item.itemCnt}`, inline: true },
        { name: '🔄 Tipo', value: storeTypeLabel, inline: true },
        { name: '🏪 Loja', value: item.storeName || 'N/A', inline: true },
        { name: '👤 Vendedor', value: item.itemSellerCharName || 'N/A', inline: true },
        { name: '🎰 Slots', value: slots, inline: true },
        { name: '📁 Categoria', value: item.databaseType || 'N/A', inline: true },
        { name: '🆔 Item ID', value: `${item.itemId}`, inline: true }
    );

    embed.addFields({
        name: '🔗 Links',
        value: `[Ver no Divine Pride](https://www.divine-pride.net/database/item/${item.itemId})`,
        inline: false
    });

    embed.setFooter({ 
        text: t.market?.credits || '*Dados do mercado oficial Ragnarok Online LATAM*'
    });

    return embed;
}
