import { describe, it, expect } from 'vitest';
import { getManuscriptStats, extractManuscripts, mergeManuscript, listSources } from './workspaceSharing';

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
