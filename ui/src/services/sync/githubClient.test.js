import { describe, it, expect } from 'vitest';
import { GithubClient, UnsupportedLayoutError } from './githubClient';
import { GithubTransport } from './sharedDataChannel';
import { createSource, createDataset } from '../pipeline/normalizedModel';

const config = { token: 't', owner: 'o', repo: 'r', branch: 'main' };

const encode = value => ({ content: btoa(unescape(encodeURIComponent(JSON.stringify(value)))) });

/**
 * A client whose GitHub API is an in-memory repository: `files` is { path: json },
 * and every write is recorded.
 */
function clientOver(files, { truncated = false, headMoves = false } = {}) {
    const client = new GithubClient(config);
    const log = { fetched: [], trees: [], commits: [], refs: [] };
    client.request = async (path, options = {}) => {
        const method = options.method || 'GET';
        const body = options.body ? JSON.parse(options.body) : null;
        if (path.includes('/git/trees/')) {
            return { truncated, tree: Object.keys(files).map(p => ({ type: 'blob', path: p, sha: `sha:${p}` })) };
        }
        if (path.includes('/git/blobs/')) {
            const sha = path.split('/git/blobs/')[1];
            log.fetched.push(sha);
            return encode(files[sha.slice('sha:'.length)]);
        }
        if (path.includes('/branches/')) return { commit: { sha: 'head1', commit: { tree: { sha: 'tree0' } } } };
        if (path.endsWith('/git/trees') && method === 'POST') {
            log.trees.push(body);
            return { sha: `tree${log.trees.length}` };
        }
        if (path.endsWith('/git/commits') && method === 'POST') {
            log.commits.push(body);
            return { sha: 'commit1' };
        }
        if (path.includes('/git/refs') && method === 'PATCH') {
            if (headMoves) { const e = new Error('not a fast-forward'); e.status = 422; throw e; }
            log.refs.push(body);
            return {};
        }
        throw new Error(`unexpected request ${method} ${path}`);
    };
    return { client, log };
}

const written = log => log.trees.flatMap(t => t.tree.map(i => i.path));

describe('GithubClient.pullDatabase', () => {
    it('reads the older sources/documents/notes layout', async () => {
        const { client } = clientOver({
            'settings.json': { a: 1 },
            'sources/s1.json': { id: 's1' },
            'documents/d1.json': { id: 'd1' },
            'notes/d1.json': { n: 1 },
            'README.md': {}
        });
        const db = await client.pullDatabase();
        expect(db.layout).toBe('files');
        expect(db.settings).toEqual({ a: 1 });
        expect(db.sources).toEqual([{ id: 's1' }]);
        expect(db.documents).toEqual([{ id: 'd1' }]);
        expect(db.notes).toEqual({ d1: { n: 1 } });
    });

    it('reads the manuscripts/ bundles, and never the notes chunks beside them', async () => {
        const { client, log } = clientOver({
            'settings.json': { a: 1 },
            'manuscripts/Aa 13.json': { source: { id: 'Aa 13' }, documents: [{ id: 'd1' }, { id: 'd2' }] },
            'manuscripts/__unassigned__.json': { source: null, documents: [{ id: 'd3' }] },
            'manuscripts/Aa 13/notes-0000.json': { d1: { huge: true } },
            'sources/old.json': { id: 'old' }
        });
        const db = await client.pullDatabase();
        expect(db.layout).toBe('bundles');
        expect(db.sources).toEqual([{ id: 'Aa 13' }]);
        expect(db.documents.map(d => d.id).sort()).toEqual(['d1', 'd2', 'd3']);
        expect(Object.keys(db.bundles).sort()).toEqual(['manuscripts/Aa 13.json', 'manuscripts/__unassigned__.json']);
        expect(log.fetched).not.toContain('sha:manuscripts/Aa 13/notes-0000.json');
        expect(log.fetched).not.toContain('sha:sources/old.json');
    });

    it('fetches only the files of the layout it knows', async () => {
        const { client, log } = clientOver({ 'sources/s1.json': { id: 's1' }, 'assets/big.json': { huge: true } });
        await client.pullDatabase();
        expect(log.fetched).toEqual(['sha:sources/s1.json']);
    });

    it('refuses a truncated file list rather than pulling part of it', async () => {
        const { client } = clientOver({ 'sources/s1.json': { id: 's1' } }, { truncated: true });
        await expect(client.pullDatabase()).rejects.toBeInstanceOf(UnsupportedLayoutError);
    });

    it('treats a missing branch as an empty database in the current layout', async () => {
        const client = new GithubClient(config);
        client.request = async () => { const e = new Error('nf'); e.status = 404; throw e; };
        expect(await client.pullDatabase()).toEqual({
            sources: [], documents: [], notes: {}, settings: null, layout: 'bundles', bundles: {}
        });
    });
});

