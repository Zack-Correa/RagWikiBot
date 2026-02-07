/**
 * Tests for utils/errors.js
 * Custom error classes
 */

const { BotError, APIError, ValidationError, CommandError } = require('../../utils/errors');

describe('errors', () => {
    describe('BotError', () => {
        it('should create error with message', () => {
            const error = new BotError('Test error message');
            
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(BotError);
            expect(error.message).toBe('Test error message');
            expect(error.name).toBe('BotError');
        });

        it('should set userMessage to message when not provided', () => {
            const error = new BotError('Test error');
            
            expect(error.userMessage).toBe('Test error');
        });

        it('should use custom userMessage when provided', () => {
            const error = new BotError('Internal error', 'Friendly message');
            
            expect(error.message).toBe('Internal error');
            expect(error.userMessage).toBe('Friendly message');
        });

        it('should have stack trace', () => {
            const error = new BotError('Test');
            
            expect(error.stack).toBeDefined();
            expect(error.stack).toContain('BotError');
        });
    });

    describe('APIError', () => {
        it('should extend BotError', () => {
            const error = new APIError('API failed');
            
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(BotError);
            expect(error).toBeInstanceOf(APIError);
        });

        it('should set default userMessage', () => {
            const error = new APIError('Connection failed');
            
            expect(error.userMessage).toBe('Erro ao conectar com a API');
        });

        it('should store statusCode', () => {
            const error = new APIError('Not found', 404);
            
            expect(error.statusCode).toBe(404);
            expect(error.message).toBe('Not found');
        });

        it('should use custom userMessage', () => {
            const error = new APIError('Internal error', 500, 'Serviço indisponível');
            
            expect(error.statusCode).toBe(500);
            expect(error.userMessage).toBe('Serviço indisponível');
        });

        it('should have correct name', () => {
            const error = new APIError('Test');
            
            expect(error.name).toBe('APIError');
        });

        it('should handle null statusCode', () => {
            const error = new APIError('Test', null);
            
            expect(error.statusCode).toBeNull();
        });
    });

    describe('ValidationError', () => {
        it('should extend BotError', () => {
            const error = new ValidationError('Invalid input');
            
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(BotError);
            expect(error).toBeInstanceOf(ValidationError);
        });

        it('should set default userMessage', () => {
            const error = new ValidationError('Missing field');
            
            expect(error.userMessage).toBe('Parâmetros inválidos');
        });

        it('should use custom userMessage', () => {
            const error = new ValidationError('Email invalid', 'Por favor, forneça um email válido');
            
            expect(error.message).toBe('Email invalid');
            expect(error.userMessage).toBe('Por favor, forneça um email válido');
        });

        it('should have correct name', () => {
            const error = new ValidationError('Test');
            
            expect(error.name).toBe('ValidationError');
        });
    });

    describe('CommandError', () => {
        it('should extend BotError', () => {
            const error = new CommandError('Command failed');
            
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(BotError);
            expect(error).toBeInstanceOf(CommandError);
        });

        it('should set default userMessage', () => {
            const error = new CommandError('Execution failed');
            
            expect(error.userMessage).toBe('Erro ao executar comando');
        });

        it('should use custom userMessage', () => {
            const error = new CommandError('Permission denied', 'Você não tem permissão para isso');
            
            expect(error.message).toBe('Permission denied');
            expect(error.userMessage).toBe('Você não tem permissão para isso');
        });

        it('should have correct name', () => {
            const error = new CommandError('Test');
            
            expect(error.name).toBe('CommandError');
        });
    });

    describe('Error inheritance chain', () => {
        it('should be catchable as Error', () => {
            expect(() => {
                throw new APIError('Test');
            }).toThrow(Error);
        });

        it('should be catchable as BotError', () => {
            expect(() => {
                throw new ValidationError('Test');
            }).toThrow(BotError);
        });

        it('should distinguish between error types', () => {
            const apiError = new APIError('API');
            const validationError = new ValidationError('Validation');
            const commandError = new CommandError('Command');
            
            expect(apiError instanceof APIError).toBe(true);
            expect(apiError instanceof ValidationError).toBe(false);
            
            expect(validationError instanceof ValidationError).toBe(true);
            expect(validationError instanceof APIError).toBe(false);
            
            expect(commandError instanceof CommandError).toBe(true);
            expect(commandError instanceof ValidationError).toBe(false);
        });
    });
});
