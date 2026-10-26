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
        // The link is replaced below if the incoming file has one; if it has none,
        // the manuscript keeps the one it has (an IIIF link is not work to overwrite).

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

// --- Custom manuscripts (direct-snippet collections) ------------------------
//
// A custom manuscript is a collection of pasted images filed under pattern codes
// (stores/directSnippets.js). It has no folios or line regions, so the functions
// above do not see it; these work on the same plain-data footing:
//
//   { id, source, name, notes, isPublished, patterns: [...], snippets: [...] }

const sameSiglum = (a, b) => String(a?.source || '').trim().toLowerCase() === String(b?.source || '').trim().toLowerCase();

/** Figures shown when a file's custom manuscript meets one already in the workspace. */
export function customManuscriptStats(collection) {
    const snippets = (collection?.snippets || []).length;
    const patterns = (collection?.patterns || []).length;
    return { snippets, patterns, hasData: snippets > 0 || patterns > 0 };
}

/** The local custom manuscripts an incoming one would collide with: the same id, or the same siglum. */
function collisions(local, incoming) {
    return (local || []).filter(l => l.id === incoming.id || sameSiglum(l, incoming));
}

/**
 * Sort the custom manuscripts of an incoming file into those that are new here and
 * those that collide with local ones.
 * @returns {{ newCollections: Object[], overlapCollections: Object[] }} each item is
 *   `{ id, source, name, incomingStats, localStats?, sameId? }`
 */
export function analyzeCustomCollections(incoming, local) {
    const newCollections = [];
    const overlapCollections = [];
    for (const c of incoming || []) {
        if (!c?.id) continue;
        const item = { id: c.id, source: c.source || '', name: c.name || '', incomingStats: customManuscriptStats(c) };
        const hits = collisions(local, c);
        if (!hits.length) {
            newCollections.push(item);
            continue;
        }
        const snippets = hits.reduce((n, h) => n + customManuscriptStats(h).snippets, 0);
        const patterns = hits.reduce((n, h) => n + customManuscriptStats(h).patterns, 0);
        overlapCollections.push({
            ...item,
            localStats: { snippets, patterns, hasData: snippets > 0 || patterns > 0 },
            sameId: hits.some(h => h.id === c.id)
        });
    }
    return { newCollections, overlapCollections };
}

/** A siglum not yet used by any custom manuscript in `taken`: "S (copy)", "S (copy 2)", … */
function copySiglum(source, taken) {
    const used = new Set(taken.map(c => String(c.source || '').trim().toLowerCase()));
    const base = String(source || '').trim();
    let candidate = `${base} (copy)`;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base} (copy ${n})`;
    return candidate;
}

/**
 * Merge incoming custom manuscripts into the local list; returns a new list and
 * leaves both inputs untouched.
 *
 * Those that collide with a local one follow `choices[incoming.id]`:
 *   'overwrite' (the default) replaces the local one(s), in the local one's place,
 *   'copy'      keeps both: the incoming one gets a new id and a siglum "… (copy)"
 *               and is not published,
 *   'skip'      keeps only the local one.
 * Those without a collision are always added.
 *
 * @param {Object[]} local
 * @param {Object[]} incoming
 * @param {Object<string,'overwrite'|'copy'|'skip'>} [choices]
 * @param {() => string} [makeId] id source for copies
 */
export function mergeCustomCollections(local, incoming, choices = {}, makeId = () => `dc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`) {
    let result = [...(local || [])];
    for (const c of incoming || []) {
        if (!c?.id) continue;
        const hits = collisions(result, c);
        if (!hits.length) {
            result.push(c);
            continue;
        }
        const strategy = choices[c.id] || 'overwrite';
        if (strategy === 'skip') continue;
        if (strategy === 'copy') {
            result.push({ ...c, id: makeId(), source: copySiglum(c.source, result), isPublished: false });
            continue;
        }
        // Replace the first local match in place, drop any further ones.
        result = result.filter(r => !hits.includes(r) || r === hits[0]);
        result[result.indexOf(hits[0])] = c;
    }
    return result;
}
