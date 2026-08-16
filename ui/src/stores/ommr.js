import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { parseOmmrPcgts } from '../utils/ommrParser';
import { getCachedItem, setCachedItem } from '../utils/idb';

export const useOmmrStore = defineStore('ommr', () => {
    // State
    const loadedDatasets = ref({}); // { [sourceName]: { folios: { [folio]: snippets[] }, totalSnippets: number } }
    const activeSource = ref(null);
    const isProcessing = ref(false);
    const progressStatus = ref('');

    // Local OMMR deskewed images: { [source]: { [folio]: objectUrl } }.
    // These are the exact images the coordinates were normalized against, so
    // cropping them needs no IIIF calibration.
    const localImages = ref({});

    function setLocalImage(source, folio, blob) {
        if (!localImages.value[source]) localImages.value[source] = {};
        const prev = localImages.value[source][folio];
        if (prev) URL.revokeObjectURL(prev);
        localImages.value[source] = {
            ...localImages.value[source],
            [folio]: URL.createObjectURL(blob)
        };
    }

    function getLocalImageUrl(source, folio) {
        return localImages.value[source]?.[folio] || null;
    }

    function clearLocalImages(source) {
        const map = localImages.value[source];
        if (map) {
            for (const url of Object.values(map)) URL.revokeObjectURL(url);
        }
        const next = { ...localImages.value };
        delete next[source];
        localImages.value = next;
    }

    const hasLocalImages = computed(() => {
        const map = localImages.value[activeSource.value];
        return !!map && Object.keys(map).length > 0;
    });

    // Computed
    const availableSources = computed(() => Object.keys(loadedDatasets.value));

    const currentDataset = computed(() => {
        if (!activeSource.value) return null;
        return loadedDatasets.value[activeSource.value] || null;
    });

    /**
     * All snippets for the currently active source.
     */
    const activeSnippets = computed(() => {
        if (!currentDataset.value || !currentDataset.value.folios) return [];
        const list = [];
        for (const folioSnippets of Object.values(currentDataset.value.folios)) {
            list.push(...folioSnippets);
        }
        return list;
    });

    /**
     * All staff lines for the active source.
     */
    const activeLines = computed(() => {
        if (!currentDataset.value || !currentDataset.value.lines) return [];
        const list = [];
        for (const folioLines of Object.values(currentDataset.value.lines)) {
            list.push(...folioLines);
        }
        return list;
    });

    /**
     * Aggregated by pattern: { [pattern]: snippet[] }
     */
    const snippetsByPattern = computed(() => {
        const map = {};
        for (const s of activeSnippets.value) {
            if (!map[s.pattern]) map[s.pattern] = [];
            map[s.pattern].push(s);
        }
        return map;
    });

    /**
     * Frequency stats: { [pattern]: count }
     */
    const patternFrequencies = computed(() => {
        const counts = {};
        for (const [pat, list] of Object.entries(snippetsByPattern.value)) {
            counts[pat] = list.length;
        }
        return counts;
    });

    /**
     * Load an OMMR dataset from a folder structure or JSON index.
     */
    /**
     * Store per-folio deskew info (rotation angle + page dims) so the IIIF
     * region for each neume can be rotated back onto the un-deskewed original.
     * map: { [folio]: { angle, w, h } }
     */
    function setFolioMeta(source, map) {
        if (!loadedDatasets.value[source]) return;
        loadedDatasets.value[source].folioMeta = {
            ...(loadedDatasets.value[source].folioMeta || {}),
            ...map
        };
    }

    function getFolioMeta(source, folio) {
        return loadedDatasets.value[source]?.folioMeta?.[folio] || null;
    }

    function extractPageMeta(json) {
        const p = json && json.page;
        if (!p) return null;
        return {
            imageFilename: p.imageFilename || null,
            imageWidth: p.imageWidth || null,
            imageHeight: p.imageHeight || null
        };
    }

    function ensureDataset(source) {
        if (!loadedDatasets.value[source]) {
            loadedDatasets.value[source] = { folios: {}, lines: {}, totalSnippets: 0, pageMeta: null };
        } else if (!loadedDatasets.value[source].lines) {
            loadedDatasets.value[source].lines = {};
        }
    }

    function ingestFolioPcgts(source, folio, pcgtsJson) {
        ensureDataset(source);
        const { snippets, lines } = parseOmmrPcgts(source, folio, pcgtsJson);
        loadedDatasets.value[source].folios[folio] = snippets;
        loadedDatasets.value[source].lines[folio] = lines;
        if (!loadedDatasets.value[source].pageMeta) {
            loadedDatasets.value[source].pageMeta = extractPageMeta(pcgtsJson);
        }

        let total = 0;
        for (const fList of Object.values(loadedDatasets.value[source].folios)) {
            total += fList.length;
        }
        loadedDatasets.value[source].totalSnippets = total;
        if (!activeSource.value) activeSource.value = source;
    }

    /**
     * Ingest batch of folio PCGTS files.
     */
    function ingestBatch(source, folioPcgtsMap) {
        ensureDataset(source);
        for (const [folio, json] of Object.entries(folioPcgtsMap)) {
            const { snippets, lines } = parseOmmrPcgts(source, folio, json);
            loadedDatasets.value[source].folios[folio] = snippets;
            loadedDatasets.value[source].lines[folio] = lines;
            if (!loadedDatasets.value[source].pageMeta) {
                loadedDatasets.value[source].pageMeta = extractPageMeta(json);
            }
        }
        let total = 0;
        for (const fList of Object.values(loadedDatasets.value[source].folios)) {
            total += fList.length;
        }
        loadedDatasets.value[source].totalSnippets = total;
        activeSource.value = source;
    }

    /**
     * Rename a loaded source (e.g. fix a wrongly-derived "ommr import" -> "Pa 14819").
     * Rewrites the `source` field on every snippet so IIIF resolution matches.
     */
    function renameSource(oldName, newName) {
        newName = String(newName || '').trim();
        if (!newName || oldName === newName || !loadedDatasets.value[oldName]) return;
        const ds = loadedDatasets.value[oldName];
        for (const list of Object.values(ds.folios)) {
            for (const snip of list) snip.source = newName;
        }
        for (const list of Object.values(ds.lines || {})) {
            for (const ln of list) ln.source = newName;
        }
        loadedDatasets.value[newName] = ds;
        delete loadedDatasets.value[oldName];
        if (localImages.value[oldName]) {
            const next = { ...localImages.value };
            next[newName] = next[oldName];
            delete next[oldName];
            localImages.value = next;
        }
        if (activeSource.value === oldName) activeSource.value = newName;
    }

    /**
     * Clear loaded OMMR data for a source.
     */
    function removeDataset(source) {
        clearLocalImages(source);
        delete loadedDatasets.value[source];
        if (activeSource.value === source) {
            activeSource.value = availableSources.value[0] || null;
        }
    }

    return {
        loadedDatasets,
        activeSource,
        isProcessing,
        progressStatus,
        availableSources,
        currentDataset,
        activeSnippets,
        activeLines,
        snippetsByPattern,
        patternFrequencies,
        localImages,
        hasLocalImages,
        setLocalImage,
        getLocalImageUrl,
        clearLocalImages,
        setFolioMeta,
        getFolioMeta,
        ingestFolioPcgts,
        ingestBatch,
        renameSource,
        removeDataset
    };
});
