/**
 * Deploy Commands Script
 * Registers slash commands with Discord
 * Run this script once to register commands globally or to a specific guild
 */

const { REST, Routes } = require('discord.js');
const config = require('./config');
const InteractionHandler = require('./handlers/interactionHandler');
const logger = require('./utils/logger');

// Determine if deploying to a specific guild (for testing) or globally
const GUILD_ID = process.env.GUILD_ID; // Optional: set for guild-specific commands (faster updates)
const DEPLOY_GLOBALLY = !GUILD_ID; // Deploy globally if no GUILD_ID is set

async function deployCommands() {
    // Validate token
    if (!config.discord.token) {
        logger.error('DISCORD_TOKEN is required. Set it in .env file or as environment variable.');
        process.exit(1);
    }

    // Basic token validation (just check it's not empty and has reasonable length)
    if (config.discord.token.trim().length < 50) {
        logger.error('DISCORD_TOKEN appears to be too short. Please check your token in the .env file.');
        logger.info('A valid Discord bot token is typically 59+ characters long.');
        process.exit(1);
    }

    const interactionHandler = new InteractionHandler();
    const commands = interactionHandler.getCommandsData();

    const rest = new REST({ version: '10' }).setToken(config.discord.token);

    try {
        logger.info('Validating token and retrieving Application ID...');

        // Get Application ID automatically from the token
        let clientId;
        try {
            const botInfo = await rest.get(Routes.oauth2CurrentApplication());
            clientId = botInfo.id;
            logger.info('Token validated successfully', { 
                applicationName: botInfo.name,
                applicationId: clientId
            });
        } catch (verifyError) {
            logger.error('Failed to verify token. The token may be invalid or expired.');
            logger.error('Please check your DISCORD_TOKEN in the .env file.');
            logger.error('Get a new token from: https://discord.com/developers/applications -> Your Application -> Bot -> Reset Token');
            
            if (verifyError.code === 401 || verifyError.status === 401) {
                logger.error('The token is invalid or has been revoked.');
            }
            
            process.exit(1);
        }

        // If CLIENT_ID is provided in .env, verify it matches
        const envClientId = process.env.CLIENT_ID || config.discord.clientId;
        if (envClientId && envClientId !== clientId) {
            logger.warn('CLIENT_ID in .env does not match the token\'s Application ID.');
            logger.warn(`CLIENT_ID in .env: ${envClientId}`);
            logger.warn(`Application ID from token: ${clientId}`);
            logger.info('Using Application ID from token (CLIENT_ID in .env is optional and will be ignored).');
        }

        logger.info('Started refreshing application (/) commands.', {
            commandCount: commands.length,
            deployGlobally: DEPLOY_GLOBALLY,
            clientId: clientId
        });

        let data;

        if (DEPLOY_GLOBALLY) {
            // Deploy commands globally (takes up to 1 hour to propagate)
            data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands }
            );
            logger.info('Commands deployed globally. They may take up to 1 hour to appear in all servers.');
        } else {
            // Deploy commands to a specific guild (instant updates)
            data = await rest.put(
                Routes.applicationGuildCommands(clientId, GUILD_ID),
                { body: commands }
            );
            logger.info(`Commands deployed to guild ${GUILD_ID}. They should appear immediately.`);
        }

        logger.info('Successfully reloaded application (/) commands.', {
            commandCount: data.length
        });
    } catch (error) {
        logger.error('Error deploying commands', { 
            error: error.message, 
            code: error.code,
            status: error.status 
        });
        
        // Handle specific error codes
        if (error.code === 401 || error.status === 401) {
            logger.error('❌ 401 Unauthorized - Authentication failed');
            logger.error('Possible causes:');
            logger.error('1. DISCORD_TOKEN is incorrect or expired');
            logger.error('2. Token was reset in Discord Developer Portal');
            logger.error('3. Token does not have required permissions');
            logger.info('');
            logger.info('Solutions:');
            logger.info('1. Verify DISCORD_TOKEN in .env matches the token in Discord Developer Portal');
            logger.info('2. If token was reset, update DISCORD_TOKEN in .env');
            logger.info('3. Get new token: https://discord.com/developers/applications -> Your App -> Bot -> Reset Token');
        } else if (error.code === 50001) {
            logger.error('Missing Access: Make sure the bot has been invited to the server with the applications.commands scope.');
        } else if (error.code === 10004) {
            logger.error('Unknown Application: The Application ID could not be found.');
        } else if (error.code === 50035) {
            logger.error('Invalid Form Body: One or more commands have invalid data.');
        }
        
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    deployCommands();
}

module.exports = { deployCommands };

