/**
 * The workspace data format, in one place.
 *
 * Four things used to each carry their own copy of "what is the workspace": the
 * workspace-folder file, the backup export, the per-manuscript export and the
 * configuration export. Each hand-listed the settings it wrote and the settings
 * it read back, and each declared its own `SCHEMA_VERSION`. This module owns:
 *
 *   - the schema version and the upgrade chain (`migrate`),
 *   - shape validation for untrusted input (`sanitizeData`),
 *   - how store state maps to a payload and back (`build*Data` / `apply*Data`),
 *   - the file envelopes.
 *
 * It imports no Vue or Pinia: the functions take the stores as a plain object
 *
 *     { settings, annotations, tables, iiif, library, ommrSettings, direct }
 *
 * so the format can be tested without a running app.
 *
 * Version history
 *   1  first schema; legacy whole-page annotations beside regions; direct
 *      snippets at the top level of a backup.
 *   2  legacy annotations folded into regions (no `annotations` key); direct
 *      snippets live in `data.directSnippets` everywhere; `data.ommrSettings`.
 */

import { isPlainObject } from '../../utils/shape';
import { foldLegacyAnnotations, hasLegacyAnnotations } from './migrations/legacyAnnotations';

export const SCHEMA_VERSION = 2;

/** `type` values of the exported file envelopes. */
export const ENVELOPE_TYPES = {
    backup: 'cm-workspace-backup',
    manuscripts: 'cm-manuscript-export',
    config: 'cm-transcription-config'
};

/** A file the app cannot (or must not) read; the message is fit to show the user. */
export class SchemaError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SchemaError';
    }
}

// --- Detecting what a file is ---------------------------------------------

/**
 * Whether a parsed file is a standalone configuration (settings only, no
 * annotation data). Also accepts a bare settings object.
 */
export function isConfigFile(json) {
    if (!isPlainObject(json)) return false;
    if (json.type === ENVELOPE_TYPES.config) return true;
    return !!json.settings && !json.data?.personalTables && !json.data?.regions;
}

// --- Upgrading --------------------------------------------------------------

/**
 * Upgrade steps, keyed by the version they upgrade FROM. Each returns a new
 * object and never mutates its input.
 */
const STEPS = {
    1(json, notes) {
        const next = { ...json, schemaVersion: 2 };

        if (isPlainObject(json.data)) {
            const data = { ...json.data };

            if (hasLegacyAnnotations(data)) {
                const { state, report } = foldLegacyAnnotations(data);
                data.regions = state.regions;
                data.regionItems = state.regionItems;
                const parts = [`${report.moved} moved into line regions`];
                if (report.duplicates) parts.push(`${report.duplicates} duplicate${report.duplicates === 1 ? '' : 's'} dropped`);
                if (report.unassigned) parts.push(`${report.unassigned} placed in "Unassigned" regions`);
                notes.push(`Upgraded old whole-page annotations: ${parts.join(', ')}.`);
            }
            delete data.annotations;

            // Backups used to keep direct snippets beside `data`; they now live in it.
            if (Array.isArray(json.directSnippets) && data.directSnippets === undefined) {
                data.directSnippets = json.directSnippets;
            }
            delete next.directSnippets;

            next.data = data;
        }
        return next;
    }
};

/**
 * Bring a parsed file up to the current schema.
 *
 * Accepts the current format, every older one, and the pre-schema
 * `{ version, content }` envelope. A file written by a NEWER app is refused
 * rather than guessed at, so an old build can never silently drop fields it does
 * not know and then overwrite the file.
 *
 * @param {any} input parsed JSON
 * @returns {{ json: Object, from: number, to: number, notes: string[] }}
 * @throws {SchemaError}
 */
export function migrate(input) {
    if (!isPlainObject(input)) throw new SchemaError('Not a valid file: expected a JSON object.');

    let json = { ...input };
    const notes = [];

    // Pre-schema envelope: { version, content } was renamed { schemaVersion, data }.
    if (json.schemaVersion === undefined && json.version !== undefined && json.content !== undefined) {
        json = { ...json, schemaVersion: Number(json.version) || 1, data: json.content };
        delete json.version;
        delete json.content;
    }

    const hasData = isPlainObject(json.data);
    let version = json.schemaVersion;
    // A configuration file written before schemaVersion existed: no data section,
    // but recognisably settings.
    const looksLikeConfig = json.type === ENVELOPE_TYPES.config || isPlainObject(json.settings);
    if (version === undefined && !hasData && looksLikeConfig) version = 1;
    if (!Number.isInteger(version) || version < 1) {
        throw new SchemaError('Invalid file format: missing schemaVersion or data object.');
    }
    if (version > SCHEMA_VERSION) {
        throw new SchemaError(
            `This file was written by a newer version of the app (schema v${version}; ` +
            `this version reads up to v${SCHEMA_VERSION}). Update the app to open it.`
        );
    }

    const from = version;
    while (version < SCHEMA_VERSION) {
        json = STEPS[version](json, notes);
        version = json.schemaVersion;
    }
    return { json, from, to: SCHEMA_VERSION, notes };
}

// --- Validating -------------------------------------------------------------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Drop whatever cannot be a valid part of the workspace: a container of the
 * wrong type, a region list that is not a list, an entry that is not an object.
 * A bad piece is removed and reported instead of failing the whole file, so one
 * corrupt entry cannot make a workspace unreadable — nor reach a store, where a
 * view would crash on it far from the cause.
 *
 * @param {Object} data the `data` part of a workspace payload
 * @returns {{ data: Object, warnings: string[] }}
 */
