/**
 * RagWiki Admin Panel - Frontend JavaScript
 */

// State
let serviceRunning = true;
let currentSection = 'dashboard';

// DOM Elements
const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('.nav-link[data-section]');

// Charts
let commandsChart = null;
let hourlyChart = null;
let errorsChart = null;
let responseTimesChart = null;
let pieChart = null;

// Metrics state
let currentMetricsDays = 7;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initDashboard();
    initMetrics();
    initAlerts();
    initParties();
    initConfig();
    initWhitelist();
    initNews();
    initDeploy();
    initLogs();
    initAudit();
    initPlugins();
    initAccounts();
    
    // Load initial data
    loadStats();
    loadAlerts();
    loadParties();
    loadAccounts();
    loadConfig();
    loadWhitelist();
    loadNews();
    loadDeployStatus();
    loadLogs();
    loadAuditStats();
    loadAuditEntries();
    loadPlugins();
    
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

    // Lazy-load server section data
    if (sectionId === 'servers') {
        loadServerData();
    }
}

// Dashboard
function initDashboard() {
    document.getElementById('btn-force-check').addEventListener('click', forceCheck);
    document.getElementById('btn-toggle-service').addEventListener('click', toggleService);
    document.getElementById('btn-refresh').addEventListener('click', loadStats);
    document.getElementById('btn-check-servers').addEventListener('click', forceCheckServers);
    document.getElementById('btn-check-updates').addEventListener('click', checkForUpdates);
    document.getElementById('btn-pull-updates').addEventListener('click', pullUpdates);
    document.getElementById('btn-restart-bot').addEventListener('click', restartBot);
    
    // Load server status on init
    loadServerStatus();
    
    // Load update status on init
    loadUpdateStatus();
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
            const serviceBadge = document.getElementById('service-badge');
            
            statusEl.textContent = data.running ? 'Ativo' : 'Parado';
            statusEl.style.color = data.running ? '#3BA55C' : '#ED4245';
            
            if (serviceBadge) {
                serviceBadge.textContent = data.running ? 'Ativo' : 'Parado';
                serviceBadge.className = `dash-card-badge ${data.running ? 'active' : 'inactive'}`;
            }
            
            // Update toggle button
            const toggleBtn = document.getElementById('btn-toggle-service');
            toggleBtn.textContent = data.running ? 'Parar' : 'Iniciar';
            toggleBtn.className = data.running ? 'btn btn-warning' : 'btn btn-success';
            
            // Info
            document.getElementById('info-interval').textContent = `${data.intervalMinutes} min`;
            document.getElementById('info-cooldown').textContent = `${data.cooldownMinutes} min`;
            
            if (data.lastCheck) {
                const date = new Date(data.lastCheck);
                document.getElementById('info-last-check').textContent = formatTimeAgo(date);
            } else {
                document.getElementById('info-last-check').textContent = 'Nunca';
            }
        }
        
        // Load quick stats
        loadQuickStats();
        
    } catch (error) {
        console.error('Error loading stats:', error);
        showToast('Erro ao carregar estatísticas', 'error');
    }
}

async function loadQuickStats() {
    try {
        // Load metrics for today's commands
        const metricsRes = await fetch('/api/metrics/dashboard');
        if (metricsRes.ok) {
            const metricsData = await metricsRes.json();
            if (metricsData.success) {
                const commandsToday = document.getElementById('dash-commands-today');
                if (commandsToday) {
                    commandsToday.textContent = metricsData.data.today?.totalCommands || 0;
                }
            }
        }
        
        // Load parties count
        const partiesRes = await fetch('/api/parties/stats');
        if (partiesRes.ok) {
            const partiesData = await partiesRes.json();
            if (partiesData.success) {
                const partiesActive = document.getElementById('dash-parties-active');
                if (partiesActive) {
                    partiesActive.textContent = partiesData.data.active || 0;
                }
            }
        }
        
        // Load plugins count
        const pluginsRes = await fetch('/api/plugins');
        if (pluginsRes.ok) {
            const pluginsData = await pluginsRes.json();
            if (pluginsData.success) {
                const pluginsActive = document.getElementById('dash-plugins-active');
                if (pluginsActive) {
                    const activeCount = pluginsData.data.filter(p => p.enabled).length;
                    pluginsActive.textContent = activeCount;
                }
            }
        }
    } catch (error) {
        console.error('Error loading quick stats:', error);
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

// Server Status
async function loadServerStatus() {
    try {
        const response = await fetch('/api/server-status');
        const result = await response.json();
        
        if (result.success) {
            renderServerStatus(result.data);
        }
    } catch (error) {
        console.error('Error loading server status:', error);
    }
}

function renderServerStatus(data) {
    const grid = document.getElementById('server-status-grid');
    const servers = data.servers || {};
    
    const serverHtml = Object.entries(servers).map(([name, status]) => {
        const statusClass = status.online === null ? 'unknown' : (status.online ? 'online' : 'offline');
        return `
            <div class="server-card ${statusClass}">
                <div class="server-status-dot"></div>
                <div class="server-name">${escapeHtml(name)}</div>
            </div>
        `;
    }).join('');
    
    grid.innerHTML = serverHtml || '<div class="loading">Nenhum servidor</div>';
    
    // Update info
    if (data.lastUpdated) {
        const lastCheck = new Date(data.lastUpdated);
        document.getElementById('server-last-check').textContent = formatTimeAgo(lastCheck);
    } else {
        document.getElementById('server-last-check').textContent = 'Nunca';
    }
    
    const serverAddress = document.getElementById('server-account-address');
    if (serverAddress) {
        // Shorten the address for display
        const addr = data.accountServer || '-';
        serverAddress.textContent = addr.length > 30 ? addr.substring(0, 30) + '...' : addr;
        serverAddress.title = addr;
    }
}

async function forceCheckServers() {
    const btn = document.getElementById('btn-check-servers');
    btn.disabled = true;
    btn.textContent = 'Verificando...';
    
    try {
        const response = await fetch('/api/server-status/check', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showToast('Verificação concluída!', 'success');
            loadServerStatus();
        } else {
            showToast(result.error || 'Erro ao verificar', 'error');
        }
    } catch (error) {
        console.error('Error checking servers:', error);
        showToast('Erro ao verificar servidores', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Verificar Agora';
    }
}

// Bot Updates
async function loadUpdateStatus() {
    try {
        const response = await fetch('/api/updates/status');
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('update-branch').textContent = result.data.branch || '-';
            document.getElementById('update-current-commit').textContent = 
                result.data.currentCommit ? result.data.currentCommit.substring(0, 7) : '-';
        }
    } catch (error) {
        console.error('Error loading update status:', error);
    }
}

async function checkForUpdates() {
    const btn = document.getElementById('btn-check-updates');
    const pullBtn = document.getElementById('btn-pull-updates');
    const resultDiv = document.getElementById('update-check-result');
    const changesEl = document.getElementById('update-changes');
    
    btn.disabled = true;
    btn.textContent = '🔍 Verificando...';
    
    try {
        const response = await fetch('/api/updates/check', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            if (result.data.hasUpdates) {
                resultDiv.style.display = 'block';
                resultDiv.querySelector('.update-available span').textContent = 
                    `⬆️ ${result.data.commitsBehind} commit(s) disponíveis`;
                changesEl.textContent = result.data.changes || 'Atualizações disponíveis';
                pullBtn.disabled = false;
                showToast('Atualizações encontradas!', 'success');
            } else {
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '<span class="update-no-changes">✅ Bot está atualizado!</span>';
                pullBtn.disabled = true;
                showToast('Bot está atualizado!', 'success');
            }
        } else {
            showToast(result.error || 'Erro ao verificar atualizações', 'error');
        }
    } catch (error) {
        console.error('Error checking updates:', error);
        showToast('Erro ao verificar atualizações', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Verificar Atualizações';
    }
}

async function pullUpdates() {
    if (!confirm('Tem certeza que deseja baixar as atualizações?\n\nIsso irá:\n1. Baixar código do Git\n2. Instalar dependências (npm install)\n\nRecomenda-se reiniciar o bot após a atualização.')) {
        return;
    }
    
    const btn = document.getElementById('btn-pull-updates');
    const resultDiv = document.getElementById('update-check-result');
    btn.disabled = true;
    btn.textContent = '📥 Baixando e instalando...';
    
    resultDiv.innerHTML = '<span class="update-badge">⏳ Baixando atualizações e instalando dependências...</span>';
    
    try {
        const response = await fetch('/api/updates/pull', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showToast('Atualizações baixadas e dependências instaladas! Reinicie o bot.', 'success');
            resultDiv.innerHTML = 
                '<span class="update-no-changes">✅ Atualizações baixadas! Reinicie o bot para aplicar.</span>';
            loadUpdateStatus();
        } else {
            showToast(result.error || 'Erro ao baixar atualizações', 'error');
            resultDiv.innerHTML = `<span style="color: #e74c3c;">❌ Erro: ${result.error || 'Falha ao atualizar'}</span>`;
        }
    } catch (error) {
        console.error('Error pulling updates:', error);
        showToast('Erro ao baixar atualizações', 'error');
        resultDiv.innerHTML = '<span style="color: #e74c3c;">❌ Erro ao baixar atualizações</span>';
    } finally {
        btn.disabled = true;
        btn.textContent = '📥 Baixar Atualizações';
    }
}

async function restartBot() {
    if (!confirm('⚠️ ATENÇÃO: O bot será reiniciado e ficará offline por alguns segundos. Continuar?')) {
        return;
    }
    
    const btn = document.getElementById('btn-restart-bot');
    btn.disabled = true;
    btn.textContent = '🔁 Reiniciando...';
    
    try {
        showToast('Enviando comando de reinício...', 'info');
        
        const response = await fetch('/api/updates/restart', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showToast('Bot está reiniciando... A página será recarregada em 10 segundos.', 'success');
            
            // Reload page after a delay to let the bot restart
            setTimeout(() => {
                window.location.reload();
            }, 10000);
        } else {
            showToast(result.error || 'Erro ao reiniciar', 'error');
            btn.disabled = false;
            btn.textContent = '🔁 Reiniciar Bot';
        }
    } catch (error) {
        // Connection might be lost during restart, which is expected
        showToast('Bot está reiniciando... A página será recarregada em 10 segundos.', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 10000);
    }
}

// Metrics
function initMetrics() {
    document.getElementById('btn-refresh-metrics').addEventListener('click', loadMetrics);
    document.getElementById('btn-reset-metrics').addEventListener('click', resetMetrics);
    
    // Period selector buttons
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMetricsDays = parseInt(btn.dataset.days, 10);
            loadMetrics();
        });
    });
    
    // Load metrics when section becomes visible
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (link.dataset.section === 'metrics') {
                loadMetrics();
            }
        });
    });
}

