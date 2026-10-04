import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../utils/directSnippetsDb', () => ({
    loadCollections: async () => [],
    saveCollections: async () => true
}));

const downloads = [];
vi.mock('../utils/download', () => ({
    downloadJson: (filename, data) => { downloads.push({ filename, data: JSON.parse(JSON.stringify(data)) }); }
}));

import { useDataManagement } from './useDataManagement';
import { collectStores } from '../services/persistence/storeRegistry';
import { SCHEMA_VERSION, ENVELOPE_TYPES, workspaceFile, buildCoreData, buildSettingsData } from '../services/persistence/workspaceSchema';
import { useSaveReminderStore } from '../stores/saveReminder';
import { createFakeStorage } from '../test/fakes';

const box = (x, y) => `${x},${y} ${x + 4},${y} ${x + 4},${y + 4} ${x},${y + 4}`;
const fileOf = (data, name = 'backup.json') => ({ name, text: async () => (typeof data === 'string' ? data : JSON.stringify(data)) });

let stores;
let dm;

function freshApp() {
    globalThis.localStorage = createFakeStorage();
    setActivePinia(createPinia());
    stores = collectStores();
    dm = useDataManagement();
}

function fillWorkspace() {
    stores.tables.hydrate({ tables: [
        { id: 't1', name: 'Pa 1', source: 'Pa 1', isPublished: true, rows: [{ pattern: '*', customId: '1' }], patterns: ['*'] },
        { id: 't2', name: 'Lo 4', source: 'Lo 4', rows: [], patterns: [] }
    ] });
    stores.annotations.hydrate({
        regions: {
            'Pa 1_1r': [{ id: 'r1', name: 'Line 1', points: '0,0 100,0 100,20 0,20' }],
            'Lo 4_2v': [{ id: 'r2', name: 'Line 1', points: '0,0 100,0 100,20 0,20' }]
        },
        regionItems: { r1: [{ id: 'i1', pattern: '*', points: box(5, 5) }], r2: [{ id: 'i2', pattern: '*dd', points: box(5, 5) }] },
        manualLines: { 'Pa 1_1r': [1] }
    });
    stores.iiif.hydrate({ 'Pa 1': 'https://example.org/pa1.json' });
    stores.settings.hydrate({ snippetSize: 80, snippetVariants: [{ key: 'x', label: 'Ex' }], customSigns: [{ key: 'k', label: 'K' }], backupLabel: 'Mine' });
    stores.library.updateEntry('*dd', { label: 'clivis' });
    stores.ommrSettings.setFolioOffset('Pa 1', 3);
}

beforeEach(async () => {
    vi.useFakeTimers();
    downloads.length = 0;
    freshApp();
    await vi.advanceTimersByTimeAsync(5);
});
afterEach(() => vi.useRealTimers());

