/**
 * One-time migration: fold the legacy whole-page annotation map into regions.
 *
 * Early versions stored a snippet straight under its page and pattern,
 *
 *     annotations["Source_Folio_Pattern"] = [ { id, points, linkData, … } ]
 *
 * with no line region in between. The app later moved to
 * `regionItems[regionId]`, but kept the old map alive next to it — every reader
 * had to merge both, the OMMR import wrote each snippet to both (so lists showed
 * it twice), and the monodi sync never carried the legacy entries at all.
 *
 * This folds every legacy entry into the region model, losslessly:
 *   - an entry already present in a region of its page (same pattern and shape,
 *     which is what the OMMR double-write left behind) is dropped as a duplicate;
 *   - otherwise it joins the smallest line region that contains its centre;
 *   - otherwise it goes to a per-page "Unassigned" whole-page region, flagged
 *     `unassigned` so the public line galleries keep ignoring it exactly as they
 *     ignored legacy entries before.
 *
 * It is idempotent (a state without a legacy map is returned untouched) and
 * never mutates its input.
 */

import { parseAnnotationKey, pageKey } from '../../../utils/keys';
import { newId } from '../../../utils/id';
import { parsePoints, pointsCenter, pointInPolygon, polygonArea } from '../../../utils/geometry';

export const UNASSIGNED_REGION_NAME = 'Unassigned';
const WHOLE_PAGE = '0,0 100,0 100,100 0,100';

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Whether the state still carries at least one legacy entry. */
export function hasLegacyAnnotations(state) {
    const legacy = state && state.annotations;
    if (!isObject(legacy)) return false;
    return Object.values(legacy).some(list => Array.isArray(list) && list.length > 0);
}

/** `"*dd b"` → `{ base: "*dd", variant: "b" }` (older data kept the variant in the key). */
function splitPattern(pattern) {
    const [base, variant = ''] = String(pattern).split(' ');
    return { base, variant };
}

const normalizePoints = str => String(str || '').trim().split(/\s+/).join(' ');
const signature = (base, points) => `${base}|${normalizePoints(points)}`;

/**
 * @param {{ annotations?: Object, regions?: Object, regionItems?: Object, manualLines?: Object }} state
 * @returns {{
 *   state: { regions: Object, regionItems: Object, manualLines: Object },
 *   report: { moved: number, duplicates: number, unassigned: number, createdRegions: number }
 * }}
 */
export function foldLegacyAnnotations(state) {
    const regions = isObject(state?.regions) ? state.regions : {};
    const regionItems = isObject(state?.regionItems) ? state.regionItems : {};
    const manualLines = isObject(state?.manualLines) ? state.manualLines : {};
    const report = { moved: 0, duplicates: 0, unassigned: 0, createdRegions: 0 };

    if (!hasLegacyAnnotations(state)) {
        return { state: { regions, regionItems, manualLines }, report };
    }

    // Copy-on-write: containers are shallow-copied up front, and each page list /
    // item list is copied the first time it is touched.
    const outRegions = { ...regions };
    const outItems = { ...regionItems };
    const copiedPages = new Set();
    const copiedItemLists = new Set();

    const pageList = key => {
        if (!copiedPages.has(key)) {
            outRegions[key] = [...(outRegions[key] || [])];
            copiedPages.add(key);
        }
        return outRegions[key];
    };
    const itemList = regionId => {
        if (!copiedItemLists.has(regionId)) {
            outItems[regionId] = [...(outItems[regionId] || [])];
            copiedItemLists.add(regionId);
        }
        return outItems[regionId];
    };

    // Per page: which ids and (pattern, shape) pairs already live in a region.
    const pageIndex = new Map();
    const indexFor = key => {
        let idx = pageIndex.get(key);
        if (!idx) {
            idx = { ids: new Set(), sigs: new Set() };
            for (const r of outRegions[key] || []) {
                for (const item of outItems[r.id] || []) {
                    if (item.id !== undefined) idx.ids.add(item.id);
                    idx.sigs.add(signature(splitPattern(item.pattern).base, item.points));
                }
            }
            pageIndex.set(key, idx);
        }
        return idx;
    };

    const polygonCache = new Map();
    const polygonOf = region => {
        if (!polygonCache.has(region.id)) polygonCache.set(region.id, parsePoints(region.points));
        return polygonCache.get(region.id);
    };

    /** Smallest line region (never an Unassigned one) that contains the point. */
    const regionContaining = (key, center) => {
        let best = null;
        let bestArea = Infinity;
        for (const r of outRegions[key] || []) {
            if (r.unassigned) continue;
            const poly = polygonOf(r);
            if (!pointInPolygon(center.x, center.y, poly)) continue;
            const area = polygonArea(poly);
            if (area < bestArea) {
                best = r;
                bestArea = area;
            }
        }
        return best;
    };

    const unassignedRegion = (key, source, folio) => {
        const existing = (outRegions[key] || []).find(r => r.unassigned);
        if (existing) return existing;
        const region = {
            id: `r_unassigned_${source}_${folio}`,
            name: UNASSIGNED_REGION_NAME,
            points: WHOLE_PAGE,
            unassigned: true
        };
        pageList(key).push(region);
        polygonCache.set(region.id, parsePoints(region.points));
        report.createdRegions++;
        return region;
    };

    for (const [annKey, entries] of Object.entries(state.annotations)) {
        if (!Array.isArray(entries) || !entries.length) continue;
        const parsed = parseAnnotationKey(annKey);
        if (!parsed) continue;
        const { source, folio, pattern } = parsed;
        const key = pageKey(source, folio);
        const { base, variant: keyVariant } = splitPattern(pattern);
        const idx = indexFor(key);

        for (const entry of entries) {
            if (!isObject(entry)) continue;

            const sig = signature(base, entry.points);
            if (idx.sigs.has(sig)) {
                report.duplicates++;
                continue;
            }

            const center = pointsCenter(entry.points);
            let region = center ? regionContaining(key, center) : null;
            if (!region) {
                region = unassignedRegion(key, source, folio);
                report.unassigned++;
            }

            // Ids only need to be unique within a page; an old Date.now() collision
            // would otherwise make two snippets delete together.
            const id = entry.id === undefined || idx.ids.has(entry.id) ? newId('i') : entry.id;
            const item = { ...entry, id, pattern: base };
            const variant = entry.variant || keyVariant;
            if (variant) item.variant = variant;

            itemList(region.id).push(item);
            idx.ids.add(id);
            idx.sigs.add(sig);
            report.moved++;
        }
    }

    return { state: { regions: outRegions, regionItems: outItems, manualLines }, report };
}
