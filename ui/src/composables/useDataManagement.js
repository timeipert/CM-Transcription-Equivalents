import { useSettingsStore } from '../stores/settings';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useIiifStore } from '../stores/iiif';
import { extractManuscripts, mergeManuscript } from '../utils/workspaceSharing';

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

    function exportManuscripts(sourceIds) {
        const currentState = {
            personalTables: tablesStore.tables,
            annotations: annotStore.annotations,
            regions: annotStore.regions,
            regionItems: annotStore.regionItems,
            iiifLinks: iiifStore.links
        };

        const data = extractManuscripts(currentState, sourceIds);
        
        const payload = {
            schemaVersion: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            exportedManuscripts: sourceIds,
            data
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const cleanDate = new Date().toLocaleDateString().replace(/\//g, '-');
        const sourceName = sourceIds.length === 1 ? sourceIds[0].replace(/[^a-z0-9]/gi, '-') : 'multiple';
        a.download = `cm-manuscript-${sourceName}-${cleanDate}.json`;
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

    function executeImport(parsedJson, choices) {
        let currentState = {
            personalTables: tablesStore.tables,
            annotations: annotStore.annotations,
            regions: annotStore.regions,
            regionItems: annotStore.regionItems,
            iiifLinks: iiifStore.links
        };

        const importedSources = extractSourcesFromContent(parsedJson.data);

        for (const src of importedSources) {
            const strategy = choices[src] || 'overwrite';
            if (strategy === 'skip') continue;
            
            currentState = mergeManuscript(currentState, parsedJson.data, src, strategy);
        }

        // Commit to stores (triggering autosave if folder bound)
        tablesStore.tables = currentState.personalTables;
        annotStore.annotations = currentState.annotations;
        annotStore.regions = currentState.regions;
        annotStore.regionItems = currentState.regionItems;
        iiifStore.links = currentState.iiifLinks;
    }

    function clearAllData() {
        tablesStore.tables = [];
        annotStore.annotations = {};
        annotStore.regions = {};
        annotStore.regionItems = {};
        iiifStore.links = {};
    }

    return { exportData, exportManuscripts, analyzeImportFiles, executeImport, clearAllData };
}
