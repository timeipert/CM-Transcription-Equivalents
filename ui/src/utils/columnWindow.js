/**
 * Horizontal windowing for very wide tables (the Global Analysis matrix has
 * about 3,700 pattern columns; rendering all of them for 50 source rows meant
 * ~390,000 DOM nodes).
 *
 * The table uses `table-layout: fixed`, so every column has a width that is known
 * without measuring. That makes the visible slice a pure function of the scroll
 * position: pick the columns that overlap the viewport (plus an overscan margin)
 * and stand in for the rest with two empty spacer cells.
 */

/** Width in px reserved for one column (cell padding and border included). */
export const MIN_COLUMN_WIDTH = 64;
/** Per character of the pattern code: an SVG note takes 10 px, a letter about as much. */
const PX_PER_CODE_CHAR = 10;
/** Cell padding (2 x 10 px) plus the right border. */
const CELL_CHROME = 21;
/** Expand arrow (15 px) plus the 8 px gap before it, with some slack. */
const GROUP_ARROW_WIDTH = 34;

/**
 * Deterministic width of a column from its pattern code. The code length is an
 * upper bound for the number of notes (brackets and sign suffixes count as characters
 * but draw no note), so the content never overflows the reserved width.
 *
 * @param {string} name pattern code or group name, e.g. "[*u]dd"
 * @param {boolean} [isGroup] group headers also hold the expand arrow and its gap
 */
export function estimateColumnWidth(name, isGroup = false) {
    const width = String(name).length * PX_PER_CODE_CHAR + CELL_CHROME + 10 + (isGroup ? GROUP_ARROW_WIDTH : 0);
    return Math.max(MIN_COLUMN_WIDTH, width);
}

/**
 * Prefix sums of the column widths.
 *
 * @param {number[]} widths
 * @returns {{ offsets: number[], total: number }} `offsets[i]` is the left edge of
 *          column i; `offsets[widths.length]` equals `total`.
 */
export function buildColumnLayout(widths) {
    const offsets = new Array(widths.length + 1);
    offsets[0] = 0;
    for (let i = 0; i < widths.length; i++) offsets[i + 1] = offsets[i] + widths[i];
    return { offsets, total: offsets[widths.length] };
}

/**
 * Columns to render for a scroll position.
 *
 * @param {number[]} offsets from {@link buildColumnLayout}
 * @param {number} scrollLeft horizontal scroll position of the scroll container
 * @param {number} viewportWidth visible width of the scroll container
 * @param {number} [overscan] extra px rendered on each side, so fast scrolling shows no blank area
 * @returns {{ start: number, end: number }} half-open range `[start, end)` of column indexes
 */
export function visibleColumnRange(offsets, scrollLeft, viewportWidth, overscan = 600) {
    const count = offsets.length - 1;
    if (count <= 0) return { start: 0, end: 0 };
    const left = Math.max(0, scrollLeft - overscan);
    const right = scrollLeft + viewportWidth + overscan;
    // First column whose right edge is past `left`.
    let lo = 0;
    let hi = count;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (offsets[mid + 1] <= left) lo = mid + 1;
        else hi = mid;
    }
    const start = lo;
    // First column whose left edge is at or past `right`.
    lo = start;
    hi = count;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (offsets[mid] < right) lo = mid + 1;
        else hi = mid;
    }
    return { start, end: lo };
}
