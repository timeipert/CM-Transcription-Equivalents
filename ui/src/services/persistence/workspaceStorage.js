/**
 * The workspace folder: load it, keep it saved, and never destroy what is in it.
 *
 * A bound folder holds
 *   workspace.json        settings, annotations, tables, pattern library, OMMR settings
 *   direct-snippets.json  the direct snippet collections (they carry images, so
 *                         they are written only when they change, not on every
 *                         annotation edit)
 *
 * Rules this service keeps, because the folder is often the only durable copy:
 *
 *   - A file that exists but cannot be read (corrupt, or written by a NEWER app)
 *     is never overwritten. The service goes read-only and says why.
 *   - A file that changed since this app last saw it (another tab, another
 *     computer, a text editor) is copied to workspace.backup-external.json
 *     before it is replaced.
 *   - A file in an older format is copied to workspace.pre-v<N>.json before it
 *     is upgraded.
 *   - Choosing a folder that already holds a workspace replaces what is in the
 *     app — after saving the displaced work into the folder.
 *   - Re-granting permission after a browser restart syncs instead of blindly
 *     writing the in-browser state over the file.
 *
 * All the environment (browser APIs, stores) is injected, so the whole thing
 * runs in tests against an in-memory folder.
 */

import { ref, watch, effectScope } from 'vue';
import { revisionOfAll, untracked } from './changeTracker';
import { SECTION_IDS } from './storeRegistry';
import {
    SCHEMA_VERSION, SchemaError, migrate, sanitizeData,
    buildCoreData, buildSettingsData, applyCoreData, applySettingsData, applyDirectData, workspaceFile
} from './workspaceSchema';
import {
    WORKSPACE_FILE, DIRECT_FILE, EXTERNAL_BACKUP_FILE,
    hasPermission, statFile, readTextFile, writeTextFile, writeTextFileIfAbsent
} from './workspaceFolder';

const ALL_IDS = [...SECTION_IDS.core, ...SECTION_IDS.direct];

/** A workspace file that exists but cannot be used. */
class FolderReadError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FolderReadError';
    }
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

/**
 * @param {Object} deps
 * @param {() => Object} deps.getStores        the stores, as workspaceSchema expects them
 * @param {(key: string) => Promise<any>} deps.getHandle    persisted folder handle
 * @param {(key: string, handle: any) => Promise<void>} deps.setHandle
 * @param {() => Promise<any>} deps.pickDirectory   shows the folder picker
 * @param {Storage} [deps.storage]             remembers what the file looked like when last synced
 * @param {Storage} [deps.session]             remembers "continue without a folder"
 * @param {boolean} deps.isSupported           whether the File System Access API exists
 * @param {string} [deps.keyPrefix]            prefix for the keys this service stores under (utils/storageNamespace.js)
 * @param {number} [deps.debounceMs=1500]
 */
