/**
 * Tests for utils/commandHelpers.js
 */

const { 
    getServerChoices, 
    getStoreTypeChoices, 
    SERVERS, 
    STORE_TYPES 
} = require('../../utils/commandHelpers');

describe('commandHelpers', () => {
    describe('getServerChoices', () => {
        it('should return array of server choices', () => {
            const choices = getServerChoices();
            
            expect(Array.isArray(choices)).toBe(true);
            expect(choices.length).toBe(3);
        });

        it('should have Freya server', () => {
            const choices = getServerChoices();
            const freya = choices.find(c => c.value === 'FREYA');
            
            expect(freya).toBeDefined();
            expect(freya.name).toBe('Freya');
        });

        it('should have Nidhogg server', () => {
            const choices = getServerChoices();
            const nidhogg = choices.find(c => c.value === 'NIDHOGG');
            
            expect(nidhogg).toBeDefined();
            expect(nidhogg.name).toBe('Nidhogg');
        });

        it('should have Yggdrasil server', () => {
            const choices = getServerChoices();
            const yggdrasil = choices.find(c => c.value === 'YGGDRASIL');
            
            expect(yggdrasil).toBeDefined();
            expect(yggdrasil.name).toBe('Yggdrasil');
        });

        it('should return Discord-compatible choice format', () => {
            const choices = getServerChoices();
            
            choices.forEach(choice => {
                expect(choice).toHaveProperty('name');
                expect(choice).toHaveProperty('value');
                expect(typeof choice.name).toBe('string');
                expect(typeof choice.value).toBe('string');
            });
        });
    });

    describe('getStoreTypeChoices', () => {
        it('should return array of store type choices', () => {
            const choices = getStoreTypeChoices();
            
            expect(Array.isArray(choices)).toBe(true);
            expect(choices.length).toBe(2);
        });

        it('should have BUY option', () => {
            const choices = getStoreTypeChoices();
            const buy = choices.find(c => c.value === 'BUY');
            
            expect(buy).toBeDefined();
            expect(buy.name).toBe('Comprando');
        });

        it('should have SELL option', () => {
            const choices = getStoreTypeChoices();
            const sell = choices.find(c => c.value === 'SELL');
            
            expect(sell).toBeDefined();
            expect(sell.name).toBe('Vendendo');
        });

        it('should return Discord-compatible choice format', () => {
            const choices = getStoreTypeChoices();
            
            choices.forEach(choice => {
                expect(choice).toHaveProperty('name');
                expect(choice).toHaveProperty('value');
                expect(typeof choice.name).toBe('string');
                expect(typeof choice.value).toBe('string');
            });
        });
    });

    describe('SERVERS constant', () => {
        it('should be an array', () => {
            expect(Array.isArray(SERVERS)).toBe(true);
        });

        it('should contain all servers', () => {
            expect(SERVERS).toContain('FREYA');
            expect(SERVERS).toContain('NIDHOGG');
            expect(SERVERS).toContain('YGGDRASIL');
        });

        it('should have 3 servers', () => {
            expect(SERVERS.length).toBe(3);
        });

        it('should match getServerChoices values', () => {
            const choices = getServerChoices();
            const choiceValues = choices.map(c => c.value);
            
            SERVERS.forEach(server => {
                expect(choiceValues).toContain(server);
            });
        });
    });

    describe('STORE_TYPES constant', () => {
        it('should be an array', () => {
            expect(Array.isArray(STORE_TYPES)).toBe(true);
        });

        it('should contain BUY and SELL', () => {
            expect(STORE_TYPES).toContain('BUY');
            expect(STORE_TYPES).toContain('SELL');
        });

        it('should have 2 types', () => {
            expect(STORE_TYPES.length).toBe(2);
        });

        it('should match getStoreTypeChoices values', () => {
            const choices = getStoreTypeChoices();
            const choiceValues = choices.map(c => c.value);
            
            STORE_TYPES.forEach(type => {
                expect(choiceValues).toContain(type);
            });
        });
    });
});
