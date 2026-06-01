import { ref, shallowRef } from 'vue';
import { useIiifStore } from '../stores/iiif';

const rawData = shallowRef({});
const patStats = shallowRef({});
const glyphs = shallowRef({});
const manifests = shallowRef({});
const sourceFolios = shallowRef({}); // { source: Set<folio> }
const pagePatternsIndex = shallowRef({}); // { source: { folio: [patterns] } }
const folioLinesIndex = shallowRef({}); // { source: { folio: [lines] } }
const overallMax = ref(0);
const loading = ref(true);
const error = ref(null);

let initPromise = null;

async function fetchAll() {
    try {
        const res = await fetch(`data.json?t=${Date.now()}`);
        if (!res.ok) throw new Error("Failed to load data");
        const json = await res.json();

        // Build efficient indices
        const sFolios = {};
        const pPats = {};
        const fLines = {};

        for (const [src, patterns] of Object.entries(json.data)) {
            sFolios[src] = new Set();
            pPats[src] = {};
            fLines[src] = {};

            for (const [pat, occs] of Object.entries(patterns)) {
                for (const occ of occs) {
                    const fol = occ[1];
                    const line = occ[2];
                    sFolios[src].add(fol);

                    if (!pPats[src][fol]) pPats[src][fol] = [];
                    pPats[src][fol].push(pat);
                    
                    if (!fLines[src][fol]) fLines[src][fol] = new Set();
                    fLines[src][fol].add(line);
                }
            }

            // Deduplicate patterns per page and convert line sets to sorted arrays
            for (const fol of Object.keys(pPats[src])) {
                pPats[src][fol] = Array.from(new Set(pPats[src][fol])).sort();
                fLines[src][fol] = Array.from(fLines[src][fol]).sort((a,b) => a-b);
            }
        }

        rawData.value = json.data;
        sourceFolios.value = sFolios;
        pagePatternsIndex.value = pPats;
        folioLinesIndex.value = fLines;
        patStats.value = json.stats;
        glyphs.value = json.glyphs;
        manifests.value = json.manifests || {};
        overallMax.value = json.overallMax;
        loading.value = false;

        // Auto-import IIIF manifests from data.json into the IIIF store
        if (Object.keys(manifests.value).length > 0) {
            try {
                const iiifStore = useIiifStore();
                iiifStore.importFromDataManifests(manifests.value);
            } catch (e) {
                console.warn("Could not auto-import IIIF manifests:", e);
            }
        }
    } catch (e) {
        console.error(e);
        error.value = e;
        loading.value = false;
    }
}

export function useTranscriptionData() {
    // Singleton pattern for data loading
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
        overallMax,
        loading,
        error
    };
}
