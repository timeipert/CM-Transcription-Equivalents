/**
 * File access for the bound workspace folder (File System Access API).
 *
 * Only plumbing lives here: reading, writing, permissions. What goes into the
 * files, and when, is decided by workspaceStorage.js. Everything takes the
 * directory handle as an argument, so it can be exercised with an in-memory
 * stand-in.
 */

/** The workspace: settings, annotations, tables, library, OMMR settings. */
export const WORKSPACE_FILE = 'workspace.json';
/** The direct snippet collections, which carry images and so are written apart. */
export const DIRECT_FILE = 'direct-snippets.json';
/** The last version of workspace.json that was replaced after being changed elsewhere. */
export const EXTERNAL_BACKUP_FILE = 'workspace.backup-external.json';

const isNotFound = e => !!e && e.name === 'NotFoundError';

/**
 * Whether read/write access is currently granted.
 * @param {any} handle a FileSystemDirectoryHandle (the permission methods are not in the DOM typings)
 * @param {boolean} [request=false] ask the user if it is not (needs a user gesture)
 */
export async function hasPermission(handle, request = false) {
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    return request && (await handle.requestPermission(options)) === 'granted';
}

/**
 * Size and modification time of a file, without reading it. Null if it does not exist.
 * @returns {Promise<{ lastModified: number, size: number } | null>}
 */
export async function statFile(dir, name) {
    try {
        const file = await (await dir.getFileHandle(name)).getFile();
        return { lastModified: file.lastModified, size: file.size };
    } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
    }
}

/**
 * Read a text file. Null if it does not exist; any other failure is thrown, so a
 * file that exists but cannot be read is never mistaken for an empty folder.
 * @returns {Promise<{ text: string, lastModified: number } | null>}
 */
export async function readTextFile(dir, name) {
    try {
        const file = await (await dir.getFileHandle(name)).getFile();
        return { text: await file.text(), lastModified: file.lastModified };
    } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
    }
}

/**
 * Write a text file. The browser commits it atomically on close, so a failed
 * write leaves the previous contents intact.
 * @returns {Promise<{ lastModified: number }>} the file's modification time after the write
 */
export async function writeTextFile(dir, name, text) {
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    const file = await handle.getFile();
    return { lastModified: file.lastModified };
}

/** Write a file only if it does not exist yet. @returns whether it was written */
export async function writeTextFileIfAbsent(dir, name, text) {
    if (await statFile(dir, name)) return false;
    await writeTextFile(dir, name, text);
    return true;
}
