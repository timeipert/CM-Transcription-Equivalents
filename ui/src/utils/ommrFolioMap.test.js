import { describe, it, expect } from 'vitest';
import { shiftFolio, trailingNumber, canvasIndexFor } from './ommrFolioMap';

describe('shiftFolio', () => {
    it('is the identity with no offset', () => {
        expect(shiftFolio('47r', 0)).toBe('47r');
        expect(shiftFolio('anything', undefined)).toBe('anything');
    });

    it('moves by sides: +1 turns a recto into the verso', () => {
        expect(shiftFolio('47r', 1)).toBe('47v');
        expect(shiftFolio('47v', 1)).toBe('48r');
        expect(shiftFolio('47r', 2)).toBe('48r');
        expect(shiftFolio('47r', -1)).toBe('46v');
    });

    it('reads a bare number as a recto', () => {
        expect(shiftFolio('47', 1)).toBe('47v');
    });

    it('does not go below the first side', () => {
        expect(shiftFolio('1r', -10)).toBe('0r');
    });

    it('leaves labels that do not start with a number alone', () => {
        expect(shiftFolio('cover', 3)).toBe('cover');
    });
});

describe('page index naming', () => {
    it('reads the trailing number', () => {
        expect(trailingNumber('Pa_14819_022')).toBe(22);
        expect(trailingNumber('007 ')).toBe(7);
        expect(trailingNumber('12r')).toBeNull();
    });

    it('turns it into a 0-based canvas index with the offset applied', () => {
        expect(canvasIndexFor('022')).toBe(21);
        expect(canvasIndexFor('022', 2)).toBe(23);
        expect(canvasIndexFor('cover', 2)).toBeNull();
    });
});
