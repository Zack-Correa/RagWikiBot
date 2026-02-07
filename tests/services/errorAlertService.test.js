/**
 * Tests for services/errorAlertService.js
 * Focus on exported functions and basic functionality
 */

describe('errorAlertService', () => {
    let errorAlertService;
    let mockFs;

    beforeEach(() => {
        jest.resetModules();
        
        // Mock fs
        mockFs = {
            existsSync: jest.fn(() => false),
            readFileSync: jest.fn(() => JSON.stringify({
                enabled: true,
                adminUserIds: [],
                alertChannelId: null,
                minSeverity: 'error',
                cooldownMinutes: 5
            })),
            writeFileSync: jest.fn(),
            mkdirSync: jest.fn()
        };
        jest.doMock('fs', () => mockFs);
        
        // Mock logger
        jest.doMock('../../utils/logger', () => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        }));
        
        errorAlertService = require('../../services/errorAlertService');
    });

    afterEach(() => {
        jest.resetModules();
    });

    describe('exports', () => {
        it('should export setClient function', () => {
            expect(typeof errorAlertService.setClient).toBe('function');
        });

        it('should export sendAlert function', () => {
            expect(typeof errorAlertService.sendAlert).toBe('function');
        });

        it('should export alert helper functions', () => {
            expect(typeof errorAlertService.alertPluginError).toBe('function');
            expect(typeof errorAlertService.alertPluginAutoDisabled).toBe('function');
            expect(typeof errorAlertService.alertCriticalError).toBe('function');
        });

        it('should export admin management functions', () => {
            expect(typeof errorAlertService.addAdminUser).toBe('function');
            expect(typeof errorAlertService.removeAdminUser).toBe('function');
            expect(typeof errorAlertService.setAlertChannel).toBe('function');
        });

        it('should export config functions', () => {
            expect(typeof errorAlertService.getConfig).toBe('function');
            expect(typeof errorAlertService.updateConfig).toBe('function');
        });
    });

    describe('getConfig', () => {
        it('should return default config when file does not exist', () => {
            const config = errorAlertService.getConfig();
            
            expect(config).toBeDefined();
            expect(config.enabled).toBe(true);
            expect(Array.isArray(config.adminUserIds)).toBe(true);
        });

        it('should return config with expected properties', () => {
            const config = errorAlertService.getConfig();
            
            expect(config).toHaveProperty('enabled');
            expect(config).toHaveProperty('adminUserIds');
            expect(config).toHaveProperty('alertChannelId');
            expect(config).toHaveProperty('minSeverity');
            expect(config).toHaveProperty('cooldownMinutes');
        });
    });

    describe('setClient', () => {
        it('should accept Discord client', () => {
            const mockClient = {
                users: { fetch: jest.fn() },
                channels: { fetch: jest.fn() }
            };
            
            // Should not throw
            expect(() => {
                errorAlertService.setClient(mockClient);
            }).not.toThrow();
        });
    });

    describe('sendAlert', () => {
        it('should handle send without client', async () => {
            // Should not throw when no client set
            await expect(errorAlertService.sendAlert({
                title: 'Test',
                description: 'Test description'
            })).resolves.not.toThrow();
        });

        it('should handle send when disabled', async () => {
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                enabled: false,
                adminUserIds: [],
                alertChannelId: null
            }));
            
            jest.resetModules();
            const freshService = require('../../services/errorAlertService');
            
            // Should not throw when disabled
            await expect(freshService.sendAlert({
                title: 'Test',
                description: 'Test'
            })).resolves.not.toThrow();
        });
    });

    describe('alertPluginError', () => {
        it('should handle plugin error alert', async () => {
            await expect(errorAlertService.alertPluginError(
                'test-plugin',
                new Error('Test error'),
                'command'
            )).resolves.not.toThrow();
        });
    });

    describe('alertPluginAutoDisabled', () => {
        it('should handle auto-disable alert', async () => {
            await expect(errorAlertService.alertPluginAutoDisabled(
                'test-plugin',
                5
            )).resolves.not.toThrow();
        });
    });

    describe('alertCriticalError', () => {
        it('should handle critical error alert', async () => {
            await expect(errorAlertService.alertCriticalError(
                'System failure',
                new Error('Critical error')
            )).resolves.not.toThrow();
        });
    });
});
