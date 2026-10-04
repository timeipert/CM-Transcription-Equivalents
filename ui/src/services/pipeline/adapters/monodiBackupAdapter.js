import { createDataset, createSource } from '../normalizedModel';
import { parsePageKey } from '../../../utils/keys';

/**
 * Ingests this app's own export files — the workspace backup, the per-manuscript
 * export and the standalone configuration — into the normalized model.
 *
 * These files carry state in the store-native layout (`regions` keyed
 * `Source_Folio`, `regionItems` keyed by region id, `personalTables` with
 * `customId` rows). The older `{ version, content }` envelope is accepted so
 * that backups written before the `schemaVersion`/`data` rename still restore.
 */
export const monodiBackupAdapter = {
    id: 'monodi-backup',

    detect(input) {
        if (!input || typeof input !== 'object') return false;
        if (input.type && String(input.type).startsWith('cm-')) return true;
        if (input.schemaVersion && input.data) return true;
        return !!(input.version && input.content);
    },

    ingest(input) {
        const dataset = createDataset('monodi-backup');
        const data = input.data || input.content || input;
        const byId = new Map();

        const source = id => {
            if (!byId.has(id)) {
                const created = createSource(id);
                byId.set(id, created);
                dataset.sources.push(created);
            }
            return byId.get(id);
        };

        for (const table of data.personalTables || []) {
            if (!table.source) continue;
            const s = source(table.source);
            for (const row of table.rows || []) {
                if (!row.pattern) continue;
                // Several tables of one source share its single equivalents list.
                const refId = row.customId || '';
                if (s.equivalents.some(e => e.pattern === row.pattern && e.refId === refId)) continue;
                s.equivalents.push({
                    pattern: row.pattern,
                    refId,
                    notes: row.notes || ''
                });
            }
        }

        for (const [src, url] of Object.entries(data.iiifLinks || {})) {
            source(src).iiifManifestUrl = url;
        }

        // Regions flagged `unassigned` are this app's holding pen for whole-page
        // snippets that fit no line. They are not lines of the manuscript, so they
        // (and their items) stay out of the shared database.
        let heldBack = 0;
        const regionOwner = new Map();
        for (const [key, regionList] of Object.entries(data.regions || {})) {
            const src = splitSourceFolio(key, byId, data);
            if (!src) continue;
            const s = source(src.source);
            for (const region of regionList || []) {
                if (region.unassigned) {
                    heldBack += (data.regionItems?.[region.id] || []).length;
                    continue;
                }
                regionOwner.set(region.id, s);
                s.regions.push({
                    id: region.id,
                    name: region.name || '',
                    points: region.points || '',
                    folio: src.folio,
                    lineUUID: region.lineUUID
                });
            }
        }

        for (const [regionId, items] of Object.entries(data.regionItems || {})) {
            const s = regionOwner.get(regionId);
            if (!s) continue;
            for (const item of items || []) {
                s.items.push({
                    id: item.id,
                    regionId,
                    pattern: item.pattern,
                    variant: item.variant || '',
                    points: item.points || '',
                    uuid: item.uuid
                });
            }
        }

        const meta = (data.settings && data.settings.sourceMeta) || {};
        for (const [src, values] of Object.entries(meta)) {
            source(src).metadata = { ...values };
        }

        if (heldBack) {
            dataset.warnings.push(`${heldBack} snippet(s) not assigned to a line were not included.`);
        }

        dataset.settings = data.settings || null;
        return dataset;
    }
};

/**
 * A region key is `Source_Folio`, but a source id may itself contain
 * underscores ("WiSch 4_5"). Prefer a source already known from the tables or
 * IIIF links — the LONGEST that fits, so "WiSch 4_5" wins over "WiSch 4" — and
 * otherwise split at the last underscore, since a folio carries none.
 */
function splitSourceFolio(key, knownSources, data) {
    const known = new Set(knownSources.keys());
    for (const table of data.personalTables || []) {
        if (table.source) known.add(table.source);
    }
    let best = null;
    for (const id of known) {
        if (key.startsWith(id + '_') && (!best || id.length > best.length)) best = id;
    }
    if (best) return { source: best, folio: key.slice(best.length + 1) };
    return parsePageKey(key);
}
