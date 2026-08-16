// Lightweight IndexedDB wrapper for storing File System Access handles and IIIF caches
const DB_NAME = 'CMWorkspaceStorage';
const DB_VERSION = 2;

let dbPromise = null;

function initDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (e) => reject(request.error);
            request.onsuccess = (e) => resolve(request.result);
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
