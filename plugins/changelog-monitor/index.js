/**
 * Changelog Monitor Plugin
 * Monitors Divine Pride forum for new LATAM changelogs,
 * parses the content, and posts contextual summaries to Discord
 */

const { EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const dpForum = require('../../integrations/database/divine-pride-forum');
const changelogStorage = require('../../utils/changelogStorage');
const summaryGenerator = require('./summaryGenerator');
const llmService = require('../../services/llmService');
const changelogCommand = require('./command');

let pluginLogger = null;
let discordClient = null;
let monitorIntervalId = null;

// Check every 30 minutes
const MONITOR_INTERVAL_MS = 30 * 60 * 1000;

// Initial delay: 3 minutes after bot start
const INITIAL_DELAY_MS = 3 * 60 * 1000;

// Global page store: messageId → { pages, currentPage }
const pageStore = new Map();
const NAV_PREFIX = 'clnav';

function onLoad(context) {
    pluginLogger = context.logger;

    if (!llmService.isAvailable()) {
        llmService.initialize();
        if (llmService.isAvailable()) {
            const cfg = llmService.getConfig();
            pluginLogger.info('LLM service initialized', { provider: cfg.provider, model: cfg.model });
        } else {
            pluginLogger.info('LLM service not configured, will use template summaries');
        }
    }

    pluginLogger.info('Changelog monitor plugin loaded');
}

function onEnable(context) {
    discordClient = context.getClient();

    if (discordClient) {
        setTimeout(() => checkForNewChangelogs(), INITIAL_DELAY_MS);
        monitorIntervalId = setInterval(() => checkForNewChangelogs(), MONITOR_INTERVAL_MS);

        discordClient.on('interactionCreate', handleButtonInteraction);
    }

    pluginLogger.info('Changelog monitor enabled', {
        intervalMinutes: MONITOR_INTERVAL_MS / 60000,
        initialDelayMinutes: INITIAL_DELAY_MS / 60000
    });
}

function onDisable(context) {
    if (monitorIntervalId) {
        clearInterval(monitorIntervalId);
        monitorIntervalId = null;
    }
    if (discordClient) {
        discordClient.removeListener('interactionCreate', handleButtonInteraction);
    }
    pluginLogger.info('Changelog monitor disabled');
}

function onUnload(context) {
    if (monitorIntervalId) {
        clearInterval(monitorIntervalId);
        monitorIntervalId = null;
    }
    if (discordClient) {
        discordClient.removeListener('interactionCreate', handleButtonInteraction);
    }
    pageStore.clear();
    pluginLogger.info('Changelog monitor unloaded');
}

/**
 * Main monitoring loop - checks for new LATAM changelogs
 */
async function checkForNewChangelogs() {
    if (!discordClient) return;

    try {
        const config = changelogStorage.getConfig();
        const serverFilter = config.serverFilter || 'LATAM';

        pluginLogger.info('Checking for new changelogs', { serverFilter });

        const topics = await dpForum.fetchChangelogTopics(serverFilter);

        if (topics.length === 0) {
            pluginLogger.debug('No changelog topics found');
            changelogStorage.updateLastCheck();
            return;
        }

        let newCount = 0;

        for (const topic of topics) {
            if (changelogStorage.isProcessed(topic.topicId)) {
                continue;
            }

            pluginLogger.info('New changelog found', { title: topic.title, topicId: topic.topicId });
            newCount++;

            try {
                await processChangelog(topic, config);
            } catch (error) {
                pluginLogger.error('Error processing changelog', {
                    topicId: topic.topicId,
                    error: error.message
                });
            }

            // Only process the most recent unprocessed one per cycle
            break;
        }

        if (newCount === 0) {
            pluginLogger.debug('No new changelogs to process');
        }

        changelogStorage.updateLastCheck();
    } catch (error) {
        pluginLogger.error('Error in changelog monitor cycle', { error: error.message });
    }
}

/**
 * Parses changelog, generates LLM analysis, and returns all data needed for posting.
 */
async function parseAndAnalyze(topic) {
    const content = await dpForum.fetchTopicContent(topic.url);
    if (!content) return null;

    const parsed = dpForum.parseChangelogHTML(content.html);
    content.html = null;
    await dpForum.deduplicateChangelog(parsed);

    let analysis = null;
    if (llmService.isAvailable()) {
        try {
            analysis = await summaryGenerator.generateLLMAnalysis(parsed, topic);
            pluginLogger.info('LLM analysis generated', { hasOverview: !!analysis?.overview });
        } catch (error) {
            pluginLogger.warn('LLM analysis failed', { error: error.message });
        }
    }

    return { parsed, analysis };
}

/**
 * Processes a single changelog topic
 */
async function processChangelog(topic, config) {
    const result = await parseAndAnalyze(topic);
    if (!result) {
        pluginLogger.warn('Could not fetch topic content', { url: topic.url });
        return;
    }

    const { parsed, analysis } = result;
    const stats = summaryGenerator.getChangelogStats(parsed);
    pluginLogger.info('Changelog parsed', { topicId: topic.topicId, stats });

    if (config.autoPost) {
        const guildChannels = changelogStorage.getGuildChannels();
        const channelIds = Object.values(guildChannels);

        if (channelIds.length > 0) {
            const embeds = summaryGenerator.buildChangelogEmbeds(parsed, topic, analysis);
            const templateMarkdown = summaryGenerator.generateSummary(parsed, topic);

            for (const channelId of channelIds) {
                try {
                    await postToChannel(channelId, topic, embeds, templateMarkdown);
                } catch (err) {
                    pluginLogger.error('Failed to post to guild channel', { channelId, error: err.message });
                }
            }
        }
    }

    changelogStorage.markProcessed(topic.topicId, {
        title: topic.title,
        url: topic.url,
        date: topic.date,
        stats,
        source: analysis ? 'llm' : 'template'
    });
}

function toDiscordEmbed(data) {
    const embed = new EmbedBuilder();
    if (data.color) embed.setColor(data.color);
    if (data.title) embed.setTitle(data.title);
    if (data.url) embed.setURL(data.url);
    if (data.description) embed.setDescription(data.description);
    if (data.timestamp) embed.setTimestamp();
    if (data.footer) embed.setFooter({ text: data.footer });
    if (data.fields) {
        for (const field of data.fields) embed.addFields(field);
    }
    return embed;
}

function buildNavButtons(currentPage, totalPages, messageId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${NAV_PREFIX}_${messageId}_first`)
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId(`${NAV_PREFIX}_${messageId}_prev`)
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId(`${NAV_PREFIX}_${messageId}_page`)
            .setLabel(`${currentPage + 1} / ${totalPages}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`${NAV_PREFIX}_${messageId}_next`)
            .setEmoji('➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages - 1),
        new ButtonBuilder()
            .setCustomId(`${NAV_PREFIX}_${messageId}_last`)
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages - 1)
    );
}

