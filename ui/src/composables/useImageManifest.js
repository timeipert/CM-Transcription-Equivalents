import { ref, computed } from 'vue';
import { useIiifStore } from '../stores/iiif';
import { useTranscriptionData } from './useTranscriptionData';
import { useSettingsStore, effectiveAlignment } from '../stores/settings';
import { iiifPageUrl, iiifRegionUrl } from '../services/iiif/imageUrl';
import { buildPageMap } from '../services/alignment/pageMap';
import { matchName, canonicalFolio, indexFolios, folioIdentity, compareFolios } from '../services/alignment/folios';

/**
 * Pages and their images, for the views.
 *
 * Everything about which canvas shows which folio is decided by the page map
 * (services/alignment/pageMap.js), one per manuscript, kept as a `computed()` so
 * a pin, a loaded manifest or new transcription data is reflected at once. This
 * composable only adds the reactive wiring and the local scans in public/scans.
 *
 * Two kinds of folio names, never to be mixed up (see services/alignment/folios.js):
 *   pageFolio(source, f)   the folio a page is STORED under: the transcription's
 *                          folio — independent of any manifest.
 *   canvasLabel(source, f) the IIIF label of the canvas that shows it: display only.
 */

/** @deprecated use `matchName` from services/alignment/folios.js */
export const normalizeFolioName = matchName;

// Per-source page maps, created lazily and kept for the session. A `computed()`
// tracks its own dependencies, so it cannot go stale the way a cache tied to a
// since-unmounted component's watcher would. Kept per IIIF store, so two app
// instances (or tests) never share a map.
const pageMapCaches = new WeakMap();

const manifest = ref(new Set());
const loaded = ref(false);

/** The images in public/scans, by path ("scans/Source/Folio.jpg"). */
async function loadManifest() {
    if (loaded.value) return;
    try {
        // Only the keys (paths) are read; the modules are never imported.
        const files = import.meta.glob('../../public/scans/**/*.{jpg,jpeg,png}');
        manifest.value = new Set(Object.keys(files).map(path => path.replace('../../public/', '')));
        loaded.value = true;
    } catch (e) {
        console.error('Failed to load image manifest', e);
    }
}

