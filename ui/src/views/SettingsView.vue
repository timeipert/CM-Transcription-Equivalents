<script setup>
import { ref, computed } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { useDataManagement } from '../composables/useDataManagement';
import SvgPattern from '../components/SvgPattern.vue';
import { useWorkspaceStorage } from '../composables/useWorkspaceStorage';

import { useTranscriptionData } from '../composables/useTranscriptionData';
import { exportStaticSite } from '../composables/useStaticExport';

const store = useSettingsStore();
const { sourceFolios } = useTranscriptionData();
const storage = useWorkspaceStorage();

// Static site export
const staticExporting = ref(false);
const staticExportMsg = ref("");
const staticExportStatus = ref(""); // 'success' | 'error' | 'progress'

async function doExportStaticSite() {
    if (staticExporting.value) return;
    staticExporting.value = true;
    staticExportStatus.value = "progress";
    staticExportMsg.value = "Starting export…";
    try {
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

// Data Management
import { getManuscriptStats } from '../utils/workspaceSharing';
import ManuscriptCleanupModal from '../components/ManuscriptCleanupModal.vue';
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

const fileInput = ref(null);
const configFileInput = ref(null);
const selectedManuscriptsToExport = ref([]);
const importMsg = ref("");
const importStatus = ref(""); // 'success' or 'error'

// Cleanup Modal State
const cleanupModalSource = ref('');
const showCleanupModal = ref(false);

function openCleanup(source) {
    cleanupModalSource.value = source;
    showCleanupModal.value = true;
}

function onManuscriptDeleted(msg) {
    importMsg.value = msg;
    importStatus.value = "success";
    setTimeout(() => importMsg.value = "", 4000);
}

// Manuscripts that actually contain data
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
const mergeChoices = ref({});
const importSettingsChoice = ref(true);

function doClearAll() {
    if (confirm("Are you sure you want to delete ALL your local annotations, regions, and tables? This cannot be undone! Make sure you export a JSON backup first.")) {
        clearAllData();
        importMsg.value = "All data has been removed.";
        importStatus.value = "success";
        setTimeout(() => importMsg.value = "", 4000);
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
            importMsg.value = `Error: ${res.error}`;
            importStatus.value = "error";
            return;
        }
        importConfiguration(res.parsed);
        importMsg.value = "Configuration loaded successfully!";
        importStatus.value = "success";
        setTimeout(() => importMsg.value = "", 4000);
    } catch (e) {
        importMsg.value = `Config Error: ${e.message}`;
        importStatus.value = "error";
    } finally {
        event.target.value = null;
    }
}

async function doImport(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    importMsg.value = "Analyzing file...";
    importStatus.value = "";
    
    try {
        const results = await analyzeImportFiles(files);
        const result = results[0];
        
        if (!result.success) {
            importMsg.value = `Error: ${result.error}`;
            importStatus.value = "error";
            return;
        }

        // If it's a standalone config file, apply directly
        if (result.isConfigOnly) {
            importConfiguration(result.parsed);
            importMsg.value = "Configuration file imported successfully!";
            importStatus.value = "success";
            setTimeout(() => importMsg.value = "", 4000);
            return;
        }

        if (result.overlapSources.length > 0) {
            // Need conflict resolution
            pendingAnalysis.value = result;
            mergeChoices.value = {};
            importSettingsChoice.value = result.hasSettings;
            // Default: if incoming has data, default to skip; if incoming empty, force skip
            result.overlapSources.forEach(item => {
                mergeChoices.value[item.source] = 'skip';
            });
            showMergeModal.value = true;
            importMsg.value = "Merge resolution required.";
            importStatus.value = "";
        } else {
            // No overlaps, execute immediately
            executeImport(result.parsed, {}, { importSettings: true });
            importMsg.value = `Success! Imported ${result.newSources.length} manuscript(s).`;
            importStatus.value = "success";
            setTimeout(() => importMsg.value = "", 4000);
        }
    } catch (e) {
        importMsg.value = `Critical Error: ${e.message}`;
        importStatus.value = "error";
    } finally {
        event.target.value = null; // Clear input
    }
}

function setAllMergeChoices(choice) {
    if (pendingAnalysis.value && pendingAnalysis.value.overlapSources) {
        pendingAnalysis.value.overlapSources.forEach(item => {
            // Do not allow overwrite/copy if incoming has no data
            if (choice !== 'skip' && !item.incomingStats.hasData) return;
            mergeChoices.value[item.source] = choice;
        });
    }
}

function confirmMerge() {
    try {
        executeImport(pendingAnalysis.value.parsed, mergeChoices.value, { 
            importSettings: importSettingsChoice.value 
        });
        showMergeModal.value = false;
        importMsg.value = "Success! Data imported and merged.";
        importStatus.value = "success";
        setTimeout(() => importMsg.value = "", 4000);
    } catch(e) {
        importMsg.value = `Merge Error: ${e.message}`;
        importStatus.value = "error";
        showMergeModal.value = false;
    }
}

function cancelMerge() {
    showMergeModal.value = false;
    importMsg.value = "Import cancelled.";
    importStatus.value = "";
    setTimeout(() => importMsg.value = "", 4000);
}

// UI State for adding new ID mapping
const newPattern = ref("");
const newId = ref("");

function addMapping() {
    if (newPattern.value && newId.value) {
        store.setGlobalId(newPattern.value, newId.value);
        newPattern.value = "";
        newId.value = "";
    }
}

// UI State for Neume Names
import { DEFAULT_NEUME_NAMES, getNeumeName } from '../config/neumeNames';
const newNeumePattern = ref("");
const newNeumeName = ref("");

const allDisplayNeumeNames = computed(() => {
    // Combine defaults and user overrides
    const combined = { ...DEFAULT_NEUME_NAMES, ...store.neumeNames };
    return combined;
});

function addNeumeNameMapping() {
    if (newNeumePattern.value && newNeumeName.value) {
        store.setNeumeName(newNeumePattern.value, newNeumeName.value);
        newNeumePattern.value = "";
        newNeumeName.value = "";
    }
}

function resetDefaultNeumeNames() {
    if (confirm("Reset all custom neume names to standard defaults?")) {
        store.neumeNames = {};
    }
}

// --- Custom Signs (code variants) ---
import { validateSignKey } from '../utils/signs';
const { glyphs } = useTranscriptionData();
const glyphOptions = computed(() => Object.keys(glyphs.value || {}));

const newSign = ref({ key: '', label: '', abbrev: '', description: '', glyph: 'note', glyphSvg: '' });
const signError = ref('');

function addSign() {
    const key = newSign.value.key.trim().toUpperCase();
    const err = validateSignKey(key, store.customSigns.map(s => s.key));
    if (err) { signError.value = err; return; }
    if (!newSign.value.label.trim()) { signError.value = 'A label is required.'; return; }
    store.addCustomSign({
        key,
        label: newSign.value.label.trim(),
        abbrev: newSign.value.abbrev.trim() || key,
        description: newSign.value.description.trim(),
        glyph: newSign.value.glyph || '',
        glyphSvg: newSign.value.glyphSvg.trim()
    });
    newSign.value = { key: '', label: '', abbrev: '', description: '', glyph: 'note', glyphSvg: '' };
    signError.value = '';
}

async function onSignSvgFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    newSign.value.glyphSvg = await file.text();
    e.target.value = null;
}

