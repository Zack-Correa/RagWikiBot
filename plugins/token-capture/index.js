/**
 * Token Capture Plugin
 * Captura automatica de tokens SSO via proxy TCP transparente
 * 
 * Funciona como intermediario entre o cliente do jogo (Windows) e o servidor
 * real da GNJoy LATAM, capturando o token de autenticacao SSO (pacote 0x0825)
 * e salvando automaticamente no .env como RO_AUTH_TOKEN.
 */

const proxyService = require('./proxyService');
const tokenCaptureCommand = require('./commands/token-capture');

let pluginContext = null;

function onLoad(context) {
    pluginContext = context;
    proxyService.setLogger(context.logger);
    tokenCaptureCommand.setLogger(context.logger);
    context.logger.info('Token Capture plugin loaded');
}

function onEnable(context) {
    context.logger.info('Token Capture plugin enabled');
    context.logger.info('Use /token-capture start para iniciar o proxy de captura');
}

function onDisable(context) {
    proxyService.stopCapture();
    context.logger.info('Token Capture plugin disabled (proxy stopped)');
}

function onUnload(context) {
    proxyService.stopCapture();
    pluginContext = null;
    context.logger.info('Token Capture plugin unloaded');
}

const commands = {
    'token-capture': tokenCaptureCommand
};

const api = {
    getToken: proxyService.getToken,
    getStatus: proxyService.getStatus,
    startCapture: proxyService.startCapture,
    stopCapture: proxyService.stopCapture,
    onCapture: proxyService.onCapture
};

module.exports = {
    onLoad,
    onEnable,
    onDisable,
    onUnload,
    commands,
    events: {},
    api
};
