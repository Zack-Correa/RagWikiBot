/**
 * Slash Command: /conta
 * Manages shared Ragnarok accounts with TOTP
 * Subcommands: ver, criar, editar, deletar, permissao, listar
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const storage = require('../storage');
const qrReader = require('../qrReader');

// Colors
const COLORS = {
    PRIMARY: 0x5865F2,
    SUCCESS: 0x57F287,
    WARNING: 0xFEE75C,
    ERROR: 0xED4245
};

let pluginLogger = null;

/**
 * Sets the logger for this command
 */
function setLogger(logger) {
    pluginLogger = logger;
}

const command = {
    data: new SlashCommandBuilder()
        .setName('conta')
        .setDescription('Gerencia contas compartilhadas de Ragnarok')
        
        // Subcommand: ver (view credentials)
        .addSubcommand(subcommand =>
            subcommand
                .setName('ver')
                .setDescription('Solicita credenciais de uma conta (enviado via DM)')
                .addStringOption(option =>
                    option
                        .setName('nome')
                        .setDescription('Nome da conta')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addBooleanOption(option =>
                    option
                        .setName('mostrar-otp')
                        .setDescription('Incluir código OTP na mensagem (padrão: sim)')
                        .setRequired(false)
                )
        )
        
        // Subcommand: listar (list accessible accounts)
        .addSubcommand(subcommand =>
            subcommand
                .setName('listar')
                .setDescription('Lista as contas que você tem acesso')
        )
        
        // Subcommand: criar (create account)
        .addSubcommand(subcommand =>
            subcommand
                .setName('criar')
                .setDescription('Cria uma nova conta compartilhada (você será o dono)')
                .addStringOption(option =>
                    option
                        .setName('nome')
                        .setDescription('Nome/descrição da conta')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('login')
                        .setDescription('Login da conta')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('servidor')
                        .setDescription('Servidor')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Freya', value: 'FREYA' },
                            { name: 'Nidhogg', value: 'NIDHOGG' },
                            { name: 'Yggdrasil', value: 'YGGDRASIL' }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('senha')
                        .setDescription('Senha da conta')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('senha-kafra')
                        .setDescription('Senha do armazém Kafra')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('totp-secret')
                        .setDescription('Secret TOTP (código base32 do autenticador)')
                        .setRequired(false)
                )
        )
        
        // Subcommand: editar (edit account - owner or admin)
        .addSubcommand(subcommand =>
            subcommand
                .setName('editar')
                .setDescription('Edita uma conta existente (apenas dono ou admin)')
                .addStringOption(option =>
                    option
                        .setName('conta')
                        .setDescription('Conta a editar')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('campo')
                        .setDescription('Campo a editar')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Nome', value: 'name' },
                            { name: 'Login', value: 'login' },
                            { name: 'Senha', value: 'password' },
                            { name: 'Senha Kafra', value: 'kafraPassword' },
                            { name: 'Secret TOTP', value: 'totpSecret' },
                            { name: 'Servidor', value: 'server' }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('valor')
                        .setDescription('Novo valor')
                        .setRequired(true)
                )
        )
        
        // Subcommand: deletar (delete account - owner or admin)
        .addSubcommand(subcommand =>
            subcommand
                .setName('deletar')
                .setDescription('Remove uma conta compartilhada (apenas dono ou admin)')
                .addStringOption(option =>
                    option
                        .setName('conta')
                        .setDescription('Conta a remover')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        
        // Subcommand: permissao (manage permissions - owner or admin)
        .addSubcommand(subcommand =>
            subcommand
                .setName('permissao')
                .setDescription('Gerencia permissões de uma conta (apenas dono ou admin)')
                .addStringOption(option =>
                    option
                        .setName('conta')
                        .setDescription('Conta')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('acao')
                        .setDescription('Ação')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Adicionar permissão', value: 'add' },
                            { name: 'Remover permissão', value: 'remove' },
                            { name: 'Listar permissões', value: 'list' }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('tipo')
                        .setDescription('Tipo de permissão')
                        .setRequired(false)
                        .addChoices(
                            { name: 'ID do Usuário', value: 'userId' },
                            { name: 'Nome de Usuário', value: 'username' },
                            { name: 'Cargo (Role)', value: 'roleId' }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('valor')
                        .setDescription('ID do usuário, nome de usuário ou ID do cargo')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('permissao')
                        .setDescription('Permitir ou negar acesso')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Permitir', value: 'allow' },
                            { name: 'Negar (blacklist)', value: 'deny' }
                        )
                )
                .addUserOption(option =>
                    option
                        .setName('usuario')
                        .setDescription('Usuário (alternativa ao valor manual)')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option
                        .setName('cargo')
                        .setDescription('Cargo (alternativa ao valor manual)')
                        .setRequired(false)
                )
        )
        
        // Subcommand: totp (configure TOTP via QR Code in DM)
        .addSubcommand(subcommand =>
            subcommand
                .setName('totp')
                .setDescription('Configura TOTP via QR Code (enviado de forma segura via DM)')
                .addStringOption(option =>
                    option
                        .setName('conta')
                        .setDescription('Conta para configurar o TOTP')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    /**
     * Handles autocomplete for account names
     */
    async autocomplete(interaction) {
        try {
            const focusedOption = interaction.options.getFocused(true);
            const subcommand = interaction.options.getSubcommand();
            const member = interaction.member;
            const isAdmin = member?.permissions?.has(PermissionFlagsBits.Administrator);
            const userId = interaction.user.id;
            
            let accounts = [];
            
            // For owner/admin commands (editar, deletar, permissao, totp)
            if (['editar', 'deletar', 'permissao', 'totp'].includes(subcommand)) {
                const allAccounts = storage.getAllAccounts();
                // Show all accounts for admins, or only owned accounts for regular users
                if (isAdmin) {
                    accounts = allAccounts;
                } else {
                    accounts = allAccounts.filter(acc => acc.ownerId === userId);
                }
            } 
            // For 'ver' command - show accessible accounts (including owned)
            else if (focusedOption.name === 'nome' || focusedOption.name === 'conta') {
                const roleIds = member?.roles?.cache?.map(role => role.id) || [];
                accounts = storage.getAccessibleAccounts({
                    userId,
                    username: interaction.user.username,
                    roleIds
                });
            }
            
            const focusedValue = focusedOption.value.toLowerCase();
            const filtered = accounts
                .filter(account => account.name.toLowerCase().includes(focusedValue))
                .slice(0, 25);
            
            await interaction.respond(
                filtered.map(account => ({
                    name: `${account.name} (${account.server})`,
                    value: account.id
                }))
            );
        } catch (error) {
            if (pluginLogger) {
                pluginLogger.error('Error in conta autocomplete', { error: error.message });
            }
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'ver':
                return handleVer(interaction);
            case 'listar':
                return handleListar(interaction);
            case 'criar':
                return handleCriar(interaction);
            case 'editar':
                return handleEditar(interaction);
            case 'deletar':
                return handleDeletar(interaction);
            case 'permissao':
                return handlePermissao(interaction);
            case 'totp':
                return handleTotp(interaction);
            default:
                return interaction.reply({ content: '❌ Subcomando desconhecido.', ephemeral: true });
        }
    }
};

/**
 * Handle /conta ver - View credentials
 */
async function handleVer(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const accountId = interaction.options.getString('nome');
    const showOtp = interaction.options.getBoolean('mostrar-otp') ?? true;
    const member = interaction.member;

    try {
        const roleIds = member?.roles?.cache?.map(role => role.id) || [];

        const permissionResult = storage.checkPermission(accountId, {
            userId: interaction.user.id,
            username: interaction.user.username,
            roleIds
        });

        if (!permissionResult.allowed) {
            if (pluginLogger) {
                pluginLogger.warn('Account access denied', {
                    accountId,
                    userId: interaction.user.id,
                    username: interaction.user.username,
                    reason: permissionResult.reason
                });
            }

            return interaction.editReply({
                content: `❌ **Acesso negado**\n${permissionResult.reason}`
            });
        }

        const credentials = storage.getDecryptedCredentials(accountId);

        if (!credentials) {
            return interaction.editReply({
                content: '❌ Erro ao obter credenciais. Conta não encontrada ou erro de descriptografia.'
            });
        }

        let totpInfo = null;
        if (showOtp && credentials.totpSecret) {
            totpInfo = storage.generateTOTP(accountId);
        }

        storage.logAccess(accountId, interaction.user.id, interaction.user.username, 'credentials_requested');

        const embed = createCredentialsEmbed(credentials, totpInfo, showOtp);

        try {
            const dmChannel = await interaction.user.createDM();
            const dmMessage = await dmChannel.send({ embeds: [embed] });

            await interaction.editReply({
                content: '✅ **Credenciais enviadas!**\nVerifique sua DM (mensagem privada).'
            });

            if (pluginLogger) {
                pluginLogger.info('Account credentials sent via DM', {
                    accountId,
                    accountName: credentials.name,
                    userId: interaction.user.id,
                    username: interaction.user.username
                });
            }

            // Auto-update TOTP codes continuously for 3 minutes
            if (showOtp && credentials.totpSecret) {
                await autoUpdateTotpMessage(dmMessage, credentials, accountId);
            }

        } catch (dmError) {
            if (pluginLogger) {
                pluginLogger.warn('Could not send DM', { userId: interaction.user.id, error: dmError.message });
            }

            await interaction.editReply({
                content: '⚠️ **Não foi possível enviar DM** (suas mensagens privadas estão desativadas).\n\nCredenciais abaixo (apenas você pode ver):',
                embeds: [embed]
            });
        }

    } catch (error) {
        if (pluginLogger) {
            pluginLogger.error('Error executing conta ver', { accountId, userId: interaction.user.id, error: error.message });
        }

        return interaction.editReply({
            content: '❌ Ocorreu um erro ao processar sua solicitação. Tente novamente.'
        });
    }
}

/**
 * Auto-updates the TOTP code in a DM message continuously for 3 minutes
 * Updates every 5 seconds to show the countdown timer and progress bar in real time
 * @param {Message} message - Discord message to update
 * @param {Object} credentials - Account credentials
 * @param {string} accountId - Account ID
 */
async function autoUpdateTotpMessage(message, credentials, accountId) {
    const DURATION_MS = 3 * 60 * 1000; // 3 minutes
    const UPDATE_INTERVAL_MS = 10000;   // Update every 10 seconds
    const startTime = Date.now();
    let isEditing = false;

    const updateLoop = async () => {
        // Prevent overlapping edits
        if (isEditing) return;
        
        try {
            const elapsed = Date.now() - startTime;
            
            // Check if time is up
            if (elapsed >= DURATION_MS) {
                isEditing = true;
                const totpInfo = storage.generateTOTP(accountId);
                const finalEmbed = createCredentialsEmbed(credentials, totpInfo, true);
                finalEmbed.setFooter({ 
                    text: `⏹️ Atualização automática encerrada • ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` 
                });
                
                try {
                    await message.edit({ embeds: [finalEmbed] });
                } catch (editError) {
                    // Message might be deleted, ignore
                }
                isEditing = false;
                return;
            }

            const totpInfo = storage.generateTOTP(accountId);
            
            if (!totpInfo) {
                // TOTP generation failed, try again next cycle
                setTimeout(updateLoop, UPDATE_INTERVAL_MS);
                return;
            }

            isEditing = true;
            
            const updatedEmbed = createCredentialsEmbed(credentials, totpInfo, true);
            
            // Calculate remaining time
            const remainingMs = DURATION_MS - elapsed;
            const remainingMin = Math.floor(remainingMs / 60000);
            const remainingSec = Math.ceil((remainingMs % 60000) / 1000);
            const remainingStr = remainingMin > 0 
                ? `${remainingMin}m ${remainingSec}s` 
                : `${remainingSec}s`;
            
            updatedEmbed.setFooter({ 
                text: `🔄 Atualizando a cada 10s (${remainingStr} restantes) • ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` 
            });

            try {
                await message.edit({ embeds: [updatedEmbed] });
            } catch (editError) {
                // Message might be deleted, stop updating
                isEditing = false;
                return;
            }
            
            isEditing = false;

            // Schedule next update
            setTimeout(updateLoop, UPDATE_INTERVAL_MS);

        } catch (error) {
            isEditing = false;
            if (pluginLogger) {
                pluginLogger.error('Error in autoUpdateTotpMessage', { error: error.message });
            }
            // Try to continue even after errors
            const elapsed = Date.now() - startTime;
            if (elapsed < DURATION_MS) {
                setTimeout(updateLoop, UPDATE_INTERVAL_MS);
            }
        }
    };

    // Start the update loop after the first interval
    setTimeout(updateLoop, UPDATE_INTERVAL_MS);
}

/**
 * Handle /conta listar - List accessible accounts
 */
async function handleListar(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    const roleIds = member?.roles?.cache?.map(role => role.id) || [];

    const accounts = storage.getAccessibleAccounts({
        userId: interaction.user.id,
        username: interaction.user.username,
        roleIds
    });

    if (accounts.length === 0) {
        return interaction.editReply({
            content: '📋 Você não tem acesso a nenhuma conta compartilhada.'
        });
    }

    const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle('📋 Suas Contas Compartilhadas')
        .setDescription(`Você tem acesso a **${accounts.length}** conta(s).\nUse \`/conta ver\` para obter as credenciais.`)
        .setTimestamp();

    const accountList = accounts.map((acc, i) => `**${i + 1}.** ${acc.name} \`(${acc.server})\``).join('\n');
    embed.addFields({ name: 'Contas', value: accountList || 'Nenhuma', inline: false });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Handle /conta criar - Create account (anyone can create, they become the owner)
 */
async function handleCriar(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.options.getString('nome');
    const login = interaction.options.getString('login');
    const server = interaction.options.getString('servidor') || 'FREYA';
    const password = interaction.options.getString('senha') || '';
    const kafraPassword = interaction.options.getString('senha-kafra') || '';
    const totpSecret = interaction.options.getString('totp-secret') || '';

    try {
        const account = storage.createAccount({
            name,
            login,
            password,
            kafraPassword,
            totpSecret,
            server,
            ownerId: interaction.user.id
        });

        if (pluginLogger) {
            pluginLogger.info('Account created via command', {
                accountId: account.id,
                name: account.name,
                createdBy: interaction.user.id
            });
        }

        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle('✅ Conta Criada')
            .addFields(
                { name: 'Nome', value: account.name, inline: true },
                { name: 'Login', value: account.login, inline: true },
                { name: 'Servidor', value: account.server, inline: true },
                { name: 'Dono', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Senha', value: account.hasPassword ? '✓ Definida' : '✗ Não definida', inline: true },
                { name: 'Kafra', value: account.hasKafraPassword ? '✓ Definida' : '✗ Não definida', inline: true },
                { name: 'TOTP', value: account.hasTotpSecret ? '✓ Configurado' : '✗ Não configurado', inline: true }
            )
            .setFooter({ text: `ID: ${account.id}` })
            .setTimestamp();

        return interaction.editReply({
            content: '🔐 Conta criada com sucesso! Você é o dono desta conta e pode editá-la/deletá-la.\nUse `/conta permissao` para adicionar permissões de acesso a outros usuários.',
            embeds: [embed]
        });

    } catch (error) {
        if (pluginLogger) {
            pluginLogger.error('Error creating account via command', { error: error.message });
        }
        return interaction.editReply({ content: `❌ Erro ao criar conta: ${error.message}` });
    }
}

/**
 * Handle /conta editar - Edit account (owner or admin only)
 */
async function handleEditar(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const accountId = interaction.options.getString('conta');
    const field = interaction.options.getString('campo');
    const value = interaction.options.getString('valor');

    // Check if user is owner or admin
    const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    const isOwner = storage.isAccountOwner(accountId, interaction.user.id);
    
    if (!isOwner && !isAdmin) {
        return interaction.editReply({ content: '❌ Apenas o dono da conta ou administradores podem editar.' });
    }

    try {
        const updates = { [field]: value };
        const account = storage.updateAccount(accountId, updates);

        if (pluginLogger) {
            pluginLogger.info('Account updated via command', {
                accountId,
                field,
                updatedBy: interaction.user.id
            });
        }

        return interaction.editReply({
            content: `✅ **Conta atualizada!**\n**${account.name}**: campo \`${field}\` foi alterado.`
        });

    } catch (error) {
        if (pluginLogger) {
            pluginLogger.error('Error updating account via command', { error: error.message });
        }
        return interaction.editReply({ content: `❌ Erro ao editar conta: ${error.message}` });
    }
}

/**
 * Handle /conta deletar - Delete account (owner or admin only)
 */
async function handleDeletar(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const accountId = interaction.options.getString('conta');

    try {
        const account = storage.getAccount(accountId);
        if (!account) {
            return interaction.editReply({ content: '❌ Conta não encontrada.' });
        }

        // Check if user is owner or admin
        const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
        const isOwner = storage.isAccountOwner(accountId, interaction.user.id);
        
        if (!isOwner && !isAdmin) {
            return interaction.editReply({ content: '❌ Apenas o dono da conta ou administradores podem deletar.' });
        }

        const deleted = storage.deleteAccount(accountId);

        if (deleted) {
            if (pluginLogger) {
                pluginLogger.info('Account deleted via command', {
                    accountId,
                    accountName: account.name,
                    deletedBy: interaction.user.id
                });
            }

            return interaction.editReply({
                content: `✅ **Conta removida!**\nA conta **${account.name}** foi deletada permanentemente.`
            });
        } else {
            return interaction.editReply({ content: '❌ Erro ao deletar conta.' });
        }

    } catch (error) {
        if (pluginLogger) {
            pluginLogger.error('Error deleting account via command', { error: error.message });
        }
        return interaction.editReply({ content: `❌ Erro ao deletar conta: ${error.message}` });
    }
}

/**
 * Handle /conta permissao - Manage permissions (owner or admin only)
 */
async function handlePermissao(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const accountId = interaction.options.getString('conta');
    const action = interaction.options.getString('acao');

    const account = storage.getAccount(accountId);
    if (!account) {
        return interaction.editReply({ content: '❌ Conta não encontrada.' });
    }

    // Check if user is owner or admin
    const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    const isOwner = storage.isAccountOwner(accountId, interaction.user.id);
    
    if (!isOwner && !isAdmin) {
        return interaction.editReply({ content: '❌ Apenas o dono da conta ou administradores podem gerenciar permissões.' });
    }

    try {
        // List permissions
        if (action === 'list') {
            const permissions = account.permissions || [];
            
            if (permissions.length === 0) {
                return interaction.editReply({
                    content: `📋 **Permissões de ${account.name}**\n\nNenhuma permissão configurada.`
                });
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.PRIMARY)
                .setTitle(`🔒 Permissões: ${account.name}`)
                .setTimestamp();

            const allowList = permissions.filter(p => p.action === 'allow');
            const denyList = permissions.filter(p => p.action === 'deny');

            if (allowList.length > 0) {
                const allowText = allowList.map(p => {
                    const typeIcon = { userId: '👤', username: '📝', roleId: '🎭' }[p.type] || '❓';
                    return `${typeIcon} \`${p.value}\` (${p.type})`;
                }).join('\n');
                embed.addFields({ name: '✅ Permitidos', value: allowText, inline: false });
            }

            if (denyList.length > 0) {
                const denyText = denyList.map(p => {
                    const typeIcon = { userId: '👤', username: '📝', roleId: '🎭' }[p.type] || '❓';
                    return `${typeIcon} \`${p.value}\` (${p.type})`;
                }).join('\n');
                embed.addFields({ name: '❌ Bloqueados', value: denyText, inline: false });
            }

            return interaction.editReply({ embeds: [embed] });
        }

        // Add or remove permission
        let type = interaction.options.getString('tipo');
        let value = interaction.options.getString('valor');
        const permAction = interaction.options.getString('permissao') || 'allow';

        // Check for user/role options
        const userOption = interaction.options.getUser('usuario');
        const roleOption = interaction.options.getRole('cargo');

        if (userOption) {
            type = 'userId';
            value = userOption.id;
        } else if (roleOption) {
            type = 'roleId';
            value = roleOption.id;
        }

        if (action === 'add') {
            if (!type || !value) {
                return interaction.editReply({
                    content: '❌ Para adicionar permissão, informe o tipo e valor, ou selecione um usuário/cargo.'
                });
            }

            const permission = storage.addPermission(accountId, type, value, permAction);

            if (pluginLogger) {
                pluginLogger.info('Permission added via command', {
                    accountId,
                    type,
                    value,
                    action: permAction,
                    addedBy: interaction.user.id
                });
            }

            const actionText = permAction === 'allow' ? '✅ permitido' : '❌ bloqueado';
            return interaction.editReply({
                content: `✅ **Permissão adicionada!**\n\`${value}\` agora está ${actionText} na conta **${account.name}**.`
            });
        }

        if (action === 'remove') {
            if (!type || !value) {
                return interaction.editReply({
                    content: '❌ Para remover permissão, informe o tipo e valor, ou selecione um usuário/cargo.'
                });
            }

            // Find the permission to remove
            const permissions = account.permissions || [];
            const perm = permissions.find(p => p.type === type && p.value === value);

            if (!perm) {
                return interaction.editReply({
                    content: `❌ Permissão não encontrada para \`${value}\`.`
                });
            }

            const removed = storage.removePermission(accountId, perm.id);

            if (removed) {
                if (pluginLogger) {
                    pluginLogger.info('Permission removed via command', {
                        accountId,
                        type,
                        value,
                        removedBy: interaction.user.id
                    });
                }

                return interaction.editReply({
                    content: `✅ **Permissão removida!**\n\`${value}\` não tem mais acesso configurado na conta **${account.name}**.`
                });
            } else {
                return interaction.editReply({ content: '❌ Erro ao remover permissão.' });
            }
        }

    } catch (error) {
        if (pluginLogger) {
            pluginLogger.error('Error managing permissions via command', { error: error.message });
        }
        return interaction.editReply({ content: `❌ Erro: ${error.message}` });
    }
}

/**
 * Creates an embed with account credentials
 */
function createCredentialsEmbed(credentials, totpInfo, showOtp) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`🔐 Conta: ${credentials.name}`)
        .setDescription('**⚠️ ATENÇÃO:** Estas credenciais são confidenciais. Não compartilhe com ninguém!')
        .setTimestamp();

    embed.addFields(
        { name: '🌐 Servidor', value: credentials.server || 'Não definido', inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: '\u200B', value: '\u200B', inline: true }
    );

    embed.addFields(
        { name: '👤 Login', value: `\`${credentials.login}\``, inline: true },
        { name: '🔑 Senha', value: `\`${credentials.password || 'Não definida'}\``, inline: true },
        { name: '🏦 Senha Kafra', value: `\`${credentials.kafraPassword || 'Não definida'}\``, inline: true }
    );

    if (showOtp) {
        if (totpInfo) {
            const progressBar = createTotpProgressBar(totpInfo.remainingSeconds);
            embed.addFields({
                name: '🔢 Código OTP (2FA)',
                value: `\`\`\`\n${totpInfo.code}\n\`\`\`\n${progressBar}\n⏱️ Expira em **${totpInfo.remainingSeconds}** segundos`,
                inline: false
            });
        } else if (credentials.totpSecret) {
            embed.addFields({
                name: '🔢 Código OTP (2FA)',
                value: '❌ Erro ao gerar código OTP',
                inline: false
            });
        } else {
            embed.addFields({
                name: '🔢 Código OTP (2FA)',
                value: '⚠️ Esta conta não tem TOTP configurado',
                inline: false
            });
        }
    }

    embed.setFooter({
        text: `Solicitado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
    });

    return embed;
}

/**
 * Creates a visual progress bar for TOTP expiration
 */
function createTotpProgressBar(remainingSeconds) {
    const totalSeconds = 30;
    const filledCount = Math.ceil((remainingSeconds / totalSeconds) * 10);
    const emptyCount = 10 - filledCount;
    
    const filled = '🟩'.repeat(filledCount);
    const empty = '⬜'.repeat(emptyCount);
    
    return `${filled}${empty}`;
}

/**
 * Handle /conta totp - Configure TOTP via QR Code in DM (owner or admin only)
 */
async function handleTotp(interaction) {
    const accountId = interaction.options.getString('conta');
    
    // Get account info first
    const account = storage.getAccount(accountId);
    if (!account) {
        return interaction.reply({ content: '❌ Conta não encontrada.', ephemeral: true });
    }
    
    // Check if user is owner or admin
    const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    const isOwner = storage.isAccountOwner(accountId, interaction.user.id);
    
    if (!isOwner && !isAdmin) {
        return interaction.reply({ content: '❌ Apenas o dono da conta ou administradores podem configurar TOTP.', ephemeral: true });
    }
    
    // Reply ephemeral in the channel
    await interaction.reply({
        content: `🔐 **Configuração de TOTP para "${account.name}"**\n\n📩 Verifique sua **DM** para enviar o QR Code de forma segura.\n\n*A imagem do QR Code não deve ser compartilhada publicamente!*`,
        ephemeral: true
    });
    
    try {
        // Send DM to the user
        const dmChannel = await interaction.user.createDM();
        
        const dmEmbed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle('🔐 Configuração de TOTP')
            .setDescription(`Você solicitou configurar o TOTP para a conta **${account.name}**.\n\n**Envie a imagem do QR Code** do Google Authenticator (ou app similar) aqui nesta DM.\n\n⏱️ Você tem **2 minutos** para enviar a imagem.`)
            .addFields(
                { name: '📋 Conta', value: account.name, inline: true },
                { name: '🌐 Servidor', value: account.server, inline: true }
            )
            .setFooter({ text: 'A imagem será processada e apagada imediatamente após a leitura.' });
        
        await dmChannel.send({ embeds: [dmEmbed] });
        
        // Wait for user to send an image
        const filter = (msg) => {
            return msg.author.id === interaction.user.id && 
                   (msg.attachments.size > 0 || msg.content.toLowerCase() === 'cancelar');
        };
        
        const collected = await dmChannel.awaitMessages({
            filter,
            max: 1,
            time: 120000, // 2 minutes
            errors: ['time']
        });
        
        const message = collected.first();
        
        // Check if user cancelled
        if (message.content.toLowerCase() === 'cancelar') {
            return dmChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(COLORS.WARNING)
                        .setTitle('❌ Cancelado')
                        .setDescription('Configuração de TOTP cancelada.')
                ]
            });
        }
        
        // Get the image attachment
        const attachment = message.attachments.first();
        
        if (!attachment) {
            return dmChannel.send({
                content: '❌ Nenhuma imagem encontrada. Use `/conta totp` novamente para tentar de novo.'
            });
        }
        
        // Check if it's an image
        if (!attachment.contentType?.startsWith('image/')) {
            return dmChannel.send({
                content: '❌ O arquivo enviado não é uma imagem. Envie uma imagem do QR Code.'
            });
        }
        
        // Process the QR Code
        const processingMsg = await dmChannel.send({
            content: '⏳ Processando QR Code...'
        });
        
        const result = await qrReader.processQRCode(attachment.url);
        
        if (!result.success) {
            await processingMsg.edit({
                content: `❌ **Erro:** ${result.error}\n\nUse \`/conta totp\` para tentar novamente.`
            });
            return;
        }
        
        // Update the account with the TOTP secret
        try {
            storage.updateAccount(accountId, {
                totpSecret: result.data.secret
            });
            
            if (pluginLogger) {
                pluginLogger.info('TOTP configured via QR Code', {
                    accountId,
                    accountName: account.name,
                    userId: interaction.user.id,
                    issuer: result.data.issuer || 'unknown'
                });
            }
            
            // Build success message
            const successEmbed = new EmbedBuilder()
                .setColor(COLORS.SUCCESS)
                .setTitle('✅ TOTP Configurado com Sucesso!')
                .setDescription(`O autenticador foi configurado para a conta **${account.name}**.`)
                .addFields(
                    { name: '📋 Conta', value: account.name, inline: true },
                    { name: '🌐 Servidor', value: account.server, inline: true }
                );
            
            if (result.data.issuer) {
                successEmbed.addFields({ name: '🏢 Emissor', value: result.data.issuer, inline: true });
            }
            
            if (result.data.label) {
                successEmbed.addFields({ name: '🏷️ Label', value: result.data.label, inline: true });
            }
            
            successEmbed
                .addFields({ name: '🔒 Segurança', value: 'O secret foi criptografado e armazenado de forma segura.' })
                .setFooter({ text: 'Use /conta ver para obter o código OTP quando precisar.' });
            
            // Generate a test code to show it's working
            const testTotp = storage.generateTOTP(accountId);
            if (testTotp) {
                successEmbed.addFields({
                    name: '🔢 Código de Teste',
                    value: `\`${testTotp.code}\` (expira em ${testTotp.remainingSeconds}s)`,
                    inline: false
                });
            }
            
            await processingMsg.edit({
                content: null,
                embeds: [successEmbed]
            });
            
        } catch (updateError) {
            if (pluginLogger) {
                pluginLogger.error('Error updating account with TOTP', { error: updateError.message });
            }
            await processingMsg.edit({
                content: `❌ Erro ao salvar TOTP: ${updateError.message}`
            });
        }
        
    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR' || error.message?.includes('time')) {
            // Timeout
            try {
                const dmChannel = await interaction.user.createDM();
                await dmChannel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.WARNING)
                            .setTitle('⏱️ Tempo Esgotado')
                            .setDescription('Você não enviou a imagem a tempo.\nUse `/conta totp` novamente para tentar de novo.')
                    ]
                });
            } catch (dmError) {
                // Ignore DM errors
            }
            return;
        }
        
        if (error.code === 50007) {
            // Cannot send DM
            return interaction.followUp({
                content: '❌ Não foi possível enviar uma DM. Verifique se suas DMs estão abertas para este servidor.',
                ephemeral: true
            });
        }
        
        if (pluginLogger) {
            pluginLogger.error('Error in handleTotp', { error: error.message });
        }
        
        // Try to inform the user
        try {
            const dmChannel = await interaction.user.createDM();
            await dmChannel.send({
                content: `❌ Ocorreu um erro: ${error.message}`
            });
        } catch (dmError) {
            // Ignore
        }
    }
}

module.exports = {
    ...command,
    setLogger
};
