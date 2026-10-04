import { getActivePinia } from 'pinia';
import { getHandle, setHandle } from '../utils/idb';
import { collectStores } from '../services/persistence/storeRegistry';
import { createWorkspaceStorage } from '../services/persistence/workspaceStorage';
import { STORAGE_NS } from '../utils/storageNamespace';

let instance = null;

/**
 * The workspace-folder service, one per page.
 *
 * Everything it does — loading, autosaving, the safety copies — lives in
 * services/persistence/workspaceStorage.js; this only supplies the browser
 * environment. The returned object holds refs (`folderName`, `status`, …): a
 * template that reads `storage.status` sees the Ref, not its value, so
 * components destructure them into top-level bindings:
 *
 *     const { folderName, status } = useWorkspaceStorage();
 */
export function useWorkspaceStorage() {
    if (!instance) {
        instance = createWorkspaceStorage({
            getStores: () => collectStores(getActivePinia()),
            getHandle,
            setHandle,
            pickDirectory: () => window.showDirectoryPicker({ mode: 'readwrite' }),
            storage: localStorage,
            session: sessionStorage,
            isSupported: 'showDirectoryPicker' in window,
            keyPrefix: STORAGE_NS
        });
    }
    return instance;
}
