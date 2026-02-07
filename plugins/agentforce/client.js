/**
 * Agentforce Client
 * REST client for Salesforce Agentforce API
 * Handles OAuth authentication, sessions, and message exchange
 */

const axios = require('axios');

// Configuration
let config = {
    clientId: null,
    clientSecret: null,
    instanceUrl: null,
    agentId: null
};

// Token cache
let accessToken = null;
let tokenExpiresAt = null;

// API endpoints
const ENDPOINTS = {
    TOKEN: '/services/oauth2/token',
    SESSIONS: '/einstein/ai-agent/v1/agents/{agentId}/sessions',
    MESSAGES: '/einstein/ai-agent/v1/agents/{agentId}/sessions/{sessionId}/messages',
    END_SESSION: '/einstein/ai-agent/v1/agents/{agentId}/sessions/{sessionId}'
};

/**
 * Initialize the client with credentials
 * @param {Object} credentials - Salesforce credentials
 */
function initialize(credentials) {
    config = {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        instanceUrl: credentials.instanceUrl?.replace(/\/$/, ''), // Remove trailing slash
        agentId: credentials.agentId
    };
}

/**
 * Check if client is properly configured
 * @returns {boolean} True if configured
 */
function isConfigured() {
    return !!(config.clientId && config.clientSecret && config.instanceUrl && config.agentId);
}

/**
 * Authenticate with Salesforce using Client Credentials Flow
 * @returns {Promise<string>} Access token
 */
async function authenticate() {
    if (!isConfigured()) {
        throw new Error('Agentforce client not configured. Check environment variables.');
    }
    
    // Return cached token if still valid
    if (accessToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
        return accessToken;
    }
    
    try {
        const response = await axios.post(
            `${config.instanceUrl}${ENDPOINTS.TOKEN}`,
            new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: config.clientId,
                client_secret: config.clientSecret
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000
            }
        );
        
        accessToken = response.data.access_token;
        // Token typically expires in 1 hour, cache for 55 minutes
        tokenExpiresAt = Date.now() + (55 * 60 * 1000);
        
        return accessToken;
    } catch (error) {
        const errorMessage = error.response?.data?.error_description || error.message;
        throw new Error(`Salesforce authentication failed: ${errorMessage}`);
    }
}

/**
 * Start a new agent session
 * @param {Object} [options] - Session options
 * @returns {Promise<Object>} Session data with sessionId
 */
async function startSession(options = {}) {
    const token = await authenticate();
    
    const url = `${config.instanceUrl}${ENDPOINTS.SESSIONS.replace('{agentId}', config.agentId)}`;
    
    try {
        const response = await axios.post(
            url,
            {
                externalSessionKey: options.externalKey || `discord_${Date.now()}`,
                instanceConfig: {
                    endpoint: config.instanceUrl
                },
                streamingCapability: {
                    chunkTypes: ['Text']
                },
                bypassUser: true
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );
        
        return {
            sessionId: response.data.sessionId,
            externalKey: response.data.externalSessionKey,
            createdAt: new Date().toISOString()
        };
    } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        throw new Error(`Failed to start Agentforce session: ${errorMessage}`);
    }
}

/**
 * Send a message to the agent and get a response
 * @param {string} sessionId - Session ID
 * @param {string} message - User message
 * @returns {Promise<Object>} Agent response
 */
async function sendMessage(sessionId, message) {
    const token = await authenticate();
    
    const url = `${config.instanceUrl}${ENDPOINTS.MESSAGES
        .replace('{agentId}', config.agentId)
        .replace('{sessionId}', sessionId)}`;
    
    try {
        const response = await axios.post(
            url,
            {
                message: {
                    role: 'EndUser',
                    type: 'Text',
                    text: message
                },
                variables: []
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 30000
            }
        );
        
        // Parse response
        return parseAgentResponse(response.data);
    } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        throw new Error(`Failed to send message to Agentforce: ${errorMessage}`);
    }
}

/**
 * Parse the agent response to extract text and actions
 * @param {Object} data - Raw response data
 * @returns {Object} Parsed response
 */
function parseAgentResponse(data) {
    const result = {
        text: '',
        action: null,
        params: {},
        raw: data
    };
    
    // Extract messages from response
    const messages = data.messages || [];
    
    for (const msg of messages) {
        if (msg.type === 'Text' && msg.text) {
            result.text += msg.text + '\n';
        }
        
        // Check for action/tool calls
        if (msg.type === 'InvokeAction' || msg.type === 'ToolCall') {
            result.action = msg.actionName || msg.toolName;
            result.params = msg.parameters || msg.arguments || {};
        }
        
        // Check for structured response with action
        if (msg.payload) {
            try {
                const payload = typeof msg.payload === 'string' 
                    ? JSON.parse(msg.payload) 
                    : msg.payload;
                
                if (payload.action) {
                    result.action = payload.action;
                    result.params = payload.params || payload.parameters || {};
                }
            } catch (e) {
                // Not JSON, ignore
            }
        }
    }
    
    result.text = result.text.trim();
    
    return result;
}

/**
 * End an agent session
 * @param {string} sessionId - Session ID to end
 * @returns {Promise<void>}
 */
async function endSession(sessionId) {
    const token = await authenticate();
    
    const url = `${config.instanceUrl}${ENDPOINTS.END_SESSION
        .replace('{agentId}', config.agentId)
        .replace('{sessionId}', sessionId)}`;
    
    try {
        await axios.delete(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            timeout: 10000
        });
    } catch (error) {
        // Session may already be expired, ignore errors
        console.debug('Error ending session:', error.message);
    }
}

/**
 * Send a message with streaming response (SSE)
 * @param {string} sessionId - Session ID
 * @param {string} message - User message
 * @param {Function} onChunk - Callback for each chunk
 * @returns {Promise<Object>} Complete response
 */
async function sendMessageStreaming(sessionId, message, onChunk) {
    const token = await authenticate();
    
    const url = `${config.instanceUrl}${ENDPOINTS.MESSAGES
        .replace('{agentId}', config.agentId)
        .replace('{sessionId}', sessionId)}`;
    
    try {
        const response = await axios.post(
            url,
            {
                message: {
                    role: 'EndUser',
                    type: 'Text',
                    text: message
                },
                variables: []
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                },
                timeout: 60000,
                responseType: 'stream'
            }
        );
        
        return new Promise((resolve, reject) => {
            let fullText = '';
            let action = null;
            let params = {};
            
            response.data.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        try {
                            const data = JSON.parse(line.substring(5));
                            
                            if (data.type === 'Text' && data.text) {
                                fullText += data.text;
                                if (onChunk) onChunk(data.text);
                            }
                            
                            if (data.type === 'InvokeAction') {
                                action = data.actionName;
                                params = data.parameters || {};
                            }
                        } catch (e) {
                            // Not JSON, ignore
                        }
                    }
                }
            });
            
            response.data.on('end', () => {
                resolve({
                    text: fullText.trim(),
                    action,
                    params
                });
            });
            
            response.data.on('error', reject);
        });
    } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        throw new Error(`Streaming request failed: ${errorMessage}`);
    }
}

/**
 * Test connection to Agentforce
 * @returns {Promise<boolean>} True if connection successful
 */
async function testConnection() {
    try {
        await authenticate();
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = {
    initialize,
    isConfigured,
    authenticate,
    startSession,
    sendMessage,
    sendMessageStreaming,
    endSession,
    testConnection
};