describe('exporting', () => {
    it('a full backup carries the manuscripts, shared settings, library, OMMR settings and snippets', async () => {
        fillWorkspace();
        await stores.direct.hydrate([{ id: 'dc_1', source: 'S', snippets: [], patterns: [] }]);
        await dm.exportData();

        const { filename, data: backup } = downloads[0];
        expect(filename).toMatch(/^cm-transkript-backup-Mine-\d{4}-\d{2}-\d{2}\.json$/);
        expect(backup).toMatchObject({ schemaVersion: SCHEMA_VERSION, type: ENVELOPE_TYPES.backup, label: 'Mine' });
        expect(Object.keys(backup.data.regions).sort()).toEqual(['Lo 4_2v', 'Pa 1_1r']);
        expect(backup.data.settings.snippetSize).toBe(80);
        expect(backup.data.settings.snippetVariants).toEqual([{ key: 'x', label: 'Ex' }]);
        expect(backup.data.settings).not.toHaveProperty('backupLabel');
        expect(backup.data.patternLibrary.patterns['*dd'].label).toBe('clivis');
        expect(backup.data.ommrSettings.folioOffsets).toEqual({ 'Pa 1': 3 });
        expect(backup.data.directSnippets.map(c => c.id)).toEqual(['dc_1']);
        expect(backup.data).not.toHaveProperty('annotations');
        expect(backup).not.toHaveProperty('directSnippets');
    });

    it('can leave the settings out', async () => {
        fillWorkspace();
        await dm.exportData({ includeSettings: false });
        const backup = downloads[0].data;
        expect(backup.data.settings).toBeUndefined();
        expect(backup.data.patternLibrary).toBeUndefined();
        expect(backup.data.ommrSettings).toBeUndefined();
        expect(Object.keys(backup.data.regions)).toHaveLength(2);
    });

    it('leaves out manuscripts that hold no data', async () => {
        fillWorkspace();
        stores.iiif.hydrate({ 'Pa 1': 'https://example.org/pa1.json', Empty: 'https://example.org/none.json' });
        await dm.exportData();
        expect(downloads[0].data.data.iiifLinks).toEqual({ 'Pa 1': 'https://example.org/pa1.json' });
    });

    it('resets the backup reminder (every export path does)', async () => {
        const reminder = useSaveReminderStore();
        reminder.changeCount = 40;
        expect(reminder.neverExported).toBe(true);
        fillWorkspace();
        await dm.exportData();
        expect(reminder.changeCount).toBe(0);
        expect(reminder.neverExported).toBe(false);
    });

    it('exports selected manuscripts, naming the file after a single one', () => {
        fillWorkspace();
        dm.exportManuscripts(['Pa 1']);
        const { filename, data } = downloads[0];
        expect(filename).toMatch(/^cm-manuscripts-Pa-1-/);
        expect(data).toMatchObject({ type: ENVELOPE_TYPES.manuscripts, exportedManuscripts: ['Pa 1'] });
        expect(Object.keys(data.data.regions)).toEqual(['Pa 1_1r']);
        expect(data.data.personalTables.map(t => t.id)).toEqual(['t1']);
    });

    it('refuses to export manuscripts that have no data', () => {
        fillWorkspace();
        expect(() => dm.exportManuscripts(['Nothing here'])).toThrow(/None of the selected manuscripts/);
        expect(downloads).toHaveLength(0);
    });

    it('exports the configuration without the backup label or manuscript data', () => {
        fillWorkspace();
        dm.exportConfiguration();
        const { data } = downloads[0];
        expect(data.type).toBe(ENVELOPE_TYPES.config);
        expect(data.settings.snippetSize).toBe(80);
        expect(data.settings).not.toHaveProperty('backupLabel');
        expect(data.patternLibrary.patterns['*dd'].label).toBe('clivis');
        expect(data).not.toHaveProperty('data');
    });
});