async function loadMetrics() {
    try {
        // Load all metrics data in parallel
        const [dashboardRes, chartRes, hourlyRes, extendedRes, errorsRes, responseRes] = await Promise.all([
            fetch('/api/metrics/dashboard'),
            fetch(`/api/metrics/chart?days=${currentMetricsDays}`),
            fetch('/api/metrics/hourly'),
            fetch(`/api/metrics/extended?days=${currentMetricsDays}`),
            fetch(`/api/metrics/errors?days=${currentMetricsDays}`),
            fetch(`/api/metrics/response-times?days=${currentMetricsDays}`)
        ]);
        
        const [dashboard, chart, hourly, extended, errors, response] = await Promise.all([
            dashboardRes.json(),
            chartRes.json(),
            hourlyRes.json(),
            extendedRes.json(),
            errorsRes.json(),
            responseRes.json()
        ]);
        
        // Update summary cards
        if (dashboard.success) {
            const data = dashboard.data;
            document.getElementById('metrics-today-commands').textContent = (data.today?.totalCommands || 0).toLocaleString();
            document.getElementById('metrics-today-users').textContent = data.today?.uniqueUsers || 0;
            document.getElementById('metrics-today-errors').textContent = data.today?.totalErrors || 0;
            document.getElementById('metrics-total-commands').textContent = (data.totals?.commands || 0).toLocaleString();
            document.getElementById('metrics-total-users').textContent = data.totals?.uniqueUsers || 0;
        }
        
        if (extended.success) {
            document.getElementById('metrics-error-rate').textContent = extended.data.summary.overallErrorRate + '%';
            
            // Render extended data
            renderTopCommands(extended.data.commands.slice(0, 8));
            renderCommandPerformanceTable(extended.data.commands);
            renderHeatmap(extended.data.heatmap);
            renderTopUsers(extended.data.topUsers);
            renderCommandsPieChart(extended.data.commands.slice(0, 6));
        }
        
        // Render main charts
        if (chart.success) {
            renderCommandsChart(chart.data);
        }
        
        if (hourly.success) {
            renderHourlyChart(hourly.data);
        }
        
        if (errors.success) {
            renderErrorsChart(errors.data);
        }
        
        if (response.success) {
            renderResponseTimesChart(response.data);
        }
        
    } catch (error) {
        console.error('Error loading metrics:', error);
        showToast('Erro ao carregar métricas', 'error');
    }
}

function renderTopCommands(commands) {
    const container = document.getElementById('top-commands-grid');
    
    if (!commands || commands.length === 0) {
        container.innerHTML = '<div class="metrics-empty">Nenhum comando executado ainda</div>';
        return;
    }
    
    container.innerHTML = commands.map((cmd, index) => {
        const rankClass = index < 3 ? `top-${index + 1}` : '';
        const errorRate = cmd.count > 0 ? parseFloat(cmd.errorRate) : 0;
        
        return `
            <div class="command-stat-card">
                <div class="rank ${rankClass}">${index + 1}</div>
                <div class="cmd-info">
                    <div class="cmd-name">/${escapeHtml(cmd.name)}</div>
                    <div class="cmd-stats">
                        <span>${cmd.avgResponseMs || 0}ms</span>
                        ${errorRate > 0 ? `<span class="errors">${errorRate}% erro</span>` : ''}
                    </div>
                </div>
                <div class="cmd-count">${cmd.count.toLocaleString()}</div>
            </div>
        `;
    }).join('');
}

function renderCommandPerformanceTable(commands) {
    const tbody = document.getElementById('command-performance-body');
    
    if (!commands || commands.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Nenhum dado disponível</td></tr>';
        return;
    }
    
    tbody.innerHTML = commands.slice(0, 15).map(cmd => {
        const errorRate = parseFloat(cmd.errorRate) || 0;
        const errorClass = errorRate < 1 ? 'low' : errorRate < 5 ? 'medium' : 'high';
        const responseClass = cmd.avgResponseMs < 200 ? 'fast' : cmd.avgResponseMs < 500 ? 'medium' : 'slow';
        
        return `
            <tr>
                <td><span class="cmd-name">/${escapeHtml(cmd.name)}</span></td>
                <td>${cmd.count.toLocaleString()}</td>
                <td>${cmd.errors}</td>
                <td><span class="error-rate ${errorClass}">${errorRate}%</span></td>
                <td><span class="response-time ${responseClass}">${cmd.avgResponseMs}ms</span></td>
            </tr>
        `;
    }).join('');
}

function renderHeatmap(heatmapData) {
    const container = document.getElementById('heatmap-container');
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    
    if (!heatmapData || Object.keys(heatmapData).length === 0) {
        container.innerHTML = '<div class="metrics-empty">Dados insuficientes para o mapa de calor</div>';
        return;
    }
    
    // Find max value for normalization
    let maxValue = 1;
    for (const dayData of Object.values(heatmapData)) {
        for (const count of Object.values(dayData)) {
            if (count > maxValue) maxValue = count;
        }
    }
    
    // Build heatmap grid
    let html = '<div class="heatmap-grid">';
    
    // Header row (hours)
    html += '<div class="heatmap-header"></div>';
    for (let h = 0; h < 24; h++) {
        html += `<div class="heatmap-header">${String(h).padStart(2, '0')}</div>`;
    }
    
    // Data rows (days)
    for (let d = 0; d < 7; d++) {
        html += `<div class="heatmap-row-label">${dayNames[d]}</div>`;
        for (let h = 0; h < 24; h++) {
            const hourKey = String(h).padStart(2, '0');
            const count = heatmapData[d]?.[hourKey] || 0;
            const level = count === 0 ? 0 : Math.min(5, Math.ceil((count / maxValue) * 5));
            html += `<div class="heatmap-cell" data-count="${count}" data-level="${level}" title="${dayNames[d]} ${hourKey}:00 - ${count} comandos"></div>`;
        }
    }
    
    html += '</div>';
    
    // Legend
    html += `
        <div class="heatmap-legend">
            <span>Menos</span>
            <div class="heatmap-legend-cell" style="background: var(--bg-tertiary);"></div>
            <div class="heatmap-legend-cell" style="background: rgba(59, 165, 92, 0.3);"></div>
            <div class="heatmap-legend-cell" style="background: rgba(59, 165, 92, 0.5);"></div>
            <div class="heatmap-legend-cell" style="background: rgba(59, 165, 92, 0.7);"></div>
            <div class="heatmap-legend-cell" style="background: var(--success-color);"></div>
            <span>Mais</span>
        </div>
    `;
    
    container.innerHTML = html;
}

function renderTopUsers(users) {
    const container = document.getElementById('top-users-list');
    
    if (!users || users.length === 0) {
        container.innerHTML = '<div class="metrics-empty">Nenhum usuário encontrado</div>';
        return;
    }
    
    container.innerHTML = users.map((user, index) => {
        const rankClass = index < 3 ? `rank-${index + 1}` : '';
        const avatarContent = user.avatar 
            ? `<img src="${user.avatar}" alt="${escapeHtml(user.displayName)}">`
            : escapeHtml((user.displayName || 'U').charAt(0).toUpperCase());
        
        return `
            <div class="top-user-item">
                <div class="top-user-rank ${rankClass}">#${index + 1}</div>
                <div class="top-user-avatar">${avatarContent}</div>
                <div class="top-user-info">
                    <div class="top-user-name">${escapeHtml(user.displayName || user.userId)}</div>
                    <div class="top-user-stats">Primeiro uso: ${user.firstSeen?.slice(5) || '-'} • Último: ${user.lastSeen?.slice(5) || '-'}</div>
                </div>
                <div class="top-user-days">${user.days} dias</div>
            </div>
        `;
    }).join('');
}

function renderCommandsPieChart(commands) {
    const ctx = document.getElementById('chart-commands-pie');
    if (!ctx) return;
    
    if (pieChart) {
        pieChart.destroy();
    }
    
    if (!commands || commands.length === 0) {
        return;
    }
    
    const colors = ['#F5A623', '#3BA55C', '#5865F2', '#EB459E', '#FEE75C', '#57F287'];
    
    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: commands.map(c => '/' + c.name),
            datasets: [{
                data: commands.map(c => c.count),
                backgroundColor: colors,
                borderColor: '#2D2A24',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#FFF8E7',
                        padding: 10,
                        font: { size: 11 },
                        boxWidth: 12,
                        usePointStyle: true
                    }
                }
            }
        }
    });
}

function renderCommandsChart(data) {
    const ctx = document.getElementById('chart-commands-daily');
    if (!ctx) return;
    
    if (commandsChart) {
        commandsChart.destroy();
    }
    
    commandsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Comandos',
                    data: data.datasets.commands,
                    borderColor: '#F5A623',
                    backgroundColor: 'rgba(245, 166, 35, 0.1)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Usuários',
                    data: data.datasets.users,
                    borderColor: '#3BA55C',
                    backgroundColor: 'rgba(59, 165, 92, 0.1)',
                    fill: true,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { labels: { color: '#FFF8E7' } }
            },
            scales: {
                x: { ticks: { color: '#D4C5A9' }, grid: { color: '#4A4639' } },
                y: { beginAtZero: true, ticks: { color: '#D4C5A9' }, grid: { color: '#4A4639' } }
            }
        }
    });
}

function renderHourlyChart(data) {
    const ctx = document.getElementById('chart-commands-hourly');
    if (!ctx) return;
    
    if (hourlyChart) {
        hourlyChart.destroy();
    }
    
    hourlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Comandos',
                data: data.counts,
                backgroundColor: '#F5A623',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#D4C5A9', maxRotation: 45, minRotation: 45 }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: '#D4C5A9' }, grid: { color: '#4A4639' } }
            }
        }
    });
}

function renderErrorsChart(data) {
    const ctx = document.getElementById('chart-errors-daily');
    if (!ctx) return;
    
    if (errorsChart) {
        errorsChart.destroy();
    }
    
    errorsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Erros',
                data: data.errors,
                backgroundColor: '#ED4245',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#D4C5A9' }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: '#D4C5A9' }, grid: { color: '#4A4639' } }
            }
        }
    });
}

function renderResponseTimesChart(data) {
    const ctx = document.getElementById('chart-response-times');
    if (!ctx) return;
    
    if (responseTimesChart) {
        responseTimesChart.destroy();
    }
    
    responseTimesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Tempo Médio (ms)',
                data: data.avgTimes,
                borderColor: '#5865F2',
                backgroundColor: 'rgba(88, 101, 242, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#D4C5A9' }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: '#D4C5A9' }, grid: { color: '#4A4639' } }
            }
        }
    });
}

async function resetMetrics() {
    if (!confirm('Tem certeza que deseja resetar todas as métricas? Esta ação não pode ser desfeita.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/metrics/reset', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showToast('Métricas resetadas!', 'success');
            loadMetrics();
        } else {
            showToast(result.error || 'Erro ao resetar métricas', 'error');
        }
    } catch (error) {
        console.error('Error resetting metrics:', error);
        showToast('Erro ao resetar métricas', 'error');
    }
}

