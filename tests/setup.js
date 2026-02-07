/**
 * Jest Test Setup
 * Runs before all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Mock console methods to reduce noise (optional)
// global.console = {
//     ...console,
//     log: jest.fn(),
//     debug: jest.fn(),
//     info: jest.fn(),
//     warn: jest.fn(),
// };

// Global test utilities
global.createMockInteraction = (options = {}) => ({
    commandName: options.commandName || 'test-command',
    user: {
        id: options.userId || '123456789',
        tag: options.userTag || 'TestUser#1234',
        username: options.username || 'TestUser'
    },
    guild: options.guild || {
        id: '987654321',
        name: 'Test Guild'
    },
    guildId: options.guildId || '987654321',
    channel: {
        id: options.channelId || '111222333',
        send: jest.fn().mockResolvedValue({})
    },
    options: {
        getString: jest.fn((name) => options.strings?.[name] || null),
        getInteger: jest.fn((name) => options.integers?.[name] || null),
        getBoolean: jest.fn((name) => options.booleans?.[name] || null),
        getSubcommand: jest.fn(() => options.subcommand || null),
        getFocused: jest.fn(() => options.focused || '')
    },
    reply: jest.fn().mockResolvedValue({}),
    editReply: jest.fn().mockResolvedValue({}),
    deferReply: jest.fn().mockResolvedValue({}),
    followUp: jest.fn().mockResolvedValue({}),
    respond: jest.fn().mockResolvedValue({}),
    replied: false,
    deferred: false,
    isChatInputCommand: jest.fn(() => true),
    isAutocomplete: jest.fn(() => false)
});

// Mock Discord.js EmbedBuilder
global.mockEmbedBuilder = () => {
    const embed = {
        setColor: jest.fn().mockReturnThis(),
        setTitle: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        setThumbnail: jest.fn().mockReturnThis(),
        setImage: jest.fn().mockReturnThis(),
        setTimestamp: jest.fn().mockReturnThis(),
        setFooter: jest.fn().mockReturnThis(),
        addFields: jest.fn().mockReturnThis(),
        setAuthor: jest.fn().mockReturnThis(),
        setURL: jest.fn().mockReturnThis(),
        toJSON: jest.fn().mockReturnValue({})
    };
    return embed;
};

// Cleanup after all tests
afterAll(() => {
    // Clean up any resources if needed
});
