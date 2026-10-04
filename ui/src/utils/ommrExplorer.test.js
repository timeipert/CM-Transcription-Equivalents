import { describe, it, expect } from 'vitest';
import { FOLIO_PRESETS, createFolioRule, applyPreset, pageToFolio, mapFolio, countCollisions } from './ommrFolioRule';
import { suggestOptimalSelection, suggestLineCoverage, markedNeumes, representativeScore } from './ommrOptimizers';
import { undeskewPointsStr, undeskewBbox, bakeSnippet, bakeLine } from './ommrBake';
import { findMatchingProjectSource } from './ommrProjectMatch';
import { undeskewPoint } from './ommrGeometry';

const rule = (preset, extra = {}) => {
    const r = createFolioRule();
    applyPreset(r, preset);
    return Object.assign(r, extra);
};

describe('folio naming rules', () => {
    it('as-is only drops leading zeros', () => {
        expect(mapFolio('0022', rule('as-is'))).toBe('22');
        expect(mapFolio('145v', rule('as-is'))).toBe('145v');
        expect(mapFolio('0', rule('as-is'))).toBe('0');
    });

    it('digits keeps just the number', () => {
        expect(mapFolio('Seite_0022', rule('digits'))).toBe('22');
        expect(mapFolio('0022', rule('digits'))).toBe('22');
    });

    it('number + r reads the number out of the name and adds the suffix', () => {
        expect(mapFolio('f022_deskew', rule('trailing-r'))).toBe('22r');
        expect(mapFolio('Seite_7', rule('trailing-r'))).toBe('7r');
    });

    it('page → folio turns sequential pages into recto/verso', () => {
        const r = rule('page-folio');
        expect(['001', '002', '003', '004'].map(p => mapFolio(p, r))).toEqual(['1r', '1v', '2r', '2v']);
    });

    it('page → folio honours an offset and a verso start', () => {
        expect(mapFolio('001', rule('page-folio', { offset: 2 }))).toBe('2r');
        expect(mapFolio('001', rule('page-folio', { startVerso: true }))).toBe('1v');
        expect(pageToFolio(1, { offset: -5 })).toBe('1'); // before the first page: the plain number
    });

    it('a name with no number stays as it is in page mode', () => {
        expect(mapFolio('cover', rule('page-folio'))).toBe('cover');
    });

    it('a custom pattern is applied; an invalid one is ignored', () => {
        expect(mapFolio('ab-12-cd', rule('custom', { pattern: '[a-z-]+', replace: '' }))).toBe('12');
        expect(mapFolio('ab-12', rule('custom', { pattern: '(' }))).toBe('ab-12');
    });

    it('never produces an empty label', () => {
        expect(mapFolio('abc', rule('digits'))).toBe('abc');
    });

    it('does not suffix a name that does not end in a digit', () => {
        expect(mapFolio('12v', rule('as-is', { suffix: 'r' }))).toBe('12v');
    });

    it('applyPreset loads a preset, and "custom" leaves the fields', () => {
        const r = createFolioRule();
        applyPreset(r, 'trailing-r');
        expect(r).toMatchObject({ preset: 'trailing-r', suffix: 'r', mode: 'label' });
        r.pattern = 'mine';
        applyPreset(r, 'custom');
        expect(r.pattern).toBe('mine');
        applyPreset(r, 'no-such-preset');
        expect(r.preset).toBe('custom');
    });

    it('counts names that collide after mapping', () => {
        expect(countCollisions(['001', '1', '01'], rule('as-is'))).toBe(2);
        expect(countCollisions(['001', '002'], rule('as-is'))).toBe(0);
    });

    it('has the presets the dialog offers', () => {
        expect(Object.keys(FOLIO_PRESETS)).toEqual(['as-is', 'digits', 'trailing-r', 'page-folio', 'custom']);
    });
});

