import { ref } from 'vue';

/**
 * localStorage writes that cannot throw out of a watcher.
 *
 * Browser storage has a quota of a few MB. A plain `setItem` that exceeds it
 * throws inside the store's persist watcher, the write is lost, and nothing in
 * the UI says so. Here a failure is recorded in `storageError` (shown by the
 * save-status pill) and cleared again by the next successful write of that key.
 */

/** { key, message } of the most recent failed write, or null. */
export const storageError = ref(null);

/** Write a string to localStorage; see `saveJSON`. */
export function saveText(key, text) {
    try {
        localStorage.setItem(key, text);
        if (storageError.value?.key === key) storageError.value = null;
        return true;
    } catch (e) {
        const full = e && (e.name === 'QuotaExceededError' || e.code === 22);
        const message = full
            ? 'Browser storage is full; recent changes were not saved in this browser. Bind a workspace folder or export a backup.'
            : `Could not write to browser storage: ${e?.message || e}`;
        console.error(`saveText(${key}) failed`, e);
        storageError.value = { key, message };
        return false;
    }
}

export function saveJSON(key, value) {
    return saveText(key, JSON.stringify(value));
}
