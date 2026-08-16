import { ref, watch } from 'vue';
import { getHandle, setHandle, deleteHandle } from '../utils/idb';
import { useSettingsStore } from '../stores/settings';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useIiifStore } from '../stores/iiif';

const SCHEMA_VERSION = 1;
const HANDLE_KEY = 'workspaceDirHandle';

const isSupported = 'showDirectoryPicker' in window;
const folderName = ref('');
const status = ref('idle'); // 'idle' | 'saving' | 'saved' | 'error'
const lastError = ref(null);
const lastSavedAt = ref(null);
const isStorageBypassed = ref(sessionStorage.getItem('workspace_bypassed') === 'true');

let directoryHandle = null;
let saveTimeout = null;
let isHydrating = false;
let isInitialized = false;

let _resolveInit;
const initPromise = new Promise(resolve => {
    _resolveInit = resolve;
});

function bypassStorage() {
    isStorageBypassed.value = true;
    sessionStorage.setItem('workspace_bypassed', 'true');
}

export function useWorkspaceStorage() {
    const settings = useSettingsStore();
    const annotStore = useAnnotationsStore();
    const tablesStore = usePersonalTablesStore();
    const iiifStore = useIiifStore();


    // Retrieve full app state as an object compatible with data management schema
    function serializeState() {
        return {
            schemaVersion: SCHEMA_VERSION,
            savedAt: new Date().toISOString(),
            label: settings.backupLabel || 'Workspace',
            data: {
                personalTables: tablesStore.tables,
                annotations: annotStore.annotations,
                regions: annotStore.regions,
                regionItems: annotStore.regionItems,
                manualLines: annotStore.manualLines,
                settings: {
                    globalDisplayIds: settings.globalDisplayIds,
                    autoFillIds: settings.autoFillIds,
                    displayMode: settings.displayMode,
                    snippetSize: settings.snippetSize,
                    snippetPadding: settings.snippetPadding,
                    backupLabel: settings.backupLabel,
                    sourceAlignments: settings.sourceAlignments,
                    neumeNames: settings.neumeNames
                },
                iiifLinks: iiifStore.links
            }
        };
    }

    // Hydrate stores from the loaded state
    function hydrateState(payload) {
        if (!payload) return;
        
        // Backwards compatibility for older workspace files
        if (payload.version && payload.content && !payload.schemaVersion) {
            payload.schemaVersion = payload.version;
            payload.data = payload.content;
        }
        
        if (!payload.data) return;
        isHydrating = true; // Prevent autosave from triggering during load
        const d = payload.data;
        
        if (d.personalTables) tablesStore.tables = d.personalTables;
        if (d.annotations) annotStore.annotations = d.annotations;
        if (d.regions) annotStore.regions = d.regions;
        if (d.regionItems) annotStore.regionItems = d.regionItems;
        if (d.manualLines) annotStore.manualLines = d.manualLines;
        if (d.iiifLinks) iiifStore.links = d.iiifLinks;
        
        if (d.settings) {
            if (d.settings.globalDisplayIds) settings.globalDisplayIds = d.settings.globalDisplayIds;
            if (d.settings.autoFillIds !== undefined) settings.autoFillIds = d.settings.autoFillIds;
            if (d.settings.displayMode) settings.displayMode = d.settings.displayMode;
            if (d.settings.snippetSize) settings.snippetSize = d.settings.snippetSize;
            if (d.settings.snippetPadding) settings.snippetPadding = d.settings.snippetPadding;
            if (d.settings.backupLabel) settings.backupLabel = d.settings.backupLabel;
            if (d.settings.sourceAlignments) settings.sourceAlignments = d.settings.sourceAlignments;
            if (d.settings.neumeNames) settings.neumeNames = d.settings.neumeNames;
        }

        if (payload.savedAt) {
            lastSavedAt.value = new Date(payload.savedAt).toLocaleTimeString();
        }

        setTimeout(() => isHydrating = false, 100); // Re-enable autosave after next tick
    }

    async function verifyPermission(handle, withRequest = false) {
        const options = { mode: 'readwrite' };
        if (await handle.queryPermission(options) === 'granted') {
            return true;
        }
        if (withRequest && await handle.requestPermission(options) === 'granted') {
            return true;
        }
        return false;
    }

    async function chooseFolder() {
        if (!isSupported) {
            lastError.value = "File System Access API is not supported in this browser.";
            status.value = 'error';
            return;
        }

        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            if (await verifyPermission(handle, true)) {
                directoryHandle = handle;
                folderName.value = handle.name;
                await setHandle(HANDLE_KEY, handle);
                
                // Read existing workspace if any, otherwise save current state
                try {
                    const fileHandle = await directoryHandle.getFileHandle('workspace.json');
                    const file = await fileHandle.getFile();
                    const text = await file.text();
                    const payload = JSON.parse(text);
                    hydrateState(payload);
                    status.value = 'saved';
                } catch (e) {
                    // File doesn't exist or is invalid, just save current
                    await saveWorkspace();
                }
            } else {
                throw new Error("Permission to read/write was denied.");
            }
        } catch (e) {
            console.error(e);
            lastError.value = e.message;
            status.value = 'error';
        }
    }
    
    async function reGrantPermission() {
        if (!directoryHandle) return;
        try {
            if (await verifyPermission(directoryHandle, true)) {
                status.value = 'idle';
                lastError.value = null;
                // Attempt a save or load depending on state. Let's just save.
                await saveWorkspace();
            } else {
                throw new Error("Permission denied.");
            }
        } catch (e) {
            lastError.value = e.message;
            status.value = 'error';
        }
    }

    async function saveWorkspace() {
        if (!directoryHandle) return;
        if (isHydrating) return;
        
        status.value = 'saving';
        lastError.value = null;

        try {
            if (!(await verifyPermission(directoryHandle, false))) {
                throw new Error("Permission lost. Please re-grant access.");
            }

            const state = serializeState();
            const json = JSON.stringify(state, null, 2);

            const fileHandle = await directoryHandle.getFileHandle('workspace.json', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(json);
            await writable.close();

            lastSavedAt.value = new Date().toLocaleTimeString();
            status.value = 'saved';
        } catch (e) {
            console.error("Save failed", e);
            lastError.value = e.message;
            status.value = 'error';
        }
    }

    function triggerAutosave() {
        if (isHydrating || !directoryHandle) return;
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveWorkspace();
        }, 1500);
    }

    // Initialization
    if (!isInitialized) {
        isInitialized = true;
        
        // Set up reactive watchers for autosave
        watch(
            [
                () => settings.$state,
                () => annotStore.$state,
                () => tablesStore.$state,
                () => iiifStore.$state
            ],
            () => {
                triggerAutosave();
            },
            { deep: true }
        );

        (async () => {
            if (!isSupported) {
                _resolveInit();
                return;
            }
            try {
                const handle = await getHandle(HANDLE_KEY);
                if (handle) {
                    directoryHandle = handle;
                    folderName.value = handle.name;
                    // Check if we have permission right away (unlikely on fresh load, but possible)
                    if (await verifyPermission(handle, false)) {
                        // Load it
                        const fileHandle = await directoryHandle.getFileHandle('workspace.json');
                        const file = await fileHandle.getFile();
                        const text = await file.text();
                        hydrateState(JSON.parse(text));
                        status.value = 'saved';
                    } else {
                        status.value = 'error';
                        lastError.value = "Permission needed to access your workspace folder.";
                    }
                }
            } catch (e) {
                console.error("Failed to restore handle", e);
            } finally {
                _resolveInit();
            }
        })();
    }

    return {
        isSupported,
        folderName,
        status,
        lastError,
        lastSavedAt,
        isStorageBypassed,
        initPromise,
        bypassStorage,
        chooseFolder,
        saveWorkspace,
        reGrantPermission
    };
}
