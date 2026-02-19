#!/usr/bin/env node

/**
 * Standalone Token Capture Proxy
 * 
 * Run this script to start the transparent TCP proxy that captures
 * SSO tokens from the Ragnarok Online game client.
 * 
 * Usage:
 *   sudo node scripts/start-token-capture.js
 * 
 * Requires: hosts file on Windows pointing to this server's IP
 * See TOKEN_CAPTURE.md for full setup instructions.
 */

const path = require('path');

// Load .env from project root
try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
    // dotenv is optional for this script
}

const proxyService = require('../plugins/token-capture/proxyService');

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function main() {
    log('='.repeat(45));
    log('  Token Capture Proxy - Standalone Mode');
    log('='.repeat(45));
    log('');

    proxyService.onCapture((token, username) => {
        log('');
        log('='.repeat(45));
        log(`  TOKEN CAPTURADO!`);
        log(`  Usuario: ${username || 'desconhecido'}`);
        log(`  Tamanho: ${token.length} caracteres`);
        log(`  Preview: ${token.substring(0, 50)}...`);
        log('='.repeat(45));
        log('');
        log('Token salvo automaticamente no .env (RO_AUTH_TOKEN)');
        log('');
    });

    try {
        const status = await proxyService.startCapture();

        log('');
        log(`Proxy rodando em ${status.localIp}:${status.listenPort}`);
        log(`Encaminhando para ${status.targetIp}:${status.targetPort}`);
        log('');
        log('Configuracao no Windows (uma vez):');
        log('   1. Abrir Bloco de Notas como Administrador');
        log('   2. Abrir: C:\\Windows\\System32\\drivers\\etc\\hosts');
        log('   3. Adicionar esta linha no final:');
        log(`      ${status.localIp}  lt-account-01.gnjoylatam.com`);
        log('   4. Salvar e fechar');
        log('');
        log('Agora abra o jogo e faca login normalmente.');
        log('O token sera capturado automaticamente!');
        log('');
        log('Pressione Ctrl+C para parar o proxy.');
        log('');

    } catch (error) {
        log(`Erro ao iniciar proxy: ${error.message}`);

        if (error.message.includes('EACCES') || error.message.includes('permission')) {
            log('');
            log('A porta 6900 requer permissao de root no Linux.');
            log('   Use: sudo node scripts/start-token-capture.js');
            log("   Ou:  sudo setcap 'cap_net_bind_service=+ep' $(which node)");
        }

        process.exit(1);
    }
}

process.on('SIGINT', () => {
    log('');
    log('Parando proxy...');
    proxyService.stopCapture();
    log('Proxy parado. Remova a linha do arquivo hosts no Windows.');
    process.exit(0);
});

process.on('SIGTERM', () => {
    proxyService.stopCapture();
    process.exit(0);
});

main();
