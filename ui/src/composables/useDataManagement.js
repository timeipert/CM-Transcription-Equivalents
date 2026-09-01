import { useSettingsStore } from '../stores/settings';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useIiifStore } from '../stores/iiif';
import { useOmmrStore } from '../stores/ommr';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { extractManuscripts, mergeManuscript, getManuscriptStats } from '../utils/workspaceSharing';

const SCHEMA_VERSION = 1;

export function useDataManagement() {
    const settings = useSettingsStore();
    const annotStore = useAnnotationsStore();
    const tablesStore = usePersonalTablesStore();
    const iiifStore = useIiifStore();
    const ommrStore = useOmmrStore();
    const directStore = useDirectSnippetsStore();

    function getLocalFullState() {
        return {
            personalTables: tablesStore.tables,
            annotations: annotStore.annotations,
            regions: annotStore.regions,
            regionItems: annotStore.regionItems,
            manualLines: annotStore.manualLines,
            iiifLinks: iiifStore.links
        };
    }

    // Export whole workspace (filtering only manuscripts with data)
    function exportData(options = {}) {
        const { includeSettings = true, onlyWithData = true } = options;
        const currentState = getLocalFullState();
        const allSources = extractSourcesFromContent(currentState);
        const filteredData = extractManuscripts(currentState, allSources, { onlyWithData });

        const payload = {
            schemaVersion: SCHEMA_VERSION,
            type: 'cm-workspace-backup',
            exportedAt: new Date().toISOString(),
            label: settings.backupLabel || 'Workspace',
            // Direct snippet collections carry their images inline as base64, so a
            // backup of them is self-contained (no IIIF server needed to restore).
            directSnippets: directStore.collections,
            data: {
                ...filteredData,
                settings: includeSettings ? {
                    globalDisplayIds: settings.globalDisplayIds,
                    autoFillIds: settings.autoFillIds,
                    displayMode: settings.displayMode,
                    neumeNames: settings.neumeNames,
                    sourceAlignments: settings.sourceAlignments,
                    snippetSize: settings.snippetSize,
                    snippetPadding: settings.snippetPadding,
                    customSigns: settings.customSigns,
                    codeVariants: settings.codeVariants,
                    discriminateSigns: settings.discriminateSigns
                } : undefined
            }
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const cleanDate = new Date().toISOString().slice(0, 10);
        const cleanLabel = (settings.backupLabel || 'backup').replace(/[^a-z0-9]/gi, '-');
        a.download = `cm-transkript-backup-${cleanLabel}-${cleanDate}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    // Export specific manuscripts (only those with data)
    function exportManuscripts(sourceIds) {
        const currentState = getLocalFullState();
        const data = extractManuscripts(currentState, sourceIds, { onlyWithData: true });

        const actualExported = extractSourcesFromContent(data);
        if (actualExported.length === 0) {
            throw new Error("None of the selected manuscripts contain any annotations, regions, or pattern rows.");
        }
        
        const payload = {
            schemaVersion: SCHEMA_VERSION,
            type: 'cm-manuscript-export',
            exportedAt: new Date().toISOString(),
            exportedManuscripts: actualExported,
            data
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const cleanDate = new Date().toISOString().slice(0, 10);
        const sourceName = actualExported.length === 1 ? actualExported[0].replace(/[^a-z0-9]/gi, '-') : 'selected-sources';
        a.download = `cm-manuscripts-${sourceName}-${cleanDate}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    // Export standalone settings / configuration file
    function exportConfiguration() {
        const payload = {
            schemaVersion: SCHEMA_VERSION,
            type: 'cm-transcription-config',
            exportedAt: new Date().toISOString(),
            label: settings.backupLabel || 'Config',
            settings: {
                globalDisplayIds: settings.globalDisplayIds,
                autoFillIds: settings.autoFillIds,
                displayMode: settings.displayMode,
                neumeNames: settings.neumeNames,
                sourceAlignments: settings.sourceAlignments,
                snippetSize: settings.snippetSize,
                snippetPadding: settings.snippetPadding,
                customSigns: settings.customSigns,
                codeVariants: settings.codeVariants,
                discriminateSigns: settings.discriminateSigns
            }
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const cleanDate = new Date().toISOString().slice(0, 10);
        a.download = `cm-config-${cleanDate}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    // Apply standalone settings configuration
    function importConfiguration(configPayload) {
        if (!configPayload) return;
        const s = configPayload.settings || configPayload.data?.settings || configPayload;
        if (s.globalDisplayIds) settings.globalDisplayIds = s.globalDisplayIds;
        if (s.autoFillIds !== undefined) settings.autoFillIds = s.autoFillIds;
        if (s.displayMode) settings.displayMode = s.displayMode;
        if (s.neumeNames) settings.neumeNames = s.neumeNames;
        if (s.sourceAlignments) settings.sourceAlignments = s.sourceAlignments;
        if (s.snippetSize) settings.snippetSize = s.snippetSize;
        if (s.snippetPadding) settings.snippetPadding = s.snippetPadding;
        if (Array.isArray(s.customSigns)) settings.customSigns = s.customSigns;
        if (s.codeVariants) settings.codeVariants = s.codeVariants;
        if (s.discriminateSigns !== undefined) settings.discriminateSigns = s.discriminateSigns;
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
        if (!content) return [];
        const sources = new Set();
        (content.personalTables || []).forEach(t => { if (t?.source) sources.add(t.source); });
        Object.keys(content.iiifLinks || {}).forEach(s => sources.add(s));
        
        // Extract from regions (key is Source_Folio)
        Object.keys(content.regions || {}).forEach(key => {
            const parts = key.split('_');
            if (parts.length > 1) {
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
        const localState = getLocalFullState();
        const localSources = extractSourcesFromContent(localState);
        const localSourcesSet = new Set(localSources);

        for (const file of Array.from(files)) {
            try {
                const json = await readFileAsJson(file);
                
                // Check if this is a standalone configuration file
                if (json.type === 'cm-transcription-config' || (json.settings && !json.data?.personalTables && !json.data?.regions)) {
                    results.push({
                        success: true,
                        isConfigOnly: true,
                        fileName: file.name,
                        parsed: json,
                        exportedAt: json.exportedAt
                    });
                    continue;
                }

                // Backwards compatibility check with older `version` / `content` format
                if (json.version && json.content && !json.schemaVersion) {
                    json.schemaVersion = json.version;
                    json.data = json.content;
                }

                if (!json.schemaVersion || !json.data) {
                    throw new Error("Invalid backup file format: Missing schemaVersion or data object.");
                }

                if (json.schemaVersion !== SCHEMA_VERSION) {
                    throw new Error(`Schema mismatch! File is v${json.schemaVersion}, app expects v${SCHEMA_VERSION}.`);
                }

                const importedSources = extractSourcesFromContent(json.data);
                const newSources = [];
                const overlapSources = []; // [{ source, incomingStats, localStats }]

                for (const src of importedSources) {
                    const incomingStats = getManuscriptStats(json.data, src);
                    if (localSourcesSet.has(src)) {
                        const localStats = getManuscriptStats(localState, src);
                        overlapSources.push({
                            source: src,
                            incomingStats,
                            localStats
                        });
                    } else {
                        newSources.push({
                            source: src,
                            incomingStats
                        });
                    }
                }

                results.push({ 
                    success: true, 
                    isConfigOnly: false,
                    fileName: file.name, 
                    parsed: json, 
                    hasSettings: !!json.data?.settings,
                    newSources, 
                    overlapSources 
                });
            } catch (err) {
                results.push({ success: false, fileName: file.name, error: err.message });
            }
        }
        return results;
    }

    function executeImport(parsedJson, choices, options = {}) {
        const { importSettings = true } = options;
        let currentState = getLocalFullState();

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
        annotStore.manualLines = currentState.manualLines;
        iiifStore.links = currentState.iiifLinks;

        if (importSettings && parsedJson.data?.settings) {
            importConfiguration(parsedJson.data.settings);
        }

        // Direct snippet collections are keyed by their own ids, independent of the
        // manuscript merge strategies above, so merge them by id.
        if (Array.isArray(parsedJson.directSnippets)) {
            directStore.mergeCollections(parsedJson.directSnippets);
        }
    }

    function deleteManuscriptData(source, options = {}) {
        if (!source) return;
        const {
            snippets = true,
            regions = true,
            manualLines = true,
            table = false,
            tableRowsOnly = false,
            iiifLink = false,
            ommrDataset = false,
            folios = null,
            patterns = null
        } = options;

        // 1. Clear annotations and lines
        if (snippets || regions || manualLines) {
            annotStore.clearManuscript(source, {
                snippets,
                regions,
                manualLines,
                folios,
                patterns
            });
        }

        // 2. Personal table
        if (table) {
            tablesStore.deleteTableForSource(source);
        } else if (tableRowsOnly) {
            tablesStore.clearTableRowsForSource(source);
        }

        // 3. IIIF manifest link
        if (iiifLink) {
            iiifStore.removeManifest(source);
        }

        // 4. OMMR in-memory dataset
        if (ommrDataset) {
            ommrStore.removeDataset(source);
        }
    }

    function clearAllData() {
        tablesStore.tables = [];
        annotStore.annotations = {};
        annotStore.regions = {};
        annotStore.regionItems = {};
        annotStore.manualLines = {};
        iiifStore.links = {};
    }

    return { 
        exportData, 
        exportManuscripts, 
        exportConfiguration, 
        importConfiguration, 
        analyzeImportFiles, 
        executeImport, 
        deleteManuscriptData,
        clearAllData,
        getLocalFullState
    };
}
