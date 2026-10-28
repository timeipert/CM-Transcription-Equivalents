import { describe, it, expect } from 'vitest';
import { buildExport, fullSelection, isCompleteSelection, isEmptySelection, exportableSources } from './exportBuilder';
import { ENVELOPE_TYPES, SCHEMA_VERSION } from './workspaceSchema';
import { SETTINGS_GROUPS, settingsInGroups, PERSISTED_SETTINGS } from '../../stores/settings';

const GROUPS = Object.keys(SETTINGS_GROUPS);

function workspace() {
    return {
        state: {
            personalTables: [
                { id: 't1', source: 'Pa 1', rows: [{ pattern: '*', customId: '1' }] },
                { id: 't2', source: 'Lo 4', rows: [] }
            ],
            regions: {
                'Pa 1_1r': [{ id: 'r1', name: 'Line 1', points: '' }],
                'Lo 4_2v': [{ id: 'r2', name: 'Line 1', points: '' }]
            },
            regionItems: { r1: [{ id: 'i1', pattern: '*' }], r2: [{ id: 'i2', pattern: '*dd' }] },
            manualLines: { 'Pa 1_1r': [1] },
            // Only a link: not a manuscript with data, so not exported.
            iiifLinks: { 'Pa 1': 'https://example.org/pa1.json', 'Ba 9': 'https://example.org/ba9.json' }
        },
        collections: [
            { id: 'dc_1', source: 'Custom A', patterns: [], snippets: [{ id: 's', image: 'data:x' }] },
            { id: 'dc_2', source: 'Custom B', patterns: [], snippets: [] }
        ],
        settings: { displayMode: 'arrow', globalDisplayIds: { '*': 'A' }, customSigns: [{ key: 'v' }], sourceAlignments: { 'Pa 1': { offset: 2 } }, sourceMeta: {} },
        patternLibrary: { patterns: { '*': { label: 'punctum' } } },
        ommrSettings: { folioOffsets: { 'Pa 1': 3 } }
    };
}

const build = (selection, extra = {}) => buildExport({
    workspace: workspace(), selection, pickSettings: settingsInGroups, allSettingsGroups: GROUPS, label: 'Mine', date: '2026-10-28', ...extra
});

describe('settings groups', () => {
    it('every persisted setting belongs to a group, and every shared one to an offered group', () => {
        for (const [key, spec] of Object.entries(PERSISTED_SETTINGS)) {
            expect(spec.group, key).toBeTruthy();
            if (spec.share !== false) expect(GROUPS, key).toContain(spec.group);
        }
    });

    it('settingsInGroups keeps only the keys of the chosen groups', () => {
        expect(settingsInGroups({ displayMode: 'svg', globalDisplayIds: {}, backupLabel: 'x', unknown: 1 }, ['display']))
            .toEqual({ displayMode: 'svg' });
    });
});

describe('selections', () => {
    it('the full selection lists the manuscripts with data, every custom manuscript and every group', () => {
        const sel = fullSelection(workspace(), GROUPS);
        expect(sel.sources).toEqual(['Lo 4', 'Pa 1']);
        expect(exportableSources(workspace().state)).toEqual(['Lo 4', 'Pa 1']);
        expect(sel.collections).toEqual(['dc_1', 'dc_2']);
        expect(isCompleteSelection(sel, workspace(), GROUPS)).toBe(true);
        expect(isCompleteSelection({ ...sel, parts: ['tables'] }, workspace(), GROUPS)).toBe(false);
        expect(isCompleteSelection({ ...sel, ommrSettings: false }, workspace(), GROUPS)).toBe(false);
    });

    it('an empty selection is refused', () => {
        const none = { sources: ['Pa 1'], parts: [], collections: [], settingsGroups: [], patternLibrary: false, ommrSettings: false };
        expect(isEmptySelection(none)).toBe(true);
        expect(() => build(none)).toThrow(/Nothing is selected/);
    });
});

