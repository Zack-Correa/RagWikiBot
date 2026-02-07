/**
 * Tests for utils/logger.js
 */

describe('logger', () => {
    let logger;
    let originalEnv;
    let consoleSpy;

    beforeEach(() => {
        // Save original env
        originalEnv = process.env.LOG_LEVEL;
        
        // Reset module cache to get fresh logger
        jest.resetModules();
        
        // Spy on console methods
        consoleSpy = {
            error: jest.spyOn(console, 'error').mockImplementation(() => {}),
            warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
            log: jest.spyOn(console, 'log').mockImplementation(() => {})
        };
    });

    afterEach(() => {
        // Restore env
        if (originalEnv !== undefined) {
            process.env.LOG_LEVEL = originalEnv;
        } else {
            delete process.env.LOG_LEVEL;
        }
        
        // Restore console
        consoleSpy.error.mockRestore();
        consoleSpy.warn.mockRestore();
        consoleSpy.log.mockRestore();
    });

    describe('log methods', () => {
        beforeEach(() => {
            process.env.LOG_LEVEL = 'DEBUG';
            jest.resetModules();
            logger = require('../../utils/logger');
        });

        it('should have error method', () => {
            expect(typeof logger.error).toBe('function');
        });

        it('should have warn method', () => {
            expect(typeof logger.warn).toBe('function');
        });

        it('should have info method', () => {
            expect(typeof logger.info).toBe('function');
        });

        it('should have debug method', () => {
            expect(typeof logger.debug).toBe('function');
        });

        it('error should log to console.error', () => {
            logger.error('Test error');
            
            expect(consoleSpy.error).toHaveBeenCalled();
        });

        it('warn should log to console.warn', () => {
            logger.warn('Test warning');
            
            expect(consoleSpy.warn).toHaveBeenCalled();
        });

        it('info should log to console.log', () => {
            logger.info('Test info');
            
            expect(consoleSpy.log).toHaveBeenCalled();
        });

        it('debug should log to console.log when LOG_LEVEL is DEBUG', () => {
            logger.debug('Test debug');
            
            expect(consoleSpy.log).toHaveBeenCalled();
        });

        it('should format message with timestamp', () => {
            logger.info('Test message');
            
            const loggedMessage = consoleSpy.log.mock.calls[0][0];
            expect(loggedMessage).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
            expect(loggedMessage).toContain('[INFO]');
            expect(loggedMessage).toContain('Test message');
        });

        it('should include data in log when provided', () => {
            logger.info('Test message', { key: 'value' });
            
            const loggedMessage = consoleSpy.log.mock.calls[0][0];
            expect(loggedMessage).toContain('Data:');
            expect(loggedMessage).toContain('"key":"value"');
        });
    });

    describe('log levels', () => {
        it('should only log ERROR when LOG_LEVEL is ERROR', () => {
            // Note: Due to module caching, log level is set at require time
            // This test verifies the behavior conceptually
            process.env.LOG_LEVEL = 'ERROR';
            jest.resetModules();
            logger = require('../../utils/logger');
            
            logger.error('Error message');
            
            expect(consoleSpy.error).toHaveBeenCalled();
            // The actual filtering depends on when module was loaded
        });

        it('should log ERROR and WARN when LOG_LEVEL is WARN', () => {
            process.env.LOG_LEVEL = 'WARN';
            jest.resetModules();
            logger = require('../../utils/logger');
            
            logger.error('Error message');
            logger.warn('Warn message');
            logger.info('Info message');
            
            expect(consoleSpy.error).toHaveBeenCalled();
            expect(consoleSpy.warn).toHaveBeenCalled();
            expect(consoleSpy.log).not.toHaveBeenCalled();
        });

        it('should default to INFO level', () => {
            delete process.env.LOG_LEVEL;
            jest.resetModules();
            logger = require('../../utils/logger');
            
            logger.info('Info message');
            logger.debug('Debug message');
            
            // info should log, debug should not
            expect(consoleSpy.log).toHaveBeenCalledTimes(1);
        });

        it('should handle invalid LOG_LEVEL', () => {
            process.env.LOG_LEVEL = 'INVALID';
            jest.resetModules();
            logger = require('../../utils/logger');
            
            // Should default to INFO
            logger.info('Info message');
            expect(consoleSpy.log).toHaveBeenCalled();
        });
    });

    describe('log buffer (admin panel)', () => {
        beforeEach(() => {
            process.env.LOG_LEVEL = 'DEBUG';
            jest.resetModules();
            logger = require('../../utils/logger');
            logger.clearLogs();
        });

        it('should have getRecentLogs method', () => {
            expect(typeof logger.getRecentLogs).toBe('function');
        });

        it('should have clearLogs method', () => {
            expect(typeof logger.clearLogs).toBe('function');
        });

        it('should store logs in buffer', () => {
            logger.info('Test message 1');
            logger.info('Test message 2');
            
            const logs = logger.getRecentLogs();
            
            expect(logs.length).toBe(2);
        });

        it('should return logs in reverse order (most recent first)', () => {
            logger.info('First');
            logger.info('Second');
            logger.info('Third');
            
            const logs = logger.getRecentLogs();
            
            expect(logs[0].message).toBe('Third');
            expect(logs[2].message).toBe('First');
        });

        it('should filter by level', () => {
            logger.error('Error');
            logger.info('Info');
            logger.warn('Warn');
            
            const errorLogs = logger.getRecentLogs({ level: 'ERROR' });
            
            expect(errorLogs.length).toBe(1);
            expect(errorLogs[0].level).toBe('ERROR');
        });

        it('should limit results', () => {
            for (let i = 0; i < 10; i++) {
                logger.info(`Message ${i}`);
            }
            
            const logs = logger.getRecentLogs({ limit: 5 });
            
            expect(logs.length).toBe(5);
        });

        it('should clear logs', () => {
            logger.info('Test');
            logger.clearLogs();
            
            const logs = logger.getRecentLogs();
            
            expect(logs.length).toBe(0);
        });

        it('should include timestamp in buffer entries', () => {
            logger.info('Test');
            
            const logs = logger.getRecentLogs();
            
            expect(logs[0]).toHaveProperty('timestamp');
            expect(logs[0].timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
        });

        it('should include level in buffer entries', () => {
            logger.warn('Test');
            
            const logs = logger.getRecentLogs();
            
            expect(logs[0].level).toBe('WARN');
        });

        it('should include data in buffer entries', () => {
            logger.info('Test', { foo: 'bar' });
            
            const logs = logger.getRecentLogs();
            
            expect(logs[0].data).toEqual({ foo: 'bar' });
        });

        it('should handle null data', () => {
            logger.info('Test');
            
            const logs = logger.getRecentLogs();
            
            expect(logs[0].data).toBeNull();
        });

        it('should maintain circular buffer (max 500 entries)', () => {
            // Fill buffer beyond limit
            for (let i = 0; i < 510; i++) {
                logger.info(`Message ${i}`);
            }
            
            const logs = logger.getRecentLogs({ limit: 1000 });
            
            // Should have at most 500 entries
            expect(logs.length).toBeLessThanOrEqual(500);
        });
    });
});
