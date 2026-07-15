import { useSettingsStore } from '../stores/settings';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useIiifStore } from '../stores/iiif';

const SCHEMA_VERSION = 1;

export function useDataManagement() {
    const settings = useSettingsStore();
    const annotStore = useAnnotationsStore();
    const tablesStore = usePersonalTablesStore();
    const iiifStore = useIiifStore();

    function exportData() {
        const payload = {
            schemaVersion: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            label: settings.backupLabel,
            data: {
                personalTables: tablesStore.tables,
                annotations: annotStore.annotations,
                regions: annotStore.regions,
                regionItems: annotStore.regionItems,
                settings: {
                    globalDisplayIds: settings.globalDisplayIds,
                    autoFillIds: settings.autoFillIds,
                    displayMode: settings.displayMode
                },
                iiifLinks: iiifStore.links
            }
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const cleanDate = new Date().toLocaleDateString().replace(/\//g, '-');
        const cleanLabel = (settings.backupLabel || 'backup').replace(/[^a-z0-9]/gi, '-');
        a.download = `cm-transkript-backup-${cleanLabel}-${cleanDate}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    function readFileAsJson(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    resolve(JSON.parse(e.target.result));
                } catch (err) {
                    reject(new Error("Failed to parse JSON file - it might be malformed."));
                }
            };
            reader.onerror = () => reject(new Error("Failed to read the file from disk."));
            reader.readAsText(file);
        });
    }

    function extractSourcesFromContent(content) {
        const sources = new Set();
        (content.personalTables || []).forEach(t => sources.add(t.source));
        Object.keys(content.iiifLinks || {}).forEach(s => sources.add(s));
        
        // Extract from regions (key is Source_Folio)
        Object.keys(content.regions || {}).forEach(key => {
            const parts = key.split('_');
            if (parts.length > 1) {
                // Assuming Folio is the last part, the rest is Source
                parts.pop();
                sources.add(parts.join('_'));
            }
        });
        
        // Extract from annotations (key is Source_Folio_Pattern)
        Object.keys(content.annotations || {}).forEach(key => {
            const parts = key.split('_');
            if (parts.length > 2) {
                parts.pop(); // Pattern
                parts.pop(); // Folio
                sources.add(parts.join('_'));
            }
        });
        
        return Array.from(sources);
    }

    async function analyzeImportFiles(files) {
        if (!Array.isArray(files) && !(files instanceof FileList)) {
            files = [files];
        }

        const results = [];
        // Gather all local sources for comparison
        const localSourcesSet = new Set(extractSourcesFromContent({
            personalTables: tablesStore.tables,
            iiifLinks: iiifStore.links,
            regions: annotStore.regions,
            annotations: annotStore.annotations
        }));

        for (const file of Array.from(files)) {
            try {
                const json = await readFileAsJson(file);
                
                // Backwards compatibility check with older `version` / `content` format
                if (json.version && json.content && !json.schemaVersion) {
                    // Transparently map old format to new format for migration logic
                    json.schemaVersion = json.version;
                    json.data = json.content;
                }

                if (!json.schemaVersion || !json.data) {
                    throw new Error("Invalid backup file format: Missing schemaVersion or data object.");
                }

                if (json.schemaVersion !== SCHEMA_VERSION) {
                    // TODO: Implement actual migration steps for future schemas
                    // e.g. if (json.schemaVersion === 1 && SCHEMA_VERSION === 2) { ... }
                    throw new Error(`Schema mismatch! File is v${json.schemaVersion}, app expects v${SCHEMA_VERSION}. Migration path not yet implemented.`);
                }

                const importedSources = extractSourcesFromContent(json.data);
                const newSources = [];
                const overlapSources = [];

                for (const src of importedSources) {
                    if (localSourcesSet.has(src)) overlapSources.push(src);
                    else newSources.push(src);
                }

                results.push({ 
                    success: true, 
                    fileName: file.name, 
                    parsed: json, 
                    newSources, 
                    overlapSources 
                });
            } catch (err) {
                results.push({ success: false, fileName: file.name, error: err.message });
            }
        }
        return results;
    }

    function removeLocalDataForSource(source) {
        // Remove from personalTables
        tablesStore.tables = tablesStore.tables.filter(t => t.source !== source);
        
        // Remove from iiifLinks
        if (iiifStore.links[source]) {
            delete iiifStore.links[source];
            // Trigger reactivity by re-assigning
            iiifStore.links = { ...iiifStore.links };
        }

        const prefix = source + '_';

        // Remove from annotations
        const newAnnots = { ...annotStore.annotations };
        for (const key in newAnnots) {
            if (key.startsWith(prefix)) delete newAnnots[key];
        }
        annotStore.annotations = newAnnots;

        // Remove from regions & regionItems
        const newRegions = { ...annotStore.regions };
        const newRegionItems = { ...annotStore.regionItems };
        for (const key in newRegions) {
            if (key.startsWith(prefix)) {
                // delete its items
                const regionList = newRegions[key];
                for (const r of regionList) {
                    delete newRegionItems[r.id];
                }
                delete newRegions[key];
            }
        }
        annotStore.regions = newRegions;
        annotStore.regionItems = newRegionItems;
    }

    function filterJsonContentForSources(content, allowedSources) {
        const allowedSet = new Set(allowedSources);
        const filtered = {
            personalTables: [],
            annotations: {},
            regions: {},
            regionItems: {},
            iiifLinks: {}
        };

        if (content.personalTables) {
            filtered.personalTables = content.personalTables.filter(t => allowedSet.has(t.source));
        }
        if (content.iiifLinks) {
            for (const src in content.iiifLinks) {
                if (allowedSet.has(src)) filtered.iiifLinks[src] = content.iiifLinks[src];
            }
        }

        const keptRegionIds = new Set();
        
        if (content.regions) {
            for (const key in content.regions) {
                const src = allowedSources.find(s => key.startsWith(s + '_'));
                if (src) {
                    filtered.regions[key] = content.regions[key];
                    content.regions[key].forEach(r => keptRegionIds.add(r.id));
                }
            }
        }

        if (content.regionItems) {
            for (const rId in content.regionItems) {
                if (keptRegionIds.has(rId)) {
                    filtered.regionItems[rId] = content.regionItems[rId];
                }
            }
        }

        if (content.annotations) {
            for (const key in content.annotations) {
                const src = allowedSources.find(s => key.startsWith(s + '_'));
                if (src) {
                    filtered.annotations[key] = content.annotations[key];
                }
            }
        }

        return filtered;
    }

    function executeImport(parsedJson, choices) {
        // choices: { [source]: 'overwrite' | 'skip' }
        const importedSources = extractSourcesFromContent(parsedJson.data);
        const allowedSources = [];

        for (const src of importedSources) {
            if (choices[src] === 'skip') {
                continue;
            } else if (choices[src] === 'overwrite') {
                removeLocalDataForSource(src);
                allowedSources.push(src);
            } else {
                // New source (no choice needed, automatically allowed)
                allowedSources.push(src);
            }
        }

        const filteredContent = filterJsonContentForSources(parsedJson.data, allowedSources);

        // Merge into stores
        if (filteredContent.personalTables.length > 0) {
            tablesStore.tables = [...tablesStore.tables, ...filteredContent.personalTables];
        }
        if (Object.keys(filteredContent.annotations).length > 0) {
            annotStore.annotations = { ...annotStore.annotations, ...filteredContent.annotations };
        }
        if (Object.keys(filteredContent.regions).length > 0) {
            annotStore.regions = { ...annotStore.regions, ...filteredContent.regions };
        }
        if (Object.keys(filteredContent.regionItems).length > 0) {
            annotStore.regionItems = { ...annotStore.regionItems, ...filteredContent.regionItems };
        }
        if (Object.keys(filteredContent.iiifLinks).length > 0) {
            iiifStore.links = { ...iiifStore.links, ...filteredContent.iiifLinks };
        }
    }

    function clearAllData() {
        tablesStore.tables = [];
        annotStore.annotations = {};
        annotStore.regions = {};
        annotStore.regionItems = {};
        iiifStore.links = {};
    }

    return { exportData, analyzeImportFiles, executeImport, clearAllData };
}
