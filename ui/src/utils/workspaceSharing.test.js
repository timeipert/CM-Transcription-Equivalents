import { describe, it, expect } from 'vitest';
import {
    getManuscriptStats, extractManuscripts, mergeManuscript, listSources,
    customManuscriptStats, analyzeCustomCollections, mergeCustomCollections,
    DATA_PARTS, normalizeParts, findBatchOverlaps
} from './workspaceSharing';

// Two sources where one siglum extends the other across an underscore.
function state() {
    return {
        personalTables: [
            { id: 't1', source: 'WiSch 4', rows: [{ pattern: '*' }] },
            { id: 't2', source: 'WiSch 4_5', rows: [{ pattern: '*dd' }] }
        ],
        regions: {
            'WiSch 4_1r': [{ id: 'r1', name: 'Line 1', points: '' }],
            'WiSch 4_5_12r': [{ id: 'r2', name: 'Line 1', points: '' }]
        },
        regionItems: { r1: [{ id: 'i1' }], r2: [{ id: 'i2' }, { id: 'i3' }] },
        manualLines: { 'WiSch 4_1r': [1], 'WiSch 4_5_12r': [1] },
        iiifLinks: { 'WiSch 4_5': 'https://example.org/manifest.json' }
    };
}

describe('listSources', () => {
    it('collects sources from tables, IIIF links and region keys', () => {
        const s = {
            personalTables: [{ source: 'A' }],
            iiifLinks: { B: 'u' },
            regions: { 'C_1r': [], 'WiSch 4_5_12r': [] }
        };
        expect(listSources(s).sort()).toEqual(['A', 'B', 'C', 'WiSch 4_5']);
    });

    it('copes with an empty or missing state', () => {
        expect(listSources(null)).toEqual([]);
        expect(listSources({})).toEqual([]);
    });
});

describe('workspaceSharing with underscore sigla', () => {
    it('counts only the keys of the requested source', () => {
        expect(getManuscriptStats(state(), 'WiSch 4')).toMatchObject({
            regionsCount: 1, annotationsCount: 1, foliosList: ['1r']
        });
        expect(getManuscriptStats(state(), 'WiSch 4_5')).toMatchObject({
            regionsCount: 1, annotationsCount: 2, foliosList: ['12r']
        });
    });

    it('extracts one source without the other', () => {
        const out = extractManuscripts(state(), ['WiSch 4']);
        expect(Object.keys(out.regions)).toEqual(['WiSch 4_1r']);
        expect(Object.keys(out.manualLines)).toEqual(['WiSch 4_1r']);
        expect(Object.keys(out.regionItems)).toEqual(['r1']);
        expect(out.personalTables.map(t => t.id)).toEqual(['t1']);
        expect(out.iiifLinks).toEqual({});
    });

    it('overwriting one source leaves the longer-named source intact', () => {
        const merged = mergeManuscript(state(), state(), 'WiSch 4', 'overwrite');
        expect(merged.regions['WiSch 4_5_12r']).toHaveLength(1);
        expect(merged.regionItems.r2).toHaveLength(2);
        expect(merged.manualLines['WiSch 4_5_12r']).toEqual([1]);
    });

    it('a copy renames only the source part of each key', () => {
        const merged = mergeManuscript(state(), state(), 'WiSch 4_5', 'copy');
        expect(merged.regions['WiSch 4_5 (copy)_12r']).toHaveLength(1);
        expect(merged.manualLines['WiSch 4_5 (copy)_12r']).toEqual([1]);
        expect(merged.iiifLinks['WiSch 4_5 (copy)']).toBe('https://example.org/manifest.json');
        // the original is untouched
        expect(merged.regions['WiSch 4_5_12r']).toHaveLength(1);
    });
});

