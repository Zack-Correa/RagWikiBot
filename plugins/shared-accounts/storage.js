/**
 * Account Storage Module for Shared Accounts Plugin
 * Handles shared Ragnarok accounts with encryption and TOTP
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { authenticator } = require('otplib');

// Data file path (stored in plugin folder)
const DATA_DIR = path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

// Encryption settings
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// Permission types
const PERMISSION_TYPES = {
    USER_ID: 'userId',
    USERNAME: 'username',
    ROLE_ID: 'roleId'
};

// Permission actions
const PERMISSION_ACTIONS = {
    ALLOW: 'allow',
    DENY: 'deny'
};

// Server options
const SERVERS = ['FREYA', 'NIDHOGG', 'YGGDRASIL'];

// Plugin logger (set by index.js)
let logger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.debug
};

/**
 * Sets the logger instance
 */
function setLogger(pluginLogger) {
    logger = pluginLogger;
}

/**
 * Gets the encryption key from environment
 * @returns {Buffer} 32-byte encryption key
 */
function getEncryptionKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('ENCRYPTION_KEY não está configurada no ambiente');
    }
    return Buffer.from(key, 'hex');
}

/**
 * Encrypts a string using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @returns {string} Encrypted string (iv:authTag:ciphertext in hex)
 */
function encrypt(text) {
    if (!text) return '';
    
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string
 * @param {string} encryptedText - Encrypted string (iv:authTag:ciphertext in hex)
 * @returns {string} Decrypted plain text
 */
function decrypt(encryptedText) {
    if (!encryptedText) return '';
    
    const key = getEncryptionKey();
    const parts = encryptedText.split(':');
    
    if (parts.length !== 3) {
        throw new Error('Formato de dado criptografado inválido');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ciphertext = parts[2];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

/**
 * Ensures the data directory exists
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        logger.info('Created plugin data directory');
    }
}

/**
 * Loads accounts from storage
 * @returns {Object} Accounts data
 */
function loadAccounts() {
    ensureDataDir();
    
    try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading accounts', { error: error.message });
    }
    
    return { accounts: [] };
}

/**
 * Saves accounts to storage
 * @param {Object} data - Accounts data
 */
function saveAccounts(data) {
    ensureDataDir();
    
    try {
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2), 'utf8');
        logger.debug('Accounts saved');
    } catch (error) {
        logger.error('Error saving accounts', { error: error.message });
        throw error;
    }
}

/**
 * Generates a unique account ID
 */
