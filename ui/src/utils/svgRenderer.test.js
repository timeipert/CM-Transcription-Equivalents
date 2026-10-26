import { describe, it, expect } from 'vitest';
import { renderSvg, pathInkBounds } from './svgRenderer';

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

    it('draws one bracket per group, also for groups written next to each other', () => {
        const brackets = code => (renderSvg(code, dummyGlyphs, false).content.match(/stroke="var\(--color-text-muted\)"/g) || []).length;
        expect(brackets('[*u]')).toBe(1);
        expect(brackets('[*u][udL]')).toBe(2);   // 46+ in the pattern library
        expect(brackets('[*u]d[udL]')).toBe(2);
        expect(brackets('[*u][udL][*d]')).toBe(3);
    });

    it('applies ascending/descending special LA/LD', () => {
        // "uLA" or "dLD"
        const res1 = renderSvg('uLA', dummyGlyphs, false);
        expect(res1.content).toContain('M2'); // ascending glyph

        const res2 = renderSvg('dLD', dummyGlyphs, false);
        expect(res2.content).toContain('M3'); // descending glyph
    });

    it('keeps the tall LA/LD glyphs inside the picture (nothing cropped)', () => {
        // Same shape as the shipped glyphs: a 12x60 viewBox, ink only between y=25 and y=43
        // (descending) or y=17 and y=35 (ascending); the note head sits at the viewBox centre.
        const tall = {
            ...dummyGlyphs,
            ascending: { viewBox: '24 0 12 60', d: 'M24 35 L36 35 L36 17 Z' },
            descending: { viewBox: '24 0 12 60', d: 'M24 25 L36 25 L36 43 Z' },
        };
        for (const code of ['*LD', '*LA', '*uLD', '*dLA', '[*dLD]', '[*uLA]d']) {
            const r = renderSvg(code, tall, false);
            const [, , w, h] = r.viewBox.split(' ').map(Number);
            expect(w).toBe(r.width);
            expect(h).toBe(r.height);
            // Every glyph is drawn as translate(x,y) scale(s) with its ink inside the picture.
            const drawn = [...r.content.matchAll(/translate\(([-\d.]+),([-\d.]+)\) scale\(([\d.]+)\)"><path d="M24 (\d+)/g)];
            expect(drawn.length).toBeGreaterThan(0);
            for (const m of drawn) {
                const [ty, scale, startY] = [Number(m[2]), Number(m[3]), Number(m[4])];
                const inkTop = ty + Math.min(startY, startY === 35 ? 17 : 25) * scale;
                const inkBottom = ty + (startY === 35 ? 35 : 43) * scale;
                expect(inkTop).toBeGreaterThanOrEqual(0);
                expect(inkBottom).toBeLessThanOrEqual(r.height);
            }
        }
    });

    it('does not enlarge the picture for ordinary notes', () => {
        expect(renderSvg('*', dummyGlyphs, false).height).toBe(32);
        expect(renderSvg('*u', dummyGlyphs, false).height).toBe(40);
    });

    it('applies other special note suffixes (O, Q, S)', () => {
        const res1 = renderSvg('uO', dummyGlyphs, false);
        expect(res1.content).toContain('M4'); // oriscus

        const res2 = renderSvg('dQ', dummyGlyphs, false);
        expect(res2.content).toContain('M5'); // quilisma

        const res3 = renderSvg('eS', dummyGlyphs, false);
        expect(res3.content).toContain('M6'); // strophicus
    });

    it('renders a custom code-variant sign glyph', () => {
        const customSigns = { V: { viewBox: '0 0 10 10', d: 'M99' } };
        // *uuVdd: the second 'u' carries the custom V sign.
        const res = renderSvg('*uuVdd', dummyGlyphs, false, customSigns);
        expect(res.content).toContain('M99'); // custom virga glyph
        // Base notes still render.
        expect(res.content).toContain('M1');
    });

    it('ignores custom sign letters when no definition is provided', () => {
        // Without a customSigns map, 'V' is treated as an unknown suffix and skipped,
        // so it never crashes and the base notes still render.
        const res = renderSvg('*uuVdd', dummyGlyphs, false);
        expect(res.content).toContain('M1');
        expect(res.content).not.toContain('M99');
    });
});

describe('pathInkBounds', () => {
    it('reads absolute and relative commands', () => {
        expect(pathInkBounds('M1 2 L5 8')).toEqual({ minX: 1, maxX: 5, minY: 2, maxY: 8 });
        expect(pathInkBounds('m 1,2 l 4,6 h -2 v 3 z')).toEqual({ minX: 1, maxX: 5, minY: 2, maxY: 11 });
    });

    it('reads the shipped ascending glyph', () => {
        const d = 'm 28.846225,35.094337 c -2.306802,0 -4.382925,-1.557091 -4.382925,-4.123409 l 0,-13.6 z';
        const b = pathInkBounds(d);
        expect(b.maxY).toBeCloseTo(35.094337);
        expect(b.minY).toBeLessThan(18);
    });

    it('returns null for a path it cannot read', () => {
        expect(pathInkBounds('M1 2 X 3 4')).toBeNull();
    });
});