describe('mergeManuscript strategies', () => {
    const incoming = () => ({
        personalTables: [{ id: 'tbl', source: 'X', name: 'X', rows: [{ pattern: '*' }] }],
        regions: { 'X_1r': [{ id: 'rx', name: 'Line 1', points: '' }] },
        regionItems: { rx: [{ id: 'ix', pattern: '*', points: '1,1' }] },
        manualLines: { 'X_1r': [1] },
        iiifLinks: { X: 'u' }
    });
    const local = () => ({
        personalTables: [{ id: 'old', source: 'X', name: 'X', rows: [] }],
        regions: { 'X_2r': [{ id: 'ry', name: 'Line 1', points: '' }] },
        regionItems: { ry: [{ id: 'iy' }] },
        manualLines: {},
        iiifLinks: {}
    });

    it('skip leaves the current state as it is', () => {
        const cur = local();
        expect(mergeManuscript(cur, incoming(), 'X', 'skip')).toBe(cur);
    });

    it('overwrite replaces everything the source had, and nothing else', () => {
        const merged = mergeManuscript(local(), incoming(), 'X', 'overwrite');
        expect(merged.personalTables.map(t => t.id)).toEqual(['tbl']);
        expect(Object.keys(merged.regions)).toEqual(['X_1r']);
        expect(merged.regionItems.ry).toBeUndefined();
        expect(merged.regionItems.rx).toHaveLength(1);
    });

    it('overwrite keeps the local IIIF link when the incoming data brings none', () => {
        const inc = incoming();
        delete inc.iiifLinks.X;
        const merged = mergeManuscript({ ...local(), iiifLinks: { X: 'mine' } }, inc, 'X', 'overwrite');
        expect(merged.iiifLinks.X).toBe('mine');
        const replaced = mergeManuscript({ ...local(), iiifLinks: { X: 'mine' } }, incoming(), 'X', 'overwrite');
        expect(replaced.iiifLinks.X).toBe('u');
    });

    it('copy keeps the local source and adds the incoming one beside it with fresh ids', () => {
        const merged = mergeManuscript(local(), incoming(), 'X', 'copy');
        expect(Object.keys(merged.regions).sort()).toEqual(['X (copy)_1r', 'X_2r']);
        const copied = merged.regions['X (copy)_1r'][0];
        expect(copied.id).not.toBe('rx');
        expect(merged.regionItems[copied.id][0].id).not.toBe('ix');
        expect(merged.personalTables.map(t => t.source).sort()).toEqual(['X', 'X (copy)']);
    });

    describe('merge (what a pull from the shared repository does)', () => {
        it('removes nothing: local regions, items and rows stay, the incoming ones are added', () => {
            const merged = mergeManuscript(local(), incoming(), 'X', 'merge');
            expect(Object.keys(merged.regions).sort()).toEqual(['X_1r', 'X_2r']);
            expect(merged.regionItems.ry).toEqual([{ id: 'iy' }]);
            expect(merged.regionItems.rx).toHaveLength(1);
            expect(merged.personalTables).toHaveLength(1);
            expect(merged.personalTables[0].id).toBe('old');
            expect(merged.personalTables[0].rows.map(r => r.pattern)).toEqual(['*']);
            expect(merged.iiifLinks.X).toBe('u');
        });

        it('a source known to the repository only by its IIIF link leaves local work alone', () => {
            const onlyLink = { personalTables: [], regions: {}, regionItems: {}, manualLines: {}, iiifLinks: { X: 'u2' } };
            const merged = mergeManuscript({ ...local(), iiifLinks: { X: 'mine' } }, onlyLink, 'X', 'merge');
            expect(Object.keys(merged.regions)).toEqual(['X_2r']);
            expect(merged.regionItems.ry).toHaveLength(1);
            expect(merged.personalTables.map(t => t.id)).toEqual(['old']);
            expect(merged.iiifLinks.X).toBe('mine');
        });

        it('an entry on both sides takes the incoming values and keeps fields only this app has', () => {
            const cur = {
                ...local(),
                regions: { 'X_1r': [{ id: 'rx', name: 'old name', points: 'a', ommrLineId: 'L7' }] },
                regionItems: { rx: [{ id: 'ix', pattern: '*', points: '9,9', linkData: { n: 1 } }] }
            };
            const merged = mergeManuscript(cur, incoming(), 'X', 'merge');
            expect(merged.regions['X_1r']).toEqual([{ id: 'rx', name: 'Line 1', points: '', ommrLineId: 'L7' }]);
            expect(merged.regionItems.rx).toEqual([{ id: 'ix', pattern: '*', points: '1,1', linkData: { n: 1 } }]);
        });

        it('an incoming value that is missing does not erase a local one', () => {
            const cur = { ...local(), regions: { 'X_1r': [{ id: 'rx', name: 'n', points: 'p', lineUUID: 'keep' }] } };
            const inc = incoming();
            inc.regions['X_1r'][0].lineUUID = undefined;
            const merged = mergeManuscript(cur, inc, 'X', 'merge');
            expect(merged.regions['X_1r'][0].lineUUID).toBe('keep');
        });

        it('merging the same data twice changes nothing', () => {
            const once = mergeManuscript(local(), incoming(), 'X', 'merge');
            const twice = mergeManuscript(once, incoming(), 'X', 'merge');
            expect(twice).toEqual(once);
        });

        it('does not mutate what it was given', () => {
            const cur = local();
            const before = JSON.stringify(cur);
            mergeManuscript(cur, incoming(), 'X', 'merge');
            expect(JSON.stringify(cur)).toBe(before);
        });
    });

    it('does not mutate the state it was given', () => {
        const cur = local();
        const before = JSON.stringify(cur);
        mergeManuscript(cur, incoming(), 'X', 'overwrite');
        expect(JSON.stringify(cur)).toBe(before);
    });
});