/**
 * Registers embed pages for a message in the global store.
 */
function registerPages(messageId, pages) {
    pageStore.set(messageId, { pages, currentPage: 0 });
}

/**
 * Global button interaction handler for changelog navigation.
 */
async function handleButtonInteraction(interaction) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(NAV_PREFIX + '_')) return;

    const parts = interaction.customId.split('_');
    // Format: clnav_{messageId}_{action}
    if (parts.length < 3) return;

    const messageId = parts[1];
    const action = parts.slice(2).join('_');

    let entry = pageStore.get(messageId);

    // If not in memory, try to rebuild from disk cache
    if (!entry) {
        const cached = changelogStorage.getLastChangelog();
        if (cached?.pages && interaction.message?.id === messageId) {
            entry = { pages: cached.pages, currentPage: 0 };
            pageStore.set(messageId, entry);
        }
    }

    if (!entry) {
        try {
            await interaction.reply({ content: 'Navegação expirada. Use `/changelog ultimo` para recarregar.', ephemeral: true });
        } catch {}
        return;
    }

    const { pages } = entry;
    switch (action) {
        case 'first': entry.currentPage = 0; break;
        case 'prev': entry.currentPage = Math.max(0, entry.currentPage - 1); break;
        case 'next': entry.currentPage = Math.min(pages.length - 1, entry.currentPage + 1); break;
        case 'last': entry.currentPage = pages.length - 1; break;
        default: return;
    }

    try {
        await interaction.update({
            embeds: [toDiscordEmbed(pages[entry.currentPage])],
            components: [buildNavButtons(entry.currentPage, pages.length, messageId)]
        });
    } catch (err) {
        pluginLogger?.debug('Button update failed', { messageId, error: err.message });
    }
}

