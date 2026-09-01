/**
 * Types for source metadata attributes.
 *
 * Values are always stored as the text the user typed — a manuscript's date is
 * often "11th c. (2nd half)" or "s. XI/XII", and normalising that away would
 * lose scholarship. Types only add interpretation on top: a `century` field is
 * additionally *parsed* to a number so the public view can offer a range
 * filter, and a value that cannot be parsed still displays, it just sits
 * outside the range filter.
 */

export const META_TYPES = [
    {
        key: 'text',
        label: 'Text',
        hint: 'Free text. Filtered by picking one of the values in use.'
    },
    {
        key: 'century',
        label: 'Century / dating',
        hint: 'Parsed to a century number (11, "11th c.", "s. XI" all work). Filtered with a range slider.'
    },
    {
        key: 'location',
        label: 'Location',
        hint: 'Place of origin or holding. Filtered by picking a place, with type-ahead.'
    }
];

export function isMetaType(t) {
    return META_TYPES.some(x => x.key === t);
}

const ROMAN = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

function romanToInt(s) {
    let total = 0, prev = 0;
    for (const ch of s.toLowerCase().split('').reverse()) {
        const v = ROMAN[ch];
        if (!v) return null;
        total += v < prev ? -v : v;
        prev = Math.max(prev, v);
    }
    return total || null;
}

/**
 * Best-effort century number from a free-text dating.
 *
 * Handles the forms that actually turn up in catalogues:
 *   "11", "11th", "11th c.", "s. XI", "XI", "saec. XI/XII" -> 11
 *   "c. 1100", "1150"                                      -> 12
 * A range takes its first element, since that is what sorting should key on.
 *
 * @returns {number|null} the century, or null when nothing sensible parses out
 */
export function parseCentury(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (!s) return null;

    // A 3-4 digit year ("1150", "c. 1100") -> the century containing it.
    const year = s.match(/\b(\d{3,4})\b/);
    if (year) {
        const y = parseInt(year[1], 10);
        if (y > 0) return Math.floor((y - 1) / 100) + 1;
    }

    // A plain/ordinal century number ("11", "11th c.", "11.-12.").
    // No trailing \b: an ordinal suffix is a word character, so "11th" would not
    // match — only assert that the number does not continue.
    const num = s.match(/\b(\d{1,2})(?!\d)/);
    if (num) {
        const n = parseInt(num[1], 10);
        if (n >= 1 && n <= 21) return n;
    }

    // Roman numerals, optionally after "s." / "saec." and before a range.
    const roman = s.match(/\b([ivxlcdm]+)\b/i);
    if (roman) {
        const n = romanToInt(roman[1]);
        if (n && n >= 1 && n <= 21) return n;
    }

    return null;
}

/** Century -> a compact label for axis ends and chips, e.g. 11 -> "11th c." */
export function centuryLabel(n) {
    if (n === null || n === undefined) return '';
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]} c.`;
}
