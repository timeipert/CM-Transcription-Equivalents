<script setup>
import { ref, computed } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { useDataManagement } from '../composables/useDataManagement';
import SvgPattern from '../components/SvgPattern.vue';

import { useTranscriptionData } from '../composables/useTranscriptionData';

const store = useSettingsStore();
const { sourceFolios } = useTranscriptionData();

// Data Management
const { exportData, analyzeImportFiles, executeImport, clearAllData } = useDataManagement();
const fileInput = ref(null);
const importMsg = ref("");
const importStatus = ref(""); // 'success' or 'error'

// Merge Modal State
const showMergeModal = ref(false);
const pendingAnalysis = ref(null);
const mergeChoices = ref({});

function doClearAll() {
    if (confirm("Are you sure you want to delete ALL your local annotations, regions, and tables? This cannot be undone! Make sure you export a JSON backup first.")) {
        clearAllData();
        importMsg.value = "All data has been removed.";
        importStatus.value = "success";
        setTimeout(() => importMsg.value = "", 4000);
    }
}

function doExport() {
    exportData();
}

async function doImport(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    importMsg.value = "Analyzing file...";
    importStatus.value = "";
    
    try {
        const results = await analyzeImportFiles(files);
        // We handle only the first file for simplicity in conflict resolution
        const result = results[0];
        
        if (!result.success) {
            importMsg.value = `Error: ${result.error}`;
            importStatus.value = "error";
            return;
        }

        if (result.overlapSources.length > 0) {
            // Need conflict resolution
            pendingAnalysis.value = result;
            mergeChoices.value = {};
            result.overlapSources.forEach(src => mergeChoices.value[src] = 'skip');
            showMergeModal.value = true;
            importMsg.value = "Merge resolution required.";
            importStatus.value = "";
        } else {
            // No overlaps, execute immediately
            executeImport(result.parsed, {});
            importMsg.value = "Success! Data imported seamlessly.";
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

function confirmMerge() {
    try {
        executeImport(pendingAnalysis.value.parsed, mergeChoices.value);
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

    <div class="card section">
        <h2>Data Backup</h2>
        <p class="desc">Save and load your annotations from a JSON file.</p>
        
        <div class="setting-row">
            <label>Backup Label (included in filename)</label>
            <input v-model="store.backupLabel" placeholder="transcription_eqv" class="text-input">
        </div>
        
        <div class="backup-actions">
            <button @click="doExport" class="btn-primary">Export JSON</button>
            
            <div class="import-zone">
                <input type="file" ref="fileInput" @change="doImport" accept=".json" multiple style="display:none">
                <button @click="$refs.fileInput.click()" class="btn-secondary">Import JSON</button>
            </div>
            
            <div style="flex: 1"></div>
            <button @click="doClearAll" class="btn-danger btn-secondary" style="border-color: #ef9a9a;">Remove All Data</button>
        </div>
        <div v-if="importMsg" :class="['msg', importStatus]">{{ importMsg }}</div>
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
                                <button @click="startEditAlignment(src)" class="btn-sm btn-primary" style="margin-right:8px;">Edit</button>
                                <button @click="deleteAlignment(src)" class="btn-sm btn-danger">Remove</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div v-else class="empty" style="margin-bottom:15px;">No manuscripts have custom alignment rules configured.</div>
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
            <h3 v-else style="margin-top:0;">Configuring: {{ editingAlignment.source }}</h3>

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
                    <input type="number" v-model="editingAlignment.offset" style="width:80px; padding:6px;">
                    <p style="font-size:0.8em; color:#888;">Applied to all folios</p>
                </div>
            </div>

            <div class="jump-rules">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <label style="font-weight:bold;">Jump Rules</label>
                    <button @click="addAdjustment" class="btn-sm btn-secondary">+ Add Jump</button>
                </div>
                <p style="font-size:0.85em; color:#666; margin-top:0;">Use this if the IIIF manifest skips images or jumps midway (e.g. missing pages).</p>
                
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

            <div class="align-preview" style="margin-top:20px;">
                <div style="margin-bottom:10px;">
                    <strong>Live Preview</strong> - Test a Data Folio: 
                    <input v-model="testDataFolio" style="width:60px; padding:4px;" />
                </div>
                <div>{{ alignPreview }}</div>
            </div>

            <div class="add-row" style="background:transparent; padding:0; margin-top:15px; border-top:1px solid #eee; padding-top:15px; justify-content: flex-end;">
                <button @click="editingAlignment = null" class="btn-secondary" style="margin-right:auto;">Cancel</button>
                <button @click="saveAlignment" class="btn-primary" :disabled="!editingAlignment.source">Save Alignment</button>
            </div>
        </div>
    </div>

    <!-- Merge Conflict Modal -->
    <div v-if="showMergeModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Merge Conflict Resolution</h3>
                <span class="close" @click="cancelMerge">&times;</span>
            </div>
            <div class="modal-body">
                <p>The imported file contains data for manuscripts that already exist in your workspace.</p>
                
                <div v-if="pendingAnalysis.newSources.length > 0" class="merge-section">
                    <h4>New Manuscripts (Will be imported safely)</h4>
                    <div class="new-sources-list">
                        <span v-for="src in pendingAnalysis.newSources" :key="src" class="badge">{{ src }}</span>
                    </div>
                </div>

                <div class="merge-section">
                    <h4>Overlapping Manuscripts</h4>
                    <p class="desc">Choose whether to overwrite your local data with the imported data, or skip importing these specific manuscripts.</p>
                    <div class="conflict-list">
                        <div v-for="src in pendingAnalysis.overlapSources" :key="src" class="conflict-item">
                            <span class="src-name">{{ src }}</span>
                            <div class="conflict-actions">
                                <label class="radio-label" :class="{selected: mergeChoices[src]==='skip'}">
                                    <input type="radio" :name="'merge_'+src" value="skip" v-model="mergeChoices[src]"> Skip
                                </label>
                                <label class="radio-label overwrite" :class="{selected: mergeChoices[src]==='overwrite'}">
                                    <input type="radio" :name="'merge_'+src" value="overwrite" v-model="mergeChoices[src]"> Overwrite Local
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button @click="cancelMerge" class="btn-secondary">Cancel</button>
                <button @click="confirmMerge" class="btn-primary">Confirm Import</button>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.settings-container { padding: 30px; max-width: 800px; margin: 0 auto; }
h1 { margin-bottom: 30px; }
.section { margin-bottom: 30px; text-align: left; }
.section h2 { margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; font-size: 1.2em; }
.desc { color: #666; font-size: 0.9em; margin-bottom: 20px; }

.setting-row { margin-bottom: 15px; }
.setting-row label { display: block; font-weight: 500; }
.setting-row select { margin-top: 5px; padding: 8px; width: 200px; }
.setting-row input[type="checkbox"] { margin-right: 10px; }

.add-row { display: flex; gap: 10px; margin-bottom: 20px; background: #f9f9f9; padding: 15px; border-radius: 4px; }
.add-row input { flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }

table { width: 100%; border-collapse: collapse; }
th, td { border-bottom: 1px solid #eee; padding: 10px; text-align: left; }
th { background: #f5f5f5; font-weight: 600; }
.code-font { font-family: monospace; color: #555; font-weight: bold; }
.empty { color: #999; font-style: italic; padding: 20px; text-align: center; background: #fafafa; border-radius: 4px; }

.btn-sm { padding: 4px 10px; font-size: 0.8em; }
.btn-danger { color: #d32f2f; border-color: #ef9a9a; background: #ffebee; }
.btn-danger:hover { background: #ffcdd2; }

/* Backup UI Styles */
.backup-actions { display: flex; gap: 10px; margin-top: 15px; align-items: center; }
.import-zone { display: inline-block; }
.text-input { width: 100%; max-width: 300px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 0.95rem; }
.msg { margin-top: 10px; padding: 10px; border-radius: 4px; font-size: 0.9em; }
.msg.success { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; }
.msg.error { background: #ffebee; color: #c62828; border: 1px solid #ffcdd2; }
.btn-secondary { background: white; color: #333; border: 1px solid #ccc; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
.btn-secondary:hover { background: #f5f5f5; }
.btn-primary { background: #007bff; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; }
.btn-primary:hover { background: #0056b3; }

/* Modal Styles */
.modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background: white; border-radius: 8px; width: 600px; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
.modal-header { padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { margin: 0; }
.close { font-size: 24px; cursor: pointer; color: #888; }
.close:hover { color: #000; }
.modal-body { padding: 20px; overflow-y: auto; flex: 1; }
.modal-footer { padding: 20px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 10px; background: #fafafa; }

.merge-section { margin-top: 20px; padding: 15px; border: 1px solid #eee; border-radius: 6px; background: #fafafa; }
.merge-section h4 { margin-top: 0; margin-bottom: 10px; color: #333; }
.new-sources-list { display: flex; flex-wrap: wrap; gap: 8px; }
.badge { background: #e3f2fd; color: #1976d2; padding: 4px 10px; border-radius: 20px; font-size: 0.85em; font-weight: 500; }

.conflict-list { display: flex; flex-direction: column; gap: 10px; }
.conflict-item { display: flex; justify-content: space-between; align-items: center; background: white; padding: 12px 15px; border-radius: 6px; border: 1px solid #e0e0e0; }
.src-name { font-weight: bold; color: #333; }
.conflict-actions { display: flex; gap: 10px; }
.radio-label { display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 6px 12px; border-radius: 4px; border: 1px solid #ddd; background: #f9f9f9; transition: all 0.2s; font-size: 0.9em; }
.radio-label:hover { background: #f0f0f0; }
.radio-label.selected { background: #e8f5e9; border-color: #81c784; color: #2e7d32; font-weight: 500; }
.radio-label.overwrite.selected { background: #ffebee; border-color: #e57373; color: #c62828; }
.radio-label input { margin: 0; }

.alignment-editor { margin-top: 15px; padding: 15px; background: #fafafa; border: 1px solid #ddd; border-radius: 6px; }
.align-grid { display: flex; gap: 40px; margin-bottom: 20px; }
.align-grid > div > label { display: block; font-weight: bold; margin-bottom: 8px; color: #333; }
.align-grid .radio-label { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-weight: normal; cursor: pointer; border: none; padding: 0; background: transparent; }
.jump-rules { margin-top:20px; padding:15px; background:white; border:1px solid #eee; border-radius:4px; }
.jump-rules table { margin-top:10px; }
.jump-rules input { padding:6px; border:1px solid #ccc; border-radius:4px; width:100%; box-sizing:border-box;}
.align-preview { padding: 12px; background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; border-radius: 4px; font-family: monospace; font-size: 1.1em; text-align: center; }
</style>
