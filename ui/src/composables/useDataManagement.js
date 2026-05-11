import { useSettingsStore } from '../stores/settings';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useIiifStore } from '../stores/iiif';

export function useDataManagement() {
    const settings = useSettingsStore();
    const annotStore = useAnnotationsStore();
    const tablesStore = usePersonalTablesStore();
    const iiifStore = useIiifStore();

    function exportData() {
        const data = {
            version: 1,
            date: new Date().toISOString(),
            label: settings.backupLabel,
            content: {
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

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const cleanDate = new Date().toLocaleDateString().replace(/\//g, '-');
        const cleanLabel = (settings.backupLabel || 'backup').replace(/[^a-z0-9]/gi, '-');
        a.download = `cm-transcription-${cleanLabel}-${cleanDate}.json`;
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
                    reject(new Error("Failed to parse JSON"));
                }
            };
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsText(file);
        });
    }

    async function importData(files) {
        if (!Array.isArray(files) && !(files instanceof FileList)) {
            files = [files]; // fallback for single file
        }

        const results = [];

        for (const file of Array.from(files)) {
            try {
                const json = await readFileAsJson(file);
                if (!json.version || !json.content) {
                    throw new Error("Invalid backup file format");
                }

                // 1. Check for overlapping manuscripts in personal tables
                const localSources = new Set(tablesStore.tables.map(t => t.source));
                const importedSources = new Set((json.content.personalTables || []).map(t => t.source));
                const overlapSources = [...importedSources].filter(s => localSources.has(s));

                // 2. Check for overlapping keys in annotations and regions
                const localAnnotKeys = Object.keys(annotStore.annotations || {});
                const importedAnnotKeys = Object.keys(json.content.annotations || {});
                const overlapAnnots = importedAnnotKeys.filter(k => localAnnotKeys.includes(k) && annotStore.annotations[k].length > 0 && json.content.annotations[k].length > 0);

                const localRegionKeys = Object.keys(annotStore.regions || {});
                const importedRegionKeys = Object.keys(json.content.regions || {});
                const overlapRegions = importedRegionKeys.filter(k => localRegionKeys.includes(k) && annotStore.regions[k].length > 0 && json.content.regions[k].length > 0);

                if (overlapSources.length > 0 || overlapAnnots.length > 0 || overlapRegions.length > 0) {
                    const msgParts = [];
                    if (overlapSources.length > 0) msgParts.push(`Sources (${overlapSources.join(', ')})`);
                    if (overlapAnnots.length > 0) msgParts.push(`${overlapAnnots.length} annotations`);
                    if (overlapRegions.length > 0) msgParts.push(`${overlapRegions.length} regions`);
                    throw new Error(`Overlapping data detected: ${msgParts.join('; ')}`);
                }

                // Restore Stores safely (Merge instead of overwrite)
                if (json.content.personalTables) {
                    tablesStore.tables = [...tablesStore.tables, ...json.content.personalTables];
                }
                if (json.content.annotations) {
                    annotStore.annotations = { ...annotStore.annotations, ...json.content.annotations };
                }
                if (json.content.regions) {
                    annotStore.regions = { ...annotStore.regions, ...json.content.regions };
                }
                if (json.content.regionItems) {
                    annotStore.regionItems = { ...annotStore.regionItems, ...json.content.regionItems };
                }
                if (json.content.iiifLinks) {
                    iiifStore.links = { ...iiifStore.links, ...json.content.iiifLinks };
                }
                // Do not overwrite settings during a merge, as these are global to the local user.

                results.push({ success: true, fileName: file.name, label: json.label, date: json.date });
            } catch (err) {
                results.push({ success: false, fileName: file.name, error: err.message });
            }
        }
        return results;
    }

    function clearAllData() {
        tablesStore.tables = [];
        annotStore.annotations = {};
        annotStore.regions = {};
        annotStore.regionItems = {};
        iiifStore.links = {};
        // Optionally clear settings like globalDisplayIds if desired, but usually data means the user-generated tables/annotations.
    }

    return { exportData, importData, clearAllData };
}