export function useImageManifest() {
    const iiifStore = useIiifStore();
    const settings = useSettingsStore();

    if (!loaded.value) loadManifest();
    if (!pageMapCaches.has(iiifStore)) pageMapCaches.set(iiifStore, new Map());
    const pageMapCache = pageMapCaches.get(iiifStore);

    // --- Local scans ---------------------------------------------------------

    function findManifestPath(source, folio) {
        if (!source || !folio) return null;
        const s = String(source).trim();
        const f = String(folio).trim();

        for (const path of [`${s}/${f}.jpg`, `scans/${s}/${f}.jpg`]) {
            if (manifest.value.has(path)) return path;
        }
        // A compound source ("Pa 1235-9-1") whose scans sit under its base ("Pa 1235").
        for (const entry of manifest.value) {
            if (!(entry.endsWith(`/${f}.jpg`) || entry.endsWith(`/${f}.jpeg`))) continue;
            const parts = entry.split('/');
            if (parts.length >= 2 && s.includes(parts[parts.length - 2])) return entry;
        }
        return null;
    }

    // --- Sources -------------------------------------------------------------

    /**
     * The IIIF key of a source: itself, or the longest linked source it starts
     * with ("Kön D-219v-a-19" -> "Kön D"). Null if it has no manifest link.
     */
    function resolveIiifSource(source) {
        const s = String(source).trim();
        if (iiifStore.parsedData[s] || iiifStore.links[s]) return s;
        let best = null;
        for (const key of Object.keys(iiifStore.links)) {
            if (!s.startsWith(key) || (best && key.length <= best.length)) continue;
            const rest = s.substring(key.length);
            if (rest === '' || rest.startsWith('-') || rest.startsWith(' ')) best = key;
        }
        return best;
    }

    /**
     * The source a page is stored under: the IIIF key, or the folder of its local
     * scans, or the source itself. Depends on manifest *links* (saved with the
     * workspace), never on whether a manifest has loaded.
     */
    function getStandardSource(source, folio) {
        const resolved = resolveIiifSource(source);
        if (resolved) return resolved;
        const path = findManifestPath(source, folio);
        if (path) {
            const parts = path.split('/');
            if (parts.length >= 2) return parts[parts.length - 2];
        }
        return source ? String(source).trim() : source;
    }

    /** The transcription's folios of a source (or of its IIIF key), in order. */
    function dataFoliosOf(source) {
        const { sourceFolios } = useTranscriptionData();
        const all = sourceFolios.value || {};
        const set = all[source] || all[resolveIiifSource(source)] || null;
        return set ? Array.from(set).filter(Boolean).sort(compareFolios) : [];
    }

    // --- Page maps -----------------------------------------------------------

    /** The page map of a source, or null while it has no parsed manifest. */
    function pageMapFor(source) {
        const key = resolveIiifSource(source);
        if (!key || !iiifStore.parsedData[key]) return null;
        if (!pageMapCache.has(key)) {
            pageMapCache.set(key, computed(() => {
                const pages = iiifStore.parsedData[key];
                if (!pages || !pages.length) return null;
                return buildPageMap({
                    pages,
                    dataFolios: dataFoliosOf(key),
                    alignment: effectiveAlignment(settings.sourceAlignments[key], settings.defaultAlignments[key])
                });
            }));
        }
        return pageMapCache.get(key).value;
    }

    /**
     * The canvas → folio overview for the alignment review and the sidebar. Each
     * entry's `resolvedFolio` is the folio the page map really uses for it (both
     * directions agree), and `via` says how it was found.
     */
    function getAlignmentReport(source) {
        const key = resolveIiifSource(source);
        const map = pageMapFor(source);
        if (!map) return null;
        const entries = map.entries.map(e => {
            const hit = e.folio ? map.canvasFor(e.folio) : null;
            return {
                canvasIndex: e.canvasIndex,
                originalLabel: e.originalLabel,
                inferredFolio: e.resolvedFolio,
                resolvedFolio: e.folio,
                via: hit ? hit.via : e.via,
                confidence: hit ? hit.confidence : e.confidence,
                isDivider: e.isDivider,
                canvas: e.canvas
            };
        });
        return {
            key,
            dataType: map.dataType,
            matched: entries.filter(e => e.resolvedFolio).length,
            withDataCount: map.stats.withDataCount,
            dividerCount: map.stats.dividerCount,
            total: map.stats.total,
            dataFolios: map.dataFolios,
            entries
        };
    }

    /**
     * The canvas that shows a folio: `{ index, page, via, confidence, resolvedSource }`,
     * or null (no manifest, or no canvas for it).
     */
    function canvasFor(source, folio) {
        const map = pageMapFor(source);
        const hit = map ? map.canvasFor(folio) : null;
        return hit ? { ...hit, resolvedSource: resolveIiifSource(source) } : null;
    }

    /** The folio a page is stored under (see top of file). */
    function pageFolio(source, folio) {
        if (folio === null || folio === undefined || folio === '') return folio;
        return canonicalFolio(folio, indexFolios(dataFoliosOf(source)));
    }

    /** The IIIF label of the canvas showing a folio, for display; null if none. */
    function canvasLabel(source, folio) {
        return canvasFor(source, folio)?.page.folio ?? null;
    }

    // --- Images --------------------------------------------------------------

    function hasImage(source, folio) {
        if (canvasFor(source, folio)) return true;
        const resolved = resolveIiifSource(source);
        if (resolved && !iiifStore.parsedData[resolved]) return true; // manifest not loaded yet
        return !!findManifestPath(source, folio);
    }

    function getImageUrl(source, folio) {
        const hit = canvasFor(source, folio);
        if (hit) return hit.page.imgUrl;
        const path = findManifestPath(source, folio);
        if (path) return path.startsWith('scans/') ? path : `scans/${path}`;
        return `scans/${source}/${folio}.jpg`;
    }

    /** The whole page, downsized: a few hundred kB instead of the full-size image. */
    function getIiifThumbnailUrl(source, folio, maxWidth = 1000) {
        const hit = canvasFor(source, folio);
        if (!hit || !hit.page.serviceUrl) return getImageUrl(source, folio);
        return iiifPageUrl(hit.page.serviceUrl, maxWidth);
    }

    /** An Image API URL for a region ("x,y,w,h" or "pct:x,y,w,h") of the page. */
    function getIiifRegionUrl(source, folio, regionStr, width = 'full') {
        const hit = canvasFor(source, folio);
        if (!hit || !hit.page.serviceUrl) return null;
        return iiifRegionUrl(hit.page.serviceUrl, regionStr, width);
    }

    /** A canvas by its 0-based position (for exports that name pages by index). */
    function getIiifCanvasByIndex(source, index) {
        const key = resolveIiifSource(source);
        const data = key && iiifStore.parsedData[key];
        if (!Array.isArray(data) || index < 0 || index >= data.length) return null;
        const c = data[index];
        return { serviceUrl: c.serviceUrl, label: c.folio, imgUrl: c.imgUrl };
    }

    /** The folio a canvas shows, in the transcription's spelling; null if none. */
    function folioOfCanvas(source, index) {
        return pageMapFor(source)?.folioOf(index) ?? null;
    }

    function getIiifCanvasCount(source) {
        const key = resolveIiifSource(source);
        const data = key && iiifStore.parsedData[key];
        return Array.isArray(data) ? data.length : 0;
    }

    // --- Transcription -------------------------------------------------------

    /** Whether the transcription has this page (any spelling of its folio). */
    function hasTranscriptionData(source, folio) {
        if (!folio) return false;
        const id = folioIdentity(folio);
        return dataFoliosOf(source).some(f => folioIdentity(f) === id);
    }

    /** { source: [page names] } of the local scans and the parsed manifests. */
    function getManifestStructure() {
        const structure = {};
        for (const entry of manifest.value) {
            const parts = entry.split('/');
            if (parts.length < 2) continue;
            const source = parts[parts.length - 2];
            const filename = parts[parts.length - 1];
            const dot = filename.lastIndexOf('.');
            (structure[source] ||= new Set()).add(dot > 0 ? filename.substring(0, dot) : filename);
        }
        for (const src in iiifStore.parsedData) {
            const set = (structure[src] ||= new Set());
            for (const item of iiifStore.parsedData[src]) set.add(item.folio);
        }
        const result = {};
        for (const src in structure) result[src] = Array.from(structure[src]).sort(compareFolios);
        return result;
    }

    return {
        manifest,
        loadManifest,
        loaded,
        resolveIiifSource,
        getStandardSource,
        pageMapFor,
        getAlignmentReport,
        canvasFor,
        pageFolio,
        canvasLabel,
        folioOfCanvas,
        hasImage,
        getImageUrl,
        getIiifThumbnailUrl,
        getIiifRegionUrl,
        getIiifCanvasByIndex,
        getIiifCanvasCount,
        hasTranscriptionData,
        getManifestStructure
    };
}