export function createWorkspaceStorage(deps) {
    const { getStores, getHandle, setHandle, pickDirectory, storage, session, isSupported, keyPrefix = '', debounceMs = 1500 } = deps;
    const HANDLE_KEY = `${keyPrefix}workspaceDirHandle`;
    const SYNC_KEY = `${keyPrefix}workspaceSync_v1`;

    // --- Reactive state shown by the UI ---
    const folderName = ref('');
    const status = ref('idle'); // 'idle' | 'saving' | 'saved' | 'error'
    const lastError = ref(null);
    const lastSavedAt = ref(null);
    const notice = ref(''); // something worth telling the user that is not an error
    const readOnly = ref(false); // the folder's file cannot be used; saving is off
    const isStorageBypassed = ref(session?.getItem('workspace_bypassed') === 'true');

    let dir = null;
    let timer = null;
    let inflight = null;
    let again = false;
    let againForced = false;
    const saved = { core: -1, direct: -1 }; // revision of each section as last written/read

    let resolveInit;
    const initPromise = new Promise(resolve => { resolveInit = resolve; });

    // --- What the file looked like when we last synced with it ---
    // { folder, lastModified, savedAt, dirty }  `dirty`: edits made since that
    // never reached the file (permission lost, tab closed mid-debounce).
    let sync = readSync();

    function readSync() {
        try { return JSON.parse(storage?.getItem(SYNC_KEY) || '{}') || {}; } catch { return {}; }
    }
    function persistSync() {
        try { storage?.setItem(SYNC_KEY, JSON.stringify(sync)); } catch { /* not worth failing over */ }
    }

    const baseline = () => {
        saved.core = revisionOfAll(SECTION_IDS.core);
        saved.direct = revisionOfAll(SECTION_IDS.direct);
    };
    const invalidate = () => { saved.core = -1; saved.direct = -1; };

    // --- Building and applying ---

    function workspacePayload(stores) {
        return workspaceFile({
            label: stores.settings.backupLabel || 'Workspace',
            data: { ...buildCoreData(stores), ...buildSettingsData(stores) }
        });
    }

    function directPayload(stores) {
        return { schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), collections: stores.direct.serialize() };
    }

    /** `value` as JSON with object keys in a fixed order, so two equal states compare equal. */
    const canonical = value => JSON.stringify(value, (_, v) =>
        v && typeof v === 'object' && !Array.isArray(v)
            ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]]))
            : v);

    /**
     * Whether loading `incoming` would replace anything the app holds. A file only
     * replaces the parts it contains (and, of the settings, only the keys it has), so
     * only those are compared.
     */
    function wouldReplace(local, incoming) {
        const parts = ['personalTables', 'regions', 'regionItems', 'manualLines', 'iiifLinks'];
        if (parts.some(key => incoming[key] !== undefined && canonical(incoming[key]) !== canonical(local[key]))) return true;
        const settings = incoming.settings || {};
        return Object.keys(settings).some(key => canonical(settings[key]) !== canonical((local.settings || {})[key]));
    }

    /**
     * Save the app's current work into the folder before a load replaces it.
     * With `incoming` (the data about to be loaded) nothing is written if the app
     * already holds exactly that.
     * @returns {Promise<string|null>} the file name, or null if there was nothing to keep
     */
    async function snapshotLocalWork(incoming = null) {
        const stores = getStores();
        const hasWork = Object.keys(stores.annotations.regions).length > 0
            || stores.tables.tables.length > 0
            || (stores.direct.loaded && stores.direct.collections.length > 0);
        if (!hasWork) return null;
        const payload = workspacePayload(stores);
        if (incoming && !wouldReplace(payload.data, incoming)) return null;
        if (stores.direct.loaded && stores.direct.collections.length) payload.data.directSnippets = stores.direct.serialize();
        const name = `workspace.replaced-${stamp()}.json`;
        await writeTextFile(dir, name, JSON.stringify(payload));
        return name;
    }

    /**
     * Read, parse and upgrade workspace.json. Null if there is none. A file that
     * is corrupt or from a newer app throws FolderReadError — callers must not
     * write over it.
     */
    async function readWorkspaceFile() {
        const ws = await readTextFile(dir, WORKSPACE_FILE);
        if (!ws) return null;
        const parsed = parseJson(ws.text, WORKSPACE_FILE);
        let upgraded;
        try {
            upgraded = migrate(parsed);
        } catch (e) {
            if (e instanceof SchemaError) throw new FolderReadError(`${WORKSPACE_FILE}: ${e.message} It was left untouched.`);
            throw e;
        }
        if (!upgraded.json.data) {
            throw new FolderReadError(`${WORKSPACE_FILE} does not look like a workspace file. It was left untouched.`);
        }
        return { ws, ...upgraded };
    }

    /**
     * Keep the version of workspace.json that is about to be replaced. Only a
     * file we could read is replaced at all: one that is corrupt or newer than
     * this app throws instead, so it is never overwritten, backup or not.
     */
    async function keepExternalCopy() {
        const file = await readWorkspaceFile();
        if (!file) return;
        await writeTextFile(dir, EXTERNAL_BACKUP_FILE, file.ws.text);
        notice.value = `workspace.json had been changed outside this tab. The version it replaced is kept as ${EXTERNAL_BACKUP_FILE}.`;
    }

    function parseJson(text, fileName) {
        try { return JSON.parse(text); } catch (e) {
            throw new FolderReadError(`${fileName} is not valid JSON (${e.message}). It was left untouched; fix or rename it to continue.`);
        }
    }

    /** Replace the app's state with the folder's contents (the file wins). */
    async function loadFromFolder(source) {
        const { ws, json, from, notes } = await readWorkspaceFile();
        const { data, warnings } = sanitizeData(json.data);

        // Direct snippets: the dedicated file wins; older workspaces kept them inline.
        let directList = data.directSnippets;
        const direct = await readTextFile(dir, DIRECT_FILE);
        if (direct) {
            const dj = parseJson(direct.text, DIRECT_FILE);
            if (Array.isArray(dj?.collections)) directList = dj.collections;
        }

        if (from < SCHEMA_VERSION) await writeTextFileIfAbsent(dir, `workspace.pre-v${from}.json`, ws.text);
        // Loading the folder's workspace replaces what the app holds. Keep that aside when
        // it is work the folder does not have: when the user picked this folder, and the
        // first time this build meets a folder it was bound to by another version (there
        // is no record of the last sync, so nothing says which side is newer).
        const firstMeeting = sync.folder !== dir.name;
        const keptAs = source === 'choose'
            ? await snapshotLocalWork()
            : firstMeeting ? await snapshotLocalWork(data) : null;

        const stores = getStores();
        await untracked(async () => {
            applyCoreData(stores, data);
            applySettingsData(stores, data);
            await applyDirectData(stores, directList);
        });

        sync = { folder: dir.name, lastModified: ws.lastModified, savedAt: json.savedAt, dirty: false };
        persistSync();
        baseline();
        if (json.savedAt) lastSavedAt.value = new Date(json.savedAt).toLocaleTimeString();
        status.value = 'saved';
        lastError.value = null;

        // Write the new layout soon: an upgraded file, or direct snippets still inline.
        const inlineDirect = !direct && Array.isArray(directList);
        if (from < SCHEMA_VERSION) saved.core = -1;
        if (inlineDirect) saved.direct = -1;
        if (from < SCHEMA_VERSION || inlineDirect) scheduleSave(0);

        const messages = [...notes, ...warnings];
        if (keptAs) {
            messages.unshift(source === 'choose'
                ? `This folder already had a workspace, so it was loaded. What was in the app before is saved as ${keptAs}.`
                : `The folder's workspace was loaded. The app held different work, which is saved as ${keptAs} (Settings → Import brings it back).`);
        }
        if (messages.length) notice.value = messages.join(' ');
    }

    /**
     * Bring the app and the folder in line after (re)connecting.
     * @param {'startup'|'regrant'|'choose'} source
     */
    async function reconcile(source) {
        const ws = await statFile(dir, WORKSPACE_FILE);

        if (!ws) {
            // An empty folder: seed it with what the app has.
            sync = { folder: dir.name };
            invalidate();
            await writeNow({ force: true });
            return;
        }

        const sameFolder = sync.folder === dir.name;
        const unchanged = sameFolder && sync.lastModified === ws.lastModified;

        if (unchanged) {
            // The file is what we last saw; push edits that never reached it.
            if (sync.dirty) {
                invalidate();
                await writeNow({ force: true });
            } else {
                baseline();
                status.value = 'saved';
                lastError.value = null;
            }
            return;
        }

        if (sameFolder && sync.dirty) {
            // Edits here never reached the file AND the file changed elsewhere.
            // Both cannot be live: keep the other version aside and carry on here.
            await keepExternalCopy();
            invalidate();
            await writeNow({ force: true });
            return;
        }

        await loadFromFolder(source);
    }

    // --- Saving ---

    async function writeNow({ force = false } = {}) {
        if (!dir || readOnly.value) return;
        status.value = 'saving';
        lastError.value = null;

        try {
            if (!(await hasPermission(dir, false))) throw new Error('Permission lost. Please re-grant access.');
            const stores = getStores();

            // Replacing a file that changed under us would destroy that change.
            const current = await statFile(dir, WORKSPACE_FILE);
            if (current && current.lastModified !== sync.lastModified) await keepExternalCopy();

            const coreRev = revisionOfAll(SECTION_IDS.core);
            const directRev = revisionOfAll(SECTION_IDS.direct);

            if (force || coreRev !== saved.core) {
                const payload = workspacePayload(stores);
                const { lastModified } = await writeTextFile(dir, WORKSPACE_FILE, JSON.stringify(payload));
                sync = { folder: dir.name, lastModified, savedAt: payload.savedAt, dirty: sync.dirty };
                saved.core = coreRev;
            }
            // Never write the snippets before they have loaded: an autosave that
            // fires during startup would blank them in the folder.
            if (stores.direct.loaded && (force || directRev !== saved.direct)) {
                await writeTextFile(dir, DIRECT_FILE, JSON.stringify(directPayload(stores)));
                saved.direct = directRev;
            }

            // What is still pending: anything that changed while we were writing has
            // bumped a revision past what we just saved.
            sync.dirty = revisionOfAll(SECTION_IDS.core) !== saved.core
                || (stores.direct.loaded && revisionOfAll(SECTION_IDS.direct) !== saved.direct);
            persistSync();
            lastSavedAt.value = new Date().toLocaleTimeString();
            status.value = 'saved';
        } catch (e) {
            fail(e);
        }
    }

    /** Write the folder now. Overlapping calls are queued, never run side by side. */
    function saveWorkspace({ force = false } = {}) {
        if (!dir || readOnly.value) return Promise.resolve();
        if (inflight) {
            again = true;
            againForced = againForced || force;
            return inflight;
        }
        inflight = (async () => {
            try {
                let forced = force;
                do {
                    again = false;
                    await writeNow({ force: forced });
                    forced = againForced;
                    againForced = false;
                } while (again);
            } finally {
                inflight = null;
            }
        })();
        return inflight;
    }

    function scheduleSave(ms) {
        if (!dir || readOnly.value) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; saveWorkspace(); }, ms);
    }

    // This service outlives every component, so its watcher must not belong to
    // whichever component's effect scope happened to create it first: it would be
    // stopped when that component unmounts, silently turning autosave off.
    const scope = effectScope(true);
    scope.run(() => {
        watch(() => revisionOfAll(ALL_IDS), () => {
            if (!dir) return;
            if (!sync.dirty) { sync.dirty = true; persistSync(); }
            scheduleSave(debounceMs);
        });
    });

    // Closing the tab inside the debounce window would lose the last edits.
    const onBeforeUnload = e => {
        if (timer || inflight) { e.preventDefault(); e.returnValue = ''; }
    };
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', onBeforeUnload);

    // --- Connecting ---

    function fail(e) {
        console.error(e);
        lastError.value = e.message;
        status.value = 'error';
        // A file that exists but cannot be used must not be written over.
        if (e instanceof FolderReadError) readOnly.value = true;
    }

    /** Bind a folder handle that already has permission. */
    async function attachFolder(handle) {
        const previous = { dir, name: folderName.value, sync };
        dir = handle;
        folderName.value = handle.name;
        readOnly.value = false;
        // Picking the folder we are already synced with keeps what we know of its file.
        if (sync.folder !== handle.name) sync = { folder: handle.name };
        try {
            await reconcile('choose');
            await setHandle(HANDLE_KEY, handle);
        } catch (e) {
            // A folder whose workspace cannot be used must not replace a working one.
            dir = previous.dir;
            folderName.value = previous.name;
            sync = previous.sync;
            readOnly.value = false;
            console.error(e);
            lastError.value = e.message;
            status.value = 'error';
        }
    }

    async function chooseFolder() {
        if (!isSupported) {
            lastError.value = 'File System Access API is not supported in this browser.';
            status.value = 'error';
            return;
        }
        try {
            const handle = await pickDirectory();
            if (!(await hasPermission(handle, true))) throw new Error('Permission to read/write was denied.');
            await attachFolder(handle);
        } catch (e) {
            if (e?.name === 'AbortError') return; // the user closed the picker
            fail(e);
        }
    }

    async function reGrantPermission() {
        if (!dir) return;
        try {
            if (!(await hasPermission(dir, true))) throw new Error('Permission denied.');
            status.value = 'idle';
            lastError.value = null;
            await reconcile('regrant');
        } catch (e) {
            fail(e);
        }
    }

    async function restore() {
        if (!isSupported) { resolveInit(); return; }
        try {
            const handle = await getHandle(HANDLE_KEY);
            if (handle) {
                dir = handle;
                folderName.value = handle.name;
                if (await hasPermission(handle, false)) {
                    await reconcile('startup');
                } else {
                    status.value = 'error';
                    lastError.value = 'Permission needed to access your workspace folder.';
                }
            }
        } catch (e) {
            fail(e);
        } finally {
            resolveInit();
        }
    }

    function bypassStorage() {
        isStorageBypassed.value = true;
        session?.setItem('workspace_bypassed', 'true');
    }

    function dismissNotice() {
        notice.value = '';
    }

    function dispose() {
        scope.stop();
        if (timer) clearTimeout(timer);
        if (typeof window !== 'undefined') window.removeEventListener('beforeunload', onBeforeUnload);
    }

    restore();

    return {
        isSupported,
        folderName,
        status,
        lastError,
        lastSavedAt,
        notice,
        readOnly,
        isStorageBypassed,
        initPromise,
        bypassStorage,
        chooseFolder,
        attachFolder,
        saveWorkspace,
        reGrantPermission,
        dismissNotice,
        dispose
    };
}