/**
 * Posts a paginated embed with buttons to a channel.
 * Also attaches the full .md file.
 */
async function postToChannel(channelId, topic, pages, templateMarkdown) {
    try {
        const channel = await discordClient.channels.fetch(channelId);
        if (!channel) {
            pluginLogger.warn('Changelog channel not found', { channelId });
            return;
        }

        // Send a placeholder first to get the message ID for button custom IDs
        const message = await channel.send({
            embeds: [toDiscordEmbed(pages[0])],
            components: []
        });

        registerPages(message.id, pages);

        // Cache this changelog for persistence
        changelogStorage.setLastChangelog({
            topicId: topic.topicId,
            topicMeta: topic,
            pages,
            markdown: templateMarkdown
        });

        // Edit to add navigation buttons (now that we have message.id)
        if (pages.length > 1) {
            await message.edit({
                components: [buildNavButtons(0, pages.length, message.id)]
            });
        }

        // Attach full .md file
        const dateStr = (topic.date || new Date().toISOString().split('T')[0])
            .replace(/,?\s+/g, '-').toLowerCase();
        const filename = `changelog-latam-${dateStr}.md`;
        const attachment = new AttachmentBuilder(
            Buffer.from(templateMarkdown, 'utf-8'),
            { name: filename }
        );

        await channel.send({
            content: '📄 Detalhamento completo com tabelas em anexo:',
            files: [attachment]
        });

        pluginLogger.info('Changelog posted to channel', {
            channelId,
            topicId: topic.topicId,
            filename,
            totalPages: pages.length
        });
    } catch (error) {
        pluginLogger.error('Error posting changelog to channel', {
            channelId,
            error: error.message
        });
    }
}

const commands = {
    'changelog': {
        data: changelogCommand.data,
        execute: changelogCommand.execute
    }
};

module.exports = {
    onLoad,
    onEnable,
    onDisable,
    onUnload,
    commands,
    events: {},

    nav: {
        registerPages,
        toDiscordEmbed,
        buildNavButtons,
        NAV_PREFIX
    },

    api: {
        checkForNewChangelogs,
        getStatus: () => {
            const stats = changelogStorage.getStats();
            return {
                running: !!monitorIntervalId,
                intervalMinutes: MONITOR_INTERVAL_MS / 60000,
                ...stats
            };
        },
        getProcessedTopics: changelogStorage.getProcessedTopics,
        clearProcessed: changelogStorage.clearProcessed,
        getGuildChannels: changelogStorage.getGuildChannels,
        setGuildChannel: changelogStorage.setGuildChannel,
        removeGuildChannel: changelogStorage.removeGuildChannel,
        generateSummary: async (topicUrl) => {
            const topicIdMatch = topicUrl.match(/\/topic\/(\d+)-/);
            const meta = {
                title: 'LATAM Changelog',
                url: topicUrl,
                topicId: topicIdMatch ? topicIdMatch[1] : '',
                date: new Date().toLocaleDateString('pt-BR')
            };

            const result = await parseAndAnalyze(meta);
            if (!result) return null;

            const { parsed, analysis } = result;
            return {
                embeds: summaryGenerator.buildChangelogEmbeds(parsed, meta, analysis),
                templateMarkdown: summaryGenerator.generateSummary(parsed, meta),
                stats: summaryGenerator.getChangelogStats(parsed),
                source: analysis ? 'llm' : 'template',
                parsed
            };
        }
    }
};
