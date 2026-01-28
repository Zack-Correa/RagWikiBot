/**
 * RagWiki Admin Panel - Frontend JavaScript
 */

// State
let serviceRunning = true;
let currentSection = 'dashboard';

// DOM Elements
const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('.nav-link[data-section]');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initDashboard();
    initAlerts();
    initConfig();
    initWhitelist();
    initDeploy();
    initLogs();
    
    // Load initial data
    loadStats();
    loadAlerts();
    loadConfig();
    loadWhitelist();
    loadDeployStatus();
    loadLogs();
    
    // Auto-refresh stats every 30 seconds
    setInterval(loadStats, 30000);
});

// Navigation
function initNavigation() {
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            showSection(section);
        });
    });
    
    // Handle hash navigation
    if (window.location.hash) {
        const section = window.location.hash.slice(1);
        showSection(section);
    }
}

function showSection(sectionId) {
    sections.forEach(s => s.classList.remove('active'));
    navLinks.forEach(l => l.classList.remove('active'));
    
    const section = document.getElementById(sectionId);
    const link = document.querySelector(`[data-section="${sectionId}"]`);
    
    if (section) section.classList.add('active');
    if (link) link.classList.add('active');
    
    currentSection = sectionId;
    window.location.hash = sectionId;
}

// Dashboard
function initDashboard() {
    document.getElementById('btn-force-check').addEventListener('click', forceCheck);
    document.getElementById('btn-toggle-service').addEventListener('click', toggleService);
    document.getElementById('btn-refresh').addEventListener('click', loadStats);
}

async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const result = await response.json();
        
        if (result.success) {
            const data = result.data;
            
            document.getElementById('stat-total-alerts').textContent = data.totalAlerts || 0;
            document.getElementById('stat-unique-users').textContent = data.uniqueUsers || 0;
            document.getElementById('stat-unique-searches').textContent = data.uniqueSearches || 0;
            
            serviceRunning = data.running;
            const statusEl = document.getElementById('stat-service-status');
            statusEl.textContent = data.running ? 'Ativo' : 'Parado';
            statusEl.style.color = data.running ? '#3BA55C' : '#ED4245';
            
            // Update toggle button
            const toggleBtn = document.getElementById('btn-toggle-service');
            toggleBtn.textContent = data.running ? 'Parar Serviço' : 'Iniciar Serviço';
            toggleBtn.className = data.running ? 'btn btn-warning' : 'btn btn-success';
            
            // Info
            document.getElementById('info-interval').textContent = `${data.intervalMinutes} minutos`;
            document.getElementById('info-cooldown').textContent = `${data.cooldownMinutes} minutos`;
            
            if (data.lastCheck) {
                const date = new Date(data.lastCheck);
                document.getElementById('info-last-check').textContent = formatDate(date);
            } else {
                document.getElementById('info-last-check').textContent = 'Nunca';
            }
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        showToast('Erro ao carregar estatísticas', 'error');
    }
}

async function forceCheck() {
    try {
        const btn = document.getElementById('btn-force-check');
        btn.disabled = true;
        btn.textContent = 'Verificando...';
        
        const response = await fetch('/api/alerts/check', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showToast('Verificação iniciada!', 'success');
        } else {
            showToast(result.error || 'Erro ao iniciar verificação', 'error');
        }
    } catch (error) {
        showToast('Erro ao iniciar verificação', 'error');
    } finally {
        const btn = document.getElementById('btn-force-check');
        btn.disabled = false;
        btn.textContent = 'Forçar Verificação';
        
        // Reload stats after a delay
        setTimeout(loadStats, 2000);
    }
}

