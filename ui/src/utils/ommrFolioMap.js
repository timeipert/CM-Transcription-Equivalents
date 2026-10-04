/**
 * Mapping OMMR folios onto IIIF canvases.
 *
 * OMMR names a page after its scan; the IIIF manifest has its own page order.
 * When the two disagree by a constant number of pages the user sets a folio
 * offset, measured in "sides" (one recto or verso step). When OMMR names pages by
 * index ("…_022") the manifest is addressed by canvas position instead.
 */

/**
 * "47r"/"47v"/"47" shifted by `offset` sides: the folio label the IIIF side uses.
 * A label that does not start with a number is returned unchanged.
 */
export function shiftFolio(folio, offset) {
    if (!offset) return folio;
    const m = String(folio).match(/^(\d+)\s*([rv])?/i);
    if (!m) return folio;
    const num = parseInt(m[1], 10);
    const side = (m[2] || 'r').toLowerCase();
    let idx = num * 2 + (side === 'v' ? 1 : 0) + offset;
    if (idx < 0) idx = 0;
    return `${Math.floor(idx / 2)}${idx % 2 === 0 ? 'r' : 'v'}`;
}

/** The number a page name ends in ("…_022" → 22), or null. */
export function trailingNumber(folio) {
    const m = String(folio).match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : null;
}

/** The 0-based canvas position of a page named by index, shifted by `offset`; null if it has no number. */
export function canvasIndexFor(folio, offset = 0) {
    const n = trailingNumber(folio);
    return n === null ? null : n - 1 + offset;
}
