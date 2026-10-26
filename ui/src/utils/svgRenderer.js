
const inkBoundsCache = new Map();

/**
 * Bounding box of the ink of an SVG path (`d` attribute), in the glyph's own
 * coordinates. Control points are included, so curves may be over-estimated by a
 * pixel or two, which is harmless for sizing. Returns null when the path cannot be
 * read, so callers fall back to the glyph's viewBox.
 *
 * Needed because the ascending/descending glyphs (`LA`/`LD`) sit in a 12x60 viewBox
 * of which only about 18 units carry ink; the note head is centred on the viewBox,
 * so their stems reach far beyond the height that the note positions alone imply.
 */
export function pathInkBounds(d) {
    if (inkBoundsCache.has(d)) return inkBoundsCache.get(d);
    let result = null;
    try {
        const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
        let i = 0, x = 0, y = 0, startX = 0, startY = 0, cmd = '';
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const next = () => parseFloat(tokens[i++]);
        const include = (px, py) => {
            minX = Math.min(minX, px); maxX = Math.max(maxX, px);
            minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        };
        // Number of coordinates per command letter; the last two are the end point.
        const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
        let ok = true;
        while (i < tokens.length && ok) {
            if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
            const upper = cmd.toUpperCase();
            const rel = cmd !== upper;
            if (!(upper in arity)) { ok = false; break; }
            if (upper === 'Z') { x = startX; y = startY; continue; }
            const v = [];
            for (let k = 0; k < arity[upper]; k++) v.push(next());
            if (v.some(Number.isNaN)) { ok = false; break; }
            if (upper === 'H') { x = rel ? x + v[0] : v[0]; }
            else if (upper === 'V') { y = rel ? y + v[0] : v[0]; }
            else if (upper === 'A') {
                x = rel ? x + v[5] : v[5];
                y = rel ? y + v[6] : v[6];
            } else {
                for (let k = 0; k < v.length - 2; k += 2) include(rel ? x + v[k] : v[k], rel ? y + v[k + 1] : v[k + 1]);
                x = rel ? x + v[v.length - 2] : v[v.length - 2];
                y = rel ? y + v[v.length - 1] : v[v.length - 1];
                if (upper === 'M') {
                    startX = x; startY = y;
                    cmd = rel ? 'l' : 'L'; // further pairs after a moveto are linetos
                }
            }
            include(x, y);
        }
        if (ok && Number.isFinite(minX)) result = { minX, maxX, minY, maxY };
    } catch (e) {
        result = null;
    }
    inkBoundsCache.set(d, result);
    return result;
}

/**
 * @param {string} pattern
 * @param {Object} glyphs built-in glyph map
 * @param {boolean} isGroup
 * @param {Object} [customSigns] map of custom sign key -> { viewBox, d }, letting
 *        projects attach per-note signs (e.g. a virga marker) that change the code.
 */
