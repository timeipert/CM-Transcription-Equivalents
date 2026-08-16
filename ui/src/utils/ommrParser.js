/**
 * OMMR4all PCGTS parser and Chant Pattern Extractor.
 * Parses pcgts.json files, extracts neume groupings based on graphical connections,
 * determines chant contours (e.g. *u, [*u], *udd, etc.) and calculates bounding polygons.
 */

// OMMR4all GraphicalConnectionType (database/file_formats/pcgts/page/musicsymbol.py):
// each note's connection describes how it attaches to the PREVIOUS note.
const GC_GAPED = 0;       // continues the neume, visually separated
const GC_LOOPED = 1;      // continues the neume, ligatured (graphically connected)
const GC_NEUME_START = 2; // begins a NEW neume

/**
 * Converts note pitches to melody direction:
 * - higher: 'u' (up)
 * - lower: 'd' (down)
 * - same: 's' (same)
 */
function getPitchDirection(pitchA, pitchB) {
    if (pitchB > pitchA) return 'u';
    if (pitchB < pitchA) return 'd';
    return 's';
}

/**
 * OMMR4all stores relative coordinates normalized by the image HEIGHT for BOTH
 * axes (see migration 0003_to_relative_coords: `x / h, y / h`). To turn these
 * into per-axis percentages we scale x by the aspect ratio (H/W):
 *
 *   x% = x_rel * (H / W) * 100      y% = y_rel * 100
 *
 * `xScale` below is (H / W) * 100 for x, and 100 for y. If coords are already
 * absolute pixels (legacy) we detect that and divide by the page dimensions.
 *
 * @param {string} coordStr  "x,y"
 * @param {{w:number,h:number}} page  page pixel dimensions
 */
function parseSingleCoord(coordStr, page) {
    if (!coordStr) return { x: 0, y: 0 };
    const [x, y] = coordStr.split(',').map(parseFloat);
    if (isNaN(x) || isNaN(y)) return { x: 0, y: 0 };
    const w = page?.w || 0, h = page?.h || 0;

    // Relative (height-normalized) coords: y_rel in [0,1], x_rel in [0, w/h].
    const isRelative = x <= 1.5 && y <= 1.5;
    if (isRelative && w > 0 && h > 0) {
        return { x: x * (h / w) * 100, y: y * 100 };
    }
    // Fallback: already pixels → percent of each axis.
    if (w > 0 && h > 0) {
        return { x: (x / w) * 100, y: (y / h) * 100 };
    }
    // Last resort (no dims): assume height-normalized square.
    return { x: x * 100, y: y * 100 };
}

/**
 * Calculates a bounding polygon string ("x1,y1 x2,y2 x3,y3 x4,y4") from a list of note coords.
 */
function computeBoundingBoxPoints(noteCoords, padding = { x: 0.8, y: 1.2 }) {
    if (!noteCoords || noteCoords.length === 0) return "0,0 0,0 0,0 0,0";
    
    const xs = noteCoords.map(p => p.x);
    const ys = noteCoords.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    // Ensure minimal dimensions for single punctum
    const width = Math.max(maxX - minX, 0.8);
    const height = Math.max(maxY - minY, 1.2);
    
    const x1 = Math.max(0, minX - padding.x);
    const y1 = Math.max(0, minY - padding.y);
    const x2 = Math.min(100, maxX + padding.x);
    const y2 = Math.min(100, maxY + padding.y);
    
    // Return standard 4-point polygon format
    return `${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)} ${x1.toFixed(2)},${y2.toFixed(2)}`;
}

/**
 * Parse a coords string "x,y x,y ..." into an array of { x, y } in percent.
 */
function parsePointsPct(coordStr, page) {
    if (!coordStr) return [];
    return coordStr.trim().split(/\s+/)
        .map(p => parseSingleCoord(p, page))
        .filter(p => !isNaN(p.x) && !isNaN(p.y));
}

/**
 * Parses an OMMR4all pcgts.json object for a specific folio.
 *
 * @returns {{ snippets: Array, lines: Array }} extracted neume snippets and the
 *   staff lines they sit on (each line carries its own coords + its neumes).
 */
