
export function renderSvg(pattern, glyphs, isGroup) {
    if (!pattern || !glyphs) return emptySvg();

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
    const p = pattern;

    while (i < p.length) {
        const char = p[i];
        if (char === '[' || char === '{') {
            inGroup = true;
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
            if (['L', 'Q', 'O', 'S'].includes(nextC)) {
                suffix += nextC;
                i++;
            } else {
                break;
            }
        }

        if (['*', 'u', 'd', 'e'].includes(main)) {
            tokens.push({ type: main, special: suffix, group: inGroup });
        } else if (/[a-zA-Z]/.test(main) && isGroup) {
            if (['u', 'd', 'e'].includes(main)) {
                tokens.push({ type: main, special: suffix, group: inGroup });
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
            if (!curGroup) curGroup = { startX: px, y: py };
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

    const width = Math.max((points.length) * xStep + 10, 20);
    const topBuffer = 40;
    const bottomBuffer = 20;
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
        svg += `<path d="${pathD}" stroke="#555" stroke-width="1.2" fill="none" />`;
    }

    // Draw Notes
    for (const pt of points) {
        let gInfo = glyphs["note"];
        let scale = 0.85; // Increased
        const color = "black";
        const special = pt.token.special;

        if (special.includes("O")) gInfo = glyphs["oriscus"];
        else if (special.includes("Q")) gInfo = glyphs["quilisma"];
        else if (special.includes("S")) gInfo = glyphs["strophicus"];

        if (special.includes("L")) {
            const type = pt.token.type;
            if (type === 'u') gInfo = glyphs["ascending"];
            else if (type === 'd') gInfo = glyphs["descending"];
            else {
                scale = 0.65; // Increased
            }
        }

        // Fallback if glyph missing
        if (!gInfo) gInfo = { viewBox: "0 0 10 10", d: "" };

        const tx = pt.x;
        const ty = pt.y + yOffset;
        const vba = gInfo.viewBox.split(" ").map(Number);
        const minX = vba[0];
        const minY_vb = vba[1];
        const gw = vba[2];
        const gh = vba[3];
        const cx = minX + (gw / 2);
        const cy = minY_vb + (gh / 2);
        const finalX = tx - (cx * scale);
        const finalY = ty - (cy * scale);

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
