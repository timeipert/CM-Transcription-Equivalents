import { describe, it, expect } from 'vitest';
import { createDefaultPipeline, DataPipelineService } from './dataPipeline';
import { mergeDatasets, toWorkspaceState, createDataset, createSource } from './normalizedModel';
import { monodiBackupAdapter } from './adapters/monodiBackupAdapter';
import { legacyStaticAdapter } from './adapters/legacyStaticAdapter';
import { monodiGithubAdapter } from './adapters/monodiGithubAdapter';
import { ommr4allAdapter } from './adapters/ommr4allAdapter';

const monodiDb = {
    sources: [{
        id: 'src-1',
        quellensigle: 'Aa 13',
        herkunftsort: 'Reichenau',
        datierung: 's. XI',
        iiifManifestUrl: 'https://example.org/manifest.json',
        equivalents: [{ pattern: '*u', refId: '12', notes: 'clivis' }],
        annotationRegions: [{ id: 'r1', name: 'line 1', points: '0,0 1,1', folio: '1r' }],
        annotationItems: [{ id: 'i1', regionId: 'r1', pattern: '*u', variant: 'a', points: '0,0' }]
    }],
    documents: [{
        id: 'd1', quelle_id: 'src-1', dokumenten_id: 'DOC1',
        gattung1: 'Antiphon', festtag: 'Nativitas', textinitium: 'Puer natus est'
    }],
    notes: {},
    settings: { pdfScale: 1 }
};

const backupFile = {
    schemaVersion: 1,
    type: 'cm-workspace-backup',
    data: {
        personalTables: [{ source: 'Aa 13', rows: [{ pattern: '*u', customId: '12', notes: '' }] }],
        iiifLinks: { 'Aa 13': 'https://example.org/manifest.json' },
        regions: { 'Aa 13_1r': [{ id: 'r1', name: 'line 1', points: '0,0 1,1' }] },
        regionItems: { r1: [{ id: 'i1', pattern: '*u', variant: 'a', points: '0,0' }] },
        settings: { sourceMeta: { 'Aa 13': { place: 'Reichenau' } } }
    }
};

const legacyIndex = {
    stats: { '*u': 4 },
    glyphs: { '*u': '<svg/>' },
    overallMax: 4,
    manifests: { 'Aa 13': { url: 'https://example.org/manifest.json' } },
    sourceFolios: { 'Aa 13': ['1r', '1v'] }
};

describe('adapter detection', () => {
    const pipeline = createDefaultPipeline();

    it('routes a monodi database to the github adapter', () => {
        expect(pipeline.adapterFor(monodiDb).id).toBe('monodi-github');
    });

    it('routes a backup envelope to the backup adapter', () => {
        expect(pipeline.adapterFor(backupFile).id).toBe('monodi-backup');
    });

    it('routes the static index to the legacy adapter', () => {
        expect(pipeline.adapterFor(legacyIndex).id).toBe('legacy-static');
    });

    it('routes an OMMR export to the ommr adapter', () => {
        const input = { source: 'Aa 13', folios: {} };
        expect(pipeline.adapterFor(input).id).toBe('ommr4all');
    });

    it('rejects an unknown payload', () => {
        expect(pipeline.adapterFor({ foo: 'bar' })).toBeNull();
    });
});

describe('monodiGithubAdapter', () => {
    it('normalizes sources, metadata and attached documents', async () => {
        const dataset = await monodiGithubAdapter.ingest(monodiDb);
        expect(dataset.sources).toHaveLength(1);
        const [source] = dataset.sources;
        expect(source.id).toBe('Aa 13');
        expect(source.metadata.place).toBe('Reichenau');
        expect(source.metadata.date).toBe('s. XI');
        expect(source.equivalents[0]).toEqual({ pattern: '*u', refId: '12', notes: 'clivis' });
        expect(source.items[0].variant).toBe('a');
        expect(source.documents[0].initium).toBe('Puer natus est');
        expect(source.documents[0].feast).toBe('Nativitas');
    });
});

