import { computed } from 'vue';
import { useOmmrStore } from '../../stores/ommr';
import { useOmmrSettingsStore } from '../../stores/ommrSettings';
import { useIiifStore } from '../../stores/iiif';
import { useImageManifest } from '../useImageManifest';
import { shiftFolio, canvasIndexFor as canvasIndex } from '../../utils/ommrFolioMap';

const EMPTY_DESKEW = { angle: 0, w: 0, h: 0 };

/**
 * Where the explorer gets page images from, and how an OMMR folio maps onto them.
 *
 * Everything here is derived from the stores (the loaded OMMR dataset, the
 * per-manuscript settings in `ommrSettings`, the IIIF manifests), so it keeps no
 * state of its own. A snippet's page image comes from one of
 *   - the deskewed image bundled with the export (exact; no calibration needed), or
 *   - the manuscript's IIIF service, addressed by folio label or by canvas position.
 *
 * @param {{ preferIiif: import('vue').Ref<boolean> }} prefs
 */
export function useOmmrImages({ preferIiif }) {
    const ommrStore = useOmmrStore();
    const ommrSettings = useOmmrSettingsStore();
    const iiifStore = useIiifStore();
    const { getIiifRegionUrl, getStandardSource, getStandardFolio, getIiifCanvasByIndex, getIiifCanvasCount } = useImageManifest();

    const activeSource = () => ommrStore.activeSource;

    // --- Per-source corrections (part of the workspace) ---
    const calibration = computed(() => ommrSettings.calibrationFor(activeSource()));
    const updateCalib = patch => ommrSettings.updateCalibration(activeSource(), patch);
    const resetCalib = () => ommrSettings.resetCalibration(activeSource());

    const folioOffset = computed(() => ommrSettings.folioOffsetFor(activeSource()));
    const setFolioOffset = offset => ommrSettings.setFolioOffset(activeSource(), offset);

    const indexMode = computed(() => ommrSettings.indexModeFor(activeSource()));
    const setIndexMode = on => ommrSettings.setIndexMode(activeSource(), on);

    // --- Deskew data from the export ---
    const pageMeta = computed(() => ommrStore.currentDataset?.pageMeta || null);
    const deskewFor = folio => ommrStore.getFolioMeta(activeSource(), folio) || EMPTY_DESKEW;
    /** How many loaded folios carry a nonzero deskew angle. */
    const deskewedCount = computed(() => {
        const meta = ommrStore.currentDataset?.folioMeta || {};
        return Object.values(meta).filter(m => m && m.angle).length;
    });

    // --- Folio -> image ---
    /** The folio label the IIIF side uses for an OMMR folio, after the offset. */
    const effFolio = folio => shiftFolio(folio, folioOffset.value);
    /** Canvas position (0-based) for a page named by index, with the offset applied. */
    const canvasIndexFor = folio => canvasIndex(folio, folioOffset.value);

    const hasLocalImage = snip => !!ommrStore.getLocalImageUrl(snip.source, snip.folio);
    const preferLocal = snip => !preferIiif.value && hasLocalImage(snip);
    /** The bundled page image for a snippet or line ('' when IIIF should be used). */
    const localFor = snip => (preferIiif.value ? '' : (ommrStore.getLocalImageUrl(snip.source, snip.folio) || ''));
    /** IIIF service URL for a snippet when addressed by canvas position (else ''). */
    const serviceUrlFor = snip => {
        if (!indexMode.value || preferLocal(snip)) return '';
        const idx = canvasIndexFor(snip.folio);
        if (idx === null) return '';
        return getIiifCanvasByIndex(snip.source, idx)?.serviceUrl || '';
    };

    /** OMMR folio -> the folio label a manuscript annotation should carry (honours offset and index mode). */
    function manuscriptFolio(folio, source) {
        if (indexMode.value) {
            const idx = canvasIndexFor(folio);
            const canvas = idx !== null ? getIiifCanvasByIndex(source, idx) : null;
            if (canvas?.label) return canvas.label;
        }
        const eff = effFolio(folio);
        return getStandardFolio(source, eff) || eff;
    }

    // --- IIIF manifest binding for the active source ---
    /** The IIIF key the active OMMR source resolves to (e.g. "Pa 14819"). */
    const resolvedIiifKey = computed(() => {
        if (!activeSource()) return null;
        const sample = ommrStore.activeSnippets[0];
        return getStandardSource(activeSource(), sample ? sample.folio : '');
    });

    const manifestState = computed(() => {
        const key = resolvedIiifKey.value;
        if (!key) return { status: 'none', key: null, url: null };
        const url = iiifStore.links[key] || null;
        const status = iiifStore.manifestStatus[key]?.status;
        if (!url) return { status: 'unlinked', key, url: null };
        if (status === 'loading') return { status: 'loading', key, url };
        if (status === 'error') return { status: 'error', key, url, error: iiifStore.manifestStatus[key]?.error };
        if (iiifStore.parsedData[key]?.length) return { status: 'ok', key, url, count: iiifStore.parsedData[key].length };
        return { status: 'linked', key, url };
    });

    /** Whether a snippet's page image can be resolved (index mode or label mode). */
    function folioResolves(snip) {
        if (indexMode.value) {
            const idx = canvasIndexFor(snip.folio);
            return idx !== null && !!getIiifCanvasByIndex(snip.source, idx);
        }
        return !!getIiifRegionUrl(snip.source, effFolio(snip.folio), 'pct:0,0,5,5', 80);
    }

    // Sample distinct folios and count how many resolve to a IIIF region URL.
    // Several folios (not just the first) avoid false "no images" warnings when one
    // label happens not to match.
    const resolveSample = computed(() => {
        void iiifStore.parsedData; // recompute when a manifest loads
        void activeSource();
        const snippets = ommrStore.activeSnippets;
        if (!snippets.length) return { total: 0, matched: 0 };
        const seen = new Set();
        let matched = 0;
        for (const s of snippets) {
            if (seen.has(s.folio)) continue;
            seen.add(s.folio);
            if (folioResolves(s)) matched++;
            if (seen.size >= 30) break; // cap the probe
        }
        return { total: seen.size, matched };
    });

    /** Images count as resolvable if at least one sampled folio matches: tolerant of partial label mismatches. */
    const imagesResolve = computed(() => resolveSample.value.matched > 0);

    /** Per-folio resolution for the settings diagnostic (the first few folios). */
    const sampleDiagnostics = computed(() => {
        void iiifStore.parsedData;
        void folioOffset.value;
        void ommrSettings.indexModes;
        const seen = new Set();
        const out = [];
        for (const s of ommrStore.activeSnippets) {
            if (seen.has(s.folio)) continue;
            seen.add(s.folio);
            let eff, label, matched;
            if (indexMode.value) {
                const idx = canvasIndexFor(s.folio);
                const canvas = idx !== null ? getIiifCanvasByIndex(s.source, idx) : null;
                eff = idx !== null ? `#${idx + 1}` : '?';
                matched = !!canvas;
                label = canvas?.label || '';
            } else {
                eff = effFolio(s.folio);
                matched = !!getIiifRegionUrl(s.source, eff, 'pct:0,0,5,5', 80);
                label = getStandardFolio(s.source, eff);
            }
            out.push({ folio: s.folio, eff, matched, label });
            if (out.length >= 8) break;
        }
        return out;
    });

    /** A representative snippet for the calibration live preview: one with several notes, if any. */
    const sampleSnippet = computed(() => {
        const list = ommrStore.activeSnippets;
        if (!list.length) return null;
        return list.find(s => s.noteCount >= 2) || list[0];
    });

    /** Any image source available (the export's own images OR IIIF). */
    const anyImages = computed(() => ommrStore.hasLocalImages || imagesResolve.value);

    async function ensureActiveManifest() {
        const key = resolvedIiifKey.value;
        if (key && iiifStore.links[key] && !iiifStore.parsedData[key]) {
            await iiifStore.ensureLoaded(key);
        }
    }

    return {
        calibration, updateCalib, resetCalib,
        folioOffset, setFolioOffset,
        indexMode, setIndexMode,
        pageMeta, deskewFor, deskewedCount, sampleSnippet,
        effFolio, canvasIndexFor, localFor, serviceUrlFor, manuscriptFolio,
        resolvedIiifKey, manifestState, resolveSample, imagesResolve, sampleDiagnostics, anyImages,
        ensureActiveManifest,
        // re-exported for the templates
        getIiifCanvasByIndex, getIiifCanvasCount
    };
}
