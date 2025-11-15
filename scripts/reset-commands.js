/**
 * Reset Commands Script
 * Removes ALL existing commands (global and guild-specific) and optionally redeploys clean commands
 * 
 * Usage:
 * - Remove only: node scripts/reset-commands.js
 * - Remove and redeploy: node scripts/reset-commands.js --deploy
 * - Remove guild-specific commands: node scripts/reset-commands.js --guild GUILD_ID
 */

const { REST, Routes, Client, GatewayIntentBits } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { deployCommands } = require('./deploy-commands');

// Parse command line arguments
const args = process.argv.slice(2);
const shouldDeploy = args.includes('--deploy');
const guildIdIndex = args.indexOf('--guild');
const specificGuildId = guildIdIndex !== -1 ? args[guildIdIndex + 1] : null;

/**
 * Removes all global commands
 */
async function removeGlobalCommands(rest, clientId) {
    try {
        logger.info('🔍 Buscando comandos globais...');
        const globalCommands = await rest.get(Routes.applicationCommands(clientId));
        
        if (globalCommands.length === 0) {
            logger.info('✅ Nenhum comando global encontrado.');
            return 0;
        }
        
        logger.info(`📋 Encontrados ${globalCommands.length} comandos globais:`);
        globalCommands.forEach(cmd => {
            logger.info(`   - ${cmd.name} (ID: ${cmd.id})`);
        });
        
        logger.info('🗑️  Removendo todos os comandos globais...');
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
        logger.info(`✅ ${globalCommands.length} comandos globais removidos com sucesso!`);
        
        return globalCommands.length;
    } catch (error) {
        logger.error('❌ Erro ao remover comandos globais:', { error: error.message });
        throw error;
    }
}

/**
 * Removes all guild-specific commands from a single guild
 */
async function removeGuildCommands(rest, clientId, guildId) {
    try {
        const guildCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
        
        if (guildCommands.length === 0) {
            return 0;
        }
        
        logger.info(`   📋 Encontrados ${guildCommands.length} comandos:`);
        guildCommands.forEach(cmd => {
            logger.info(`      - ${cmd.name} (ID: ${cmd.id})`);
        });
        
        logger.info('   🗑️  Removendo comandos desta guild...');
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        logger.info(`   ✅ ${guildCommands.length} comandos removidos!`);
        
        return guildCommands.length;
    } catch (error) {
        if (error.code === 50001) {
            logger.warn(`   ⚠️  Sem acesso à guild ${guildId} (bot pode ter sido removido)`);
            return 0;
        }
        logger.error(`   ❌ Erro ao remover comandos da guild ${guildId}:`, { error: error.message });
        return 0;
    }
}

/**
 * Gets all guilds where the bot is a member
 */
async function getBotGuilds() {
    return new Promise((resolve, reject) => {
        const client = new Client({
            intents: [GatewayIntentBits.Guilds]
        });

        client.once('ready', () => {
            const guilds = Array.from(client.guilds.cache.values());
            client.destroy();
            resolve(guilds);
        });

        client.on('error', (error) => {
            logger.error('Erro ao conectar ao Discord:', { error: error.message });
            client.destroy();
            reject(error);
        });

        client.login(config.discord.token).catch((error) => {
            logger.error('Falha ao fazer login no Discord:', { error: error.message });
            reject(error);
        });
    });
}

/**
 * Removes all guild-specific commands from all guilds where the bot is a member
 */
async function removeAllGuildCommands(rest, clientId) {
    try {
        logger.info('🔍 Buscando guilds onde o bot está presente...');
        const guilds = await getBotGuilds();
        
        if (guilds.length === 0) {
            logger.info('✅ Bot não está em nenhuma guild.');
            return 0;
        }
        
        logger.info(`📋 Bot está em ${guilds.length} guild(s). Processando...`);
        
        let totalRemoved = 0;
        for (const guild of guilds) {
            logger.info(`\n🏰 Guild: ${guild.name} (ID: ${guild.id})`);
            const removed = await removeGuildCommands(rest, clientId, guild.id);
            totalRemoved += removed;
        }
        
        logger.info(`\n✅ Total de comandos de guilds removidos: ${totalRemoved}`);
        return totalRemoved;
    } catch (error) {
        logger.error('❌ Erro ao remover comandos de guilds:', { error: error.message });
        throw error;
    }
}

