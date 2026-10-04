<script setup>
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useDataManagement } from '../../composables/useDataManagement';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { getManuscriptStats } from '../../utils/workspaceSharing';
import ManuscriptCleanupModal from '../../components/ManuscriptCleanupModal.vue';
import MergeConflictModal from './MergeConflictModal.vue';

const store = useSettingsStore();
const { sourceFolios } = useTranscriptionData();
const {
    exportData,
    exportManuscripts,
    exportConfiguration,
    importConfiguration,
    analyzeImportFiles,
    executeImport,
    clearAllData,
    getLocalFullState
} = useDataManagement();

// --- Static site export ---
const staticExporting = ref(false);
const staticExportMsg = ref("");
const staticExportStatus = ref(""); // 'success' | 'error' | 'progress'

async function doExportStaticSite() {
    if (staticExporting.value) return;
    staticExporting.value = true;
    staticExportStatus.value = "progress";
    staticExportMsg.value = "Starting export…";
    try {
        // Loaded on demand: the exporter (and the ZIP library) is only needed here.
        const { exportStaticSite } = await import('../../composables/useStaticExport');
        const res = await exportStaticSite((p) => {
            staticExportMsg.value = p.message;
        });
        staticExportStatus.value = "success";
        staticExportMsg.value = `Exported ${res.sources} manuscript(s) with ${res.snippets} snippet(s)`
            + (res.failures ? ` — ${res.failures} snippet(s) could not be fetched (IIIF/CORS).` : ".");
    } catch (e) {
        staticExportStatus.value = "error";
        staticExportMsg.value = e?.message || "Static export failed.";
    } finally {
        staticExporting.value = false;
    }
}

// --- Import / export ---
const fileInput = ref(null);
const configFileInput = ref(null);
const selectedManuscriptsToExport = ref([]);
const importMsg = ref("");
const importStatus = ref(""); // 'success' or 'error'

/** Show a message, and let a success fade away on its own. */
function say(message, status = "", fadeMs = 0) {
    importMsg.value = message;
    importStatus.value = status;
    if (fadeMs) setTimeout(() => importMsg.value = "", fadeMs);
}

/** What the import changed beyond the data itself (an upgraded file, dropped parts). */
const notesOf = result => (result.notes && result.notes.length ? ' ' + result.notes.join(' ') : '');

// Cleanup Modal State
const cleanupModalSource = ref('');
const showCleanupModal = ref(false);

function openCleanup(source) {
    cleanupModalSource.value = source;
    showCleanupModal.value = true;
}

function onManuscriptDeleted(msg) {
    say(msg, "success", 4000);
}

// Manuscripts that actually contain data
const availableSources = computed(() => Object.keys(sourceFolios.value || {}).sort());
const manuscriptsWithData = computed(() => {
    const state = getLocalFullState();
    const list = availableSources.value.map(src => {
        const stats = getManuscriptStats(state, src);
        return {
            source: src,
            ...stats
        };
    }).filter(m => m.hasData);

    list.sort((a, b) => b.annotationsCount - a.annotationsCount || a.source.localeCompare(b.source));
    return list;
});

// Merge Modal State
const showMergeModal = ref(false);
const pendingAnalysis = ref(null);

function doClearAll() {
    if (confirm("Are you sure you want to delete ALL your local annotations, regions, and tables? This cannot be undone! Make sure you export a JSON backup first.")) {
        clearAllData();
        say("All data has been removed.", "success", 4000);
    }
}

function doExportWorkspace() {
    exportData({ includeSettings: false, onlyWithData: true });
}

function doExportWorkspaceWithSettings() {
    exportData({ includeSettings: true, onlyWithData: true });
}

function doExportManuscripts() {
    if (selectedManuscriptsToExport.value.length > 0) {
        try {
            exportManuscripts(selectedManuscriptsToExport.value);
        } catch (e) {
            alert(e.message);
        }
    }
}

function doExportConfig() {
    exportConfiguration();
}

async function doImportConfig(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    try {
        const results = await analyzeImportFiles(files);
        const res = results[0];
        if (!res.success) {
            say(`Error: ${res.error}`, "error");
            return;
        }
        importConfiguration(res.parsed);
        say("Configuration loaded successfully!", "success", 4000);
    } catch (e) {
        say(`Config Error: ${e.message}`, "error");
    } finally {
        event.target.value = null;
    }
}

