import { ref, shallowRef, triggerRef } from 'vue';
import { useIiifStore } from '../stores/iiif';
import { useSettingsStore } from '../stores/settings';
import { loadOverviewMetadata } from '../services/metadata/metadataProvider';
import { untracked } from '../services/persistence/changeTracker';

const rawData = shallowRef({});
const patStats = shallowRef({});
const glyphs = shallowRef({});
const manifests = shallowRef({});
const sourceFolios = shallowRef({}); // { source: Set<folio> }
const pagePatternsIndex = shallowRef({}); // { source: { folio: [patterns] } }
const folioLinesIndex = shallowRef({}); // { source: { folio: [lines] } }
const documents = shallowRef([]); // bibliographic metadata from the shared source
const sourceMeta = shallowRef({}); // { source: { field: value } } from the shared source
const metadataSource = ref('static'); // 'static' | 'shared'
const overallMax = ref(0);
const loading = ref(true);
const error = ref(null);
const loadedSources = ref(new Set());
// Occurrence counts per source and pattern from counts.json: { source: { pattern: n } }.
// null until loaded and when the build has no such file (see loadCounts).
const sourceCounts = shallowRef(null);
const countsStatus = ref('idle'); // 'idle' | 'loading' | 'ready' | 'absent'

let initPromise = null;

async function fetchAll() {
    try {
        const meta = await loadOverviewMetadata();

        rawData.value = {};
        pagePatternsIndex.value = {};
        folioLinesIndex.value = {};

        patStats.value = meta.stats;
        glyphs.value = meta.glyphs;
        manifests.value = meta.manifests || {};
        overallMax.value = meta.overallMax;
        documents.value = meta.documents || [];
        sourceMeta.value = meta.sourceMeta || {};
        metadataSource.value = meta.metadataSource || 'static';

        const sFolios = {};
        if (meta.sourceFolios) {
            for (const [src, fList] of Object.entries(meta.sourceFolios)) {
                sFolios[src] = new Set(fList);
            }
        }
        sourceFolios.value = sFolios;
        useSettingsStore().setDefaultAlignments(meta.alignments);
        loading.value = false;

        if (Object.keys(manifests.value).length > 0) {
            try {
                const iiifStore = useIiifStore();
                // These links are derived from the bundled index on every load, not
                // something the user did: they must not count as an edit (which would
                // rewrite the workspace file at every page load).
                untracked(() => iiifStore.importFromDataManifests(manifests.value));
            } catch (e) {
                console.warn('Could not auto-import IIIF manifests:', e);
            }
        }
    } catch (e) {
        console.error(e);
        error.value = e;
        loading.value = false;
    }
}

let countsPromise = null;

/**
 * Load counts.json, the small table of occurrence counts per source and pattern (about 26 KB
 * gzipped, against 13 MB for the source files of one page of the Global Analysis matrix).
 * It is optional: builds from before 2026-11-04 do not ship it, and a missing file ends in
 * status 'absent' (never an error), so callers fall back to loading source files.
 * Not part of fetchAll(): only the views that need counts alone pay for the request.
 */
function loadCounts() {
    if (!countsPromise) {
        countsStatus.value = 'loading';
        countsPromise = fetchCounts().then((counts) => {
            sourceCounts.value = counts;
            countsStatus.value = counts ? 'ready' : 'absent';
        });
    }
    return countsPromise;
}

async function fetchCounts() {
    try {
        const res = await fetch('counts.json', { cache: 'no-cache' });
        if (!res.ok) return null;
        // The dev server answers a missing file with index.html (HTTP 200).
        if (!(res.headers.get('content-type') || '').includes('json')) return null;
        const counts = await res.json();
        return counts && typeof counts === 'object' && !Array.isArray(counts) ? counts : null;
    } catch (e) {
        console.warn('Could not load counts.json, falling back to the source files:', e);
        return null;
    }
}

// Requests in flight, so callers may fire loadSource() for many sources at once
// and repeated calls for one source share a single request.
const pendingLoads = new Map();

