/**
 * API Routes for Admin Panel
 * Handles all API endpoints for the admin dashboard
 */

const express = require('express');
const alertStorage = require('../../utils/alertStorage');
const configStorage = require('../../utils/configStorage');
const marketAlertService = require('../../services/marketAlertService');
const deployService = require('../../services/deployService');
const gnjoyEvents = require('../../integrations/database/gnjoy-events');
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
     * POST /api/alerts
     * Creates a new alert (admin only)
     */
    router.post('/alerts', (req, res) => {
        try {
            const { userId, searchTerm, server, storeType, maxPrice, minQuantity } = req.body;
            
            // Validate required fields
            if (!userId || !searchTerm || !server || !storeType) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Campos obrigatórios: userId, searchTerm, server, storeType' 
                });
            }
            
            // Validate server
            const validServers = ['FREYA', 'NIDHOGG', 'YGGDRASIL'];
            if (!validServers.includes(server)) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Servidor inválido. Use: FREYA, NIDHOGG ou YGGDRASIL' 
                });
            }
            
            // Validate storeType
            if (!['BUY', 'SELL'].includes(storeType)) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Tipo inválido. Use: BUY ou SELL' 
                });
            }
            
            // Create the alert
            const alert = alertStorage.addAlert({
                userId,
                searchTerm,
                storeType,
                server,
                maxPrice: maxPrice ? parseInt(maxPrice, 10) : null,
                minQuantity: minQuantity ? parseInt(minQuantity, 10) : null
            });
            
            logger.info('Alert created by admin', { 
                alertId: alert.id, 
                userId, 
                searchTerm 
            });
            
            res.json({ 
                success: true, 
                message: 'Alerta criado com sucesso',
                data: alert
            });
        } catch (error) {
            logger.error('Error creating alert', { error: error.message });
            res.status(400).json({ success: false, error: error.message });
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

    // ==================== EVENTS ENDPOINTS ====================

    /**
     * GET /api/events
     * Returns all events
     * Query params: source, activeOnly
     */
    router.get('/events', (req, res) => {
        try {
            const eventsStorage = require('../../utils/eventsStorage');
            const { source, activeOnly } = req.query;
            
            const events = eventsStorage.getEvents({
                source: source || null,
                activeOnly: activeOnly === 'true'
            });
            
            res.json({
                success: true,
                data: { events, total: events.length }
            });
        } catch (error) {
            logger.error('Error getting events', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/events
     * Creates a new manual event
     */
    router.post('/events', (req, res) => {
        try {
            const eventsStorage = require('../../utils/eventsStorage');
            const { title, description, startDate, endDate, recurring, notifyMinutesBefore } = req.body;
            
            if (!title || !startDate || !endDate) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Título, data de início e data de fim são obrigatórios' 
                });
            }
            
            const event = eventsStorage.addEvent({
                title,
                description,
                source: eventsStorage.EVENT_SOURCES.MANUAL,
                startDate,
                endDate,
                recurring,
                notifyMinutesBefore: notifyMinutesBefore || [60, 15],
                createdBy: 'admin'
            });
            
            logger.info('Event created by admin', { eventId: event.id, title });
            res.json({
                success: true,
                data: event,
                message: 'Evento criado com sucesso'
            });
        } catch (error) {
            logger.error('Error creating event', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * PUT /api/events/:id
     * Updates an event
     */
    router.put('/events/:id', (req, res) => {
        try {
            const eventsStorage = require('../../utils/eventsStorage');
            const { id } = req.params;
            const updates = req.body;
            
            const event = eventsStorage.updateEvent(id, updates);
            
            if (!event) {
                return res.status(404).json({ success: false, error: 'Evento não encontrado' });
            }
            
            logger.info('Event updated by admin', { eventId: id });
            res.json({
                success: true,
                data: event,
                message: 'Evento atualizado'
            });
        } catch (error) {
            logger.error('Error updating event', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * DELETE /api/events/:id
     * Removes an event
     */
    router.delete('/events/:id', (req, res) => {
        try {
            const eventsStorage = require('../../utils/eventsStorage');
            const { id } = req.params;
            
            const removed = eventsStorage.removeEvent(id);
            
            if (!removed) {
                return res.status(404).json({ success: false, error: 'Evento não encontrado' });
            }
            
            logger.info('Event removed by admin', { eventId: id });
            res.json({
                success: true,
                message: 'Evento removido'
            });
        } catch (error) {
            logger.error('Error removing event', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/events/stats
     * Returns events statistics
     */
    router.get('/events/stats', (req, res) => {
        try {
            const eventsStorage = require('../../utils/eventsStorage');
            const stats = eventsStorage.getStats();
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            logger.error('Error getting events stats', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/events/scrape
     * Forces a GNJoy scrape
     */
    router.post('/events/scrape', async (req, res) => {
        try {
            const eventNotificationService = require('../../services/eventNotificationService');
            const result = await eventNotificationService.forceScrape();
            
            logger.info('Event scrape triggered by admin', { result });
            res.json({
                success: true,
                data: result,
                message: `Scraping concluído: ${result.added} novo(s), ${result.scraped} encontrado(s)`
            });
        } catch (error) {
            logger.error('Error scraping events', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== SERVER STATUS ENDPOINTS ====================

    /**
     * GET /api/server-status
     * Returns server status for all servers
     */
    router.get('/server-status', (req, res) => {
        try {
            const serverStatusService = require('../../services/serverStatusService');
            const status = serverStatusService.getStatus();
            res.json({
                success: true,
                data: status
            });
        } catch (error) {
            logger.error('Error getting server status', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/server-status/check
     * Forces a status check
     */
    router.post('/server-status/check', async (req, res) => {
        try {
            const serverStatusService = require('../../services/serverStatusService');
            const results = await serverStatusService.forceCheck();
            res.json({
                success: true,
                data: results,
                message: 'Verificação concluída'
            });
        } catch (error) {
            logger.error('Error checking server status', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/server-status/history
     * Returns status change history
     */
    router.get('/server-status/history', (req, res) => {
        try {
            const serverStatusStorage = require('../../utils/serverStatusStorage');
            const { limit } = req.query;
            const history = serverStatusStorage.getHistory(parseInt(limit, 10) || 20);
            res.json({
                success: true,
                data: { history, total: history.length }
            });
        } catch (error) {
            logger.error('Error getting status history', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== PRICING ANALYSIS ENDPOINTS ====================

    /**
     * GET /api/pricing/analyze/:itemId
     * Analyzes price for an item
     * Query params: price, server, storeType, days
     */
    router.get('/pricing/analyze/:itemId', (req, res) => {
        try {
            const pricingService = require('../../services/pricingService');
            const { itemId } = req.params;
            const { price, server, storeType, days } = req.query;
            
            let analysis;
            if (price) {
                analysis = pricingService.analyzePrice(
                    itemId,
                    parseInt(price, 10),
                    server || 'FREYA',
                    storeType || 'SELL',
                    parseInt(days, 10) || 30
                );
            } else {
                analysis = pricingService.analyzeItem(
                    itemId,
                    server || null,
                    storeType || null,
                    parseInt(days, 10) || 30
                );
            }
            
            if (!analysis) {
                return res.status(404).json({ success: false, error: 'Item not found or insufficient data' });
            }
            
            res.json({
                success: true,
                data: analysis
            });
        } catch (error) {
            logger.error('Error analyzing price', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/pricing/trending
     * Gets items with significant price changes
     * Query params: days, minChange
     */
    router.get('/pricing/trending', (req, res) => {
        try {
            const pricingService = require('../../services/pricingService');
            const { days, minChange } = req.query;
            
            const trending = pricingService.getTrendingItems(
                parseInt(days, 10) || 7,
                parseInt(minChange, 10) || 10
            );
            
            res.json({
                success: true,
                data: { items: trending, total: trending.length }
            });
        } catch (error) {
            logger.error('Error getting trending items', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== PRICE HISTORY ENDPOINTS ====================

    /**
     * GET /api/price-history/stats
     * Returns price history statistics
     */
    router.get('/price-history/stats', (req, res) => {
        try {
            const priceHistoryStorage = require('../../utils/priceHistoryStorage');
            const stats = priceHistoryStorage.getStats();
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            logger.error('Error getting price history stats', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/price-history/search
     * Searches for items in price history
     * Query params: term, limit
     */
    router.get('/price-history/search', (req, res) => {
        try {
            const priceHistoryStorage = require('../../utils/priceHistoryStorage');
            const { term, limit } = req.query;
            
            if (!term) {
                return res.status(400).json({ success: false, error: 'Search term is required' });
            }
            
            const items = priceHistoryStorage.searchItems(term, parseInt(limit, 10) || 20);
            res.json({
                success: true,
                data: { items, total: items.length }
            });
        } catch (error) {
            logger.error('Error searching price history', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/price-history/item/:itemId
     * Returns price history for a specific item
     * Query params: server, storeType, days
     */
    router.get('/price-history/item/:itemId', (req, res) => {
        try {
            const priceHistoryStorage = require('../../utils/priceHistoryStorage');
            const { itemId } = req.params;
            const { server, storeType, days } = req.query;
            
            const history = priceHistoryStorage.getItemHistory(
                itemId,
                server || null,
                storeType || null,
                parseInt(days, 10) || 30
            );
            
            if (!history) {
                return res.status(404).json({ success: false, error: 'Item not found in price history' });
            }
            
            res.json({
                success: true,
                data: history
            });
        } catch (error) {
            logger.error('Error getting item price history', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== METRICS ENDPOINTS ====================

    /**
     * GET /api/metrics/dashboard
     * Returns dashboard statistics for metrics
     */
    router.get('/metrics/dashboard', (req, res) => {
        try {
            const metricsService = require('../../services/metricsService');
            const stats = metricsService.getDashboardStats();
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            logger.error('Error getting metrics dashboard', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/metrics/chart
     * Returns chart data for metrics visualization
     * Query params: days (default 7)
     */
    router.get('/metrics/chart', (req, res) => {
        try {
            const metricsService = require('../../services/metricsService');
            const days = parseInt(req.query.days, 10) || 7;
            const chartData = metricsService.getChartData(days);
            res.json({
                success: true,
                data: chartData
            });
        } catch (error) {
            logger.error('Error getting metrics chart', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/metrics/hourly
     * Returns hourly distribution for today
     */
    router.get('/metrics/hourly', (req, res) => {
        try {
            const metricsService = require('../../services/metricsService');
            const hourlyData = metricsService.getHourlyDistribution();
            res.json({
                success: true,
                data: hourlyData
            });
        } catch (error) {
            logger.error('Error getting hourly metrics', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/metrics/command/:name
     * Returns statistics for a specific command
     * Query params: days (default 30)
     */
    router.get('/metrics/command/:name', (req, res) => {
        try {
            const metricsService = require('../../services/metricsService');
            const { name } = req.params;
            const days = parseInt(req.query.days, 10) || 30;
            const stats = metricsService.getCommandStats(name, days);
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            logger.error('Error getting command metrics', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/metrics/reset
     * Resets all metrics (admin only, use with caution)
     */
    router.post('/metrics/reset', (req, res) => {
        try {
            const metricsService = require('../../services/metricsService');
            metricsService.resetMetrics();
            logger.info('Metrics reset by admin');
            res.json({
                success: true,
                message: 'Métricas resetadas com sucesso'
            });
        } catch (error) {
            logger.error('Error resetting metrics', { error: error.message });
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

    // =====================
    // News Routes
    // =====================

    /**
     * GET /api/news
     * Get news list and cache info
     */
    router.get('/news', async (req, res) => {
        try {
            const cacheInfo = gnjoyEvents.getNewsCacheInfo();
            const news = await gnjoyEvents.getLatestNews();
            const categories = gnjoyEvents.categorizeNews(news);
            
            res.json({
                success: true,
                data: {
                    cache: cacheInfo,
                    news: news,
                    categories: {
                        avisos: categories.avisos.length,
                        atualizacoes: categories.atualizacoes.length,
                        eventos: categories.eventos.length,
                        outros: categories.outros.length
                    },
                    categorizedNews: categories
                }
            });
        } catch (error) {
            logger.error('Error getting news', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/news/refresh
     * Force refresh news cache
     */
    router.post('/news/refresh', async (req, res) => {
        try {
            logger.info('Admin forcing news refresh');
            const result = await gnjoyEvents.forceRefreshNews();
            
            res.json({
                success: result.success,
                data: result
            });
        } catch (error) {
            logger.error('Error refreshing news', { error: error.message });
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
};
