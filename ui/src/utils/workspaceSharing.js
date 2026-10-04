/**
 * Pure functions for extracting, inspecting, and merging manuscript data.
 * These operate on plain state objects, not Pinia stores:
 *
 *   { personalTables, regions, regionItems, manualLines, iiifLinks }
 */
import { parsePageKey, isPageKeyOf, renamePageKeySource } from './keys';

/**
 * The manuscripts a piece of state or a file mentions: those with an equivalents
 * table, an IIIF link or a line region.
 */
export function listSources(content) {
    const sources = new Set();
    if (!content) return [];
    for (const t of content.personalTables || []) {
        if (t?.source) sources.add(t.source);
    }
    for (const source of Object.keys(content.iiifLinks || {})) sources.add(source);
    for (const key of Object.keys(content.regions || {})) {
        const k = parsePageKey(key);
        if (k) sources.add(k.source);
    }
    return Array.from(sources);
}

/**
 * Calculates summary metrics for a given manuscript in a state object.
 */
export function getManuscriptStats(state, sourceId) {
    let annotationsCount = 0;
    let regionsCount = 0;
    const foliosSet = new Set();
    let patternRowsCount = 0;
    let isPublished = false;

    // Check personal tables
    if (state.personalTables) {
        const table = state.personalTables.find(t => t.source === sourceId);
        if (table) {
            patternRowsCount = (table.rows || []).length;
            isPublished = !!table.isPublished;
        }
    }

    // Count line regions and the snippets inside them
    if (state.regions) {
        for (const key in state.regions) {
            const k = parsePageKey(key);
            if (k?.source !== sourceId) continue;
            const regList = state.regions[key] || [];
            regionsCount += regList.length;
            if (regList.length > 0) foliosSet.add(k.folio);

            for (const r of regList) {
                const items = (state.regionItems && state.regionItems[r.id]) || [];
                annotationsCount += items.length;
            }
        }
    }

    const foliosList = Array.from(foliosSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const hasData = annotationsCount > 0 || regionsCount > 0 || patternRowsCount > 0;

    return {
        source: sourceId,
        annotationsCount,
        regionsCount,
        foliosCount: foliosList.length,
        foliosList,
        patternRowsCount,
        isPublished,
        hasData
    };
}

export function extractManuscripts(fullState, sourceIds, options = {}) {
    const { onlyWithData = false } = options;
    const filtered = {
        personalTables: [],
        regions: {},
        regionItems: {},
        manualLines: {},
        iiifLinks: {}
    };

    const targetSources = onlyWithData
        ? sourceIds.filter(src => getManuscriptStats(fullState, src).hasData)
        : sourceIds;
    const allowed = new Set(targetSources);

    if (fullState.personalTables) {
        filtered.personalTables = fullState.personalTables.filter(t => allowed.has(t.source));
    }

    if (fullState.iiifLinks) {
        for (const src in fullState.iiifLinks) {
            if (allowed.has(src)) filtered.iiifLinks[src] = fullState.iiifLinks[src];
        }
    }

    const keptRegionIds = new Set();

    if (fullState.regions) {
        for (const key in fullState.regions) {
            if (allowed.has(parsePageKey(key)?.source)) {
                filtered.regions[key] = fullState.regions[key];
                fullState.regions[key].forEach(r => keptRegionIds.add(r.id));
            }
        }
    }

    if (fullState.regionItems) {
        for (const rId in fullState.regionItems) {
            if (keptRegionIds.has(rId)) {
                filtered.regionItems[rId] = fullState.regionItems[rId];
            }
        }
    }

    if (fullState.manualLines) {
        for (const key in fullState.manualLines) {
            if (allowed.has(parsePageKey(key)?.source)) {
                filtered.manualLines[key] = fullState.manualLines[key];
            }
        }
    }

    return filtered;
}

const withoutUndefined = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/**
 * `local` entries with the `incoming` ones folded in by id. An entry present on
 * both sides takes the incoming values but keeps fields only the local one has;
 * entries on one side only are kept. Nothing is removed.
 */
function mergeById(local, incoming) {
    const merged = local.map(entry => ({ ...entry }));
    const index = new Map(merged.map((entry, i) => [entry.id, i]));
    for (const entry of incoming) {
        if (index.has(entry.id)) {
            const i = index.get(entry.id);
            merged[i] = { ...merged[i], ...withoutUndefined(entry) };
        } else {
            index.set(entry.id, merged.length);
            merged.push({ ...entry });
        }
    }
    return merged;
}

/**
 * Fold one source of `incomingState` into `currentState` without removing
 * anything: regions and items are merged by id, equivalents rows by pattern, and
 * an existing IIIF link is kept. This is what a pull from the shared repository
 * uses — the repository's records never carry this app's own fields (snippet
 * links, OMMR line ids), and a source it knows only by its IIIF link must not
 * clear the work done on it here.
 */
function mergeSourceIn(currentState, incomingState, sourceId) {
    const next = {
        personalTables: [...(currentState.personalTables || [])],
        regions: { ...(currentState.regions || {}) },
        regionItems: { ...(currentState.regionItems || {}) },
        manualLines: { ...(currentState.manualLines || {}) },
        iiifLinks: { ...(currentState.iiifLinks || {}) }
    };
    const incoming = extractManuscripts(incomingState, [sourceId]);

    if (incoming.iiifLinks[sourceId] && !next.iiifLinks[sourceId]) {
        next.iiifLinks[sourceId] = incoming.iiifLinks[sourceId];
    }

    for (const table of incoming.personalTables) {
        const at = next.personalTables.findIndex(t => t.source === sourceId);
        if (at < 0) {
            next.personalTables.push(table);
            continue;
        }
        const local = next.personalTables[at];
        const rows = (local.rows || []).map(r => ({ ...r }));
        for (const row of table.rows || []) {
            const i = rows.findIndex(r => r.pattern === row.pattern);
            if (i < 0) rows.push({ ...row });
            else rows[i] = { ...rows[i], ...withoutUndefined(row) };
        }
        const patterns = [...new Set([...(local.patterns || []), ...(table.patterns || [])])];
        next.personalTables[at] = { ...local, rows, patterns };
    }

    for (const [key, list] of Object.entries(incoming.regions)) {
        next.regions[key] = mergeById(next.regions[key] || [], list);
    }
    for (const [regionId, items] of Object.entries(incoming.regionItems)) {
        next.regionItems[regionId] = mergeById(next.regionItems[regionId] || [], items);
    }
    for (const [key, lines] of Object.entries(incoming.manualLines)) {
        next.manualLines[key] = [...new Set([...(next.manualLines[key] || []), ...lines])];
    }
    return next;
}

export function mergeManuscript(currentState, incomingState, sourceId, strategy) {
    // strategy: 'overwrite' | 'copy' | 'skip' | 'merge'
    if (strategy === 'skip') {
        return currentState;
    }
    if (strategy === 'merge') {
        return mergeSourceIn(currentState, incomingState, sourceId);
    }

    const newState = {
        personalTables: [...(currentState.personalTables || [])],
        regions: { ...(currentState.regions || {}) },
        regionItems: { ...(currentState.regionItems || {}) },
        manualLines: { ...(currentState.manualLines || {}) },
        iiifLinks: { ...(currentState.iiifLinks || {}) }
    };

    const isCopy = strategy === 'copy';
    const targetSourceId = isCopy ? `${sourceId} (copy)` : sourceId;
    // Copies need ids of their own so they never collide with the originals.
    const copyTag = `-copy-${Date.now()}`;

    // Overwrite strategy: first remove existing data for this source
    if (strategy === 'overwrite') {
        newState.personalTables = newState.personalTables.filter(t => t.source !== targetSourceId);
        delete newState.iiifLinks[targetSourceId];

        for (const key in newState.regions) {
            if (isPageKeyOf(key, targetSourceId)) {
                for (const r of newState.regions[key]) {
                    delete newState.regionItems[r.id];
                }
                delete newState.regions[key];
            }
        }

        for (const key in newState.manualLines) {
            if (isPageKeyOf(key, targetSourceId)) delete newState.manualLines[key];
        }
    }

    // Filter incoming state to just this sourceId
    const sourceData = extractManuscripts(incomingState, [sourceId]);

    // Add personalTables
    const newTables = sourceData.personalTables.map(t => {
        if (isCopy) {
            return { ...t, id: t.id + copyTag, source: targetSourceId, name: t.name + ' (copy)' };
        }
        return { ...t, source: targetSourceId };
    });
    newState.personalTables.push(...newTables);

    // Add iiifLinks
    if (sourceData.iiifLinks[sourceId]) {
        newState.iiifLinks[targetSourceId] = sourceData.iiifLinks[sourceId];
    }

    // Add regions and regionItems
    for (const key in sourceData.regions) {
        const newKey = isCopy ? renamePageKeySource(key, targetSourceId) : key;
        const newRegionList = [];

        for (const r of sourceData.regions[key]) {
            const newRegionId = isCopy ? r.id + copyTag : r.id;
            newRegionList.push({ ...r, id: newRegionId });

            const items = sourceData.regionItems[r.id];
            if (items) {
                newState.regionItems[newRegionId] = items.map(item =>
                    isCopy ? { ...item, id: item.id + copyTag } : item);
            }
        }
        newState.regions[newKey] = newRegionList;
    }

    // Add manual lines
    for (const key in sourceData.manualLines) {
        const newKey = isCopy ? renamePageKeySource(key, targetSourceId) : key;
        newState.manualLines[newKey] = [...sourceData.manualLines[key]];
    }

    return newState;
}