describe('custom manuscripts (direct-snippet collections)', () => {
    const snip = id => ({ id, pattern: '*', image: 'data:image/png;base64,AA==' });
    const coll = (id, source, snippets = 1, extra = {}) => ({
        id, source, name: '', notes: '', isPublished: false,
        patterns: [{ code: '*', label: '' }],
        snippets: Array.from({ length: snippets }, (_, i) => snip(`${id}-s${i}`)),
        ...extra
    });

    it('counts snippets and patterns', () => {
        expect(customManuscriptStats(coll('a', 'A', 3))).toEqual({ snippets: 3, patterns: 1, hasData: true });
        expect(customManuscriptStats({ id: 'e', source: 'E', patterns: [], snippets: [] }).hasData).toBe(false);
        expect(customManuscriptStats(undefined).hasData).toBe(false);
    });

    describe('analyzeCustomCollections', () => {
        it('reports a manuscript the workspace does not have as new', () => {
            const { newCollections, overlapCollections } = analyzeCustomCollections([coll('a', 'A', 2)], [coll('b', 'B')]);
            expect(overlapCollections).toEqual([]);
            expect(newCollections).toMatchObject([{ id: 'a', source: 'A', incomingStats: { snippets: 2 } }]);
        });

        it('reports the same id as an overlap, with both sides\' figures', () => {
            const { overlapCollections } = analyzeCustomCollections([coll('a', 'A', 5)], [coll('a', 'A', 2)]);
            expect(overlapCollections).toMatchObject([{ id: 'a', sameId: true, incomingStats: { snippets: 5 }, localStats: { snippets: 2 } }]);
        });

        it('reports the same siglum under another id as an overlap, ignoring case and spaces', () => {
            const { overlapCollections } = analyzeCustomCollections([coll('x', ' cod. sang. 359 ')], [coll('a', 'Cod. Sang. 359', 4)]);
            expect(overlapCollections).toMatchObject([{ id: 'x', sameId: false, localStats: { snippets: 4 } }]);
        });

        it('copes with a missing list', () => {
            expect(analyzeCustomCollections(undefined, undefined)).toEqual({ newCollections: [], overlapCollections: [] });
        });
    });

    describe('mergeCustomCollections', () => {
        const local = () => [coll('a', 'A', 2), coll('b', 'B', 1)];

        it('adds new manuscripts and keeps the rest', () => {
            const merged = mergeCustomCollections(local(), [coll('c', 'C')]);
            expect(merged.map(c => c.id)).toEqual(['a', 'b', 'c']);
        });

        it('overwrites in place by default (the file wins)', () => {
            const merged = mergeCustomCollections(local(), [coll('a', 'A', 7)]);
            expect(merged.map(c => c.id)).toEqual(['a', 'b']);
            expect(merged[0].snippets).toHaveLength(7);
        });

        it('overwrites the local manuscript that has the same siglum under another id', () => {
            const merged = mergeCustomCollections(local(), [coll('z', 'A', 9)], { z: 'overwrite' });
            expect(merged.map(c => c.id)).toEqual(['z', 'b']);
        });

        it('skips when told to', () => {
            const merged = mergeCustomCollections(local(), [coll('a', 'A', 7)], { a: 'skip' });
            expect(merged).toEqual(local());
        });

        it('keeps both as a copy: new id, "(copy)" siglum, not published', () => {
            const merged = mergeCustomCollections(local(), [coll('a', 'A', 7, { isPublished: true })], { a: 'copy' }, () => 'dc_new');
            expect(merged.map(c => [c.id, c.source])).toEqual([['a', 'A'], ['b', 'B'], ['dc_new', 'A (copy)']]);
            expect(merged[2].isPublished).toBe(false);
            expect(merged[2].snippets).toHaveLength(7);
        });

        it('numbers further copies', () => {
            let merged = mergeCustomCollections(local(), [coll('a', 'A')], { a: 'copy' }, () => 'c1');
            merged = mergeCustomCollections(merged, [coll('a', 'A')], { a: 'copy' }, () => 'c2');
            expect(merged.map(c => c.source)).toEqual(['A', 'B', 'A (copy)', 'A (copy 2)']);
        });

        it('does not mutate its inputs', () => {
            const l = local();
            const inc = [coll('a', 'A', 7)];
            const before = JSON.stringify([l, inc]);
            mergeCustomCollections(l, inc, { a: 'overwrite' });
            mergeCustomCollections(l, inc, { a: 'copy' });
            expect(JSON.stringify([l, inc])).toBe(before);
        });
    });
});