describe('one file', () => {
    it('everything selected is a backup with a list of its contents', () => {
        const { files, complete } = build(fullSelection(workspace(), GROUPS));
        expect(complete).toBe(true);
        expect(files).toHaveLength(1);
        const [{ filename, envelope }] = files;
        expect(filename).toBe('cm-transkript-backup-Mine-2026-10-28.json');
        expect(envelope).toMatchObject({ schemaVersion: SCHEMA_VERSION, type: ENVELOPE_TYPES.backup, label: 'Mine' });
        expect(envelope.contents).toEqual({
            manuscripts: ['Lo 4', 'Pa 1'], customManuscripts: ['Custom A', 'Custom B'],
            parts: ['annotations', 'tables', 'iiifLinks'], settingsGroups: GROUPS, patternLibrary: true, ommrSettings: true
        });
        expect(Object.keys(envelope.data.regions).sort()).toEqual(['Lo 4_2v', 'Pa 1_1r']);
        expect(envelope.data.iiifLinks).toEqual({ 'Pa 1': 'https://example.org/pa1.json' });
        expect(envelope.data.directSnippets.map(c => c.id)).toEqual(['dc_1', 'dc_2']);
        expect(envelope.data.settings.displayMode).toBe('arrow');
        expect(envelope.data.ommrSettings).toEqual({ folioOffsets: { 'Pa 1': 3 } });
    });

    it('a selection carries only what was picked: one manuscript, only its table, two setting groups', () => {
        const { files, complete, manuscripts } = build({
            sources: ['Pa 1'], parts: ['tables'], collections: [], settingsGroups: ['ids', 'signs'], patternLibrary: false, ommrSettings: false
        });
        expect(complete).toBe(false);
        expect(manuscripts).toEqual(['Pa 1']);
        const { filename, envelope } = files[0];
        expect(filename).toBe('cm-transkript-export-Mine-2026-10-28.json');
        expect(envelope.type).toBe(ENVELOPE_TYPES.manuscripts);
        expect(envelope.data.personalTables.map(t => t.id)).toEqual(['t1']);
        expect(envelope.data.regions).toEqual({});
        expect(envelope.data.iiifLinks).toEqual({});
        expect(envelope.data.settings).toEqual({ globalDisplayIds: { '*': 'A' }, customSigns: [{ key: 'v' }] });
        expect(envelope.data).not.toHaveProperty('patternLibrary');
        expect(envelope.data).not.toHaveProperty('directSnippets');
        expect(envelope.contents.parts).toEqual(['tables']);
        expect(envelope.contents.settingsGroups).toEqual(['ids', 'signs']);
    });

    it('leaves out a manuscript whose chosen kinds of data are empty, and refuses if nothing is left', () => {
        // Lo 4 has a table without rows and a region; with only iiifLinks it has nothing.
        expect(() => build({ sources: ['Lo 4'], parts: ['iiifLinks'], collections: [], settingsGroups: [], patternLibrary: false, ommrSettings: false }))
            .toThrow(/none of the selected kinds/);
    });

    it('settings only', () => {
        const { files } = build({ sources: [], parts: [], collections: [], settingsGroups: ['alignment'], patternLibrary: true, ommrSettings: false });
        const data = files[0].envelope.data;
        expect(data.settings).toEqual({ sourceAlignments: { 'Pa 1': { offset: 2 } } });
        expect(data.patternLibrary).toBeTruthy();
        expect(data.regions).toEqual({});
        expect(files[0].envelope.contents).toMatchObject({ manuscripts: [], parts: [], settingsGroups: ['alignment'], patternLibrary: true });
    });
});

describe('one file per item', () => {
    it('writes a file per manuscript, per custom manuscript and one for the settings', () => {
        const { files, complete } = build(fullSelection(workspace(), GROUPS), { perItem: true });
        expect(complete).toBe(true);
        expect(files.map(f => f.filename)).toEqual([
            'manuscripts/Lo-4.json', 'manuscripts/Pa-1.json',
            'custom-manuscripts/Custom-A.json', 'custom-manuscripts/Custom-B.json',
            'settings.json'
        ]);
        const pa = files[1].envelope;
        expect(Object.keys(pa.data.regions)).toEqual(['Pa 1_1r']);
        expect(pa.data.regionItems).toEqual({ r1: [{ id: 'i1', pattern: '*' }] });
        expect(pa.data).not.toHaveProperty('settings');
        expect(pa.contents.manuscripts).toEqual(['Pa 1']);
        expect(files[2].envelope.data.directSnippets.map(c => c.id)).toEqual(['dc_1']);
        expect(files[4].envelope.data.settings.displayMode).toBe('arrow');
        expect(files[4].envelope.contents.manuscripts).toEqual([]);
    });

    it('keeps file names unique when two sigla make the same name', () => {
        const ws = workspace();
        ws.collections = [{ id: 'a', source: 'X/1', patterns: [], snippets: [] }, { id: 'b', source: 'X 1', patterns: [], snippets: [] }];
        const { files } = buildExport({
            workspace: ws, pickSettings: settingsInGroups, allSettingsGroups: GROUPS, perItem: true,
            selection: { sources: [], parts: [], collections: ['a', 'b'], settingsGroups: [], patternLibrary: false, ommrSettings: false }
        });
        expect(files.map(f => f.filename)).toEqual(['custom-manuscripts/X-1.json', 'custom-manuscripts/X-1-2.json']);
    });
});