// Alerts
function initAlerts() {
    document.getElementById('btn-filter-alerts').addEventListener('click', loadAlerts);
    document.getElementById('btn-refresh-alerts').addEventListener('click', refreshAlerts);
    document.getElementById('create-alert-form').addEventListener('submit', createAlert);
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

async function createAlert(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Criando...';
    
    const userId = document.getElementById('alert-user-id').value.trim();
    const searchTerm = document.getElementById('alert-search-term').value.trim();
    const server = document.getElementById('alert-server').value;
    const storeType = document.getElementById('alert-type').value;
    const maxPrice = document.getElementById('alert-max-price').value;
    const minQuantity = document.getElementById('alert-min-quantity').value;
    
    try {
        const response = await fetch('/api/alerts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                searchTerm,
                server,
                storeType,
                maxPrice: maxPrice || null,
                minQuantity: minQuantity || null
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Alerta criado com sucesso!', 'success');
            form.reset();
            loadAlerts();
        } else {
            showToast(result.error || 'Erro ao criar alerta', 'error');
        }
    } catch (error) {
        console.error('Error creating alert:', error);
        showToast('Erro ao criar alerta', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Criar Alerta';
    }
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
    
    // Store alerts for edit modal
    window.alertsData = alerts;
    
    tbody.innerHTML = alerts.map(alert => {
        const typeLabel = alert.storeType === 'BUY' ? 'Comprando' : 'Vendendo';
        const maxPrice = alert.maxPrice ? formatPrice(alert.maxPrice) : '-';
        const lowestPrice = alert.lowestPriceSeen ? formatPrice(alert.lowestPriceSeen) : '-';
        const createdAt = formatDateShort(new Date(alert.createdAt));
        
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
                <td class="actions-cell">
                    <button class="btn btn-primary btn-sm" onclick="openEditAlert('${alert.id}')" title="Editar">
                        ✏️
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteAlert('${alert.id}')" title="Remover">
                        🗑️
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

// Edit Alert Modal
function openEditAlert(alertId) {
    const alert = window.alertsData?.find(a => a.id === alertId);
    if (!alert) {
        showToast('Alerta não encontrado', 'error');
        return;
    }
    
    // Fill form with current values
    document.getElementById('edit-alert-id').value = alert.id;
    document.getElementById('edit-alert-search').value = alert.searchTerm;
    document.getElementById('edit-alert-server').value = alert.server;
    document.getElementById('edit-alert-type').value = alert.storeType;
    document.getElementById('edit-alert-price').value = alert.maxPrice || '';
    document.getElementById('edit-alert-quantity').value = alert.minQuantity || '';
    
    // Show modal
    document.getElementById('edit-alert-modal').classList.add('active');
}

function closeEditAlert() {
    document.getElementById('edit-alert-modal').classList.remove('active');
}

async function saveEditAlert(e) {
    e.preventDefault();
    
    const alertId = document.getElementById('edit-alert-id').value;
    const searchTerm = document.getElementById('edit-alert-search').value.trim();
    const server = document.getElementById('edit-alert-server').value;
    const storeType = document.getElementById('edit-alert-type').value;
    const maxPrice = document.getElementById('edit-alert-price').value;
    const minQuantity = document.getElementById('edit-alert-quantity').value;
    
    if (!searchTerm) {
        showToast('O termo de busca é obrigatório', 'error');
        return;
    }
    
    const submitBtn = document.querySelector('#edit-alert-form button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando...';
    
    try {
        const response = await fetch(`/api/alerts/${alertId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                searchTerm,
                server,
                storeType,
                maxPrice: maxPrice ? parseInt(maxPrice, 10) : null,
                minQuantity: minQuantity ? parseInt(minQuantity, 10) : null
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Alerta atualizado com sucesso!', 'success');
            closeEditAlert();
            loadAlerts();
        } else {
            showToast(result.error || 'Erro ao atualizar alerta', 'error');
        }
    } catch (error) {
        console.error('Error updating alert:', error);
        showToast('Erro ao atualizar alerta', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salvar';
    }
}

// Parties/Groups
let partiesData = [];

function initParties() {
    document.getElementById('btn-filter-parties').addEventListener('click', loadParties);
    document.getElementById('btn-refresh-parties').addEventListener('click', refreshParties);
}

async function refreshParties() {
    const btn = document.getElementById('btn-refresh-parties');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Atualizando...';
    
    await loadParties();
    
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">🔄</span> Atualizar';
    showToast('Lista de grupos atualizada!', 'success');
}

async function loadParties() {
    const status = document.getElementById('filter-party-status').value;
    
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    
    try {
        const response = await fetch(`/api/parties?${params}`);
        const result = await response.json();
        
        if (result.success) {
            partiesData = result.data.parties;
            renderParties(result.data.parties);
            updatePartyStats(result.data.stats);
        }
    } catch (error) {
        console.error('Error loading parties:', error);
        showToast('Erro ao carregar grupos', 'error');
    }
}

function updatePartyStats(stats) {
    document.getElementById('stat-total-parties').textContent = stats.active || 0;
    document.getElementById('stat-open-parties').textContent = stats.open || 0;
    document.getElementById('stat-full-parties').textContent = stats.full || 0;
}

function renderParties(parties) {
    const tbody = document.getElementById('parties-table-body');
    
    if (parties.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Nenhum grupo encontrado</td></tr>';
        return;
    }
    
    const statusEmoji = {
        open: '🟢',
        full: '🟡',
        started: '🔵',
        cancelled: '🔴',
        completed: '⚫'
    };
    
    const statusText = {
        open: 'Aberto',
        full: 'Cheio',
        started: 'Iniciado',
        cancelled: 'Cancelado',
        completed: 'Finalizado'
    };
    
    tbody.innerHTML = parties.map(party => {
        const scheduledAt = new Date(party.scheduledAt);
        const scheduledStr = formatDateShort(scheduledAt);
        
        const creator = party.creator || { displayName: party.creatorId, avatar: null };
        const avatarHtml = creator.avatar 
            ? `<img src="${creator.avatar}" alt="${escapeHtml(creator.displayName)}" class="user-avatar">`
            : `<div class="user-avatar-placeholder">${escapeHtml(creator.displayName.charAt(0).toUpperCase())}</div>`;
        
        const participantsList = party.participants.length > 0
            ? party.participants.map(p => `${p.userName} (${p.className})`).join(', ')
            : 'Nenhum';
        
        const canEdit = party.status === 'open' || party.status === 'full';
        const canCancel = party.status === 'open' || party.status === 'full';
        const canDelete = party.status === 'cancelled' || party.status === 'started' || party.status === 'completed';
        
        return `
            <tr>
                <td><strong>${escapeHtml(party.instanceName)}</strong></td>
                <td class="user-cell">
                    ${avatarHtml}
                    <span class="user-name">${escapeHtml(creator.displayName)}</span>
                </td>
                <td>${scheduledStr}</td>
                <td title="${escapeHtml(participantsList)}">${party.participants.length}/${party.maxSlots}</td>
                <td>${statusEmoji[party.status] || '❓'} ${statusText[party.status] || party.status}</td>
                <td>${escapeHtml(party.guildName || party.guildId)}</td>
                <td class="actions-cell">
                    ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openEditParty('${party.id}')" title="Editar">✏️</button>` : ''}
                    ${canCancel ? `<button class="btn btn-warning btn-sm" onclick="cancelParty('${party.id}')" title="Cancelar">❌</button>` : ''}
                    ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteParty('${party.id}')" title="Remover">🗑️</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

// Store classes data
let classesData = null;

async function loadClassesData() {
    if (classesData) return classesData;
    
    try {
        const response = await fetch('/api/classes');
        const result = await response.json();
        if (result.success) {
            classesData = result.data;
        }
    } catch (error) {
        console.error('Error loading classes:', error);
    }
    return classesData;
}

async function openEditParty(partyId) {
    const party = partiesData.find(p => p.id === partyId);
    if (!party) {
        showToast('Grupo não encontrado', 'error');
        return;
    }
    
    // Load classes if not already loaded
    await loadClassesData();
    
    const statusText = {
        open: '🟢 Aberto',
        full: '🟡 Cheio',
        started: '🔵 Iniciado',
        cancelled: '🔴 Cancelado'
    };
    
    const statusClass = {
        open: 'status-open',
        full: 'status-full',
        started: 'status-started',
        cancelled: 'status-cancelled'
    };
    
    document.getElementById('edit-party-id').value = party.id;
    document.getElementById('edit-party-instance').textContent = party.instanceName;
    
    const statusBadge = document.getElementById('edit-party-status');
    statusBadge.textContent = statusText[party.status] || party.status;
    statusBadge.className = `party-status-badge ${statusClass[party.status] || ''}`;
    
    document.getElementById('edit-party-datetime').textContent = formatDate(new Date(party.scheduledAt));
    document.getElementById('edit-party-guild').textContent = party.guildName || party.guildId;
    
    const creator = party.creator || { displayName: party.creatorId };
    document.getElementById('edit-party-creator').textContent = creator.displayName;
    
    document.getElementById('edit-party-count').textContent = party.participants.length;
    document.getElementById('edit-party-max').textContent = party.maxSlots;
    
    renderPartyParticipants(party);
    renderClassLimits(party);
    
    document.getElementById('edit-party-modal').style.display = 'flex';
}

function renderClassLimits(party) {
    const container = document.getElementById('edit-party-class-limits');
    
    if (!classesData || !classesData.classes) {
        container.innerHTML = '<p>Carregando classes...</p>';
        return;
    }
    
    const classes = classesData.classes;
    const currentLimits = party.classLimits || {};
    
    // Only show main classes (not FLEX)
    const mainClasses = Object.entries(classes).filter(([key]) => key !== 'FLEX');
    
    container.innerHTML = mainClasses.map(([key, info]) => {
        const limit = currentLimits[key] !== undefined ? currentLimits[key] : '';
        return `
            <div class="class-limit-item">
                <span class="class-emoji">${info.emoji}</span>
                <span class="class-name">${info.name}</span>
                <input type="number" min="0" max="120" 
                    data-class="${key}" 
                    value="${limit}" 
                    placeholder="-">
            </div>
        `;
    }).join('');
}

async function saveClassLimits() {
    const partyId = document.getElementById('edit-party-id').value;
    const container = document.getElementById('edit-party-class-limits');
    const inputs = container.querySelectorAll('input[data-class]');
    
    const classLimits = {};
    
    inputs.forEach(input => {
        const classType = input.dataset.class;
        const value = input.value.trim();
        
        if (value !== '' && !isNaN(parseInt(value))) {
            classLimits[classType] = parseInt(value);
        }
    });
    
    try {
        const response = await fetch(`/api/parties/${partyId}/class-limits`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classLimits })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Limites de classe salvos!', 'success');
            await loadParties();
            
            // Update the modal with fresh data
            const updatedParty = partiesData.find(p => p.id === partyId);
            if (updatedParty) {
                renderClassLimits(updatedParty);
            }
        } else {
            showToast(result.error || 'Erro ao salvar limites', 'error');
        }
    } catch (error) {
        console.error('Error saving class limits:', error);
        showToast('Erro ao salvar limites', 'error');
    }
}

function renderPartyParticipants(party) {
    const container = document.getElementById('edit-party-participants');
    
    if (party.participants.length === 0) {
        container.innerHTML = '<p class="no-participants">Nenhum participante</p>';
        return;
    }
    
    const canRemove = party.status === 'open' || party.status === 'full';
    
    container.innerHTML = party.participants.map(p => `
        <div class="participant-item">
            <div class="participant-info">
                <span class="participant-class">${p.classEmoji || '👤'}</span>
                <div>
                    <div class="participant-name">${escapeHtml(p.userName)}</div>
                    <div class="participant-class-name">${escapeHtml(p.className)}</div>
                </div>
            </div>
            ${canRemove ? `
                <div class="participant-actions">
                    <button class="btn btn-danger btn-sm" onclick="removeParticipant('${party.id}', '${p.userId}')">Remover</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function closeEditParty() {
    document.getElementById('edit-party-modal').style.display = 'none';
}

async function removeParticipant(partyId, userId) {
    if (!confirm('Tem certeza que deseja remover este participante?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/parties/${partyId}/participants/${userId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Participante removido!', 'success');
            await loadParties();
            
            // Reopen the modal with updated data
            const updatedParty = partiesData.find(p => p.id === partyId);
            if (updatedParty) {
                document.getElementById('edit-party-count').textContent = updatedParty.participants.length;
                renderPartyParticipants(updatedParty);
                
                // Update status badge if needed
                const statusText = {
                    open: '🟢 Aberto',
                    full: '🟡 Cheio'
                };
                const statusClass = {
                    open: 'status-open',
                    full: 'status-full'
                };
                const statusBadge = document.getElementById('edit-party-status');
                statusBadge.textContent = statusText[updatedParty.status] || updatedParty.status;
                statusBadge.className = `party-status-badge ${statusClass[updatedParty.status] || ''}`;
            }
        } else {
            showToast(result.error || 'Erro ao remover participante', 'error');
        }
    } catch (error) {
        showToast('Erro ao remover participante', 'error');
    }
}

async function cancelParty(partyId) {
    if (!confirm('Tem certeza que deseja cancelar este grupo? Os participantes serão notificados.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/parties/${partyId}`, { method: 'DELETE' });
        const result = await response.json();
        
        if (result.success) {
            showToast('Grupo cancelado!', 'success');
            loadParties();
        } else {
            showToast(result.error || 'Erro ao cancelar grupo', 'error');
        }
    } catch (error) {
        showToast('Erro ao cancelar grupo', 'error');
    }
}

async function deleteParty(partyId) {
    if (!confirm('Tem certeza que deseja remover permanentemente este grupo?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/parties/${partyId}/cleanup`, { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showToast('Grupo removido!', 'success');
            loadParties();
        } else {
            showToast(result.error || 'Erro ao remover grupo', 'error');
        }
    } catch (error) {
        showToast('Erro ao remover grupo', 'error');
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
    document.getElementById('btn-reload-env')?.addEventListener('click', loadEnvEditor);
    document.getElementById('btn-save-env')?.addEventListener('click', saveEnvVariables);
    
    // Load env editor
    loadEnvEditor();
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

// ==================== ENV EDITOR ====================

let envOriginalValues = {};

async function loadEnvEditor() {
    const container = document.getElementById('env-editor-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Carregando variáveis...</div>';
    
    try {
        const response = await fetch('/api/env');
        const result = await response.json();
        
        if (!result.success) {
            container.innerHTML = `<div class="error">❌ ${result.error}</div>`;
            return;
        }
        
        const { groups } = result.data;
        envOriginalValues = {};
        
        let html = '';
        
        for (const group of groups) {
            html += `
                <div class="env-group">
                    <div class="env-group-header" onclick="toggleEnvGroup(this)">
                        <span class="env-group-title">${group.icon} ${group.group}</span>
                        <span class="env-group-count">${group.vars.length} variável(is)</span>
                        <span class="env-group-toggle">▼</span>
                    </div>
                    <div class="env-group-body">
            `;
            
            for (const v of group.vars) {
                // Store original values for change detection
                envOriginalValues[v.key] = v.value;
                
                const requiredBadge = v.required ? '<span class="env-required">obrigatório</span>' : '';
                const sensitiveBadge = v.sensitive ? '<span class="env-sensitive">🔒 sensível</span>' : '';
                const statusDot = v.hasValue 
                    ? '<span class="env-status-dot defined" title="Definida">●</span>' 
                    : '<span class="env-status-dot empty" title="Não definida">○</span>';
                
                const inputType = v.sensitive ? 'password' : 'text';
                const placeholder = v.sensitive && v.hasValue 
                    ? 'Deixe como está para manter o valor atual' 
                    : (v.help || '');
                
                html += `
                    <div class="env-var-row">
                        <div class="env-var-header">
                            <label for="env-${v.key}">
                                ${statusDot}
                                <span class="env-var-label">${v.label}</span>
                                <code class="env-var-key">${v.key}</code>
                            </label>
                            <div class="env-var-badges">
                                ${requiredBadge}
                                ${sensitiveBadge}
                            </div>
                        </div>
                        <div class="env-var-input-group">
                            <input 
                                type="${inputType}" 
                                id="env-${v.key}" 
                                data-env-key="${v.key}" 
                                data-sensitive="${v.sensitive}"
                                value="${escapeHtml(v.value)}" 
                                placeholder="${escapeHtml(placeholder)}"
                                class="env-var-input"
                                autocomplete="off"
                            >
                            ${v.sensitive ? `<button type="button" class="btn-env-toggle" onclick="toggleEnvVisibility('env-${v.key}')" title="Mostrar/ocultar">👁️</button>` : ''}
                        </div>
                        ${v.help ? `<small class="env-var-help">${v.help}</small>` : ''}
                    </div>
                `;
            }
            
            html += `
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading env:', error);
        container.innerHTML = `<div class="error">❌ Erro ao carregar: ${error.message}</div>`;
    }
}

function toggleEnvGroup(header) {
    const body = header.nextElementSibling;
    const toggle = header.querySelector('.env-group-toggle');
    
    if (body.style.display === 'none') {
        body.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        body.style.display = 'none';
        toggle.textContent = '▶';
    }
}

async function toggleEnvVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const key = input.dataset.envKey;
    const isSensitive = input.dataset.sensitive === 'true';
    
    if (input.type === 'password') {
        // Reveal: if value is still masked, fetch the real one
        if (isSensitive && input.value.includes('•')) {
            try {
                const response = await fetch(`/api/env/reveal/${encodeURIComponent(key)}`);
                const result = await response.json();
                
                if (result.success) {
                    input.value = result.data.value;
                    envOriginalValues[key] = result.data.value;
                } else {
                    showToast(result.error || 'Erro ao revelar valor', 'error');
                    return;
                }
            } catch (error) {
                showToast('Erro ao revelar valor', 'error');
                return;
            }
        }
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

async function saveEnvVariables() {
    const inputs = document.querySelectorAll('[data-env-key]');
    const variables = {};
    let changeCount = 0;
    
    inputs.forEach(input => {
        const key = input.dataset.envKey;
        const value = input.value;
        const isSensitive = input.dataset.sensitive === 'true';
        const original = envOriginalValues[key];
        
        // Skip if value contains mask characters (user didn't change it)
        if (isSensitive && value.includes('•')) {
            return;
        }
        
        // Skip if value hasn't changed
        if (value === original) {
            return;
        }
        
        variables[key] = value;
        changeCount++;
    });
    
    if (changeCount === 0) {
        showToast('Nenhuma alteração detectada', 'info');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja salvar ${changeCount} alteração(ões) no .env?\n\nO bot precisará ser reiniciado para aplicar as mudanças.`)) {
        return;
    }
    
    const hint = document.getElementById('env-save-hint');
    
    try {
        const response = await fetch('/api/env', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ variables })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast(result.data.message, 'success');
            
            if (hint) {
                hint.style.display = 'inline';
                hint.className = 'env-save-hint success';
                hint.textContent = '✅ ' + result.data.message;
                setTimeout(() => { hint.style.display = 'none'; }, 10000);
            }
            
            // Reload the editor to show updated values
            loadEnvEditor();
        } else {
            showToast(result.error || 'Erro ao salvar', 'error');
            if (hint) {
                hint.style.display = 'inline';
                hint.className = 'env-save-hint error';
                hint.textContent = '❌ ' + (result.error || 'Erro');
            }
        }
    } catch (error) {
        console.error('Error saving env:', error);
        showToast('Erro ao salvar variáveis', 'error');
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

// News Section
function initNews() {
    document.getElementById('btn-refresh-news').addEventListener('click', forceRefreshNews);
    document.getElementById('btn-reload-news').addEventListener('click', loadNews);
}

async function loadNews() {
    try {
        const response = await fetch('/api/news');
        const result = await response.json();
        
        if (result.success) {
            const data = result.data;
            
            // Update cache info
            document.getElementById('news-count').textContent = data.cache.newsCount || 0;
            
            if (data.cache.lastRefresh) {
                const lastRefresh = new Date(data.cache.lastRefresh);
                document.getElementById('news-last-refresh').textContent = formatTimeAgo(lastRefresh);
            } else {
                document.getElementById('news-last-refresh').textContent = 'Nunca';
            }
            
            document.getElementById('news-refresh-days').textContent = 
                data.cache.refreshDays ? data.cache.refreshDays.join(', ') : '-';
            
            document.getElementById('news-should-refresh').textContent = 
                data.cache.shouldRefresh ? 'Pendente' : 'Atualizado';
            
            // Update category counts
            document.getElementById('news-cat-avisos').textContent = data.categories.avisos || 0;
            document.getElementById('news-cat-atualizacoes').textContent = data.categories.atualizacoes || 0;
            document.getElementById('news-cat-eventos').textContent = data.categories.eventos || 0;
            document.getElementById('news-cat-outros').textContent = data.categories.outros || 0;
            
            // Render news list
            renderNewsList(data.news, data.categorizedNews);
        } else {
            showToast(result.error || 'Erro ao carregar notícias', 'error');
        }
    } catch (error) {
        console.error('Error loading news:', error);
        showToast('Erro ao carregar notícias', 'error');
    }
}

function renderNewsList(news, categorizedNews) {
    const container = document.getElementById('news-list');
    
    if (!news || news.length === 0) {
        container.innerHTML = '<div class="news-empty">Nenhuma notícia em cache. Clique em "Forçar Atualização" para buscar.</div>';
        return;
    }
    
    // Determine category for each news item
    const newsWithCategory = news.map(item => {
        let category = 'outro';
        if (categorizedNews.avisos.some(n => n.id === item.id)) category = 'aviso';
        else if (categorizedNews.atualizacoes.some(n => n.id === item.id)) category = 'atualizacao';
        else if (categorizedNews.eventos.some(n => n.id === item.id)) category = 'evento';
        return { ...item, displayCategory: category };
    });
    
    const categoryLabels = {
        'aviso': 'Aviso',
        'atualizacao': 'Atualização',
        'evento': 'Evento',
        'outro': 'Outro'
    };
    
    container.innerHTML = newsWithCategory.map(item => `
        <div class="news-item">
            <div class="news-item-content">
                <div class="news-item-title">
                    <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
                        ${escapeHtml(item.title || 'Sem título')}
                    </a>
                </div>
                <div class="news-item-meta">
                    <span class="news-item-category ${item.displayCategory}">${categoryLabels[item.displayCategory]}</span>
                    ${item.date ? `<span>📅 ${escapeHtml(item.date)}</span>` : ''}
                    <span>ID: ${escapeHtml(item.id)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

async function forceRefreshNews() {
    const btn = document.getElementById('btn-refresh-news');
    btn.disabled = true;
    btn.textContent = 'Atualizando...';
    
    try {
        const response = await fetch('/api/news/refresh', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showToast(`Notícias atualizadas! ${result.data.newsCount} notícias carregadas.`, 'success');
            loadNews();
        } else {
            showToast(result.error || 'Erro ao atualizar notícias', 'error');
        }
    } catch (error) {
        console.error('Error refreshing news:', error);
        showToast('Erro ao atualizar notícias', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Forçar Atualização';
    }
}

// Deploy
let availableCommandsList = [];

function initDeploy() {
    document.getElementById('btn-deploy-global').addEventListener('click', deployGlobal);
    document.getElementById('btn-clear-global').addEventListener('click', clearGlobalCommands);
    document.getElementById('btn-select-all-commands').addEventListener('click', selectAllCommands);
    document.getElementById('btn-deselect-all-commands').addEventListener('click', deselectAllCommands);
}

function selectAllCommands() {
    const checkboxes = document.querySelectorAll('#available-commands input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = true;
        cb.closest('.command-checkbox').classList.add('selected');
    });
    updateSelectedCount();
}

function deselectAllCommands() {
    const checkboxes = document.querySelectorAll('#available-commands input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = false;
        cb.closest('.command-checkbox').classList.remove('selected');
    });
    updateSelectedCount();
}

function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('#available-commands input[type="checkbox"]:checked');
    const countEl = document.getElementById('selected-commands-count');
    const count = checkboxes.length;
    countEl.textContent = count === 0 ? 'Nenhum selecionado (todos serão deployados)' : `${count} selecionado(s)`;
}

function getSelectedCommands() {
    const checkboxes = document.querySelectorAll('#available-commands input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
        return null; // null = deploy all
    }
    return Array.from(checkboxes).map(cb => cb.value);
}

async function loadDeployStatus() {
    try {
        const response = await fetch('/api/deploy/status');
        const result = await response.json();
        
        if (result.success) {
            availableCommandsList = result.data.availableCommands || [];
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
    
    // Render available commands with checkboxes
    const commandsContainer = document.getElementById('available-commands');
    if (data.availableCommands && data.availableCommands.length > 0) {
        commandsContainer.innerHTML = data.availableCommands.map(cmd => `
            <label class="command-checkbox" for="cmd-${cmd.name}">
                <input type="checkbox" id="cmd-${cmd.name}" value="${cmd.name}" onchange="toggleCommandSelection(this)">
                <span class="cmd-name">/${cmd.name}</span>
                <span class="cmd-desc">${escapeHtml(cmd.description)}</span>
            </label>
        `).join('');
        updateSelectedCount();
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

function toggleCommandSelection(checkbox) {
    const label = checkbox.closest('.command-checkbox');
    if (checkbox.checked) {
        label.classList.add('selected');
    } else {
        label.classList.remove('selected');
    }
    updateSelectedCount();
}

async function deployGlobal() {
    const selectedCommands = getSelectedCommands();
    const commandCount = selectedCommands ? selectedCommands.length : availableCommandsList.length;
    const commandText = selectedCommands ? `${commandCount} comando(s) selecionado(s)` : 'todos os comandos';
    
    if (!confirm(`Tem certeza que deseja fazer o deploy global de ${commandText}? Pode levar até 1 hora para propagar.`)) {
        return;
    }
    
    const btn = document.getElementById('btn-deploy-global');
    btn.disabled = true;
    btn.textContent = 'Deployando...';
    
    try {
        const response = await fetch('/api/deploy/global', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands: selectedCommands })
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
    const selectedCommands = getSelectedCommands();
    
    try {
        const response = await fetch(`/api/deploy/guild/${guildId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands: selectedCommands })
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

// Default timezone (BRT - Brasília Time)
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

// Get user's timezone or default to BRT
function getUserTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
    } catch {
        return DEFAULT_TIMEZONE;
    }
}

function formatDate(date, options = {}) {
    const timezone = getUserTimezone();
    const showTimezone = options.showTimezone !== false;
    
    const formatted = date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone
    });
    
    if (showTimezone) {
        // Get short timezone name
        const tzName = date.toLocaleString('pt-BR', {
            timeZone: timezone,
            timeZoneName: 'short'
        }).split(' ').pop();
        
        return `${formatted} (${tzName})`;
    }
    
    return formatted;
}

function formatDateShort(date) {
    const timezone = getUserTimezone();
    
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone
    });
}

function formatTime(date) {
    const timezone = getUserTimezone();
    
    return date.toLocaleString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: timezone
    });
}

function formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'agora';
    if (diffMins < 60) return `há ${diffMins} min`;
    if (diffHours < 24) return `há ${diffHours}h`;
    if (diffDays < 7) return `há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
    
    return formatDateShort(date);
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

// ==================== AUDIT LOG ====================

let currentAuditPage = 0;
const auditPageSize = 100;
let totalAuditEntries = 0;

function initAudit() {
    document.getElementById('btn-filter-audit').addEventListener('click', () => {
        currentAuditPage = 0;
        loadAuditEntries();
    });
    
    document.getElementById('btn-refresh-audit').addEventListener('click', () => {
        loadAuditStats();
        loadAuditEntries();
    });
    
    document.getElementById('btn-export-audit-json').addEventListener('click', () => exportAudit('json'));
    document.getElementById('btn-export-audit-csv').addEventListener('click', () => exportAudit('csv'));
    
    document.getElementById('btn-cleanup-audit').addEventListener('click', cleanupAudit);
}

async function loadAuditStats() {
    try {
        const response = await fetch('/api/audit/stats?days=7');
        const result = await response.json();
        
        if (result.success) {
            const stats = result.data;
            document.getElementById('audit-total').textContent = stats.totalAllTime.toLocaleString();
            document.getElementById('audit-success-rate').textContent = `${stats.successRate}%`;
            
            // Count today's entries
            const today = new Date().toISOString().split('T')[0];
            const todayCount = stats.perDay[today] || 0;
            document.getElementById('audit-today').textContent = todayCount.toLocaleString();
            
            // Count Discord commands
            const commandCount = stats.byType['DISCORD_COMMAND'] || 0;
            document.getElementById('audit-commands').textContent = commandCount.toLocaleString();
        }
    } catch (error) {
        console.error('Error loading audit stats:', error);
    }
}

async function loadAuditEntries() {
    const container = document.getElementById('audit-container');
    container.innerHTML = '<div class="loading">Carregando...</div>';
    
    try {
        const params = new URLSearchParams();
        
        const type = document.getElementById('filter-audit-type').value;
        const action = document.getElementById('filter-audit-action').value;
        const dateFrom = document.getElementById('filter-audit-date-from').value;
        const dateTo = document.getElementById('filter-audit-date-to').value;
        const limit = document.getElementById('filter-audit-limit').value;
        
        if (type) params.append('type', type);
        if (action) params.append('action', action);
        if (dateFrom) params.append('dateFrom', dateFrom);
        if (dateTo) params.append('dateTo', dateTo + 'T23:59:59');
        params.append('limit', limit);
        params.append('offset', currentAuditPage * parseInt(limit, 10));
        
        const response = await fetch(`/api/audit?${params}`);
        const result = await response.json();
        
        if (result.success) {
            totalAuditEntries = result.pagination.total;
            renderAuditEntries(result.data);
            renderAuditPagination();
        } else {
            container.innerHTML = `<div class="error">Erro: ${result.error}</div>`;
        }
    } catch (error) {
        console.error('Error loading audit entries:', error);
        container.innerHTML = '<div class="error">Erro ao carregar registros</div>';
    }
}

function renderAuditEntries(entries) {
    const container = document.getElementById('audit-container');
    
    if (!entries || entries.length === 0) {
        container.innerHTML = '<div class="empty">Nenhum registro encontrado</div>';
        return;
    }
    
    container.innerHTML = entries.map(entry => {
        const date = new Date(entry.timestamp);
        const statusClass = entry.success ? 'success' : 'failure';
        const statusText = entry.success ? 'OK' : 'ERRO';
        
        const typeClass = getTypeClass(entry.type);
        const typeLabel = getTypeLabel(entry.type);
        const actionLabel = getActionLabel(entry.action);
        
        let detailsHtml = '';
        if (entry.details && Object.keys(entry.details).length > 0) {
            const detailsText = Object.entries(entry.details)
                .filter(([k, v]) => v !== null && v !== undefined)
                .slice(0, 3)
                .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                .join(' | ');
            if (detailsText) {
                detailsHtml = `<div class="audit-entry-details">${escapeHtml(detailsText)}</div>`;
            }
        }
        
        return `
            <div class="audit-entry">
                <div class="audit-entry-main">
                    <div class="audit-entry-header">
                        <span class="audit-entry-action">${actionLabel}</span>
                        <span class="audit-entry-type ${typeClass}">${typeLabel}</span>
                        <span class="audit-entry-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="audit-entry-meta">
                        <span class="audit-entry-actor">${escapeHtml(entry.actor?.name || 'Sistema')}</span>
                        ${entry.target ? `<span class="audit-entry-target">→ ${escapeHtml(entry.target.name || entry.target.id || '')}</span>` : ''}
                    </div>
                    ${detailsHtml}
                </div>
                <span class="audit-entry-time">${formatTimeAgo(date)}</span>
            </div>
        `;
    }).join('');
}

function getTypeClass(type) {
    switch (type) {
        case 'ADMIN_ACTION': return 'admin';
        case 'DISCORD_COMMAND': return 'discord';
        case 'PLUGIN_ACTION': return 'plugin';
        case 'SYSTEM': return 'system';
        default: return '';
    }
}

function getTypeLabel(type) {
    switch (type) {
        case 'ADMIN_ACTION': return 'Admin';
        case 'DISCORD_COMMAND': return 'Discord';
        case 'PLUGIN_ACTION': return 'Plugin';
        case 'SYSTEM': return 'System';
        default: return type || 'Outro';
    }
}

function getActionLabel(action) {
    const labels = {
        'alerts.create': 'Alerta Criado',
        'alerts.update': 'Alerta Atualizado',
        'alerts.delete': 'Alerta Removido',
        'alerts.force_check': 'Verificação Forçada',
        'parties.create': 'Grupo Criado',
        'parties.cancel': 'Grupo Cancelado',
        'parties.cleanup': 'Limpeza de Grupos',
        'parties.remove_participant': 'Participante Removido',
        'parties.update_class_limits': 'Limites de Classe',
        'config.update': 'Config Atualizada',
        'permissions.add': 'Permissão Adicionada',
        'permissions.remove': 'Permissão Removida',
        'deploy.global': 'Deploy Global',
        'deploy.guild': 'Deploy Servidor',
        'deploy.clear_global': 'Limpar Global',
        'deploy.clear_guild': 'Limpar Servidor',
        'service.start': 'Serviço Iniciado',
        'service.stop': 'Serviço Parado',
        'plugins.enable': 'Plugin Ativado',
        'plugins.disable': 'Plugin Desativado',
        'plugins.reload': 'Plugin Recarregado',
        'command.execute': 'Comando Discord',
        'system.bot_start': 'Bot Iniciado',
        'system.bot_stop': 'Bot Parado',
        'system.audit_cleanup': 'Limpeza de Audit',
        'backup.create': 'Backup Criado',
        'backup.restore': 'Backup Restaurado',
        'backup.delete': 'Backup Removido'
    };
    return labels[action] || action;
}

function renderAuditPagination() {
    const container = document.getElementById('audit-pagination');
    const limit = parseInt(document.getElementById('filter-audit-limit').value, 10);
    const totalPages = Math.ceil(totalAuditEntries / limit);
    
    if (totalPages <= 1) {
        container.innerHTML = `<span class="pagination-info">${totalAuditEntries} registro(s)</span>`;
        return;
    }
    
    container.innerHTML = `
        <button class="btn btn-secondary" ${currentAuditPage === 0 ? 'disabled' : ''} onclick="changeAuditPage(-1)">← Anterior</button>
        <span class="pagination-info">Página ${currentAuditPage + 1} de ${totalPages} (${totalAuditEntries} registros)</span>
        <button class="btn btn-secondary" ${currentAuditPage >= totalPages - 1 ? 'disabled' : ''} onclick="changeAuditPage(1)">Próxima →</button>
    `;
}

function changeAuditPage(delta) {
    currentAuditPage += delta;
    loadAuditEntries();
}

function exportAudit(format) {
    const params = new URLSearchParams();
    
    const type = document.getElementById('filter-audit-type').value;
    const action = document.getElementById('filter-audit-action').value;
    const dateFrom = document.getElementById('filter-audit-date-from').value;
    const dateTo = document.getElementById('filter-audit-date-to').value;
    
    if (type) params.append('type', type);
    if (action) params.append('action', action);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo + 'T23:59:59');
    params.append('format', format);
    
    window.open(`/api/audit/export?${params}`, '_blank');
}

async function cleanupAudit() {
    const days = prompt('Remover registros com mais de quantos dias?', '30');
    if (!days || isNaN(parseInt(days, 10))) return;
    
    if (!confirm(`Tem certeza que deseja remover registros com mais de ${days} dias?`)) return;
    
    try {
        const response = await fetch(`/api/audit/cleanup?days=${days}`, { method: 'DELETE' });
        const result = await response.json();
        
        if (result.success) {
            showToast(result.message, 'success');
            loadAuditStats();
            loadAuditEntries();
        } else {
            showToast(result.error || 'Erro ao limpar registros', 'error');
        }
    } catch (error) {
        console.error('Error cleaning up audit:', error);
        showToast('Erro ao limpar registros', 'error');
    }
}

// ==================== PLUGINS ====================

function initPlugins() {
    document.getElementById('btn-refresh-plugins').addEventListener('click', loadPlugins);
}

async function loadPlugins() {
    const container = document.getElementById('plugins-container');
    container.innerHTML = '<div class="loading">Carregando...</div>';
    
    try {
        const response = await fetch('/api/plugins');
        const result = await response.json();
        
        if (result.success) {
            renderPlugins(result.data);
        } else {
            container.innerHTML = `<div class="error">Erro: ${result.error}</div>`;
        }
    } catch (error) {
        console.error('Error loading plugins:', error);
        container.innerHTML = '<div class="error">Erro ao carregar plugins</div>';
    }
}

function renderPlugins(plugins) {
    const container = document.getElementById('plugins-container');
    
    if (!plugins || plugins.length === 0) {
        container.innerHTML = `
            <div class="plugins-empty">
                <div class="plugins-empty-icon">🔌</div>
                <h3>Nenhum plugin instalado</h3>
                <p>Crie uma pasta em <code>/plugins/</code> com um arquivo <code>plugin.json</code></p>
                <p>Consulte a documentação para criar seu primeiro plugin.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = plugins.map(plugin => {
        const statusClass = plugin.enabled ? 'enabled' : 'disabled';
        const statusText = plugin.enabled ? '✓ Ativado' : '○ Desativado';
        
        const commandsHtml = plugin.commands.length > 0
            ? `<div class="plugin-commands">
                ${plugin.commands.map(cmd => `<span class="plugin-command">/${cmd}</span>`).join('')}
               </div>`
            : '';
        
        const metaItems = [];
        if (plugin.author) metaItems.push(`<span class="plugin-meta-item">👤 ${escapeHtml(plugin.author)}</span>`);
        if (plugin.hasEvents) metaItems.push(`<span class="plugin-meta-item">📡 Eventos</span>`);
        if (plugin.loadedAt) metaItems.push(`<span class="plugin-meta-item">📦 Carregado</span>`);
        
        return `
            <div class="plugin-card ${statusClass}">
                <div class="plugin-header">
                    <span class="plugin-name">${escapeHtml(plugin.name)}</span>
                    <span class="plugin-version">v${escapeHtml(plugin.version)}</span>
                </div>
                <div class="plugin-description">${escapeHtml(plugin.description || 'Sem descrição')}</div>
                <div class="plugin-meta">${metaItems.join('')}</div>
                ${commandsHtml}
                <div class="plugin-actions">
                    <span class="plugin-status ${statusClass}">${statusText}</span>
                    ${plugin.enabled 
                        ? `<button class="btn btn-warning btn-sm" onclick="disablePlugin('${plugin.name}')">Desativar</button>`
                        : `<button class="btn btn-success btn-sm" onclick="enablePlugin('${plugin.name}')">Ativar</button>`
                    }
                    <button class="btn btn-secondary btn-sm" onclick="reloadPlugin('${plugin.name}')">Recarregar</button>
                </div>
            </div>
        `;
    }).join('');
}

async function enablePlugin(name) {
    try {
        const response = await fetch(`/api/plugins/${name}/enable`, { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showToast(result.message, 'success');
            loadPlugins();
            loadDeployStatus(); // Refresh commands list
        } else {
            showToast(result.error || 'Erro ao ativar plugin', 'error');
        }
    } catch (error) {
        console.error('Error enabling plugin:', error);
        showToast('Erro ao ativar plugin', 'error');
    }
}

async function disablePlugin(name) {
    if (!confirm(`Tem certeza que deseja desativar o plugin ${name}?`)) return;
    
    try {
        const response = await fetch(`/api/plugins/${name}/disable`, { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showToast(result.message, 'success');
            loadPlugins();
            loadDeployStatus(); // Refresh commands list
        } else {
            showToast(result.error || 'Erro ao desativar plugin', 'error');
        }
    } catch (error) {
        console.error('Error disabling plugin:', error);
        showToast('Erro ao desativar plugin', 'error');
    }
}

async function reloadPlugin(name) {
    try {
        const response = await fetch(`/api/plugins/${name}/reload`, { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showToast(result.message, 'success');
            loadPlugins();
            loadDeployStatus(); // Refresh commands list
        } else {
            showToast(result.error || 'Erro ao recarregar plugin', 'error');
        }
    } catch (error) {
        console.error('Error reloading plugin:', error);
        showToast('Erro ao recarregar plugin', 'error');
    }
}

// ==================== SHARED ACCOUNTS ====================

let currentEditAccountId = null;
let accountsData = null;

function initAccounts() {
    document.getElementById('btn-refresh-accounts').addEventListener('click', loadAccounts);
    document.getElementById('create-account-form').addEventListener('submit', createAccount);
    document.getElementById('filter-account-server').addEventListener('change', filterAccounts);
    document.getElementById('btn-save-account').addEventListener('click', saveAccount);
    document.getElementById('btn-delete-account').addEventListener('click', deleteAccount);
    document.getElementById('btn-generate-totp').addEventListener('click', generateTOTP);
    document.getElementById('btn-add-account-perm').addEventListener('click', addAccountPermission);
    
    // QR Code upload listeners
    document.getElementById('account-totp-qr')?.addEventListener('change', (e) => {
        handleQRCodeUpload(e, 'account-totp', 'create-qr-status');
    });
    document.getElementById('edit-account-totp-qr')?.addEventListener('change', (e) => {
        handleQRCodeUpload(e, 'edit-account-totp', 'edit-qr-status');
    });
    
    // Access logs event listeners
    document.getElementById('btn-refresh-logs')?.addEventListener('click', loadAccessLogs);
    document.getElementById('filter-logs-account')?.addEventListener('change', loadAccessLogs);
    document.getElementById('filter-logs-limit')?.addEventListener('change', loadAccessLogs);
}

async function loadAccounts() {
    const statusContainer = document.getElementById('accounts-plugin-status');
    const contentContainer = document.getElementById('accounts-content');
    const grid = document.getElementById('accounts-grid');
    
    grid.innerHTML = '<div class="loading">Carregando...</div>';
    
    try {
        const response = await fetch('/api/accounts');
        const result = await response.json();
        
        if (result.success) {
            // Plugin is enabled
            statusContainer.innerHTML = `
                <div class="alert alert-success">
                    <strong>✅ Plugin ativo</strong> - Sistema de contas compartilhadas funcionando normalmente.
                </div>
            `;
            contentContainer.style.display = 'block';
            
            accountsData = result.data;
            const accounts = result.data.accounts;
            
            // Update stats
            document.getElementById('stat-total-accounts').textContent = accounts.length;
            document.getElementById('stat-accounts-with-totp').textContent = 
                accounts.filter(a => a.hasTotpSecret).length;
            document.getElementById('stat-accounts-with-password').textContent = 
                accounts.filter(a => a.hasPassword).length;
            
            // Total permissions across all accounts
            const totalPermissions = accounts.reduce((sum, a) => sum + (a.permissions?.length || 0), 0);
            document.getElementById('stat-total-permissions').textContent = totalPermissions;
            
            renderAccounts(accounts);
            
            // Populate logs filter with accounts
            populateLogsAccountFilter(accounts);
            
            // Load access logs
            loadAccessLogs();
        } else {
            // Plugin not enabled
            statusContainer.innerHTML = `
                <div class="alert alert-warning">
                    <strong>⚠️ Plugin não habilitado</strong><br>
                    O plugin <code>shared-accounts</code> precisa estar ativado para usar este recurso.<br>
                    <a href="#plugins" class="nav-link" data-section="plugins">Ir para Plugins →</a>
                </div>
            `;
            statusContainer.style.display = 'block';
            contentContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading accounts:', error);
        statusContainer.innerHTML = `
            <div class="alert alert-error">
                <strong>❌ Erro ao carregar contas</strong><br>
                ${error.message}
            </div>
        `;
        statusContainer.style.display = 'block';
        contentContainer.style.display = 'none';
    }
}

/**
 * Populates the logs filter dropdown with accounts
 */
function populateLogsAccountFilter(accounts) {
    const filterSelect = document.getElementById('filter-logs-account');
    if (!filterSelect) return;
    
    // Keep the "All accounts" option
    filterSelect.innerHTML = '<option value="">Todas as contas</option>';
    
    // Add each account as an option
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = account.name;
        filterSelect.appendChild(option);
    });
}

/**
 * Loads access logs from the API
 */
async function loadAccessLogs() {
    const tbody = document.getElementById('access-logs-body');
    const emptyState = document.getElementById('access-logs-empty');
    const tableContainer = document.querySelector('.access-logs-table-container');
    
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" class="loading">Carregando logs...</td></tr>';
    
    try {
        const accountId = document.getElementById('filter-logs-account')?.value || '';
        const limit = document.getElementById('filter-logs-limit')?.value || '50';
        
        let url = `/api/accounts/logs/all?limit=${limit}`;
        if (accountId) {
            url += `&accountId=${accountId}`;
        }
        
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            const logs = result.data.logs;
            
            // Update stats
            document.getElementById('stat-total-logs').textContent = result.data.total;
            
            if (logs.length === 0) {
                tableContainer.style.display = 'none';
                emptyState.style.display = 'block';
                return;
            }
            
            tableContainer.style.display = 'block';
            emptyState.style.display = 'none';
            
            renderAccessLogs(logs);
        } else {
            tbody.innerHTML = `<tr><td colspan="4" class="error">Erro: ${result.error}</td></tr>`;
        }
    } catch (error) {
        console.error('Error loading access logs:', error);
        tbody.innerHTML = `<tr><td colspan="4" class="error">Erro ao carregar logs: ${error.message}</td></tr>`;
    }
}

/**
 * Renders access logs in the table
 */
function renderAccessLogs(logs) {
    const tbody = document.getElementById('access-logs-body');
    if (!tbody) return;
    
    tbody.innerHTML = logs.map(log => {
        const date = new Date(log.timestamp);
        const formattedDate = date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
        });
        const formattedTime = date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const actionLabels = {
            'view': 'Visualizou',
            'edit': 'Editou',
            'create': 'Criou',
            'delete': 'Deletou',
            'totp': 'TOTP'
        };
        
        const actionLabel = actionLabels[log.action] || log.action;
        
        return `
            <tr>
                <td class="log-timestamp">
                    <div>${formattedDate}</div>
                    <div>${formattedTime}</div>
                </td>
                <td class="log-account">
                    <span class="log-account-name">${escapeHtml(log.accountName || 'Desconhecida')}</span>
                    <span class="log-account-id">${log.accountId}</span>
                </td>
                <td class="log-user">
                    <span class="log-username">${escapeHtml(log.username)}</span>
                    <span class="log-userid">${log.userId}</span>
                </td>
                <td class="log-action">
                    <span class="log-action-badge ${log.action}">${actionLabel}</span>
                </td>
            </tr>
        `;
    }).join('');
}

function renderAccounts(accounts) {
    const grid = document.getElementById('accounts-grid');
    const filterServer = document.getElementById('filter-account-server').value;
    
    let filtered = accounts;
    if (filterServer) {
        filtered = accounts.filter(a => a.server === filterServer);
    }
    
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="accounts-empty">
                <div class="accounts-empty-icon">🔐</div>
                <h3>Nenhuma conta cadastrada</h3>
                <p>Use o formulário ao lado para criar a primeira conta.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filtered.map(account => {
        const permCount = account.permissions?.length || 0;
        const permAllowCount = account.permissions?.filter(p => p.action === 'allow').length || 0;
        const permDenyCount = account.permissions?.filter(p => p.action === 'deny').length || 0;
        const createdDate = account.createdAt ? new Date(account.createdAt).toLocaleDateString('pt-BR') : '-';
        
        // Owner display
        const ownerHtml = account.ownerId 
            ? `<div class="account-owner">Dono: ${account.ownerId}</div>` 
            : '';
        
        return `
            <div class="account-card server-${account.server.toLowerCase()}" onclick="openEditAccount('${account.id}')">
                <div class="account-header">
                    <span class="account-name">${escapeHtml(account.name)}</span>
                    <span class="account-server server-${account.server.toLowerCase()}">${account.server}</span>
                </div>
                <div class="account-login">${escapeHtml(account.login)}</div>
                ${ownerHtml}
                <div class="account-meta">
                    <span class="meta-item ${account.hasPassword ? 'active' : 'inactive'}">🔑 Senha</span>
                    <span class="meta-item ${account.hasKafraPassword ? 'active' : 'inactive'}">🏦 Kafra</span>
                    <span class="meta-item ${account.hasTotpSecret ? 'active' : 'inactive'}">🔢 TOTP</span>
                </div>
                <div class="account-footer">
                    <div class="account-permissions-summary">
                        ${permAllowCount > 0 ? `<span class="perm-count perm-allow">✅ ${permAllowCount}</span>` : ''}
                        ${permDenyCount > 0 ? `<span class="perm-count perm-deny">❌ ${permDenyCount}</span>` : ''}
                        ${permCount === 0 ? `<span class="perm-count">🔒 Sem permissões</span>` : ''}
                    </div>
                    <span class="account-date">📅 ${createdDate}</span>
                </div>
            </div>
        `;
    }).join('');
}

function filterAccounts() {
    if (accountsData) {
        renderAccounts(accountsData.accounts);
    }
}

/**
 * Handles QR code image upload and decodes TOTP secret
 * @param {Event} event - File input change event
 * @param {string} targetInputId - ID of the TOTP input to fill
 * @param {string} statusId - ID of the status element
 */
async function handleQRCodeUpload(event, targetInputId, statusId) {
    const file = event.target.files[0];
    if (!file) return;
    
    const statusEl = document.getElementById(statusId);
    const targetInput = document.getElementById(targetInputId);
    
    // Show loading state
    statusEl.style.display = 'block';
    statusEl.className = 'qr-decode-status loading';
    statusEl.innerHTML = '⏳ Processando QR Code...';
    
    try {
        // Read file as base64
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
            reader.readAsDataURL(file);
        });
        
        // Send to server for decoding
        const response = await fetch('/api/accounts/qr-decode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Fill the TOTP input with the decoded secret
            targetInput.value = result.data.secret;
            
            // Show success with details
            const details = [];
            if (result.data.issuer) details.push(result.data.issuer);
            if (result.data.label) details.push(result.data.label);
            const detailStr = details.length > 0 ? ` (${details.join(' - ')})` : '';
            
            statusEl.className = 'qr-decode-status success';
            statusEl.innerHTML = `✅ Secret TOTP extraído com sucesso!${detailStr}`;
            
            showToast('Secret TOTP importado do QR Code!', 'success');
        } else {
            statusEl.className = 'qr-decode-status error';
            statusEl.innerHTML = `❌ ${result.error}`;
        }
    } catch (error) {
        console.error('Error decoding QR code:', error);
        statusEl.className = 'qr-decode-status error';
        statusEl.innerHTML = `❌ Erro ao processar: ${error.message}`;
    }
    
    // Reset file input so the same file can be selected again
    event.target.value = '';
    
    // Auto-hide status after 8 seconds
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 8000);
}