export function parseOmmrPcgts(source, folio, pcgtsJson) {
    if (!pcgtsJson || !pcgtsJson.page || !Array.isArray(pcgtsJson.page.blocks)) {
        return { snippets: [], lines: [] };
    }

    const snippets = [];
    const lines = [];
    const blocks = pcgtsJson.page.blocks;
    const page = { w: pcgtsJson.page.imageWidth || 0, h: pcgtsJson.page.imageHeight || 0 };

    blocks.forEach((block) => {
        if (!block.lines) return;

        block.lines.forEach((line) => {
            const symbols = line.symbols || [];
            const notes = symbols.filter(s => s.type === 'note');
            if (notes.length === 0) return;

            // Group notes into neumes: NEUME_START (2) begins a new neume;
            // GAPED (0) / LOOPED (1) attach to the current one.
            const lineNeumes = [];
            let currentNeumeNotes = [];
            const flush = () => {
                if (!currentNeumeNotes.length) return;
                const neumeSnippet = buildNeumeSnippet(source, folio, line.id, currentNeumeNotes, snippets.length, page);
                if (neumeSnippet) { snippets.push(neumeSnippet); lineNeumes.push(neumeSnippet); }
                currentNeumeNotes = [];
            };
            for (let i = 0; i < notes.length; i++) {
                const note = notes[i];
                if (note.graphicalConnection === GC_NEUME_START && currentNeumeNotes.length) flush();
                currentNeumeNotes.push(note);
            }
            flush();

            if (!lineNeumes.length) return;

            // Line coords → bounding box in %. Fall back to the neumes' extent.
            const linePts = parsePointsPct(line.coords, page);
            let minX, minY, maxX, maxY;
            if (linePts.length) {
                const xs = linePts.map(p => p.x), ys = linePts.map(p => p.y);
                minX = Math.min(...xs); maxX = Math.max(...xs);
                minY = Math.min(...ys); maxY = Math.max(...ys);
            } else {
                const allPts = lineNeumes.flatMap(n => n.notePoints);
                const xs = allPts.map(p => p.x), ys = allPts.map(p => p.y);
                minX = Math.min(...xs); maxX = Math.max(...xs);
                minY = Math.min(...ys) - 2; maxY = Math.max(...ys) + 2;
            }
            lines.push({
                id: line.id,
                source,
                folio,
                bbox: {
                    x: +minX.toFixed(3), y: +minY.toFixed(3),
                    w: +(maxX - minX).toFixed(3), h: +(maxY - minY).toFixed(3)
                },
                neumeIds: lineNeumes.map(n => n.id),
                patterns: [...new Set(lineNeumes.map(n => n.pattern))],
                neumes: lineNeumes.map(n => ({
                    id: n.id, pattern: n.pattern, points: n.points, notePoints: n.notePoints
                }))
            });
        });
    });

    return { snippets, lines };
}

/**
 * Builds a chant pattern descriptor and metadata for a neume group.
 */
function buildNeumeSnippet(source, folio, lineId, notes, index, page) {
    if (!notes || notes.length === 0) return null;

    const coords = notes.map(n => parseSingleCoord(n.coord, page));
    // "Graphically connected" (ligature → bracketed pattern) when every
    // continuation note (all but the neume-start) is LOOPED.
    const isGraphicallyConnected = notes.length > 1 &&
        notes.slice(1).every(n => n.graphicalConnection === GC_LOOPED);

    // Calculate pattern contour:
    let contour = '';
    for (let i = 1; i < notes.length; i++) {
        const prevPitch = (notes[i - 1].positionInStaff !== undefined) ? notes[i - 1].positionInStaff : 0;
        const curPitch = (notes[i].positionInStaff !== undefined) ? notes[i].positionInStaff : 0;
        contour += getPitchDirection(prevPitch, curPitch);
    }

    // Format Chant Pattern:
    // Single note: *
    // Multi note: *u, *d, *udd, [*u], [*d], etc.
    let pattern = '*';
    if (contour.length > 0) {
        if (isGraphicallyConnected) {
            pattern = `[*${contour}]`;
        } else {
            pattern = `*${contour}`;
        }
    }

    const points = computeBoundingBoxPoints(coords);
    const xs = coords.map(c => c.x);
    const ys = coords.map(c => c.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const aspect = height > 0 ? (width / height) : 1;

    return {
        id: `ommr_${folio}_${lineId}_${index}`,
        source,
        folio,
        lineId,
        pattern,
        noteCount: notes.length,
        isGraphicallyConnected,
        points,
        // Exact note-head centres in per-axis percent (for overlay markers).
        notePoints: coords.map(c => ({ x: +c.x.toFixed(3), y: +c.y.toFixed(3) })),
        aspectRatio: parseFloat(aspect.toFixed(2)),
        notes: notes.map(n => ({
            id: n.id,
            coord: n.coord,
            positionInStaff: n.positionInStaff,
            oct: n.oct,
            pname: n.pname,
            graphicalConnection: n.graphicalConnection
        }))
    };
}