// Flat list of all defined code variants for review/removal.
const allCodeVariants = computed(() => {
    const out = [];
    for (const [base, list] of Object.entries(store.codeVariants || {})) {
        for (const v of list) out.push({ base, ...v });
    }
    return out;
});

// Variant editor, reachable from Settings for any pattern (no region needed).
import VariantEditorModal from '../components/VariantEditorModal.vue';
const newVariantBase = ref('');
const showVariantEditor = ref(false);
const variantBaseCode = ref('');
const editingVariant = ref(null);

function openVariantEditorFor(base) {
    const b = (base || '').trim();
    if (!b) return;
    variantBaseCode.value = b;
    editingVariant.value = null;
    showVariantEditor.value = true;
    newVariantBase.value = '';
}

function editVariantFromSettings(v) {
    variantBaseCode.value = v.base;
    editingVariant.value = v;
    showVariantEditor.value = true;
}

// Manuscript Alignment State
const editingAlignment = ref(null); // { source, dataType, iiifType, offset, adjustments }
const testDataFolio = ref('170r');

const availableSources = computed(() => Object.keys(sourceFolios.value || {}).sort());
const configuredAlignments = computed(() => Object.keys(store.sourceAlignments || {}));

function startEditAlignment(source) {
    const existing = store.sourceAlignments[source];
    if (existing) {
        editingAlignment.value = {
            source,
            dataType: existing.dataType || 'foliated',
            iiifType: existing.iiifType || 'paginated',
            offset: existing.offset || 0,
            adjustments: existing.adjustments ? JSON.parse(JSON.stringify(existing.adjustments)) : []
        };
    } else {
        editingAlignment.value = {
            source: source || '',
            dataType: 'foliated',
            iiifType: 'paginated',
            offset: 0,
            adjustments: []
        };
    }
}

function saveAlignment() {
    const edit = editingAlignment.value;
    if (!edit.source) return;
    store.setSourceAlignment(edit.source, {
        dataType: edit.dataType,
        iiifType: edit.iiifType,
        offset: parseInt(edit.offset) || 0,
        adjustments: edit.adjustments.map(r => ({ fromFolio: r.fromFolio, adjust: parseInt(r.adjust)||0 }))
    });
    editingAlignment.value = null;
}

function deleteAlignment(source) {
    store.removeSourceAlignment(source);
}

function addAdjustment() {
    editingAlignment.value.adjustments.push({ fromFolio: '1r', adjust: 1 });
}
function removeAdjustment(idx) {
    editingAlignment.value.adjustments.splice(idx, 1);
}