export function renderSvg(pattern, glyphs, isGroup, customSigns = {}) {
    if (!pattern || !glyphs) return emptySvg();
    const signKeys = customSigns ? Object.keys(customSigns) : [];

    // 1. Handle (Start) special case: Single Note
    if (pattern === "(Start)") {
        const width = 20;
        const height = 20;
        const gInfo = glyphs["note"] || { viewBox: "0 0 10 10", d: "" };

        const vba = gInfo.viewBox.split(" ").map(Number);
        const cx = vba[0] + (vba[2] / 2);
        const cy = vba[1] + (vba[3] / 2);

        // Center it: translate(5, 5) scale(0.8) translate(-cx, -cy)
        // We'll construct the transform string
        const transform = `translate(10, 10) scale(0.8) translate(-${cx},-${cy})`;

        const content = `<g transform="${transform}"><path d="${gInfo.d}" fill="black" /></g>`;
        // Wrap in valid SVG root for Canvg/XML parsers
        const fullSvg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
        return { width, height, content: fullSvg, viewBox: `0 0 ${width} ${height}` };
    }

    // Parse pattern
    const tokens = [];
    let i = 0;
    let inGroup = false;
    let groupId = 0; // which bracketed group a note belongs to; 0 = none
    const p = pattern;

    while (i < p.length) {
        const char = p[i];
        if (char === '[' || char === '{') {
            inGroup = true;
            groupId++;
            i++;
            continue;
        }
        if (char === ']' || char === '}') {
            inGroup = false;
            i++;
            continue;
        }

        const main = char;
        if (main === '(') { i++; continue; } // Skip (Start) logic if embedded?

        i++;

        let suffix = "";
        while (i < p.length) {
            const nextC = p[i];
            if (['L', 'Q', 'O', 'S', 'A', 'D'].includes(nextC) || signKeys.includes(nextC)) {
                suffix += nextC;
                i++;
            } else {
                break;
            }
        }

        if (['*', 'u', 'd', 'e'].includes(main)) {
            tokens.push({ type: main, special: suffix, group: inGroup ? groupId : 0 });
        } else if (/[a-zA-Z]/.test(main) && isGroup) {
            if (['u', 'd', 'e'].includes(main)) {
                tokens.push({ type: main, special: suffix, group: inGroup ? groupId : 0 });
            }
        }
    }

    // Fix: Implicit start note for groups (e.g. "dd" means 3 notes)
    if (tokens.length > 0 && ['u', 'd', 'e'].includes(tokens[0].type)) {
        tokens.unshift({ type: 'start', special: '', group: false });
    }

    const xStep = 10;
    const yStep = 8;

    let currentY = 0;
    const points = [];
    const groupBrackets = [];
    let curGroup = null;
    let minY = 0, maxY = 0;

    for (let k = 0; k < tokens.length; k++) {
        const t = tokens[k];
        if (t.type === 'u') currentY -= 1;
        else if (t.type === 'd') currentY += 1;

        if (currentY < minY) minY = currentY;
        if (currentY > maxY) maxY = currentY;

        const px = k * xStep + 10;
        const py = currentY * yStep;

        points.push({ x: px, y: py, token: t });

        if (t.group) {
            // Two groups written next to each other ("[*u][udL]") get a bracket each.
            if (curGroup && curGroup.id !== t.group) {
                groupBrackets.push(curGroup);
                curGroup = null;
            }
            if (!curGroup) curGroup = { id: t.group, startX: px, y: py };
            curGroup.endX = px;
            curGroup.y = Math.min(curGroup.y, py);
        } else {
            if (curGroup) {
                groupBrackets.push(curGroup);
                curGroup = null;
            }
        }
    }
    if (curGroup) groupBrackets.push(curGroup);

    // Choose the glyph for every note first: tall glyphs (LA/LD) decide how much
    // room the picture needs above and below the note positions.
    for (const pt of points) {
        const special = pt.token.special;
        let gInfo = glyphs["note"];
        let scale = 0.85; // Increased

        if (special.includes("O")) gInfo = glyphs["oriscus"];
        else if (special.includes("Q")) gInfo = glyphs["quilisma"];
        else if (special.includes("S")) gInfo = glyphs["strophicus"];

        if (special.includes("LA")) {
            gInfo = glyphs["ascending"];
        } else if (special.includes("LD")) {
            gInfo = glyphs["descending"];
        } else if (special.includes("L")) {
            scale = 0.65; // Normal liquescence: just make the note smaller
        }

        // Custom project signs (code variants) override the note glyph.
        for (const key of signKeys) {
            if (special.includes(key) && customSigns[key]) {
                gInfo = customSigns[key];
                break;
            }
        }

        // Fallback if glyph missing
        if (!gInfo) gInfo = { viewBox: "0 0 10 10", d: "" };

        const vba = gInfo.viewBox.split(" ").map(Number);
        const cx = vba[0] + (vba[2] / 2);
        const cy = vba[1] + (vba[3] / 2);
        // Vertical extent of the drawn ink relative to the note position (the glyph
        // is centred on its viewBox, so the ink is not necessarily centred).
        const ink = pathInkBounds(gInfo.d) || { minY: vba[1], maxY: vba[1] + vba[3] };
        pt.glyph = {
            gInfo, scale, cx, cy,
            above: (cy - ink.minY) * scale,
            below: (ink.maxY - cy) * scale,
        };
    }

    const width = Math.max((points.length) * xStep + 10, 20);
    let topBuffer = 24; // Increased to prevent bracket clipping
    let bottomBuffer = 8;
    for (const pt of points) {
        // Room above/below each note position that its glyph needs, plus 1px margin.
        topBuffer = Math.max(topBuffer, pt.glyph.above - (pt.y - minY * yStep) + 1);
        bottomBuffer = Math.max(bottomBuffer, pt.glyph.below - (maxY * yStep - pt.y) + 1);
    }
    topBuffer = Math.ceil(topBuffer);
    bottomBuffer = Math.ceil(bottomBuffer);
    const height = (maxY - minY) * yStep + topBuffer + bottomBuffer;
    const yOffset = -minY * yStep + topBuffer;

    let svg = '';

    // Draw Brackets
    for (const g of groupBrackets) {
        // Allow single-item groups by adding padding
        const bx1 = g.startX;
        const bx2 = g.endX;
        const by = g.y + yOffset - 12;
        const xStart = bx1 - 4; // Increased padding
        const xEnd = bx2 + 4;   // Increased padding
        const brWidth = xEnd - xStart;

        const pathD = `M ${xStart} ${by} l 0 -3 a 3 3 0 0 1 3 -3 l ${brWidth - 6} 0 a 3 3 0 0 1 3 3 l 0 3`;
        svg += `<path d="${pathD}" stroke="var(--color-text-muted)" stroke-width="1.2" fill="none" />`;
    }

    // Draw Notes
    for (const pt of points) {
        const { gInfo, scale, cx, cy } = pt.glyph;
        const color = "black";
        const finalX = pt.x - (cx * scale);
        const finalY = pt.y + yOffset - (cy * scale);

        svg += `<g transform="translate(${finalX},${finalY}) scale(${scale})">`;
        svg += `<path d="${gInfo.d}" fill="${color}" />`;
        svg += `</g>`;
    }

    // Wrap in valid SVG root for Canvg/XML parsers
    const fullSvg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
    return { width, height, content: fullSvg, viewBox: `0 0 ${width} ${height}` };
}

function emptySvg() {
    return { width: 20, height: 20, content: '', viewBox: '0 0 20 20' };
}
