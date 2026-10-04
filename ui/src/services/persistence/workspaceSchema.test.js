import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../../utils/directSnippetsDb', () => ({
    loadCollections: async () => [],
    saveCollections: async () => true
}));

import {
    SCHEMA_VERSION, SchemaError, ENVELOPE_TYPES, migrate, sanitizeData, isConfigFile,
    buildCoreData, buildSettingsData, applyCoreData, applySettingsData, applyDirectData,
    workspaceFile, backupEnvelope, manuscriptsEnvelope, configEnvelope
} from './workspaceSchema';
import { collectStores } from './storeRegistry';

const box = (x, y) => `${x},${y} ${x + 4},${y} ${x + 4},${y + 4} ${x},${y + 4}`;

describe('migrate', () => {
    it('leaves a current file alone', () => {
        const file = { schemaVersion: SCHEMA_VERSION, data: { regions: {} } };
        const { json, from, to, notes } = migrate(file);
        expect(json).toEqual(file);
        expect([from, to, notes]).toEqual([SCHEMA_VERSION, SCHEMA_VERSION, []]);
    });

    it('reads the pre-schema { version, content } envelope', () => {
        const { json, from } = migrate({ version: 1, content: { personalTables: [], regions: {} } });
        expect(from).toBe(1);
        expect(json.schemaVersion).toBe(SCHEMA_VERSION);
        expect(json.data.regions).toEqual({});
        expect(json.content).toBeUndefined();
        expect(json.version).toBeUndefined();
    });

    it('folds legacy whole-page annotations into regions and says so', () => {
        const v1 = {
            schemaVersion: 1,
            data: {
                regions: { 'A_1r': [{ id: 'r1', name: 'Line 1', points: '0,0 100,0 100,50 0,50' }] },
                regionItems: { r1: [] },
                annotations: { 'A_1r_*dd': [{ id: 'a1', points: box(10, 10) }] }
            }
        };
        const { json, notes } = migrate(v1);
        expect(json.data.annotations).toBeUndefined();
        expect(json.data.regionItems.r1).toHaveLength(1);
        expect(json.data.regionItems.r1[0]).toMatchObject({ id: 'a1', pattern: '*dd' });
        expect(notes.join(' ')).toMatch(/1 moved into line regions/);
    });

    it('moves a backup\'s top-level direct snippets into data', () => {
        const { json } = migrate({ schemaVersion: 1, type: ENVELOPE_TYPES.backup, directSnippets: [{ id: 'dc_1' }], data: {} });
        expect(json.data.directSnippets).toEqual([{ id: 'dc_1' }]);
        expect(json.directSnippets).toBeUndefined();
    });

    it('does not let a stale top-level list replace snippets already inside data', () => {
        const { json } = migrate({ schemaVersion: 1, directSnippets: [{ id: 'old' }], data: { directSnippets: [{ id: 'new' }] } });
        expect(json.data.directSnippets).toEqual([{ id: 'new' }]);
    });

    it('does not mutate its input', () => {
        const v1 = { schemaVersion: 1, directSnippets: [], data: { annotations: { 'A_1r_*': [{ id: 1, points: box(1, 1) }] }, regions: {} } };
        const before = JSON.stringify(v1);
        migrate(v1);
        expect(JSON.stringify(v1)).toBe(before);
    });

    it('refuses a file from a newer app instead of guessing', () => {
        expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1, data: {} })).toThrow(SchemaError);
        expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1, data: {} })).toThrow(/newer version/);
    });

    it('rejects a file with no schemaVersion or data', () => {
        expect(() => migrate({ data: {} })).toThrow(/missing schemaVersion/);
        expect(() => migrate({ schemaVersion: 'x', data: {} })).toThrow(SchemaError);
        expect(() => migrate({ regions: {} })).toThrow(SchemaError);
    });

    it('rejects things that are not objects', () => {
        expect(() => migrate(null)).toThrow(SchemaError);
        expect(() => migrate([])).toThrow(SchemaError);
        expect(() => migrate('text')).toThrow(SchemaError);
    });

    it('upgrades a bare configuration file (no data section)', () => {
        const { json, from } = migrate({ type: ENVELOPE_TYPES.config, settings: { snippetSize: 70 } });
        expect(from).toBe(1);
        expect(json.schemaVersion).toBe(SCHEMA_VERSION);
        expect(json.settings).toEqual({ snippetSize: 70 });
    });
});