import { folioToIndex, indexToFolio } from '../utils/folioMath';

const alignPreview = computed(() => {
    if (!editingAlignment.value) return '';
    const startStr = testDataFolio.value;
    const dataIdx = folioToIndex(startStr, editingAlignment.value.dataType);
    if (dataIdx === null) return 'Invalid Data Folio';
    
    let totalOffset = parseInt(editingAlignment.value.offset) || 0;
    for (const rule of editingAlignment.value.adjustments) {
        const ruleIdx = folioToIndex(rule.fromFolio, editingAlignment.value.dataType);
        if (ruleIdx !== null && dataIdx >= ruleIdx) {
            totalOffset += (parseInt(rule.adjust) || 0);
        }
    }
    
    const iiifIdx = dataIdx + totalOffset;
    const iiifStr = indexToFolio(iiifIdx, editingAlignment.value.iiifType);
    return `Data [${startStr}] ➔ IIIF [${iiifStr || 'Invalid'}]`;
});
</script>

<template>
<div class="settings-container">
    <h1>Global Settings</h1>

    <!-- PROJECT FOLDER SECTION -->
    <div class="card section" v-if="storage.isSupported">
        <h2>Project Folder (Permanent Storage)</h2>
        <p class="desc">Save your workspace permanently to a local folder. Changes will autosave automatically.</p>
        
        <div class="folder-status-panel">
            <div class="folder-info">
                <strong>Current Folder:</strong> 
                <span v-if="storage.folderName" class="folder-name">{{ storage.folderName }}</span>
                <span v-else class="text-muted">None selected</span>
            </div>
            
            <div class="sync-status" v-if="storage.folderName">
                <span v-if="storage.status === 'saving'" class="status-saving">Saving...</span>
                <span v-else-if="storage.status === 'saved'" class="status-saved">✓ Saved {{ storage.lastSavedAt }}</span>
                <span v-else-if="storage.status === 'error'" class="status-error">⚠ {{ storage.lastError }}</span>
            </div>
        </div>

        <div class="folder-actions mt-10">
            <button @click="storage.chooseFolder()" class="btn-primary">
                {{ storage.folderName ? 'Change Folder' : 'Select Folder' }}
            </button>
            <button v-if="storage.status === 'error' && storage.folderName" @click="storage.reGrantPermission()" class="btn-secondary">
                Re-grant Permission
            </button>
            <button v-if="storage.folderName" @click="storage.saveWorkspace()" class="btn-secondary">
                Save Now
            </button>
        </div>
    </div>

    <div class="card section">
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

    <div class="card section">
        <h2>App Defaults</h2>
        
        <div class="setting-row">
            <label>Global Pattern View (Standard)</label>
            <select v-model="store.displayMode">
                <option value="svg">Graphic (SVG)</option>
                <option value="arrow">Arrows (↗/↘)</option>
                <option value="text">Text (u/d/e)</option>
            </select>
        </div>
        
        <div class="setting-row">
            <label>
                <input type="checkbox" v-model="store.autoFillIds">
                Auto-fill Custom IDs in Editor (using preferences below)
            </label>
        </div>
    </div>

    <div class="card section">
        <h2>Preferred Custom IDs</h2>
        <p class="desc">Define default IDs for specific patterns (e.g., "*dd" -> "Type A"). These will be auto-filled in the editor.</p>

        <div class="add-row">
            <input v-model="newPattern" placeholder="Pattern (e.g. *dd)" />
            <input v-model="newId" placeholder="Default ID (e.g. Type A)" />
            <button @click="addMapping" :disabled="!newPattern || !newId">Add Preference</button>
        </div>

        <div class="ids-list">
            <table v-if="Object.keys(store.globalDisplayIds).length > 0">
                <thead>
                    <tr>
                        <th>Pattern</th>
                        <th>Preferred ID</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(id, pat) in store.globalDisplayIds" :key="pat">
                        <td class="code-font">{{ pat }}</td>
                        <td>{{ id }}</td>
                        <td>
                            <button @click="store.removeGlobalId(pat)" class="btn-sm btn-danger">Remove</button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div v-else class="empty">No global ID preferences set</div>
        </div>
    </div>

    <div class="card section">
        <div class="flex-between-mb10">
            <h2>Neume Names (Neumentabelle)</h2>
            <button @click="resetDefaultNeumeNames" class="btn-sm btn-secondary" title="Reset custom names to defaults">Reset to Defaults</button>
        </div>
        <p class="desc">Define or customize human-readable chant names for patterns (e.g., "*u" &rarr; "Pes", "*d" &rarr; "Clivis"). These will appear in the Neumentabelle column headers.</p>

        <div class="add-row">
            <input v-model="newNeumePattern" placeholder="Pattern (e.g. *u)" />
            <input v-model="newNeumeName" placeholder="Neume Name (e.g. Pes)" />
            <button @click="addNeumeNameMapping" :disabled="!newNeumePattern || !newNeumeName">Save Name</button>
        </div>

        <div class="ids-list">
            <table v-if="Object.keys(allDisplayNeumeNames).length > 0">
                <thead>
                    <tr>
                        <th>Pattern</th>
                        <th>Neume Name</th>
                        <th>Type</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(name, pat) in allDisplayNeumeNames" :key="pat">
                        <td class="code-font">{{ pat }}</td>
                        <td>{{ name }}</td>
                        <td>
                            <span v-if="store.neumeNames && store.neumeNames[pat]" class="badge">Custom</span>
                            <span v-else class="text-sm-light">Default</span>
                        </td>
                        <td>
                            <button v-if="store.neumeNames && store.neumeNames[pat]" @click="store.removeNeumeName(pat)" class="btn-sm btn-danger">Remove</button>
                            <span v-else class="text-sm-light">—</span>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div v-else class="empty">No neume names defined</div>
        </div>
    </div>

    <div class="card section">
        <h2>Custom Signs &amp; Code Variants</h2>
        <p class="desc">Define project-wide special signs (e.g. a <em>virga</em>) that can be applied to
            individual notes to create <strong>code variants</strong> of a pattern — variants that change the
            code itself, e.g. <span class="code-font">*uudd</span> &rarr; <span class="code-font">*uuVdd</span>.
            Each sign is a single uppercase letter used as a per-note suffix (like the built-in O/Q/S/L signs).
            Create variants by clicking <span class="code-font">+var</span> on a pattern in the Polygon editor.</p>

        <div class="sign-form">
            <div class="sign-form-row">
                <div class="ff">
                    <label>Key (A–Z)</label>
                    <input v-model="newSign.key" maxlength="1" placeholder="V" class="key-input" />
                </div>
                <div class="ff">
                    <label>Label</label>
                    <input v-model="newSign.label" placeholder="Virga" />
                </div>
                <div class="ff">
                    <label>Abbrev.</label>
                    <input v-model="newSign.abbrev" maxlength="3" placeholder="v" />
                </div>
                <div class="ff">
                    <label>Built-in glyph</label>
                    <select v-model="newSign.glyph">
                        <option value="">(none)</option>
                        <option v-for="g in glyphOptions" :key="g" :value="g">{{ g }}</option>
                    </select>
                </div>
            </div>
            <div class="sign-form-row">
                <div class="ff grow">
                    <label>Description</label>
                    <input v-model="newSign.description" placeholder="Shown as a virga (vertical stroke) instead of a punctum" />
                </div>
            </div>
            <div class="sign-form-row">
                <div class="ff grow">
                    <label>Custom glyph SVG (optional — overrides the built-in glyph)</label>
                    <textarea v-model="newSign.glyphSvg" rows="2" placeholder="Paste &lt;svg&gt;…&lt;/svg&gt; here, or upload a file"></textarea>
                    <input type="file" accept=".svg,image/svg+xml" @change="onSignSvgFile" class="svg-file" />
                </div>
                <div class="ff preview-ff" v-if="newSign.key">
                    <label>Preview</label>
                    <div class="sign-preview">
                        <SvgPattern :pattern="'*u' + newSign.key.toUpperCase() + 'd'" :glyphs="glyphs" />
                    </div>
                </div>
            </div>
            <div class="sign-form-actions">
                <span v-if="signError" class="sign-error">{{ signError }}</span>
                <button @click="addSign" :disabled="!newSign.key || !newSign.label">Add Sign</button>
            </div>
        </div>

        <div class="ids-list">
            <table v-if="store.customSigns.length > 0">
                <thead>
                    <tr><th>Key</th><th>Label</th><th>Description</th><th>Glyph</th><th>Sample</th><th>Action</th></tr>
                </thead>
                <tbody>
                    <tr v-for="s in store.customSigns" :key="s.key">
                        <td class="code-font"><strong>{{ s.key }}</strong></td>
                        <td>{{ s.label }}</td>
                        <td class="text-sm-light">{{ s.description }}</td>
                        <td>{{ s.glyphSvg ? 'custom SVG' : (s.glyph || '—') }}</td>
                        <td><SvgPattern :pattern="'*u' + s.key + 'd'" :glyphs="glyphs" /></td>
                        <td><button @click="store.removeCustomSign(s.key)" class="btn-sm btn-danger">Remove</button></td>
                    </tr>
                </tbody>
            </table>
            <div v-else class="empty">No custom signs defined</div>
        </div>

        <label class="discriminate-toggle">
            <input type="checkbox" v-model="store.discriminateSigns" />
            Discriminate code variants in overviews &amp; IDs
            <span class="text-sm-light">(off = merge each variant back into its base pattern)</span>
        </label>

        <div class="variants-review">
            <h3 class="mt-0">Code Variants ({{ allCodeVariants.length }})</h3>
            <p class="desc">
                Create a variant here for any pattern, or click <strong>+ Variant</strong> next to a pattern
                in <router-link to="/polygons">Manuscripts</router-link> (after opening a line region).
            </p>

            <div class="add-row" v-if="store.customSigns.length > 0">
                <input v-model="newVariantBase" placeholder="Base pattern (e.g. *uudd)" />
                <button @click="openVariantEditorFor(newVariantBase)" :disabled="!newVariantBase.trim()">
                    Create Variant…
                </button>
            </div>
            <div v-else class="empty">Define at least one custom sign above to create code variants.</div>

            <table v-if="allCodeVariants.length > 0">
                <thead>
                    <tr><th>Base</th><th>Variant</th><th>Variant code</th><th>Label</th><th>Description</th><th>Action</th></tr>
                </thead>
                <tbody>
                    <tr v-for="v in allCodeVariants" :key="v.base + v.id">
                        <td class="code-font">{{ v.base }}</td>
                        <td><SvgPattern :pattern="v.code" :glyphs="glyphs" /></td>
                        <td class="code-font"><strong>{{ v.code }}</strong></td>
                        <td>{{ v.label }}</td>
                        <td class="text-sm-light">{{ v.description }}</td>
                        <td>
                            <button @click="editVariantFromSettings(v)" class="btn-sm btn-secondary">Edit</button>
                            <button @click="store.removeCodeVariant(v.base, v.id)" class="btn-sm btn-danger">Remove</button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div v-else-if="store.customSigns.length > 0" class="empty">No code variants defined yet</div>
        </div>
    </div>

    <VariantEditorModal
        :visible="showVariantEditor"
        :baseCode="variantBaseCode"
        :editing="editingVariant"
        :glyphs="glyphs"
        @close="showVariantEditor = false"
    />

    <div class="card section">
        <h2>Manuscript Alignment</h2>
        <p class="desc">Map and align folios between transcription data and IIIF manifests. Supports jumping offsets.</p>

        <div v-if="!editingAlignment">
            <div class="ids-list">
                <table v-if="configuredAlignments.length > 0">
                    <thead>
                        <tr>
                            <th>Source</th>
                            <th>Data</th>
                            <th>IIIF</th>
                            <th>Base Offset</th>
                            <th>Rules</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="src in configuredAlignments" :key="src">
                            <td class="code-font">{{ src }}</td>
                            <td>{{ store.sourceAlignments[src].dataType }}</td>
                            <td>{{ store.sourceAlignments[src].iiifType }}</td>
                            <td>{{ store.sourceAlignments[src].offset }}</td>
                            <td>{{ store.sourceAlignments[src].adjustments?.length || 0 }} jumps</td>
                            <td>
                                <button @click="startEditAlignment(src)" class="btn-sm btn-primary mr-8">Edit</button>
                                <button @click="deleteAlignment(src)" class="btn-sm btn-danger">Remove</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div v-else class="empty mb-15">No manuscripts have custom alignment rules configured.</div>
            </div>
            <button @click="startEditAlignment('')" class="btn-primary">Add Configuration</button>
        </div>

        <div v-else class="alignment-editor">
            <div class="setting-row" v-if="!store.sourceAlignments[editingAlignment.source]">
                <label>Select Manuscript to Configure</label>
                <select v-model="editingAlignment.source">
                    <option value="">-- Select Source --</option>
                    <option v-for="src in availableSources" :key="src" :value="src">{{ src }}</option>
                </select>
            </div>
            <h3 v-else class="mt-0">Configuring: {{ editingAlignment.source }}</h3>

            <div class="align-grid">
                <div>
                    <label>Data Format</label>
                    <label class="radio-label"><input type="radio" value="foliated" v-model="editingAlignment.dataType"> Foliated (1r, 1v)</label>
                    <label class="radio-label"><input type="radio" value="paginated" v-model="editingAlignment.dataType"> Paginated (1, 2)</label>
                </div>
                <div>
                    <label>IIIF Format</label>
                    <label class="radio-label"><input type="radio" value="foliated" v-model="editingAlignment.iiifType"> Foliated (1r, 1v)</label>
                    <label class="radio-label"><input type="radio" value="paginated" v-model="editingAlignment.iiifType"> Paginated (1, 2)</label>
                </div>
                <div>
                    <label>Base Offset</label>
                    <input type="number" v-model="editingAlignment.offset" class="w-80-p6">
                    <p class="text-sm-light">Applied to all folios</p>
                </div>
            </div>

            <div class="jump-rules">
                <div class="flex-between-mb10">
                    <label class="fw-bold">Jump Rules</label>
                    <button @click="addAdjustment" class="btn-sm btn-secondary">+ Add Jump</button>
                </div>
                <p class="text-sm-muted-mt0">Use this if the IIIF manifest skips images or jumps midway (e.g. missing pages).</p>
                
                <table v-if="editingAlignment.adjustments.length > 0">
                    <thead><tr><th>From Data Folio</th><th>Extra Offset</th><th></th></tr></thead>
                    <tbody>
                        <tr v-for="(rule, idx) in editingAlignment.adjustments" :key="idx">
                            <td><input v-model="rule.fromFolio" placeholder="e.g. 170r"></td>
                            <td><input type="number" v-model="rule.adjust" placeholder="e.g. +2"></td>
                            <td><button @click="removeAdjustment(idx)" class="btn-sm btn-danger">X</button></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="align-preview mt-20">
                <div class="mb-10">
                    <strong>Live Preview</strong> - Test a Data Folio: 
                    <input v-model="testDataFolio" class="w-60-p4" />
                </div>
                <div>{{ alignPreview }}</div>
            </div>

            <div class="add-row add-row-actions">
                <button @click="editingAlignment = null" class="btn-secondary mr-auto">Cancel</button>
                <button @click="saveAlignment" class="btn-primary" :disabled="!editingAlignment.source">Save Alignment</button>
            </div>
        </div>
    </div>

    <!-- Merge Conflict Modal -->
    <div v-if="showMergeModal" class="modal">
        <div class="modal-content" style="width: 750px; max-width: 95vw;">
            <div class="modal-header">
                <h3>Merge Conflict Resolution</h3>
                <span class="close" @click="cancelMerge">&times;</span>
            </div>
            <div class="modal-body">
                <p>The imported file <strong>{{ pendingAnalysis.fileName }}</strong> contains data for manuscripts that already exist in your workspace.</p>
                
                <div v-if="pendingAnalysis.newSources && pendingAnalysis.newSources.length > 0" class="merge-section">
                    <h4>New Manuscripts (Will be imported safely)</h4>
                    <div class="new-sources-list">
                        <span v-for="item in pendingAnalysis.newSources" :key="item.source" class="badge">
                            {{ item.source }} ({{ item.incomingStats.annotationsCount }} snips, {{ item.incomingStats.foliosCount }} fols)
                        </span>
                    </div>
                </div>

                <div class="merge-section">
                    <div class="merge-section-header">
                        <h4>Overlapping Manuscripts</h4>
                        <div v-if="pendingAnalysis.overlapSources && pendingAnalysis.overlapSources.length > 0" class="bulk-select-bar">
                            <span class="bulk-label">Select all:</span>
                            <button type="button" class="btn-bulk" @click="setAllMergeChoices('skip')">Skip All</button>
                            <button type="button" class="btn-bulk" @click="setAllMergeChoices('copy')">Import All as Copy</button>
                            <button type="button" class="btn-bulk btn-bulk-danger" @click="setAllMergeChoices('overwrite')">Overwrite All</button>
                        </div>
                    </div>
                    <p class="desc">Compare the incoming vs local data metrics below and select the desired action for each manuscript.</p>
                    
                    <div class="conflict-list">
                        <div v-for="item in pendingAnalysis.overlapSources" :key="item.source" class="conflict-card">
                            <div class="conflict-header-row">
                                <span class="src-name">{{ item.source }}</span>
                                <div class="conflict-stats-row">
                                    <div class="stat-pill incoming">
                                        <strong>Incoming File:</strong>
                                        <span v-if="item.incomingStats.hasData">
                                            {{ item.incomingStats.annotationsCount }} snips across {{ item.incomingStats.foliosCount }} fols ({{ item.incomingStats.foliosList.slice(0, 4).join(', ') }}{{ item.incomingStats.foliosList.length > 4 ? '...' : '' }})
                                        </span>
                                        <span v-else class="text-muted">Empty (0 annotations)</span>
                                    </div>
                                    <div class="stat-pill local">
                                        <strong>Local Workspace:</strong>
                                        <span v-if="item.localStats.hasData">
                                            {{ item.localStats.annotationsCount }} snips across {{ item.localStats.foliosCount }} fols ({{ item.localStats.foliosList.slice(0, 4).join(', ') }}{{ item.localStats.foliosList.length > 4 ? '...' : '' }})
                                        </span>
                                        <span v-else class="text-muted">Empty</span>
                                    </div>
                                </div>
                            </div>

                            <div class="conflict-actions mt-10">
                                <label class="radio-label" :class="{ selected: mergeChoices[item.source] === 'skip' }">
                                    <input type="radio" :name="'merge_' + item.source" value="skip" v-model="mergeChoices[item.source]">
                                    Skip
                                </label>
                                <label 
                                    :class="['radio-label', { selected: mergeChoices[item.source] === 'copy', disabled: !item.incomingStats.hasData }]"
                                    :title="!item.incomingStats.hasData ? 'Cannot copy empty manuscript' : ''"
                                >
                                    <input type="radio" :name="'merge_' + item.source" value="copy" v-model="mergeChoices[item.source]" :disabled="!item.incomingStats.hasData">
                                    Import as Copy
                                </label>
                                <label 
                                    :class="['radio-label overwrite', { selected: mergeChoices[item.source] === 'overwrite', disabled: !item.incomingStats.hasData }]"
                                    :title="!item.incomingStats.hasData ? 'Cannot overwrite with empty manuscript' : ''"
                                >
                                    <input type="radio" :name="'merge_' + item.source" value="overwrite" v-model="mergeChoices[item.source]" :disabled="!item.incomingStats.hasData">
                                    Overwrite Local
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="pendingAnalysis.hasSettings" class="merge-section">
                    <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" v-model="importSettingsChoice" />
                        <strong>Import App Settings &amp; Preferences</strong> (global IDs, neume names, alignments) from this file
                    </label>
                </div>
            </div>
            <div class="modal-footer">
                <button @click="cancelMerge" class="btn-secondary">Cancel</button>
                <button @click="confirmMerge" class="btn-primary">Confirm Import</button>
            </div>
        </div>
    </div>

    <!-- Manuscript Cleanup & Deletion Modal -->
    <ManuscriptCleanupModal
        :isOpen="showCleanupModal"
        :source="cleanupModalSource"
        @close="showCleanupModal = false"
        @deleted="onManuscriptDeleted"
    />
