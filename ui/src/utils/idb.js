// Lightweight IndexedDB wrapper for storing File System Access handles and IIIF caches
const DB_NAME = 'CMWorkspaceStorage';
const DB_VERSION = 2;

let dbPromise = null;

// A connection request that neither succeeds nor fires an event leaves every
// awaiting caller hanging — including the router's workspace guard, which would
// leave the app rendering nothing at all. Fail loudly instead of hanging.
const OPEN_TIMEOUT_MS = 8000;

/**
 * Open the database at whatever version it already has.
 *
 * Needed when the stored database is NEWER than DB_VERSION — opening with a
 * lower version throws VersionError. That happens to anyone who ran a build
 * that had bumped the version, and would otherwise brick their local data.
 * The stores we use already exist in that case, so opening version-less is safe.
 */
function openAtExistingVersion() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            resolve(db);
        };
        request.onblocked = () => reject(new Error('Database blocked by another tab.'));
    });
}

function initDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(
                new Error('Timed out opening the local database. Close other tabs of this app and reload.')
            ), OPEN_TIMEOUT_MS);
            const settle = (fn) => (arg) => { clearTimeout(timer); fn(arg); };
            resolve = settle(resolve);
            reject = settle(reject);

            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => {
                // A database left at a higher version by a newer/experimental build
                // must not lock the user out of their own data.
                if (request.error && request.error.name === 'VersionError') {
                    openAtExistingVersion().then(resolve, reject);
                    return;
                }
                reject(request.error);
            };
            request.onsuccess = (e) => {
                const db = request.result;
                // If another tab later opens a newer version, close this connection
                // so its upgrade is not blocked (which would hang that tab).
                db.onversionchange = () => db.close();
                resolve(db);
            };
            // An older tab still holding the DB open blocks the upgrade. Without
            // this handler the promise would never settle and every caller that
            // awaits it (including the router's workspace guard) would hang.
            request.onblocked = () => {
                reject(new Error(
                    'The local database is open in another tab running an older version. ' +
                    'Please close or reload the other tabs and retry.'
                ));
            };
            request.onupgradeneeded = (e) => {
                const db = request.result;
                if (!db.objectStoreNames.contains('handles')) {
                    db.createObjectStore('handles');
                }
                if (!db.objectStoreNames.contains('manifests')) {
                    db.createObjectStore('manifests');
                }
                if (!db.objectStoreNames.contains('images')) {
                    db.createObjectStore('images');
                }
            };
        });
        // Don't cache a failed attempt: once the blocking tab closes, a retry
        // should be able to succeed.
        dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
}

export async function getCachedItem(storeName, key) {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

export async function setCachedItem(storeName, key, value) {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(value, key);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    } catch {
        return false;
    }
}

export async function deleteCachedItem(storeName, key) {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readwrite');
            const req = tx.objectStore(storeName).delete(key);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    } catch {
        return false;
    }
}

export async function clearStore(storeName) {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readwrite');
            const req = tx.objectStore(storeName).clear();
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    } catch {
        return false;
    }
}

export async function getHandle(key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readonly');
        const store = tx.objectStore('handles');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function setHandle(key, value) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        const store = tx.objectStore('handles');
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function deleteHandle(key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        const store = tx.objectStore('handles');
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}