export function sanitizeData(data) {
    const warnings = [];
    const out = { ...(isPlainObject(data) ? data : {}) };

    const objectOrDrop = key => {
        if (out[key] === undefined) return;
        if (!isPlainObject(out[key])) {
            warnings.push(`Ignored "${key}": expected an object.`);
            delete out[key];
        }
    };

    if (out.personalTables !== undefined && !Array.isArray(out.personalTables)) {
        warnings.push('Ignored "personalTables": expected a list.');
        delete out.personalTables;
    }

    for (const key of ['regions', 'regionItems', 'manualLines', 'iiifLinks', 'settings', 'patternLibrary', 'ommrSettings']) {
        objectOrDrop(key);
    }
    if (out.directSnippets !== undefined && !Array.isArray(out.directSnippets)) {
        warnings.push('Ignored "directSnippets": expected a list.');
        delete out.directSnippets;
    }

    // Per-page region lists and per-region item lists: every value a list of objects.
    for (const key of ['regions', 'regionItems']) {
        if (!out[key]) continue;
        const cleaned = {};
        let dropped = 0;
        for (const [k, list] of Object.entries(out[key])) {
            if (!Array.isArray(list)) { dropped++; continue; }
            const good = list.filter(isPlainObject);
            dropped += list.length - good.length;
            cleaned[k] = good;
        }
        if (dropped) warnings.push(`Dropped ${plural(dropped, 'malformed entry', 'malformed entries')} from "${key}".`);
        out[key] = cleaned;
    }

    if (out.manualLines) {
        const cleaned = {};
        for (const [k, list] of Object.entries(out.manualLines)) {
            if (Array.isArray(list)) cleaned[k] = list;
        }
        out.manualLines = cleaned;
    }

    if (out.iiifLinks) {
        const cleaned = {};
        let dropped = 0;
        for (const [source, url] of Object.entries(out.iiifLinks)) {
            if (typeof url === 'string') cleaned[source] = url;
            else dropped++;
        }
        if (dropped) warnings.push(`Dropped ${plural(dropped, 'IIIF link', 'IIIF links')} that ${dropped === 1 ? 'was' : 'were'} not a URL.`);
        out.iiifLinks = cleaned;
    }

    return { data: out, warnings };
}

// --- Store state <-> payload -------------------------------------------------

/**
 * The manuscript data: what extraction, merging and per-manuscript export work
 * on. These are live references into the stores — copy before mutating.
 */
export function buildCoreData(stores) {
    return {
        personalTables: stores.tables.serialize().tables,
        ...stores.annotations.serialize(),
        iiifLinks: stores.iiif.serialize()
    };
}

/**
 * The project-wide configuration and the work that hangs on it.
 * @param {Object} stores
 * @param {{ shared?: boolean }} [opts] `shared` leaves out what should not
 *   travel in exported files (see PERSISTED_SETTINGS).
 */
export function buildSettingsData(stores, opts = {}) {
    const { shared = false } = opts;
    return {
        settings: stores.settings.serialize({ shared }),
        patternLibrary: stores.library.serialize(),
        ommrSettings: stores.ommrSettings.serialize()
    };
}

/**
 * Replace the store state for the manuscript data present in `data`.
 * Parts that are absent are left alone.
 */
export function applyCoreData(stores, data) {
    if (!isPlainObject(data)) return;
    if (data.personalTables) stores.tables.hydrate({ tables: data.personalTables });
    stores.annotations.hydrate({
        regions: data.regions,
        regionItems: data.regionItems,
        manualLines: data.manualLines
    });
    if (data.iiifLinks) stores.iiif.hydrate(data.iiifLinks);
}

/**
 * Apply the configuration parts present in `data`.
 * @param {Object} stores
 * @param {Object} data
 * @param {{ shared?: boolean }} [opts] `shared` skips settings that stay local.
 */
export function applySettingsData(stores, data, opts = {}) {
    const { shared = false } = opts;
    if (!isPlainObject(data)) return;
    if (data.settings) stores.settings.hydrate(data.settings, { shared });
    if (data.patternLibrary) stores.library.hydrate(data.patternLibrary);
    if (data.ommrSettings) stores.ommrSettings.hydrate(data.ommrSettings);
}

/** Direct snippet collections are async (they wait for IndexedDB). */
export async function applyDirectData(stores, list) {
    if (Array.isArray(list)) await stores.direct.hydrate(list);
}

// --- Envelopes ----------------------------------------------------------------

/** The workspace file kept in the bound folder. */
export function workspaceFile({ label, data }) {
    return { schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), label, data };
}

/** A full backup of the workspace. */
export function backupEnvelope({ label, data }) {
    return {
        schemaVersion: SCHEMA_VERSION,
        type: ENVELOPE_TYPES.backup,
        exportedAt: new Date().toISOString(),
        label,
        data
    };
}

/** An export of selected manuscripts. */
export function manuscriptsEnvelope({ exportedManuscripts, data }) {
    return {
        schemaVersion: SCHEMA_VERSION,
        type: ENVELOPE_TYPES.manuscripts,
        exportedAt: new Date().toISOString(),
        exportedManuscripts,
        data
    };
}

/** A standalone configuration file. */
export function configEnvelope({ label, settings, patternLibrary }) {
    return {
        schemaVersion: SCHEMA_VERSION,
        type: ENVELOPE_TYPES.config,
        exportedAt: new Date().toISOString(),
        label,
        settings,
        patternLibrary
    };
}