function generateId() {
    return `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generates a unique permission ID
 */
function generatePermissionId() {
    return `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Gets all accounts (without decrypted sensitive data)
 * @returns {Array<Object>}
 */
function getAllAccounts() {
    const data = loadAccounts();
    return data.accounts.map(account => ({
        id: account.id,
        name: account.name,
        login: account.login,
        server: account.server,
        ownerId: account.ownerId || null,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        permissions: account.permissions || [],
        hasPassword: !!account.password,
        hasTotpSecret: !!account.totpSecret,
        hasKafraPassword: !!account.kafraPassword
    }));
}

/**
 * Gets a single account by ID (without decrypted sensitive data)
 * @param {string} accountId
 * @returns {Object|null}
 */
function getAccount(accountId) {
    const data = loadAccounts();
    const account = data.accounts.find(a => a.id === accountId);
    
    if (!account) return null;
    
    return {
        id: account.id,
        name: account.name,
        login: account.login,
        server: account.server,
        ownerId: account.ownerId || null,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        permissions: account.permissions || [],
        hasPassword: !!account.password,
        hasTotpSecret: !!account.totpSecret,
        hasKafraPassword: !!account.kafraPassword
    };
}

/**
 * Gets decrypted credentials for an account (for authorized access only)
 * @param {string} accountId
 * @returns {Object|null}
 */
function getDecryptedCredentials(accountId) {
    const data = loadAccounts();
    const account = data.accounts.find(a => a.id === accountId);
    
    if (!account) return null;
    
    try {
        return {
            id: account.id,
            name: account.name,
            login: account.login,
            password: decrypt(account.password),
            kafraPassword: decrypt(account.kafraPassword),
            totpSecret: decrypt(account.totpSecret),
            server: account.server
        };
    } catch (error) {
        logger.error('Error decrypting credentials', { accountId, error: error.message });
        return null;
    }
}

/**
 * Generates current TOTP code for an account
 * @param {string} accountId
 * @returns {Object|null} { code, remainingSeconds }
 */
function generateTOTP(accountId) {
    const data = loadAccounts();
    const account = data.accounts.find(a => a.id === accountId);
    
    if (!account || !account.totpSecret) return null;
    
    try {
        let secret = decrypt(account.totpSecret);
        if (!secret) return null;
        
        // Normalize the secret: remove spaces, convert to uppercase, remove padding
        secret = secret.replace(/\s+/g, '').toUpperCase().replace(/=+$/, '');
        
        const code = authenticator.generate(secret);
        const timeRemaining = authenticator.timeRemaining();
        
        return {
            code,
            remainingSeconds: timeRemaining
        };
    } catch (error) {
        logger.error('Error generating TOTP', { accountId, error: error.message });
        return null;
    }
}

/**
 * Creates a new account
 * @param {Object} accountData
 * @returns {Object} Created account
 */
function createAccount({ name, login, password, totpSecret, kafraPassword, server, ownerId }) {
    if (!name || !login) {
        throw new Error('Nome e login são obrigatórios');
    }
    
    if (server && !SERVERS.includes(server)) {
        throw new Error(`Servidor inválido. Use: ${SERVERS.join(', ')}`);
    }
    
    const data = loadAccounts();
    
    // Check for duplicate name
    const exists = data.accounts.some(a => a.name.toLowerCase() === name.toLowerCase());
    if (exists) {
        throw new Error('Já existe uma conta com este nome');
    }
    
    const account = {
        id: generateId(),
        name,
        login,
        password: encrypt(password || ''),
        totpSecret: encrypt(totpSecret || ''),
        kafraPassword: encrypt(kafraPassword || ''),
        server: server || 'FREYA',
        ownerId: ownerId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        permissions: []
    };
    
    data.accounts.push(account);
    saveAccounts(data);
    
    logger.info('Account created', { accountId: account.id, name: account.name, ownerId });
    
    return getAccount(account.id);
}

/**
 * Updates an existing account
 * @param {string} accountId
 * @param {Object} updates
 * @returns {Object} Updated account
 */
function updateAccount(accountId, updates) {
    const data = loadAccounts();
    const index = data.accounts.findIndex(a => a.id === accountId);
    
    if (index === -1) {
        throw new Error('Conta não encontrada');
    }
    
    const account = data.accounts[index];
    
    if (updates.name !== undefined) {
        const exists = data.accounts.some(a => 
            a.id !== accountId && a.name.toLowerCase() === updates.name.toLowerCase()
        );
        if (exists) {
            throw new Error('Já existe uma conta com este nome');
        }
        account.name = updates.name;
    }
    
    if (updates.login !== undefined) {
        account.login = updates.login;
    }
    
    if (updates.password !== undefined) {
        account.password = encrypt(updates.password);
    }
    
    if (updates.totpSecret !== undefined) {
        account.totpSecret = encrypt(updates.totpSecret);
    }
    
    if (updates.kafraPassword !== undefined) {
        account.kafraPassword = encrypt(updates.kafraPassword);
    }
    
    if (updates.server !== undefined) {
        if (!SERVERS.includes(updates.server)) {
            throw new Error(`Servidor inválido. Use: ${SERVERS.join(', ')}`);
        }
        account.server = updates.server;
    }
    
    account.updatedAt = new Date().toISOString();
    
    data.accounts[index] = account;
    saveAccounts(data);
    
    logger.info('Account updated', { accountId, updates: Object.keys(updates) });
    
    return getAccount(accountId);
}

/**
 * Deletes an account
 * @param {string} accountId
 * @returns {boolean}
 */
function deleteAccount(accountId) {
    const data = loadAccounts();
    const initialLength = data.accounts.length;
    
    data.accounts = data.accounts.filter(a => a.id !== accountId);
    
    if (data.accounts.length < initialLength) {
        saveAccounts(data);
        logger.info('Account deleted', { accountId });
        return true;
    }
    
    return false;
}

/**
 * Adds a permission to an account
 * @param {string} accountId
 * @param {string} type - Permission type (userId, username, roleId)
 * @param {string} value - The value (ID or username)
 * @param {string} action - Permission action (allow, deny)
 * @returns {Object} Created permission
 */
function addPermission(accountId, type, value, action = PERMISSION_ACTIONS.ALLOW) {
    if (!Object.values(PERMISSION_TYPES).includes(type)) {
        throw new Error(`Tipo de permissão inválido: ${type}`);
    }
    
    if (!Object.values(PERMISSION_ACTIONS).includes(action)) {
        throw new Error(`Ação de permissão inválida: ${action}`);
    }
    
    const data = loadAccounts();
    const account = data.accounts.find(a => a.id === accountId);
    
    if (!account) {
        throw new Error('Conta não encontrada');
    }
    
    if (!account.permissions) {
        account.permissions = [];
    }
    
    const exists = account.permissions.some(p => 
        p.type === type && p.value.toLowerCase() === value.toLowerCase()
    );
    
    if (exists) {
        throw new Error('Esta permissão já existe nesta conta');
    }
    
    const permission = {
        id: generatePermissionId(),
        type,
        value,
        action,
        addedAt: new Date().toISOString()
    };
    
    account.permissions.push(permission);
    saveAccounts(data);
    
    logger.info('Permission added to account', { accountId, type, value, action });
    
    return permission;
}

/**
 * Removes a permission from an account
 * @param {string} accountId
 * @param {string} permissionId
 * @returns {boolean}
 */
function removePermission(accountId, permissionId) {
    const data = loadAccounts();
    const account = data.accounts.find(a => a.id === accountId);
    
    if (!account || !account.permissions) {
        return false;
    }
    
    const initialLength = account.permissions.length;
    account.permissions = account.permissions.filter(p => p.id !== permissionId);
    
    if (account.permissions.length < initialLength) {
        saveAccounts(data);
        logger.info('Permission removed from account', { accountId, permissionId });
        return true;
    }
    
    return false;
}

/**
 * Checks if a user has access to an account
 * Uses deny-first logic: deny > allow by userId/username > allow by roleId
 * 
 * @param {string} accountId
 * @param {Object} params
 * @param {string} params.userId - Discord user ID
 * @param {string} params.username - Discord username
 * @param {Array<string>} params.roleIds - Array of role IDs the user has
 * @returns {Object} { allowed: boolean, reason: string }
 */
function checkPermission(accountId, { userId, username, roleIds = [] }) {
    const data = loadAccounts();
    const account = data.accounts.find(a => a.id === accountId);
    
    if (!account) {
        return { allowed: false, reason: 'Conta não encontrada' };
    }
    
    // Owner always has access
    if (account.ownerId && account.ownerId === userId) {
        return { allowed: true, reason: 'Acesso permitido como dono da conta' };
    }
    
    const permissions = account.permissions || [];
    
    if (permissions.length === 0) {
        return { allowed: false, reason: 'Nenhuma permissão configurada para esta conta' };
    }
    
    // Step 1: Check for explicit deny
    for (const perm of permissions) {
        if (perm.action !== PERMISSION_ACTIONS.DENY) continue;
        
        switch (perm.type) {
            case PERMISSION_TYPES.USER_ID:
                if (perm.value === userId) {
                    return { allowed: false, reason: 'Acesso negado explicitamente para este usuário' };
                }
                break;
            case PERMISSION_TYPES.USERNAME:
                if (perm.value.toLowerCase() === username?.toLowerCase()) {
                    return { allowed: false, reason: 'Acesso negado explicitamente para este usuário' };
                }
                break;
            case PERMISSION_TYPES.ROLE_ID:
                if (roleIds.includes(perm.value)) {
                    return { allowed: false, reason: 'Acesso negado explicitamente para este cargo' };
                }
                break;
        }
    }
    
    // Step 2: Check for allow by userId/username
    for (const perm of permissions) {
        if (perm.action !== PERMISSION_ACTIONS.ALLOW) continue;
        
        switch (perm.type) {
            case PERMISSION_TYPES.USER_ID:
                if (perm.value === userId) {
                    return { allowed: true, reason: 'Permitido por ID de usuário' };
                }
                break;
            case PERMISSION_TYPES.USERNAME:
                if (perm.value.toLowerCase() === username?.toLowerCase()) {
                    return { allowed: true, reason: 'Permitido por nome de usuário' };
                }
                break;
        }
    }
    
    // Step 3: Check for allow by roleId
    for (const perm of permissions) {
        if (perm.action !== PERMISSION_ACTIONS.ALLOW) continue;
        
        if (perm.type === PERMISSION_TYPES.ROLE_ID) {
            if (roleIds.includes(perm.value)) {
                return { allowed: true, reason: 'Permitido por cargo' };
            }
        }
    }
    
    return { allowed: false, reason: 'Usuário não tem permissão para acessar esta conta' };
}

/**
 * Gets all accounts a user has access to
 * @param {Object} params
 * @param {string} params.userId - Discord user ID
 * @param {string} params.username - Discord username
 * @param {Array<string>} params.roleIds - Array of role IDs the user has
 * @returns {Array<Object>}
 */
function getAccessibleAccounts({ userId, username, roleIds = [] }) {
    const data = loadAccounts();
    
    return data.accounts
        .filter(account => {
            const result = checkPermission(account.id, { userId, username, roleIds });
            return result.allowed;
        })
        .map(account => ({
            id: account.id,
            name: account.name,
            server: account.server
        }));
}

// Access logs file
const ACCESS_LOGS_FILE = path.join(DATA_DIR, 'access_logs.json');

/**
 * Loads access logs from file
 * @returns {Array} Access logs
 */
function loadAccessLogs() {
    try {
        if (fs.existsSync(ACCESS_LOGS_FILE)) {
            const data = fs.readFileSync(ACCESS_LOGS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('Error loading access logs', { error: error.message });
    }
    return [];
}

/**
 * Saves access logs to file
 * @param {Array} logs - Access logs array
 */
function saveAccessLogs(logs) {
    try {
        // Keep only last 1000 logs to prevent file from growing too large
        const trimmedLogs = logs.slice(-1000);
        fs.writeFileSync(ACCESS_LOGS_FILE, JSON.stringify(trimmedLogs, null, 2));
    } catch (error) {
        logger.error('Error saving access logs', { error: error.message });
    }
}

/**
 * Logs an access event
 * @param {string} accountId
 * @param {string} userId
 * @param {string} username
 * @param {string} action
 */
function logAccess(accountId, userId, username, action = 'view') {
    const account = getAccount(accountId);
    const logEntry = {
        id: generateId(),
        accountId,
        accountName: account?.name || 'Unknown',
        userId,
        username,
        action,
        timestamp: new Date().toISOString()
    };
    
    // Save to file
    const logs = loadAccessLogs();
    logs.push(logEntry);
    saveAccessLogs(logs);
    
    // Also log to console
    logger.info('Account access', logEntry);
}

/**
 * Gets access logs with optional filters
 * @param {Object} filters - Optional filters
 * @param {string} filters.accountId - Filter by account ID
 * @param {string} filters.userId - Filter by user ID
 * @param {number} filters.limit - Limit results (default 100)
 * @returns {Array} Filtered access logs
 */
function getAccessLogs({ accountId, userId, limit = 100 } = {}) {
    let logs = loadAccessLogs();
    
    // Apply filters
    if (accountId) {
        logs = logs.filter(log => log.accountId === accountId);
    }
    if (userId) {
        logs = logs.filter(log => log.userId === userId);
    }
    
    // Sort by timestamp descending (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply limit
    return logs.slice(0, limit);
}

/**
 * Clears old access logs
 * @param {number} daysOld - Delete logs older than this many days
 * @returns {number} Number of logs deleted
 */
function clearOldAccessLogs(daysOld = 30) {
    const logs = loadAccessLogs();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const newLogs = logs.filter(log => new Date(log.timestamp) > cutoffDate);
    const deletedCount = logs.length - newLogs.length;
    
    saveAccessLogs(newLogs);
    
    return deletedCount;
}

/**
 * Checks if a user is the owner of an account
 * @param {string} accountId
 * @param {string} userId - Discord user ID
 * @returns {boolean}
 */
function isAccountOwner(accountId, userId) {
    const data = loadAccounts();
    const account = data.accounts.find(a => a.id === accountId);
    
    if (!account) return false;
    
    return account.ownerId === userId;
}

/**
 * Gets the owner ID of an account
 * @param {string} accountId
 * @returns {string|null}
 */
function getAccountOwner(accountId) {
    const data = loadAccounts();
    const account = data.accounts.find(a => a.id === accountId);
    
    return account?.ownerId || null;
}

module.exports = {
    setLogger,
    
    // Account CRUD
    getAllAccounts,
    getAccount,
    getDecryptedCredentials,
    createAccount,
    updateAccount,
    deleteAccount,
    
    // TOTP
    generateTOTP,
    
    // Permissions
    addPermission,
    removePermission,
    checkPermission,
    getAccessibleAccounts,
    
    // Ownership
    isAccountOwner,
    getAccountOwner,
    
    // Logging
    logAccess,
    getAccessLogs,
    clearOldAccessLogs,
    
    // Constants
    PERMISSION_TYPES,
    PERMISSION_ACTIONS,
    SERVERS
};