async function toggleService() {
    try {
        const endpoint = serviceRunning ? '/api/service/stop' : '/api/service/start';
        const response = await fetch(endpoint, { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showToast(result.message, 'success');
            loadStats();
        } else {
            showToast(result.error || 'Erro', 'error');
        }
    } catch (error) {
        showToast('Erro ao alternar serviço', 'error');
    }
}

// Alerts
function initAlerts() {
    document.getElementById('btn-filter-alerts').addEventListener('click', loadAlerts);
    document.getElementById('btn-refresh-alerts').addEventListener('click', refreshAlerts);
}

async function refreshAlerts() {
    const btn = document.getElementById('btn-refresh-alerts');
    btn.disabled = true;
    btn.textContent = '⏳ Atualizando...';
    
    await loadAlerts();
    
    btn.disabled = false;
    btn.textContent = '🔄 Atualizar';
    showToast('Lista de alertas atualizada!', 'success');
}

async function loadAlerts() {
    const server = document.getElementById('filter-server').value;
    const storeType = document.getElementById('filter-type').value;
    
    const params = new URLSearchParams();
    if (server) params.append('server', server);
    if (storeType) params.append('storeType', storeType);
    
    try {
        const response = await fetch(`/api/alerts?${params}`);
        const result = await response.json();
        
        if (result.success) {
            renderAlerts(result.data.alerts);
        }
    } catch (error) {
        console.error('Error loading alerts:', error);
        showToast('Erro ao carregar alertas', 'error');
    }
}

function renderAlerts(alerts) {
    const tbody = document.getElementById('alerts-table-body');
    
    if (alerts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">Nenhum alerta encontrado</td></tr>';
        return;
    }
    
    tbody.innerHTML = alerts.map(alert => {
        const typeLabel = alert.storeType === 'BUY' ? 'Comprando' : 'Vendendo';
        const maxPrice = alert.maxPrice ? formatPrice(alert.maxPrice) : '-';
        const lowestPrice = alert.lowestPriceSeen ? formatPrice(alert.lowestPriceSeen) : '-';
        const createdAt = formatDate(new Date(alert.createdAt));
        
        // User info
        const user = alert.user || { displayName: alert.userId, avatar: null };
        const avatarHtml = user.avatar 
            ? `<img src="${user.avatar}" alt="${escapeHtml(user.displayName)}" class="user-avatar">`
            : `<div class="user-avatar-placeholder">${escapeHtml(user.displayName.charAt(0).toUpperCase())}</div>`;
        
        return `
            <tr>
                <td class="user-cell">
                    ${avatarHtml}
                    <span class="user-name">${escapeHtml(user.displayName)}</span>
                </td>
                <td><strong>${escapeHtml(alert.searchTerm)}</strong></td>
                <td>${typeLabel}</td>
                <td>${alert.server}</td>
                <td>${maxPrice}</td>
                <td>${lowestPrice}</td>
                <td>${alert.notificationCount || 0}</td>
                <td>${createdAt}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteAlert('${alert.id}')">
                        Remover
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function deleteAlert(alertId) {
    if (!confirm('Tem certeza que deseja remover este alerta?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/alerts/${alertId}`, { method: 'DELETE' });
        const result = await response.json();
        
        if (result.success) {
            showToast('Alerta removido!', 'success');
            loadAlerts();
            loadStats();
        } else {
            showToast(result.error || 'Erro ao remover alerta', 'error');
        }
    } catch (error) {
        showToast('Erro ao remover alerta', 'error');
    }
}

// Logs
function initLogs() {
    document.getElementById('btn-filter-logs').addEventListener('click', loadLogs);
    document.getElementById('btn-clear-logs').addEventListener('click', clearLogs);
}

async function loadLogs() {
    const level = document.getElementById('filter-log-level').value;
    const limit = document.getElementById('filter-log-limit').value;
    
    const params = new URLSearchParams();
    if (level) params.append('level', level);
    if (limit) params.append('limit', limit);
    
    try {
        const response = await fetch(`/api/logs?${params}`);
        const result = await response.json();
        
        if (result.success) {
            renderLogs(result.data.logs);
        }
    } catch (error) {
        console.error('Error loading logs:', error);
        showToast('Erro ao carregar logs', 'error');
    }
}

function renderLogs(logs) {
    const container = document.getElementById('logs-container');
    
    if (logs.length === 0) {
        container.innerHTML = '<div class="loading">Nenhum log encontrado</div>';
        return;
    }
    
    container.innerHTML = logs.map(log => {
        const timestamp = formatTime(new Date(log.timestamp));
        const dataStr = log.data ? `<div class="log-data">${escapeHtml(JSON.stringify(log.data))}</div>` : '';
        
        return `
            <div class="log-entry">
                <span class="log-timestamp">${timestamp}</span>
                <span class="log-level ${log.level}">${log.level}</span>
                <div class="log-message">
                    ${escapeHtml(log.message)}
                    ${dataStr}
                </div>
            </div>
        `;
    }).join('');
}

async function clearLogs() {
    if (!confirm('Tem certeza que deseja limpar todos os logs?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/logs/clear', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showToast('Logs limpos!', 'success');
            loadLogs();
        } else {
            showToast(result.error || 'Erro ao limpar logs', 'error');
        }
    } catch (error) {
        showToast('Erro ao limpar logs', 'error');
    }
}

// Config
function initConfig() {
    document.getElementById('config-form').addEventListener('submit', saveConfig);
    document.getElementById('btn-reset-config').addEventListener('click', resetConfig);
}

async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const result = await response.json();
        
        if (result.success) {
            const config = result.data;
            document.getElementById('config-interval').value = config.checkIntervalMinutes;
            document.getElementById('config-cooldown').value = config.cooldownMinutes;
            document.getElementById('config-delay').value = config.requestDelayMs;
            document.getElementById('config-allow-admins').checked = config.allowAdmins;
        }
    } catch (error) {
        console.error('Error loading config:', error);
        showToast('Erro ao carregar configurações', 'error');
    }
}