describe('example selection', () => {
    const snip = (id, folio, lineId, pattern, aspectRatio = 1.2) => ({ id, folio, lineId, pattern, aspectRatio });

    it('picks one example per pattern from as few lines as it can', () => {
        const snippets = [
            snip('1', '1r', 'a', '*'), snip('2', '1r', 'a', '*u'), snip('3', '1r', 'a', '*dd'),
            snip('4', '1v', 'b', '*'), snip('5', '1v', 'b', '*u'),
            snip('6', '2r', 'c', '*dd')
        ];
        const { chosenIds, summary } = suggestOptimalSelection(snippets);
        expect(summary).toMatchObject({ covered: 3, total: 3, lineCount: 1, totalLines: 3 });
        expect(chosenIds.sort()).toEqual(['1', '2', '3']);
    });

    it('prefers the better-shaped example within a line', () => {
        const snippets = [snip('wide', '1r', 'a', '*', 3), snip('good', '1r', 'a', '*', 1.2)];
        expect(suggestOptimalSelection(snippets).chosenIds).toEqual(['good']);
        expect(representativeScore(snip('x', '', '', '', 1.2))).toBe(0);
    });

    it('uses several lines when no single line shows everything', () => {
        const snippets = [snip('1', '1r', 'a', '*'), snip('2', '1r', 'a', '*u'), snip('3', '1v', 'b', '*dd')];
        const { summary, chosenIds } = suggestOptimalSelection(snippets);
        expect(summary.lineCount).toBe(2);
        expect(chosenIds.sort()).toEqual(['1', '2', '3']);
    });

    it('leaves out patterns the user excluded', () => {
        const snippets = [snip('1', '1r', 'a', '*'), snip('2', '1r', 'a', '*u')];
        const { chosenIds, summary } = suggestOptimalSelection(snippets, p => p !== '*u');
        expect(chosenIds).toEqual(['1']);
        expect(summary.total).toBe(1);
    });

    it('returns null when nothing is included', () => {
        expect(suggestOptimalSelection([snip('1', '1r', 'a', '*')], () => false)).toBeNull();
        expect(suggestOptimalSelection([])).toBeNull();
    });

    const line = (id, patterns, neumes = []) => ({ id, patterns, neumes });

    it('picks the fewest lines that show every pattern', () => {
        const lines = [line('a', ['*', '*u']), line('b', ['*u', '*dd']), line('c', ['*', '*u', '*dd'])];
        const res = suggestLineCoverage(lines);
        expect(res.lines.map(l => l.line.id)).toEqual(['c']);
        expect(res).toMatchObject({ covered: 3, total: 3, totalLines: 3 });
    });

    it('records what each chosen line adds, and breaks ties toward the denser line', () => {
        const lines = [line('a', ['*', '*u']), line('b', ['*', '*u', '*d'])];
        const res = suggestLineCoverage(lines);
        expect(res.lines[0].line.id).toBe('b');
        expect(res.lines[0].newPatterns).toEqual(['*', '*u', '*d']);
        const two = suggestLineCoverage([line('x', ['*']), line('y', ['*dd']), line('z', ['*', '*dd'])]);
        expect(two.lines.map(l => l.line.id)).toEqual(['z']);
        const split = suggestLineCoverage([line('x', ['*']), line('y', ['*dd'])]);
        expect(split.lines.map(l => l.newPatterns)).toEqual([['*'], ['*dd']]);
    });

    it('respects exclusions, and returns null when nothing is left', () => {
        const lines = [line('a', ['*', '*u'])];
        expect(suggestLineCoverage(lines, p => p === '*').covered).toBe(1);
        expect(suggestLineCoverage(lines, () => false)).toBeNull();
        expect(suggestLineCoverage([])).toBeNull();
    });

    it('marks one neume per newly contributed pattern', () => {
        const item = {
            newPatterns: ['*', '*u'],
            line: { neumes: [{ id: 1, pattern: '*' }, { id: 2, pattern: '*' }, { id: 3, pattern: '*u' }, { id: 4, pattern: '*dd' }] }
        };
        expect(markedNeumes(item).map(n => n.id)).toEqual([1, 3]);
    });
});

