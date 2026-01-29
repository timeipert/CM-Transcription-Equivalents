import { useSettingsStore } from '../stores/settings';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';

export function useDataManagement() {
    const settings = useSettingsStore();
    const annotStore = useAnnotationsStore();
    const tablesStore = usePersonalTablesStore();

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
                    // Exclude UI ephemeral settings like snippetSize
                }
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

    async function importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    if (!json.version || !json.content) {
                        throw new Error("Invalid backup file format");
                    }

                    // Restore Stores
                    if (json.content.personalTables) {
                        tablesStore.tables = json.content.personalTables;
                    }
                    if (json.content.annotations) {
                        annotStore.annotations = json.content.annotations;
                    }
                    if (json.content.regions) {
                        annotStore.regions = json.content.regions;
                    }
                    if (json.content.regionItems) {
                        annotStore.regionItems = json.content.regionItems;
                    }
                    if (json.content.settings) {
                        if (json.content.settings.globalDisplayIds) settings.globalDisplayIds = json.content.settings.globalDisplayIds;
                        if (json.content.settings.autoFillIds !== undefined) settings.autoFillIds = json.content.settings.autoFillIds;
                        if (json.content.settings.displayMode) settings.displayMode = json.content.settings.displayMode;
                    }

                    resolve({ success: true, label: json.label, date: json.date });
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsText(file);
        });
    }

    return { exportData, importData };
}
