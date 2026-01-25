import { ref, shallowRef } from 'vue';

const rawData = shallowRef({});
const patStats = shallowRef({});
const glyphs = shallowRef({});
const manifests = shallowRef({});
const sourceFolios = shallowRef({}); // { source: Set<folio> }
const pagePatternsIndex = shallowRef({}); // { source: { folio: [patterns] } }
const overallMax = ref(0);
const loading = ref(true);
const error = ref(null);

let initPromise = null;

async function fetchAll() {
    try {
        const res = await fetch('/data.json');
        if (!res.ok) throw new Error("Failed to load data");
        const json = await res.json();

        // Build efficient indices
        const sFolios = {};
        const pPats = {};

        for (const [src, patterns] of Object.entries(json.data)) {
            sFolios[src] = new Set();
            pPats[src] = {};

            for (const [pat, occs] of Object.entries(patterns)) {
                for (const occ of occs) {
                    const fol = occ[1];
                    sFolios[src].add(fol);

                    if (!pPats[src][fol]) pPats[src][fol] = [];
                    pPats[src][fol].push(pat);
                }
            }

            // Deduplicate patterns per page (some patterns might appear multiple times on same page)
            for (const fol of Object.keys(pPats[src])) {
                pPats[src][fol] = Array.from(new Set(pPats[src][fol])).sort();
            }
        }

        rawData.value = json.data;
        sourceFolios.value = sFolios;
        pagePatternsIndex.value = pPats;
        patStats.value = json.stats;
        glyphs.value = json.glyphs;
        manifests.value = json.manifests || {};
        overallMax.value = json.overallMax;
        loading.value = false;
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
        patStats,
        glyphs,
        manifests,
        overallMax,
        loading,
        error
    };
}
