import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../utils/directSnippetsDb', () => ({
    loadCollections: async () => [],
    saveCollections: async () => true
}));

import { useSettingsStore, PERSISTED_SETTINGS } from './settings';
import { useAnnotationsStore } from './annotations';
import { usePersonalTablesStore } from './personalTables';
import { useIiifStore } from './iiif';
import { usePatternLibraryStore } from './patternLibrary';
import { useOmmrSettingsStore } from './ommrSettings';
import { useDirectSnippetsStore } from './directSnippets';

const box = (x, y, w = 4, h = 4) => `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;

beforeEach(() => setActivePinia(createPinia()));

describe('settings store', () => {
    it('serialize() lists exactly the PERSISTED_SETTINGS', () => {
        const s = useSettingsStore();
        expect(Object.keys(s.serialize()).sort()).toEqual(Object.keys(PERSISTED_SETTINGS).sort());
    });

    it('every persisted setting survives serialize -> JSON -> hydrate', () => {
        const a = useSettingsStore();
        a.snippetSize = 90;
        a.snippetPadding = 0; // 0 is a real value, not "unset"
        a.autoFillIds = false;
        a.displayMode = 'text';
        a.backupLabel = '';
        a.globalDisplayIds = { '*': '1' };
        a.customSigns = [{ key: 'k', label: 'K' }];
        a.codeVariants = { '*': [{ id: 'v', code: '*k' }] };
        a.discriminateSigns = false;
        a.sourceAlignments = { S: { offset: 2, pins: { 3: '4r' } } };
        a.sourceMetaFields = [{ key: 'century', label: 'Century' }];
        a.sourceMeta = { S: { century: '12' } };
        a.snippetVariants = [{ key: 'x', label: 'Ex' }];
        const saved = JSON.parse(JSON.stringify(a.serialize()));

        setActivePinia(createPinia());
        const b = useSettingsStore();
        b.hydrate(saved);
        expect(b.serialize()).toEqual(saved);
        expect(b.snippetPadding).toBe(0);
        expect(b.backupLabel).toBe('');
    });

    it('ignores values of the wrong shape and keeps the current value', () => {
        const s = useSettingsStore();
        s.hydrate({ customSigns: {}, globalDisplayIds: [], autoFillIds: 'yes', snippetSize: 'big', displayMode: 5, sourceMeta: null });
        expect(s.customSigns).toEqual([]);
        expect(s.globalDisplayIds).toEqual({});
        expect(s.autoFillIds).toBe(true);
        expect(s.snippetSize).toBe(60);
        expect(s.displayMode).toBe('svg');
    });

    it('accepts numeric strings for numeric settings (older builds stored them so)', () => {
        const s = useSettingsStore();
        s.hydrate({ snippetSize: '75', snippetPadding: '0.5' });
        expect(s.snippetSize).toBe(75);
        expect(s.snippetPadding).toBe(0.5);
    });

    it('a partial payload leaves the other settings alone', () => {
        const s = useSettingsStore();
        s.snippetSize = 99;
        s.hydrate({ displayMode: 'arrow' });
        expect(s.snippetSize).toBe(99);
        expect(s.displayMode).toBe('arrow');
    });

    it('keeps the backup label out of shared serialization and shared hydration', () => {
        const s = useSettingsStore();
        s.backupLabel = 'Mine';
        expect(s.serialize({ shared: true })).not.toHaveProperty('backupLabel');
        s.hydrate({ backupLabel: 'Theirs' }, { shared: true });
        expect(s.backupLabel).toBe('Mine');
    });

    it('does not share default containers between store instances', () => {
        const a = useSettingsStore();
        a.customSigns.push({ key: 'leak' });
        setActivePinia(createPinia());
        expect(useSettingsStore().customSigns).toEqual([]);
    });

    it('reset() restores the defaults', () => {
        const s = useSettingsStore();
        s.snippetSize = 5;
        s.customSigns = [{ key: 'k' }];
        s.reset();
        expect(s.snippetSize).toBe(60);
        expect(s.customSigns).toEqual([]);
    });
});

describe('annotations store', () => {
    function seed(a) {
        a.hydrate({
            regions: {
                'S_1r': [
                    { id: 'r1', name: 'Line 1', points: '0,0 100,0 100,20 0,20' },
                    { id: 'r2', name: 'Line 2', points: '0,30 100,30 100,50 0,50' }
                ]
            },
            regionItems: { r1: [{ id: 'i1', pattern: '*', points: box(5, 5) }], r2: [] },
            manualLines: { 'S_1r': [1, 2] }
        });
    }

    it('round-trips through serialize/hydrate', () => {
        const a = useAnnotationsStore();
        seed(a);
        const saved = JSON.parse(JSON.stringify(a.serialize()));
        setActivePinia(createPinia());
        const b = useAnnotationsStore();
        b.hydrate(saved);
        expect(b.serialize()).toEqual(saved);
    });

    it('folds legacy whole-page annotations into regions on hydrate', () => {
        const a = useAnnotationsStore();
        a.hydrate({
            regions: { 'S_1r': [{ id: 'r1', name: 'Line 1', points: '0,0 100,0 100,20 0,20' }] },
            regionItems: {},
            annotations: { 'S_1r_*dd b': [{ id: 7, points: box(10, 5), linkData: { sysId: 'x' } }] }
        });
        expect(a.getAnnotations('S', '1r', '*dd')).toHaveLength(1);
        expect(a.getAnnotations('S', '1r', '*dd')[0]).toMatchObject({ id: 7, variant: 'b', regionId: 'r1' });
        expect(a.serialize()).not.toHaveProperty('annotations');
    });

    it('hydrate() with only a legacy map (the oldest storage layout) folds into the current regions', () => {
        const a = useAnnotationsStore();
        seed(a);
        a.hydrate({ annotations: { 'S_1r_*': [{ id: 'o', points: box(10, 36) }] } });
        expect(a.getRegionItems('r2').map(i => i.id)).toEqual(['o']);
    });

    it('indexes which page a region lives on', () => {
        const a = useAnnotationsStore();
        seed(a);
        expect(a.pageKeyByRegionId).toEqual({ r1: 'S_1r', r2: 'S_1r' });
        a.removeRegion('S', '1r', 'r2');
        expect(a.pageKeyByRegionId).toEqual({ r1: 'S_1r' });
    });

    it('gives new items and regions collision-free ids', () => {
        const a = useAnnotationsStore();
        seed(a);
        const ids = new Set();
        for (let i = 0; i < 50; i++) ids.add(a.addItemToRegion('r1', '*', box(i, 1)));
        for (let i = 0; i < 50; i++) ids.add(a.addRegion('S', '2r', `Line ${i}`, box(0, i)));
        expect(ids.size).toBe(100);
    });

    it('finds, updates and removes an item by id wherever it sits on the page', () => {
        const a = useAnnotationsStore();
        seed(a);
        a.updateAnnotation('S', '1r', '*', 'i1', { variant: 'c' });
        expect(a.getAnnotations('S', '1r', '*')[0].variant).toBe('c');
        a.removeAnnotation('S', '1r', '*', 'i1');
        expect(a.getAnnotations('S', '1r', '*')).toEqual([]);
    });

    it('removing a region drops its items too', () => {
        const a = useAnnotationsStore();
        seed(a);
        a.removeRegion('S', '1r', 'r1');
        expect(a.regionItems.r1).toBeUndefined();
    });

    it('OMMR snippets go to their line region and a re-import adds nothing', () => {
        const a = useAnnotationsStore();
        const lines = [
            { id: 'L1', folio: '1r', bbox: { x: 0, y: 0, w: 100, h: 20 } },
            { id: 'L2', folio: '1r', bbox: { x: 0, y: 30, w: 100, h: 20 } }
        ];
        const snippets = [
            { folio: '1r', pattern: '*dd', points: box(10, 33), lineId: 'L2', aspectRatio: 1 },
            { folio: '1r', pattern: '*', points: box(10, 3), lineId: 'L1', aspectRatio: 1 }
        ];
        expect(a.importOmmrSnippets('S', snippets, lines)).toBe(2);
        const byName = Object.fromEntries(a.getRegions('S', '1r').map(r => [r.name, r.id]));
        expect(a.getRegionItems(byName['Line 2']).map(i => i.pattern)).toEqual(['*dd']);
        expect(a.getRegionItems(byName['Line 1']).map(i => i.pattern)).toEqual(['*']);
        expect(a.importOmmrSnippets('S', snippets, lines)).toBe(0);
        expect(a.getRegions('S', '1r')).toHaveLength(2);
    });

    it('OMMR snippets on a page with no regions go to the page\'s unassigned region', () => {
        const a = useAnnotationsStore();
        expect(a.importOmmrSnippets('S', [{ folio: '9v', pattern: '*', points: box(1, 1) }])).toBe(1);
        const regions = a.getRegions('S', '9v');
        expect(regions).toHaveLength(1);
        expect(regions[0].unassigned).toBe(true);
    });

    it('clears one manuscript without touching another whose name extends it', () => {
        const a = useAnnotationsStore();
        a.hydrate({
            regions: {
                'WiSch 4_1r': [{ id: 'a', name: 'Line 1', points: '' }],
                'WiSch 4_5_1r': [{ id: 'b', name: 'Line 1', points: '' }]
            },
            regionItems: { a: [{ id: 1 }], b: [{ id: 2 }] },
            manualLines: { 'WiSch 4_1r': [1], 'WiSch 4_5_1r': [1] }
        });
        a.clearManuscript('WiSch 4');
        expect(Object.keys(a.regions)).toEqual(['WiSch 4_5_1r']);
        expect(Object.keys(a.regionItems)).toEqual(['b']);
        expect(Object.keys(a.manualLines)).toEqual(['WiSch 4_5_1r']);
    });

    it('clears only the chosen folios, or only snippets', () => {
        const a = useAnnotationsStore();
        a.hydrate({
            regions: { 'S_1r': [{ id: 'a', name: 'L', points: '' }], 'S_2r': [{ id: 'b', name: 'L', points: '' }] },
            regionItems: { a: [{ id: 1, pattern: '*' }], b: [{ id: 2, pattern: '*' }] },
            manualLines: {}
        });
        a.clearManuscript('S', { folios: ['1r'], manualLines: false });
        expect(Object.keys(a.regions)).toEqual(['S_2r']);

        a.clearManuscript('S', { regions: false, snippets: true });
        expect(Object.keys(a.regions)).toEqual(['S_2r']);
        expect(a.regionItems.b).toBeUndefined();
    });

    it('rejects containers of the wrong type in hydrate()', () => {
        const a = useAnnotationsStore();
        seed(a);
        a.hydrate({ regions: [], regionItems: 'x', manualLines: null });
        expect(Object.keys(a.regions)).toEqual(['S_1r']);
    });
});

describe('annotations store: one page, two spellings of its folio', () => {
    // An older build keyed this page by the transcription's folio ("18v"); the
    // workspace now asks by the IIIF canvas label ("fol. 18v").
    let ann;
    beforeEach(() => {
        ann = useAnnotationsStore();
        ann.hydrate({
            regions: { 'Ox 340_18v': [{ id: 'r1', name: 'Line 2', points: '0,0 1,1' }] },
            regionItems: { r1: [{ id: 'i1', pattern: '*', points: '0,0' }] },
            manualLines: { 'Ox 340_18v': [2] }
        });
    });

    it('finds the lines under either spelling', () => {
        expect(ann.getRegions('Ox 340', 'fol. 18v').map(r => r.id)).toEqual(['r1']);
        expect(ann.getRegions('Ox 340', '18v').map(r => r.id)).toEqual(['r1']);
        expect(ann.getManualLines('Ox 340', 'fol. 18v')).toEqual([2]);
        expect(ann.getAnnotations('Ox 340', 'fol. 18v', '*')).toHaveLength(1);
    });

    it('adds new lines to the key that already holds the page, so it does not split', () => {
        ann.addRegion('Ox 340', 'fol. 18v', 'Line 5', '0,2 1,3');
        ann.addManualLine('Ox 340', 'fol. 18v', 5);
        expect(Object.keys(ann.regions)).toEqual(['Ox 340_18v']);
        expect(ann.regions['Ox 340_18v'].map(r => r.name)).toEqual(['Line 2', 'Line 5']);
        expect(ann.manualLines['Ox 340_18v']).toEqual([2, 5]);
    });

    it('updates and removes under either spelling', () => {
        expect(ann.updateRegion('Ox 340', 'fol. 18v', 'r1', { name: 'Line 3' })).toBe(true);
        expect(ann.regions['Ox 340_18v'][0].name).toBe('Line 3');
        ann.removeManualLine('Ox 340', 'fol. 18v', 2);
        expect(ann.getManualLines('Ox 340', '18v')).toEqual([]);
        ann.removeRegion('Ox 340', 'fol. 18v', 'r1');
        expect(ann.getRegions('Ox 340', '18v')).toEqual([]);
        expect(ann.regionItems.r1).toBeUndefined();
    });

    it('shows a page whose lines ended up under both spellings as one page', () => {
        ann.hydrate({ regions: {
            'Ox 340_18v': [{ id: 'r1', name: 'Line 2', points: '' }],
            'Ox 340_fol. 18v': [{ id: 'r2', name: 'Line 5', points: '' }]
        } });
        expect(ann.getRegions('Ox 340', 'fol. 18v').map(r => r.id)).toEqual(['r2', 'r1']);
        expect(ann.getRegions('Ox 340', '18v').map(r => r.id)).toEqual(['r1', 'r2']);
    });

    it('does not mix up different pages or sources', () => {
        ann.hydrate({ regions: {
            'Ox 340_18v': [{ id: 'r1', name: 'Line 2', points: '' }],
            'Ox 340_18r': [{ id: 'r3', name: 'Line 1', points: '' }],
            'Ox 3401_18v': [{ id: 'r4', name: 'Line 1', points: '' }]
        } });
        expect(ann.getRegions('Ox 340', 'fol. 18v').map(r => r.id)).toEqual(['r1']);
    });
});

describe('personal tables store', () => {
    it('round-trips tables and starred items', () => {
        const t = usePersonalTablesStore();
        t.hydrate({ tables: [{ id: 'a', name: 'A', source: 'A', rows: [{ pattern: '*', customId: '1' }], patterns: ['*'] }], starredItems: ['x|y'] });
        const saved = JSON.parse(JSON.stringify(t.serialize()));
        setActivePinia(createPinia());
        const u = usePersonalTablesStore();
        u.hydrate(saved);
        expect(u.serialize()).toEqual(saved);
        expect(u.starredItems.has('x|y')).toBe(true);
    });

    it('accepts the bare array of the oldest storage layout', () => {
        const t = usePersonalTablesStore();
        t.hydrate([{ id: 'a', source: 'A' }]);
        expect(t.tables).toHaveLength(1);
        expect(t.tables[0]).toMatchObject({ id: 'a', rows: [], patterns: [] });
    });

    it('repairs a table with missing containers and drops junk entries', () => {
        const t = usePersonalTablesStore();
        t.hydrate({ tables: [{ name: 'no id' }, null, 'junk', { id: 'ok', rows: 'x' }] });
        expect(t.tables).toHaveLength(2);
        expect(t.tables[0].id).toBeTruthy();
        expect(t.tables[1].rows).toEqual([]);
    });

    it('hydrate({ tables }) without starredItems keeps the stars', () => {
        const t = usePersonalTablesStore();
        t.hydrate({ tables: [], starredItems: ['s'] });
        t.hydrate({ tables: [{ id: 'a' }] });
        expect(t.starredItems.has('s')).toBe(true);
    });

    it('creates tables with unique ids', () => {
        const t = usePersonalTablesStore();
        const ids = new Set(Array.from({ length: 30 }, (_, i) => t.createTable(`T${i}`)));
        expect(ids.size).toBe(30);
    });

    it('reset() empties it', () => {
        const t = usePersonalTablesStore();
        t.createTable('A');
        t.reset();
        expect(t.tables).toEqual([]);
        expect(t.starredItems.size).toBe(0);
    });
});

describe('iiif store', () => {
    it('round-trips links and drops non-URL values', () => {
        const i = useIiifStore();
        i.hydrate({ A: 'https://a', B: 3, C: null });
        expect(i.serialize()).toEqual({ A: 'https://a' });
        i.reset();
        expect(i.links).toEqual({});
        i.hydrate('nope');
        expect(i.links).toEqual({});
    });
});

describe('pattern library store', () => {
    it('round-trips entries', () => {
        const l = usePatternLibraryStore();
        l.updateEntry('*dd', { label: 'clivis', notes: 'n' });
        const saved = JSON.parse(JSON.stringify(l.serialize()));
        setActivePinia(createPinia());
        const m = usePatternLibraryStore();
        m.hydrate(saved);
        expect(m.getLabel('*dd')).toBe('clivis');
        m.reset();
        expect(m.patterns).toEqual({});
    });

    it('ignores a payload whose patterns are not an object', () => {
        const l = usePatternLibraryStore();
        l.updateEntry('*', { label: 'x' });
        l.hydrate({ patterns: [] });
        expect(l.getLabel('*')).toBe('x');
    });
});

describe('OMMR settings store', () => {
    it('defaults to identity calibration, no offset, label mode', () => {
        const o = useOmmrSettingsStore();
        expect(o.calibrationFor('S')).toEqual({ sx: 1, sy: 1, dx: 0, dy: 0 });
        expect(o.folioOffsetFor('S')).toBe(0);
        expect(o.indexModeFor('S')).toBe(false);
    });

    it('keeps settings per source and round-trips them', () => {
        const o = useOmmrSettingsStore();
        o.updateCalibration('A', { dx: 2 });
        o.updateCalibration('A', { sx: 1.2 });
        o.setFolioOffset('A', 3);
        o.setIndexMode('B', true);
        expect(o.calibrationFor('A')).toEqual({ sx: 1.2, sy: 1, dx: 2, dy: 0 });
        expect(o.calibrationFor('B')).toEqual({ sx: 1, sy: 1, dx: 0, dy: 0 });

        const saved = JSON.parse(JSON.stringify(o.serialize()));
        setActivePinia(createPinia());
        const p = useOmmrSettingsStore();
        p.hydrate(saved);
        expect(p.serialize()).toEqual(saved);
        p.resetCalibration('A');
        expect(p.calibrationFor('A')).toEqual({ sx: 1, sy: 1, dx: 0, dy: 0 });
    });

    it('ignores a source-less update', () => {
        const o = useOmmrSettingsStore();
        o.updateCalibration(null, { dx: 1 });
        o.setFolioOffset('', 1);
        o.setIndexMode(undefined, true);
        expect(o.serialize()).toEqual({ calibrations: {}, folioOffsets: {}, indexModes: {} });
    });
});

describe('direct snippets store', () => {
    it('hydrate() waits for the IndexedDB load, then replaces the collections', async () => {
        const d = useDirectSnippetsStore();
        await d.hydrate([{ id: 'dc_1', source: 'S', snippets: [], patterns: [] }, null, { nope: true }]);
        expect(d.loaded).toBe(true);
        expect(d.serialize().map(c => c.id)).toEqual(['dc_1']);
        d.reset();
        expect(d.serialize()).toEqual([]);
    });

    it('ignores a payload that is not a list', async () => {
        const d = useDirectSnippetsStore();
        await d.hydrate([{ id: 'dc_1' }]);
        await d.hydrate('x');
        expect(d.serialize()).toHaveLength(1);
    });
});
