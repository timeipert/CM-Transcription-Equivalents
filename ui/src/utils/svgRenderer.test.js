import { describe, it, expect } from 'vitest';
import { renderSvg } from './svgRenderer';

describe('renderSvg (pure logic)', () => {
    const dummyGlyphs = {
        note: { viewBox: "0 0 10 10", d: "M1" },
        ascending: { viewBox: "0 0 10 10", d: "M2" },
        descending: { viewBox: "0 0 10 10", d: "M3" },
        oriscus: { viewBox: "0 0 10 10", d: "M4" },
        quilisma: { viewBox: "0 0 10 10", d: "M5" },
        strophicus: { viewBox: "0 0 10 10", d: "M6" }
    };

    it('returns empty SVG for missing pattern or glyphs', () => {
        const res = renderSvg('', dummyGlyphs, false);
        expect(res.width).toBe(20);
        expect(res.content).toBe('');
    });

    it('handles the special (Start) pattern', () => {
        const res = renderSvg('(Start)', dummyGlyphs, false);
        expect(res.width).toBe(20);
        expect(res.content).toContain('svg');
        expect(res.content).toContain('M1'); // Uses default note
    });

    it('parses basic notes and increments positions', () => {
        // e.g. "uud"
        const res = renderSvg('uud', dummyGlyphs, false);
        expect(res.content).toContain('M1');
        // Count how many 'scale(0.85)' there are. Start note + u, u, d
        const count = (res.content.match(/scale\(0\.85\)/g) || []).length;
        expect(count).toBe(4);
    });

    it('handles groups (bracket syntax) [uud]', () => {
        const res = renderSvg('[uud]', dummyGlyphs, false);
        // It should render a bracket path with stroke="var(--color-text-muted)"
        expect(res.content).toContain('stroke="var(--color-text-muted)"');
    });

    it('applies ascending/descending special LA/LD', () => {
        // "uLA" or "dLD"
        const res1 = renderSvg('uLA', dummyGlyphs, false);
        expect(res1.content).toContain('M2'); // ascending glyph

        const res2 = renderSvg('dLD', dummyGlyphs, false);
        expect(res2.content).toContain('M3'); // descending glyph
    });

    it('applies other special note suffixes (O, Q, S)', () => {
        const res1 = renderSvg('uO', dummyGlyphs, false);
        expect(res1.content).toContain('M4'); // oriscus
        
        const res2 = renderSvg('dQ', dummyGlyphs, false);
        expect(res2.content).toContain('M5'); // quilisma
        
        const res3 = renderSvg('eS', dummyGlyphs, false);
        expect(res3.content).toContain('M6'); // strophicus
    });
});