describe('baking deskew into imported data', () => {
    it('leaves coordinates alone when the page was not rotated', () => {
        expect(undeskewPointsStr('10,20 30,40', 0, 1000, 1500)).toBe('10,20 30,40');
        expect(undeskewPointsStr('10,20', 0.5, 0, 1500)).toBe('10,20');
        const box = { x: 1, y: 2, w: 3, h: 4 };
        expect(undeskewBbox(box, 0, 1000, 1500)).toBe(box);
    });

    it('rotates every point back, to three decimals', () => {
        const [x, y] = undeskewPoint(50, 50, 1, 1000, 1500);
        expect(undeskewPointsStr('50,50', 1, 1000, 1500)).toBe(`${x.toFixed(3)},${y.toFixed(3)}`);
        const out = undeskewPointsStr('10,10 90,10', 2, 1000, 1500).split(' ');
        expect(out).toHaveLength(2);
        expect(out[0]).not.toBe('10,10');
    });

    it('passes unparseable tokens through', () => {
        expect(undeskewPointsStr('x,y 10,10', 1, 1000, 1500).split(' ')[0]).toBe('x,y');
    });

    it('the rotated box contains the rotated corners', () => {
        const box = { x: 10, y: 10, w: 20, h: 10 };
        const out = undeskewBbox(box, 3, 1000, 1500);
        expect(out.w).toBeGreaterThanOrEqual(box.w - 0.5);
        expect(out.h).toBeGreaterThan(0);
    });

    it('bakes a snippet: new folio, rotated polygon and note points', () => {
        const snippet = { id: 's', folio: '022', points: '10,10 20,10 20,20 10,20', notePoints: [{ x: 15, y: 15 }] };
        const baked = bakeSnippet(snippet, { deskew: { angle: 1.5, w: 2000, h: 3000 }, folio: '22r' });
        expect(baked.folio).toBe('22r');
        expect(baked.points).not.toBe(snippet.points);
        expect(baked.notePoints).toHaveLength(1);
        expect(baked.id).toBe('s');
        expect(snippet.folio).toBe('022'); // the input is not changed
    });

    it('bakes a snippet with no rotation to the same shape', () => {
        const snippet = { id: 's', folio: '1', points: '10,10 20,10', notePoints: [{ x: 15.12345, y: 15 }] };
        const baked = bakeSnippet(snippet, { deskew: { angle: 0, w: 0, h: 0 }, folio: '1r' });
        expect(baked.points).toBe(snippet.points);
        expect(baked.notePoints).toEqual([{ x: 15.123, y: 15 }]);
    });

    it('bakes a line: box and the polygons of its neumes', () => {
        const ln = { id: 'l', folio: '1', bbox: { x: 5, y: 10, w: 90, h: 8 }, neumes: [{ id: 'n', pattern: '*', points: '10,10 20,10' }] };
        const baked = bakeLine(ln, { deskew: { angle: 2, w: 2000, h: 3000 }, folio: '1r' });
        expect(baked.folio).toBe('1r');
        expect(baked.bbox).not.toEqual(ln.bbox);
        expect(baked.neumes[0].pattern).toBe('*');
        expect(baked.neumes[0].points).not.toBe('10,10 20,10');
    });
});

describe('matching an export to a project manuscript', () => {
    const sources = ['Pa 14819', 'Pa 1107', 'Lo 4', 'Wü 165'];

    it('matches exactly, ignoring case', () => {
        expect(findMatchingProjectSource('pa 14819', sources)).toBe('Pa 14819');
    });

    it('matches once reduced to letters and digits', () => {
        expect(findMatchingProjectSource('Pa_14819', sources)).toBe('Pa 14819');
        expect(findMatchingProjectSource('lo-4', sources)).toBe('Lo 4');
    });

    it('matches a distinctive number', () => {
        expect(findMatchingProjectSource('paris_14819_pages', sources)).toBe('Pa 14819');
    });

    it('does not guess when the number is shared', () => {
        expect(findMatchingProjectSource('book 4', ['Lo 4', 'Mi 4'])).toBeNull();
    });

    it('matches one name inside the other', () => {
        expect(findMatchingProjectSource('Wü 165 export', sources)).toBe('Wü 165');
    });

    it('is null when nothing fits or there is nothing to match', () => {
        expect(findMatchingProjectSource('Zzz', sources)).toBeNull();
        expect(findMatchingProjectSource('', sources)).toBeNull();
        expect(findMatchingProjectSource('Pa 1', [])).toBeNull();
    });
});
