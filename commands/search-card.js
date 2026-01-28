/**
 * Search Card Command
 * Search for cards by effect/description or name
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const cardCache = require('../utils/cardCache');
const divinePride = require('../integrations/database/divine-pride');
const logger = require('../utils/logger');

// Collector timeout (2 minutes)
const COLLECTOR_TIMEOUT = 120000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buscar-card')
        .setDescription('Busca cartas por efeito ou nome')
        .addStringOption(option =>
            option.setName('busca')
                .setDescription('Efeito ou nome da carta (ex: "dano em mortos-vivos", "Hydra")')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('tipo')
                .setDescription('Tipo de busca')
                .setRequired(false)
                .addChoices(
                    { name: 'Efeito/Descrição', value: 'effect' },
                    { name: 'Nome', value: 'name' }
                )),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const searchTerm = interaction.options.getString('busca');
        const searchType = interaction.options.getString('tipo') || 'effect';
        
        try {
            // Check cache stats
            const stats = cardCache.getStats();
            
            // Search in cache
            let results;
            if (searchType === 'effect') {
                results = cardCache.searchByEffect(searchTerm, 25);
            } else {
                results = cardCache.searchByName(searchTerm, 25);
            }
            
            // If no results in cache, try searching via Divine Pride
            if (results.length === 0) {
                // Try direct API search
                const dpResults = await searchDivinePride(searchTerm);
                
                if (dpResults.length > 0) {
                    // Add to cache for future use
                    cardCache.addCards(dpResults);
                    results = dpResults;
                }
            }
            
            if (results.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🃏 Busca de Cartas')
                    .setDescription(`Nenhuma carta encontrada para **"${searchTerm}"**.`)
                    .addFields({
                        name: '💡 Dicas',
                        value: [
                            '• Tente termos mais genéricos (ex: "ATK", "HP", "crítico")',
                            '• Use o nome da carta ou parte dele',
                            '• O cache de cartas é atualizado conforme você pesquisa'
                        ].join('\n'),
                        inline: false
                    })
                    .setFooter({ text: `BeeWiki • Cache: ${stats.totalCards} cartas` })
                    .setTimestamp();
                
                return interaction.editReply({ embeds: [embed] });
            }
            
            // If only one result, show details directly
            if (results.length === 1) {
                return showCardDetails(interaction, results[0]);
            }
            
            // Multiple results - show list with select menu
            const embed = new EmbedBuilder()
                .setColor('#F5A623')
                .setTitle('🃏 Busca de Cartas')
                .setDescription(`Encontradas **${results.length}** cartas para **"${searchTerm}"**:`);
            
            // Build results list
            const listItems = results.slice(0, 20).map((card, index) => {
                const desc = card.description 
                    ? card.description.substring(0, 60) + (card.description.length > 60 ? '...' : '')
                    : 'Sem descrição';
                return `**${index + 1}.** ${card.name} (ID: ${card.id})\n   └ ${desc}`;
            });
            
            embed.addFields({
                name: '📋 Resultados',
                value: listItems.join('\n\n').substring(0, 1024) || 'Nenhum resultado',
                inline: false
            });
            
            if (results.length > 20) {
                embed.addFields({
                    name: '\u200b',
                    value: `*... e mais ${results.length - 20} resultado(s)*`,
                    inline: false
                });
            }
            
            embed.setFooter({ text: `BeeWiki • Selecione uma carta para ver detalhes` });
            embed.setTimestamp();
            
            // Build select menu
            const selectOptions = results.slice(0, 25).map(card => ({
                label: card.name.substring(0, 100),
                description: `ID: ${card.id}`,
                value: String(card.id)
            }));
            
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('card_select')
                .setPlaceholder('🃏 Selecione uma carta para ver detalhes')
                .addOptions(selectOptions);
            
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            const response = await interaction.editReply({ 
                embeds: [embed], 
                components: [row] 
            });
            
            // Handle selection
            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: COLLECTOR_TIMEOUT
            });
            
            collector.on('collect', async i => {
                if (i.customId === 'card_select') {
                    const selectedId = parseInt(i.values[0], 10);
                    const selectedCard = results.find(c => c.id === selectedId);
                    
                    if (selectedCard) {
                        await i.deferUpdate();
                        await showCardDetails(interaction, selectedCard);
                    }
                }
            });
            
            collector.on('end', async () => {
                try {
                    await interaction.editReply({ components: [] });
                } catch (error) {
                    // Ignore errors when editing after collector ends
                }
            });
            
        } catch (error) {
            logger.error('Error searching cards', { 
                searchTerm, 
                error: error.message 
            });
            
            const embed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('❌ Erro')
                .setDescription('Não foi possível buscar as cartas.')
                .setFooter({ text: 'BeeWiki' })
                .setTimestamp();
            
            return interaction.editReply({ embeds: [embed] });
        }
    }
};

/**
 * Shows detailed card information
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} card - Card data
 */
