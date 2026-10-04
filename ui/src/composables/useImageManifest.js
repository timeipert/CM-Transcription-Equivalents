import { ref, computed } from 'vue';
import { useIiifStore } from '../stores/iiif';
import { useTranscriptionData } from './useTranscriptionData';
import { useSettingsStore } from '../stores/settings';
import { folioToIndex, indexToFolio } from '../utils/folioMath';
import { inferAlignment } from '../utils/folioAlignment';
import { iiifPageUrl, iiifRegionUrl } from '../services/iiif/imageUrl';

const normCache = new Map();

// Per-source Vue `computed()` refs, created lazily and kept for the rest of
// the session. A `computed()` tracks its own reactive dependencies and
// invalidates itself automatically — unlike a plain Map cleared by a
// `watch()`, it does not depend on which component happened to be mounted
// when it was first created, so it can never go stale for the rest of a
// session the way a watcher tied to a since-unmounted component's effect
// scope silently would.
const alignReportComputedCache = new Map();
const stdFolioSetComputedCache = new Map();

export function normalizeFolioName(name) {
    if (!name) return "";
    if (normCache.has(name)) return normCache.get(name);
    
    let s = String(name).toLowerCase();
    s = s.replace(/\s+/g, '');
    s = s.replace(/[()]/g, '');
    // Strip leading folio/page/foliation prefixes: "f.", "fol.", "f", "p.", "bl."
    s = s.replace(/^(fol|f|p|bl|blatt|seite|s)\.?(?=\d)/, '');
    s = s.replace(/^0+/, '');
    // Handle explicit recto/verso
    s = s.replace(/recto/g, 'r');
    s = s.replace(/verso/g, 'v');
    // Remove structural suffixes like -a, /1
    s = s.replace(/[-/][a-g1-9]$/, '');
    // Remove trailing letter suffixes (22b -> 22)
    s = s.replace(/([0-9rv])[a-g]$/, '$1');
    
    // If resulting string is pure digits, append 'r'
    if (/^\d+$/.test(s)) {
        s += 'r';
    }
    
    normCache.set(name, s);
    return s;
}

export function compareFolios(a, b) {
    const parse = (f) => {
        const str = String(f || '').toLowerCase().trim();
        const m = str.match(/^0*(\d+)/);
        if (!m) return { n: 999999, w: 99, s: str };
        const n = parseInt(m[1], 10);
        const s = str.substring(m[0].length).trim();
        let w;
        if (s === '') w = 1;
        else if (s === 'r') w = 2;
        else if (s === 'v') w = 3;
        else if (s === 'a') w = 4;
        else if (s === 'b') w = 5;
        else w = 6;
        return { n, w, s };
    };
    const pa = parse(a), pb = parse(b);
    if (pa.n !== pb.n) return pa.n - pb.n;
    if (pa.w !== pb.w) return pa.w - pb.w;
    return pa.s.localeCompare(pb.s);
}

const manifest = ref(new Set());
const loaded = ref(false);

async function loadManifest() {
    if (loaded.value) return;

    try {
        // Automatically find all images in public/scans.
        // We use eager: false (default) and ONLY read the keys (paths).
        // We do not import the modules, preventing the "Assets in public..." warning.
        const files = import.meta.glob('../../public/scans/**/*.{jpg,jpeg,png}');

        const paths = Object.keys(files).map(path => {
            // path is like "../../public/scans/Source/Folio.jpg"
            // We want "scans/Source/Folio.jpg" (relative to public root for <img>)
            // or just clean relative paths.
            // valid for <img> src: "scans/..." if base is root.

            // Remove "../../public/"
            return path.replace('../../public/', '');
        });

        manifest.value = new Set(paths);
        loaded.value = true;
    } catch (e) {
        console.error("Failed to load image manifest", e);
    }
}

