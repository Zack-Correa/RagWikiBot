/**
 * Tests for utils/constants.js
 * Application constants
 */

const constants = require('../../utils/constants');

describe('constants', () => {
    describe('TIMEOUTS', () => {
        it('should have COLLECTOR timeout', () => {
            expect(constants.TIMEOUTS.COLLECTOR).toBe(300000); // 5 minutes
        });

        it('should have PAGINATION timeout', () => {
            expect(constants.TIMEOUTS.PAGINATION).toBe(180000); // 3 minutes
        });

        it('should have API_REQUEST timeout', () => {
            expect(constants.TIMEOUTS.API_REQUEST).toBe(10000); // 10 seconds
        });

        it('should have COOKIE_CACHE timeout', () => {
            expect(constants.TIMEOUTS.COOKIE_CACHE).toBe(1800000); // 30 minutes
        });
    });

    describe('PAGINATION', () => {
        it('should have ITEMS_PER_PAGE', () => {
            expect(constants.PAGINATION.ITEMS_PER_PAGE).toBe(10);
        });

        it('should have MAX_PAGES', () => {
            expect(constants.PAGINATION.MAX_PAGES).toBe(100);
        });
    });

    describe('SELECT_MENU', () => {
        it('should have MAX_OPTIONS', () => {
            expect(constants.SELECT_MENU.MAX_OPTIONS).toBe(25);
        });

        it('should have MAX_LABEL_LENGTH', () => {
            expect(constants.SELECT_MENU.MAX_LABEL_LENGTH).toBe(100);
        });

        it('should have MAX_DESCRIPTION_LENGTH', () => {
            expect(constants.SELECT_MENU.MAX_DESCRIPTION_LENGTH).toBe(100);
        });
    });

    describe('SEARCH', () => {
        it('should have MIN_TERM_LENGTH', () => {
            expect(constants.SEARCH.MIN_TERM_LENGTH).toBe(2);
        });

        it('should have MAX_TERM_LENGTH', () => {
            expect(constants.SEARCH.MAX_TERM_LENGTH).toBe(100);
        });

        it('should have MAX_RESULTS', () => {
            expect(constants.SEARCH.MAX_RESULTS).toBe(100);
        });
    });

    describe('PATTERNS', () => {
        describe('NUMERIC_ID', () => {
            it('should match numeric strings', () => {
                expect(constants.PATTERNS.NUMERIC_ID.test('12345')).toBe(true);
                expect(constants.PATTERNS.NUMERIC_ID.test('0')).toBe(true);
            });

            it('should not match non-numeric strings', () => {
                expect(constants.PATTERNS.NUMERIC_ID.test('abc')).toBe(false);
                expect(constants.PATTERNS.NUMERIC_ID.test('12a34')).toBe(false);
                expect(constants.PATTERNS.NUMERIC_ID.test('')).toBe(false);
            });
        });

        describe('MAP_ID', () => {
            it('should match valid map IDs', () => {
                expect(constants.PATTERNS.MAP_ID.test('prt_fild01')).toBe(true);
                expect(constants.PATTERNS.MAP_ID.test('prontera')).toBe(true);
                expect(constants.PATTERNS.MAP_ID.test('iz_dun01')).toBe(true);
            });

            it('should not match invalid map IDs', () => {
                expect(constants.PATTERNS.MAP_ID.test('prt fild01')).toBe(false);
                expect(constants.PATTERNS.MAP_ID.test('map-01')).toBe(false);
            });
        });

        describe('KOREAN', () => {
            it('should match Korean characters', () => {
                expect(constants.PATTERNS.KOREAN.test('포링')).toBe(true);
                expect(constants.PATTERNS.KOREAN.test('Hello 세계')).toBe(true);
            });

            it('should not match non-Korean text', () => {
                expect(constants.PATTERNS.KOREAN.test('Hello World')).toBe(false);
                expect(constants.PATTERNS.KOREAN.test('12345')).toBe(false);
            });
        });

        describe('ENCODING_ISSUES', () => {
            it('should match control characters', () => {
                expect(constants.PATTERNS.ENCODING_ISSUES.test('\x00')).toBe(true);
                expect(constants.PATTERNS.ENCODING_ISSUES.test('\uFFFD')).toBe(true);
            });

            it('should not match normal text', () => {
                expect(constants.PATTERNS.ENCODING_ISSUES.test('Normal text')).toBe(false);
            });
        });

        describe('ONLY_NUMBERS_SPECIAL', () => {
            it('should match strings with only numbers and special chars', () => {
                expect(constants.PATTERNS.ONLY_NUMBERS_SPECIAL.test('123-456')).toBe(true);
                expect(constants.PATTERNS.ONLY_NUMBERS_SPECIAL.test('1.2.3')).toBe(true);
            });

            it('should not match strings with letters', () => {
                expect(constants.PATTERNS.ONLY_NUMBERS_SPECIAL.test('123abc')).toBe(false);
            });
        });

        describe('PLACEHOLDER_PREFIX', () => {
            it('should match placeholder prefixes', () => {
                expect(constants.PATTERNS.PLACEHOLDER_PREFIX.test('[ph]item')).toBe(true);
                expect(constants.PATTERNS.PLACEHOLDER_PREFIX.test('[PH]Item')).toBe(true);
            });

            it('should not match non-placeholder text', () => {
                expect(constants.PATTERNS.PLACEHOLDER_PREFIX.test('item')).toBe(false);
            });
        });
    });

    describe('EXTRACT_PATTERNS', () => {
        describe('ITEM', () => {
            it('should extract item name', () => {
                const match = '[Poring Card]'.match(constants.EXTRACT_PATTERNS.ITEM.name);
                expect(match[1]).toBe('Poring Card');
            });

            it('should extract item ID from URL', () => {
                const match = 'item/4001'.match(constants.EXTRACT_PATTERNS.ITEM.id);
                expect(match[1]).toBe('4001');
            });
        });

        describe('MONSTER', () => {
            it('should extract monster name', () => {
                const match = '[Poring]'.match(constants.EXTRACT_PATTERNS.MONSTER.name);
                expect(match[1]).toBe('Poring');
            });

            it('should extract monster ID from URL', () => {
                const match = 'monster/1002'.match(constants.EXTRACT_PATTERNS.MONSTER.id);
                expect(match[1]).toBe('1002');
            });
        });

        describe('MAP', () => {
            it('should extract map name', () => {
                const match = '**Prontera Field**'.match(constants.EXTRACT_PATTERNS.MAP.name);
                expect(match[1]).toBe('Prontera Field');
            });

            it('should extract map ID', () => {
                const match = '[prt_fild01]'.match(constants.EXTRACT_PATTERNS.MAP.id);
                expect(match[1]).toBe('prt_fild01');
            });
        });
    });

    describe('COLORS', () => {
        it('should have PRIMARY color', () => {
            expect(constants.COLORS.PRIMARY).toBe('#0099ff');
        });

        it('should have WARNING color', () => {
            expect(constants.COLORS.WARNING).toBe('#ff9900');
        });

        it('should have ERROR color', () => {
            expect(constants.COLORS.ERROR).toBe('#ff0000');
        });

        it('should have SUCCESS color', () => {
            expect(constants.COLORS.SUCCESS).toBe('#00ff00');
        });
    });

    describe('CUSTOM_IDS', () => {
        it('should have component IDs', () => {
            expect(constants.CUSTOM_IDS.ITEM_MENU).toBe('item_details_menu');
            expect(constants.CUSTOM_IDS.MONSTER_MENU).toBe('monster_details_menu');
            expect(constants.CUSTOM_IDS.MAP_MENU).toBe('map_details_menu');
            expect(constants.CUSTOM_IDS.MARKET_MENU).toBe('market_item_select');
        });
    });

    describe('IMAGES', () => {
        it('should generate item image URL', () => {
            const url = constants.IMAGES.ITEM(501);
            expect(url).toBe('https://www.divine-pride.net/img/items/collection/kro/501');
        });

        it('should generate monster image URL', () => {
            const url = constants.IMAGES.MONSTER(1002);
            expect(url).toBe('https://static.divine-pride.net/images/mobs/png/1002.png');
        });

        it('should generate map original image URL', () => {
            const url = constants.IMAGES.MAP_ORIGINAL('prontera');
            expect(url).toBe('https://www.divine-pride.net/img/map/original/prontera');
        });

        it('should generate map raw image URL', () => {
            const url = constants.IMAGES.MAP_RAW('prt_fild01');
            expect(url).toBe('https://www.divine-pride.net/img/map/raw/prt_fild01');
        });

        it('should have GNJOY thumbnail', () => {
            expect(constants.IMAGES.GNJOY_THUMBNAIL).toBe(
                'https://assets.gnjoylatam.com/static/web/ro/assets/images/ro_og.webp'
            );
        });
    });

    describe('MARKET', () => {
        it('should have ITEMS_PER_PAGE', () => {
            expect(constants.MARKET.ITEMS_PER_PAGE).toBe(10);
        });

        it('should have SERVERS', () => {
            expect(constants.MARKET.SERVERS.FREYA).toBe('FREYA');
            expect(constants.MARKET.SERVERS.NIDHOGG).toBe('NIDHOGG');
            expect(constants.MARKET.SERVERS.YGGDRASIL).toBe('YGGDRASIL');
        });

        it('should have STORE_TYPES', () => {
            expect(constants.MARKET.STORE_TYPES.BUY).toBe('BUY');
            expect(constants.MARKET.STORE_TYPES.SELL).toBe('SELL');
        });
    });

    describe('API', () => {
        it('should have MAX_RETRIES', () => {
            expect(constants.API.MAX_RETRIES).toBe(3);
        });

        it('should have RETRY_DELAY', () => {
            expect(constants.API.RETRY_DELAY).toBe(1000);
        });
    });
});
