<script setup>
import { ref, computed } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { useDataManagement } from '../composables/useDataManagement'; // Added
import SvgPattern from '../components/SvgPattern.vue';

const store = useSettingsStore();

// Data Management
const { exportData, importData } = useDataManagement();
const fileInput = ref(null);
const importMsg = ref("");
const importStatus = ref(""); // 'success' or 'error'

function doExport() {
    exportData();
}

async function doImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    importMsg.value = "Importing...";
    importStatus.value = "";
    
    try {
        const result = await importData(file);
        importMsg.value = `Success! Data imported (Label: ${result.label || 'None'}, Date: ${new Date(result.date).toLocaleString()}).`;
        importStatus.value = "success";
        
        // Clear file input
        event.target.value = null;
        
        // Clear msg after 5s
        setTimeout(() => importMsg.value = "", 5000);
    } catch (e) {
        importMsg.value = `Error: ${e.message}`;
        importStatus.value = "error";
    }
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
                <input type="file" ref="fileInput" @change="doImport" accept=".json" style="display:none">
                <button @click="$refs.fileInput.click()" class="btn-secondary">Import JSON</button>
            </div>
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
</style>