describe('kinds of data (parts)', () => {
    const full = () => ({
        personalTables: [{ id: 't', source: 'X', name: 'X', rows: [{ pattern: '*' }] }],
        regions: { 'X_1r': [{ id: 'rx', name: 'Line 1', points: '' }] },
        regionItems: { rx: [{ id: 'ix', pattern: '*', points: '1,1' }] },
        manualLines: { 'X_1r': [1] },
        iiifLinks: { X: 'u' }
    });

    it('normalizeParts reads a list of names; nothing or garbage means all', () => {
        expect(normalizeParts(['tables'])).toEqual({ annotations: false, tables: true, iiifLinks: false });
        expect(normalizeParts(undefined)).toEqual({ annotations: true, tables: true, iiifLinks: true });
        expect(normalizeParts('tables')).toEqual({ annotations: true, tables: true, iiifLinks: true });
        expect(DATA_PARTS).toEqual(['annotations', 'tables', 'iiifLinks']);
    });

    it('extractManuscripts keeps only the requested parts', () => {
        const onlyTables = extractManuscripts(full(), ['X'], { parts: ['tables'] });
        expect(onlyTables.personalTables).toHaveLength(1);
        expect(onlyTables.regions).toEqual({});
        expect(onlyTables.regionItems).toEqual({});
        expect(onlyTables.manualLines).toEqual({});
        expect(onlyTables.iiifLinks).toEqual({});

        const noTables = extractManuscripts(full(), ['X'], { parts: ['annotations', 'iiifLinks'] });
        expect(noTables.personalTables).toEqual([]);
        expect(Object.keys(noTables.regions)).toEqual(['X_1r']);
        expect(noTables.iiifLinks).toEqual({ X: 'u' });
    });

    it('an overwrite from a file without tables leaves the local table in place', () => {
        const incoming = extractManuscripts(full(), ['X'], { parts: ['annotations'] });
        const local = {
            personalTables: [{ id: 'mine', source: 'X', name: 'X', rows: [{ pattern: '*dd', customId: '7' }] }],
            regions: { 'X_2r': [{ id: 'ry', name: 'Line 1', points: '' }] },
            regionItems: { ry: [{ id: 'iy' }] },
            manualLines: {},
            iiifLinks: {}
        };
        const merged = mergeManuscript(local, incoming, 'X', 'overwrite', { parts: ['annotations'] });
        expect(merged.personalTables.map(t => t.id)).toEqual(['mine']);
        expect(Object.keys(merged.regions)).toEqual(['X_1r']);
        expect(merged.regionItems.ry).toBeUndefined();
    });

    it('an overwrite from a file with only tables leaves the local regions in place', () => {
        const incoming = extractManuscripts(full(), ['X'], { parts: ['tables'] });
        const local = { ...full(), personalTables: [{ id: 'mine', source: 'X', rows: [] }] };
        const merged = mergeManuscript(local, incoming, 'X', 'overwrite', { parts: ['tables'] });
        expect(merged.personalTables.map(t => t.id)).toEqual(['t']);
        expect(merged.regions).toEqual(local.regions);
        expect(merged.regionItems).toEqual(local.regionItems);
    });

    it('two copies of one manuscript get two names and distinct ids', () => {
        let state = full();
        state = mergeManuscript(state, full(), 'X', 'copy');
        state = mergeManuscript(state, full(), 'X', 'copy');
        expect(listSources(state).sort()).toEqual(['X', 'X (copy 2)', 'X (copy)']);
        const ids = Object.values(state.regions).flat().map(r => r.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('findBatchOverlaps', () => {
    it('marks what an earlier file already brings, by manuscript name and by custom-manuscript id or siglum', () => {
        const result = findBatchOverlaps([
            { sources: ['A', 'B'], collections: [{ id: 'c1', source: 'S1' }] },
            { sources: ['B', 'C'], collections: [{ id: 'c9', source: 's1' }] },
            { sources: ['A', 'B'], collections: [{ id: 'c1', source: 'Other' }] }
        ]);
        expect(result[0]).toEqual({ sources: {}, collections: {} });
        expect(result[1]).toEqual({ sources: { B: 0 }, collections: { c9: 0 } });
        // The latest earlier file is named.
        expect(result[2]).toEqual({ sources: { A: 0, B: 1 }, collections: { c1: 0 } });
    });

    it('a file that is left out overlaps nothing and hides nothing', () => {
        const result = findBatchOverlaps([{ sources: ['A'], collections: [] }, null, { sources: ['A'], collections: [] }]);
        expect(result[1]).toEqual({ sources: {}, collections: {} });
        expect(result[2].sources).toEqual({ A: 0 });
    });
});

describe('mergeCustomCollections and new custom manuscripts', () => {
    it('a skip choice leaves out a custom manuscript that collides with nothing', () => {
        const merged = mergeCustomCollections([], [{ id: 'n', source: 'New', snippets: [], patterns: [] }], { n: 'skip' });
        expect(merged).toEqual([]);
        expect(mergeCustomCollections([], [{ id: 'n', source: 'New' }]).map(c => c.id)).toEqual(['n']);
    });
});
