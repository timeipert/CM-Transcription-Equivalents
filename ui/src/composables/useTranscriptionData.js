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
const loadedSources = ref(new Set());

let initPromise = null;

async function fetchAll() {
    try {
        const res = await fetch(`index.json?t=${Date.now()}`);
        if (!res.ok) throw new Error("Failed to load data index");
        const json = await res.json();

        // Populate empty indices initially
        rawData.value = {};
        pagePatternsIndex.value = {};
        folioLinesIndex.value = {};

        patStats.value = json.stats;
        glyphs.value = json.glyphs;
        manifests.value = json.manifests || {};
        overallMax.value = json.overallMax;

        // Populate sourceFolios from index
        const sFolios = {};
        if (json.sourceFolios) {
            for (const [src, fList] of Object.entries(json.sourceFolios)) {
                sFolios[src] = new Set(fList);
            }
        }
        sourceFolios.value = sFolios;
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

async function loadSource(sourceName) {
    if (!sourceName) return;
    if (loadedSources.value.has(sourceName)) return;
    
    const safeSrc = sourceName.replace(/\//g, "_");
    
    try {
        const res = await fetch(`sources/${safeSrc}.json`);
        if (!res.ok) throw new Error(`Failed to load source ${sourceName}`);
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
        
        // Deduplicate
        for (const fol of Object.keys(pPats)) {
            pPats[fol] = Array.from(new Set(pPats[fol])).sort();
            fLines[fol] = Array.from(fLines[fol]).sort((a,b) => a-b);
        }
        
        // Mutate shallowRefs
        rawData.value = { ...rawData.value, [sourceName]: sourceData };
        pagePatternsIndex.value = { ...pagePatternsIndex.value, [sourceName]: pPats };
        folioLinesIndex.value = { ...folioLinesIndex.value, [sourceName]: fLines };
        
        loadedSources.value.add(sourceName);
    } catch (e) {
        console.error(e);
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
        error,
        loadSource,
        loadedSources
    };
}
