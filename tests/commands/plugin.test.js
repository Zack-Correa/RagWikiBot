/**
 * Tests for commands/plugin.js
 */

// Mock dependencies
jest.mock('../../services/pluginService', () => ({
    getLoadedPlugins: jest.fn(() => [
        { name: 'test-plugin', version: '1.0.0', enabled: true, commands: ['test-cmd'] },
        { name: 'disabled-plugin', version: '1.0.0', enabled: false, commands: [] }
    ]),
    enablePlugin: jest.fn(() => ({ success: true })),
    disablePlugin: jest.fn(() => ({ success: true })),
    reloadPlugin: jest.fn(() => ({ success: true }))
}));

jest.mock('../../utils/pluginStorage', () => ({
    enablePluginForGuild: jest.fn(),
    disablePluginForGuild: jest.fn()
}));

jest.mock('../../services/deployService', () => ({
    clearCommandsCache: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

const pluginCommand = require('../../commands/plugin');
const pluginService = require('../../services/pluginService');
const pluginStorage = require('../../utils/pluginStorage');

describe('plugin command', () => {
    describe('command structure', () => {
        it('should have correct name', () => {
            expect(pluginCommand.data.name).toBe('plugin');
        });

        it('should require administrator permissions', () => {
            expect(pluginCommand.data.default_member_permissions).toBeDefined();
        });

        it('should have subcommands', () => {
            // SlashCommandBuilder stores options differently
            const options = pluginCommand.data.options;
            expect(options).toBeDefined();
            expect(options.length).toBeGreaterThan(0);
        });

        it('should have execute function', () => {
            expect(typeof pluginCommand.execute).toBe('function');
        });

        it('should have autocomplete function', () => {
            expect(typeof pluginCommand.autocomplete).toBe('function');
        });
    });

    describe('autocomplete', () => {
        it('should return plugin suggestions', async () => {
            const interaction = {
                options: {
                    getFocused: jest.fn(() => 'test')
                },
                respond: jest.fn()
            };
            
            await pluginCommand.autocomplete(interaction);
            
            expect(interaction.respond).toHaveBeenCalled();
            const choices = interaction.respond.mock.calls[0][0];
            expect(choices.length).toBeGreaterThan(0);
        });

        it('should filter by search term', async () => {
            const interaction = {
                options: {
                    getFocused: jest.fn(() => 'test')
                },
                respond: jest.fn()
            };
            
            await pluginCommand.autocomplete(interaction);
            
            const choices = interaction.respond.mock.calls[0][0];
            expect(choices.some(c => c.value === 'test-plugin')).toBe(true);
        });
    });

    describe('execute - listar', () => {
        it('should list all plugins', async () => {
            const interaction = createMockInteraction({
                subcommand: 'listar'
            });
            
            await pluginCommand.execute(interaction);
            
            expect(interaction.reply).toHaveBeenCalled();
            const replyArg = interaction.reply.mock.calls[0][0];
            expect(replyArg.embeds).toBeDefined();
        });

        it('should show message when no plugins', async () => {
            pluginService.getLoadedPlugins.mockReturnValueOnce([]);
            
            const interaction = createMockInteraction({
                subcommand: 'listar'
            });
            
            await pluginCommand.execute(interaction);
            
            expect(interaction.reply).toHaveBeenCalled();
        });
    });

    describe('execute - status', () => {
        it('should show plugin status', async () => {
            const interaction = createMockInteraction({
                subcommand: 'status',
                strings: { nome: 'test-plugin' }
            });
            
            await pluginCommand.execute(interaction);
            
            expect(interaction.reply).toHaveBeenCalled();
        });

        it('should show error for unknown plugin', async () => {
            const interaction = createMockInteraction({
                subcommand: 'status',
                strings: { nome: 'unknown-plugin' }
            });
            
            await pluginCommand.execute(interaction);
            
            expect(interaction.reply).toHaveBeenCalled();
            const content = interaction.reply.mock.calls[0][0].content;
            expect(content).toContain('não encontrado');
        });
    });

    describe('execute - ativar', () => {
        it('should enable plugin', async () => {
            const interaction = createMockInteraction({
                subcommand: 'ativar',
                strings: { nome: 'test-plugin' }
            });
            
            await pluginCommand.execute(interaction);
            
            expect(interaction.deferReply).toHaveBeenCalled();
            expect(pluginService.enablePlugin).toHaveBeenCalledWith('test-plugin');
            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should handle enable errors', async () => {
            pluginService.enablePlugin.mockReturnValueOnce({ success: false, error: 'Plugin not found' });
            
            const interaction = createMockInteraction({
                subcommand: 'ativar',
                strings: { nome: 'unknown-plugin' }
            });
            
            await pluginCommand.execute(interaction);
            
            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply).toContain('Erro');
        });
    });

    describe('execute - desativar', () => {
        it('should disable plugin', async () => {
            const interaction = createMockInteraction({
                subcommand: 'desativar',
                strings: { nome: 'test-plugin' }
            });
            
            await pluginCommand.execute(interaction);
            
            expect(pluginService.disablePlugin).toHaveBeenCalledWith('test-plugin');
        });
    });

    describe('execute - recarregar', () => {
        it('should reload plugin', async () => {
            const interaction = createMockInteraction({
                subcommand: 'recarregar',
                strings: { nome: 'test-plugin' }
            });
            
            await pluginCommand.execute(interaction);
            
            expect(pluginService.reloadPlugin).toHaveBeenCalledWith('test-plugin');
        });
    });

    describe('execute - servidor-ativar', () => {
        it('should enable plugin for guild', async () => {
            pluginService.getLoadedPlugins.mockReturnValue([
                { name: 'test-plugin', version: '1.0.0', enabled: true, commands: [] }
            ]);
            
            const interaction = createMockInteraction({
                subcommand: 'servidor-ativar',
                strings: { nome: 'test-plugin' },
                guildId: '123456789'
            });
            
            await pluginCommand.execute(interaction);
            
            expect(pluginStorage.enablePluginForGuild).toHaveBeenCalledWith('test-plugin', '123456789');
        });

        it('should reject when used in DM', async () => {
            pluginService.getLoadedPlugins.mockReturnValue([
                { name: 'test-plugin', version: '1.0.0', enabled: true, commands: [] }
            ]);
            
            const interaction = createMockInteraction({
                subcommand: 'servidor-ativar',
                strings: { nome: 'test-plugin' },
                guildId: null
            });
            // Clear guildId to simulate DM
            interaction.guildId = null;
            
            await pluginCommand.execute(interaction);
            
            expect(interaction.reply).toHaveBeenCalled();
            const replyArg = interaction.reply.mock.calls[0][0];
            // Check for DM error message
            expect(replyArg.content || '').toMatch(/servidor|DM/i);
        });
    });

    describe('execute - servidor-desativar', () => {
        it('should disable plugin for guild', async () => {
            pluginService.getLoadedPlugins.mockReturnValue([
                { name: 'test-plugin', version: '1.0.0', enabled: true, commands: [] }
            ]);
            
            const interaction = createMockInteraction({
                subcommand: 'servidor-desativar',
                strings: { nome: 'test-plugin' },
                guildId: '123456789'
            });
            
            await pluginCommand.execute(interaction);
            
            expect(pluginStorage.disablePluginForGuild).toHaveBeenCalledWith('test-plugin', '123456789');
        });
    });
});
