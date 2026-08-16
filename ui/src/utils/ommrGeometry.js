/**
 * Geometry helpers for OMMR neume regions.
 *
 * OMMR coordinates are normalized (0-100%) against the *deskewed* page image,
 * which OMMR produced with PIL `Image.rotate(deskewing_degrees)` — a
 * counter-clockwise rotation about the image centre, size-preserving, no scale.
 * To place a region on the un-deskewed IIIF original we rotate every point back.
 */

/**
 * Map a single percent-point from the deskewed image back onto the original.
 * @param {number} px  x in percent (0-100)
 * @param {number} py  y in percent (0-100)
 * @param {number} angle  deskewing_degrees (CCW)
 * @param {number} W  page pixel width
 * @param {number} H  page pixel height
 * @returns {[number, number]} corrected [x, y] in percent
 */
export function undeskewPoint(px, py, angle, W, H) {
    if (!angle || !W || !H) return [px, py];
    const th = (angle * Math.PI) / 180;
    const cos = Math.cos(th), sin = Math.sin(th);
    const dx = (px / 100) * W - W / 2;
    const dy = (py / 100) * H - H / 2;
    // inverse of PIL's forward (image y-down, visual CCW) rotation
    const ox = dx * cos - dy * sin + W / 2;
    const oy = dx * sin + dy * cos + H / 2;
    return [(ox / W) * 100, (oy / H) * 100];
}

/** Parse a "x,y x,y ..." percent-point string into [[x,y],...]. */
export function parsePoints(pointsStr) {
    return (pointsStr || '')
        .split(/\s+/)
        .map(p => p.split(',').map(parseFloat))
        .filter(([x, y]) => !isNaN(x) && !isNaN(y));
}

/**
 * Deskew-correct a polygon (optionally) and return its axis-aligned bounding
 * box, padded, clamped to 0-100. `deskew` = { angle, w, h } or null.
 * @returns {{x,y,w,h}} in percent
 */
export function correctedBox(pointsStr, deskew, padding = 0.35) {
    let pts = parsePoints(pointsStr);
    if (!pts.length) return { x: 0, y: 0, w: 100, h: 100 };

    if (deskew && deskew.angle) {
        pts = pts.map(([x, y]) => undeskewPoint(x, y, deskew.angle, deskew.w, deskew.h));
    }

    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    let w = Math.max(maxX - minX, 0.5);
    let h = Math.max(maxY - minY, 0.5);

    const padX = w * padding;
    const padY = h * padding;
    const x = Math.max(0, Math.min(99, minX - padX));
    const y = Math.max(0, Math.min(99, minY - padY));
    return {
        x,
        y,
        w: Math.max(0.5, Math.min(100 - x, w + padX * 2)),
        h: Math.max(0.5, Math.min(100 - y, h + padY * 2))
    };
}

/** Deskew-corrected polygon as an SVG points string in percent coords. */
export function correctedPolygon(pointsStr, deskew) {
    let pts = parsePoints(pointsStr);
    if (deskew && deskew.angle) {
        pts = pts.map(([x, y]) => undeskewPoint(x, y, deskew.angle, deskew.w, deskew.h));
    }
    return pts.map(([x, y]) => `${x},${y}`).join(' ');
}
