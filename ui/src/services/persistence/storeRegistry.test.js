import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { effectScope } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../../utils/directSnippetsDb', () => ({
    loadCollections: async () => [],
    saveCollections: async () => true
}));

import { initPersistence, flushLocalSaves, PERSISTED_STORES, SECTION_IDS, DATA_STORE_IDS } from './storeRegistry';
import { revisionOf, resetTracker } from './changeTracker';
import { createFakeStorage } from '../../test/fakes';

const box = (x, y) => `${x},${y} ${x + 4},${y} ${x + 4},${y + 4} ${x},${y + 4}`;
let storage;

function boot(initial = {}, keyPrefix = '') {
    storage = createFakeStorage(initial);
    globalThis.localStorage = storage;
    const pinia = createPinia();
    setActivePinia(pinia);
    return { pinia, stores: initPersistence(pinia, { storage, keyPrefix }) };
}

beforeEach(() => {
    resetTracker();
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    flushLocalSaves();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('the registry table', () => {
    it('lists every store once, with a section', () => {
        const ids = PERSISTED_STORES.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(PERSISTED_STORES.every(e => ['core', 'direct'].includes(e.section))).toBe(true);
        expect(SECTION_IDS.core).toContain('annotations');
        expect(SECTION_IDS.direct).toEqual(['directSnippets']);
        expect(DATA_STORE_IDS.every(id => ids.includes(id))).toBe(true);
    });

    it('gives every store the serialize/hydrate/reset contract', () => {
        const { stores } = boot();
        for (const store of Object.values(stores)) {
            expect(typeof store.serialize).toBe('function');
            expect(typeof store.hydrate).toBe('function');
            expect(typeof store.reset).toBe('function');
        }
    });
});

describe('loading from browser storage', () => {
    it('restores each store from its key', () => {
        const { stores } = boot({
            globalSettings: JSON.stringify({ snippetSize: 88 }),
            personalTables: JSON.stringify({ tables: [{ id: 't', source: 'S', rows: [], patterns: [] }], starredItems: ['a'] }),
            iiifLinks: JSON.stringify({ S: 'https://x' }),
            patternLibrary_v1: JSON.stringify({ patterns: { '*': { code: '*', label: 'p' } } }),
            annotations_v3: JSON.stringify({ regions: { 'S_1r': [{ id: 'r', name: 'L', points: '' }] }, regionItems: {}, manualLines: {} }),
            ommrSettings_v1: JSON.stringify({ folioOffsets: { S: 2 } })
        });
        expect(stores.settings.snippetSize).toBe(88);
        expect(stores.tables.tables).toHaveLength(1);
        expect(stores.tables.starredItems.has('a')).toBe(true);
        expect(stores.iiif.links).toEqual({ S: 'https://x' });
        expect(stores.library.getLabel('*')).toBe('p');
        expect(stores.annotations.getRegions('S', '1r')).toHaveLength(1);
        expect(stores.ommrSettings.folioOffsetFor('S')).toBe(2);
    });

    it('does not count what it loads as a change', async () => {
        boot({ globalSettings: JSON.stringify({ snippetSize: 88 }) });
        await nextTick();
        await nextTick();
        expect(revisionOf('settings')).toBe(0);
    });

    it('migrates the v2 annotation layout (with its legacy map) into the v3 key', () => {
        const { stores } = boot({
            annotations_v2: JSON.stringify({
                annotations: { 'S_1r_*dd': [{ id: 'a', points: box(10, 5) }] },
                regions: { 'S_1r': [{ id: 'r', name: 'Line 1', points: '0,0 100,0 100,20 0,20' }] },
                regionItems: {},
                manualLines: {}
            })
        });
        expect(stores.annotations.getAnnotations('S', '1r', '*dd')).toHaveLength(1);
        const v3 = JSON.parse(storage.getItem('annotations_v3'));
        expect(v3.annotations).toBeUndefined();
        expect(v3.regionItems.r).toHaveLength(1);
        // the old key is left alone as a snapshot
        expect(storage.getItem('annotations_v2')).not.toBeNull();
    });

    it('migrates the v1 layout (a flat map of annotations)', () => {
        const { stores } = boot({ annotations: JSON.stringify({ 'S_1r_*': [{ id: 'a', points: box(1, 1) }] }) });
        const regions = stores.annotations.getRegions('S', '1r');
        expect(regions).toHaveLength(1);
        expect(regions[0].unassigned).toBe(true);
        expect(stores.annotations.getAnnotations('S', '1r', '*')).toHaveLength(1);
    });

    it('prefers the new key over a legacy one', () => {
        const { stores } = boot({
            annotations_v3: JSON.stringify({ regions: {}, regionItems: {}, manualLines: {} }),
            annotations_v2: JSON.stringify({ regions: { 'S_1r': [{ id: 'old' }] } })
        });
        expect(stores.annotations.regions).toEqual({});
    });

    it('gathers the three separate OMMR keys into one store', () => {
        const { stores } = boot({
            ommrCalibrations: JSON.stringify({ S: { sx: 2, sy: 1, dx: 0, dy: 0 } }),
            ommrFolioOffsets: JSON.stringify({ S: 4 }),
            ommrIndexModes: JSON.stringify({ S: true })
        });
        expect(stores.ommrSettings.calibrationFor('S').sx).toBe(2);
        expect(stores.ommrSettings.folioOffsetFor('S')).toBe(4);
        expect(stores.ommrSettings.indexModeFor('S')).toBe(true);
        expect(JSON.parse(storage.getItem('ommrSettings_v1')).folioOffsets).toEqual({ S: 4 });
    });

    it('survives a corrupt entry: starts that store empty, keeps a copy, loads the rest', () => {
        const { stores } = boot({
            iiifLinks: '{not json',
            globalSettings: JSON.stringify({ snippetSize: 70 })
        });
        expect(stores.iiif.links).toEqual({});
        expect(storage.getItem('iiifLinks__corrupt')).toBe('{not json');
        expect(stores.settings.snippetSize).toBe(70);
    });

    it('survives a legacy entry that is not JSON', () => {
        const { stores } = boot({ annotations_v2: 'garbage' });
        expect(stores.annotations.regions).toEqual({});
    });

    it('keeps tracking after the scope that started it is stopped', async () => {
        storage = createFakeStorage();
        globalThis.localStorage = storage;
        const pinia = createPinia();
        setActivePinia(pinia);
        const startedFrom = effectScope();
        const stores = startedFrom.run(() => initPersistence(pinia, { storage }));
        startedFrom.stop();
        stores.settings.snippetSize = 91;
        await nextTick();
        expect(revisionOf('settings')).toBe(1);
    });

    it('is safe to call twice for the same Pinia', () => {
        const { pinia, stores } = boot();
        expect(initPersistence(pinia, { storage })).toEqual(stores);
        stores.settings.snippetSize = 91;
        return nextTick().then(() => {
            expect(revisionOf('settings')).toBe(1); // one subscriber, not two
        });
    });
});

describe('the change signal and the browser-storage mirror', () => {
    it('bumps the store revision once per flush of edits', async () => {
        const { stores } = boot();
        stores.annotations.addRegion('S', '1r', 'Line 1', box(0, 0));
        stores.annotations.addRegion('S', '1r', 'Line 2', box(0, 10));
        await nextTick();
        expect(revisionOf('annotations')).toBe(1);
        expect(revisionOf('settings')).toBe(0);
    });

    it('writes edits to browser storage after the debounce, not before', async () => {
        const { stores } = boot();
        stores.settings.snippetSize = 77;
        await nextTick();
        expect(storage.getItem('globalSettings')).toBeNull();
        vi.advanceTimersByTime(300);
        expect(JSON.parse(storage.getItem('globalSettings')).snippetSize).toBe(77);
    });

    it('batches several edits into one write per store', async () => {
        const { stores } = boot();
        const spy = vi.spyOn(storage, 'setItem');
        stores.settings.snippetSize = 70;
        await nextTick();
        stores.settings.snippetSize = 71;
        await nextTick();
        stores.settings.snippetSize = 72;
        await nextTick();
        vi.advanceTimersByTime(300);
        const writes = spy.mock.calls.filter(([k]) => k === 'globalSettings');
        expect(writes).toHaveLength(1);
        expect(JSON.parse(writes[0][1]).snippetSize).toBe(72);
    });

    it('flushLocalSaves() writes pending edits immediately (page hide)', async () => {
        const { stores } = boot();
        stores.iiif.hydrate({ S: 'https://x' });
        await nextTick();
        expect(storage.getItem('iiifLinks')).toBeNull();
        flushLocalSaves();
        expect(JSON.parse(storage.getItem('iiifLinks'))).toEqual({ S: 'https://x' });
    });

    it('transient store state is not an edit: the snippet store finishing its load, a fetched manifest', async () => {
        const { stores } = boot();
        await vi.advanceTimersByTimeAsync(10);
        await nextTick();
        expect(stores.direct.loaded).toBe(true);
        expect(revisionOf('directSnippets')).toBe(0);

        stores.iiif.parsedData['S'] = [{ folio: '1r', imgUrl: 'u' }];
        stores.iiif.manifestStatus['S'] = { status: 'ok', error: null };
        await nextTick();
        expect(revisionOf('iiif')).toBe(0);
        stores.iiif.hydrate({ S: 'https://x' });
        await nextTick();
        expect(revisionOf('iiif')).toBe(1);
    });

    it('does not write the direct snippets to browser storage (they live in IndexedDB)', async () => {
        const { stores } = boot();
        await stores.direct.hydrate([{ id: 'dc_1', source: 'S', snippets: [], patterns: [] }]);
        stores.direct.updateCollection('dc_1', { name: 'x' });
        await nextTick();
        vi.advanceTimersByTime(1000);
        expect(storage.keys().some(k => /direct/i.test(k))).toBe(false);
        expect(revisionOf('directSnippets')).toBeGreaterThan(0);
    });

    it('a reload sees the edits (write -> new Pinia -> read)', async () => {
        const first = boot();
        first.stores.annotations.addRegion('S', '1r', 'Line 1', box(0, 0));
        first.stores.settings.snippetSize = 66;
        await nextTick();
        flushLocalSaves();

        const saved = Object.fromEntries(storage.keys().map(k => [k, storage.getItem(k)]));
        const second = boot(saved);
        expect(second.stores.annotations.getRegions('S', '1r')).toHaveLength(1);
        expect(second.stores.settings.snippetSize).toBe(66);
    });
});

describe('a build with its own key prefix (served beside another build on one origin)', () => {
    const plain = {
        globalSettings: JSON.stringify({ snippetSize: 77 }),
        annotations_v2: JSON.stringify({ regions: { 'Aa 13_1r': [{ id: 'r1', name: 'Line 1', points: box(0, 0) }] } })
    };

    it('starts from a copy of what the unprefixed build stored, under its own keys', () => {
        const { stores } = boot(plain, 'next:');
        expect(stores.settings.snippetSize).toBe(77);
        expect(Object.keys(stores.annotations.regions)).toEqual(['Aa 13_1r']);
        expect(JSON.parse(storage.getItem('next:globalSettings')).snippetSize).toBe(77);
        expect(storage.getItem('next:annotations_v3')).not.toBeNull();
    });

    it('then goes its own way: its edits never reach the unprefixed keys', async () => {
        const { stores } = boot(plain, 'next:');
        stores.settings.snippetSize = 99;
        await nextTick();
        flushLocalSaves();
        expect(JSON.parse(storage.getItem('next:globalSettings')).snippetSize).toBe(99);
        expect(JSON.parse(storage.getItem('globalSettings')).snippetSize).toBe(77);
        expect(storage.getItem('annotations_v3')).toBeNull();
    });

    it('prefers its own copy over whatever the other build changed since', () => {
        const { stores } = boot({ ...plain, 'next:globalSettings': JSON.stringify({ snippetSize: 55 }) }, 'next:');
        expect(stores.settings.snippetSize).toBe(55);
    });

    it('keeps a corrupt entry of its own under its own key', () => {
        boot({ ...plain, 'next:globalSettings': '{nope' }, 'next:');
        expect(storage.getItem('next:globalSettings__corrupt')).toBe('{nope');
    });
});
