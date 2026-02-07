/**
 * Backup Service - Sistema de backup automático
 * Faz backup periódico dos arquivos de dados importantes
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const logger = require('../utils/logger');

// Diretórios
const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Configuração
const config = {
    // Horário do backup diário (04:00 - baixo uso)
    backupHour: 4,
    backupMinute: 0,
    
    // Quantos backups manter
    retentionCount: 7,
    
    // Arquivos para incluir no backup
    filesToBackup: [
        'market-alerts.json',
        'parties.json',
        'config.json',
        'plugins-config.json',
        'metrics.json',
        'events.json',
        'price-history.json',
        'server-status.json'
    ],
    
    // Intervalo de verificação (1 hora em ms)
    checkInterval: 60 * 60 * 1000
};

// Estado interno
let backupTimer = null;
let lastBackupDate = null;
let isRunning = false;

/**
 * Garante que o diretório de backups existe
 */
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        logger.info('Backup directory created', { path: BACKUP_DIR });
    }
}

/**
 * Gera o nome do arquivo de backup
 * @returns {string} Nome do arquivo no formato backup-YYYY-MM-DD.zip
 */
function getBackupFilename() {
    const date = new Date().toISOString().split('T')[0];
    return `backup-${date}.zip`;
}

/**
 * Lista os backups existentes
 * @returns {Array} Lista de backups ordenados por data (mais recente primeiro)
 */
function listBackups() {
    ensureBackupDir();
    
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
            .map(filename => {
                const filepath = path.join(BACKUP_DIR, filename);
                const stats = fs.statSync(filepath);
                
                // Extrair data do nome do arquivo
                const dateMatch = filename.match(/backup-(\d{4}-\d{2}-\d{2})/);
                const date = dateMatch ? dateMatch[1] : null;
                
                return {
                    filename,
                    filepath,
                    date,
                    size: stats.size,
                    sizeFormatted: formatFileSize(stats.size),
                    createdAt: stats.birthtime.toISOString(),
                    modifiedAt: stats.mtime.toISOString()
                };
            })
            .sort((a, b) => b.date?.localeCompare(a.date) || 0);
        
        return files;
    } catch (error) {
        logger.error('Error listing backups', { error: error.message });
        return [];
    }
}

/**
 * Formata tamanho de arquivo
 * @param {number} bytes - Tamanho em bytes
 * @returns {string} Tamanho formatado
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

/**
 * Cria um backup dos arquivos de dados
 * @returns {Promise<Object>} Resultado do backup
 */
async function createBackup() {
    ensureBackupDir();
    
    const filename = getBackupFilename();
    const filepath = path.join(BACKUP_DIR, filename);
    
    // Verificar se já existe backup de hoje
    if (fs.existsSync(filepath)) {
        logger.debug('Backup already exists for today', { filename });
        return {
            success: true,
            skipped: true,
            filename,
            message: 'Backup já existe para hoje'
        };
    }
    
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(filepath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        const includedFiles = [];
        const missingFiles = [];
        
        output.on('close', () => {
            const size = archive.pointer();
            
            logger.info('Backup created successfully', {
                filename,
                size: formatFileSize(size),
                files: includedFiles.length
            });
            
            lastBackupDate = new Date().toISOString().split('T')[0];
            
            // Limpar backups antigos
            cleanupOldBackups();
            
            resolve({
                success: true,
                filename,
                filepath,
                size,
                sizeFormatted: formatFileSize(size),
                filesIncluded: includedFiles,
                filesMissing: missingFiles,
                createdAt: new Date().toISOString()
            });
        });
        
        archive.on('error', (err) => {
            logger.error('Backup creation failed', { error: err.message });
            
            // Remover arquivo parcial
            if (fs.existsSync(filepath)) {
                try {
                    fs.unlinkSync(filepath);
                } catch (e) {
                    // Ignore
                }
            }
            
            reject(err);
        });
        
        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') {
                logger.warn('Backup warning - file not found', { error: err.message });
            } else {
                throw err;
            }
        });
        
        archive.pipe(output);
        
        // Adicionar arquivos ao backup
        for (const file of config.filesToBackup) {
            const filePath = path.join(DATA_DIR, file);
            
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file });
                includedFiles.push(file);
            } else {
                missingFiles.push(file);
                logger.debug('File not found for backup', { file });
            }
        }
        
        archive.finalize();
    });
}

/**
 * Remove backups antigos mantendo apenas os mais recentes
 */
function cleanupOldBackups() {
    const backups = listBackups();
    
    if (backups.length <= config.retentionCount) {
        return { removed: 0 };
    }
    
    const toRemove = backups.slice(config.retentionCount);
    let removed = 0;
    
    for (const backup of toRemove) {
        try {
            fs.unlinkSync(backup.filepath);
            removed++;
            logger.debug('Old backup removed', { filename: backup.filename });
        } catch (error) {
            logger.error('Error removing old backup', { 
                filename: backup.filename, 
                error: error.message 
            });
        }
    }
    
    if (removed > 0) {
        logger.info('Old backups cleaned up', { removed });
    }
    
    return { removed };
}

/**
 * Restaura um backup
 * @param {string} filename - Nome do arquivo de backup
 * @returns {Promise<Object>} Resultado da restauração
 */
