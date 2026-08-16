/**
 * Pure functions for extracting, inspecting, and merging manuscript data.
 * These operate on state objects, not Pinia stores.
 */

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

    const prefix = sourceId + '_';

    // Check regions (lines) and count items
    if (state.regions) {
        for (const key in state.regions) {
            if (key.startsWith(prefix)) {
                const folio = key.substring(prefix.length);
                const regList = state.regions[key] || [];
                regionsCount += regList.length;
                if (regList.length > 0) foliosSet.add(folio);

                for (const r of regList) {
                    const items = (state.regionItems && state.regionItems[r.id]) || [];
                    annotationsCount += items.length;
                }
            }
        }
    }

    // Check legacy annotations
    if (state.annotations) {
        for (const key in state.annotations) {
            if (key.startsWith(prefix)) {
                const parts = key.substring(prefix.length).split('_');
                if (parts[0]) foliosSet.add(parts[0]);
                const annList = state.annotations[key] || [];
                annotationsCount += annList.length;
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
    const allowedSet = new Set(sourceIds);
    const filtered = {
        personalTables: [],
        annotations: {},
        regions: {},
        regionItems: {},
        manualLines: {},
        iiifLinks: {}
    };

    const targetSources = onlyWithData 
        ? sourceIds.filter(src => getManuscriptStats(fullState, src).hasData)
        : sourceIds;
    const finalAllowedSet = new Set(targetSources);

    if (fullState.personalTables) {
        filtered.personalTables = fullState.personalTables.filter(t => finalAllowedSet.has(t.source));
    }
    
    if (fullState.iiifLinks) {
        for (const src in fullState.iiifLinks) {
            if (finalAllowedSet.has(src)) filtered.iiifLinks[src] = fullState.iiifLinks[src];
        }
    }

    const keptRegionIds = new Set();
    
    if (fullState.regions) {
        for (const key in fullState.regions) {
            // Key is 'Source_Folio'
            const src = targetSources.find(s => key.startsWith(s + '_'));
            if (src) {
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

    if (fullState.annotations) {
        for (const key in fullState.annotations) {
            // Key is 'Source_Folio_Pattern'
            const src = targetSources.find(s => key.startsWith(s + '_'));
            if (src) {
                filtered.annotations[key] = fullState.annotations[key];
            }
        }
    }

    if (fullState.manualLines) {
        for (const key in fullState.manualLines) {
            // Key is 'Source_Folio'
            const src = targetSources.find(s => key.startsWith(s + '_'));
            if (src) {
                filtered.manualLines[key] = fullState.manualLines[key];
            }
        }
    }

    return filtered;
}

export function mergeManuscript(currentState, incomingState, sourceId, strategy) {
    // strategy: 'overwrite' | 'copy' | 'skip'
    if (strategy === 'skip') {
        return currentState;
    }

    const newState = {
        personalTables: [ ...(currentState.personalTables || []) ],
        annotations: { ...(currentState.annotations || {}) },
        regions: { ...(currentState.regions || {}) },
        regionItems: { ...(currentState.regionItems || {}) },
        manualLines: { ...(currentState.manualLines || {}) },
        iiifLinks: { ...(currentState.iiifLinks || {}) }
    };

    const isCopy = strategy === 'copy';
    const targetSourceId = isCopy ? `${sourceId} (copy)` : sourceId;

    // Overwrite strategy: first remove existing data for this source
    if (strategy === 'overwrite') {
        newState.personalTables = newState.personalTables.filter(t => t.source !== targetSourceId);
        delete newState.iiifLinks[targetSourceId];
        
        const prefix = targetSourceId + '_';
        for (const key in newState.annotations) {
            if (key.startsWith(prefix)) delete newState.annotations[key];
        }
        
        for (const key in newState.regions) {
            if (key.startsWith(prefix)) {
                const regionList = newState.regions[key];
                for (const r of regionList) {
                    delete newState.regionItems[r.id];
                }
                delete newState.regions[key];
            }
        }
        
        for (const key in newState.manualLines) {
            if (key.startsWith(prefix)) delete newState.manualLines[key];
        }
    }

    // Filter incoming state to just this sourceId
    const sourceData = extractManuscripts(incomingState, [sourceId]);

    // Add personalTables
    if (sourceData.personalTables) {
        const newTables = sourceData.personalTables.map(t => {
            if (isCopy) {
                // Ensure unique ID for table copy
                return { ...t, id: t.id + '-copy-' + Date.now(), source: targetSourceId, name: t.name + ' (copy)' };
            }
            return { ...t, source: targetSourceId };
        });
        newState.personalTables.push(...newTables);
    }

    // Add iiifLinks
    if (sourceData.iiifLinks && sourceData.iiifLinks[sourceId]) {
        newState.iiifLinks[targetSourceId] = sourceData.iiifLinks[sourceId];
    }

    // Helper to replace source prefix in keys
    const replacePrefix = (key, oldSrc, newSrc) => key.replace(oldSrc + '_', newSrc + '_');

    // Add regions and regionItems
    if (sourceData.regions) {
        for (const key in sourceData.regions) {
            const newKey = isCopy ? replacePrefix(key, sourceId, targetSourceId) : key;
            const regionList = sourceData.regions[key];
            const newRegionList = [];
            
            for (const r of regionList) {
                const newRegionId = isCopy ? r.id + '-copy-' + Date.now() : r.id;
                newRegionList.push({ ...r, id: newRegionId });
                
                // Copy region items
                if (sourceData.regionItems && sourceData.regionItems[r.id]) {
                    const items = sourceData.regionItems[r.id].map(item => isCopy ? { ...item, id: item.id + '-copy-' + Date.now() } : item);
                    newState.regionItems[newRegionId] = items;
                }
            }
            newState.regions[newKey] = newRegionList;
        }
    }

    // Add annotations
    if (sourceData.annotations) {
        for (const key in sourceData.annotations) {
            const newKey = isCopy ? replacePrefix(key, sourceId, targetSourceId) : key;
            const annots = sourceData.annotations[key].map(a => isCopy ? { ...a, id: a.id + '-copy-' + Date.now() } : a);
            newState.annotations[newKey] = annots;
        }
    }

    // Add manual lines
    if (sourceData.manualLines) {
        for (const key in sourceData.manualLines) {
            const newKey = isCopy ? replacePrefix(key, sourceId, targetSourceId) : key;
            newState.manualLines[newKey] = [...sourceData.manualLines[key]];
        }
    }

    return newState;
}
