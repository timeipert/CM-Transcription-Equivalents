import { collectStores } from '../services/persistence/storeRegistry';
import {
    migrate, sanitizeData, isConfigFile, SchemaError,
    buildCoreData, buildSettingsData, applyCoreData, applySettingsData,
    backupEnvelope, manuscriptsEnvelope, configEnvelope, customManuscriptEnvelope
} from '../services/persistence/workspaceSchema';
import { useSaveReminderStore } from '../stores/saveReminder';
import { useOmmrStore } from '../stores/ommr';
import {
    extractManuscripts, mergeManuscript, getManuscriptStats, listSources,
    analyzeCustomCollections, mergeCustomCollections
} from '../utils/workspaceSharing';
import { newId } from '../utils/id';
import { downloadJson } from '../utils/download';

const today = () => new Date().toISOString().slice(0, 10);
const slug = text => String(text).replace(/[^a-z0-9]/gi, '-');

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
                    parsed: json,
                    hasSettings: !!data.settings,
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

        let state = getLocalFullState();
        for (const src of listSources(data)) {
            const strategy = choices[src] || 'overwrite';
            if (strategy === 'skip') continue;
            state = mergeManuscript(state, data, src, strategy);
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
        exportManuscripts,
        exportCustomManuscript,
        exportConfiguration,
        importConfiguration,
        analyzeImportFiles,
        executeImport,
        deleteManuscriptData,
        clearAllData,
        getLocalFullState
    };
}