describe('backup export -> import round trip', () => {
    it('restores everything into an empty workspace', async () => {
        fillWorkspace();
        await stores.direct.hydrate([{ id: 'dc_1', source: 'S', snippets: [], patterns: [] }]);
        await dm.exportData();
        const backup = downloads[0].data;
        const before = {
            regions: JSON.parse(JSON.stringify(stores.annotations.regions)),
            regionItems: JSON.parse(JSON.stringify(stores.annotations.regionItems)),
            manualLines: JSON.parse(JSON.stringify(stores.annotations.manualLines)),
            tables: JSON.parse(JSON.stringify(stores.tables.tables)),
            iiif: { ...stores.iiif.links }
        };

        freshApp();
        const [analysis] = await dm.analyzeImportFiles([fileOf(backup)]);
        expect(analysis.success).toBe(true);
        expect(analysis.isConfigOnly).toBe(false);
        expect(analysis.newSources.map(s => s.source).sort()).toEqual(['Lo 4', 'Pa 1']);
        expect(analysis.overlapSources).toEqual([]);
        expect(analysis.hasSettings).toBe(true);

        dm.executeImport(analysis.parsed, {});

        expect(JSON.parse(JSON.stringify(stores.annotations.regions))).toEqual(before.regions);
        expect(JSON.parse(JSON.stringify(stores.annotations.regionItems))).toEqual(before.regionItems);
        expect(JSON.parse(JSON.stringify(stores.annotations.manualLines))).toEqual(before.manualLines);
        expect(JSON.parse(JSON.stringify(stores.tables.tables))).toEqual(before.tables);
        expect({ ...stores.iiif.links }).toEqual(before.iiif);
        expect(stores.settings.snippetSize).toBe(80);
        expect(stores.settings.snippetVariants).toEqual([{ key: 'x', label: 'Ex' }]);
        expect(stores.settings.customSigns).toEqual([{ key: 'k', label: 'K' }]);
        expect(stores.library.getLabel('*dd')).toBe('clivis');
        expect(stores.ommrSettings.folioOffsetFor('Pa 1')).toBe(3);
        expect(stores.direct.serialize().map(c => c.id)).toEqual(['dc_1']);
    });

    it('does not take the exporter\'s backup label', async () => {
        fillWorkspace();
        await dm.exportData();
        const backup = downloads[0].data;
        freshApp();
        stores.settings.backupLabel = 'Local label';
        const [analysis] = await dm.analyzeImportFiles([fileOf(backup)]);
        dm.executeImport(analysis.parsed, {});
        expect(stores.settings.backupLabel).toBe('Local label');
    });

    it('can skip the settings', async () => {
        fillWorkspace();
        await dm.exportData();
        const backup = downloads[0].data;
        freshApp();
        const [analysis] = await dm.analyzeImportFiles([fileOf(backup)]);
        dm.executeImport(analysis.parsed, {}, { importSettings: false });
        expect(stores.settings.snippetSize).toBe(60);
        expect(stores.annotations.getRegions('Pa 1', '1r')).toHaveLength(1);
    });

    it('reports which manuscripts overlap with what is already here', async () => {
        fillWorkspace();
        await dm.exportData();
        const backup = downloads[0].data;
        const [analysis] = await dm.analyzeImportFiles([fileOf(backup)]);
        expect(analysis.newSources).toEqual([]);
        expect(analysis.overlapSources.map(o => o.source).sort()).toEqual(['Lo 4', 'Pa 1']);
        expect(analysis.overlapSources[0].localStats.hasData).toBe(true);
    });

    it('applies the chosen strategy per manuscript', async () => {
        fillWorkspace();
        await dm.exportData();
        const backup = downloads[0].data;

        // locally change Pa 1 so overwrite is visible
        stores.annotations.addRegion('Pa 1', '9r', 'Extra', box(0, 0));
        const [analysis] = await dm.analyzeImportFiles([fileOf(backup)]);
        dm.executeImport(analysis.parsed, { 'Pa 1': 'overwrite', 'Lo 4': 'copy' });

        expect(stores.annotations.getRegions('Pa 1', '9r')).toEqual([]);
        expect(stores.annotations.getRegions('Lo 4', '2v')).toHaveLength(1);
        expect(stores.annotations.getRegions('Lo 4 (copy)', '2v')).toHaveLength(1);

        const [again] = await dm.analyzeImportFiles([fileOf(backup)]);
        stores.annotations.addRegion('Pa 1', '9r', 'Extra', box(0, 0));
        dm.executeImport(again.parsed, { 'Pa 1': 'skip', 'Lo 4': 'skip' });
        expect(stores.annotations.getRegions('Pa 1', '9r')).toHaveLength(1);
    });

    it('merges snippet collections by id instead of replacing the local ones', async () => {
        fillWorkspace();
        await stores.direct.hydrate([{ id: 'dc_in', source: 'S', snippets: [], patterns: [] }]);
        await dm.exportData();
        const backup = downloads[0].data;
        await stores.direct.hydrate([{ id: 'dc_local', source: 'L', snippets: [], patterns: [] }]);
        const [analysis] = await dm.analyzeImportFiles([fileOf(backup)]);
        dm.executeImport(analysis.parsed, {});
        expect(stores.direct.serialize().map(c => c.id).sort()).toEqual(['dc_in', 'dc_local']);
    });
});

