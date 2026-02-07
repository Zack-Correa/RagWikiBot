/**
 * Tests for utils/stringCleaner.js
 */

const {
    cleanColorCodes,
    cleanHTMLEntities,
    normalizeWhitespace,
    cleanWikiSyntax,
    cleanString,
    removePatterns,
    truncate,
    cleanDescription,
    sanitizeName,
    formatDescription,
    cleanBatch
} = require('../../utils/stringCleaner');

describe('stringCleaner', () => {
    describe('cleanColorCodes', () => {
        it('should remove hex color codes like ^000000', () => {
            expect(cleanColorCodes('Hello ^FF0000World')).toBe('Hello World');
            expect(cleanColorCodes('^000000Text^FFFFFF')).toBe('Text');
        });

        it('should handle strings without color codes', () => {
            expect(cleanColorCodes('Normal text')).toBe('Normal text');
        });

        it('should return non-string values unchanged', () => {
            expect(cleanColorCodes(123)).toBe(123);
            expect(cleanColorCodes(null)).toBe(null);
            expect(cleanColorCodes(undefined)).toBe(undefined);
        });

        it('should handle multiple color codes', () => {
            expect(cleanColorCodes('^FF0000Red^00FF00Green^0000FFBlue'))
                .toBe('RedGreenBlue');
        });
    });

    describe('cleanHTMLEntities', () => {
        it('should decode common HTML entities', () => {
            expect(cleanHTMLEntities('&quot;Hello&quot;')).toBe('"Hello"');
            expect(cleanHTMLEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
            expect(cleanHTMLEntities('5 &lt; 10')).toBe('5 < 10');
            expect(cleanHTMLEntities('10 &gt; 5')).toBe('10 > 5');
            expect(cleanHTMLEntities('Hello&nbsp;World')).toBe('Hello World');
        });

        it('should decode hex entities', () => {
            expect(cleanHTMLEntities('&#x41;')).toBe('A');
            expect(cleanHTMLEntities('&#x61;&#x62;&#x63;')).toBe('abc');
        });

        it('should decode decimal entities', () => {
            expect(cleanHTMLEntities('&#65;')).toBe('A');
            expect(cleanHTMLEntities('&#97;&#98;&#99;')).toBe('abc');
        });

        it('should handle invalid hex entities gracefully', () => {
            // Invalid hex that would throw - should return empty
            expect(cleanHTMLEntities('&#xFFFFFFFF;')).toBeDefined();
        });

        it('should handle invalid decimal entities gracefully', () => {
            // Very large decimal that might cause issues
            expect(cleanHTMLEntities('&#9999999999;')).toBeDefined();
        });

        it('should return empty string for non-string values', () => {
            expect(cleanHTMLEntities(null)).toBe('');
            expect(cleanHTMLEntities(123)).toBe('');
        });
    });

    describe('normalizeWhitespace', () => {
        it('should normalize line breaks', () => {
            expect(normalizeWhitespace('Hello\r\nWorld')).toBe('Hello\nWorld');
            expect(normalizeWhitespace('Hello\rWorld')).toBe('Hello\nWorld');
        });

        it('should normalize multiple spaces', () => {
            expect(normalizeWhitespace('Hello    World')).toBe('Hello World');
            expect(normalizeWhitespace('Hello\t\tWorld')).toBe('Hello World');
        });

        it('should trim leading and trailing whitespace', () => {
            expect(normalizeWhitespace('  Hello World  ')).toBe('Hello World');
        });

        it('should return empty string for non-string values', () => {
            expect(normalizeWhitespace(null)).toBe('');
        });
    });

    describe('cleanWikiSyntax', () => {
        it('should remove template tags', () => {
            expect(cleanWikiSyntax('Hello {{template}} World')).toBe('Hello  World');
        });

        it('should remove REDIRECT text', () => {
            // REDIRECT is removed and wiki links are also converted
            expect(cleanWikiSyntax('#REDIRECT [[Page]]')).toBe(' Page');
        });

        it('should convert wiki links', () => {
            expect(cleanWikiSyntax('[[Link]]')).toBe('Link');
            expect(cleanWikiSyntax('[[Link|Display]]')).toBe('Display');
        });

        it('should remove template parameters', () => {
            expect(cleanWikiSyntax('Text | param = value')).toBe('Text  value');
        });

        it('should return empty string for non-string values', () => {
            expect(cleanWikiSyntax(null)).toBe('');
        });
    });

    describe('cleanString', () => {
        it('should apply all cleaners by default (except wiki)', () => {
            const dirty = '^FF0000Hello&nbsp;World\r\n  Extra  ';
            const cleaned = cleanString(dirty);
            expect(cleaned).toBe('Hello World\n Extra');
        });

        it('should skip cleaners based on options', () => {
            const dirty = '^FF0000Hello';
            expect(cleanString(dirty, { colors: false })).toBe('^FF0000Hello');
        });

        it('should include wiki cleaner when specified', () => {
            const dirty = 'Hello {{template}} World';
            expect(cleanString(dirty, { wiki: true })).toBe('Hello World');
        });

        it('should return empty string for non-string values', () => {
            expect(cleanString(null)).toBe('');
            expect(cleanString(123)).toBe('');
        });
    });

    describe('removePatterns', () => {
        it('should remove string patterns', () => {
            expect(removePatterns('Hello World', ['World'])).toBe('Hello');
        });

        it('should remove regex patterns', () => {
            expect(removePatterns('Hello123World', [/\d+/g])).toBe('HelloWorld');
        });

        it('should handle multiple patterns', () => {
            expect(removePatterns('Hello123World!', ['Hello', /\d+/g, '!']))
                .toBe('World');
        });

        it('should return empty string for non-string values', () => {
            expect(removePatterns(null, ['test'])).toBe('');
        });
    });

    describe('truncate', () => {
        it('should truncate long strings with ellipsis', () => {
            expect(truncate('Hello World', 8)).toBe('Hello...');
        });

        it('should not truncate short strings', () => {
            expect(truncate('Hello', 10)).toBe('Hello');
        });

        it('should allow custom ellipsis', () => {
            expect(truncate('Hello World', 9, '…')).toBe('Hello Wo…');
        });

        it('should return empty string for non-string values', () => {
            expect(truncate(null, 10)).toBe('');
        });
    });

    describe('cleanDescription', () => {
        it('should clean and return valid descriptions', () => {
            const desc = 'This is a valid description with some content.';
            expect(cleanDescription(desc)).toBe(desc);
        });

        it('should return empty for meaningless content', () => {
            expect(cleanDescription('...')).toBe('');
            expect(cleanDescription('  |  = * ')).toBe('');
            expect(cleanDescription('short')).toBe(''); // less than 10 chars
        });

        it('should truncate long descriptions', () => {
            const longDesc = 'A'.repeat(300);
            const result = cleanDescription(longDesc, 200);
            expect(result.length).toBeLessThanOrEqual(200);
            expect(result).toContain('...');
        });
    });

    describe('sanitizeName', () => {
        it('should remove MVP crown prefix', () => {
            expect(sanitizeName('👑 MVP Monster')).toBe('MVP Monster');
        });

        it('should clean color codes and whitespace', () => {
            expect(sanitizeName('^FF0000Monster  Name')).toBe('Monster Name');
        });

        it('should truncate long names', () => {
            const longName = 'A'.repeat(150);
            const result = sanitizeName(longName, 100);
            expect(result.length).toBeLessThanOrEqual(100);
        });

        it('should return empty string for non-string values', () => {
            expect(sanitizeName(null)).toBe('');
        });
    });

    describe('formatDescription', () => {
        it('should limit number of lines', () => {
            const multiLine = 'Line1\nLine2\nLine3\nLine4\nLine5';
            const result = formatDescription(multiLine, 3);
            expect(result).toBe('Line1\nLine2\nLine3\n...');
        });

        it('should remove empty lines', () => {
            const withEmpty = 'Line1\n\n\nLine2';
            const result = formatDescription(withEmpty);
            expect(result).toBe('Line1\nLine2');
        });

        it('should truncate long text', () => {
            const longText = 'A'.repeat(3000);
            const result = formatDescription(longText, 10, 2000);
            expect(result.length).toBeLessThanOrEqual(2000);
        });
    });

    describe('cleanBatch', () => {
        it('should clean array of strings', () => {
            const dirty = ['^FF0000Hello', '  World  ', ''];
            const result = cleanBatch(dirty);
            expect(result).toEqual(['Hello', 'World']);
        });

        it('should filter out empty strings', () => {
            const dirty = ['Hello', '', '   ', 'World'];
            const result = cleanBatch(dirty);
            expect(result).toEqual(['Hello', 'World']);
        });

        it('should return empty array for non-array input', () => {
            expect(cleanBatch(null)).toEqual([]);
            expect(cleanBatch('string')).toEqual([]);
        });
    });
});
