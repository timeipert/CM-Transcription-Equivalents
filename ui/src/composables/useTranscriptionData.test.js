import { describe, it, expect, vi, afterEach } from 'vitest';
import { useTranscriptionData } from './useTranscriptionData';

// The overview metadata (index.json) is not under test and must not use the stubbed fetch.
vi.mock('../services/metadata/metadataProvider', () => ({
    loadOverviewMetadata: () => new Promise(() => {})
}));

/** A fetch whose responses are released by hand, to observe how many run at once. */
function controllableFetch() {
    const waiting = [];
    let active = 0;
    let maxActive = 0;
    const calls = [];
    const fetchMock = vi.fn((url) => {
        calls.push(url);
        active++;
        maxActive = Math.max(maxActive, active);
        return new Promise((resolve) => {
            waiting.push(() => {
                active--;
                resolve({
                    ok: true,
                    headers: { get: () => 'application/json' },
                    // [document, folio, line, syllable, notes]
                    json: async () => ({
                        '*dd': [
                            ['d1', '1r', 1, 'a', 'x'],
                            ['d1', '1r', 2, 'b', 'y']
                        ]
                    })
                });
            });
        });
    });
    return {
        fetchMock,
        calls,
        waiting,
        get maxActive() {
            return maxActive;
        }
    };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('loadSource', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('fetches at most four sources at a time and shares requests for one source', async () => {
        const ctl = controllableFetch();
        vi.stubGlobal('fetch', ctl.fetchMock);
        const { loadSource, rawData } = useTranscriptionData();

        const names = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
        const all = names.map((n) => loadSource(n));
        const duplicate = loadSource('Q1');
        await tick();

        expect(ctl.fetchMock).toHaveBeenCalledTimes(4); // the rest waits in the queue
        expect(duplicate).toBe(all[0]); // one request per source

        // Releasing the requests lets the queued ones start.
        while (ctl.waiting.length) {
            ctl.waiting.shift()();
            await tick();
        }
        await Promise.all(all);

        expect(ctl.fetchMock).toHaveBeenCalledTimes(6);
        expect(ctl.maxActive).toBeLessThanOrEqual(4);
        for (const n of names) expect(rawData.value[n]['*dd']).toHaveLength(2);
    });

    it('does not fetch a source that is already loaded', async () => {
        const ctl = controllableFetch();
        vi.stubGlobal('fetch', ctl.fetchMock);
        const { loadSource } = useTranscriptionData();

        const first = loadSource('Q7');
        await tick();
        ctl.waiting.shift()();
        await first;
        await loadSource('Q7');

        expect(ctl.fetchMock).toHaveBeenCalledTimes(1);
    });

    it('builds the folio indexes on first read, not at load time', async () => {
        const ctl = controllableFetch();
        vi.stubGlobal('fetch', ctl.fetchMock);
        const { loadSource, pagePatternsIndex, folioLinesIndex } = useTranscriptionData();

        const p = loadSource('Q8');
        await tick();
        ctl.waiting.shift()();
        await p;

        expect(pagePatternsIndex.value.Q8).toEqual({ '1r': ['*dd'] });
        expect(folioLinesIndex.value.Q8).toEqual({ '1r': [1, 2] });
    });
});
