import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../../utils/directSnippetsDb', () => ({
    loadCollections: async () => [],
    saveCollections: async () => true
}));

import { migrate, sanitizeData, applyCoreData, applySettingsData, buildCoreData, buildSettingsData, SchemaError } from './workspaceSchema';
import { collectStores, initPersistence, PERSISTED_STORES, flushLocalSaves } from './storeRegistry';
import { resetTracker } from './changeTracker';
import { createFakeStorage } from '../../test/fakes';

/**
 * Whatever is in a user's folder or browser storage — an old build's file, a half
 * written one, something hand-edited — loading it must never throw out of the
 * app's startup, and what comes out must be usable. These feed thousands of
 * deterministically corrupted copies of a realistic old workspace through the
 * whole load path.
 */

// A small realistic version-1 workspace: the shape an old build wrote.
const FIXTURE = {
    schemaVersion: 1,
    savedAt: '2026-07-15T17:33:49.391Z',
    label: 'My Backup',
    data: {
        personalTables: [
            { id: 't1', name: 'Pa 1235', source: 'Pa 1235', rows: [{ pattern: '*', customId: '1', notes: '' }, { pattern: '*u', customId: '2' }], patterns: ['*', '*u'] },
            { id: 2, name: 'Aa 13', source: 'Aa 13', rows: [], patterns: [] }
        ],
        annotations: { 'Pa 1235_9_*u': [{ id: 'a1', points: '10,10 20,10 20,20 10,20', variant: 'b' }, { points: '1,1 2,2' }] },
        regions: { 'WiSch 4_5_12r': [{ id: 'r1', name: 'Line 1', points: '0,0 100,0 100,10 0,10' }] },
        regionItems: { r1: [{ id: 'i1', pattern: '*d', points: '5,2 9,2 9,6 5,6', linkData: { n: 1 } }] },
        manualLines: { 'Pa 1235_9': [1, 2, 3] },
        iiifLinks: { 'Pa 1235': 'https://example.org/manifest.json' },
        settings: {
            displayMode: 'svg', snippetSize: 60, snippetPadding: 0.3, autoFillIds: true,
            globalDisplayIds: { '*': '1' }, customSigns: [{ key: 'V', label: 'v' }], codeVariants: { '*u': [{ id: 'v1', code: '*uV', label: 'x' }] },
            sourceMeta: { 'Pa 1235': { century: '12.' } }, sourceMetaFields: [{ key: 'century', label: 'Century' }]
        }
    }
};

// A tiny deterministic generator (mulberry32), so a failure can be reproduced.
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const JUNK = [null, 0, -1, 1.5, NaN, '', 'x', '0,0 1,1', true, false, [], {}, [null], [[]], { a: { b: [] } }, [1, 'a', {}], 'A'.repeat(1000)];

/** A deep copy with `n` random corruptions: wrong types, deleted keys, junk values. */
function corrupt(value, random, n) {
    const copy = JSON.parse(JSON.stringify(value));
    const paths = [];
    (function walk(node, path) {
        if (node && typeof node === 'object') {
            for (const key of Object.keys(node)) {
                paths.push([...path, key]);
                walk(node[key], [...path, key]);
            }
        }
    })(copy, []);
    for (let i = 0; i < n && paths.length; i++) {
        const path = paths[Math.floor(random() * paths.length)];
        let parent = copy;
        for (const key of path.slice(0, -1)) {
            if (parent == null || typeof parent !== 'object') { parent = null; break; }
            parent = parent[key];
        }
        if (parent == null || typeof parent !== 'object') continue;
        const last = path[path.length - 1];
        if (random() < 0.3) delete parent[last];
        else parent[last] = JUNK[Math.floor(random() * JUNK.length)];
    }
    return copy;
}

let pinia;
beforeEach(() => {
    resetTracker();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pinia = createPinia();
    setActivePinia(pinia);
});
afterEach(() => vi.restoreAllMocks());

const survivesJson = stores => {
    const out = { ...buildCoreData(stores), ...buildSettingsData(stores) };
    JSON.parse(JSON.stringify(out));
    return out;
};

describe('loading a corrupted workspace file', () => {
    it('never throws anything but a SchemaError, and leaves usable stores', () => {
        const random = rng(20261004);
        let loaded = 0;
        let refused = 0;
        for (let i = 0; i < 3000; i++) {
            const input = corrupt(FIXTURE, random, 1 + Math.floor(random() * 6));
            const stores = collectStores(createPinia());
            let upgraded;
            try {
                upgraded = migrate(input);
            } catch (e) {
                if (!(e instanceof SchemaError)) throw new Error(`case ${i}: migrate threw ${e}`, { cause: e });
                refused++;
                continue;
            }
            try {
                const { data } = sanitizeData(upgraded.json.data);
                applyCoreData(stores, data);
                applySettingsData(stores, data);
                const out = survivesJson(stores);
                expect(Array.isArray(out.personalTables)).toBe(true);
                expect(out.personalTables.every(t => Array.isArray(t.rows))).toBe(true);
                expect(typeof out.regions).toBe('object');
                loaded++;
            } catch (e) {
                throw new Error(`case ${i}: applying a migrated file threw ${e && e.stack}`, { cause: e });
            }
        }
        expect(loaded).toBeGreaterThan(1000); // most corruptions are survivable, not just refused
        expect(loaded + refused).toBe(3000);
    });

    it('does not mutate the input it was given', () => {
        const random = rng(7);
        for (let i = 0; i < 300; i++) {
            const input = corrupt(FIXTURE, random, 3);
            const before = JSON.stringify(input);
            try { sanitizeData(migrate(input).json.data); } catch { /* refused */ }
            expect(JSON.stringify(input)).toBe(before);
        }
    });
});

describe('starting from corrupted browser storage', () => {
    it('never throws out of startup, whatever each key holds', () => {
        const random = rng(99);
        const keys = PERSISTED_STORES.filter(e => e.local).map(e => e.local.key)
            .concat(['annotations_v2', 'annotations', 'ommrCalibrations', 'ommrFolioOffsets', 'ommrIndexModes']);
        for (let i = 0; i < 400; i++) {
            const initial = {};
            for (const key of keys) {
                if (random() < 0.5) continue;
                const roll = random();
                if (roll < 0.2) initial[key] = '{not json';
                else if (roll < 0.3) initial[key] = '';
                else if (roll < 0.4) initial[key] = 'null';
                else initial[key] = JSON.stringify(corrupt({ ...FIXTURE.data, tables: FIXTURE.data.personalTables }, random, 4));
            }
            const storage = createFakeStorage(initial);
            const fresh = createPinia();
            setActivePinia(fresh);
            let stores;
            expect(() => { stores = initPersistence(fresh, { storage, keyPrefix: '' }); }, `case ${i}`).not.toThrow();
            expect(() => survivesJson(stores), `case ${i}`).not.toThrow();
            flushLocalSaves();
        }
    });
});