async function saveConfig(e) {
    e.preventDefault();
    
    const config = {
        checkIntervalMinutes: parseInt(document.getElementById('config-interval').value, 10),
        cooldownMinutes: parseInt(document.getElementById('config-cooldown').value, 10),
        requestDelayMs: parseInt(document.getElementById('config-delay').value, 10),
        allowAdmins: document.getElementById('config-allow-admins').checked
    };
    
    try {
        const response = await fetch('/api/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Configurações salvas!', 'success');
            loadStats(); // Refresh stats to show new values
        } else {
            showToast(result.error || 'Erro ao salvar configurações', 'error');
        }
    } catch (error) {
        console.error('Error saving config:', error);
        showToast('Erro ao salvar configurações', 'error');
    }
}

async function resetConfig() {
    if (!confirm('Tem certeza que deseja restaurar as configurações padrão?')) {
        return;
    }
    
    const defaultConfig = {
        checkIntervalMinutes: 15,
        cooldownMinutes: 60,
        requestDelayMs: 2000,
        allowAdmins: true
    };
    
    try {
        const response = await fetch('/api/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(defaultConfig)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Configurações restauradas!', 'success');
            loadConfig();
            loadStats();
        } else {
            showToast(result.error || 'Erro ao restaurar configurações', 'error');
        }
    } catch (error) {
        console.error('Error resetting config:', error);
        showToast('Erro ao restaurar configurações', 'error');
    }
}

// Permissions
let guildRoles = [];

function initWhitelist() {
    document.getElementById('permission-add-form').addEventListener('submit', addPermission);
    document.getElementById('permission-type').addEventListener('change', onPermissionTypeChange);
    
    // Initial state
    onPermissionTypeChange();
}

function onPermissionTypeChange() {
    const type = document.getElementById('permission-type').value;
    const valueInput = document.getElementById('permission-value');
    const helpText = document.getElementById('permission-help-text');
    const roleSelector = document.getElementById('role-selector-container');
    
    switch (type) {
        case 'userId':
            valueInput.placeholder = 'Ex: 123456789012345678';
            helpText.textContent = 'Digite o ID numérico do usuário Discord (clique com botão direito no usuário → Copiar ID)';
            roleSelector.style.display = 'none';
            break;
        case 'username':
            valueInput.placeholder = 'Ex: usuario123';
            helpText.textContent = 'Digite o nome de usuário do Discord (sem o @)';
            roleSelector.style.display = 'none';
            break;
        case 'roleId':
            valueInput.placeholder = 'Ex: 987654321098765432';
            helpText.textContent = 'Digite o ID do cargo ou selecione abaixo';
            roleSelector.style.display = 'block';
            loadGuildRoles();
            break;
    }
}

