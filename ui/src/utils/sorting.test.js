import { describe, it, expect } from 'vitest';
import { compareFolios, comparePatternIds } from './sorting';

describe('compareFolios', () => {
    it('sorts numeric folios correctly', () => {
        expect(compareFolios('1', '2')).toBeLessThan(0);
        expect(compareFolios('10', '2')).toBeGreaterThan(0);
    });
    
    it('handles purely numeric vs suffixed folios', () => {
        // "1" vs "1r". The suffix logic: "" vs "r".
        // "" localeCompare "r" gives -1. So "1" comes before "1r".
        expect(compareFolios('1', '1r')).toBeLessThan(0);
    });

    it('handles recto and verso suffixes', () => {
        expect(compareFolios('1r', '1v')).toBeLessThan(0);
        expect(compareFolios('10v', '11r')).toBeLessThan(0);
    });

    it('handles non-numeric folios like "Guard"', () => {
        expect(compareFolios('Guard', '1')).toBeLessThan(0);
        expect(compareFolios('1', 'Guard')).toBeGreaterThan(0);
        expect(compareFolios('Guard A', 'Guard B')).toBeLessThan(0);
    });

    it('handles missing values', () => {
        expect(compareFolios('', '1')).toBeLessThan(0);
        expect(compareFolios('1', '')).toBeGreaterThan(0);
        expect(compareFolios('', '')).toBe(0);
    });
});

describe('comparePatternIds', () => {
    it('sorts purely numeric pattern IDs numerically', () => {
        expect(comparePatternIds('2', '10')).toBeLessThan(0); // numeric sort
    });

    it('sorts pure numeric before mixed strings', () => {
        expect(comparePatternIds('10', '10+')).toBeLessThan(0);
    });

    it('sorts mixed strings naturally', () => {
        expect(comparePatternIds('10+', '10+20-')).toBeLessThan(0);
    });
});
