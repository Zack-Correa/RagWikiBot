/**
 * INTEGRATION TESTS - Real API Calls
 * 
 * ⚠️ WARNING: These tests make REAL API calls to external services
 * 
 * These tests are SKIPPED by default. To run them:
 * 1. Remove .skip from tests you want to run
 * 2. Run: npm run test:integration
 * 3. Ensure you have stable internet connection
 * 
 * Use cases:
 * - Manual validation before releases
 * - Debugging API contract issues
 * - Periodic validation that APIs still work
 * 
 * DO NOT run these in CI/CD pipelines by default!
 */

const divinePride = require('../../integrations/database/divine-pride');

describe('Divine Pride API Integration (REAL)', () => {
    // Increase timeout for real API calls
    jest.setTimeout(30000);

    describe.skip('searchItems - Real API', () => {
        it('should fetch real items from API', async () => {
            const results = await divinePride.searchItems('poring', 'pt');
            
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
            
            // Validate structure
            if (results.length > 0) {
                expect(results[0]).toHaveProperty('name');
                expect(results[0]).toHaveProperty('id');
            }
        });

        it('should handle empty search results', async () => {
            const results = await divinePride.searchItems('nonexistentitem12345', 'pt');
            
            // Should return empty array, not throw
            expect(Array.isArray(results)).toBe(true);
        });
    });

    describe.skip('getItemDetails - Real API', () => {
        it('should fetch real item details', async () => {
            // Poring Card ID
            const item = await divinePride.getItemDetails(4001, 'pt');
            
            expect(item).toBeDefined();
            expect(item.id).toBe(4001);
        });

        it('should handle invalid item ID', async () => {
            await expect(
                divinePride.getItemDetails(99999999, 'pt')
            ).rejects.toThrow();
        });
    });

    describe.skip('cookie management - Real API', () => {
        it('should setup cookies correctly', async () => {
            const cookies = await divinePride.setupScrapingCookies('pt', 'LATAM');
            
            expect(cookies).toBeDefined();
            expect(typeof cookies).toBe('string');
            expect(cookies.length).toBeGreaterThan(0);
        });
    });
});

/**
 * MANUAL TESTING CHECKLIST
 * 
 * Before running integration tests, verify:
 * 
 * ✅ Internet connection is stable
 * ✅ APIs are accessible (check in browser)
 * ✅ Rate limits won't be exceeded
 * ✅ Tests won't run in CI/CD (use .skip)
 * 
 * After running:
 * ✅ Check that responses match expected format
 * ✅ Verify error handling works correctly
 * ✅ Document any API changes
 */