// At most this many source files are fetched and parsed at the same time, so a
// burst of requests (a page of rows scrolling into view) cannot flood the network
// or block the main thread with parsing several megabytes at once.
const MAX_PARALLEL_LOADS = 4;
let activeLoads = 0;
const loadQueue = [];

function runQueued(task) {
    return new Promise((resolve, reject) => {
        const start = () => {
            activeLoads++;
            task().then(resolve, reject).finally(() => {
                activeLoads--;
                const next = loadQueue.shift();
                if (next) next();
            });
        };
        if (activeLoads < MAX_PARALLEL_LOADS) start();
        else loadQueue.push(start);
    });
}

function loadSource(sourceName) {
    if (!sourceName) return Promise.resolve();
    if (loadedSources.value.has(sourceName)) return Promise.resolve();
    let pending = pendingLoads.get(sourceName);
    if (!pending) {
        pending = runQueued(() => fetchSource(sourceName)).finally(() => pendingLoads.delete(sourceName));
        pendingLoads.set(sourceName, pending);
    }
    return pending;
}

/** Folio -> patterns and folio -> lines of one source, for the manager workspace. */
function buildFolioIndexes(sourceData) {
    const pPats = {};
    const fLines = {};
    for (const [pat, occs] of Object.entries(sourceData)) {
        for (const occ of occs) {
            const fol = occ[1];
            const line = occ[2];

            if (!pPats[fol]) pPats[fol] = [];
            pPats[fol].push(pat);

            if (!fLines[fol]) fLines[fol] = new Set();
            fLines[fol].add(line);
        }
    }
    for (const fol of Object.keys(pPats)) {
        pPats[fol] = Array.from(new Set(pPats[fol])).sort();
        fLines[fol] = Array.from(fLines[fol]).sort((a, b) => a - b);
    }
    return { pPats, fLines };
}

/**
 * Expose a per-source value as a property that is computed on first read. The
 * overview only needs the pattern counts, so the folio indexes (one pass over every
 * occurrence) are built only when the manager workspace asks for them.
 */
function defineLazy(target, key, compute) {
    let cache;
    Object.defineProperty(target, key, {
        enumerable: true,
        configurable: true,
        get() {
            if (cache === undefined) cache = compute();
            return cache;
        },
    });
}

async function fetchSource(sourceName) {
    const safeSrc = sourceName.replace(/\//g, '_');

    try {
        const res = await fetch(`sources/${encodeURIComponent(safeSrc)}.json`);
        if (!res.ok) throw new Error(`Failed to load source ${sourceName} (HTTP ${res.status})`);
        // A missing file is served the SPA index.html by the dev server (HTTP 200),
        // so an HTML body here means the source does not exist — report that clearly
        // instead of letting JSON.parse fail with an opaque syntax error.
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('json')) {
            const head = (await res.text()).slice(0, 40).trim();
            if (head.startsWith('<')) {
                throw new Error(`No transcription data file for source "${sourceName}" (sources/${safeSrc}.json not found)`);
            }
            throw new Error(`Unexpected content-type "${ct}" for source ${sourceName}`);
        }
        const sourceData = await res.json();

        let built;
        const folioIndexes = () => (built ||= buildFolioIndexes(sourceData));

        rawData.value = { ...rawData.value, [sourceName]: sourceData };
        defineLazy(pagePatternsIndex.value, sourceName, () => folioIndexes().pPats);
        defineLazy(folioLinesIndex.value, sourceName, () => folioIndexes().fLines);
        triggerRef(pagePatternsIndex);
        triggerRef(folioLinesIndex);

        loadedSources.value.add(sourceName);
    } catch (e) {
        console.error(e);
    }
}

export function useTranscriptionData() {
    if (!initPromise) {
        initPromise = fetchAll();
    }

    return {
        rawData,
        sourceFolios,
        pagePatternsIndex,
        folioLinesIndex,
        patStats,
        glyphs,
        manifests,
        documents,
        sourceMeta,
        metadataSource,
        overallMax,
        loading,
        error,
        loadSource,
        loadedSources,
        sourceCounts,
        countsStatus,
        loadCounts
    };
}
