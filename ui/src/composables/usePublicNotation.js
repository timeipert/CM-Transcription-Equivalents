/**
 * Pure builders for the public notation page (the `/public/:source` route).
 *
 * This logic is shared between the live view (`PublicNotationView.vue`) and the
 * static site exporter (`useStaticExport.js`) so the two can never drift: both
 * derive the pattern Ref-ID map and the manuscript line gallery the same way.
 *
 * Everything here is a plain function over plain data (no Vue reactivity), so it
 * can run inside a computed() in the view and inside a plain loop in the exporter.
 */

import { stripSignKeys, extractSignKeys } from '../utils/signs';

/** First whitespace-delimited token of a pattern (the "base" pattern). */
export function getBasePattern(p) {
    if (!p) return '';
    return p.split(' ')[0];
}

/**
 * Map each table row's pattern to the Ref ID shown in the public view.
 * Mirrors PublicNotationView's `patternRefMap`.
 *
 * @param {{rows: Array<{pattern: string, customId?: string}>}|undefined} table
 * @param {(pattern: string) => string} getGlobalId  settings.getGlobalId
 */
export function buildPatternRefMap(table, getGlobalId) {
    const map = {};
    if (!table) return map;
    for (const row of table.rows || []) {
        const localId = row.customId;
        const globalId = getGlobalId ? getGlobalId(row.pattern) : '';
        map[row.pattern] = localId || globalId || '-';
    }
    return map;
}

/**
 * Build the manuscript line gallery for a source.
 * Mirrors PublicNotationView's `manuscriptLines` computed exactly:
 *   1. seed lines from raw transcription occurrences (virtual items),
 *   2. overlay real annotation regions/items (polygons win when present),
 *   3. keep only lines that have both polygon points and at least one item,
 *   4. sort by folio then line (numeric-aware).
 *
 * @param {Object} args
 * @param {string} args.source
 * @param {Object<string, Array>} [args.rawDataForSource]  transcription cache for this source: { pattern: [[doc, folio, line, syl, notes], ...] }
 * @param {Object<string, Array>} args.regions             annotations store `regions`: { "Source_Folio": [{id, name, points}] }
 * @param {Object<string, Array>} args.regionItems         annotations store `regionItems`: { regionId: [{id, pattern, points, ...}] }
 * @param {Object<string, string>} args.patternRefMap      from buildPatternRefMap
 * @returns {Array<{folio: string, lineName: string, items: Array, regionId: string|null, points: string|null}>}
 */
export function buildManuscriptLines({ source, rawDataForSource, regions, regionItems, patternRefMap, signKeys = [], discriminateSigns = true }) {
    const linesMap = {}; // "folio|lineName" -> line

    // Resolve a Ref-ID for a pattern, understanding code-variant signs: strip the
    // signs to find the base row's Ref ID, then (when discriminating) append a marker.
    const refIdFor = (basePat) => {
        const baseCode = stripSignKeys(basePat, signKeys);
        let refId = patternRefMap[baseCode] || patternRefMap[basePat] || null;
        const signStr = extractSignKeys(basePat, signKeys).join('');
        return { refId, signStr };
    };

    // 1. Process all raw transcription occurrences (virtual items)
    if (rawDataForSource) {
        for (const [pattern, instances] of Object.entries(rawDataForSource)) {
            for (const inst of instances) {
                const [, fol, lineName] = inst;
                const key = `${fol}|${lineName}`;
                if (!linesMap[key]) {
                    linesMap[key] = { folio: fol, lineName, items: [], regionId: null, points: null };
                }

                const basePat = getBasePattern(pattern);
                const { refId, signStr } = refIdFor(basePat);
                const baseRefId = refId || '-';
                const baseNoSigns = stripSignKeys(basePat, signKeys);
                const variant = (basePat.length > baseNoSigns.length) ? '' :
                    ((pattern.length > basePat.length) ? pattern.substring(basePat.length).trim() : '');
                let displayId = baseRefId;
                if (discriminateSigns && signStr) displayId += `·${signStr}`;
                if (variant) displayId += variant;

                linesMap[key].items.push({
                    id: inst.join('|'), // Stable ID from transcription
                    pattern,
                    displayId,
                    variant,
                    folio: fol,
                    lineName,
                    syl: inst[3],
                    notes: inst[4],
                    isVirtual: true
                });
            }
        }
    }

    // 2. Overlay with real annotations (polygons)
    const prefix = source + '_';
    for (const [key, pageRegions] of Object.entries(regions || {})) {
        if (!key.startsWith(prefix)) continue;
        const folio = key.substring(prefix.length);

        for (const r of pageRegions) {
            const lKey = `${folio}|${r.name}`;
            if (!linesMap[lKey]) {
                linesMap[lKey] = { folio, lineName: r.name, items: [], regionId: r.id, points: r.points };
            } else {
                linesMap[lKey].regionId = r.id;
                linesMap[lKey].points = r.points;
            }

            // If real polygons exist for this line, use them instead of virtual items
            const realItems = (regionItems && regionItems[r.id]) || [];
            if (realItems.length > 0) {
                linesMap[lKey].items = realItems.map(ri => {
                    const basePat = getBasePattern(ri.pattern);
                    const { refId, signStr } = refIdFor(basePat);
                    const baseRefId = refId || ri.linkData?.sysId?.split('|')[0] || '-';
                    let variant = ri.variant || '';
                    if (!variant && ri.pattern.includes(' ')) variant = ri.pattern.split(' ')[1];
                    let displayId = baseRefId;
                    if (discriminateSigns && signStr) displayId += `·${signStr}`;
                    if (variant) displayId += variant;

                    // Extract syl/notes from linkData if present
                    let syl = '', notes = '';
                    if (ri.linkData?.sysId) {
                        const p = ri.linkData.sysId.split('|');
                        syl = p[3] || '';
                        notes = p[4] || '';
                    }

                    return { ...ri, displayId, folio, regionId: r.id, syl, notes };
                });
            }
        }
    }

    // 3. Only lines that actually HAVE polygons/annotations and items
    const lines = Object.values(linesMap).filter(l => l.points && l.items.length > 0);

    // 4. Sort by Folio and Line (numeric-aware)
    lines.sort((a, b) => {
        if (a.folio !== b.folio) return a.folio.localeCompare(b.folio, undefined, { numeric: true });
        return a.lineName.localeCompare(b.lineName, undefined, { numeric: true });
    });

    return lines;
}

/**
 * Bounding box (in percent, 0..100) of a "x,y x,y ..." points string, with a
 * symmetric padding factor. Mirrors the viewBox math in AnnotationCutout.vue so
 * exported crops line up with what the app displays.
 *
 * @param {string} pointsStr
 * @param {number} [padding=0.05] context factor applied to width/height
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
export function pointsBoundingBox(pointsStr, padding = 0.05) {
    if (!pointsStr) return null;
    const pts = String(pointsStr).split(' ')
        .filter(s => s.trim().length > 0)
        .map(p => {
            const [x, y] = p.split(',').map(parseFloat);
            return { x, y };
        })
        .filter(p => !isNaN(p.x) && !isNaN(p.y));

    if (pts.length === 0) return null;

    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const w = maxX - minX;
    const h = maxY - minY;

    const padX = Math.max(w * padding, 1);
    const padY = Math.max(h * padding, 1);

    const x = Math.max(0, minX - padX);
    const y = Math.max(0, minY - padY);
    const boxW = Math.min(100 - x, w + padX * 2);
    const boxH = Math.min(100 - y, h + padY * 2);

    return { x, y, w: boxW, h: boxH };
}
