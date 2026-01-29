
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
