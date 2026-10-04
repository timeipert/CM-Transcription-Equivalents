/**
 * Minimal GitHub REST client for the monodi.app shared-repository contract.
 *
 * monodi.app stores its database as one commit tree: `settings.json`,
 * `sources/<id>.json`, `documents/<id>.json`, `notes/<docId>.json`. This client
 * reads and writes that exact layout using the same base64 blob encoding, so
 * the two apps operate on one repository without a server between them. It
 * intentionally speaks the REST API directly rather than pulling in Octokit,
 * whose bundle dwarfs the handful of endpoints in play here.
 *
 * The configuration object matches monodi's `monodi_github_config`
 * ({ token, owner, repo, branch }) and uses the same localStorage key. Browser
 * storage is per origin, though, and the two apps are served from different ones
 * (monodi.app, neume.monodi.app), so each app keeps its own copy of the
 * connection: it has to be entered once in each.
 */

import { saveJSON } from '../../utils/safeStorage';

const API_ROOT = 'https://api.github.com';
const CONFIG_KEY = 'monodi_github_config';

export function loadGithubConfig() {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function saveGithubConfig(config) {
    saveJSON(CONFIG_KEY, config);
}

function decodeContent(base64) {
    return decodeURIComponent(escape(atob(base64.replace(/\n/g, ''))));
}

/**
 * The repository cannot be read completely (a truncated file list). Syncing
 * anyway could look like data loss, so it stops with a message instead.
 */
export class UnsupportedLayoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedLayoutError';
    }
}

/** `manuscripts/<id>.json`, but not the notes chunks in `manuscripts/<id>/`. */
const BUNDLE_PATH = /^manuscripts\/[^/]+\.json$/;
const READ_CONCURRENCY = 6;
const TREE_BATCH_BYTES = 2 * 1024 * 1024;

