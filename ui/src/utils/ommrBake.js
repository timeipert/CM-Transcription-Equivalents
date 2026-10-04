/**
 * "Baking" OMMR corrections into data before it is imported into a manuscript.
 *
 * OMMR measures its coordinates on a DESKEWED copy of each page, and names the
 * page folders its own way. The manuscript view works against the IIIF original.
 * So that the imported annotations render correctly without any explorer-side
 * transform, an import first
 *   - rotates every coordinate back out of the deskewed space onto the original,
 *   - gives each item the folio label the manuscript actually uses.
 * These are the pure functions that do it; deciding which folio label applies is
 * left to the caller (it depends on the offset, index mode and IIIF manifest).
 */

import { undeskewPoint } from './ommrGeometry';

/**
 * Rotate a "x,y x,y …" string back onto the un-deskewed page.
 * @param {string} str
 * @param {number} angle deskewing_degrees of the page
 * @param {number} W page width in pixels
 * @param {number} H page height in pixels
 */
export function undeskewPointsStr(str, angle, W, H) {
    if (!angle || !W || !H || !str) return str;
    return str.split(/\s+/).map(tok => {
        const [x, y] = tok.split(',').map(parseFloat);
        if (isNaN(x) || isNaN(y)) return tok;
        const [ox, oy] = undeskewPoint(x, y, angle, W, H);
        return `${ox.toFixed(3)},${oy.toFixed(3)}`;
    }).join(' ');
}

/** The axis-aligned box that contains the rotated-back corners of `bbox`. */
export function undeskewBbox(bbox, angle, W, H) {
    if (!angle || !W || !H || !bbox) return bbox;
    const corners = [
        [bbox.x, bbox.y], [bbox.x + bbox.w, bbox.y],
        [bbox.x + bbox.w, bbox.y + bbox.h], [bbox.x, bbox.y + bbox.h]
    ].map(([x, y]) => undeskewPoint(x, y, angle, W, H));
    const xs = corners.map(c => c[0]);
    const ys = corners.map(c => c[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
        x: +minX.toFixed(3),
        y: +minY.toFixed(3),
        w: +(Math.max(...xs) - minX).toFixed(3),
        h: +(Math.max(...ys) - minY).toFixed(3)
    };
}

/**
 * @param {Object} snippet an OMMR neume snippet
 * @param {{ deskew: { angle, w, h }, folio: string }} context the page's deskew
 *   data and the folio label to give the result
 */
export function bakeSnippet(snippet, { deskew, folio }) {
    return {
        ...snippet,
        folio,
        points: undeskewPointsStr(snippet.points, deskew.angle, deskew.w, deskew.h),
        notePoints: (snippet.notePoints || []).map(p => {
            const [x, y] = undeskewPoint(p.x, p.y, deskew.angle, deskew.w, deskew.h);
            return { x: +x.toFixed(3), y: +y.toFixed(3) };
        })
    };
}

/** As `bakeSnippet`, for a staff line (its box and the neumes drawn on it). */
export function bakeLine(line, { deskew, folio }) {
    return {
        ...line,
        folio,
        bbox: undeskewBbox(line.bbox, deskew.angle, deskew.w, deskew.h),
        neumes: (line.neumes || []).map(n => ({
            ...n,
            points: undeskewPointsStr(n.points, deskew.angle, deskew.w, deskew.h)
        }))
    };
}

