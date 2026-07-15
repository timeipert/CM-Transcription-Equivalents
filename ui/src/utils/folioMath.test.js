import { describe, it, expect } from 'vitest';
import { folioToIndex, indexToFolio } from './folioMath';

describe('folioMath', () => {
    describe('folioToIndex', () => {
        it('handles foliated data', () => {
            expect(folioToIndex('1r', 'foliated')).toBe(1);
            expect(folioToIndex('1v', 'foliated')).toBe(2);
            expect(folioToIndex('2r', 'foliated')).toBe(3);
            expect(folioToIndex('2v', 'foliated')).toBe(4);
            expect(folioToIndex('170r', 'foliated')).toBe(339);
            
            // Assume missing suffix is recto
            expect(folioToIndex('170', 'foliated')).toBe(339);
            
            // Ignores leading zeros and junk suffixes
            expect(folioToIndex('0170v', 'foliated')).toBe(340);
            expect(folioToIndex('170va', 'foliated')).toBe(340);
        });

        it('handles paginated data', () => {
            expect(folioToIndex('1', 'paginated')).toBe(1);
            expect(folioToIndex('2', 'paginated')).toBe(2);
            expect(folioToIndex('170', 'paginated')).toBe(170);
            expect(folioToIndex('0170', 'paginated')).toBe(170);
            
            // If paginated but has suffix, ignore the suffix for the number itself
            expect(folioToIndex('170r', 'paginated')).toBe(170);
        });
        
        it('returns null on invalid input', () => {
            expect(folioToIndex('', 'foliated')).toBeNull();
            expect(folioToIndex('abc', 'paginated')).toBeNull();
        });
    });

    describe('indexToFolio', () => {
        it('handles foliated data', () => {
            expect(indexToFolio(1, 'foliated')).toBe('1r');
            expect(indexToFolio(2, 'foliated')).toBe('1v');
            expect(indexToFolio(3, 'foliated')).toBe('2r');
            expect(indexToFolio(4, 'foliated')).toBe('2v');
            expect(indexToFolio(339, 'foliated')).toBe('170r');
            expect(indexToFolio(340, 'foliated')).toBe('170v');
        });

        it('handles paginated data', () => {
            expect(indexToFolio(1, 'paginated')).toBe('1');
            expect(indexToFolio(2, 'paginated')).toBe('2');
            expect(indexToFolio(170, 'paginated')).toBe('170');
        });

        it('returns null on invalid input', () => {
            expect(indexToFolio(0, 'foliated')).toBeNull();
            expect(indexToFolio(-1, 'paginated')).toBeNull();
        });
    });
});