export function useImageManifest() {
    const iiifStore = useIiifStore();
    const settings = useSettingsStore();

    if (!loaded.value) {
        loadManifest();
    }

    // Helper to find the actual path in the manifest
    function findManifestPath(source, folio) {
        if (!source || !folio) return null;

        const s = String(source).trim();
        const f = String(folio).trim();

        // 1. Try Exact Construction
        const exact = `${s}/${f}.jpg`;
        if (manifest.value.has(exact)) return exact;

        // 2. Try with "scans/" prefix (if manifest has it)
        const scansPrefixed = `scans/${s}/${f}.jpg`;
        if (manifest.value.has(scansPrefixed)) return scansPrefixed;

        // 3. Try cleaning source (e.g. "Pa 1235-9-1" -> "Pa 1235")
        // Rule: try split by '-' and take first part? Or take first 2 parts?
        // Let's try matching the start.

        // Iterative search (slower but robust for mismatch)
        // We look for an entry that ENDS with `/${f}.jpg` and STARTS with something similar to `s`.

        for (const entry of manifest.value) {
            // Check folio match
            if (entry.endsWith(`/${f}.jpg`) || entry.endsWith(`/${f}.jpeg`)) {
                // Check source match
                // If entry is "Pa 1235/9.jpg", and s is "Pa 1235-9-1"
                // Check if s starts with the directory part of entry? 
                // Or if entry directory is contained in s?

                const parts = entry.split('/');
                if (parts.length >= 2) {
                    const dir = parts[parts.length - 2]; // "Pa 1235"
                    // If "Pa 1235" is in "Pa 1235-9-1" -> Match
                    if (s.includes(dir)) {
                        return entry;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Resolve a compound source identifier (e.g. 'Kön D-219v-a-19') to
     * the base IIIF source key (e.g. 'Kön D').
     * Results are cached for performance.
     */
    function resolveIiifSource(source) {
        const s = String(source).trim();
        // 1. Exact match
        if (iiifStore.parsedData[s] || iiifStore.links[s]) return s;
        // 2. Find longest IIIF key that is a prefix of the source
        let bestMatch = null;
        let bestLen = 0;
        for (const key of Object.keys(iiifStore.links)) {
            if (s.startsWith(key) && key.length > bestLen) {
                const rest = s.substring(key.length);
                if (rest === '' || rest.startsWith('-') || rest.startsWith(' ')) {
                    bestMatch = key;
                }
            }
        }
        return bestMatch;
    }

    /** Data folios for a resolved IIIF key, in reading order. */
    function dataFoliosForKey(iiifKey) {
        const { sourceFolios } = useTranscriptionData();
        const set = sourceFolios.value[iiifKey];
        if (!set || set.size === 0) return [];
        return Array.from(set).sort(compareFolios);
    }

    /**
     * The canvas → folio mapping for a source. Every canvas keeps its original
     * IIIF label alongside the folio it was matched to and how confident that
     * match is, which is what the alignment review and the sidebar render.
     *
     * Kept as a lazily-created `computed()` per source (see
     * `alignReportComputedCache` above) rather than a plain value cache: a
     * pin or a data-type change must be reflected immediately, and a
     * `computed()` does that automatically and correctly however many
     * components mount and unmount around it.
     */
    function getAlignmentReport(source) {
        const iiifKey = resolveIiifSource(source);
        if (!iiifKey) return null;
        if (!iiifStore.parsedData[iiifKey]) return null;

        if (!alignReportComputedCache.has(iiifKey)) {
            alignReportComputedCache.set(iiifKey, computed(() => buildAlignmentReport(iiifKey, source)));
        }
        return alignReportComputedCache.get(iiifKey).value;
    }

    function buildAlignmentReport(iiifKey, source) {
        const canvases = iiifStore.parsedData[iiifKey];
        if (!canvases || canvases.length === 0) return null;

        const align = settings.sourceAlignments[iiifKey] || settings.sourceAlignments[source] || null;
        const dataFolios = dataFoliosForKey(iiifKey);
        const dataType = align?.dataType
            || (dataFolios.some(f => /[rv]$/i.test(String(f))) ? 'foliated' : 'paginated');

        const inferred = inferAlignment({
            canvasLabels: canvases.map(c => c.originalFolio || c.folio),
            dataType,
            pins: align?.pins || {}
        });

        const entries = inferred.entries.map(e => ({ ...e, canvas: canvases[e.canvasIndex] }));

        // A folio can in principle be claimed by more than one canvas (an
        // unrelated section that happens to resolve positionally, alongside the
        // real match) — keep whichever claim the engine trusts more.
        const byFolio = new Map();
        for (const e of entries) {
            if (!e.resolvedFolio) continue;
            const key = normalizeFolioName(e.resolvedFolio);
            const existing = byFolio.get(key);
            if (!existing || e.confidence > existing.confidence) byFolio.set(key, e);
        }

        // The count walks the whole folio space (see folioAlignment.js), so
        // almost every canvas resolves to *some* folio — `withDataCount` is the
        // more meaningful number: how many of those resolved folios actually
        // carry transcription rows, versus just being a page with no data yet.
        const dataFolioSet = new Set(dataFolios.map(f => normalizeFolioName(f)));
        const withDataCount = entries.filter(e => e.resolvedFolio && dataFolioSet.has(normalizeFolioName(e.resolvedFolio))).length;

        return {
            key: iiifKey,
            dataType,
            matched: inferred.matched,
            withDataCount,
            dividerCount: inferred.dividerCount,
            total: canvases.length,
            dataFolios,
            entries,
            byFolio
        };
    }

    function fuzzyMatchIiifFolio(source, folioName) {
        const iiifKey = resolveIiifSource(source);
        if (!iiifKey || !iiifStore.parsedData[iiifKey]) return null;

        const data = iiifStore.parsedData[iiifKey];

        // 0a. Resolved alignment report (overrides, label identity, positional).
        const report = getAlignmentReport(source);
        if (report) {
            const hit = report.byFolio.get(normalizeFolioName(folioName));
            if (hit && hit.canvas) return { ...hit.canvas, resolvedSource: iiifKey };
        }

        // 0b. Legacy offset/jump alignment, kept for existing configurations.
        const align = settings.sourceAlignments[source] || settings.sourceAlignments[iiifKey];

        if (align && (align.offset || (align.adjustments && align.adjustments.length))) {
            const dataIndex = folioToIndex(folioName, align.dataType);
            if (dataIndex !== null) {
                let totalOffset = align.offset || 0;
                if (align.adjustments && Array.isArray(align.adjustments)) {
                    for (const rule of align.adjustments) {
                        const ruleIdx = folioToIndex(rule.fromFolio, align.dataType);
                        if (ruleIdx !== null && dataIndex >= ruleIdx) {
                            totalOffset += (rule.adjust || 0);
                        }
                    }
                }
                const iiifIndex = dataIndex + totalOffset;
                const expectedIiifLabel = indexToFolio(iiifIndex, align.iiifType);
                
                if (expectedIiifLabel) {
                    const mappedTarget = normalizeFolioName(expectedIiifLabel);
                    // Match against normalized label or original label (useful for padded labels)
                    const exactMatch = data.find(i => normalizeFolioName(i.folio) === mappedTarget || normalizeFolioName(i.originalFolio) === mappedTarget);
                    if (exactMatch) return { ...exactMatch, resolvedSource: iiifKey };
                }
            }
        }

        // 1. Normalized exact match
        const target = normalizeFolioName(folioName);
        let match = data.find(i => normalizeFolioName(i.folio) === target);
        if (match) return { ...match, resolvedSource: iiifKey };

        // 2. Extract number from folioName (e.g., '22b' -> '22', 'V22' -> '22')
        const numMatch = target.match(/(\d+)/);
        if (numMatch) {
            const num = numMatch[1];
            
            // Try to find a canvas label that also contains this number
            // or follows a standard recto/verso pattern
            match = data.find(i => {
                const lbl = normalizeFolioName(i.folio);
                if (lbl === target) return true;
                
                // If label is "22r" or "22v" or "22", it's a match for "22b"
                const lblNumMatch = lbl.match(/(\d+)/);
                if (lblNumMatch && lblNumMatch[1] === num) {
                    // Check side if possible
                    const isVerso = target.includes('v');
                    const lblIsVerso = lbl.includes('v');
                    if (isVerso === lblIsVerso) return true;
                    // If no side info in label, but number matches, it's a candidate
                    if (!lbl.includes('r') && !lbl.includes('v')) return true;
                }
                return false;
            });

            if (match) return { ...match, resolvedSource: iiifKey };
        }

        return null;
    }

    function hasImage(source, folio) {
        if (fuzzyMatchIiifFolio(source, folio)) return true;
        const resolved = resolveIiifSource(source);
        if (resolved && !iiifStore.parsedData[resolved]) return true;
        return !!findManifestPath(source, folio);
    }

    function getImageUrl(source, folio) {
        const iiifMatch = fuzzyMatchIiifFolio(source, folio);
        if (iiifMatch) return iiifMatch.imgUrl;
        const path = findManifestPath(source, folio);
        if (path) {
            if (path.startsWith('scans/')) return path;
            return `scans/${path}`;
        }
        return `scans/${source}/${folio}.jpg`;
    }

    /**
     * Returns a IIIF Image API URL for the full page but downsized for performance.
     * This ensures that component logic (like AnnotationCutout) which expects 
     * full-page aspect ratios continues to work perfectly while only loading 
     * a few hundred kilobytes instead of 50MB.
     */
    function getIiifThumbnailUrl(source, folio, maxWidth = 1000) {
        const iiifMatch = fuzzyMatchIiifFolio(source, folio);
        if (!iiifMatch || !iiifMatch.serviceUrl) {
            return getImageUrl(source, folio); 
        }
        return iiifPageUrl(iiifMatch.serviceUrl, maxWidth);
    }

    /**
     * Returns a IIIF Image API URL for a specific region.
     * regionStr: "x,y,w,h" or "pct:x,y,w,h"
     */
    function getIiifRegionUrl(source, folio, regionStr, width = "full") {
        const iiifMatch = fuzzyMatchIiifFolio(source, folio);
        if (!iiifMatch || !iiifMatch.serviceUrl) return null;
        return iiifRegionUrl(iiifMatch.serviceUrl, regionStr, width);
    }

    /**
     * Returns the base IIIF source key for physical manuscripts.
     */
    /**
     * Resolve a canvas by its 0-based position in the manifest (for exports
     * that name pages by index rather than by folio label). Returns the
     * canvas's IIIF service URL + label, or null.
     */
    function getIiifCanvasByIndex(source, index) {
        const key = resolveIiifSource(source);
        const data = key && iiifStore.parsedData[key];
        if (!data || !Array.isArray(data)) return null;
        if (index < 0 || index >= data.length) return null;
        const c = data[index];
        return { serviceUrl: c.serviceUrl, label: c.folio, imgUrl: c.imgUrl };
    }

    /** Number of canvases available for a source (0 if unloaded). */
    function getIiifCanvasCount(source) {
        const key = resolveIiifSource(source);
        const data = key && iiifStore.parsedData[key];
        return Array.isArray(data) ? data.length : 0;
    }

    function getStandardSource(source, folio) {
        const iiifMatch = fuzzyMatchIiifFolio(source, folio);
        if (iiifMatch) {
            return iiifMatch.resolvedSource;
        }
        const resolved = resolveIiifSource(source);
        if (resolved) return resolved;
        const path = findManifestPath(source, folio);
        if (path) {
            const parts = path.split('/');
            if (parts[0] === 'scans' && parts.length > 2) {
                return parts[parts.length - 2];
            }
            if (parts.length >= 2) {
                return parts[parts.length - 2];
            }
        }
        return source ? String(source).trim() : source;
    }

    /**
     * Returns the physical folio name from the IIIF manifest. Not cached here:
     * `fuzzyMatchIiifFolio` already resolves through the memoized alignment
     * report below, so this call is already cheap (an O(1) map lookup), and a
     * second cache on top of it would only reintroduce the staleness risk a
     * plain cache has no reliable way to invalidate.
     */
    function getStandardFolio(source, folio) {
        const iiifMatch = fuzzyMatchIiifFolio(source, folio);
        return iiifMatch ? iiifMatch.folio : (folio ? String(folio).replace(/^p\.?\s*/i, '').trim() : folio);
    }

    function hasTranscriptionData(source, folio) {
        const { sourceFolios } = useTranscriptionData();
        if (!sourceFolios.value[source]) return false;

        if (!stdFolioSetComputedCache.has(source)) {
            stdFolioSetComputedCache.set(source, computed(() => {
                const srcData = useTranscriptionData().sourceFolios.value[source];
                const stdSet = new Set();
                if (srcData) for (const f of srcData) stdSet.add(getStandardFolio(source, f));
                return stdSet;
            }));
        }

        const stdFol = getStandardFolio(source, folio);
        return stdFolioSetComputedCache.get(source).value.has(stdFol);
    }

    /**
     * Parses the current manifest set into a structured object:
     * { "Source Name": ["Folio1", "Folio2"], ... }
     */
    function getManifestStructure() {
        const structure = {};
        for (const entry of manifest.value) {
            // Expected formats: "Source/Folio.jpg" or "scans/Source/Folio.jpg"
            const parts = entry.split('/');

            // Need at least Source/Folio.jpg
            if (parts.length < 2) continue;

            let source, filename;

            // Check for "scans" prefix
            if (parts[0] === 'scans' && parts.length >= 3) {
                source = parts[parts.length - 2];
                filename = parts[parts.length - 1]; // "Folio.jpg" or "Folio.jpeg"
            } else {
                // Assume "Source/Folio.jpg"
                source = parts[parts.length - 2];
                filename = parts[parts.length - 1];
            }

            // Extract folio name from filename (remove extension)
            // e.g. "145v.jpg" -> "145v"
            const lastDot = filename.lastIndexOf('.');
            const folio = lastDot > 0 ? filename.substring(0, lastDot) : filename;

            if (!structure[source]) {
                structure[source] = new Set();
            }
            structure[source].add(folio);
        }

        // Add IIIF
        for (const src in iiifStore.parsedData) {
            if (!structure[src]) structure[src] = new Set();
            for (const item of iiifStore.parsedData[src]) {
                structure[src].add(item.folio);
            }
        }

        // Convert Sets to Arrays for easier consumption
        const result = {};
        for (const src in structure) {
            result[src] = Array.from(structure[src]).sort(compareFolios);
        }
        return result;
    }

    return {
        manifest,
        loadManifest,
        hasImage,
        getImageUrl,
        getIiifThumbnailUrl,
        getIiifRegionUrl,
        getIiifCanvasByIndex,
        getIiifCanvasCount,
        getStandardSource,
        getStandardFolio,
        hasTranscriptionData,
        getManifestStructure,
        getAlignmentReport,
        resolveIiifSource,
        loaded
    };
}