</div>
</template>

<style scoped>
.settings-container { padding: 30px; max-width: 800px; margin: 0 auto; }
h1 { margin-bottom: 30px; }
.section { margin-bottom: 30px; text-align: left; }

.sign-form { border: 1px solid var(--color-border); border-radius: 8px; padding: 14px; margin-bottom: 16px; background: var(--color-bg); }
.sign-form-row { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-end; }
.ff { display: flex; flex-direction: column; gap: 4px; }
.ff.grow { flex: 1; }
.ff label { font-size: 11px; font-weight: 600; color: var(--color-text-muted); }
.ff input, .ff select, .ff textarea { padding: 6px 9px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; font-family: inherit; box-sizing: border-box; }
.key-input { width: 56px; text-transform: uppercase; text-align: center; font-weight: 700; }
.svg-file { margin-top: 6px; font-size: 11px; }
.preview-ff { align-items: center; }
.sign-preview { background: white; border: 1px solid var(--color-border); border-radius: 6px; padding: 4px 10px; min-width: 60px; display: flex; justify-content: center; }
.sign-form-actions { display: flex; align-items: center; gap: 12px; justify-content: flex-end; }
.sign-error { color: var(--color-danger, #dc2626); font-size: 12px; }
.discriminate-toggle { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
.discriminate-toggle input { width: auto; }
.variants-review { margin-top: 20px; }
.section h2 { margin-top: 0; border-bottom: 1px solid var(--color-border); padding-bottom: 10px; margin-bottom: 20px; font-size: 1.2em; }
.desc { color: var(--color-text-muted); font-size: 14px; margin-top: -5px; margin-bottom: 15px; }

.folder-status-panel { background: var(--color-bg); padding: 15px; border-radius: 8px; border: 1px solid var(--color-border); margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
.folder-name { font-family: monospace; background: var(--color-surface); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border); font-size: 13px; }
.sync-status { font-size: 13px; font-weight: 500; }
.status-saving { color: var(--color-text-muted); }
.status-saved { color: var(--color-primary); }
.status-error { color: var(--color-danger); }
.folder-actions { display: flex; gap: 10px; }
.mt-10 { margin-top: 10px; }

.setting-row { margin-bottom: 15px; display: flex; flex-direction: column; }
.setting-row label { display: block; font-weight: 500; }
.setting-row select { margin-top: 5px; padding: 8px; width: 200px; }
.setting-row input[type="checkbox"] { margin-right: 10px; }

.add-row { display: flex; gap: 10px; margin-bottom: 20px; background: var(--color-bg); padding: 15px; border-radius: 4px; }
.add-row input { flex: 1; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px; }

table { width: 100%; border-collapse: collapse; }
th, td { border-bottom: 1px solid var(--color-border); padding: 10px; text-align: left; }
th { background: var(--color-surface-muted); font-weight: 600; }
.code-font { font-family: monospace; color: var(--color-text-muted); font-weight: bold; }
.empty { color: var(--color-text-light); font-style: italic; padding: 20px; text-align: center; background: var(--color-bg); border-radius: 4px; }

.btn-sm { padding: 4px 10px; font-size: 0.8em; }
.btn-danger { color: var(--color-danger); border-color: var(--color-danger, var(--color-danger)); background: var(--color-danger-light, var(--color-danger-light)); }
.btn-danger:hover { background: var(--color-danger-light, var(--color-danger-light)); }

/* Backup UI Styles */
.backup-actions { display: flex; gap: 10px; margin-top: 15px; align-items: center; }
.import-zone { display: inline-block; }
.text-input { width: 100%; max-width: 300px; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px; font-size: 0.95rem; }
.msg { margin-top: 10px; padding: 10px; border-radius: 4px; font-size: 0.9em; }
.msg.success { background: var(--color-success-light, var(--color-success-light)); color: var(--color-success); border: 1px solid var(--color-success-light); }
.msg.error { background: var(--color-danger-light, var(--color-danger-light)); color: var(--color-danger); border: 1px solid var(--color-danger-light, var(--color-danger-light)); }
.btn-secondary { background: white; color: var(--color-text); border: 1px solid var(--color-border); padding: 8px 16px; border-radius: 4px; cursor: pointer; }
.btn-secondary:hover { background: var(--color-surface-muted); }
.btn-primary { background: var(--color-primary); color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; }
.btn-primary:hover { background: var(--color-primary-hover); }

/* Modal Styles */
.modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background: white; border-radius: 8px; width: 600px; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
.modal-header { padding: 20px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { margin: 0; }
.close { font-size: 24px; cursor: pointer; color: var(--color-text-light); }
.close:hover { color: var(--color-text); }
.modal-body { padding: 20px; overflow-y: auto; flex: 1; }
.modal-footer { padding: 20px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 10px; background: var(--color-bg); }

.merge-section { margin-top: 20px; padding: 15px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-bg); }
.merge-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }
.merge-section-header h4 { margin: 0; color: var(--color-text); }
.bulk-select-bar { display: flex; align-items: center; gap: 6px; }
.bulk-label { font-size: 0.85em; color: var(--color-text-muted); font-weight: 500; }
.btn-bulk { padding: 4px 10px; font-size: 0.8em; border-radius: 4px; border: 1px solid var(--color-border); background: white; cursor: pointer; color: var(--color-text); transition: all 0.15s; font-weight: 500; }
.btn-bulk:hover { background: var(--color-primary-light); border-color: var(--color-primary); color: var(--color-primary); }
.btn-bulk-danger:hover { background: var(--color-danger-light, #fee2e2); border-color: var(--color-danger); color: var(--color-danger); }
.merge-section h4 { margin-top: 0; margin-bottom: 10px; color: var(--color-text); }
.new-sources-list { display: flex; flex-wrap: wrap; gap: 8px; }
.badge { background: var(--color-primary-light); color: var(--color-primary-active); padding: 4px 10px; border-radius: 20px; font-size: 0.85em; font-weight: 500; }

.conflict-list { display: flex; flex-direction: column; gap: 12px; }
.conflict-card { background: white; padding: 14px 16px; border-radius: 8px; border: 1px solid var(--color-border); box-shadow: 0 1px 3px rgba(0,0,0,0.03); }
.conflict-header-row { display: flex; flex-direction: column; gap: 6px; }
.conflict-stats-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.stat-pill { font-size: 0.8rem; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--color-border); }
.stat-pill.incoming { background: var(--color-primary-light); color: var(--color-primary-dark); border-color: var(--color-primary-light); }
.stat-pill.local { background: var(--color-surface-muted); color: var(--color-text); }
.src-name { font-weight: 700; font-size: 1.05rem; color: var(--color-text); }
.conflict-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.radio-label { display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 6px 12px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-bg); transition: all 0.2s; font-size: 0.9em; }
.radio-label:hover:not(.disabled) { background: #f0f0f0; }
.radio-label.selected { background: var(--color-success-light, var(--color-success-light)); border-color: var(--color-success); color: var(--color-success); font-weight: 500; }
.radio-label.overwrite.selected { background: var(--color-danger-light, var(--color-danger-light)); border-color: var(--color-danger); color: var(--color-danger); }
.radio-label.disabled { opacity: 0.45; cursor: not-allowed; }
.radio-label input { margin: 0; }
.text-muted { color: var(--color-text-muted); font-style: italic; }

.alignment-editor { margin-top: 15px; padding: 15px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 6px; }
.align-grid { display: flex; gap: 40px; margin-bottom: 20px; }
.align-grid > div > label { display: block; font-weight: bold; margin-bottom: 8px; color: var(--color-text); }
.align-grid .radio-label { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-weight: normal; cursor: pointer; border: none; padding: 0; background: transparent; }
.jump-rules { margin-top:20px; padding:15px; background:white; border:1px solid var(--color-border); border-radius:4px; }
.jump-rules table { margin-top:10px; }
.jump-rules input { padding:6px; border:1px solid var(--color-border); border-radius:4px; width:100%; box-sizing:border-box;}
.align-preview { padding: 12px; background: var(--color-primary-light); color: var(--color-primary); border: 1px solid var(--color-primary-light); border-radius: 4px; font-family: monospace; font-size: 1.1em; text-align: center; }

.d-none { display: none; }
.flex-1 { flex: 1; }
.border-danger { border-color: var(--color-danger); }
.mr-8 { margin-right: 8px; }
.mb-15 { margin-bottom: 15px; }
.mt-0 { margin-top: 0; }
.w-80-p6 { width: 80px; padding: 6px; }
.text-sm-light { font-size: 0.8em; color: var(--color-text-light); }
.flex-between-mb10 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.fw-bold { font-weight: bold; }
.text-sm-muted-mt0 { font-size: 0.85em; color: var(--color-text-muted); margin-top: 0; }
.mt-20 { margin-top: 20px; }
.mb-10 { margin-bottom: 10px; }
.w-60-p4 { width: 60px; padding: 4px; }
.add-row-actions { background: transparent; padding: 0; margin-top: 15px; border-top: 1px solid var(--color-border); padding-top: 15px; justify-content: flex-end; display: flex; }
.mr-auto { margin-right: auto; }
</style>