/**
 * Main reset function
 */
async function resetCommands() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🔄 RESET DE COMANDOS DO DISCORD');
    console.log('═══════════════════════════════════════════════════════\n');

    // Validate token
    if (!config.discord.token) {
        logger.error('❌ DISCORD_TOKEN é obrigatório. Configure no arquivo .env');
        process.exit(1);
    }

    if (config.discord.token.trim().length < 50) {
        logger.error('❌ DISCORD_TOKEN parece ser muito curto. Verifique seu token no .env');
        process.exit(1);
    }

    const rest = new REST({ version: '10' }).setToken(config.discord.token);

    try {
        // Get Application ID
        logger.info('🔑 Validando token e obtendo Application ID...');
        const botInfo = await rest.get(Routes.oauth2CurrentApplication());
        const clientId = botInfo.id;
        logger.info('✅ Token validado com sucesso!', {
            applicationName: botInfo.name,
            applicationId: clientId
        });
        console.log('');

        let totalRemoved = 0;

        // Remove commands based on mode
        if (specificGuildId) {
            // Remove from specific guild only
            logger.info(`🎯 Modo: Remover comandos de uma guild específica (${specificGuildId})\n`);
            logger.info(`🏰 Guild ID: ${specificGuildId}`);
            const removed = await removeGuildCommands(rest, clientId, specificGuildId);
            totalRemoved = removed;
        } else {
            // Remove all commands (global + all guilds)
            logger.info('🎯 Modo: Remover TODOS os comandos (globais e de todas as guilds)\n');
            
            // Remove global commands
            const globalRemoved = await removeGlobalCommands(rest, clientId);
            totalRemoved += globalRemoved;
            
            console.log('');
            
            // Remove guild commands
            const guildRemoved = await removeAllGuildCommands(rest, clientId);
            totalRemoved += guildRemoved;
        }

        // Summary
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 RESUMO DO RESET');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`✅ Total de comandos removidos: ${totalRemoved}`);
        console.log('═══════════════════════════════════════════════════════\n');

        // Deploy new commands if requested
        if (shouldDeploy) {
            console.log('═══════════════════════════════════════════════════════');
            console.log('🚀 REGISTRANDO NOVOS COMANDOS');
            console.log('═══════════════════════════════════════════════════════\n');
            
            await deployCommands();
            
            console.log('\n═══════════════════════════════════════════════════════');
            console.log('✅ RESET E DEPLOY CONCLUÍDOS COM SUCESSO!');
            console.log('═══════════════════════════════════════════════════════\n');
        } else {
            console.log('💡 Para registrar os comandos corretos novamente, execute:');
            console.log('   node scripts/reset-commands.js --deploy');
            console.log('   OU');
            console.log('   npm run reset -- --deploy\n');
        }

        process.exit(0);
    } catch (error) {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('❌ ERRO NO RESET DE COMANDOS');
        console.log('═══════════════════════════════════════════════════════');
        logger.error('Erro:', { 
            error: error.message, 
            code: error.code,
            status: error.status 
        });

        // Handle specific error codes
        if (error.code === 401 || error.status === 401) {
            console.log('\n❌ Erro 401: Não autorizado');
            console.log('Possíveis causas:');
            console.log('1. DISCORD_TOKEN está incorreto ou expirado');
            console.log('2. Token foi resetado no Discord Developer Portal');
            console.log('3. Token não tem as permissões necessárias\n');
            console.log('Soluções:');
            console.log('1. Verifique se DISCORD_TOKEN no .env está correto');
            console.log('2. Obtenha um novo token em: https://discord.com/developers/applications');
        } else if (error.code === 50001) {
            console.log('\n❌ Erro: Acesso Negado');
            console.log('Certifique-se de que o bot foi convidado ao servidor com o scope applications.commands');
        }

        console.log('═══════════════════════════════════════════════════════\n');
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    resetCommands();
}

module.exports = { resetCommands };

