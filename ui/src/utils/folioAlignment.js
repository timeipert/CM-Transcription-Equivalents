/**
 * Aligning IIIF canvas labels to transcription folios.
 *
 * Real manifests name their canvases however the digitizing workflow felt
 * like: clean folios ("12v"), pagination ("24"), zero-padded scan numbers
 * ("(0001)"), noisy filenames ("phys_Chorbuch_00001"), and the occasional
 * structural marker with no page number at all ("Fehlende Zeilen").
 *
 * The model this module implements is a single running count over the canvas
 * sequence, the same way a person would do it by hand: walk the pages in
 * order, and whenever a page's own label doesn't say what it is, assume it is
 * simply the next one after whatever was last confirmed. A label that DOES
 * say what it is (an explicit "f. 12v", or a person's manual pin) resyncs the
 * count for everything that follows — so fixing one drifted page fixes every
 * page after it, not just that one. A label with no digits at all is not a
 * page (a divider, a section title) and is skipped without disturbing the
 * count. This is deliberately optimistic: it counts by default rather than
 * refusing to guess, because in practice a whole run of scans is almost
 * always exactly countable, and the rare page that isn't gets fixed with one
 * pin rather than by aligning every page by hand.
 */

import { folioToIndex, indexToFolio } from './folioMath';

const SIDE_WORD_V = /\b(verso|vo)\b/;
const SIDE_WORD_R = /\b(recto|ro)\b/;

