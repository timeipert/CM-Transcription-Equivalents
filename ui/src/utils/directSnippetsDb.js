/**
 * Storage for "direct snippet" collections.
 *
 * This deliberately lives in its own IndexedDB database rather than in a new
 * object store inside CMWorkspaceStorage. Adding a store there would require a
 * version bump, and an upgrade is blocked while any other tab still holds the
 * old version open — which hangs every caller awaiting the connection,
 * including the router's workspace guard. A separate database sidesteps that
 * entirely and can never break the existing caches.
 *
 * Snippets carry base64 image data, so this must not be localStorage.
 */

import { STORAGE_NS } from './storageNamespace';

const PLAIN_DB_NAME = 'CMDirectSnippets';
const DB_NAME = STORAGE_NS + PLAIN_DB_NAME;
const DB_VERSION = 1;
const STORE = 'collections';

const dbPromises = new Map();

function initDB(name = DB_NAME) {
    if (!dbPromises.has(name)) {
        const promise = new Promise((resolve, reject) => {
            // Never hang a caller on a stuck connection request.
            const timer = setTimeout(() => reject(
                new Error('Timed out opening the snippet database.')
            ), 8000);
            const settle = (fn) => (arg) => { clearTimeout(timer); fn(arg); };
            resolve = settle(resolve);
            reject = settle(reject);

            const request = indexedDB.open(name, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                // Let a future version upgrade in another tab proceed.
                db.onversionchange = () => db.close();
                resolve(db);
            };
            request.onblocked = () => reject(new Error(
                'The snippet database is open in another tab. Please reload the other tabs.'
            ));
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE);
                }
            };
        });
        // Never cache a failed attempt, so a retry can recover.
        promise.catch(() => { dbPromises.delete(name); });
        dbPromises.set(name, promise);
    }
    return dbPromises.get(name);
}

const KEY = 'all';

/** The stored collections, or undefined if this database has never held any. */
async function readCollections(name) {
    const db = await initDB(name);
    return new Promise((resolve) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : undefined);
        req.onerror = () => resolve(undefined);
    });
}

export async function loadCollections() {
    try {
        const own = await readCollections(DB_NAME);
        if (own !== undefined) return own;
        // First visit of a build with its own database: start from a copy of what
        // the unprefixed build stored, and fork from there (see storageNamespace.js).
        if (DB_NAME !== PLAIN_DB_NAME) {
            const plain = (await readCollections(PLAIN_DB_NAME)) || [];
            if (plain.length) await saveCollections(plain);
            return plain;
        }
        // The unprefixed build also picks up what the build once published under /next/ kept.
        const preview = (await readCollections('next:' + PLAIN_DB_NAME).catch(() => undefined)) || [];
        if (preview.length) await saveCollections(preview);
        return preview;
    } catch (e) {
        console.error('Could not load direct snippet collections', e);
        return [];
    }
}

export async function saveCollections(collections) {
    try {
        const db = await initDB();
        return await new Promise((resolve) => {
            const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(collections, KEY);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    } catch (e) {
        console.error('Could not save direct snippet collections', e);
        return false;
    }
}
