/**
 * Custom error classes for better error handling
 */

class BotError extends Error {
    constructor(message, userMessage = null) {
        super(message);
        this.name = this.constructor.name;
        this.userMessage = userMessage || message;
        Error.captureStackTrace(this, this.constructor);
    }
}

class APIError extends BotError {
    constructor(message, statusCode = null, userMessage = 'Erro ao conectar com a API') {
        super(message, userMessage);
        this.statusCode = statusCode;
    }
}

class ValidationError extends BotError {
    constructor(message, userMessage = 'Parâmetros inválidos') {
        super(message, userMessage);
    }
}

class CommandError extends BotError {
    constructor(message, userMessage = 'Erro ao executar comando') {
        super(message, userMessage);
    }
}

module.exports = {
    BotError,
    APIError,
    ValidationError,
    CommandError
};

