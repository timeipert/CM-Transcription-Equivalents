import { ref } from 'vue';

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

    function hasImage(source, folio) {
        return !!findManifestPath(source, folio);
    }

    function getImageUrl(source, folio) {
        const path = findManifestPath(source, folio);
        if (path) {
            if (path.startsWith('scans/')) return path;
            return `scans/${path}`;
        }
        return `scans/${source}/${folio}.jpg`;
    }

    /**
     * Returns the base directory in the manifest (e.g., "Pa 1235") 
     * which serves as the unique identifier for physical manuscripts.
     */
    function getStandardSource(source, folio) {
        const path = findManifestPath(source, folio);
        if (path) {
            const parts = path.split('/');
            // If it's scans/Source/Folio.jpg, skip scans
            if (parts[0] === 'scans' && parts.length > 2) {
                return parts[parts.length - 2];
            }
            if (parts.length >= 2) {
                return parts[parts.length - 2];
            }
        }
        // Fallback to original
        return source ? String(source).trim() : source;
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

        // Convert Sets to Arrays for easier consumption
        const result = {};
        for (const src in structure) {
            result[src] = Array.from(structure[src]).sort();
        }
        return result;
    }

    return {
        manifest,
        loadManifest,
        hasImage,
        getImageUrl,
        getStandardSource,
        getManifestStructure,
        loaded
    };
}