async function createAccount(e) {
    e.preventDefault();
    
    const data = {
        name: document.getElementById('account-name').value,
        login: document.getElementById('account-login').value,
        password: document.getElementById('account-password').value || undefined,
        kafraPassword: document.getElementById('account-kafra').value || undefined,
        totpSecret: document.getElementById('account-totp').value || undefined,
        server: document.getElementById('account-server').value
    };
    
    try {
        const response = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Conta criada com sucesso!', 'success');
            document.getElementById('create-account-form').reset();
            // Hide QR status if visible
            const qrStatus = document.getElementById('create-qr-status');
            if (qrStatus) qrStatus.style.display = 'none';
            loadAccounts();
        } else {
            showToast(result.error || 'Erro ao criar conta', 'error');
        }
    } catch (error) {
        console.error('Error creating account:', error);
        showToast('Erro ao criar conta', 'error');
    }
}

function openEditAccount(accountId) {
    currentEditAccountId = accountId;
    const account = accountsData.accounts.find(a => a.id === accountId);
    
    if (!account) {
        showToast('Conta não encontrada', 'error');
        return;
    }
    
    // Fill form
    document.getElementById('edit-account-id').value = account.id;
    document.getElementById('edit-account-name').value = account.name;
    document.getElementById('edit-account-login').value = account.login;
    document.getElementById('edit-account-server').value = account.server;
    document.getElementById('edit-account-password').value = '';
    document.getElementById('edit-account-kafra').value = '';
    document.getElementById('edit-account-totp').value = '';
    
    // Update status
    document.getElementById('edit-has-password').textContent = `🔑 Senha: ${account.hasPassword ? '✓ Definida' : '✗ Não definida'}`;
    document.getElementById('edit-has-kafra').textContent = `🏦 Kafra: ${account.hasKafraPassword ? '✓ Definida' : '✗ Não definida'}`;
    document.getElementById('edit-has-totp').textContent = `🔢 TOTP: ${account.hasTotpSecret ? '✓ Configurado' : '✗ Não configurado'}`;
    
    // Hide TOTP result and QR status
    document.getElementById('totp-result').style.display = 'none';
    const editQrStatus = document.getElementById('edit-qr-status');
    if (editQrStatus) editQrStatus.style.display = 'none';
    
    // Render permissions
    renderAccountPermissions(account.permissions || []);
    
    // Show modal
    document.getElementById('edit-account-modal').style.display = 'flex';
}

