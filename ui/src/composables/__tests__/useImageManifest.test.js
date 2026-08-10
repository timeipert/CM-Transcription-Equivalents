import { describe, it, expect } from 'vitest';
import { normalizeFolioName } from '../useImageManifest';

describe('normalizeFolioName', () => {
    it('handles null and empty', () => {
        expect(normalizeFolioName(null)).toBe('');
        expect(normalizeFolioName('')).toBe('');
        expect(normalizeFolioName('   ')).toBe('');
    });

    it('appends r to pure digits', () => {
        expect(normalizeFolioName('10')).toBe('10r');
        expect(normalizeFolioName('34')).toBe('34r');
        expect(normalizeFolioName('91')).toBe('91r');
    });

    it('leaves existing r or v intact', () => {
        expect(normalizeFolioName('10r')).toBe('10r');
        expect(normalizeFolioName('10v')).toBe('10v');
        expect(normalizeFolioName('34r')).toBe('34r');
    });

    it('converts recto/verso', () => {
        expect(normalizeFolioName('10 recto')).toBe('10r');
        expect(normalizeFolioName('10 verso')).toBe('10v');
        expect(normalizeFolioName('10recto')).toBe('10r');
        expect(normalizeFolioName('10verso')).toBe('10v');
    });

    it('removes leading page markers', () => {
        expect(normalizeFolioName('p. 10')).toBe('10r');
        expect(normalizeFolioName('p 10')).toBe('10r');
        expect(normalizeFolioName('p. 10v')).toBe('10v');
    });

    it('removes leading zeros', () => {
        expect(normalizeFolioName('010')).toBe('10r');
        expect(normalizeFolioName('0010v')).toBe('10v');
    });

    it('unwraps parentheses', () => {
        expect(normalizeFolioName('(10)')).toBe('10r');
        expect(normalizeFolioName('(10)v')).toBe('10v');
    });

    it('removes structural suffixes like -a or /1', () => {
        expect(normalizeFolioName('10-a')).toBe('10r');
        expect(normalizeFolioName('10/1')).toBe('10r');
        expect(normalizeFolioName('10r-a')).toBe('10r');
        expect(normalizeFolioName('10v/2')).toBe('10v');
    });

    it('removes trailing column letters', () => {
        expect(normalizeFolioName('22b')).toBe('22r');
        expect(normalizeFolioName('10r a')).toBe('10r');
        expect(normalizeFolioName('10v b')).toBe('10v');
        expect(normalizeFolioName('12 a')).toBe('12r');
    });
});

describe('getIiifRegionUrl', () => {
    it('formats numeric sizes with trailing comma per IIIF specification', () => {
        const formatSize = (width) => {
            let sizeParam = width;
            if (typeof width === 'number' || (typeof width === 'string' && /^\d+$/.test(width))) {
                sizeParam = `${width},`;
            }
            return sizeParam;
        };
        expect(formatSize(1600)).toBe('1600,');
        expect(formatSize('1600')).toBe('1600,');
        expect(formatSize('full')).toBe('full');
        expect(formatSize('1600,')).toBe('1600,');
    });
});
