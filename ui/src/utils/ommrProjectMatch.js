/**
 * Match an arbitrary folder name ("Pa_14819", "paris_14819", "14819") to one of
 * the project's manuscripts ("Pa 14819"), so an OMMR export finds its manuscript
 * without the user naming it.
 *
 * Tried in order of how sure each match is: exact (any case), identical once
 * reduced to letters and digits, the one manuscript sharing the number in the
 * name, then one name containing the other.
 *
 * @param {string} folderOrName
 * @param {string[]} sourceNames the project's manuscript names
 * @returns {string|null}
 */
export function findMatchingProjectSource(folderOrName, sourceNames) {
    if (!folderOrName || !sourceNames || !sourceNames.length) return null;
    const raw = String(folderOrName).trim();

    // 1. Exact match (case-insensitive)
    const exact = sourceNames.find(s => s.toLowerCase() === raw.toLowerCase());
    if (exact) return exact;

    // 2. Same letters and digits ('pa_14819' -> 'pa14819' matches 'Pa 14819')
    const norm = str => String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = norm(raw);
    if (target) {
        const same = sourceNames.find(s => norm(s) === target);
        if (same) return same;
    }

    // 3. A distinctive number ('14819' in 'paris_14819') — only if exactly one manuscript has it
    const numMatch = raw.match(/(\d+)/);
    if (numMatch) {
        const withNumber = sourceNames.filter(s => {
            const n = s.match(/(\d+)/);
            return n && n[1] === numMatch[1];
        });
        if (withNumber.length === 1) return withNumber[0];
    }

    // 4. One contains the other
    const contained = sourceNames.find(s => target && (target.includes(norm(s)) || norm(s).includes(target)));
    return contained || null;
}
