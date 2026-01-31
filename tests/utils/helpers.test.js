/**
 * Tests for utils/helpers.js
 */

const { sleep, handleDMError } = require('../../utils/helpers');

describe('helpers', () => {
    describe('sleep', () => {
        it('should wait for specified milliseconds', async () => {
            const start = Date.now();
            await sleep(100);
            const elapsed = Date.now() - start;
            
            // Allow some tolerance (90-150ms)
            expect(elapsed).toBeGreaterThanOrEqual(90);
            expect(elapsed).toBeLessThan(150);
        });

        it('should return a Promise', () => {
            const result = sleep(1);
            expect(result).toBeInstanceOf(Promise);
        });

        it('should resolve with undefined', async () => {
            const result = await sleep(1);
            expect(result).toBeUndefined();
        });
    });

    describe('handleDMError', () => {
        let mockLogger;

        beforeEach(() => {
            mockLogger = {
                warn: jest.fn(),
                error: jest.fn(),
                info: jest.fn()
            };
        });

        it('should return true and log warning for DM disabled error (code 50007)', () => {
            const error = { code: 50007, message: 'Cannot send messages to this user' };
            const result = handleDMError(error, '123456789', mockLogger);

            expect(result).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Cannot send DM to user (DMs disabled)',
                { userId: '123456789' }
            );
        });

        it('should return false for other error codes', () => {
            const error = { code: 50001, message: 'Missing Access' };
            const result = handleDMError(error, '123456789', mockLogger);

            expect(result).toBe(false);
            expect(mockLogger.warn).not.toHaveBeenCalled();
        });

        it('should return false for errors without code', () => {
            const error = { message: 'Some error' };
            const result = handleDMError(error, '123456789', mockLogger);

            expect(result).toBe(false);
        });
    });
});