describe('importing older and foreign files', () => {
    const oldBackup = () => ({
        schemaVersion: 1,
        type: 'cm-workspace-backup',
        exportedAt: '2026-01-01',
        label: 'Old',
        directSnippets: [{ id: 'dc_old', source: 'S', snippets: [], patterns: [] }],
        data: {
            personalTables: [{ id: 't', name: 'A', source: 'A', rows: [], patterns: [] }],
            annotations: { 'A_1r_*dd b': [{ id: 'leg', points: box(10, 5) }] },
            regions: { 'A_1r': [{ id: 'r1', name: 'Line 1', points: '0,0 100,0 100,20 0,20' }] },
            regionItems: { r1: [] },
            manualLines: {},
            iiifLinks: {},
            settings: { snippetSize: 70 }
        }
    });

    it('upgrades a v1 backup on import: legacy annotations land in regions, snippets in data', async () => {
        const [analysis] = await dm.analyzeImportFiles([fileOf(oldBackup())]);
        expect(analysis.success).toBe(true);
        expect(analysis.notes.join(' ')).toMatch(/Upgraded old whole-page annotations/);
        expect(analysis.parsed.schemaVersion).toBe(SCHEMA_VERSION);

        dm.executeImport(analysis.parsed, {});
        const items = stores.annotations.getAnnotations('A', '1r', '*dd');
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ id: 'leg', variant: 'b' });
        expect(stores.direct.serialize().map(c => c.id)).toEqual(['dc_old']);
        expect(stores.settings.snippetSize).toBe(70);
    });

    it('accepts the pre-schema { version, content } envelope', async () => {
        const [analysis] = await dm.analyzeImportFiles([fileOf({ version: 1, content: oldBackup().data })]);
        expect(analysis.success).toBe(true);
        expect(analysis.newSources.map(s => s.source)).toEqual(['A']);
    });

    it('refuses a file from a newer app, saying so', async () => {
        const [analysis] = await dm.analyzeImportFiles([fileOf({ schemaVersion: SCHEMA_VERSION + 1, data: {} })]);
        expect(analysis.success).toBe(false);
        expect(analysis.error).toMatch(/newer version/);
    });

    it('refuses files that are not backups, or not JSON, one by one', async () => {
        const results = await dm.analyzeImportFiles([
            fileOf('{broken'),
            fileOf({ hello: 'world' }),
            fileOf(oldBackup(), 'ok.json')
        ]);
        expect(results.map(r => r.success)).toEqual([false, false, true]);
        expect(results[0].error).toMatch(/malformed/);
    });

    it('drops malformed parts of a backup and reports them', async () => {
        const messy = oldBackup();
        messy.data.regions['B_1r'] = 'not a list';
        messy.data.iiifLinks = { A: 'https://x', B: 5 };
        const [analysis] = await dm.analyzeImportFiles([fileOf(messy)]);
        expect(analysis.success).toBe(true);
        expect(analysis.notes.join(' ')).toMatch(/malformed|IIIF link/);
        expect(analysis.parsed.data.iiifLinks).toEqual({ A: 'https://x' });
    });

    it('treats a configuration file as settings-only', async () => {
        fillWorkspace();
        dm.exportConfiguration();
        const config = downloads[0].data;
        freshApp();
        const [analysis] = await dm.analyzeImportFiles([fileOf(config, 'config.json')]);
        expect(analysis.isConfigOnly).toBe(true);
        dm.importConfiguration(analysis.parsed);
        expect(stores.settings.snippetSize).toBe(80);
        expect(stores.settings.snippetVariants).toEqual([{ key: 'x', label: 'Ex' }]);
        expect(stores.library.getLabel('*dd')).toBe('clivis');
        expect(stores.annotations.regions).toEqual({});
    });

    it('importConfiguration accepts a bare settings object', () => {
        dm.importConfiguration({ snippetSize: 120 });
        expect(stores.settings.snippetSize).toBe(120);
        dm.importConfiguration(null);
        expect(stores.settings.snippetSize).toBe(120);
    });

    it('takes a FileList-like object as well as an array or a single file', async () => {
        const f = fileOf(oldBackup());
        expect((await dm.analyzeImportFiles({ 0: f, length: 1, item: () => f, [Symbol.iterator]: function* () { yield f; } }))[0].success).toBe(true);
        expect((await dm.analyzeImportFiles(f))[0].success).toBe(true);
    });
});