async function showCardDetails(interaction, card) {
    try {
        // Try to get more details from API
        let fullCard = card;
        
        if (!card.description || card.description.length === 0) {
            const apiCard = await cardCache.fetchCardFromAPI(card.id);
            if (apiCard) {
                fullCard = { ...card, ...apiCard };
                // Update cache with full details
                cardCache.addCard(fullCard);
            }
        }
        
        const embed = new EmbedBuilder()
            .setColor('#F5A623')
            .setTitle(`🃏 ${fullCard.name}`)
            .setThumbnail(fullCard.imageUrl || `https://static.divine-pride.net/images/items/item/${fullCard.id}.png`);
        
        if (fullCard.description) {
            embed.setDescription(fullCard.description);
        } else {
            embed.setDescription('*Descrição não disponível*');
        }
        
        // Item info
        embed.addFields({
            name: '📋 Informações',
            value: [
                `**ID:** ${fullCard.id}`,
                fullCard.prefix ? `**Prefixo:** ${fullCard.prefix}` : null,
                fullCard.suffix ? `**Sufixo:** ${fullCard.suffix}` : null
            ].filter(Boolean).join('\n') || `**ID:** ${fullCard.id}`,
            inline: true
        });
        
        // Links
        embed.addFields({
            name: '🔗 Links',
            value: [
                `[Divine Pride](https://www.divine-pride.net/database/item/${fullCard.id})`,
                `[bROWiki](https://browiki.org/wiki/${encodeURIComponent(fullCard.name.replace(/ /g, '_'))})`
            ].join(' • '),
            inline: true
        });
        
        embed.setFooter({ text: 'BeeWiki • Dados: Divine Pride' });
        embed.setTimestamp();
        
        await interaction.editReply({ embeds: [embed], components: [] });
        
    } catch (error) {
        logger.error('Error showing card details', { cardId: card.id, error: error.message });
        
        const embed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('❌ Erro')
            .setDescription('Não foi possível obter os detalhes da carta.')
            .setFooter({ text: 'BeeWiki' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed], components: [] });
    }
}

/**
 * Searches Divine Pride for cards
 * @param {string} searchTerm - Search term
 * @returns {Promise<Array>} Array of card results
 */
async function searchDivinePride(searchTerm) {
    try {
        // Use existing search functionality
        const results = await divinePride.makeSearchQuery(searchTerm, 'pt');
        
        if (!results || results.length === 0) {
            return [];
        }
        
        // Filter for items that are likely cards (contain "Card" or "Carta" in name)
        const cardResults = results.filter(item => {
            const name = (item.Name || item.name || '').toLowerCase();
            return name.includes('card') || name.includes('carta');
        });
        
        // Map to card format
        return cardResults.map(item => ({
            id: item.Id || item.id,
            name: item.Name || item.name,
            description: item.Description || item.description || '',
            imageUrl: item.ImageUrl || `https://static.divine-pride.net/images/items/item/${item.Id || item.id}.png`
        }));
        
    } catch (error) {
        logger.debug('Error searching Divine Pride for cards', { error: error.message });
        return [];
    }
}
