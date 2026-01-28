/**
 * API Routes for Admin Panel
 * Handles all API endpoints for the admin dashboard
 */

const express = require('express');
const alertStorage = require('../../utils/alertStorage');
const configStorage = require('../../utils/configStorage');
const marketAlertService = require('../../services/marketAlertService');
const deployService = require('../../services/deployService');
const logger = require('../../utils/logger');
const { requireAuth } = require('../middleware/auth');

// Cache for user info to avoid repeated Discord API calls
const userCache = new Map();
const USER_CACHE_TTL = 300000; // 5 minutes

/**
 * Gets user info from Discord, with caching
 * @param {Function} getClient - Function to get Discord client
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object>} User info
 */
async function getUserInfo(getClient, userId) {
    // Check cache first
    const cached = userCache.get(userId);
    if (cached && (Date.now() - cached.timestamp) < USER_CACHE_TTL) {
        return cached.data;
    }
    
    const client = getClient();
    if (!client) {
        return { username: userId, displayName: userId, avatar: null };
    }
    
    try {
        const user = await client.users.fetch(userId);
        const data = {
            username: user.username,
            displayName: user.displayName || user.username,
            avatar: user.displayAvatarURL({ size: 64 }),
            id: userId
        };
        
        // Cache the result
        userCache.set(userId, { data, timestamp: Date.now() });
        
        return data;
    } catch (error) {
        logger.debug('Could not fetch user info', { userId, error: error.message });
        return { username: userId, displayName: userId, avatar: null, id: userId };
    }
}

/**
 * Creates the API router with Discord client access
 * @param {Function} getDiscordClient - Function to get Discord client
 * @returns {Router} Express router
 */