describe('deleting', () => {
    it('removes the requested parts of one manuscript only', () => {
        fillWorkspace();
        dm.deleteManuscriptData('Pa 1', { snippets: true, regions: true, manualLines: true, table: true, iiifLink: true });
        expect(stores.annotations.getRegions('Pa 1', '1r')).toEqual([]);
        expect(stores.tables.tables.map(t => t.source)).toEqual(['Lo 4']);
        expect(stores.iiif.links).toEqual({});
        expect(stores.annotations.getRegions('Lo 4', '2v')).toHaveLength(1);
    });

    it('can empty a table but keep it', () => {
        fillWorkspace();
        dm.deleteManuscriptData('Pa 1', { snippets: false, regions: false, manualLines: false, tableRowsOnly: true });
        expect(stores.tables.tables.find(t => t.source === 'Pa 1').rows).toEqual([]);
        expect(stores.annotations.getRegions('Pa 1', '1r')).toHaveLength(1);
    });

    it('clears the manuscript data but not the settings', () => {
        fillWorkspace();
        dm.clearAllData();
        expect(stores.tables.tables).toEqual([]);
        expect(stores.annotations.regions).toEqual({});
        expect(stores.iiif.links).toEqual({});
        expect(stores.settings.snippetSize).toBe(80);
        expect(stores.library.getLabel('*dd')).toBe('clivis');
    });

    it('imports a workspace file as the folder service writes it (the safety copies workspace.replaced-*.json)', async () => {
        fillWorkspace();
        const kept = workspaceFile({
            label: 'Workspace',
            data: { ...buildCoreData(stores), ...buildSettingsData(stores) }
        });

        freshApp();
        const [analysis] = await dm.analyzeImportFiles([fileOf(kept, 'workspace.replaced-2026-10-04.json')]);
        expect(analysis.success).toBe(true);
        expect(analysis.newSources.map(s => s.source).sort()).toEqual(['Lo 4', 'Pa 1']);

        dm.executeImport(analysis.parsed, {});
        expect(Object.keys(stores.annotations.regions).sort()).toEqual(['Lo 4_2v', 'Pa 1_1r']);
        expect(stores.tables.tables.map(t => t.source).sort()).toEqual(['Lo 4', 'Pa 1']);
        expect(stores.settings.snippetSize).toBe(80);
    });

    it('imports an older (v1) workspace file, folding its whole-page annotations into regions', async () => {
        const v1 = {
            schemaVersion: 1,
            savedAt: '2026-07-15T17:33:49.391Z',
            label: 'My Backup',
            data: {
                personalTables: [],
                annotations: { 'Pa 1235_9_*u': [{ id: 'a1', points: '10,10 20,10 20,20 10,20', variant: 'b' }] },
                regions: {}, regionItems: {}, manualLines: {}, iiifLinks: {}
            }
        };
        freshApp();
        const [analysis] = await dm.analyzeImportFiles([fileOf(v1, 'workspace.pre-v1.json')]);
        expect(analysis.success).toBe(true);
        dm.executeImport(analysis.parsed, {});
        const items = Object.values(stores.annotations.regionItems).flat();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ pattern: '*u', variant: 'b' });
    });
});