async function doImport(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    say("Analyzing file...");

    try {
        const results = await analyzeImportFiles(files);
        const result = results[0];

        if (!result.success) {
            say(`Error: ${result.error}`, "error");
            return;
        }

        // If it's a standalone config file, apply directly
        if (result.isConfigOnly) {
            importConfiguration(result.parsed);
            say("Configuration file imported successfully!", "success", 4000);
            return;
        }

        if (result.overlapSources.length > 0) {
            // Need conflict resolution
            pendingAnalysis.value = result;
            showMergeModal.value = true;
            say("Merge resolution required.");
        } else {
            // No overlaps, execute immediately
            executeImport(result.parsed, {}, { importSettings: true });
            say(`Success! Imported ${result.newSources.length} manuscript(s).${notesOf(result)}`, "success", notesOf(result) ? 12000 : 4000);
        }
    } catch (e) {
        say(`Critical Error: ${e.message}`, "error");
    } finally {
        event.target.value = null; // Clear input
    }
}

function confirmMerge({ choices, importSettings }) {
    try {
        executeImport(pendingAnalysis.value.parsed, choices, { importSettings });
        const notes = notesOf(pendingAnalysis.value);
        showMergeModal.value = false;
        say(`Success! Data imported and merged.${notes}`, "success", notes ? 12000 : 4000);
    } catch (e) {
        say(`Merge Error: ${e.message}`, "error");
        showMergeModal.value = false;
    }
}

function cancelMerge() {
    showMergeModal.value = false;
    say("Import cancelled.", "", 4000);
}
</script>

