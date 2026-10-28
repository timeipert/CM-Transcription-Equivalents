/**
 * The files a person drops or picks for import, as a flat list of JSON files.
 *
 * A ZIP (for example one made by Settings → Export with "one file per item") is
 * opened and each `.json` file in it becomes an entry of its own, named
 * `archive.zip › path/in/archive.json`. Other files are reported as skipped.
 * Every entry has the shape `analyzeImportFiles` reads: `{ name, text() }`.
 */

const isZip = file => /\.zip$/i.test(file?.name || '') || file?.type === 'application/zip' || file?.type === 'application/x-zip-compressed';
const isJson = name => /\.json$/i.test(name || '');

/**
 * @param {FileList|File[]|{ name: string, text: () => Promise<string>, arrayBuffer?: () => Promise<ArrayBuffer> }[]} input
 * @param {{ loadZip?: (data: ArrayBuffer) => Promise<any> }} [deps] injectable for tests
 * @returns {Promise<{ files: { name: string, text: () => Promise<string> }[], skipped: { name: string, reason: string }[] }>}
 */
export async function expandImportFiles(input, deps = {}) {
    const list = Array.from(input || []);
    const files = [];
    const skipped = [];
    for (const file of list) {
        if (isZip(file)) {
            try {
                const loadZip = deps.loadZip ?? (async data => {
                    // Loaded on demand: the ZIP library is only needed when a ZIP is imported.
                    const { default: JSZip } = await import('jszip');
                    return JSZip.loadAsync(data);
                });
                const zip = await loadZip(await file.arrayBuffer());
                const entries = Object.values(zip.files)
                    .filter(e => !e.dir && isJson(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name))
                    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
                if (!entries.length) skipped.push({ name: file.name, reason: 'The ZIP holds no .json file.' });
                for (const entry of entries) {
                    files.push({ name: `${file.name} › ${entry.name}`, text: () => entry.async('string') });
                }
            } catch {
                skipped.push({ name: file.name, reason: 'The ZIP could not be opened.' });
            }
            continue;
        }
        if (isJson(file.name) || file.type === 'application/json') {
            files.push(file);
            continue;
        }
        skipped.push({ name: file.name, reason: 'Not a .json or .zip file.' });
    }
    return { files, skipped };
}
