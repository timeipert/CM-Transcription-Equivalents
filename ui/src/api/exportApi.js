/**
 * Export API for automated use (the Corpus Monodicum pipeline).
 *
 * The app is a static site, so the "API" is a small, versioned function on the page:
 *
 *     const result = await window.cmExportApi.exportSite({
 *         backups: [{ name: 'Aa-13.json', text: '<contents of a backup / manuscript file>' }],
 *         options: { publish: 'all', itemSnippets: false, neumeTable: false }
 *     })
 *     // result.zipBase64 = the same ZIP as Settings -> "Download static site"
 *
 * It imports the files exactly like Settings -> Import (overwriting), optionally marks the
 * imported manuscripts as published, runs the static-site export and returns the ZIP instead of downloading it.
 * No buttons, no dialogs: the contract below does not change when the UI does. Bump API_VERSION for breaking changes.
 *
 * options (all optional):
 *   publish       'file' (default) - publish only what the files mark as published
 *                 'all'            - publish every imported manuscript that has annotations
 *   only          array of source names to export (default: all published)
 *   itemSnippets  false = no per-item citation crops (default true) - much faster, line photos are kept
 *   neumeTable    false = no neumentabelle.* (default true)
 */
import { useDataManagement } from '../composables/useDataManagement'
import { exportStaticSite } from '../composables/useStaticExport'
import { usePersonalTablesStore } from '../stores/personalTables'

export const API_VERSION = 1

const PUBLISH_MODES = ['file', 'all']

export class ExportApiError extends Error {}

/** The minimal File lookalike the import code reads. */
export function fileLike(name, text) {
    return { name, text: async () => text }
}

export function normalizeOptions(options = {}) {
    const o = options || {}
    const publish = o.publish ?? 'file'
    if (!PUBLISH_MODES.includes(publish)) throw new ExportApiError(`options.publish must be one of ${PUBLISH_MODES.join(', ')}`)
    if (o.only != null && (!Array.isArray(o.only) || o.only.some(s => typeof s !== 'string'))) {
        throw new ExportApiError('options.only must be an array of source names')
    }
    return {
        publish,
        only: o.only ?? null,
        itemSnippets: o.itemSnippets ?? true,
        neumeTable: o.neumeTable ?? true
    }
}

export function normalizeBackups(backups) {
    if (!Array.isArray(backups) || backups.length === 0) throw new ExportApiError('backups must be a non-empty array')
    return backups.map((b, i) => {
        if (!b || typeof b.text !== 'string') throw new ExportApiError(`backups[${i}] needs a "text" string (the file contents)`)
        return fileLike(b.name || `backup-${i + 1}.json`, b.text)
    })
}

/** Blob -> base64 (chunked, so big ZIPs do not blow the call stack). */
export async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    return btoa(binary)
}

let running = false

/**
 * @param {{backups: {name?: string, text: string}[], options?: object, onProgress?: Function}} request
 * @param {object} [deps] injectable for tests
 */
export async function exportSite(request, deps = {}) {
    const dm = deps.dataManagement ?? useDataManagement()
    const tables = deps.tablesStore ?? usePersonalTablesStore()
    const runExport = deps.exportStaticSite ?? exportStaticSite
    if (running) throw new ExportApiError('an export is already running')
    running = true
    try {
        const files = normalizeBackups(request?.backups)
        const options = normalizeOptions(request?.options)

        const analyzed = await dm.analyzeImportFiles(files)
        const failed = analyzed.filter(a => !a.success)
        if (failed.length) throw new ExportApiError(failed.map(f => `${f.fileName}: ${f.error}`).join('; '))

        const imported = new Set()
        for (const a of analyzed) {
            if (a.isConfigOnly) continue
            const choices = {}
            for (const s of [...(a.newSources || []), ...(a.overlapSources || [])]) {
                choices[s.source] = 'overwrite'
                imported.add(s.source)
            }
            dm.executeImport(a.parsed, choices)
        }

        if (options.publish === 'all') {
            for (const t of tables.tables) {
                if (imported.has(t.source)) t.isPublished = true
            }
        }

        const progress = []
        const summary = await runExport(
            p => { progress.push(p); request.onProgress?.(p) },
            { only: options.only, itemSnippets: options.itemSnippets, neumeTable: options.neumeTable, download: false }
        )
        const { blob, ...counts } = summary
        return {
            apiVersion: API_VERSION,
            summary: counts,
            imported: [...imported],
            zipBase64: await blobToBase64(blob),
            bytes: blob.size
        }
    } finally {
        running = false
    }
}

/** Put the API on the page (called once from main.js). */
export function registerExportApi(target = globalThis) {
    target.cmExportApi = { apiVersion: API_VERSION, exportSite }
    return target.cmExportApi
}