<template>
    <div class="card section settings-card">
            <h2>Share / Backup</h2>
            <p class="desc">Save and load your annotations to portable JSON files. Only manuscripts with actual data are included.</p>
        
            <div class="backup-actions" style="flex-wrap: wrap; gap: 15px;">
                <!-- Whole Workspace Backup -->
                <div class="backup-group" style="flex: 1; min-width: 260px; background: var(--color-bg); padding: 15px; border-radius: 8px; border: 1px solid var(--color-border);">
                    <h3 class="mt-0">Annotated Manuscripts</h3>
                    <p class="text-sm-muted-mt0">Exports all manuscripts that have annotations/data.</p>
                    <div class="setting-row">
                        <label>Backup Label</label>
                        <input v-model="store.backupLabel" placeholder="transcription_eqv" class="text-input" style="width: 100%; box-sizing: border-box;">
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button @click="doExportWorkspace" class="btn-primary">Export Manuscripts</button>
                        <button @click="doExportWorkspaceWithSettings" class="btn-secondary" title="Includes app settings and alignments in the export">Include Settings</button>
                    </div>
                </div>
            
                <!-- Per-Manuscript Export -->
                <div class="backup-group" style="flex: 1; min-width: 260px; background: var(--color-bg); padding: 15px; border-radius: 8px; border: 1px solid var(--color-border);">
                    <h3 class="mt-0">Specific Manuscript(s)</h3>
                    <p class="text-sm-muted-mt0">Select specific manuscripts with data to export.</p>
                    <div class="setting-row">
                        <select v-model="selectedManuscriptsToExport" multiple class="text-input" style="height: 85px; width: 100%; box-sizing: border-box;">
                            <option v-for="ms in manuscriptsWithData" :key="ms.source" :value="ms.source">
                                {{ ms.source }} ({{ ms.annotationsCount }} snips, {{ ms.foliosCount }} fols)
                            </option>
                        </select>
                    </div>
                    <button @click="doExportManuscripts" class="btn-primary" :disabled="!selectedManuscriptsToExport.length">
                        Export Selected ({{ selectedManuscriptsToExport.length }})
                    </button>
                </div>

                <!-- Standalone Configuration File -->
                <div class="backup-group" style="flex: 1; min-width: 260px; background: var(--color-bg); padding: 15px; border-radius: 8px; border: 1px solid var(--color-border);">
                    <h3 class="mt-0">Configuration Files</h3>
                    <p class="text-sm-muted-mt0">Save display modes, preferred IDs, neume names, and folio alignments separately.</p>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 15px;">
                        <button @click="doExportConfig" class="btn-primary">Export Config</button>
                        <div class="import-zone">
                            <input type="file" ref="configFileInput" @change="doImportConfig" accept=".json" class="d-none">
                            <button @click="$refs.configFileInput.click()" class="btn-secondary">Import Config</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="backup-actions mt-20" style="background: var(--color-bg); padding: 15px; border-radius: 8px; border: 1px solid var(--color-border);">
                <div class="import-zone">
                    <input type="file" ref="fileInput" @change="doImport" accept=".json" multiple class="d-none">
                    <button @click="$refs.fileInput.click()" class="btn-primary">Import Backup / Manuscript File</button>
                </div>
            
                <div class="flex-1"></div>
                <button @click="doClearAll" class="btn-danger btn-secondary border-danger">Remove All Data</button>
            </div>
            <div v-if="importMsg" :class="['msg', importStatus]">{{ importMsg }}</div>

            <!-- Individual Manuscript Management & Deletion Table -->
            <div v-if="manuscriptsWithData.length" class="mt-20" style="background: var(--color-bg); padding: 15px; border-radius: 8px; border: 1px solid var(--color-border);">
                <h3 class="mt-0">Manuscripts in Workspace ({{ manuscriptsWithData.length }})</h3>
                <p class="text-sm-muted-mt0">Manage data, export, or selectively clean annotations for individual manuscripts.</p>
            
                <div style="overflow-x: auto; margin-top: 12px;">
                    <table class="ms-manage-table" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--color-border); text-align: left;">
                                <th style="padding: 8px;">Manuscript</th>
                                <th style="padding: 8px;">Annotations / Snippets</th>
                                <th style="padding: 8px;">Line Regions</th>
                                <th style="padding: 8px;">Table Rows</th>
                                <th style="padding: 8px; text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="ms in manuscriptsWithData" :key="ms.source" style="border-bottom: 1px solid var(--color-border);">
                                <td style="padding: 8px; font-weight: 600;">{{ ms.source }}</td>
                                <td style="padding: 8px;">{{ ms.annotationsCount }} snippets ({{ ms.foliosCount }} folios)</td>
                                <td style="padding: 8px;">{{ ms.regionsCount }} lines</td>
                                <td style="padding: 8px;">{{ ms.patternRowsCount }} patterns</td>
                                <td style="padding: 8px; text-align: right;">
                                    <div style="display: inline-flex; gap: 6px;">
                                        <button class="btn-xs" @click="exportManuscripts([ms.source])">Export</button>
                                        <button class="btn-xs btn-danger-outline" @click="openCleanup(ms.source)" title="Delete or clean annotations for this manuscript">🗑 Manage / Delete</button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="mt-20" style="background: var(--color-bg); padding: 15px; border-radius: 8px; border-left: 4px solid var(--accent-color);">
                <h3 class="mt-0" style="color: var(--accent-color);">Static Public Site (HTML &amp; Markdown)</h3>
                <p class="desc" style="margin-bottom: 10px;">
                    Download a standalone ZIP that mirrors the public viewer offline: one HTML + Markdown page per published manuscript,
                    plus cropped IIIF image snippets saved as files (usable as citation "quotes"). Snippets are fetched live from the
                    IIIF servers, so keep this tab connected while it runs.
                </p>
                <button @click="doExportStaticSite" class="btn-primary" :disabled="staticExporting">
                    {{ staticExporting ? 'Exporting…' : 'Download static site' }}
                </button>
                <div v-if="staticExportMsg" :class="['msg', staticExportStatus === 'error' ? 'error' : 'success']" style="margin-top: 10px;">
                    {{ staticExportMsg }}
                </div>
            </div>
        </div>

    <MergeConflictModal
        v-if="showMergeModal"
        :analysis="pendingAnalysis"
        @confirm="confirmMerge"
        @cancel="cancelMerge"
    />

    <!-- Manuscript Cleanup & Deletion Modal -->
    <ManuscriptCleanupModal
        :isOpen="showCleanupModal"
        :source="cleanupModalSource"
        @close="showCleanupModal = false"
        @deleted="onManuscriptDeleted"
    />
</template>

<style scoped>
.backup-actions { display: flex; gap: 10px; margin-top: 15px; align-items: center; }
/* the second row sits further from the first; this rule was always the stronger one */
.backup-actions.mt-20 { margin-top: 20px; }
.import-zone { display: inline-block; }
.text-input { width: 100%; max-width: 300px; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px; font-size: 0.95rem; }
.msg { margin-top: 10px; padding: 10px; border-radius: 4px; font-size: 0.9em; }
.msg.success { background: var(--color-success-light, var(--color-success-light)); color: var(--color-success); border: 1px solid var(--color-success-light); }
.msg.error { background: var(--color-danger-light, var(--color-danger-light)); color: var(--color-danger); border: 1px solid var(--color-danger-light, var(--color-danger-light)); }
</style>