function closeEditAccount() {
    document.getElementById('edit-account-modal').style.display = 'none';
    currentEditAccountId = null;
}

async function saveAccount() {
    if (!currentEditAccountId) return;
    
    const updates = {
        name: document.getElementById('edit-account-name').value,
        login: document.getElementById('edit-account-login').value,
        server: document.getElementById('edit-account-server').value
    };
    
    // Only include password fields if they have values
    const password = document.getElementById('edit-account-password').value;
    const kafra = document.getElementById('edit-account-kafra').value;
    const totp = document.getElementById('edit-account-totp').value;
    
    if (password) updates.password = password;
    if (kafra) updates.kafraPassword = kafra;
    if (totp) updates.totpSecret = totp;
    
    try {
        const response = await fetch(`/api/accounts/${currentEditAccountId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Conta atualizada com sucesso!', 'success');
            closeEditAccount();
            loadAccounts();
        } else {
            showToast(result.error || 'Erro ao atualizar conta', 'error');
        }
    } catch (error) {
        console.error('Error saving account:', error);
        showToast('Erro ao atualizar conta', 'error');
    }
}

async function deleteAccount() {
    if (!currentEditAccountId) return;
    
    if (!confirm('Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/accounts/${currentEditAccountId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Conta excluída com sucesso!', 'success');
            closeEditAccount();
            loadAccounts();
        } else {
            showToast(result.error || 'Erro ao excluir conta', 'error');
        }
    } catch (error) {
        console.error('Error deleting account:', error);
        showToast('Erro ao excluir conta', 'error');
    }
}

async function generateTOTP() {
    if (!currentEditAccountId) return;
    
    try {
        const response = await fetch(`/api/accounts/${currentEditAccountId}/totp`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('totp-code').textContent = result.data.code;
            document.getElementById('totp-timer').textContent = `${result.data.remainingSeconds}s`;
            document.getElementById('totp-result').style.display = 'flex';
            
            // Update timer countdown
            let remaining = result.data.remainingSeconds;
            const timerInterval = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(timerInterval);
                    document.getElementById('totp-timer').textContent = 'Expirado';
                } else {
                    document.getElementById('totp-timer').textContent = `${remaining}s`;
                }
            }, 1000);
        } else {
            showToast(result.error || 'Erro ao gerar código TOTP', 'error');
        }
    } catch (error) {
        console.error('Error generating TOTP:', error);
        showToast('Erro ao gerar código TOTP', 'error');
    }
}

function renderAccountPermissions(permissions) {
    const container = document.getElementById('account-permissions-list');
    
    if (!permissions || permissions.length === 0) {
        container.innerHTML = '<div class="no-permissions">Nenhuma permissão configurada</div>';
        return;
    }
    
    container.innerHTML = permissions.map(perm => {
        const typeLabel = {
            'userId': '👤 ID',
            'username': '📝 Usuário',
            'roleId': '🎭 Cargo'
        }[perm.type] || perm.type;
        
        const actionClass = perm.action === 'allow' ? 'allow' : 'deny';
        const actionIcon = perm.action === 'allow' ? '✅' : '❌';
        
        return `
            <div class="account-perm-item ${actionClass}">
                <span class="perm-type">${typeLabel}</span>
                <span class="perm-value">${escapeHtml(perm.value)}</span>
                <span class="perm-action">${actionIcon}</span>
                <button class="btn btn-danger btn-xs" onclick="removeAccountPermission('${perm.id}')">🗑️</button>
            </div>
        `;
    }).join('');
}

async function addAccountPermission() {
    if (!currentEditAccountId) return;
    
    const type = document.getElementById('account-perm-type').value;
    const value = document.getElementById('account-perm-value').value.trim();
    const action = document.getElementById('account-perm-action').value;
    
    if (!value) {
        showToast('Digite um valor para a permissão', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/accounts/${currentEditAccountId}/permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, value, action })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Permissão adicionada!', 'success');
            document.getElementById('account-perm-value').value = '';
            
            // Reload account data and re-render permissions
            const accountResponse = await fetch(`/api/accounts/${currentEditAccountId}`);
            const accountResult = await accountResponse.json();
            if (accountResult.success) {
                renderAccountPermissions(accountResult.data.permissions);
                // Update local cache
                const idx = accountsData.accounts.findIndex(a => a.id === currentEditAccountId);
                if (idx >= 0) {
                    accountsData.accounts[idx] = accountResult.data;
                }
            }
        } else {
            showToast(result.error || 'Erro ao adicionar permissão', 'error');
        }
    } catch (error) {
        console.error('Error adding permission:', error);
        showToast('Erro ao adicionar permissão', 'error');
    }
}

async function removeAccountPermission(permId) {
    if (!currentEditAccountId) return;
    
    try {
        const response = await fetch(`/api/accounts/${currentEditAccountId}/permissions/${permId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Permissão removida!', 'success');
            
            // Reload account data and re-render permissions
            const accountResponse = await fetch(`/api/accounts/${currentEditAccountId}`);
            const accountResult = await accountResponse.json();
            if (accountResult.success) {
                renderAccountPermissions(accountResult.data.permissions);
                // Update local cache
                const idx = accountsData.accounts.findIndex(a => a.id === currentEditAccountId);
                if (idx >= 0) {
                    accountsData.accounts[idx] = accountResult.data;
                }
            }
        } else {
            showToast(result.error || 'Erro ao remover permissão', 'error');
        }
    } catch (error) {
        console.error('Error removing permission:', error);
        showToast('Erro ao remover permissão', 'error');
    }
}

// ==================== SERVERS & PLAYER COUNTS ====================

let playerCountChart = null;
let currentChartHours = 24;

const SERVER_EMOJIS = {
    FREYA: '⚔️',
    NIDHOGG: '🐉',
    YGGDRASIL: '🌳',
    ACCOUNT: '🔐'
};

const SERVER_LABELS = {
    FREYA: 'Freya',
    NIDHOGG: 'Nidhogg',
    YGGDRASIL: 'Yggdrasil',
    ACCOUNT: 'Account Server'
};

async function loadServerData() {
    try {
        const [statusRes, playerRes, statsRes] = await Promise.all([
            fetch('/api/server-status').then(r => r.json()).catch(() => null),
            fetch('/api/player-count').then(r => r.json()).catch(() => null),
            fetch('/api/player-count/stats?days=30').then(r => r.json()).catch(() => null)
        ]);

        // Stat cards
        if (playerRes?.data) {
            document.getElementById('srv-total-players').textContent =
                playerRes.data.totalPlayers?.toLocaleString('pt-BR') || '—';
        }

        if (statsRes?.data?.stats) {
            const stats = statsRes.data.stats;
            document.getElementById('srv-total-captures').textContent =
                (stats.totalCaptures || 0).toLocaleString('pt-BR');
            document.getElementById('srv-peak-players').textContent =
                stats.peak ? stats.peak.total.toLocaleString('pt-BR') : '—';
        }

        // Server status table
        if (statusRes?.data) {
            const servers = statusRes.data.servers || {};
            let onlineCount = 0;
            let totalCount = 0;
            const rows = [];

            // Game servers first, then account
            const order = ['FREYA', 'NIDHOGG', 'YGGDRASIL', 'ACCOUNT'];

            for (const key of order) {
                const srv = servers[key];
                if (!srv) continue;
                totalCount++;

                const isOnline = srv.online === true;
                const isOffline = srv.online === false;
                if (isOnline) onlineCount++;

                const statusClass = isOnline ? 'online' : isOffline ? 'offline' : 'unknown';
                const statusLabel = isOnline ? 'Online' : isOffline ? 'Offline' : '—';
                const statusDot = isOnline ? '●' : isOffline ? '●' : '○';

                const ms = srv.responseTimeMs;
                const latencyClass = ms != null ? (ms < 20 ? 'fast' : ms < 100 ? 'medium' : 'slow') : '';
                const latencyText = ms != null ? `${ms}ms` : '—';

                const pc = playerRes?.data?.servers?.find(s => s.key === key);
                const playersText = pc ? pc.playerCount.toLocaleString('pt-BR') : '—';

                const lastCheck = srv.lastCheck ? new Date(srv.lastCheck).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit', month: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                }) : '—';

                rows.push(`<tr>
                    <td><span class="srv-name">${SERVER_EMOJIS[key] || ''} ${SERVER_LABELS[key] || key}</span></td>
                    <td><span class="srv-status ${statusClass}">${statusDot} ${statusLabel}</span></td>
                    <td><span class="srv-latency ${latencyClass}">${latencyText}</span></td>
                    <td><span class="srv-players">${key !== 'ACCOUNT' ? playersText : '—'}</span></td>
                    <td>${lastCheck}</td>
                </tr>`);
            }

            document.getElementById('server-status-table').innerHTML =
                rows.join('') || '<tr><td colspan="5" class="srv-loading">Sem dados</td></tr>';
            document.getElementById('srv-servers-online').textContent = `${onlineCount}/${totalCount}`;

            // Last update
            const lastUpdated = statusRes.data.lastUpdated;
            const updateEl = document.getElementById('srv-last-update');
            if (updateEl && lastUpdated) {
                const ts = new Date(lastUpdated).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit', month: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                });
                updateEl.textContent = `Última atualização: ${ts}`;
            }
        }

        // Daily stats table
        if (statsRes?.data?.daily) {
            const daily = statsRes.data.daily;
            const dates = Object.keys(daily).sort().reverse();
            if (dates.length > 0) {
                const rows = dates.map(date => {
                    const d = daily[date];
                    const avg = d.avgTotal != null ? Math.round(d.avgTotal).toLocaleString('pt-BR') : '—';
                    const peak = d.peak?.total != null ? d.peak.total.toLocaleString('pt-BR') : '—';
                    const low = d.low?.total != null && d.low.total !== Infinity ? d.low.total.toLocaleString('pt-BR') : '—';
                    return `<tr>
                        <td>${date}</td>
                        <td class="text-center">${d.captures || 0}</td>
                        <td class="text-right daily-value">${avg}</td>
                        <td class="text-right daily-value daily-peak">${peak}</td>
                        <td class="text-right daily-value daily-low">${low}</td>
                    </tr>`;
                });
                document.getElementById('daily-stats-table').innerHTML = rows.join('');
            } else {
                document.getElementById('daily-stats-table').innerHTML =
                    '<tr><td colspan="5" class="srv-loading">Nenhum dado diário disponível</td></tr>';
            }
        }

        // Load chart + token metrics
        loadPlayerChart(currentChartHours);
        loadTokenMetrics();
    } catch (error) {
        console.error('Error loading server data:', error);
    }
}

async function loadPlayerChart(hours = 24) {
    currentChartHours = hours;

    // Update active button
    document.querySelectorAll('.srv-range-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.hours) === hours);
    });

    try {
        const res = await fetch(`/api/player-count/history?hours=${hours}`);
        const json = await res.json();

        const canvas = document.getElementById('player-count-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (!json.success || !json.data?.history?.length) {
            if (playerCountChart) playerCountChart.destroy();
            playerCountChart = null;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#666';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Sem dados de player count para este período', canvas.width / 2, canvas.height / 2);
            return;
        }

        const history = json.data.history.reverse(); // oldest first

        const labels = history.map(h => {
            const d = new Date(h.t);
            if (hours <= 24) {
                return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
            }
            return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        });

        const colors = {
            FREYA: { border: '#5865F2', bg: 'rgba(88,101,242,0.08)' },
            NIDHOGG: { border: '#ED4245', bg: 'rgba(237,66,69,0.08)' },
            YGGDRASIL: { border: '#3BA55C', bg: 'rgba(59,165,92,0.08)' },
            total: { border: '#F5A623', bg: 'rgba(245,166,35,0.12)' }
        };

        const datasets = [];
        const hasMultiplePoints = history.length > 1;

        for (const key of ['FREYA', 'NIDHOGG', 'YGGDRASIL']) {
            const data = history.map(h => h[key] ?? null);
            if (data.some(v => v != null)) {
                datasets.push({
                    label: SERVER_LABELS[key] || key,
                    data,
                    borderColor: colors[key].border,
                    backgroundColor: colors[key].bg,
                    fill: false,
                    tension: 0.3,
                    pointRadius: hasMultiplePoints ? 3 : 6,
                    pointHoverRadius: 6,
                    borderWidth: 2
                });
            }
        }

        datasets.push({
            label: 'Total',
            data: history.map(h => h.total ?? null),
            borderColor: colors.total.border,
            backgroundColor: colors.total.bg,
            fill: true,
            tension: 0.3,
            pointRadius: hasMultiplePoints ? 0 : 6,
            pointHoverRadius: 6,
            borderWidth: 2,
            borderDash: [6, 3]
        });

        if (playerCountChart) playerCountChart.destroy();

        playerCountChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { usePointStyle: true, padding: 16, font: { size: 12 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.85)',
                        titleFont: { size: 13 },
                        bodyFont: { size: 12 },
                        padding: 12,
                        callbacks: {
                            label: ctx => `  ${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString('pt-BR') || '—'} jogadores`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            callback: v => v.toLocaleString('pt-BR'),
                            font: { size: 11 },
                            color: '#888'
                        }
                    },
                    x: {
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        ticks: {
                            maxTicksLimit: 12,
                            font: { size: 11 },
                            color: '#888'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading player chart:', error);
    }
}

async function loadTokenMetrics() {
    try {
        const [statsRes, historyRes] = await Promise.all([
            fetch('/api/token-metrics').then(r => r.json()).catch(() => null),
            fetch('/api/token-metrics/history?limit=10').then(r => r.json()).catch(() => null)
        ]);

        if (statsRes?.data) {
            const stats = statsRes.data;
            const cur = stats.currentToken;

            // Current token info
            if (cur) {
                const statusEl = document.getElementById('tm-current-status');
                const statusDot = cur.status === 'active' ? '●' : cur.status === 'expired' ? '●' : '○';
                const statusLabel = cur.status === 'active' ? 'Ativo' : cur.status === 'expired' ? 'Expirado' : '?';
                statusEl.innerHTML = `<span class="status-${cur.status}">${statusDot} ${statusLabel}</span>` +
                    (cur.token ? `<code class="token-hash" title="Clique para copiar" onclick="copyToken(this)">${cur.token}</code>` : '');
                statusEl.className = 'token-metric-value';

                document.getElementById('tm-current-age').textContent = cur.ageHuman || '—';
                document.getElementById('tm-current-uses').textContent = cur.useCount || '0';
                document.getElementById('tm-current-user').textContent = cur.username || '—';
            } else {
                document.getElementById('tm-current-status').textContent = 'Nenhum';
                document.getElementById('tm-current-status').className = 'token-metric-value status-unknown';
                document.getElementById('tm-current-age').textContent = '—';
                document.getElementById('tm-current-uses').textContent = '—';
                document.getElementById('tm-current-user').textContent = '—';
            }

            // TTL stats
            document.getElementById('tm-avg-ttl').textContent = stats.avgTTLhuman || '—';
            document.getElementById('tm-min-ttl').textContent = stats.minTTLhuman || '—';
            document.getElementById('tm-max-ttl').textContent = stats.maxTTLhuman || '—';
        }

        // History table
        if (historyRes?.data && historyRes.data.length > 0) {
            const rows = historyRes.data.map(h => {
                const captured = h.capturedAt ? new Date(h.capturedAt).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                }) : '—';
                const expired = h.expiredAt ? new Date(h.expiredAt).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                }) : '—';
                const ttlClass = h.ttlMs ? (h.ttlMs > 3600000 ? 'daily-peak' : 'daily-low') : '';

                return `<tr>
                    <td><code>${h.token || '?'}</code></td>
                    <td>${captured}</td>
                    <td>${expired}</td>
                    <td class="text-right daily-value ${ttlClass}">${h.ttlHuman || '—'}</td>
                    <td class="text-center">${h.useCount || 0}</td>
                    <td>${h.username || '—'}</td>
                </tr>`;
            });
            document.getElementById('token-history-table').innerHTML = rows.join('');
        } else {
            document.getElementById('token-history-table').innerHTML =
                '<tr><td colspan="6" class="srv-loading">Nenhum histórico de token ainda</td></tr>';
        }
    } catch (error) {
        console.error('Error loading token metrics:', error);
    }
}

