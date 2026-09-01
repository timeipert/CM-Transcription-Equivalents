import { describe, it, expect } from 'vitest';
import { parseCentury, centuryLabel, isMetaType } from './sourceMeta';

describe('parseCentury', () => {
    it('reads plain and ordinal century numbers', () => {
        expect(parseCentury('11')).toBe(11);
        expect(parseCentury('11th')).toBe(11);
        expect(parseCentury('11th c.')).toBe(11);
        expect(parseCentury(' 9th century ')).toBe(9);
    });

    it('reads roman numerals, with or without a saec. prefix', () => {
        expect(parseCentury('XI')).toBe(11);
        expect(parseCentury('s. XI')).toBe(11);
        expect(parseCentury('saec. IX')).toBe(9);
    });

    it('converts a year to the century containing it', () => {
        expect(parseCentury('1150')).toBe(12);
        expect(parseCentury('c. 1100')).toBe(11);   // 1100 is still the 11th c.
        expect(parseCentury('901')).toBe(10);
        expect(parseCentury('900')).toBe(9);
    });

    it('takes the first element of a range', () => {
        expect(parseCentury('11th-12th c.')).toBe(11);
        expect(parseCentury('s. XI/XII')).toBe(11);
    });

    it('returns null when nothing sensible parses out', () => {
        expect(parseCentury('')).toBe(null);
        expect(parseCentury(null)).toBe(null);
        expect(parseCentury('undated')).toBe(null);
    });
});

describe('centuryLabel', () => {
    it('uses the right ordinal suffix', () => {
        expect(centuryLabel(1)).toBe('1st c.');
        expect(centuryLabel(2)).toBe('2nd c.');
        expect(centuryLabel(3)).toBe('3rd c.');
        expect(centuryLabel(11)).toBe('11th c.');
        expect(centuryLabel(12)).toBe('12th c.');
        expect(centuryLabel(21)).toBe('21st c.');
    });
});

describe('isMetaType', () => {
    it('accepts known types only', () => {
        expect(isMetaType('text')).toBe(true);
        expect(isMetaType('century')).toBe(true);
        expect(isMetaType('location')).toBe(true);
        expect(isMetaType('nonsense')).toBe(false);
    });
});