async function loadGuildRoles() {
    const container = document.getElementById('role-selector');
    container.innerHTML = '<div class="loading">Carregando cargos...</div>';
    
    try {
        const response = await fetch('/api/guilds/roles');
        const result = await response.json();
        
        if (result.success) {
            guildRoles = result.data.guilds;
            renderRoleSelector(guildRoles);
        }
    } catch (error) {
        console.error('Error loading roles:', error);
        container.innerHTML = '<div class="loading">Erro ao carregar cargos</div>';
    }
}

function renderRoleSelector(guilds) {
    const container = document.getElementById('role-selector');
    
    if (guilds.length === 0) {
        container.innerHTML = '<div class="loading">Nenhum servidor encontrado</div>';
        return;
    }
    
    container.innerHTML = guilds.map(guild => `
        <div class="guild-section">
            <div class="guild-name">
                ${guild.icon ? `<img src="${guild.icon}" alt="${escapeHtml(guild.name)}">` : ''}
                ${escapeHtml(guild.name)}
            </div>
            <div class="guild-roles">
                ${guild.roles.map(role => `
                    <span class="role-chip" onclick="selectRole('${role.id}', '${escapeHtml(role.name)}')">
                        <span class="role-color" style="background-color: ${role.color}"></span>
                        ${escapeHtml(role.name)}
                    </span>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function selectRole(roleId, roleName) {
    document.getElementById('permission-value').value = roleId;
    showToast(`Cargo "${roleName}" selecionado`, 'success');
}

async function loadWhitelist() {
    await loadPermissions();
}

async function loadPermissions() {
    try {
        const response = await fetch('/api/permissions');
        const result = await response.json();
        
        if (result.success) {
            renderPermissions(result.data.permissions);
        }
    } catch (error) {
        console.error('Error loading permissions:', error);
        showToast('Erro ao carregar permissões', 'error');
    }
}

function renderPermissions(permissions) {
    const container = document.getElementById('permissions-grid');
    
    if (permissions.length === 0) {
        container.innerHTML = '<div class="permissions-empty">Nenhuma permissão configurada. Adicione usuários ou cargos acima.</div>';
        return;
    }
    
    container.innerHTML = permissions.map(perm => {
        const info = perm.resolvedInfo || {};
        let icon, name, value;
        
        switch (perm.type) {
            case 'userId':
                icon = info.avatar 
                    ? `<img src="${info.avatar}" class="user-avatar" style="width: 48px; height: 48px;">`
                    : '👤';
                name = info.displayName || perm.value;
                value = `ID: ${perm.value}`;
                break;
            case 'username':
                icon = '📝';
                name = perm.value;
                value = 'Nome de usuário';
                break;
            case 'roleId':
                icon = info.color 
                    ? `<span style="background: ${info.color}; width: 24px; height: 24px; border-radius: 4px; display: inline-block;"></span>`
                    : '🏷️';
                name = info.name || perm.value;
                value = info.guildName ? `${info.guildName} • ID: ${perm.value}` : `ID: ${perm.value}`;
                break;
        }
        
        const typeLabels = {
            'userId': 'ID do Usuário',
            'username': 'Nome de Usuário', 
            'roleId': 'Cargo'
        };
        
        return `
            <div class="permission-card type-${perm.type}">
                <div class="permission-icon">${icon}</div>
                <div class="permission-info">
                    <span class="perm-name">${escapeHtml(name)}</span>
                    <span class="perm-type">${typeLabels[perm.type]}</span>
                    <span class="perm-value">${escapeHtml(value)}</span>
                </div>
                <button class="btn-remove" onclick="removePermission('${perm.id}')">Remover</button>
            </div>
        `;
    }).join('');
}

async function addPermission(e) {
    e.preventDefault();
    
    const type = document.getElementById('permission-type').value;
    const value = document.getElementById('permission-value').value.trim();
    
    if (!value) {
        showToast('Digite um valor', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, value })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Permissão adicionada!', 'success');
            document.getElementById('permission-value').value = '';
            loadPermissions();
        } else {
            showToast(result.error || 'Erro ao adicionar permissão', 'error');
        }
    } catch (error) {
        console.error('Error adding permission:', error);
        showToast('Erro ao adicionar permissão', 'error');
    }
}

