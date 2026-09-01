/**
 * Types for source metadata attributes.
 *
 * Values are always stored as the text the user typed — a manuscript's date is
 * often "s. XI/XII" or "11th c. (2nd half)", and normalising that away would
 * lose scholarship. Types only add interpretation on top: a `century` field is
 * additionally parsed to a *year range*, so the public view can offer a
 * timeline filter. A value that cannot be parsed still displays; it simply sits
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
        label: 'Date / century',
        hint: 'Read as a year range ("11th c.", "s. XI/XII", "c. 1100", "1050–1075"). Filtered on a draggable timeline.'
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

/** Inclusive first and last year of a century: 11 -> [1001, 1100]. */
function centurySpan(c) {
    return [(c - 1) * 100 + 1, c * 100];
}

/**
 * Qualifiers that narrow a century, in Latin, English and German forms.
 * Each maps to a fraction of the century as [from, to] in 0..1.
 */
const QUALIFIERS = [
    { re: /\b(in\.?|init\.?|initium|beginning|anfang|early|frühe?)\b/i, span: [0, 1 / 3] },
    { re: /\b(med\.?|medio|middle|mitte|mid)\b/i, span: [1 / 3, 2 / 3] },
    { re: /\b(ex\.?|exeunte|end|ende|late|späte?)\b/i, span: [2 / 3, 1] },
    { re: /\b(1\s*\/\s*2|1st half|first half|1\.?\s*hälfte|erste hälfte)\b/i, span: [0, 0.5] },
    { re: /\b(2\s*\/\s*2|2nd half|second half|2\.?\s*hälfte|zweite hälfte)\b/i, span: [0.5, 1] },
    { re: /\b(1\s*\/\s*4|1st quarter|first quarter|1\.?\s*viertel)\b/i, span: [0, 0.25] },
    { re: /\b(2\s*\/\s*4|2nd quarter|second quarter|2\.?\s*viertel)\b/i, span: [0.25, 0.5] },
    { re: /\b(3\s*\/\s*4|3rd quarter|third quarter|3\.?\s*viertel)\b/i, span: [0.5, 0.75] },
    { re: /\b(4\s*\/\s*4|4th quarter|fourth quarter|last quarter|4\.?\s*viertel)\b/i, span: [0.75, 1] }
];

function applyQualifier(text, [lo, hi]) {
    for (const q of QUALIFIERS) {
        if (q.re.test(text)) {
            const width = hi - lo + 1;
            return [
                Math.round(lo + width * q.span[0]),
                Math.round(lo + width * q.span[1]) - 1
            ];
        }
    }
    return [lo, hi];
}

/** How much slack "c." / "ca." / "um" implies around a single year. */
const CIRCA_SLACK = 25;

/**
 * Read a free-text dating into an inclusive year range.
 *
 * Handles the forms that actually turn up in manuscript catalogues:
 *   "11th c.", "s. XI", "saec. XI", "11. Jh."   -> 1001–1100
 *   "s. XI in." / "11th c., 1st half"           -> narrowed within the century
 *   "s. XI/XII"                                 -> straddles the turn (1076–1125)
 *   "11th-12th c.", "s. XI-XII"                 -> 1001–1200
 *   "1050"                                      -> 1050
 *   "c. 1100", "ca. 1100", "um 1100"            -> 1075–1125
 *   "1050-1075", "1050/75"                      -> 1050–1075
 *   "before 1100" / "ante 1100"                 -> open start
 *   "after 1100" / "post 1100"                  -> open end
 *
 * @returns {{start:number, end:number}|null} inclusive years, or null if unreadable
 */
