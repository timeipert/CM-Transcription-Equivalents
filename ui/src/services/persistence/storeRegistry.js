/**
 * Which stores persist, where, and the wiring that keeps them persisted.
 *
 * Every persisted store implements the same three-function contract:
 *
 *   serialize()      its state as plain JSON data
 *   hydrate(data)    replace its state from such data (tolerating older shapes)
 *   reset()          back to a fresh workspace
 *
 * `initPersistence()` then does, for each store in the table below:
 *   1. load its state from browser storage (tolerating a corrupt entry),
 *   2. watch it once — only the data it serializes, not transient state such as
 *      loading flags or fetched caches — bump its revision in the change tracker
 *      and mirror the new state back to browser storage (debounced, and flushed
 *      when the page is hidden so the last edit is never lost to the debounce).
 *
 * The workspace-folder autosave and the backup reminder watch the revisions, not
 * the data, so nothing else walks the state again.
 */

import { watch, effectScope } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useAnnotationsStore } from '../../stores/annotations';
import { usePersonalTablesStore } from '../../stores/personalTables';
import { useIiifStore } from '../../stores/iiif';
import { usePatternLibraryStore } from '../../stores/patternLibrary';
import { useOmmrSettingsStore } from '../../stores/ommrSettings';
import { useDirectSnippetsStore } from '../../stores/directSnippets';
import { saveJSON } from '../../utils/safeStorage';
import { noteChange, untracked } from './changeTracker';
import { STORAGE_NS } from '../../utils/storageNamespace';

const parseJson = raw => {
    try { return JSON.parse(raw); } catch { return undefined; }
};

/**
 * Where each store's state is kept.
 *
 *   key      its browser-storage key; omitted when the store keeps itself
 *            elsewhere (the direct snippets carry images and live in IndexedDB)
 *   legacy   older storage layouts, tried in order when `key` is empty. Each
 *            returns data for `hydrate()` or undefined; the store folds older
 *            shapes in itself.
 *   section  which workspace-folder file the store belongs to: images make the
 *            direct snippets heavy, so they are written separately from the rest
 */
export const PERSISTED_STORES = [
    { id: 'settings', use: useSettingsStore, section: 'core', local: { key: 'globalSettings' } },
    {
        id: 'annotations',
        use: useAnnotationsStore,
        section: 'core',
        local: {
            key: 'annotations_v3',
            legacy: [
                // v2 still carried the whole-page `annotations` map; hydrate() folds it into regions.
                storage => parseJson(storage.getItem('annotations_v2')),
                // v1 was just that map.
                storage => {
                    const v1 = parseJson(storage.getItem('annotations'));
                    return v1 && typeof v1 === 'object' ? { annotations: v1 } : undefined;
                }
            ]
        }
    },
    { id: 'personalTables', use: usePersonalTablesStore, section: 'core', local: { key: 'personalTables' } },
    { id: 'iiif', use: useIiifStore, section: 'core', local: { key: 'iiifLinks' } },
    { id: 'patternLibrary', use: usePatternLibraryStore, section: 'core', local: { key: 'patternLibrary_v1' } },
    {
        id: 'ommrSettings',
        use: useOmmrSettingsStore,
        section: 'core',
        local: {
            key: 'ommrSettings_v1',
            // Calibrations, offsets and index modes used to sit in three separate keys.
            legacy: [
                storage => {
                    const calibrations = parseJson(storage.getItem('ommrCalibrations'));
                    const folioOffsets = parseJson(storage.getItem('ommrFolioOffsets'));
                    const indexModes = parseJson(storage.getItem('ommrIndexModes'));
                    return calibrations || folioOffsets || indexModes
                        ? { calibrations, folioOffsets, indexModes }
                        : undefined;
                }
            ]
        }
    },
    { id: 'directSnippets', use: useDirectSnippetsStore, section: 'direct' }
];

/** Store ids by workspace-folder file. */
export const SECTION_IDS = {
    core: PERSISTED_STORES.filter(e => e.section === 'core').map(e => e.id),
    direct: PERSISTED_STORES.filter(e => e.section === 'direct').map(e => e.id)
};

