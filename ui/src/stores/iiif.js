import { defineStore } from 'pinia';
import { ref } from 'vue';
import { iiifParseRules } from '../config/iiifRules';
import { fetchManifestJson } from '../services/iiif/manifestFetch';
import { parseManifest } from '../services/iiif/manifestParser';
import { getCachedItem, setCachedItem, deleteCachedItem, clearStore } from '../utils/idb';
import { isPlainObject } from '../utils/shape';

export const useIiifStore = defineStore('iiif', () => {
    // State
    const links = ref({}); // source -> manifest URL (the only persisted state)
    const parsedData = ref({}); // source -> array of { folio, imgUrl }
    const manifestStatus = ref({}); // source -> { status: 'loading' | 'ok' | 'error', error: null }
    
    // In-flight manifest request deduplication
    const inflightFetches = new Map();

    // --- Persistence ---

    function serialize() {
        return links.value;
    }

    /** Replace the manifest links; entries that are not URL strings are dropped. */
    function hydrate(payload) {
        if (!isPlainObject(payload)) return;
        const next = {};
        for (const [source, url] of Object.entries(payload)) {
            if (typeof url === 'string') next[source] = url;
        }
        links.value = next;
    }

    function reset() {
        links.value = {};
        parsedData.value = {};
        manifestStatus.value = {};
    }

    async function addManifest(source, url) {
        const changed = links.value[source] !== url;
        links.value[source] = url;
        if (changed) {
            // Drop stale caches so the new URL fully takes effect.
            await deleteCachedItem('manifests', source);
            delete parsedData.value[source];
            await clearStore('images'); // region crops were keyed to the old service URL
        }
        await fetchAndParseManifest(source, url, true); // force fresh on manual add
    }

    function removeManifest(source) {
        delete links.value[source];
        delete parsedData.value[source];
    }

    /** Force a fresh fetch of an already-linked manifest, clearing caches. */
    async function refreshManifest(source) {
        const url = links.value[source];
        if (!url) return;
        await deleteCachedItem('manifests', source);
        delete parsedData.value[source];
        await clearStore('images');
        await fetchAndParseManifest(source, url, true);
    }

    async function fetchAndParseManifest(source, url, forceRefresh = false) {
        if (parsedData.value[source] && !forceRefresh) return;

        // If already in flight, reuse promise — but a forced refresh must not
        // piggy-back on a stale in-flight (possibly cache-backed) request.
        if (!forceRefresh && inflightFetches.has(source)) {
            return inflightFetches.get(source);
        }

        const fetchPromise = (async () => {
            manifestStatus.value[source] = { status: 'loading', error: null };

            // Check IndexedDB cache first
            if (!forceRefresh) {
                try {
                    const cached = await getCachedItem('manifests', source);
                    if (cached && Array.isArray(cached) && cached.length > 0) {
                        parsedData.value[source] = cached;
                        manifestStatus.value[source] = { status: 'ok', error: null };
                        return;
                    }
                } catch (e) {
                    console.warn(`Cache read failed for ${source}`, e);
                }
            }

            try {
                const data = await fetchManifestJson(url);
                const folios = parseManifest(data, { labelRule: iiifParseRules[source] });

                if (folios.length > 0) {
                    parsedData.value[source] = folios;
                    manifestStatus.value[source] = { status: 'ok', error: null };
                    // Cache parsed manifest data in IndexedDB for fast reloads
                    setCachedItem('manifests', source, folios).catch(e => console.warn('Failed caching manifest', e));
                } else {
                    const msg = `No canvases found in manifest for ${source}`;
                    console.warn(msg);
                    manifestStatus.value[source] = { status: 'error', error: msg };
                }
            } catch (e) {
                console.error(`Failed to load IIIF manifest for ${source}`, e);
                manifestStatus.value[source] = { status: 'error', error: e.message };
            } finally {
                inflightFetches.delete(source);
            }
        })();

        inflightFetches.set(source, fetchPromise);
        return fetchPromise;
    }

    /**
     * Import manifests from data.json's `manifests` field.
     * Only loads ones not already present in the store.
     */
    async function importFromDataManifests(manifestMap) {
        for (const [source, info] of Object.entries(manifestMap)) {
            const url = (typeof info === 'string' ? info : info.url || '').trim();
            if (!url) continue;
            // Just register the link, don't fetch yet (lazy loading)
            if (!links.value[source]) {
                links.value[source] = url;
            }
        }
    }

    /**
     * Ensure a specific source's manifest is loaded.
     * Called lazily when a source's images are actually needed.
     */
    async function ensureLoaded(source) {
        if (parsedData.value[source]) return; // Already loaded
        const url = links.value[source];
        if (!url) return; // No URL known
        await fetchAndParseManifest(source, url);
    }

    // No eager loading — all manifests are loaded lazily via ensureLoaded()

    return {
        links,
        serialize,
        hydrate,
        reset,
        parsedData,
        manifestStatus,
        addManifest,
        removeManifest,
        refreshManifest,
        importFromDataManifests,
        ensureLoaded
    };
});