describe('isConfigFile', () => {
    it('recognises configuration files and bare settings, not data files', () => {
        expect(isConfigFile({ type: ENVELOPE_TYPES.config })).toBe(true);
        expect(isConfigFile({ settings: { a: 1 } })).toBe(true);
        expect(isConfigFile({ settings: {}, data: { regions: {} } })).toBe(false);
        expect(isConfigFile({ schemaVersion: 2, data: { personalTables: [] } })).toBe(false);
        expect(isConfigFile(null)).toBe(false);
    });
});

describe('sanitizeData', () => {
    it('passes good data through untouched', () => {
        const data = {
            personalTables: [{ id: 't' }],
            regions: { 'A_1r': [{ id: 'r' }] },
            regionItems: { r: [{ id: 'i' }] },
            manualLines: { 'A_1r': [1] },
            iiifLinks: { A: 'u' },
            settings: { a: 1 }
        };
        const { data: out, warnings } = sanitizeData(data);
        expect(out).toEqual(data);
        expect(warnings).toEqual([]);
    });

    it('drops containers of the wrong type and says which', () => {
        const { data, warnings } = sanitizeData({
            personalTables: {}, regions: [], regionItems: 'x', iiifLinks: 3, settings: [], directSnippets: {}
        });
        expect(data).toEqual({});
        expect(warnings.length).toBe(6);
    });

    it('drops malformed entries inside regions and items but keeps the rest', () => {
        const { data, warnings } = sanitizeData({
            regions: { good: [{ id: 'r1' }, null, 'bad'], notAList: {} },
            regionItems: { r1: [{ id: 'i1' }, 7] }
        });
        expect(data.regions).toEqual({ good: [{ id: 'r1' }] });
        expect(data.regionItems).toEqual({ r1: [{ id: 'i1' }] });
        expect(warnings.join(' ')).toMatch(/3 malformed entries/);
    });

    it('drops IIIF links that are not URL strings', () => {
        const { data, warnings } = sanitizeData({ iiifLinks: { A: 'u', B: { url: 'x' }, C: null } });
        expect(data.iiifLinks).toEqual({ A: 'u' });
        expect(warnings.join(' ')).toMatch(/2 IIIF links/);
    });

    it('accepts a missing or non-object payload', () => {
        expect(sanitizeData(undefined).data).toEqual({});
        expect(sanitizeData([]).data).toEqual({});
    });
});

describe('envelopes', () => {
    it('stamp the current schema version and the right type', () => {
        expect(workspaceFile({ label: 'L', data: {} })).toMatchObject({ schemaVersion: SCHEMA_VERSION, label: 'L' });
        expect(backupEnvelope({ label: 'L', data: {} })).toMatchObject({ schemaVersion: SCHEMA_VERSION, type: ENVELOPE_TYPES.backup });
        expect(manuscriptsEnvelope({ exportedManuscripts: ['A'], data: {} })).toMatchObject({ type: ENVELOPE_TYPES.manuscripts, exportedManuscripts: ['A'] });
        expect(configEnvelope({ label: 'L', settings: {}, patternLibrary: {} })).toMatchObject({ type: ENVELOPE_TYPES.config });
    });

    it('every envelope survives its own migrate() unchanged', () => {
        for (const env of [
            workspaceFile({ label: 'L', data: { regions: {} } }),
            backupEnvelope({ label: 'L', data: { regions: {} } }),
            manuscriptsEnvelope({ exportedManuscripts: [], data: { regions: {} } }),
            configEnvelope({ label: 'L', settings: {}, patternLibrary: {} })
        ]) {
            expect(migrate(env).json).toEqual(env);
        }
    });
});