module.exports = function createApiRoutes(getDiscordClient) {
    const router = express.Router();
    
    // Apply authentication to all API routes
    router.use(requireAuth);

    /**
     * GET /api/stats
     * Returns dashboard statistics
     */
    router.get('/stats', (req, res) => {
        try {
            const status = marketAlertService.getStatus();
            res.json({
                success: true,
                data: status
            });
        } catch (error) {
            logger.error('Error getting stats', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/alerts
     * Returns all alerts with optional filters and user info
     * Query params: server, storeType, userId
     */
    router.get('/alerts', async (req, res) => {
        try {
            const { server, storeType, userId } = req.query;
            const data = alertStorage.loadAlerts();
            let alerts = data.alerts || [];
            
            // Apply filters
            if (server) {
                alerts = alerts.filter(a => a.server === server);
            }
            if (storeType) {
                alerts = alerts.filter(a => a.storeType === storeType);
            }
            if (userId) {
                alerts = alerts.filter(a => a.userId === userId);
            }
            
            // Sort by creation date (newest first)
            alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            // Fetch user info for each unique userId
            const uniqueUserIds = [...new Set(alerts.map(a => a.userId))];
            const userInfoMap = {};
            
            await Promise.all(uniqueUserIds.map(async (uid) => {
                userInfoMap[uid] = await getUserInfo(getDiscordClient, uid);
            }));
            
            // Add user info to alerts
            const alertsWithUsers = alerts.map(alert => ({
                ...alert,
                user: userInfoMap[alert.userId] || { username: alert.userId, displayName: alert.userId }
            }));
            
            res.json({
                success: true,
                data: {
                    alerts: alertsWithUsers,
                    total: alertsWithUsers.length
                }
            });
        } catch (error) {
            logger.error('Error getting alerts', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * DELETE /api/alerts/:id
     * Removes an alert by ID (admin can remove any alert)
     */
    router.delete('/alerts/:id', (req, res) => {
        try {
            const { id } = req.params;
            const data = alertStorage.loadAlerts();
            const initialLength = data.alerts.length;
            
            // Admin can remove any alert (no userId check)
            data.alerts = data.alerts.filter(a => a.id !== id);
            
            if (data.alerts.length < initialLength) {
                alertStorage.saveAlerts(data);
                logger.info('Alert removed by admin', { alertId: id });
                res.json({ success: true, message: 'Alerta removido com sucesso' });
            } else {
                res.status(404).json({ success: false, error: 'Alerta não encontrado' });
            }
        } catch (error) {
            logger.error('Error removing alert', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/logs
     * Returns recent logs
     * Query params: level (ERROR, WARN, INFO, DEBUG), limit (default 100)
     */
    router.get('/logs', (req, res) => {
        try {
            const { level, limit } = req.query;
            const logs = logger.getRecentLogs({
                level,
                limit: limit ? parseInt(limit, 10) : 100
            });
            
            res.json({
                success: true,
                data: {
                    logs,
                    total: logs.length
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/logs/clear
     * Clears the log buffer
     */
    router.post('/logs/clear', (req, res) => {
        try {
            logger.clearLogs();
            logger.info('Logs cleared by admin');
            res.json({ success: true, message: 'Logs limpos com sucesso' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/alerts/check
     * Forces an immediate alert check
     */
    router.post('/alerts/check', async (req, res) => {
        try {
            const status = marketAlertService.getStatus();
            
            if (status.isChecking) {
                return res.status(409).json({ 
                    success: false, 
                    error: 'Uma verificação já está em andamento' 
                });
            }
            
            logger.info('Force check triggered by admin');
            
            // Start the check (don't await - it runs in background)
            marketAlertService.forceCheck();
            
            res.json({ 
                success: true, 
                message: 'Verificação iniciada' 
            });
        } catch (error) {
            logger.error('Error forcing check', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/service/stop
     * Stops the alert service
     */
    router.post('/service/stop', (req, res) => {
        try {
            marketAlertService.stop();
            logger.info('Alert service stopped by admin');
            res.json({ success: true, message: 'Serviço parado' });
        } catch (error) {
            logger.error('Error stopping service', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/service/start
     * Starts the alert service
     */
    router.post('/service/start', (req, res) => {
        try {
            marketAlertService.start();
            logger.info('Alert service started by admin');
            res.json({ success: true, message: 'Serviço iniciado' });
        } catch (error) {
            logger.error('Error starting service', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== CONFIG ENDPOINTS ====================

    /**
     * GET /api/config
     * Returns current configuration
     */
    router.get('/config', (req, res) => {
        try {
            const config = configStorage.getFullConfig();
            res.json({
                success: true,
                data: config
            });
        } catch (error) {
            logger.error('Error getting config', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * PUT /api/config
     * Updates configuration values
     * Body: { checkIntervalMinutes, cooldownMinutes, requestDelayMs, allowAdmins }
     */
    router.put('/config', (req, res) => {
        try {
            const updates = req.body;
            const config = configStorage.updateConfig(updates);
            
            // Restart service if interval changed
            if (updates.checkIntervalMinutes !== undefined) {
                marketAlertService.restart();
            }
            
            logger.info('Config updated by admin', { updates });
            res.json({
                success: true,
                data: config,
                message: 'Configuração atualizada'
            });
        } catch (error) {
            logger.error('Error updating config', { error: error.message });
            res.status(400).json({ success: false, error: error.message });
        }
    });

    // ==================== PERMISSIONS ENDPOINTS ====================

    /**
     * GET /api/permissions
     * Returns all permissions with resolved info
     */
    router.get('/permissions', async (req, res) => {
        try {
            const permissions = configStorage.getAlertPermissions();
            const { PERMISSION_TYPES } = configStorage;
            
            // Resolve info for each permission
            const permissionsWithInfo = await Promise.all(permissions.map(async (perm) => {
                const result = { ...perm };
                
                if (perm.type === PERMISSION_TYPES.USER_ID) {
                    const userInfo = await getUserInfo(getDiscordClient, perm.value);
                    result.resolvedInfo = {
                        displayName: userInfo.displayName,
                        username: userInfo.username,
                        avatar: userInfo.avatar
                    };
                } else if (perm.type === PERMISSION_TYPES.ROLE_ID) {
                    // Try to resolve role name from any guild the bot is in
                    const client = getDiscordClient();
                    if (client) {
                        for (const guild of client.guilds.cache.values()) {
                            const role = guild.roles.cache.get(perm.value);
                            if (role) {
                                result.resolvedInfo = {
                                    name: role.name,
                                    color: role.hexColor,
                                    guildName: guild.name
                                };
                                break;
                            }
                        }
                    }
                    if (!result.resolvedInfo) {
                        result.resolvedInfo = { name: perm.value };
                    }
                } else if (perm.type === PERMISSION_TYPES.USERNAME) {
                    result.resolvedInfo = { displayName: perm.value };
                }
                
                return result;
            }));
            
            res.json({
                success: true,
                data: {
                    permissions: permissionsWithInfo,
                    total: permissionsWithInfo.length,
                    types: PERMISSION_TYPES
                }
            });
        } catch (error) {
            logger.error('Error getting permissions', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/permissions
     * Adds a new permission
     * Body: { type: 'userId'|'username'|'roleId', value: string }
     */
    router.post('/permissions', (req, res) => {
        try {
            const { type, value } = req.body;
            
            if (!type || !value) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Tipo e valor são obrigatórios' 
                });
            }
            
            const permission = configStorage.addPermission(type, value);
            
            logger.info('Permission added by admin', { type, value });
            res.json({ 
                success: true, 
                data: permission,
                message: 'Permissão adicionada com sucesso' 
            });
        } catch (error) {
            logger.error('Error adding permission', { error: error.message });
            res.status(400).json({ success: false, error: error.message });
        }
    });

    /**
     * DELETE /api/permissions/:id
     * Removes a permission by ID
     * Also clears user alerts if it's a userId or username permission
     */
    router.delete('/permissions/:id', async (req, res) => {
        try {
            const { id } = req.params;
            
            // First, get the permission to check its type
            const permissions = configStorage.getAlertPermissions();
            const permission = permissions.find(p => p.id === id || p.value === id);
            
            let resolvedUserId = null;
            
            // If it's a username permission, try to resolve the user ID
            if (permission && permission.type === 'username') {
                const client = getDiscordClient();
                if (client) {
                    // Search for user by username across all guilds
                    for (const guild of client.guilds.cache.values()) {
                        try {
                            const members = await guild.members.fetch();
                            const member = members.find(m => 
                                m.user.username.toLowerCase() === permission.value.toLowerCase()
                            );
                            if (member) {
                                resolvedUserId = member.user.id;
                                logger.info('Resolved username to userId', { 
                                    username: permission.value, 
                                    userId: resolvedUserId 
                                });
                                break;
                            }
                        } catch (err) {
                            logger.debug('Could not fetch members from guild', { 
                                guildId: guild.id, 
                                error: err.message 
                            });
                        }
                    }
                }
            }
            
            const result = configStorage.removePermission(id, resolvedUserId);
            
            if (result.removed) {
                logger.info('Permission removed by admin', { 
                    permissionId: id, 
                    alertsCleared: result.alertsCleared,
                    resolvedUserId
                });
                
                let message = 'Permissão removida com sucesso';
                if (result.alertsCleared > 0) {
                    message += ` (${result.alertsCleared} alerta(s) do usuário também foram removidos)`;
                }
                
                res.json({ 
                    success: true, 
                    message,
                    alertsCleared: result.alertsCleared
                });
            } else {
                res.status(404).json({ success: false, error: 'Permissão não encontrada' });
            }
        } catch (error) {
            logger.error('Error removing permission', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/guilds/roles
     * Returns all roles from all guilds the bot is in
     */
    router.get('/guilds/roles', (req, res) => {
        try {
            const client = getDiscordClient();
            
            if (!client) {
                return res.json({ success: true, data: { guilds: [] } });
            }
            
            const guilds = [];
            
            for (const guild of client.guilds.cache.values()) {
                const roles = guild.roles.cache
                    .filter(role => role.name !== '@everyone')
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        color: role.hexColor,
                        position: role.position
                    }))
                    .sort((a, b) => b.position - a.position);
                
                guilds.push({
                    id: guild.id,
                    name: guild.name,
                    icon: guild.iconURL({ size: 64 }),
                    roles
                });
            }
            
            res.json({
                success: true,
                data: { guilds }
            });
        } catch (error) {
            logger.error('Error getting guild roles', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== DEPLOY ENDPOINTS ====================

    /**
     * GET /api/deploy/status
     * Returns current deployment status
     */
    router.get('/deploy/status', async (req, res) => {
        try {
            // Set client for deploy service
            deployService.setClient(getDiscordClient());
            
            const status = deployService.getDeployStatus();
            res.json({
                success: true,
                data: status
            });
        } catch (error) {
            logger.error('Error getting deploy status', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/deploy/commands/registered
     * Fetches currently registered commands from Discord
     * Query params: guildId (optional)
     */
    router.get('/deploy/commands/registered', async (req, res) => {
        try {
            const { guildId } = req.query;
            const commands = await deployService.fetchRegisteredCommands(guildId || null);
            
            res.json({
                success: true,
                data: {
                    commands,
                    scope: guildId ? 'guild' : 'global',
                    guildId: guildId || null
                }
            });
        } catch (error) {
            logger.error('Error fetching registered commands', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/deploy/global
     * Deploys commands globally
     * Body: { commands: ['command1', 'command2'] } (optional, null = all)
     */
    router.post('/deploy/global', async (req, res) => {
        try {
            const { commands } = req.body;
            const result = await deployService.deployGlobal(commands || null);
            
            logger.info('Global deploy triggered by admin', { commands: result.commands });
            res.json({
                success: true,
                data: result,
                message: `${result.count} comando(s) deployados globalmente`
            });
        } catch (error) {
            logger.error('Error deploying globally', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/deploy/guild/:guildId
     * Deploys commands to a specific guild
     * Body: { commands: ['command1', 'command2'] } (optional, null = all)
     */
    router.post('/deploy/guild/:guildId', async (req, res) => {
        try {
            const { guildId } = req.params;
            const { commands } = req.body;
            const result = await deployService.deployToGuild(guildId, commands || null);
            
            logger.info('Guild deploy triggered by admin', { guildId, commands: result.commands });
            res.json({
                success: true,
                data: result,
                message: `${result.count} comando(s) deployados no servidor`
            });
        } catch (error) {
            logger.error('Error deploying to guild', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * DELETE /api/deploy/global
     * Removes all global commands
     */
    router.delete('/deploy/global', async (req, res) => {
        try {
            await deployService.clearGlobal();
            
            logger.info('Global commands cleared by admin');
            res.json({
                success: true,
                message: 'Comandos globais removidos'
            });
        } catch (error) {
            logger.error('Error clearing global commands', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * DELETE /api/deploy/guild/:guildId
     * Removes all commands from a specific guild
     */
    router.delete('/deploy/guild/:guildId', async (req, res) => {
        try {
            const { guildId } = req.params;
            await deployService.clearGuild(guildId);
            
            logger.info('Guild commands cleared by admin', { guildId });
            res.json({
                success: true,
                message: 'Comandos do servidor removidos'
            });
        } catch (error) {
            logger.error('Error clearing guild commands', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== LEGACY WHITELIST ENDPOINTS (backwards compatibility) ====================

    /**
     * GET /api/whitelist
     * Returns the whitelist with user info (legacy)
     */
    router.get('/whitelist', async (req, res) => {
        try {
            const whitelist = configStorage.getAlertWhitelist();
            
            const usersWithInfo = await Promise.all(whitelist.map(async (userId) => {
                const info = await getUserInfo(getDiscordClient, userId);
                return { userId, ...info };
            }));
            
            res.json({
                success: true,
                data: { users: usersWithInfo, total: usersWithInfo.length }
            });
        } catch (error) {
            logger.error('Error getting whitelist', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
};
