import { collectStores } from '../services/persistence/storeRegistry';
import {
    migrate, sanitizeData, isConfigFile, SchemaError,
    buildCoreData, buildSettingsData, applyCoreData, applySettingsData,
    backupEnvelope, manuscriptsEnvelope, configEnvelope, customManuscriptEnvelope, fileParts, ENVELOPE_TYPES
} from '../services/persistence/workspaceSchema';
import { buildExport } from '../services/persistence/exportBuilder';
import { SETTINGS_GROUPS, settingsInGroups } from '../stores/settings';
import { useSaveReminderStore } from '../stores/saveReminder';
import { useOmmrStore } from '../stores/ommr';
import {
    extractManuscripts, mergeManuscript, getManuscriptStats, listSources,
    analyzeCustomCollections, mergeCustomCollections
} from '../utils/workspaceSharing';
import { newId } from '../utils/id';
import { downloadJson, downloadBlob } from '../utils/download';

const today = () => new Date().toISOString().slice(0, 10);
const slug = text => String(text).replace(/[^a-z0-9]/gi, '-');

/**
 * What a file is, for display: 'backup' (the whole workspace), 'manuscripts'
 * (a selection), 'custom' (custom manuscripts only) or 'workspace' (a
 * workspace-folder file or one without a type).
 */
function fileKind(json) {
    if (json.type === ENVELOPE_TYPES.backup) return 'backup';
    if (json.type === ENVELOPE_TYPES.manuscripts) {
        const d = json.data || {};
        const onlyCustom = Array.isArray(d.directSnippets) && d.directSnippets.length
            && !listSources(d).length && !d.settings;
        return onlyCustom ? 'custom' : 'manuscripts';
    }
    return 'workspace';
}

/**
 * Backups, exports and imports of the workspace.
 *
 * The file formats themselves — what a payload contains, how an old one is
 * upgraded, what is rejected — live in services/persistence/workspaceSchema.js.
 * This composable is the user-facing layer on top: it picks the data, names the
 * download, and decides how an incoming file is merged.
 */