async function removePermission(permissionId) {
    if (!confirm('Tem certeza que deseja remover esta permissão?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/permissions/${permissionId}`, { method: 'DELETE' });
        const result = await response.json();
        
        if (result.success) {
            showToast('Permissão removida!', 'success');
            loadPermissions();
        } else {
            showToast(result.error || 'Erro ao remover permissão', 'error');
        }
    } catch (error) {
        console.error('Error removing permission:', error);
        showToast('Erro ao remover permissão', 'error');
    }
}

// Legacy function for backwards compatibility
async function removeFromWhitelist(userId) {
    await removePermission(userId);
}

// Deploy
function initDeploy() {
    document.getElementById('btn-deploy-global').addEventListener('click', deployGlobal);
    document.getElementById('btn-clear-global').addEventListener('click', clearGlobalCommands);
}

async function loadDeployStatus() {
    try {
        const response = await fetch('/api/deploy/status');
        const result = await response.json();
        
        if (result.success) {
            renderDeployStatus(result.data);
        }
    } catch (error) {
        console.error('Error loading deploy status:', error);
        showToast('Erro ao carregar status de deploy', 'error');
    }
}

function renderDeployStatus(data) {
    // Check if clientId is configured
    if (!data.clientIdConfigured) {
        const container = document.getElementById('available-commands');
        container.innerHTML = `
            <div class="deploy-warning">
                <strong>⚠️ CLIENT_ID não configurado!</strong><br>
                Adicione <code>CLIENT_ID=seu_client_id</code> no arquivo .env para habilitar o deploy de comandos.<br>
                <small>Você pode encontrar o Client ID no Discord Developer Portal → seu aplicativo → General Information.</small>
            </div>
        `;
        document.getElementById('global-deploy-status').innerHTML = '<span class="status-text">⚠️ Configure o CLIENT_ID primeiro</span>';
        document.getElementById('guilds-deploy-list').innerHTML = '<div class="loading">Configure o CLIENT_ID para ver os servidores</div>';
        return;
    }
    
    // Render available commands
    const commandsContainer = document.getElementById('available-commands');
    if (data.availableCommands && data.availableCommands.length > 0) {
        commandsContainer.innerHTML = data.availableCommands.map(cmd => `
            <div class="command-badge">
                <span class="cmd-name">/${cmd.name}</span>
                <span class="cmd-desc">${escapeHtml(cmd.description)}</span>
            </div>
        `).join('');
    } else {
        commandsContainer.innerHTML = '<div class="loading">Nenhum comando encontrado</div>';
    }
    
    // Render global deploy status
    const globalStatus = document.getElementById('global-deploy-status');
    if (data.global && data.global.deployed) {
        globalStatus.className = 'deploy-status deployed';
        const lastDeploy = data.global.lastDeployedAt 
            ? formatDate(new Date(data.global.lastDeployedAt))
            : 'Desconhecido';
        globalStatus.innerHTML = `
            <span class="status-indicator"></span>
            <span class="status-text">Comandos deployados globalmente (${data.global.commands.length} comandos)</span>
            <span class="status-detail">Último deploy: ${lastDeploy}</span>
        `;
    } else {
        globalStatus.className = 'deploy-status not-deployed';
        globalStatus.innerHTML = `
            <span class="status-indicator"></span>
            <span class="status-text">Nenhum comando global deployado</span>
        `;
    }
    
    // Render guilds
    const guildsContainer = document.getElementById('guilds-deploy-list');
    if (data.guilds && data.guilds.length > 0) {
        guildsContainer.innerHTML = data.guilds.map(guild => {
            const deployed = guild.deployed && guild.deployed.deployed;
            const statusClass = deployed ? 'deployed' : 'not-deployed';
            const statusText = deployed ? 'Deployado' : 'Não deployado';
            const lastDeploy = guild.deployed?.lastDeployedAt 
                ? formatDate(new Date(guild.deployed.lastDeployedAt))
                : '';
            const commandCount = guild.deployed?.commands?.length || 0;
            
            const iconHtml = guild.icon 
                ? `<img src="${guild.icon}" alt="${escapeHtml(guild.name)}">`
                : guild.name.charAt(0).toUpperCase();
            
            return `
                <div class="guild-deploy-card">
                    <div class="guild-icon">${iconHtml}</div>
                    <div class="guild-info">
                        <div class="guild-title">${escapeHtml(guild.name)}</div>
                        <div class="guild-members">${guild.memberCount} membros</div>
                    </div>
                    <div class="guild-status">
                        <span class="status-badge ${statusClass}">${statusText}${deployed ? ` (${commandCount})` : ''}</span>
                        ${lastDeploy ? `<span class="last-deploy">${lastDeploy}</span>` : ''}
                    </div>
                    <div class="guild-actions">
                        <button class="btn btn-success btn-sm" onclick="deployToGuild('${guild.id}')">Deploy</button>
                        ${deployed ? `<button class="btn btn-danger btn-sm" onclick="clearGuildCommands('${guild.id}')">Remover</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } else {
        guildsContainer.innerHTML = '<div class="loading">Nenhum servidor encontrado</div>';
    }
}

async function deployGlobal() {
    if (!confirm('Tem certeza que deseja fazer o deploy global? Pode levar até 1 hora para propagar.')) {
        return;
    }
    
    const btn = document.getElementById('btn-deploy-global');
    btn.disabled = true;
    btn.textContent = 'Deployando...';
    
    try {
        const response = await fetch('/api/deploy/global', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast(result.message, 'success');
            loadDeployStatus();
        } else {
            showToast(result.error || 'Erro ao fazer deploy', 'error');
        }
    } catch (error) {
        console.error('Error deploying globally:', error);
        showToast('Erro ao fazer deploy global', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Fazer Deploy Global';
    }
}

async function clearGlobalCommands() {
    if (!confirm('Tem certeza que deseja remover todos os comandos globais?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/deploy/global', { method: 'DELETE' });
        const result = await response.json();
        
        if (result.success) {
            showToast('Comandos globais removidos!', 'success');
            loadDeployStatus();
        } else {
            showToast(result.error || 'Erro ao remover comandos', 'error');
        }
    } catch (error) {
        console.error('Error clearing global commands:', error);
        showToast('Erro ao remover comandos globais', 'error');
    }
}

async function deployToGuild(guildId) {
    try {
        const response = await fetch(`/api/deploy/guild/${guildId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast(result.message, 'success');
            loadDeployStatus();
        } else {
            showToast(result.error || 'Erro ao fazer deploy', 'error');
        }
    } catch (error) {
        console.error('Error deploying to guild:', error);
        showToast('Erro ao fazer deploy no servidor', 'error');
    }
}

async function clearGuildCommands(guildId) {
    if (!confirm('Tem certeza que deseja remover os comandos deste servidor?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/deploy/guild/${guildId}`, { method: 'DELETE' });
        const result = await response.json();
        
        if (result.success) {
            showToast('Comandos do servidor removidos!', 'success');
            loadDeployStatus();
        } else {
            showToast(result.error || 'Erro ao remover comandos', 'error');
        }
    } catch (error) {
        console.error('Error clearing guild commands:', error);
        showToast('Erro ao remover comandos do servidor', 'error');
    }
}

// Utility Functions
function formatDate(date) {
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTime(date) {
    return date.toLocaleString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatPrice(price) {
    return price.toLocaleString('pt-BR') + 'z';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Make functions available globally
window.deleteAlert = deleteAlert;
window.removeFromWhitelist = removeFromWhitelist;
window.removePermission = removePermission;
window.selectRole = selectRole;
window.deployToGuild = deployToGuild;
window.clearGuildCommands = clearGuildCommands;