async function forceServerCheck() {
    const btn = document.getElementById('btn-force-server-check');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Verificando...'; }
    try {
        showToast('Verificando servidores...', 'info');
        const res = await fetch('/api/server-status/check', { method: 'POST' });
        const json = await res.json();
        if (json.success) {
            showToast('Verificação de status concluída!', 'success');
            loadServerData();
        } else {
            showToast(json.error || 'Erro na verificação', 'error');
        }
    } catch (error) {
        showToast('Erro na verificação de status', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Verificar Status'; }
    }
}

async function forcePlayerCheck() {
    const btn = document.getElementById('btn-force-player-check');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Atualizando...'; }
    try {
        showToast('Atualizando player counts via SSO...', 'info');
        const res = await fetch('/api/player-count/check', { method: 'POST' });
        const json = await res.json();
        if (json.success) {
            showToast('Player counts atualizados!', 'success');
            loadServerData();
        } else {
            showToast(json.error || 'Erro ao atualizar players (token expirado?)', 'error');
        }
    } catch (error) {
        showToast('Erro ao atualizar player counts', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '👥 Atualizar Players'; }
    }
}

// Make functions available globally
window.deleteAlert = deleteAlert;
window.removeFromWhitelist = removeFromWhitelist;
window.removePermission = removePermission;
window.selectRole = selectRole;
window.deployToGuild = deployToGuild;
window.clearGuildCommands = clearGuildCommands;
window.toggleCommandSelection = toggleCommandSelection;
window.changeAuditPage = changeAuditPage;
window.enablePlugin = enablePlugin;
window.disablePlugin = disablePlugin;
window.reloadPlugin = reloadPlugin;
window.openEditAccount = openEditAccount;
window.closeEditAccount = closeEditAccount;
window.removeAccountPermission = removeAccountPermission;
window.loadPlayerChart = loadPlayerChart;
window.forceServerCheck = forceServerCheck;
window.forcePlayerCheck = forcePlayerCheck;
window.copyToken = function(el) {
    navigator.clipboard.writeText(el.textContent).then(() => {
        showToast('Token copiado!', 'success');
    }).catch(() => {
        // Fallback
        const range = document.createRange();
        range.selectNode(el);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        window.getSelection().removeAllRanges();
        showToast('Token copiado!', 'success');
    });
};