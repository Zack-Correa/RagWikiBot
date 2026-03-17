/**
 * Changelog Slash Command
 * Provides Discord commands for managing the changelog monitor
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const dpForum = require('../../integrations/database/divine-pride-forum');
const changelogStorage = require('../../utils/changelogStorage');
const configStorage = require('../../utils/configStorage');
const summaryGenerator = require('./summaryGenerator');
const llmService = require('../../services/llmService');
const logger = require('../../utils/logger');

function getNav() {
    return require('./index').nav;
}

const data = new SlashCommandBuilder()
    .setName('changelog')
    .setDescription('Gerencia o monitor de changelog do Divine Pride LATAM')
    .addSubcommand(sub =>
        sub.setName('ultimo')
            .setDescription('Mostra o último changelog LATAM disponível')
            .addBooleanOption(option =>
                option.setName('recarregar')
                    .setDescription('Força recarregar do fórum (ignora cache)')
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('verificar')
            .setDescription('Verifica manualmente se há novos changelogs')
    )
    .addSubcommand(sub =>
        sub.setName('status')
            .setDescription('Mostra o status do monitor de changelog')
    )
    .addSubcommand(sub =>
        sub.setName('canal')
            .setDescription('Define o canal para postar changelogs automaticamente')
            .addChannelOption(option =>
                option.setName('canal')
                    .setDescription('Canal para postar os changelogs')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('gerar')
            .setDescription('Gera um resumo contextual de um changelog específico')
            .addStringOption(option =>
                option.setName('url')
                    .setDescription('URL do tópico de changelog no Divine Pride')
                    .setRequired(true)
            )
    );

async function execute(interaction) {
    const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    const roleIds = interaction.member?.roles?.cache?.map(r => r.id) || [];

    const isAllowed = configStorage.isUserAllowed({
        plugin: 'changelog-monitor',
        userId: interaction.user.id,
        username: interaction.user.username,
        roleIds,
        isAdmin
    });

    if (!isAllowed) {
        return interaction.reply({
            content: '❌ Você não tem permissão para usar este comando.',
            ephemeral: true
        });
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'ultimo':
            return handleLatest(interaction);
        case 'verificar':
            return handleCheck(interaction);
        case 'status':
            return handleStatus(interaction);
        case 'canal':
            return handleSetChannel(interaction);
        case 'gerar':
            return handleGenerate(interaction);
        default:
            await interaction.reply({ content: 'Subcomando desconhecido.', ephemeral: true });
    }
}

/**
 * Sends a paginated embed with button navigation.
 * Uses the global page store from index.js for persistent buttons.
 */
async function sendPaginatedEmbed(interaction, pages) {
    if (pages.length === 0) return;

    const nav = getNav();

    const message = await interaction.editReply({
        embeds: [nav.toDiscordEmbed(pages[0])],
        components: []
    });

    nav.registerPages(message.id, pages);

    if (pages.length > 1) {
        await interaction.editReply({
            components: [nav.buildNavButtons(0, pages.length, message.id)]
        });
    }
}

async function handleLatest(interaction) {
    await interaction.deferReply();
    const forceReload = interaction.options.getBoolean('recarregar') || false;

    try {
        // Check cache first for instant response (unless force reload)
        const cached = !forceReload ? changelogStorage.getLastChangelog() : null;
        if (cached?.pages?.length > 0) {
            const age = Date.now() - new Date(cached.generatedAt).getTime();
            const ageMin = Math.round(age / 60000);
            logger.info('Serving changelog from cache', { topicId: cached.topicId, ageMinutes: ageMin });

            const pagesWithAge = cached.pages.map((p, i) => i === 0
                ? { ...p, footer: `${p.footer || 'BeeWiki • IA'} • Cache: ${ageMin}min atrás` }
                : p
            );
            await sendPaginatedEmbed(interaction, pagesWithAge);
            return;
        }

        // No cache — fetch fresh
        const topics = await dpForum.fetchChangelogTopics('LATAM');

        if (topics.length === 0) {
            return interaction.editReply('Nenhum changelog LATAM encontrado no fórum.');
        }

        const latest = topics[0];
        const content = await dpForum.fetchTopicContent(latest.url);

        if (!content) {
            return interaction.editReply('Não foi possível obter o conteúdo do changelog.');
        }

        const parsed = dpForum.parseChangelogHTML(content.html);
        content.html = null;
        await dpForum.deduplicateChangelog(parsed);

        let analysis = null;
        if (llmService.isAvailable()) {
            try {
                analysis = await summaryGenerator.generateLLMAnalysis(parsed, latest);
            } catch (err) {
                logger.warn('LLM analysis failed in /changelog ultimo', { error: err.message });
            }
        }

        const pages = summaryGenerator.buildChangelogEmbeds(parsed, latest, analysis);

        changelogStorage.setLastChangelog({
            topicId: latest.topicId,
            topicMeta: latest,
            pages
        });

        await sendPaginatedEmbed(interaction, pages);
    } catch (error) {
        logger.error('Error in changelog ultimo command', { error: error.message });
        await interaction.editReply('Erro ao buscar o changelog. Tente novamente mais tarde.');
    }
}

