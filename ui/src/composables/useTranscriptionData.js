import { ref, shallowRef } from 'vue';
import { useIiifStore } from '../stores/iiif';
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

async function loadSource(sourceName) {
    if (!sourceName) return;
    if (loadedSources.value.has(sourceName)) return;

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

        rawData.value = { ...rawData.value, [sourceName]: sourceData };
        pagePatternsIndex.value = { ...pagePatternsIndex.value, [sourceName]: pPats };
        folioLinesIndex.value = { ...folioLinesIndex.value, [sourceName]: fLines };

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
        loadedSources
    };
}