// An explicit folio/leaf marker: "f. 11v", "fol. 7", "blatt 3", "bl. 12".
// Only means what it says for foliated data — a manuscript's own leaf count.
const FOLIO_MARKER = /(?:^|[\s(_.-])(?:fol|f|blatt|bl)\.?\s*(0*\d+)\s*([rv])?\b/;

// An explicit page/scan marker: "p. 24", "page 24", "pg 24", "Seite 24".
// Kept separate from FOLIO_MARKER: a scanning workflow's running "Seite N"
// caption is frequently just a capture sequence, unrelated to the source's
// own foliation — trusted for identity only against paginated data.
const PAGE_MARKER = /(?:^|[\s(_.-])(?:seite|page|pg|p)\.?\s*(0*\d+)\b/;

// A recto/verso letter fused to a number, e.g. "12v", "0007r" — always a
// foliation cue, regardless of surrounding words.
const FUSED_SIDE = /(0*\d+)\s*([rv])\b/;

// Sub-image counters that are not the folio/page number, e.g. "vue 3",
// "view 2", "img 04", "scan 1", "plate 7".
const VIEW_COUNTER = /\b(?:vue|view|views|img|image|scan|tafel|plate|pl|no|nr)\.?\s*\d+/g;

function stripWrappers(text) {
    return text.replace(/[()[\]{}]/g, ' ');
}

function detectWordSide(text) {
    if (SIDE_WORD_V.test(text)) return 'v';
    if (SIDE_WORD_R.test(text)) return 'r';
    return null;
}

function isPadded(digits) {
    return /^0\d/.test(digits);
}

/**
 * Read one label into a structured folio guess.
 *
 * `markerKind` records *why* a number was chosen:
 *   - 'folio': an explicit leaf marker — identity for foliated data.
 *   - 'fused': a number fused to r/v — identity for foliated data.
 *   - 'page':  an explicit page/scan marker — identity for paginated data
 *              only; never assumed to equal a foliation number.
 *   - 'plain': a bare number with no marker — most such numbers are just a
 *              scan/filename sequence, so this is never treated as identity
 *              (see `inferAlignment`); it still drives the running count.
 *   - null:    no digits at all — this is a structural divider, not a page.
 *
 * Any prefix or suffix text (a shelfmark, a filename stem like
 * "phys_Chorbuch_", a sub-image counter like "vue 3") is discarded — only the
 * digit value that identifies the page survives.
 *
 * @param {string} raw
 * @returns {{ raw: string, num: number|null, side: 'r'|'v'|null,
 *            padded: boolean, markerKind: string|null, confident: boolean }}
 */
export function parseFolioLabel(raw) {
    const empty = { raw: raw ?? '', num: null, side: null, padded: false, markerKind: null, confident: false };
    if (raw === null || raw === undefined) return empty;

    let s = String(raw).toLowerCase().trim();
    if (!s) return empty;
    s = stripWrappers(s);

    const wordSide = detectWordSide(s);

    const marker = s.match(FOLIO_MARKER);
    if (marker) {
        return {
            raw, num: parseInt(marker[1], 10), side: marker[2] || wordSide,
            padded: isPadded(marker[1]), markerKind: 'folio', confident: true
        };
    }

    const fused = s.match(FUSED_SIDE);
    if (fused) {
        return {
            raw, num: parseInt(fused[1], 10), side: fused[2],
            padded: isPadded(fused[1]), markerKind: 'fused', confident: true
        };
    }

    const page = s.match(PAGE_MARKER);
    if (page) {
        return {
            raw, num: parseInt(page[1], 10), side: wordSide,
            padded: isPadded(page[1]), markerKind: 'page', confident: true
        };
    }

    // No marker word: fall back to a plain number, ignoring sub-image
    // counters so "sheet 12 view 3" reads as 12, not 3, and ignoring any
    // non-digit prefix so "phys_Chorbuch_00001" reads as 1.
    const withoutCounters = s.replace(VIEW_COUNTER, ' ');
    const numbers = (withoutCounters.match(/0*\d+/g) || s.match(/0*\d+/g));
    if (!numbers) return { raw, num: null, side: wordSide, padded: false, markerKind: null, confident: false };

    const chosen = numbers[numbers.length - 1];
    return {
        raw, num: parseInt(chosen, 10), side: wordSide,
        padded: isPadded(chosen), markerKind: 'plain',
        confident: wordSide !== null || numbers.length === 1
    };
}

/** A label with no digits at all is a structural divider, not a page. */
export function isDividerLabel(raw) {
    return parseFolioLabel(raw).num === null;
}

/**
 * Classify how a label *set* numbers its pages. No longer used to gate
 * matching (see module doc — plain numbers always count rather than being
 * conditionally trusted as identity), but kept as a diagnostic: useful for
 * showing a person what kind of numbering a manifest appears to use.
 *
 * @param {string[]} labels
 * @returns {{ scheme: 'foliated'|'paginated'|'index'|'noisy' }}
 */
export function detectScheme(labels) {
    const list = (labels || []).map(parseFolioLabel);
    const parsed = list.filter(p => p.num !== null);
    const total = list.length || 1;
    const withSide = parsed.filter(p => p.side !== null);

    const parsedRatio = parsed.length / total;
    const sideRatio = parsed.length ? withSide.length / parsed.length : 0;

    if (parsedRatio < 0.6) return { scheme: 'noisy' };
    if (sideRatio >= 0.3) return { scheme: 'foliated' };

    const nums = parsed.map(p => p.num);
    const strictlySequential = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    const mostlyPadded = parsed.filter(p => p.padded).length / parsed.length >= 0.5;
    if (strictlySequential && (mostlyPadded || nums[0] <= 1)) return { scheme: 'index' };

    return { scheme: 'paginated' };
}

/** A parsed label's position in the data's own numbering (its folio index). */
function parsedToIndex(parsed, dataType) {
    if (parsed.num === null) return null;
    const label = `${parsed.num}${parsed.side || ''}`;
    return folioToIndex(label, dataType);
}

/**
 * Whether a label's own marker means the same thing the data means. A bare
 * number ('plain') is trusted as identity only for paginated data, where a
 * scan's filename number plausibly *is* the printed page number; for foliated
 * data a bare number is ambiguous (recto or verso?) and is always resolved by
 * counting instead.
 */
function identityAllowed(markerKind, dataType) {
    if (markerKind === 'folio' || markerKind === 'fused') return dataType === 'foliated';
    if (markerKind === 'page' || markerKind === 'plain') return dataType === 'paginated';
    return false;
}

function entry(canvasIndex, originalLabel, resolvedFolio, via, confidence, isDivider = false) {
    return { canvasIndex, originalLabel, resolvedFolio, via, confidence, isDivider };
}

/**
 * Build the canvas → folio mapping as one running count over the manifest.
 *
 * The count walks the *folio index space* (1r, 1v, 2r, 2v, … or 1, 2, 3, … for
 * pagination) — not the list of folios the transcription happens to have rows
 * for. A manuscript is transcribed unevenly (a handful of pieces here, a gap,
 * a few more there), so anchoring the count to only the annotated folios would
 * make it run out of places to count as soon as it passed the last annotated
 * one, exactly where most of the manifest still is. Counting through the
 * folio space itself keeps going for the whole manifest, and still resyncs
 * correctly the moment a real label or a pin gives it a genuine position,
 * whether or not that folio happens to carry any transcription.
 *
 * @param {Object} args
 * @param {string[]} args.canvasLabels   canvas labels in manifest order
 * @param {string} [args.dataType]       'foliated' | 'paginated'
 * @param {Object} [args.pins]           { [canvasIndex]: folio }; an empty
 *   string pins the canvas to "not a page", forcing it out of the count the
 *   same way a divider is — for the rare stray page (a color chart, a ruler)
 *   that carries a digit but isn't part of the sequence.
 * @returns {{ entries: Array, matched: number, dividerCount: number }}
 */
export function inferAlignment(args) {
    const { canvasLabels = [], dataType = 'foliated', pins = {} } = args;

    let runningIndex = 1; // the folio index the next uncertain canvas will count as
    let matched = 0;
    let dividerCount = 0;

    const entries = canvasLabels.map((label, canvasIndex) => {
        if (Object.prototype.hasOwnProperty.call(pins, canvasIndex)) {
            const pinned = pins[canvasIndex];
            if (!pinned) {
                dividerCount++;
                return entry(canvasIndex, label, null, 'skipped', 0, true);
            }
            matched++;
            const idx = folioToIndex(pinned, dataType);
            if (idx !== null) runningIndex = idx + 1;
            return entry(canvasIndex, label, pinned, 'pinned', 1);
        }

        const parsed = parseFolioLabel(label);

        if (parsed.num === null) {
            dividerCount++;
            return entry(canvasIndex, label, null, 'divider', 0, true);
        }

        if (parsed.confident && identityAllowed(parsed.markerKind, dataType)) {
            const idx = parsedToIndex(parsed, dataType);
            if (idx !== null) {
                matched++;
                runningIndex = idx + 1;
                return entry(canvasIndex, label, indexToFolio(idx, dataType), 'label', 0.95);
            }
        }

        const resolved = indexToFolio(runningIndex, dataType);
        runningIndex++;
        if (resolved) {
            matched++;
            return entry(canvasIndex, label, resolved, 'position', 0.75);
        }
        return entry(canvasIndex, label, null, 'none', 0);
    });

    return { entries, matched, dividerCount };
}

/**
 * Legacy offset alignment (base offset plus jump rules), kept so an existing
 * configuration keeps resolving while the inference engine handles the rest.
 * Returns the expected IIIF label for a data folio, or null.
 */
export function applyOffsetAlignment(dataFolio, align) {
    if (!align) return null;
    const dataIndex = folioToIndex(dataFolio, align.dataType);
    if (dataIndex === null) return null;

    let totalOffset = align.offset || 0;
    for (const rule of align.adjustments || []) {
        const ruleIndex = folioToIndex(rule.fromFolio, align.dataType);
        if (ruleIndex !== null && dataIndex >= ruleIndex) totalOffset += (rule.adjust || 0);
    }
    return indexToFolio(dataIndex + totalOffset, align.iiifType);
}