async function restoreBackup(filename) {
    const filepath = path.join(BACKUP_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
        throw new Error(`Backup não encontrado: ${filename}`);
    }
    
    // Criar backup do estado atual antes de restaurar
    logger.info('Creating pre-restore backup');
    const preRestoreBackup = await createBackup().catch(() => null);
    
    return new Promise((resolve, reject) => {
        const AdmZip = require('adm-zip');
        
        try {
            const zip = new AdmZip(filepath);
            const zipEntries = zip.getEntries();
            
            const restoredFiles = [];
            const errors = [];
            
            for (const entry of zipEntries) {
                if (entry.isDirectory) continue;
                
                const targetPath = path.join(DATA_DIR, entry.entryName);
                
                try {
                    zip.extractEntryTo(entry, DATA_DIR, false, true);
                    restoredFiles.push(entry.entryName);
                    logger.debug('File restored', { file: entry.entryName });
                } catch (err) {
                    errors.push({ file: entry.entryName, error: err.message });
                    logger.error('Error restoring file', { 
                        file: entry.entryName, 
                        error: err.message 
                    });
                }
            }
            
            logger.info('Backup restored', { 
                filename, 
                filesRestored: restoredFiles.length,
                errors: errors.length
            });
            
            resolve({
                success: errors.length === 0,
                filename,
                filesRestored: restoredFiles,
                errors,
                preRestoreBackup: preRestoreBackup?.filename
            });
        } catch (error) {
            logger.error('Backup restoration failed', { 
                filename, 
                error: error.message 
            });
            reject(error);
        }
    });
}

/**
 * Verifica se deve fazer backup (executa no horário configurado)
 */
async function checkBackupSchedule() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const today = now.toISOString().split('T')[0];
    
    // Verificar se é o horário do backup e se ainda não foi feito hoje
    if (currentHour === config.backupHour && 
        currentMinute >= config.backupMinute && 
        currentMinute < config.backupMinute + 30 &&  // Janela de 30 min
        lastBackupDate !== today) {
        
        logger.info('Scheduled backup starting');
        
        try {
            await createBackup();
        } catch (error) {
            logger.error('Scheduled backup failed', { error: error.message });
        }
    }
}

/**
 * Inicia o serviço de backup
 */
function start() {
    if (isRunning) {
        logger.debug('Backup service already running');
        return;
    }
    
    ensureBackupDir();
    
    // Verificar último backup
    const backups = listBackups();
    if (backups.length > 0) {
        lastBackupDate = backups[0].date;
    }
    
    // Iniciar verificação periódica
    backupTimer = setInterval(checkBackupSchedule, config.checkInterval);
    isRunning = true;
    
    logger.info('Backup service started', {
        backupHour: config.backupHour,
        retentionCount: config.retentionCount,
        lastBackup: lastBackupDate
    });
    
    // Verificar imediatamente ao iniciar
    checkBackupSchedule();
}

/**
 * Para o serviço de backup
 */
function stop() {
    if (backupTimer) {
        clearInterval(backupTimer);
        backupTimer = null;
    }
    isRunning = false;
    logger.info('Backup service stopped');
}

/**
 * Obtém status do serviço
 * @returns {Object} Status do serviço
 */
function getStatus() {
    const backups = listBackups();
    
    return {
        running: isRunning,
        lastBackupDate,
        nextBackupTime: getNextBackupTime(),
        config: {
            backupHour: config.backupHour,
            retentionCount: config.retentionCount,
            filesToBackup: config.filesToBackup
        },
        backups: {
            count: backups.length,
            totalSize: backups.reduce((sum, b) => sum + b.size, 0),
            totalSizeFormatted: formatFileSize(backups.reduce((sum, b) => sum + b.size, 0)),
            latest: backups[0] || null,
            list: backups
        }
    };
}

/**
 * Calcula o horário do próximo backup
 * @returns {string} ISO date string do próximo backup
 */
function getNextBackupTime() {
    const now = new Date();
    const next = new Date(now);
    
    next.setHours(config.backupHour, config.backupMinute, 0, 0);
    
    // Se já passou o horário de hoje, será amanhã
    if (now >= next) {
        next.setDate(next.getDate() + 1);
    }
    
    return next.toISOString();
}

/**
 * Força um backup manual
 * @returns {Promise<Object>} Resultado do backup
 */
async function forceBackup() {
    logger.info('Manual backup triggered');
    return createBackup();
}

/**
 * Deleta um backup específico
 * @param {string} filename - Nome do arquivo
 * @returns {boolean} Se foi deletado com sucesso
 */
function deleteBackup(filename) {
    const filepath = path.join(BACKUP_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
        return false;
    }
    
    try {
        fs.unlinkSync(filepath);
        logger.info('Backup deleted', { filename });
        return true;
    } catch (error) {
        logger.error('Error deleting backup', { filename, error: error.message });
        return false;
    }
}

module.exports = {
    start,
    stop,
    getStatus,
    createBackup,
    forceBackup,
    restoreBackup,
    listBackups,
    deleteBackup,
    cleanupOldBackups,
    
    // Para testes
    config
};