describe('monodiBackupAdapter', () => {
    it('normalizes the store-native backup layout', async () => {
        const dataset = await monodiBackupAdapter.ingest(backupFile);
        const [source] = dataset.sources;
        expect(source.id).toBe('Aa 13');
        expect(source.equivalents[0].refId).toBe('12');
        expect(source.regions[0].folio).toBe('1r');
        expect(source.items[0].regionId).toBe('r1');
        expect(source.metadata.place).toBe('Reichenau');
    });

    it('accepts the legacy version/content envelope', () => {
        expect(monodiBackupAdapter.detect({ version: 1, content: {} })).toBe(true);
    });

    it('splits a source id that contains underscores', async () => {
        const file = {
            schemaVersion: 1,
            data: {
                personalTables: [{ source: 'Pa_lat_776', rows: [] }],
                regions: { 'Pa_lat_776_23r': [{ id: 'r9', points: '' }] },
                regionItems: {}
            }
        };
        const dataset = await monodiBackupAdapter.ingest(file);
        const source = dataset.sources.find(s => s.id === 'Pa_lat_776');
        expect(source.regions[0].folio).toBe('23r');
    });

    it('keeps the unassigned holding regions out of the shared database', async () => {
        const file = {
            schemaVersion: 2,
            data: {
                personalTables: [{ source: 'Aa 13', rows: [] }],
                regions: {
                    'Aa 13_1r': [
                        { id: 'r1', name: 'line 1', points: '0,0 1,1' },
                        { id: 'r_unassigned_Aa 13_1r', name: 'Unassigned', points: '0,0 100,100', unassigned: true }
                    ]
                },
                regionItems: {
                    r1: [{ id: 'i1', pattern: '*u', points: '0,0' }],
                    'r_unassigned_Aa 13_1r': [{ id: 'i2', pattern: '*u', points: '5,5' }]
                }
            }
        };
        const dataset = await monodiBackupAdapter.ingest(file);
        const source = dataset.sources.find(s => s.id === 'Aa 13');
        expect(source.regions.map(r => r.id)).toEqual(['r1']);
        expect(source.items.map(i => i.id)).toEqual(['i1']);
        expect(dataset.warnings.join(' ')).toMatch(/1 snippet/);
    });
});

describe('legacyStaticAdapter', () => {
    it('builds a source directory with manifests and keeps stats aside', async () => {
        const dataset = await legacyStaticAdapter.ingest(legacyIndex);
        expect(dataset.sources).toHaveLength(1);
        expect(dataset.sources[0].iiifManifestUrl).toBe('https://example.org/manifest.json');
        expect(dataset.stats['*u']).toBe(4);
    });
});

describe('ommr4allAdapter', () => {
    it('turns staff lines into regions and neumes into items', async () => {
        const pcgts = {
            page: {
                imageWidth: 1000,
                imageHeight: 1400,
                blocks: [{
                    lines: [{
                        id: 'line-1',
                        symbols: [
                            { type: 'note', graphicalConnection: 2, positionInStaff: 3, coord: '0.1,0.2' },
                            { type: 'note', graphicalConnection: 1, positionInStaff: 4, coord: '0.12,0.18' }
                        ]
                    }]
                }]
            }
        };
        const dataset = await ommr4allAdapter.ingest({ source: 'Aa 13', folios: { '1r': pcgts } });
        const [source] = dataset.sources;
        expect(source.regions.length).toBeGreaterThan(0);
        expect(source.regions[0].folio).toBe('1r');
        expect(source.items.length).toBeGreaterThan(0);
        expect(source.items[0].regionId).toBe('line-1');
    });
});

describe('mergeDatasets', () => {
    it('combines sources sharing an id, earlier fields winning', () => {
        const a = createDataset('a');
        a.sources.push(createSource('S', { metadata: { place: 'X' }, equivalents: [{ pattern: '*u', refId: '1' }] }));
        const b = createDataset('b');
        b.sources.push(createSource('S', { metadata: { place: 'Y', date: 's. XI' }, equivalents: [{ pattern: '*d', refId: '2' }] }));

        const merged = mergeDatasets([a, b]);
        expect(merged.sources).toHaveLength(1);
        expect(merged.sources[0].metadata.place).toBe('X');
        expect(merged.sources[0].metadata.date).toBe('s. XI');
        expect(merged.sources[0].equivalents).toHaveLength(2);
    });
});

describe('toWorkspaceState', () => {
    it('projects a dataset onto the store-native shape', async () => {
        const dataset = await monodiGithubAdapter.ingest(monodiDb);
        const state = toWorkspaceState(dataset);
        expect(state.iiifLinks['Aa 13']).toBe('https://example.org/manifest.json');
        expect(state.personalTables[0].rows[0].customId).toBe('12');
        expect(state.regions['Aa 13_1r']).toHaveLength(1);
        expect(state.regionItems.r1[0].pattern).toBe('*u');
        expect(state.sourceMeta['Aa 13'].place).toBe('Reichenau');
    });
});

describe('hint forces an adapter', () => {
    it('bypasses detection when told which format it is', async () => {
        const pipeline = new DataPipelineService([monodiGithubAdapter, monodiBackupAdapter]);
        const dataset = await pipeline.ingest(monodiDb, 'monodi-github');
        expect(dataset.origin).toBe('monodi-github');
    });
});
