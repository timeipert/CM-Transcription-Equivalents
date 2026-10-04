import { describe, it, expect } from 'vitest';
import { foldLegacyAnnotations, hasLegacyAnnotations, UNASSIGNED_REGION_NAME } from './legacyAnnotations';

const lineRegion = (id, name, x1, y1, x2, y2) => ({
    id, name, points: `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`
});
const box = (x, y, w = 4, h = 4) => `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;

function pageState() {
    return {
        regions: {
            'Pa 1107_1r': [
                lineRegion('r1', 'Line 1', 0, 0, 100, 20),
                lineRegion('r2', 'Line 2', 0, 30, 100, 50)
            ]
        },
        regionItems: { r1: [], r2: [] },
        manualLines: { 'Pa 1107_1r': [1, 2] }
    };
}

describe('hasLegacyAnnotations', () => {
    it('is false without a map or with only empty lists', () => {
        expect(hasLegacyAnnotations({})).toBe(false);
        expect(hasLegacyAnnotations({ annotations: {} })).toBe(false);
        expect(hasLegacyAnnotations({ annotations: { 'A_1r_*': [] } })).toBe(false);
        expect(hasLegacyAnnotations(null)).toBe(false);
    });

    it('is true as soon as one entry exists', () => {
        expect(hasLegacyAnnotations({ annotations: { 'A_1r_*': [{ id: 1 }] } })).toBe(true);
    });
});

describe('foldLegacyAnnotations', () => {
    it('leaves a state without legacy entries untouched (same references)', () => {
        const s = pageState();
        const { state, report } = foldLegacyAnnotations(s);
        expect(state.regions).toBe(s.regions);
        expect(state.regionItems).toBe(s.regionItems);
        expect(report).toEqual({ moved: 0, duplicates: 0, unassigned: 0, createdRegions: 0 });
    });

    it('moves an entry into the line region that contains it', () => {
        const s = { ...pageState(), annotations: { 'Pa 1107_1r_*dd': [{ id: 'a1', points: box(10, 36), linkData: { sysId: 'x' } }] } };
        const { state, report } = foldLegacyAnnotations(s);
        expect(state.regionItems.r2).toHaveLength(1);
        expect(state.regionItems.r2[0]).toMatchObject({ id: 'a1', pattern: '*dd', linkData: { sysId: 'x' } });
        expect(state.regionItems.r1).toHaveLength(0);
        expect(report).toMatchObject({ moved: 1, duplicates: 0, unassigned: 0, createdRegions: 0 });
    });

    it('picks the smallest of several containing regions', () => {
        const s = {
            regions: {
                'S_1r': [
                    lineRegion('big', 'Whole', 0, 0, 100, 100),
                    lineRegion('small', 'Line 1', 0, 0, 50, 50)
                ]
            },
            regionItems: {},
            annotations: { 'S_1r_*': [{ id: 1, points: box(10, 10) }] }
        };
        const { state } = foldLegacyAnnotations(s);
        expect(state.regionItems.small).toHaveLength(1);
        expect(state.regionItems.big).toBeUndefined();
    });

    it('splits a variant that older data kept inside the pattern key', () => {
        const s = { ...pageState(), annotations: { 'Pa 1107_1r_*dd b': [{ id: 'a1', points: box(10, 5) }] } };
        const item = foldLegacyAnnotations(s).state.regionItems.r1[0];
        expect(item.pattern).toBe('*dd');
        expect(item.variant).toBe('b');
    });

    it('keeps an explicit variant over the one in the key', () => {
        const s = { ...pageState(), annotations: { 'Pa 1107_1r_*dd b': [{ id: 'a1', points: box(10, 5), variant: 'c' }] } };
        expect(foldLegacyAnnotations(s).state.regionItems.r1[0].variant).toBe('c');
    });

    it('drops the legacy copy of an item the OMMR import also wrote to a region', () => {
        const base = pageState();
        base.regionItems.r1 = [{ id: 'ommr_1', pattern: '*dd', points: box(10, 5) }];
        const s = { ...base, annotations: { 'Pa 1107_1r_*dd': [{ id: 'ommr_1', points: box(10, 5), importedFrom: 'OMMR4all' }] } };
        const { state, report } = foldLegacyAnnotations(s);
        expect(state.regionItems.r1).toHaveLength(1);
        expect(report.duplicates).toBe(1);
        expect(report.moved).toBe(0);
    });

    it('drops duplicates that repeated imports left under different ids', () => {
        const s = {
            ...pageState(),
            annotations: { 'Pa 1107_1r_*dd': [{ id: 'a', points: box(10, 5) }, { id: 'b', points: box(10, 5) }] }
        };
        const { state, report } = foldLegacyAnnotations(s);
        expect(state.regionItems.r1).toHaveLength(1);
        expect(report).toMatchObject({ moved: 1, duplicates: 1 });
    });

    it('puts an entry outside every line into one flagged whole-page region per page', () => {
        const s = {
            ...pageState(),
            annotations: { 'Pa 1107_1r_*': [{ id: 'a', points: box(10, 70) }], 'Pa 1107_1r_*dd': [{ id: 'b', points: box(60, 80) }] }
        };
        const { state, report } = foldLegacyAnnotations(s);
        const orphans = state.regions['Pa 1107_1r'].filter(r => r.unassigned);
        expect(orphans).toHaveLength(1);
        expect(orphans[0]).toMatchObject({ name: UNASSIGNED_REGION_NAME, points: '0,0 100,0 100,100 0,100' });
        expect(state.regionItems[orphans[0].id].map(i => i.id)).toEqual(['a', 'b']);
        expect(report).toMatchObject({ moved: 2, unassigned: 2, createdRegions: 1 });
    });

    it('creates the page when it had no regions at all', () => {
        const s = { regions: {}, regionItems: {}, annotations: { 'Old 9_3v_*': [{ id: 1, points: box(1, 1) }] } };
        const { state } = foldLegacyAnnotations(s);
        expect(Object.keys(state.regions)).toEqual(['Old 9_3v']);
        expect(state.regions['Old 9_3v'][0].unassigned).toBe(true);
    });

    it('handles a source whose name contains an underscore', () => {
        const s = {
            regions: { 'WiSch 4_5_12r': [lineRegion('w', 'Line 1', 0, 0, 100, 100)] },
            regionItems: {},
            annotations: { 'WiSch 4_5_12r_*dd': [{ id: 'a', points: box(10, 10) }] }
        };
        const { state } = foldLegacyAnnotations(s);
        expect(state.regionItems.w).toHaveLength(1);
        expect(state.regions['WiSch 4_5_12r']).toHaveLength(1);
    });

    it('gives an entry without usable points to the unassigned region', () => {
        const s = { ...pageState(), annotations: { 'Pa 1107_1r_*': [{ id: 'a', points: '' }] } };
        const { state } = foldLegacyAnnotations(s);
        const orphan = state.regions['Pa 1107_1r'].find(r => r.unassigned);
        expect(state.regionItems[orphan.id]).toHaveLength(1);
    });

    it('re-ids an entry whose id collides with a different item on the same page', () => {
        const base = pageState();
        base.regionItems.r1 = [{ id: 7, pattern: '*', points: box(1, 1) }];
        const s = { ...base, annotations: { 'Pa 1107_1r_*dd': [{ id: 7, points: box(10, 5) }] } };
        const { state } = foldLegacyAnnotations(s);
        const ids = state.regionItems.r1.map(i => i.id);
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
    });

    it('assigns an id to an entry that has none', () => {
        const s = { ...pageState(), annotations: { 'Pa 1107_1r_*': [{ points: box(10, 5) }] } };
        expect(foldLegacyAnnotations(s).state.regionItems.r1[0].id).toBeTruthy();
    });

    it('does not mutate its input', () => {
        const s = { ...pageState(), annotations: { 'Pa 1107_1r_*dd': [{ id: 'a1', points: box(10, 36) }] } };
        const before = JSON.stringify(s);
        foldLegacyAnnotations(s);
        expect(JSON.stringify(s)).toBe(before);
    });

    it('is idempotent: folding the result again changes nothing', () => {
        const s = { ...pageState(), annotations: { 'Pa 1107_1r_*dd': [{ id: 'a1', points: box(10, 36) }, { id: 'a2', points: box(10, 70) }] } };
        const once = foldLegacyAnnotations(s).state;
        const twice = foldLegacyAnnotations({ ...once, annotations: {} }).state;
        expect(twice).toEqual(once);
    });

    it('never counts a re-folded unassigned region as a containing line', () => {
        const first = foldLegacyAnnotations({
            regions: {}, regionItems: {},
            annotations: { 'Old 9_3v_*': [{ id: 1, points: box(1, 1) }] }
        }).state;
        const { state } = foldLegacyAnnotations({
            ...first,
            annotations: { 'Old 9_3v_*dd': [{ id: 2, points: box(50, 50) }] }
        });
        expect(state.regions['Old 9_3v']).toHaveLength(1);
        const rid = state.regions['Old 9_3v'][0].id;
        expect(state.regionItems[rid].map(i => i.id)).toEqual([1, 2]);
    });
});
