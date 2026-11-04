import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The overview metadata (index.json) is not under test and must not use the stubbed fetch.
vi.mock('../services/metadata/metadataProvider', () => ({
    loadOverviewMetadata: () => new Promise(() => {})
}));

/** A fresh module (the composable keeps its state at module level) with `fetch` stubbed by `respond(url)`. */
async function freshComposable(respond) {
    vi.resetModules();
    const fetchMock = vi.fn(async (url) => respond(url));
    vi.stubGlobal('fetch', fetchMock);
    const { useTranscriptionData } = await import('./useTranscriptionData');
    return { data: useTranscriptionData(), fetchMock };
}

const json = (body) => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => body });

describe('loadCounts (counts.json, the occurrence count per source and pattern)', () => {
    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('reads the table and never touches a source file', async () => {
        const table = { 'Aa 13': { '*dd': 2 }, 'WiSch 4/5': { '*u': 1 } };
        const { data, fetchMock } = await freshComposable(() => json(table));
        expect(data.countsStatus.value).toBe('idle');

        const pending = data.loadCounts();
        expect(data.countsStatus.value).toBe('loading');
        await pending;

        expect(data.countsStatus.value).toBe('ready');
        expect(data.sourceCounts.value).toEqual(table);
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['counts.json']);
    });

    it('requests the table once however often it is asked for', async () => {
        const { data, fetchMock } = await freshComposable(() => json({}));
        await Promise.all([data.loadCounts(), data.loadCounts()]);
        await data.loadCounts();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(data.countsStatus.value).toBe('ready'); // an empty table is a valid table
    });

    it('is "absent" for a build without the file (HTTP 404)', async () => {
        const { data } = await freshComposable(() => ({ ok: false, status: 404, headers: { get: () => 'text/html' } }));
        await data.loadCounts();
        expect(data.countsStatus.value).toBe('absent');
        expect(data.sourceCounts.value).toBeNull();
    });

    it('is "absent" when the dev server answers the missing file with index.html (HTTP 200)', async () => {
        const { data } = await freshComposable(() => ({
            ok: true,
            headers: { get: () => 'text/html' },
            json: async () => { throw new Error('not json'); }
        }));
        await data.loadCounts();
        expect(data.countsStatus.value).toBe('absent');
    });

    it('is "absent" for a network failure or a body that is not an object', async () => {
        const failing = await freshComposable(() => { throw new TypeError('network down'); });
        await failing.data.loadCounts();
        expect(failing.data.countsStatus.value).toBe('absent');

        const array = await freshComposable(() => json([1, 2]));
        await array.data.loadCounts();
        expect(array.data.countsStatus.value).toBe('absent');
    });

    it('leaves loadSource as it was: a source file is still fetched on request', async () => {
        const rows = { '*dd': [['d1', '1r', 1, 'a', 'x'], ['d1', '1r', 2, 'b', 'y']] };
        const { data, fetchMock } = await freshComposable((url) => json(url === 'counts.json' ? { Q1: { '*dd': 2 } } : rows));
        await data.loadCounts();
        await data.loadSource('Q1');
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['counts.json', 'sources/Q1.json']);
        expect(data.rawData.value.Q1['*dd']).toHaveLength(2);
        expect(data.rawData.value.Q1['*dd'].length).toBe(data.sourceCounts.value.Q1['*dd']);
    });
});