/** The paths of the older layout. */
const isLegacyLayoutPath = path =>
    path === 'settings.json'
    || (/^(sources|documents|notes)\//.test(path) && path.endsWith('.json'));

export class GithubClient {
    constructor(config) {
        this.config = config;
    }

    get isConfigured() {
        return !!(this.config && this.config.token && this.config.owner && this.config.repo && this.config.branch);
    }

    async request(path, options = {}) {
        const res = await fetch(`${API_ROOT}${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${this.config.token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...options.headers
            }
        });

        if (!res.ok) {
            const error = new Error(`GitHub API ${res.status} for ${path}`);
            error.status = res.status;
            throw error;
        }
        return res.status === 204 ? null : res.json();
    }

    async testConnection() {
        try {
            const { owner, repo } = this.config;
            await this.request(`/repos/${owner}/${repo}`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Read the whole database. Returns null on transport failure and an empty
     * database when the branch does not exist yet, matching monodi's treatment of
     * a fresh repository.
     *
     * Two layouts are understood, and the result says which one it found:
     *
     *   'bundles'  one file per manuscript, `manuscripts/<source id>.json`, holding
     *              `{ source, documents }` (the notes sit in chunk files beside it,
     *              which this client never reads). monodi.app's current layout,
     *              and the one an empty repository gets.
     *   'files'    the older layout: `sources/`, `documents/`, `notes/`.
     *
     * Like monodi.app, a repository that has any `manuscripts/*.json` is read as
     * 'bundles'. `bundles` keeps each file as read, so a push can write it back
     * with only the source replaced.
     *
     * @returns {Promise<{ sources: any[], documents: any[], notes: Object, settings: any,
     *   layout: 'bundles'|'files', bundles: Object<string, any> } | null>}
     */
    async pullDatabase() {
        const { owner, repo, branch } = this.config;
        const empty = { sources: [], documents: [], notes: {}, settings: null, layout: 'bundles', bundles: {} };
        try {
            const tree = await this.request(
                `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
            );
            if (tree.truncated) {
                throw new UnsupportedLayoutError(
                    'This repository is too large to list in one request (GitHub truncated the file list), so a pull could be incomplete.'
                );
            }

            const all = (tree.tree || []).filter(item => item.type === 'blob' && item.path);
            const layout = all.some(item => BUNDLE_PATH.test(item.path)) ? 'bundles' : 'files';
            const db = { sources: [], documents: [], notes: {}, settings: null, layout, bundles: {} };

            // Only fetch what the layout defines; anything else in the repository is not ours to read.
            const wanted = all.filter(item => item.path === 'settings.json'
                || (layout === 'bundles' ? BUNDLE_PATH.test(item.path) : isLegacyLayoutPath(item.path)));

            await mapPool(wanted, READ_CONCURRENCY, async item => {
                const parsed = await this.readBlob(item.sha);
                if (item.path === 'settings.json') {
                    db.settings = parsed;
                } else if (layout === 'bundles') {
                    db.bundles[item.path] = parsed;
                    if (parsed && parsed.source) db.sources.push(parsed.source);
                    if (parsed && Array.isArray(parsed.documents)) db.documents.push(...parsed.documents);
                } else if (item.path.startsWith('sources/')) {
                    db.sources.push(parsed);
                } else if (item.path.startsWith('documents/')) {
                    db.documents.push(parsed);
                } else if (item.path.startsWith('notes/')) {
                    db.notes[item.path.slice('notes/'.length, -'.json'.length)] = parsed;
                }
            });

            return db;
        } catch (e) {
            if (e instanceof UnsupportedLayoutError) throw e;
            if (e.status === 404 || e.status === 409) return empty;
            return null;
        }
    }

    async readBlob(sha) {
        const { owner, repo } = this.config;
        const blob = await this.request(`/repos/${owner}/${repo}/git/blobs/${sha}`);
        return JSON.parse(decodeContent(blob.content));
    }

    /**
     * Write the database files in one commit on top of the branch's current tree.
     * Files that are not part of `db` are left as they are: the tree is built on
     * `base_tree` and nothing is sent with `sha: null`, so this never deletes (a
     * source removed here stays in the repository).
     *
     * In the 'bundles' layout only the manuscripts whose bundle actually changed
     * are written, and `settings.json` and the notes chunks are not touched.
     *
     * @param db a database as `pullDatabase()` returns it (with the edits applied)
     * @returns {Promise<{ sha: string, files: number }>} the commit (the current
     *   head, when there was nothing to write) and how many files it wrote
     */
    async pushDatabase(db, message) {
        const { owner, repo, branch } = this.config;
        const base = `/repos/${owner}/${repo}`;

        let parentSha;
        let baseTreeSha;
        try {
            const branchInfo = await this.request(`${base}/branches/${encodeURIComponent(branch)}`);
            parentSha = branchInfo.commit.sha;
            baseTreeSha = branchInfo.commit.commit.tree.sha;
        } catch (e) {
            if (e.status !== 404 && e.status !== 409) throw e;
        }

        const files = db.layout === 'files' ? this.legacyFiles(db) : this.bundleFiles(db);
        if (!files.length && parentSha) return { sha: parentSha, files: 0 };

        // A tree request carries its files inline, so send them in batches by size
        // rather than as one request that can be megabytes. Each batch builds on the last.
        let treeSha = baseTreeSha;
        for (const batch of batchBySize(files, TREE_BATCH_BYTES)) {
            const items = batch.map(f => ({ path: f.path, mode: '100644', type: 'blob', content: f.content }));
            const tree = await this.request(`${base}/git/trees`, {
                method: 'POST',
                body: JSON.stringify(treeSha ? { base_tree: treeSha, tree: items } : { tree: items })
            });
            treeSha = tree.sha;
        }

        const commit = await this.request(`${base}/git/commits`, {
            method: 'POST',
            body: JSON.stringify({ message, tree: treeSha, parents: parentSha ? [parentSha] : [] })
        });

        const ref = `refs/heads/${branch}`;
        if (parentSha) {
            // No `force`: if someone pushed since we read the head, this is refused
            // instead of discarding their commit.
            await this.request(`${base}/git/${ref}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
        } else {
            await this.request(`${base}/git/refs`, { method: 'POST', body: JSON.stringify({ ref, sha: commit.sha }) });
        }
        return { sha: commit.sha, files: files.length };
    }

    /** The bundles that differ from what was read: `[{ path, content }]`. */
    bundleFiles(db) {
        const files = [];
        for (const source of db.sources || []) {
            const path = `manuscripts/${source.id}.json`;
            const before = (db.bundles || {})[path];
            // Keep whatever else the bundle held; replace the source.
            const after = { ...before, source, documents: (before && before.documents) || [] };
            if (before && JSON.stringify(before) === JSON.stringify(after)) continue;
            files.push({ path, content: JSON.stringify(after) });
        }
        return files;
    }

    /** Every file of the older layout. */
    legacyFiles(db) {
        const files = [];
        const file = (path, value) => files.push({ path, content: JSON.stringify(value, null, 2) });

        if (db.settings) file('settings.json', db.settings);
        for (const source of db.sources || []) file(`sources/${source.id}.json`, source);
        for (const doc of db.documents || []) file(`documents/${doc.id}.json`, doc);
        for (const docId of Object.keys(db.notes || {})) file(`notes/${docId}.json`, db.notes[docId]);
        return files;
    }
}

/** Run `fn` over `items` with at most `limit` in flight; the first failure rejects. */
async function mapPool(items, limit, fn) {
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const item = items[next++];
            await fn(item);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Split files into runs of roughly `maxBytes` of content (a file bigger than that gets a run of its own). */
function batchBySize(files, maxBytes) {
    const batches = [];
    let current = [];
    let bytes = 0;
    for (const f of files) {
        const size = f.content.length;
        if (current.length && bytes + size > maxBytes) {
            batches.push(current);
            current = [];
            bytes = 0;
        }
        current.push(f);
        bytes += size;
    }
    if (current.length) batches.push(current);
    return batches;
}