describe('pushing to a manuscripts/ repository', () => {
    const repo = () => ({
        'settings.json': { s: 1 },
        'manuscripts/Aa 13.json': { source: { id: 'Aa 13', quellensigle: 'Aa 13', bibliothek: 'BLB' }, documents: [{ id: 'd1' }] },
        'manuscripts/Aa 13/notes-0000.json': { d1: {} },
        'manuscripts/Ba 12.json': { source: { id: 'Ba 12', quellensigle: 'Ba 12' }, documents: [] }
    });

    const dataset = () => {
        const d = createDataset('test');
        d.sources.push(createSource('Aa 13', {
            equivalents: [{ pattern: '*u', refId: '5', notes: '' }],
            regions: [{ id: 'r1', name: 'Line 1', points: '0,0 1,1', folio: '1r' }],
            items: [{ id: 'i1', regionId: 'r1', pattern: '*u', points: '0,0' }]
        }));
        return d;
    };

    it('writes only the changed manuscript, with its documents and other fields kept', async () => {
        const { client, log } = clientOver(repo());
        const result = await new GithubTransport(client).push(dataset());

        expect(result).toEqual({ sha: 'commit1', files: 1 });
        expect(written(log)).toEqual(['manuscripts/Aa 13.json']);
        const bundle = JSON.parse(log.trees[0].tree[0].content);
        expect(bundle.documents).toEqual([{ id: 'd1' }]);
        expect(bundle.source.bibliothek).toBe('BLB');
        expect(bundle.source.annotationRegions[0].id).toBe('r1');
        expect(bundle.source.equivalents[0].refId).toBe('5');
        expect(log.trees[0].base_tree).toBe('tree0');
        expect(log.commits[0].parents).toEqual(['head1']);
        expect(log.refs).toEqual([{ sha: 'commit1' }]);
    });

    it('does not touch settings.json, the notes chunks or other manuscripts', async () => {
        const { client, log } = clientOver(repo());
        await new GithubTransport(client).push(dataset());
        expect(written(log).some(p => p === 'settings.json' || p.includes('notes-') || p.includes('Ba 12'))).toBe(false);
    });

    it('commits nothing when the data already matches what is in the repository', async () => {
        const { client, log } = clientOver(repo());
        const transport = new GithubTransport(client);
        await transport.push(dataset());
        // Feed the file just written back in as the repository's state.
        const pushed = JSON.parse(log.trees[0].tree[0].content);
        const { client: again, log: log2 } = clientOver({ ...repo(), 'manuscripts/Aa 13.json': pushed });
        const result = await new GithubTransport(again).push(dataset());
        expect(result).toEqual({ sha: 'head1', files: 0 });
        expect(log2.commits).toEqual([]);
    });

    it('adds a bundle for a source the repository does not have yet', async () => {
        const { client, log } = clientOver(repo());
        const d = createDataset('test');
        d.sources.push(createSource('New 1', { equivalents: [{ pattern: '*', refId: '1' }] }));
        await new GithubTransport(client).push(d);
        expect(written(log)).toEqual(['manuscripts/New 1.json']);
        expect(JSON.parse(log.trees[0].tree[0].content)).toMatchObject({ source: { id: 'New 1' }, documents: [] });
    });

    it('does not force the branch: a head that moved in the meantime is refused', async () => {
        const { client } = clientOver(repo(), { headMoves: true });
        await expect(new GithubTransport(client).push(dataset())).rejects.toMatchObject({ status: 422 });
    });

    it('stops when the repository cannot be read, instead of writing on top of an unknown state', async () => {
        const client = new GithubClient(config);
        client.request = async () => { const e = new Error('boom'); e.status = 500; throw e; };
        await expect(new GithubTransport(client).push(dataset())).rejects.toThrow(/Could not read the repository/);
    });
});

describe('pushing to an older sources/ repository', () => {
    it('keeps writing that layout', async () => {
        const { client, log } = clientOver({ 'sources/Aa 13.json': { id: 'Aa 13', quellensigle: 'Aa 13' } });
        const d = createDataset('test');
        d.sources.push(createSource('Aa 13', { equivalents: [{ pattern: '*', refId: '1' }] }));
        await new GithubTransport(client).push(d);
        expect(written(log)).toEqual(['sources/Aa 13.json']);
    });
});