describe('store state <-> payload', () => {
    let stores;
    beforeEach(() => {
        setActivePinia(createPinia());
        stores = collectStores();
    });

    function fill() {
        stores.tables.hydrate({ tables: [{ id: 't1', name: 'Pa 1', source: 'Pa 1', rows: [{ pattern: '*', customId: '1' }], patterns: ['*'] }] });
        stores.annotations.hydrate({
            regions: { 'Pa 1_1r': [{ id: 'r1', name: 'Line 1', points: '0,0 100,0 100,10 0,10' }] },
            regionItems: { r1: [{ id: 'i1', pattern: '*', points: box(5, 2) }] },
            manualLines: { 'Pa 1_1r': [1, 2] }
        });
        stores.iiif.hydrate({ 'Pa 1': 'https://example.org/m.json' });
        stores.settings.hydrate({ snippetSize: 80, snippetVariants: [{ key: 'x', label: 'Ex' }], backupLabel: 'Mine' });
        stores.library.hydrate({ patterns: { '*': { code: '*', label: 'punctum', notes: '', manual: false, mei: null } } });
        stores.ommrSettings.hydrate({ calibrations: { 'Pa 1': { sx: 1.1, sy: 1, dx: 0, dy: 0 } }, folioOffsets: { 'Pa 1': 2 }, indexModes: { 'Pa 1': true } });
    }

    it('builds the manuscript data and the settings data from the stores', () => {
        fill();
        const core = buildCoreData(stores);
        expect(Object.keys(core).sort()).toEqual(['iiifLinks', 'manualLines', 'personalTables', 'regionItems', 'regions']);
        expect(core.personalTables).toHaveLength(1);
        const cfg = buildSettingsData(stores);
        expect(cfg.settings.snippetSize).toBe(80);
        expect(cfg.settings.backupLabel).toBe('Mine');
        expect(cfg.patternLibrary.patterns['*'].label).toBe('punctum');
        expect(cfg.ommrSettings.folioOffsets).toEqual({ 'Pa 1': 2 });
    });

    it('leaves the backup label out of shared (exported) settings only', () => {
        fill();
        expect(buildSettingsData(stores, { shared: true }).settings).not.toHaveProperty('backupLabel');
        expect(buildSettingsData(stores, { shared: false }).settings).toHaveProperty('backupLabel');
    });

    it('round-trips every store through a payload (JSON in between)', () => {
        fill();
        const payload = JSON.parse(JSON.stringify({ ...buildCoreData(stores), ...buildSettingsData(stores) }));

        setActivePinia(createPinia());
        const fresh = collectStores();
        applyCoreData(fresh, payload);
        applySettingsData(fresh, payload);

        expect(buildCoreData(fresh)).toEqual(buildCoreData(stores));
        expect(buildSettingsData(fresh)).toEqual(buildSettingsData(stores));
        expect(fresh.settings.snippetVariants).toEqual([{ key: 'x', label: 'Ex' }]);
    });

    it('applying data with parts missing leaves those stores alone', () => {
        fill();
        applyCoreData(stores, { regions: {} });
        expect(stores.annotations.regions).toEqual({});
        expect(stores.tables.tables).toHaveLength(1);
        expect(stores.iiif.links).toEqual({ 'Pa 1': 'https://example.org/m.json' });
        expect(stores.annotations.manualLines).toEqual({ 'Pa 1_1r': [1, 2] });
        applySettingsData(stores, {});
        expect(stores.settings.snippetSize).toBe(80);
    });

    it('shared settings import skips the local-only backup label', () => {
        fill();
        applySettingsData(stores, { settings: { backupLabel: 'Theirs', snippetSize: 99 } }, { shared: true });
        expect(stores.settings.backupLabel).toBe('Mine');
        expect(stores.settings.snippetSize).toBe(99);
    });

    it('loads direct snippet collections once the store has loaded', async () => {
        await applyDirectData(stores, [{ id: 'dc_1', source: 'S', snippets: [], patterns: [] }]);
        expect(stores.direct.serialize()).toHaveLength(1);
        await applyDirectData(stores, undefined);
        expect(stores.direct.serialize()).toHaveLength(1);
    });
});
