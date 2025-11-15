/**
 * Configuration module for the Discord bot
 * Centralizes all configuration settings
 */

require('dotenv').config();

/**
 * Validates that all required environment variables are set
 * @throws {Error} If any required environment variable is missing
 */
function validateEnv() {
    const required = ['DISCORD_TOKEN'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

// Validate environment on module load
validateEnv();

module.exports = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.CLIENT_ID, // Required for slash commands deployment
        prefix: process.env.DISCORD_PREFIX || '%',
        presence: {
            activity: process.env.DISCORD_ACTIVITY || 'Use /ajuda para ver os comandos disponíveis',
            type: process.env.DISCORD_ACTIVITY_TYPE || 'STREAMING',
            url: process.env.DISCORD_STREAM_URL || 'https://github.com/Zack-Correa/RagWikiBot/tree/dev'
        }
    },
    api: {
        divinePride: {
            apiKey: process.env.DIVINE_PRIDE_API_KEY || '',
            baseUrl: 'https://www.divine-pride.net'
        }
    },
    // Divine Pride sempre usa servidor LATAM
    // Apenas a linguagem pode ser selecionada
    languages: {
        'pt-br': { lang: 'lang=pt', acceptLanguage: 'pt-BR', displayName: 'Português (Brasil)' },
        'en': { lang: undefined, acceptLanguage: 'en-US', displayName: 'English' },
        'es': { lang: 'lang=es', acceptLanguage: 'es-ES', displayName: 'Español' }
    },
    defaultLanguage: 'pt-br'
};

