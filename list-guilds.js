/**
 * List Guilds Script
 * Lists all guilds (servers) where the bot is a member
 * Use this to get the GUILD_ID for immediate command deployment
 */

const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

client.once('clientReady', () => {
    logger.info('Bot is ready. Listing guilds...\n');
    
    const guilds = client.guilds.cache;
    
    if (guilds.size === 0) {
        logger.warn('Bot is not a member of any servers.');
        process.exit(0);
    }
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 Servidores onde o bot está presente:');
    console.log('═══════════════════════════════════════════════════════\n');
    
    guilds.forEach((guild, index) => {
        console.log(`${index + 1}. ${guild.name}`);
        console.log(`   ID: ${guild.id}`);
        console.log(`   Membros: ${guild.memberCount}`);
        console.log(`   Para deploy imediato, adicione ao .env:`);
        console.log(`   GUILD_ID=${guild.id}\n`);
    });
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('💡 Dica: Adicione GUILD_ID ao .env e execute npm run deploy');
    console.log('   Os comandos aparecerão imediatamente no servidor!');
    console.log('═══════════════════════════════════════════════════════\n');
    
    client.destroy();
    process.exit(0);
});

client.login(config.discord.token).catch((error) => {
    logger.error('Failed to login to Discord', { error: error.message });
    process.exit(1);
});