async function handleCheck(interaction) {
    await interaction.deferReply();

    try {
        const topics = await dpForum.fetchChangelogTopics('LATAM');
        const newTopics = topics.filter(t => !changelogStorage.isProcessed(t.topicId));

        if (newTopics.length === 0) {
            changelogStorage.updateLastCheck();
            return interaction.editReply('Nenhum changelog novo encontrado. Todos os changelogs LATAM já foram processados.');
        }

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`🆕 ${newTopics.length} changelog(s) novo(s) encontrado(s)`)
            .setDescription(newTopics.map(t => `• [${t.title}](${t.url})`).join('\n'))
            .setTimestamp()
            .setFooter({ text: 'BeeWiki • Changelog Monitor' });

        changelogStorage.updateLastCheck();
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error('Error in changelog check command', { error: error.message });
        await interaction.editReply('Erro ao verificar changelogs. Tente novamente mais tarde.');
    }
}

async function handleStatus(interaction) {
    const stats = changelogStorage.getStats();
    const llmConfig = llmService.getConfig();
    const guildChannelId = changelogStorage.getGuildChannel(interaction.guildId);

    const llmStatus = llmConfig.available
        ? `✅ ${llmConfig.provider} (${llmConfig.model})`
        : '❌ Não configurado';

    const allChannels = changelogStorage.getGuildChannels();
    const totalGuilds = Object.keys(allChannels).length;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📊 Status do Changelog Monitor')
        .addFields(
            { name: 'Changelogs processados', value: `${stats.processedCount}`, inline: true },
            { name: 'Última verificação', value: stats.lastCheck || 'Nunca', inline: true },
            { name: 'Servidor filtrado', value: stats.config.serverFilter || 'LATAM', inline: true },
            { name: 'Auto-post', value: stats.config.autoPost ? '✅ Ativado' : '❌ Desativado', inline: true },
            { name: 'Canal (este servidor)', value: guildChannelId ? `<#${guildChannelId}>` : 'Não definido', inline: true },
            { name: 'Servidores configurados', value: `${totalGuilds}`, inline: true },
            { name: '🤖 LLM', value: llmStatus, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'BeeWiki • Changelog Monitor' });

    await interaction.reply({ embeds: [embed] });
}

async function handleSetChannel(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: 'Você precisa da permissão "Gerenciar Canais" para usar este comando.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('canal');
    const guildId = interaction.guildId;

    changelogStorage.setGuildChannel(guildId, channel.id);

    await interaction.reply(`Canal de changelog deste servidor definido para ${channel}. Novos changelogs LATAM serão postados automaticamente aqui.`);
}

async function handleGenerate(interaction) {
    await interaction.deferReply();

    const url = interaction.options.getString('url');

    if (!url.includes('divine-pride.net/forum')) {
        return interaction.editReply('URL inválida. Use uma URL de tópico do fórum Divine Pride.');
    }

    try {
        const content = await dpForum.fetchTopicContent(url);

        if (!content) {
            return interaction.editReply('Não foi possível obter o conteúdo do tópico.');
        }

        const parsed = dpForum.parseChangelogHTML(content.html);
        content.html = null;
        await dpForum.deduplicateChangelog(parsed);

        const topicMeta = {
            title: 'LATAM Changelog',
            url,
            date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
        };

        let analysis = null;
        if (llmService.isAvailable()) {
            try {
                analysis = await summaryGenerator.generateLLMAnalysis(parsed, topicMeta);
            } catch (err) {
                logger.warn('LLM analysis failed in /changelog gerar', { error: err.message });
            }
        }

        const pages = summaryGenerator.buildChangelogEmbeds(parsed, topicMeta, analysis);

        const topicIdMatch = url.match(/\/topic\/(\d+)-/);
        const topicId = topicIdMatch ? topicIdMatch[1] : '';

        changelogStorage.setLastChangelog({
            topicId,
            topicMeta,
            pages
        });

        await sendPaginatedEmbed(interaction, pages);

        if (topicId) {
            changelogStorage.markProcessed(topicId, {
                title: topicMeta.title,
                url,
                stats: summaryGenerator.getChangelogStats(parsed)
            });
        }
    } catch (error) {
        logger.error('Error generating changelog summary', { error: error.message, url });
        await interaction.editReply('Erro ao gerar resumo do changelog.');
    }
}

module.exports = { data, execute };
