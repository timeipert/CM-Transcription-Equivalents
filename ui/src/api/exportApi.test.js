import { describe, it, expect, vi } from 'vitest'
import { exportSite, normalizeOptions, normalizeBackups, blobToBase64, registerExportApi, ExportApiError, API_VERSION } from './exportApi'

function deps({ analyzed, tables = [], exported } = {}) {
    const executed = []
    return {
        executed,
        dataManagement: {
            analyzeImportFiles: vi.fn(async files => analyzed ?? files.map(f => ({
                success: true, fileName: f.name, parsed: { name: f.name }, newSources: [{ source: 'Aa 13' }], overlapSources: [{ source: 'Ba 12' }]
            }))),
            executeImport: vi.fn((parsed, choices) => executed.push({ parsed, choices }))
        },
        tablesStore: { tables },
        exportStaticSite: exported ?? vi.fn(async (onProgress, options) => {
            onProgress({ phase: 'source', message: 'x' })
            return { sources: 1, snippets: 3, failures: 0, blob: new Blob([new Uint8Array([80, 75, 3, 4])]) }
        })
    }
}

const backups = [{ name: 'a.json', text: '{}' }]

describe('options and request validation', () => {
    it('has safe defaults', () => {
        expect(normalizeOptions()).toEqual({ publish: 'file', only: null, itemSnippets: true, neumeTable: true })
        expect(normalizeOptions({ publish: 'all', itemSnippets: false, neumeTable: false, only: ['Aa 13'] }))
            .toEqual({ publish: 'all', only: ['Aa 13'], itemSnippets: false, neumeTable: false })
    })
    it('rejects bad options and backups', () => {
        expect(() => normalizeOptions({ publish: 'everything' })).toThrow(ExportApiError)
        expect(() => normalizeOptions({ only: 'Aa 13' })).toThrow(/array/)
        expect(() => normalizeBackups([])).toThrow(/non-empty/)
        expect(() => normalizeBackups([{ name: 'x' }])).toThrow(/text/)
    })
    it('wraps backups like files', async () => {
        const [f] = normalizeBackups([{ text: '{"a":1}' }])
        expect(f.name).toBe('backup-1.json')
        expect(await f.text()).toBe('{"a":1}')
    })
})

describe('exportSite', () => {
    it('imports with overwrite, marks only the imported sources as published and returns the zip', async () => {
        const tables = [{ source: 'Aa 13' }, { source: 'Ba 12' }, { source: 'Other 1' }]
        const d = deps({ tables })
        const r = await exportSite({ backups, options: { publish: 'all', itemSnippets: false, neumeTable: false } }, d)
        expect(d.executed[0].choices).toEqual({ 'Aa 13': 'overwrite', 'Ba 12': 'overwrite' })
        expect(tables.map(t => !!t.isPublished)).toEqual([true, true, false])
        expect(d.exportStaticSite).toHaveBeenCalledWith(expect.any(Function), { only: null, itemSnippets: false, neumeTable: false, download: false })
        expect(r).toMatchObject({ apiVersion: API_VERSION, summary: { sources: 1, snippets: 3, failures: 0 }, imported: ['Aa 13', 'Ba 12'], bytes: 4 })
        expect(r.zipBase64).toBe('UEsDBA==')
    })

    it('leaves the published flags alone in the default mode', async () => {
        const tables = [{ source: 'Aa 13' }]
        await exportSite({ backups }, deps({ tables }))
        expect(tables[0].isPublished).toBeUndefined()
    })

    it('passes the progress through', async () => {
        const seen = []
        await exportSite({ backups, onProgress: p => seen.push(p.phase) }, deps())
        expect(seen).toEqual(['source'])
    })

    it('stops with a readable message when a file cannot be read, importing nothing', async () => {
        const d = deps({ analyzed: [{ success: false, fileName: 'bad.json', error: 'Failed to parse JSON file' }] })
        await expect(exportSite({ backups }, d)).rejects.toThrow('bad.json: Failed to parse JSON file')
        expect(d.dataManagement.executeImport).not.toHaveBeenCalled()
    })

    it('skips configuration-only files and does not publish anything for them', async () => {
        const d = deps({ analyzed: [{ success: true, isConfigOnly: true, fileName: 'c.json', parsed: {} }] })
        const r = await exportSite({ backups, options: { publish: 'all' } }, d)
        expect(d.executed).toEqual([])
        expect(r.imported).toEqual([])
    })

    it('allows only one export at a time and recovers afterwards', async () => {
        let release
        const slow = deps({ exported: () => new Promise(res => { release = () => res({ sources: 0, snippets: 0, failures: 0, blob: new Blob([]) }) }) })
        const first = exportSite({ backups }, slow)
        await new Promise(r => setTimeout(r, 0))
        await expect(exportSite({ backups }, deps())).rejects.toThrow(/already running/)
        release()
        await first
        await expect(exportSite({ backups }, deps())).resolves.toBeTruthy()
    })

    it('reports failures of the export itself and frees the lock', async () => {
        await expect(exportSite({ backups }, deps({ exported: async () => { throw new Error('No published manuscripts') } }))).rejects.toThrow('No published')
        await expect(exportSite({ backups }, deps())).resolves.toBeTruthy()
    })
})

describe('plumbing', () => {
    it('encodes big blobs without overflowing the stack', async () => {
        const big = new Blob([new Uint8Array(300_000).fill(65)])
        const b64 = await blobToBase64(big)
        expect(atob(b64).length).toBe(300_000)
    })
    it('registers itself on the page', () => {
        const page = {}
        registerExportApi(page)
        expect(page.cmExportApi.apiVersion).toBe(API_VERSION)
        expect(typeof page.cmExportApi.exportSite).toBe('function')
    })
})
