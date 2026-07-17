import { ref, watch } from 'vue';
import { useIiifStore } from '../stores/iiif';
import { useTranscriptionData } from './useTranscriptionData';
import { useSettingsStore } from '../stores/settings';
import { folioToIndex, indexToFolio } from '../utils/folioMath';

const normCache = new Map();
const stdFolioCache = new Map();
const stdSourceFoliosCache = new Map();

let cacheWatcherSetup = false;

export function normalizeFolioName(name) {
    if (!name) return "";
    if (normCache.has(name)) return normCache.get(name);
    
    let s = String(name).toLowerCase();
    s = s.replace(/\s+/g, '');
    s = s.replace(/[()]/g, '');
    s = s.replace(/^p\.?/, '');
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
        let w = 5;
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

    if (!cacheWatcherSetup) {
        watch(() => iiifStore.parsedData, () => {
            stdFolioCache.clear();
            stdSourceFoliosCache.clear();
        }, { deep: true });
        cacheWatcherSetup = true;
    }

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

    function fuzzyMatchIiifFolio(source, folioName) {
        const iiifKey = resolveIiifSource(source);
        if (!iiifKey || !iiifStore.parsedData[iiifKey]) return null;

        const data = iiifStore.parsedData[iiifKey];
        
        // 0. Check Alignment Settings
        const settings = useSettingsStore();
        const align = settings.sourceAlignments[source] || settings.sourceAlignments[iiifKey];
        
        if (align) {
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
        return `${iiifMatch.serviceUrl}/full/${maxWidth},/0/default.jpg`;
    }

    /**
     * Returns a IIIF Image API URL for a specific region.
     * regionStr: "x,y,w,h" or "pct:x,y,w,h"
     */
    function getIiifRegionUrl(source, folio, regionStr, width = "full") {
        const iiifMatch = fuzzyMatchIiifFolio(source, folio);
        if (!iiifMatch || !iiifMatch.serviceUrl) return null;
        return `${iiifMatch.serviceUrl}/${regionStr}/${width}/0/default.jpg`;
    }

    /**
     * Returns the base IIIF source key for physical manuscripts.
     */
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
     * Returns the physical folio name from the IIIF manifest.
     */
    function getStandardFolio(source, folio) {
        const cacheKey = `${source}|||${folio}`;
        if (stdFolioCache.has(cacheKey)) return stdFolioCache.get(cacheKey);

        const iiifMatch = fuzzyMatchIiifFolio(source, folio);
        const res = iiifMatch ? iiifMatch.folio : (folio ? String(folio).replace(/^p\.?\s*/i, '').trim() : folio);
        
        stdFolioCache.set(cacheKey, res);
        return res;
    }

    function hasTranscriptionData(source, folio) {
        const { sourceFolios } = useTranscriptionData();
        const srcData = sourceFolios.value[source];
        if (!srcData) return false;
        
        let cache = stdSourceFoliosCache.get(source);
        if (!cache || cache.rawSize !== srcData.size) {
            const stdSet = new Set();
            for (const f of srcData) {
                stdSet.add(getStandardFolio(source, f));
            }
            cache = { rawSize: srcData.size, stdSet };
            stdSourceFoliosCache.set(source, cache);
        }
        
        const stdFol = getStandardFolio(source, folio);
        return cache.stdSet.has(stdFol);
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
        getStandardSource,
        getStandardFolio,
        hasTranscriptionData,
        getManifestStructure,
        loaded
    };
}