export function useDataManagement() {
    const stores = collectStores();
    const reminder = useSaveReminderStore();
    const ommrDatasets = useOmmrStore();

    /** The manuscript data as it is right now (live references; copy before mutating). */
    function getLocalFullState() {
        return buildCoreData(stores);
    }

    /**
     * Export the whole workspace (only manuscripts that hold data).
     * `includeSettings: false` leaves out the configuration, the pattern library
     * and the OMMR settings.
     */
    async function exportData(options = {}) {
        const { includeSettings = true, onlyWithData = true } = options;
        // The snippet collections load asynchronously; a backup taken before they
        // finish would silently omit them.
        if (!stores.direct.loaded) await stores.direct.load();

        const state = getLocalFullState();
        const data = {
            ...extractManuscripts(state, listSources(state), { onlyWithData }),
            // Direct snippet images are inline base64, so a backup of them is
            // self-contained (no IIIF server needed to restore).
            directSnippets: stores.direct.serialize()
        };
        if (includeSettings) Object.assign(data, buildSettingsData(stores, { shared: true }));

        const label = stores.settings.backupLabel || 'Workspace';
        downloadJson(
            `cm-transkript-backup-${slug(stores.settings.backupLabel || 'backup')}-${today()}.json`,
            backupEnvelope({ label, data })
        );
        reminder.markExported();
    }

    /** Export specific manuscripts (only those with data). */
    function exportManuscripts(sourceIds) {
        const data = extractManuscripts(getLocalFullState(), sourceIds, { onlyWithData: true });
        const exported = listSources(data);
        if (exported.length === 0) {
            throw new Error('None of the selected manuscripts contain any annotations, regions, or pattern rows.');
        }
        const name = exported.length === 1 ? slug(exported[0]) : 'selected-sources';
        downloadJson(
            `cm-manuscripts-${name}-${today()}.json`,
            manuscriptsEnvelope({ exportedManuscripts: exported, data })
        );
    }

    /**
     * Export one custom manuscript (images included) as a file of its own, to pass
     * to a proofreader. Settings → Import reads it back.
     * @returns {string} the file name
     */
    async function exportCustomManuscript(collectionId) {
        // Pending edits sit in a debounce timer; the file must hold what is on screen.
        if (!stores.direct.loaded) await stores.direct.load();
        const collection = stores.direct.getCollection(collectionId);
        if (!collection) throw new Error('That custom manuscript no longer exists.');
        const filename = `cm-custom-manuscript-${slug(collection.source || 'manuscript')}-${today()}.json`;
        downloadJson(filename, customManuscriptEnvelope(JSON.parse(JSON.stringify(collection))));
        return filename;
    }

    /**
     * The workspace as the export builder reads it (plain data; live references,
     * copy before mutating). Waits for the custom manuscripts to load.
     */
    async function exportWorkspace() {
        if (!stores.direct.loaded) await stores.direct.load();
        const { settings, patternLibrary, ommrSettings } = buildSettingsData(stores, { shared: true });
        return { state: getLocalFullState(), collections: stores.direct.collections, settings, patternLibrary, ommrSettings };
    }

    /**
     * Export a selection of the workspace (see services/persistence/exportBuilder.js
     * for its shape): one JSON file, or with `perItem` a ZIP with one file per
     * manuscript, per custom manuscript and one for the settings.
     * A selection of everything counts as a backup for the backup reminder.
     * @returns {Promise<{ filename: string, files: number, complete: boolean, manuscripts: string[], customManuscripts: string[] }>}
     */
    async function exportSelection(selection, options = {}) {
        const { perItem = false } = options;
        const label = options.label || stores.settings.backupLabel || 'Export';
        const workspace = await exportWorkspace();
        const built = buildExport({
            workspace: JSON.parse(JSON.stringify(workspace)),
            selection,
            pickSettings: settingsInGroups,
            allSettingsGroups: Object.keys(SETTINGS_GROUPS),
            label,
            perItem,
            date: today()
        });

        let filename;
        if (perItem) {
            const { default: JSZip } = await import('jszip');
            const zip = new JSZip();
            for (const f of built.files) zip.file(f.filename, JSON.stringify(f.envelope, null, 2));
            const bytes = await zip.generateAsync({ type: 'uint8array' });
            filename = `cm-transkript-${built.complete ? 'backup' : 'export'}-${slug(label)}-${today()}.zip`;
            downloadBlob(filename, new Blob([bytes], { type: 'application/zip' }));
        } else {
            filename = built.files[0].filename;
            downloadJson(filename, built.files[0].envelope);
        }
        if (built.complete) reminder.markExported();
        return { filename, files: built.files.length, complete: built.complete, manuscripts: built.manuscripts, customManuscripts: built.customManuscripts };
    }

    /** Export the standalone configuration (settings and pattern library, no manuscript data). */
    function exportConfiguration() {
        const { settings, patternLibrary } = buildSettingsData(stores, { shared: true });
        downloadJson(
            `cm-config-${today()}.json`,
            configEnvelope({ label: stores.settings.backupLabel || 'Config', settings, patternLibrary })
        );
    }

    /**
     * Apply a configuration. Accepts a whole configuration file, a backup's
     * `data`, or a bare settings object.
     */
    function importConfiguration(payload) {
        if (!payload) return;
        const settings = payload.settings || payload.data?.settings || payload;
        // The pattern library travels with the configuration (labels, notes and
        // MEI templates are workspace-wide, not per manuscript).
        const patternLibrary = payload.patternLibrary || payload.data?.patternLibrary;
        applySettingsData(stores, { settings, patternLibrary }, { shared: true });
    }

    async function readFileAsJson(file) {
        let text;
        try {
            text = await file.text();
        } catch {
            throw new Error('Failed to read the file from disk.');
        }
        try {
            return JSON.parse(text);
        } catch {
            throw new Error('Failed to parse JSON file - it might be malformed.');
        }
    }

    /**
     * Read import files and describe what each would change, without changing
     * anything. Old files are upgraded and malformed parts dropped; `notes` says
     * what happened so the UI can show it.
     */
    async function analyzeImportFiles(files) {
        // A FileList, an array of files, or a single file
        const list = Array.isArray(files) ? files
            : files && typeof files.length === 'number' ? Array.from(files)
            : [files];

        const results = [];
        const localState = getLocalFullState();
        const localSources = new Set(listSources(localState));
        if (!stores.direct.loaded) await stores.direct.load();

        for (const file of list) {
            try {
                const raw = await readFileAsJson(file);

                // A standalone configuration file
                if (isConfigFile(raw)) {
                    const { json } = migrate(raw);
                    results.push({
                        success: true,
                        isConfigOnly: true,
                        fileName: file.name,
                        kind: 'config',
                        label: typeof json.label === 'string' ? json.label : '',
                        hasSettings: true,
                        parsed: json,
                        exportedAt: json.exportedAt,
                        notes: []
                    });
                    continue;
                }

                const { json, notes } = migrate(raw);
                if (!json.data) throw new SchemaError('Invalid backup file format: missing schemaVersion or data object.');
                const { data, warnings } = sanitizeData(json.data);
                json.data = data;

                const newSources = [];
                const overlapSources = []; // [{ source, incomingStats, localStats }]
                for (const src of listSources(data)) {
                    const incomingStats = getManuscriptStats(data, src);
                    const localStats = getManuscriptStats(localState, src);
                    // Only work that exists here can conflict. A manuscript the app merely
                    // knows (an IIIF link from the built-in list, an empty table) is not a
                    // conflict: asking would default it to "skip" and import nothing.
                    if (localSources.has(src) && localStats.hasData) {
                        overlapSources.push({ source: src, incomingStats, localStats });
                    } else {
                        newSources.push({ source: src, incomingStats });
                    }
                }

                // Custom manuscripts are matched by id and siglum, not by folio data.
                const { newCollections, overlapCollections } =
                    analyzeCustomCollections(data.directSnippets, stores.direct.collections);

                results.push({
                    success: true,
                    isConfigOnly: false,
                    fileName: file.name,
                    kind: fileKind(json),
                    label: typeof json.label === 'string' ? json.label : '',
                    exportedAt: json.exportedAt || json.savedAt || '',
                    parts: fileParts(json),
                    parsed: json,
                    hasSettings: !!(data.settings || data.patternLibrary || data.ommrSettings),
                    newSources,
                    overlapSources,
                    newCollections,
                    overlapCollections,
                    notes: [...notes, ...warnings]
                });
            } catch (err) {
                results.push({ success: false, fileName: file.name, error: err.message });
            }
        }
        return results;
    }

    /**
     * Merge an analyzed backup into the workspace.
     * @param parsedJson a file as returned in `analyzeImportFiles(...)[i].parsed`
     * @param choices    per source: 'overwrite' | 'copy' | 'skip'
     * @param options    `importSettings`; `collectionChoices`: the same choices for custom
     *                   manuscripts, keyed by the id they have in the file (default 'overwrite')
     */
    function executeImport(parsedJson, choices, options = {}) {
        const { importSettings = true, collectionChoices = {} } = options;
        const { json } = migrate(parsedJson);
        const data = json.data;
        // A file from the export builder may carry only some kinds of data; an
        // overwrite then replaces only those.
        const parts = fileParts(json);

        let state = getLocalFullState();
        for (const src of listSources(data)) {
            const strategy = choices[src] || 'overwrite';
            if (strategy === 'skip') continue;
            state = mergeManuscript(state, data, src, strategy, { parts });
        }

        // Commit to the stores (which triggers the autosave if a folder is bound)
        applyCoreData(stores, state);

        // The configuration, pattern library and OMMR settings are workspace-wide,
        // so they travel with the settings rather than through the merge strategies.
        if (importSettings) applySettingsData(stores, data, { shared: true });

        // Custom manuscripts are independent of the manuscript merge strategies above:
        // they collide by id or siglum and have their own choices.
        if (Array.isArray(data.directSnippets)) {
            stores.direct.replaceAll(
                mergeCustomCollections(stores.direct.collections, data.directSnippets, collectionChoices, () => newId('dc'))
            );
        }
    }

    /**
     * Everything an import or a "remove all" can change, as a deep copy, so it
     * can be put back (`restoreSnapshot`). Includes the settings that never leave
     * the browser and the custom manuscripts with their images.
     */
    async function takeSnapshot() {
        if (!stores.direct.loaded) await stores.direct.load();
        return JSON.parse(JSON.stringify({
            core: getLocalFullState(),
            settings: buildSettingsData(stores),
            direct: stores.direct.serialize()
        }));
    }

    /** Put the workspace back as `takeSnapshot` found it. */
    function restoreSnapshot(snapshot) {
        if (!snapshot) return;
        applyCoreData(stores, snapshot.core);
        applySettingsData(stores, snapshot.settings);
        if (Array.isArray(snapshot.direct)) stores.direct.replaceAll(snapshot.direct);
    }

    /**
     * Import several analyzed files in order, each with its own choices. Later
     * files see what earlier ones brought in. A snapshot is taken first and
     * returned, so the whole import can be undone in one step.
     *
     * @param {{ analysis: Object, choices?: Object, collectionChoices?: Object, importSettings?: boolean }[]} items
     *   `analysis` is one successful result of `analyzeImportFiles`
     * @returns {Promise<{ snapshot: Object, files: number, errors: { fileName: string, error: string }[] }>}
     */
    async function importBatch(items) {
        const snapshot = await takeSnapshot();
        const errors = [];
        let files = 0;
        for (const { analysis, choices = {}, collectionChoices = {}, importSettings = false } of items) {
            try {
                if (analysis.isConfigOnly) {
                    if (importSettings) importConfiguration(analysis.parsed);
                } else {
                    executeImport(analysis.parsed, choices, { importSettings, collectionChoices });
                }
                files++;
            } catch (e) {
                errors.push({ fileName: analysis.fileName, error: e.message });
            }
        }
        return { snapshot, files, errors };
    }

    function deleteManuscriptData(source, options = {}) {
        if (!source) return;
        const {
            snippets = true,
            regions = true,
            manualLines = true,
            table = false,
            tableRowsOnly = false,
            iiifLink = false,
            ommrDataset = false,
            folios = null,
            patterns = null
        } = options;

        if (snippets || regions || manualLines) {
            stores.annotations.clearManuscript(source, { snippets, regions, manualLines, folios, patterns });
        }

        if (table) {
            stores.tables.deleteTableForSource(source);
        } else if (tableRowsOnly) {
            stores.tables.clearTableRowsForSource(source);
        }

        if (iiifLink) {
            stores.iiif.removeManifest(source);
        }

        if (ommrDataset) {
            ommrDatasets.removeDataset(source);
        }
    }

    function clearAllData() {
        stores.tables.reset();
        stores.annotations.reset();
        stores.iiif.reset();
    }

    return {
        exportData,
        exportWorkspace,
        exportSelection,
        exportManuscripts,
        exportCustomManuscript,
        exportConfiguration,
        importConfiguration,
        analyzeImportFiles,
        executeImport,
        importBatch,
        takeSnapshot,
        restoreSnapshot,
        deleteManuscriptData,
        clearAllData,
        getLocalFullState
    };
}
