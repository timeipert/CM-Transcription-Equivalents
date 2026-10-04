/**
 * Polygon helpers for annotation geometry.
 *
 * Everything in the app that stores a shape stores it as an SVG-style points
 * string in percent of the page, "x,y x,y x,y …" (0-100 on both axes). This is
 * the one place that string is parsed and measured; the callers used to carry
 * their own copies, which disagreed about edge cases (empty input, stray
 * whitespace, NaN tokens).
 */

/**
 * Parse "x,y x,y …" into [[x, y], …]. Malformed tokens are dropped rather than
 * poisoning the result with NaN.
 * @param {string} str
 * @returns {Array<[number, number]>}
 */
export function parsePoints(str) {
    if (!str) return [];
    return /** @type {Array<[number, number]>} */ (String(str)
        .trim()
        .split(/\s+/)
        .map(token => token.split(',').map(parseFloat))
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
}

/** Format [[x, y], …] back into a points string. */
export function formatPoints(points) {
    return points.map(([x, y]) => `${x},${y}`).join(' ');
}

/**
 * Axis-aligned bounding rectangle of a points string, in percent.
 * An empty or unparseable string yields a zero rectangle.
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function pointsToRect(str) {
    const pts = parsePoints(str);
    if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Convert a {x, y, w, h} rectangle into a four-corner polygon string, clamped to
 * the page (0-100) and rounded to two decimals.
 */
export function rectToPolygon(rect) {
    if (!rect) return '0,0 0,0 0,0 0,0';
    const x1 = Math.max(0, +rect.x).toFixed(2);
    const y1 = Math.max(0, +rect.y).toFixed(2);
    const x2 = Math.min(100, +(rect.x + rect.w)).toFixed(2);
    const y2 = Math.min(100, +(rect.y + rect.h)).toFixed(2);
    return `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`;
}

/** Centre of the bounding rectangle, or null for an empty shape. */
export function pointsCenter(str) {
    const pts = parsePoints(str);
    if (!pts.length) return null;
    const r = pointsToRect(str);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Polygon area by the shoelace formula (always non-negative). */
export function polygonArea(pts) {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum) / 2;
}

/**
 * Whether (x, y) lies inside the polygon (ray casting). A shape with fewer than
 * three vertices has no interior, so it falls back to its bounding rectangle.
 * @param {number} x
 * @param {number} y
 * @param {Array<[number, number]>} pts
 */
export function pointInPolygon(x, y, pts) {
    if (pts.length < 3) {
        if (!pts.length) return false;
        const xs = pts.map(p => p[0]);
        const ys = pts.map(p => p[1]);
        return x >= Math.min(...xs) && x <= Math.max(...xs)
            && y >= Math.min(...ys) && y <= Math.max(...ys);
    }
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}
