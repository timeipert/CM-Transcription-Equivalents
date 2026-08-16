
/**
 * Compares two folio strings based on standard manuscript conventions.
 * 1. Integer part
 * 2. Suffix (r/v, or bis/ter etc.)
 * Order: 1 < 1r < 1v < 2
 */
export function compareFolios(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;

    const parse = (s) => {
        // Matches start integer, then optional suffix
        const m = String(s).match(/^(\d+)\s*(.*)$/);
        if (m) {
            return { num: parseInt(m[1], 10), suffix: m[2].trim().toLowerCase() };
        }
        return { num: -1, suffix: s }; // fallback for non-numeric like "Guard"
    };

    const pa = parse(a);
    const pb = parse(b);

    if (pa.num !== pb.num) {
        // If one is non-numeric (-1) and other is numeric, numeric usually comes *after* front matter labels?
        // Or "Guard" < 1 ?
        // Let's standard numeric sort. -1 will be first.
        return pa.num - pb.num;
    }

    // Suffix comparison
    // "r" (recto) vs "" (implicit recto) vs "v" (verso)
    // Preference: "" < "r" < "v"? OR "" == "r" < "v"
    // Alphabetical works for r < v.
    // But "" comes before "r". 
    // Usually "113" is used OR "113r".
    // ASCII "" is less than "r".
    return pa.suffix.localeCompare(pb.suffix);
}

/**
 * Strip brackets, whitespace, and special notation marks for natural alphabetical sorting.
 */
export function cleanPatternForSorting(p) {
    if (!p) return '';
    return String(p).replace(/[\[\]\{\}\*\(\)]/g, '').trim();
}

/**
 * Compares pattern IDs.
 * Pure numbers come first (sorted numerically).
 * Mixed IDs (with suffixes like 10+, 10+20-) come later (sorted naturally).
 */
export function comparePatternIds(a, b) {
    if (!a && b) return 1;
    if (a && !b) return -1;
    if (!a && !b) return 0;

    const isPureNumA = /^\d+$/.test(a);
    const isPureNumB = /^\d+$/.test(b);

    if (isPureNumA && !isPureNumB) return -1;
    if (!isPureNumA && isPureNumB) return 1;

    // Both pure numbers OR both mixed strings
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Compare two chant patterns based on a given sort mode: 'freq' | 'length' | 'alpha' | 'id'.
 * @param {string} a 
 * @param {string} b 
 * @param {string} mode - 'freq' | 'length' | 'alpha' | 'id'
 * @param {Map<string, number>|Object<string, number>} [freqMap={}] 
 */
export function compareChantPatterns(a, b, mode = 'freq', freqMap = {}) {
    if (!a && b) return 1;
    if (a && !b) return -1;
    if (!a && !b) return 0;

    // Special Start token always first
    if (a === "(Start)" && b !== "(Start)") return -1;
    if (b === "(Start)" && a !== "(Start)") return 1;

    if (mode === 'freq') {
        const countA = (freqMap instanceof Map ? freqMap.get(a) : freqMap[a]) || 0;
        const countB = (freqMap instanceof Map ? freqMap.get(b) : freqMap[b]) || 0;
        if (countA !== countB) return countB - countA; // highest frequency first
        // Secondary: length then alphabetical
        const cleanA = cleanPatternForSorting(a);
        const cleanB = cleanPatternForSorting(b);
        if (cleanA.length !== cleanB.length) return cleanA.length - cleanB.length;
        return cleanA.localeCompare(cleanB);
    }

    if (mode === 'length') {
        const cleanA = cleanPatternForSorting(a);
        const cleanB = cleanPatternForSorting(b);
        if (cleanA.length !== cleanB.length) return cleanA.length - cleanB.length;
        return cleanA.localeCompare(cleanB);
    }

    if (mode === 'alpha') {
        const cleanA = cleanPatternForSorting(a);
        const cleanB = cleanPatternForSorting(b);
        if (cleanA !== cleanB) return cleanA.localeCompare(cleanB);
        return a.localeCompare(b);
    }

    // Default 'id' / natural sorting
    return comparePatternIds(a, b);
}
