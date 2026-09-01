import { describe, it, expect } from 'vitest';
import {
    validateSignKey,
    parseSvgToGlyph,
    resolveSignGlyphs,
    stripSignKeys,
    extractSignKeys,
    splitCodeBySigns,
    signMarker
} from './signs';

describe('validateSignKey', () => {
    it('accepts a fresh uppercase letter', () => {
        expect(validateSignKey('V', [])).toBe('');
    });
    it('rejects reserved suffixes', () => {
        expect(validateSignKey('O', [])).not.toBe('');
        expect(validateSignKey('L', [])).not.toBe('');
    });
    it('rejects lowercase, multi-char, and duplicates', () => {
        expect(validateSignKey('v', [])).not.toBe('');
        expect(validateSignKey('VV', [])).not.toBe('');
        expect(validateSignKey('V', ['V'])).not.toBe('');
    });
});

describe('parseSvgToGlyph', () => {
    it('extracts viewBox and path d', () => {
        const svg = '<svg viewBox="0 0 12 12"><path d="M1 2 L3 4"/></svg>';
        const g = parseSvgToGlyph(svg);
        expect(g.viewBox).toBe('0 0 12 12');
        expect(g.d).toBe('M1 2 L3 4');
    });
    it('joins multiple paths and defaults the viewBox', () => {
        const svg = '<svg><path d="M1"/><path d="M2"/></svg>';
        const g = parseSvgToGlyph(svg);
        expect(g.viewBox).toBe('0 0 10 10');
        expect(g.d).toBe('M1 M2');
    });
    it('returns null when no path is present', () => {
        expect(parseSvgToGlyph('<svg><circle/></svg>')).toBe(null);
        expect(parseSvgToGlyph('')).toBe(null);
    });
});

describe('resolveSignGlyphs', () => {
    const glyphs = { note: { viewBox: '0 0 10 10', d: 'N' }, oriscus: { viewBox: '0 0 10 10', d: 'O' } };
    it('prefers custom SVG, falls back to named glyph', () => {
        const signs = [
            { key: 'V', glyph: 'oriscus', glyphSvg: '<svg viewBox="0 0 5 5"><path d="C"/></svg>' },
            { key: 'W', glyph: 'oriscus' }
        ];
        const map = resolveSignGlyphs(signs, glyphs);
        expect(map.V.d).toBe('C');       // custom SVG wins
        expect(map.W.d).toBe('O');       // named built-in glyph
    });
    it('skips signs that resolve to nothing', () => {
        const map = resolveSignGlyphs([{ key: 'X', glyph: 'missing' }], glyphs);
        expect(map.X).toBeUndefined();
    });
});

describe('stripSignKeys / extractSignKeys / signMarker', () => {
    it('strips sign letters to recover the base code', () => {
        expect(stripSignKeys('*uuVdd', ['V'])).toBe('*uudd');
        expect(stripSignKeys('*uudd', ['V'])).toBe('*uudd');
        expect(stripSignKeys('*uuVddW', ['V', 'W'])).toBe('*uudd');
    });
    it('extracts the present sign keys in order', () => {
        expect(extractSignKeys('*uuVddW', ['V', 'W'])).toEqual(['V', 'W']);
        expect(extractSignKeys('*uudd', ['V'])).toEqual([]);
    });
    it('splits a code into plain and sign segments for captioning', () => {
        expect(splitCodeBySigns('*uuVdd', ['V'])).toEqual([
            { text: '*uu', isSign: false },
            { text: 'V', isSign: true },
            { text: 'dd', isSign: false }
        ]);
        // No signs present -> a single plain segment.
        expect(splitCodeBySigns('*uudd', ['V'])).toEqual([{ text: '*uudd', isSign: false }]);
        // Adjacent signs coalesce into one segment.
        expect(splitCodeBySigns('*uVWd', ['V', 'W'])).toEqual([
            { text: '*u', isSign: false },
            { text: 'VW', isSign: true },
            { text: 'd', isSign: false }
        ]);
        expect(splitCodeBySigns('', ['V'])).toEqual([]);
    });

    it('builds a marker from sign abbreviations', () => {
        const signs = [{ key: 'V', abbrev: 'v' }, { key: 'W' }];
        expect(signMarker('*uuVdd', signs)).toBe('v');
        expect(signMarker('*uuVddW', signs)).toBe('vW');
        expect(signMarker('*uudd', signs)).toBe('');
    });
});
