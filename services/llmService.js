/**
 * Lightweight LLM Service
 * OpenAI-compatible client that works with Gemini, Groq, Ollama, and OpenAI
 * Designed for minimal overhead and fast inference
 */

const axios = require('axios');
const logger = require('../utils/logger');

const PROVIDERS = {
    gemini: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        defaultModel: 'gemini-2.5-flash',
        requiresKey: true
    },
    groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
        requiresKey: true
    },
    ollama: {
        baseUrl: 'http://localhost:11434/v1',
        defaultModel: 'gemma3:4b',
        requiresKey: false
    },
    openai: {
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        requiresKey: true
    },
    custom: {
        baseUrl: null,
        defaultModel: null,
        requiresKey: false
    }
};

let config = {
    provider: null,
    apiKey: null,
    baseUrl: null,
    model: null,
    maxTokens: 2048,
    temperature: 0.7
};

/**
 * Initializes the LLM service from environment variables
 * @returns {boolean} Whether the service was configured successfully
 */
function initialize() {
    const provider = (process.env.LLM_PROVIDER || '').toLowerCase();

    if (!provider || !PROVIDERS[provider]) {
        logger.debug('LLM service not configured (LLM_PROVIDER not set)');
        return false;
    }

    const providerConfig = PROVIDERS[provider];

    if (providerConfig.requiresKey && !process.env.LLM_API_KEY) {
        logger.warn('LLM API key required but not set', { provider });
        return false;
    }

    config = {
        provider,
        apiKey: process.env.LLM_API_KEY || '',
        baseUrl: process.env.LLM_BASE_URL || providerConfig.baseUrl,
        model: process.env.LLM_MODEL || providerConfig.defaultModel,
        maxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 2048,
        temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.7
    };

    logger.info('LLM service initialized', {
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl
    });

    return true;
}

/**
 * Checks if the LLM service is available
 * @returns {boolean}
 */
function isAvailable() {
    return !!config.provider;
}

/**
 * Gets current configuration (without sensitive data)
 * @returns {Object}
 */
function getConfig() {
    return {
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        available: isAvailable()
    };
}

/**
 * Sends a chat completion request
 * @param {Array<{role: string, content: string}>} messages - Chat messages
 * @param {Object} options - Override options
 * @returns {Promise<string>} Generated text
 */
async function chatCompletion(messages, options = {}) {
    if (!isAvailable()) {
        throw new Error('LLM service not configured');
    }

    const model = options.model || config.model;
    const maxTokens = options.maxTokens || config.maxTokens;
    const temperature = options.temperature ?? config.temperature;
    const timeout = options.timeout || 60000;

    const headers = {
        'Content-Type': 'application/json'
    };

    if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const startTime = Date.now();

    try {
        logger.debug('LLM request', {
            provider: config.provider,
            model,
            messageCount: messages.length,
            inputChars: messages.reduce((sum, m) => sum + m.content.length, 0)
        });

        const response = await axios.post(
            `${config.baseUrl}/chat/completions`,
            {
                model,
                messages,
                max_tokens: maxTokens,
                temperature,
                stream: false
            },
            { headers, timeout }
        );

        const elapsed = Date.now() - startTime;
        const result = response.data.choices?.[0]?.message?.content || '';
        const usage = response.data.usage || {};

        logger.info('LLM response', {
            provider: config.provider,
            model,
            elapsedMs: elapsed,
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            outputChars: result.length
        });

        return result;
    } catch (error) {
        const elapsed = Date.now() - startTime;
        logger.error('LLM request failed', {
            provider: config.provider,
            model,
            elapsedMs: elapsed,
            status: error.response?.status,
            error: error.response?.data?.error?.message || error.message
        });
        throw error;
    }
}

/**
 * Simple text generation with a system prompt
 * @param {string} systemPrompt - System instructions
 * @param {string} userPrompt - User input
 * @param {Object} options - Override options
 * @returns {Promise<string>}
 */
async function generate(systemPrompt, userPrompt, options = {}) {
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];
    return chatCompletion(messages, options);
}

// Auto-initialize on load
initialize();

module.exports = {
    initialize,
    isAvailable,
    getConfig,
    chatCompletion,
    generate,
    PROVIDERS
};
