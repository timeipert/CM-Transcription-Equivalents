/**
 * The export builder: which files a selection of the workspace becomes.
 *
 * Settings → Export lets a person pick manuscripts, the kinds of data, custom
 * manuscripts and groups of settings. This module turns such a selection into
 * file envelopes (one file, or one file per item for a ZIP). It is pure: the
 * workspace comes in as plain data, nothing is downloaded here (see
 * `exportSelection` in composables/useDataManagement.js for that).
 *
 * A selection:
 *
 *   {
 *     sources:        string[]   IIIF-based manuscripts, by name
 *     parts:          string[]   kinds of manuscript data (DATA_PARTS)
 *     collections:    string[]   custom manuscripts, by id
 *     settingsGroups: string[]   keys of SETTINGS_GROUPS (stores/settings.js)
 *     patternLibrary: boolean
 *     ommrSettings:   boolean
 *   }
 *
 * The workspace:
 *
 *   { state, collections, settings, patternLibrary, ommrSettings }
 *
 * where `state` is the manuscript data (`buildCoreData`), `collections` the
 * custom manuscripts and `settings` the shareable settings.
 */
import { DATA_PARTS, extractManuscripts, getManuscriptStats, listSources } from '../../utils/workspaceSharing';
import { exportEnvelope } from './workspaceSchema';

// Letters of any script stay (sigla such as "Mü 7"); everything else becomes a dash.
const slug = text => String(text).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'file';

/** The manuscripts a backup holds: those with annotations, regions or table rows, by name. */
export function exportableSources(state) {
    return listSources(state)
        .filter(src => getManuscriptStats(state, src).hasData)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** A selection of everything in the workspace. */
export function fullSelection(workspace, settingsGroups) {
    return {
        sources: exportableSources(workspace.state),
        parts: [...DATA_PARTS],
        collections: (workspace.collections || []).map(c => c.id),
        settingsGroups: [...settingsGroups],
        patternLibrary: true,
        ommrSettings: true
    };
}

/** Whether `selection` holds everything `fullSelection` would. */
export function isCompleteSelection(selection, workspace, settingsGroups) {
    const full = fullSelection(workspace, settingsGroups);
    const covers = (have, want) => want.every(x => (have || []).includes(x));
    return covers(selection.sources, full.sources)
        && covers(selection.parts, full.parts)
        && covers(selection.collections, full.collections)
        && covers(selection.settingsGroups, full.settingsGroups)
        && !!selection.patternLibrary
        && !!selection.ommrSettings;
}

/** Whether the selection would produce anything at all. */
export function isEmptySelection(selection) {
    const manuscripts = (selection.sources || []).length > 0 && (selection.parts || []).length > 0;
    return !manuscripts
        && !(selection.collections || []).length
        && !(selection.settingsGroups || []).length
        && !selection.patternLibrary
        && !selection.ommrSettings;
}

/** The settings part of a file: `{ settings?, patternLibrary?, ommrSettings? }`. */
function settingsPart(workspace, selection, pickSettings) {
    const out = {};
    if ((selection.settingsGroups || []).length) out.settings = pickSettings(workspace.settings, selection.settingsGroups);
    if (selection.patternLibrary) out.patternLibrary = workspace.patternLibrary;
    if (selection.ommrSettings) out.ommrSettings = workspace.ommrSettings;
    return out;
}

function contentsOf({ manuscripts = [], customManuscripts = [], parts = [], selection, withSettings }) {
    return {
        manuscripts,
        customManuscripts,
        parts: manuscripts.length ? parts : [],
        settingsGroups: withSettings ? [...(selection.settingsGroups || [])] : [],
        patternLibrary: withSettings && !!selection.patternLibrary,
        ommrSettings: withSettings && !!selection.ommrSettings
    };
}

/**
 * The files a selection becomes.
 *
 * @param {Object} args
 * @param {Object} args.workspace
 * @param {Object} args.selection
 * @param {(settings: Object, groups: string[]) => Object} args.pickSettings
 *   the settings of the chosen groups (`settingsInGroups` from stores/settings.js)
 * @param {string[]} args.allSettingsGroups every group a selection could hold,
 *   to tell whether the selection is complete
 * @param {string} [args.label] a name for the export, kept in each file
 * @param {boolean} [args.perItem] one file per manuscript, per custom
 *   manuscript and one for the settings, instead of a single file
 * @param {string} [args.date] `YYYY-MM-DD` for the file names
 * @returns {{ files: { filename: string, envelope: Object }[], complete: boolean,
 *   manuscripts: string[], customManuscripts: string[] }}
 * @throws {Error} when the selection holds nothing
 */
export function buildExport({ workspace, selection, pickSettings, allSettingsGroups, label = 'Export', perItem = false, date = new Date().toISOString().slice(0, 10) }) {
    if (isEmptySelection(selection)) throw new Error('Nothing is selected for export.');

    const parts = DATA_PARTS.filter(p => (selection.parts || []).includes(p));
    const wantedSources = parts.length ? (selection.sources || []) : [];
    const manuscriptData = extractManuscripts(workspace.state, wantedSources, { onlyWithData: true, parts });
    // A manuscript whose chosen parts are empty (say only tables are wanted and it has none) is left out.
    const manuscripts = listSources(manuscriptData)
        .filter(src => wantedSources.includes(src))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const wantedCollections = new Set(selection.collections || []);
    const collections = (workspace.collections || []).filter(c => wantedCollections.has(c.id));
    const settings = settingsPart(workspace, selection, pickSettings);
    const withSettings = Object.keys(settings).length > 0;
    const complete = isCompleteSelection(selection, workspace, allSettingsGroups);

    if (!manuscripts.length && !collections.length && !withSettings) {
        throw new Error('The selected manuscripts hold none of the selected kinds of data.');
    }

    const result = { complete, manuscripts, customManuscripts: collections.map(c => c.source) };
    const base = slug(label);

    if (!perItem) {
        /** @type {Object} */
        const data = { ...manuscriptData, ...settings };
        if (collections.length) data.directSnippets = collections;
        const contents = contentsOf({ manuscripts, customManuscripts: result.customManuscripts, parts, selection, withSettings });
        const kind = complete ? 'backup' : 'export';
        return {
            ...result,
            files: [{ filename: `cm-transkript-${kind}-${base}-${date}.json`, envelope: exportEnvelope({ label, data, contents, complete }) }]
        };
    }

    const files = [];
    const used = new Set();
    const unique = name => {
        let candidate = name;
        for (let n = 2; used.has(candidate); n++) candidate = name.replace(/\.json$/, `-${n}.json`);
        used.add(candidate);
        return candidate;
    };

    for (const src of manuscripts) {
        const data = extractManuscripts(manuscriptData, [src], { parts });
        files.push({
            filename: unique(`manuscripts/${slug(src)}.json`),
            envelope: exportEnvelope({ label, data, contents: contentsOf({ manuscripts: [src], parts, selection, withSettings: false }) })
        });
    }
    for (const c of collections) {
        files.push({
            filename: unique(`custom-manuscripts/${slug(c.source || c.id)}.json`),
            envelope: exportEnvelope({ label, data: { directSnippets: [c] }, contents: contentsOf({ customManuscripts: [c.source], selection, withSettings: false }) })
        });
    }
    if (withSettings) {
        files.push({
            filename: unique('settings.json'),
            envelope: exportEnvelope({ label, data: settings, contents: contentsOf({ selection, withSettings: true }) })
        });
    }
    return { ...result, files };
}