/** The stores whose changes are the user's work (the backup reminder counts these). */
export const DATA_STORE_IDS = ['annotations', 'personalTables', 'directSnippets'];

/** The stores as the workspace schema expects them. */
export function collectStores(pinia) {
    return {
        settings: useSettingsStore(pinia),
        annotations: useAnnotationsStore(pinia),
        tables: usePersonalTablesStore(pinia),
        iiif: useIiifStore(pinia),
        library: usePatternLibraryStore(pinia),
        ommrSettings: useOmmrSettingsStore(pinia),
        direct: useDirectSnippetsStore(pinia)
    };
}

// --- Browser storage: load ----------------------------------------------------

/**
 * Keep a copy of an entry that could not be parsed, so that the next save does
 * not destroy the only evidence of what was there.
 */
function quarantine(storage, key, raw) {
    try { storage.setItem(`${key}__corrupt`, raw); } catch { /* storage full: nothing more to do */ }
}

/** Prefix for this run's keys (see utils/storageNamespace.js); set by initPersistence. */
let namespace = STORAGE_NS;
const keyOf = entry => namespace + entry.local.key;

function loadLocal(store, entry, storage) {
    const key = keyOf(entry);
    // A prefixed build starts from what an unprefixed build left under the plain key.
    const plain = entry.local.key;
    const legacy = [
        ...(namespace ? [s => parseJson(s.getItem(plain))] : []),
        ...(entry.local.legacy || [])
    ];
    const raw = storage.getItem(key);

    if (raw !== null) {
        const data = parseJson(raw);
        if (data === undefined) {
            console.error(`Browser storage entry "${key}" is corrupt; starting from empty and keeping a copy.`);
            quarantine(storage, key, raw);
            return;
        }
        untracked(() => store.hydrate(data));
        return;
    }

    for (const read of legacy) {
        let data;
        try { data = read(storage); } catch { data = undefined; }
        if (data === undefined || data === null) continue;
        untracked(() => store.hydrate(data));
        // Write the new layout now; the old key is left in place as a snapshot.
        saveJSON(key, store.serialize());
        return;
    }
}

// --- Browser storage: mirror ----------------------------------------------------

const LOCAL_DEBOUNCE_MS = 300;
const pendingSaves = new Map(); // store id -> { entry, store }
let saveTimer = null;

function scheduleLocalSave(entry, store) {
    pendingSaves.set(entry.id, { entry, store });
    if (!saveTimer) saveTimer = setTimeout(flushLocalSaves, LOCAL_DEBOUNCE_MS);
}

/** Write every store with a pending change to browser storage now. */
export function flushLocalSaves() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    for (const { entry, store } of pendingSaves.values()) {
        saveJSON(keyOf(entry), store.serialize());
    }
    pendingSaves.clear();
}

// --- Wiring ---------------------------------------------------------------------

const started = new WeakSet();

/**
 * Load every persisted store from browser storage and start tracking changes.
 * Call once, right after the Pinia instance is installed and before anything
 * renders. Safe to call again for the same instance (HMR).
 * @returns the stores, as `collectStores()` returns them
 */
export function initPersistence(pinia, { storage = globalThis.localStorage, keyPrefix = STORAGE_NS } = {}) {
    namespace = keyPrefix;
    const stores = collectStores(pinia);
    if (started.has(pinia)) return stores;
    started.add(pinia);

    // Detached: these watchers belong to the app, not to whatever component or
    // route happened to be active when persistence started.
    const scope = effectScope(true);

    for (const entry of PERSISTED_STORES) {
        const store = entry.use(pinia);
        if (entry.local && storage) loadLocal(store, entry, storage);

        // Watch what the store serializes, not its whole state: a store also holds
        // transient things (the direct snippets' `loaded` flag, the IIIF manifest
        // cache) that must not count as edits or every page load would dirty the
        // workspace.
        scope.run(() => {
            watch(() => store.serialize(), () => {
                noteChange(entry.id);
                if (entry.local) scheduleLocalSave(entry, store);
            }, { deep: true });
        });
    }

    if (typeof window !== 'undefined') {
        // The debounce must never lose the last edit when the tab goes away.
        window.addEventListener('pagehide', flushLocalSaves);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flushLocalSaves();
        });
    }
    return stores;
}
