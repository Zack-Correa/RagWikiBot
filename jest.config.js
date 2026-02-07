/**
 * Jest Configuration
 */

module.exports = {
    // Test environment
    testEnvironment: 'node',
    
    // Test file patterns
    // Exclude integration tests by default (they use real APIs)
    testMatch: [
        '**/tests/**/*.test.js',
        '**/__tests__/**/*.js',
        '!**/tests/integration/**/*.test.js'
    ],
    
    // Coverage configuration
    collectCoverageFrom: [
        'utils/**/*.js',
        'services/**/*.js',
        'plugins/**/*.js',
        'commands/**/*.js',
        '!**/node_modules/**',
        '!**/tests/**'
    ],
    
    // Coverage thresholds for critical modules
    coverageThreshold: {
        // Global threshold - reasonable minimum
        global: {
            branches: 5,
            functions: 10,
            lines: 8,
            statements: 8
        },
        // High coverage for pure utility modules
        './utils/helpers.js': {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100
        },
        './utils/stringCleaner.js': {
            branches: 90,
            functions: 100,
            lines: 94,
            statements: 94
        },
        './utils/errors.js': {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        },
        './utils/commandHelpers.js': {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100
        },
        './utils/constants.js': {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100
        }
    },
    
    // Setup files
    setupFilesAfterEnv: ['./tests/setup.js'],
    
    // Module paths
    moduleDirectories: ['node_modules', '<rootDir>'],
    
    // Timeout for async tests
    testTimeout: 10000,
    
    // Verbose output
    verbose: true,
    
    // Clear mocks between tests
    clearMocks: true,
    
    // Restore mocks after each test
    restoreMocks: true
};
