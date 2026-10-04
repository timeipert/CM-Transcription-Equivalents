/**
 * In-memory stand-ins for the browser APIs the persistence layer uses, so the
 * whole of it can be tested without a browser.
 */

/** A Storage (localStorage/sessionStorage) backed by a Map. */
export function createFakeStorage(initial = {}) {
    const map = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)]));
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: key => { map.delete(key); },
        clear: () => map.clear(),
        key: i => Array.from(map.keys())[i] ?? null,
        get length() { return map.size; },
        /** test helper: every key currently stored */
        keys: () => Array.from(map.keys())
    };
}

/**
 * A directory handle backed by a Map, with the same surface the workspace
 * service uses: getFileHandle / queryPermission / requestPermission.
 *
 * Writes only become visible on `close()`, like the real API, and every write
 * advances a fake clock so `lastModified` changes.
 */
export function createFakeFolder(name = 'workspace', files = {}) {
    const entries = new Map();
    let clock = 1000;
    const tick = () => ++clock;
    const notFound = () => Object.assign(new Error('A requested file or directory could not be found.'), { name: 'NotFoundError' });

    for (const [fileName, text] of Object.entries(files)) entries.set(fileName, { text, lastModified: tick() });

    let openWritables = 0;
    const dir = {
        kind: 'directory',
        name,
        permission: 'granted',
        async queryPermission() { return dir.permission; },
        async requestPermission() { dir.permission = 'granted'; return 'granted'; },
        async getFileHandle(fileName, { create = false } = {}) {
            if (!entries.has(fileName)) {
                if (!create) throw notFound();
                entries.set(fileName, { text: '', lastModified: tick() });
            }
            return {
                kind: 'file',
                name: fileName,
                async getFile() {
                    const f = entries.get(fileName);
                    return { lastModified: f.lastModified, size: f.text.length, text: async () => f.text };
                },
                async createWritable() {
                    let buffer = '';
                    openWritables++;
                    dir.maxConcurrentWrites = Math.max(dir.maxConcurrentWrites, openWritables);
                    return {
                        async write(chunk) { buffer += chunk; },
                        async close() {
                            entries.set(fileName, { text: buffer, lastModified: tick() });
                            dir.writes.push(fileName);
                            openWritables--;
                        }
                    };
                }
            };
        },

        // --- test helpers ---
        /** Names of the files written through createWritable(), in order. */
        writes: [],
        /** The most writes that were ever open at the same moment. */
        maxConcurrentWrites: 0,
        /** Replace a file's contents as if another program had written it. */
        put(fileName, text) { entries.set(fileName, { text, lastModified: tick() }); },
        read(fileName) { return entries.get(fileName)?.text; },
        readJson(fileName) { return JSON.parse(entries.get(fileName).text); },
        has(fileName) { return entries.has(fileName); },
        names() { return Array.from(entries.keys()).sort(); },
        remove(fileName) { entries.delete(fileName); }
    };
    return dir;
}

/** Let queued microtasks and Vue's scheduler flush. */
export async function settle(times = 4) {
    for (let i = 0; i < times; i++) await new Promise(resolve => setTimeout(resolve, 0));
}