export function parseDateRange(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (!s) return null;

    const circa = /\b(c\.|ca\.?|circa|um|about|etwa|~)\s*\d/i.test(s);

    // --- Explicit year forms -------------------------------------------------
    // "before 1100" / "ante 1100"
    const before = s.match(/\b(?:before|ante|vor|bis)\s+(?:c\.|ca\.?|circa|um)?\s*(\d{3,4})\b/i);
    if (before) return { start: -Infinity, end: parseInt(before[1], 10) };

    // "after 1100" / "post 1100"
    const after = s.match(/\b(?:after|post|nach|ab)\s+(?:c\.|ca\.?|circa|um)?\s*(\d{3,4})\b/i);
    if (after) return { start: parseInt(after[1], 10), end: Infinity };

    // A year range: "1050-1075", "1050–1075", "1050/1075", "1050/75"
    const yearRange = s.match(/\b(\d{3,4})\s*[-–—/]\s*(\d{2,4})\b/);
    if (yearRange) {
        const a = parseInt(yearRange[1], 10);
        let b = parseInt(yearRange[2], 10);
        // "1050/75" means 1075, not the year 75.
        if (b < 100) b = Math.floor(a / 100) * 100 + b;
        if (b >= a) return { start: a, end: b };
    }

    // A single year, possibly circa.
    const singleYear = s.match(/\b(\d{3,4})\b/);
    if (singleYear && !/\d{1,2}\s*(?:st|nd|rd|th|\.)\s*(?:c|cent|jh)/i.test(s)) {
        const y = parseInt(singleYear[1], 10);
        return circa
            ? { start: y - CIRCA_SLACK, end: y + CIRCA_SLACK }
            : { start: y, end: y };
    }

    // --- Century forms -------------------------------------------------------
    // Fraction qualifiers ("2/2", "4/4") must not be mistaken for century
    // numbers, so match the qualifier on the original text but strip fractions
    // before looking for centuries.
    const sCentury = s.replace(/\b\d\s*\/\s*\d\b/g, ' ');
    const centuries = [];

    // Arabic centuries: "11th c.", "11. Jh.", "11.-12. Jh."
    const arabicRe = /\b(\d{1,2})\s*(?:st|nd|rd|th|\.)?\s*(?=[-–—/]|\s*(?:c\b|c\.|cent|century|jh|jahrh))/gi;
    let m;
    while ((m = arabicRe.exec(sCentury)) !== null) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 21) centuries.push(n);
    }

    // Roman centuries: "s. XI", "saec. XI/XII", "XI-XII"
    if (centuries.length === 0) {
        const romanRe = /\b([ivxlcdm]{1,6})\b/gi;
        while ((m = romanRe.exec(sCentury)) !== null) {
            // Skip qualifier words that happen to be valid roman numerals
            // ("in.", "med.", "ex." are handled separately; "i" alone is rare).
            const n = romanToInt(m[1]);
            if (n && n >= 1 && n <= 21) centuries.push(n);
        }
    }

    if (centuries.length === 0) return null;

    const first = Math.min(...centuries);
    const last = Math.max(...centuries);

    // "XI/XII" (a slash, not a dash) means the turn of the century, not both in
    // full — conventionally a band straddling the boundary.
    const isTurn = centuries.length > 1 && /\d\s*\/\s*[ivxlcdm\d]|[ivxlcdm]\s*\/\s*[ivxlcdm]/i.test(sCentury);
    if (isTurn && last === first + 1) {
        const boundary = centurySpan(first)[1]; // last year of the earlier century
        return { start: boundary - 24, end: boundary + 25 };
    }

    const lo = centurySpan(first)[0];
    const hi = centurySpan(last)[1];

    // A qualifier only makes sense for a single century.
    if (first === last) {
        const [qLo, qHi] = applyQualifier(s, [lo, hi]);
        return { start: qLo, end: qHi };
    }
    return { start: lo, end: hi };
}

/** Century number for a value, kept for sorting and compact display. */
export function parseCentury(value) {
    const r = parseDateRange(value);
    if (!r) return null;
    const y = Number.isFinite(r.start) ? r.start : r.end;
    if (!Number.isFinite(y)) return null;
    return Math.floor((y - 1) / 100) + 1;
}

/** Century -> a compact label, e.g. 11 -> "11th c." */
export function centuryLabel(n) {
    if (n === null || n === undefined) return '';
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]} c.`;
}

/** A short readout for a year, used on the timeline. */
export function yearLabel(y) {
    if (y === -Infinity) return 'earliest';
    if (y === Infinity) return 'latest';
    return String(Math.round(y));
}

/** Do two inclusive ranges overlap at all? */
export function rangesOverlap(a, b) {
    if (!a || !b) return false;
    return a.start <= b.end && b.start <= a.end;
}
