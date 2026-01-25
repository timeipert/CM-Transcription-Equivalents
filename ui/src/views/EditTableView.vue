<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useSettingsStore } from '../stores/settings';
import { useRoute, useRouter } from 'vue-router';
import PatternDisplay from '../components/PatternDisplay.vue';
import GalleryModal from '../components/gallery/GalleryModal.vue';

// Composables
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { usePdfExport } from '../composables/usePdfExport';

const store = usePersonalTablesStore();
const settings = useSettingsStore();
const route = useRoute();
const router = useRouter();

// Data
const { rawData, glyphs, loading: dataLoading } = useTranscriptionData();
const { generatePdf } = usePdfExport();

const tableId = route.params.id;
const table = ref(null);
const loading = ref(true); // Table loading state

// Selection State
const searchTerm = ref("");

// Setup Data & Table
watch(dataLoading, (val) => {
    if (!val) initTable();
}, { immediate: true });

function initTable() {
    const existing = store.getTable(tableId);
    if (!existing) {
        if (!dataLoading.value) { // Only redirect if data is ready but table not found
            alert("Table not found");
            router.push('/my-tables');
        }
        return;
    }
    // Deep copy
    table.value = JSON.parse(JSON.stringify(existing));
    loading.value = false;
}


// Computed Data
const sources = computed(() => Object.keys(rawData.value || {}).sort());

const availablePatterns = computed(() => {
    if (!table.value || !table.value.source) return [];
    if (!rawData.value) return [];
    
    // Get all patterns for this source
    const srcData = rawData.value[table.value.source];
    if (!srcData) return [];
    
    let pats = Object.keys(srcData);
    
    // Filter
    if (searchTerm.value) {
        const lower = searchTerm.value.toLowerCase();
        pats = pats.filter(p => p.toLowerCase().includes(lower));
    }
    pats.sort();
    return pats.slice(0, 100);
});

// Selection Logic
function togglePattern(pat) {
    const idx = table.value.rows.findIndex(r => r.pattern === pat);
    if (idx === -1) {
        let defaultId = '';
        if (settings.autoFillIds) {
            defaultId = settings.getGlobalId(pat);
        }
        table.value.rows.push({
            pattern: pat,
            customId: defaultId, 
            notes: ''
        });
    } else {
        table.value.rows.splice(idx, 1);
    }
}

function isSelected(pat) {
    return table.value.rows.some(r => r.pattern === pat);
}

// Saving & PDF
const saveStatus = ref("Save");

function saveTable() {
    store.updateTable(tableId, table.value);
    saveStatus.value = "Saved!";
    setTimeout(() => saveStatus.value = "Save", 2000);
}

const isProducingPdf = ref(false);
async function doPdf() {
    isProducingPdf.value = true;
    try {
        await generatePdf(table.value, rawData.value, glyphs.value);
    } catch(e) {
        alert("PDF Error");
    } finally {
        isProducingPdf.value = false;
    }
}

const promoteStatus = ref({}); 
function promoteToGlobal(pattern, id) {
    if (!id) return;
    const current = settings.getGlobalId(pattern);
    if (current && current !== id) {
        if (!confirm(`Overwrite global ID?`)) return;
    }
    settings.setGlobalId(pattern, id);
    promoteStatus.value[pattern] = true;
    setTimeout(() => promoteStatus.value[pattern] = false, 1500);
}


// Gallery Logic
const showGallery = ref(false);
const galleryPattern = ref("");

function openGallery(row) {
    galleryPattern.value = row.pattern;
    showGallery.value = true;
}

</script>

<template>
<div v-if="loading || dataLoading">Loading...</div>
<div v-else class="editor-container">
    <!-- Header -->
    <div class="editor-header">
        <input v-model="table.name" class="title-input" />
        <div class="actions">
            <button @click="saveTable" class="btn-primary">{{ saveStatus }}</button>
            <button @click="doPdf" class="btn-secondary" :disabled="isProducingPdf">
                {{ isProducingPdf ? 'Exporting...' : 'Export PDF' }}
            </button>
            <button @click="router.push('/my-tables')">Close</button>
        </div>
    </div>

    <div class="editor-body">
        <!-- Left Panel: Configuration -->
        <div class="config-panel">
            <div class="field-group">
                <label>Manuscript Source</label>
                <select v-model="table.source">
                    <option value="" disabled>Select Source</option>
                    <option v-for="s in sources" :key="s" :value="s">{{ s }}</option>
                </select>
            </div>
            
            <div class="field-group" v-if="table.source">
                 <label>Add Patterns</label>
                 <input v-model="searchTerm" placeholder="Search patterns..." class="search-input" />
                 
                 <div class="pattern-list">
                     <div v-for="pat in availablePatterns" :key="pat" 
                          class="pattern-item" 
                          :class="{selected: isSelected(pat)}"
                          @click="togglePattern(pat)">
                         <span class="check">{{ isSelected(pat) ? '☑' : '☐' }}</span>
                         <span class="pat-name">{{ pat }}</span>
                         <span class="pat-visual">
                            <PatternDisplay :pattern="pat" :glyphs="glyphs" />
                         </span>
                     </div>
                 </div>
            </div>
        </div>

        <!-- Right Panel: Table Preview -->
        <div class="preview-panel">
            <h3>Table Rows</h3>
            <div v-if="table.rows.length === 0" class="empty-msg">
                No patterns selected. Select source and patterns from the left.
            </div>
            <table v-else class="edit-table">
                <thead>
                    <tr>
                        <th style="width: 140px;">ID</th>
                        <th>Pattern</th>
                        <th>Frequency</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(row, idx) in table.rows" :key="idx">
                        <td>
                            <div class="id-cell">
                                <input v-model="row.customId" placeholder="ID..." />
                                <button class="btn-icon" 
                                        :class="{promoted: promoteStatus[row.pattern]}"
                                        title="Set as Global ID" 
                                        @click="promoteToGlobal(row.pattern, row.customId)">★</button>
                            </div>
                        </td>
                        <td>
                             <PatternDisplay :pattern="row.pattern" :glyphs="glyphs" />
                        </td>
                        <td>
                            <div style="display:flex; gap:10px; align-items:center; justify-content:center;">
                                <span v-if="table.source && rawData[table.source]">
                                    {{ rawData[table.source][row.pattern]?.length || 0 }}
                                </span>
                                <button class="btn-sm" @click="openGallery(row)">Gallery</button>
                            </div>
                        </td>
                        <td>
                            <button @click="togglePattern(row.pattern)" class="btn-sm">Remove</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
    
    <GalleryModal 
        v-if="showGallery"
        :visible="true"
        :pattern="galleryPattern"
        :sourceData="rawData[table.source]"
        :sourceName="table.source"

        @close="showGallery=false"
    />
</div>
</template>

<style scoped>
.editor-container { height: 100vh; display: flex; flex-direction: column; background: #f8fafc; }
.editor-header {
    background: white; border-bottom: 1px solid #e2e8f0; padding: 12px 24px;
    display: flex; justify-content: space-between; align-items: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    z-index: 10;
}
.title-input { 
    font-size: 1.25rem; font-weight: 700; border: 1px solid transparent; 
    padding: 4px 8px; color: #1e293b; border-radius: 4px; transition: border-color 0.2s;
}
.title-input:hover, .title-input:focus { border-color: #e2e8f0; background: #f1f5f9; outline: none; }
.actions { display: flex; gap: 12px; }

.editor-body { flex: 1; display: flex; min-height: 0; }

.config-panel { 
    width: 320px; background: #fdfdfd; border-right: 1px solid #e2e8f0; 
    display: flex; flex-direction: column; overflow: hidden;
}
.field-group { padding: 20px; border-bottom: 1px solid #f1f5f9; }
.field-group label { display: block; font-weight: 600; margin-bottom: 8px; font-size: 0.8rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.025em; }

select, .search-input { 
    width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; 
    font-size: 0.95rem; background: #fff; transition: border-color 0.2s;
}
select:focus, .search-input:focus { border-color: #3b82f6; outline: none; }

.pattern-list { flex: 1; overflow-y: auto; background: white; margin-top: 10px; border-top: 1px solid #f1f5f9; }
.pattern-item {
    padding: 10px 16px; border-bottom: 1px solid #f8fafc; cursor: pointer;
    display: flex; gap: 12px; align-items: center; font-size: 0.9rem;
    transition: background 0.2s;
}
.pattern-item:hover { background: #f1f5f0; }
.pattern-item.selected { background: #eff6ff; border-left: 3px solid #3b82f6; }
.check { font-size: 1.1rem; color: #94a3b8; }
.selected .check { color: #3b82f6; }

.preview-panel { flex: 1; padding: 32px; overflow-y: auto; }
.preview-panel h3 { margin-top: 0; color: #1e293b; font-weight: 700; }

.edit-table { width: 100%; border-collapse: separate; border-spacing: 0 8px; margin-top: 20px; }
.edit-table th { 
    padding: 12px 16px; font-weight: 600; text-align: left; 
    color: #64748b; font-size: 0.85rem; border-bottom: 1px solid #e2e8f0; 
}
.edit-table td { 
    padding: 12px 16px; background: white; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;
}
.edit-table td:first-child { border-left: 1px solid #f1f5f9; border-top-left-radius: 10px; border-bottom-left-radius: 10px; }
.edit-table td:last-child { border-right: 1px solid #f1f5f9; border-top-right-radius: 10px; border-bottom-right-radius: 10px; }

.id-cell { display: flex; gap: 8px; align-items: center; }
.id-cell input { 
    flex: 1; min-width: 0; border: 1px solid #e2e8f0; padding: 6px 10px; 
    border-radius: 6px; font-family: monospace; font-size: 0.9rem;
}
.btn-icon { 
    width: 28px; height: 28px; cursor: pointer; background: white; 
    border: 1px solid #e2e8f0; border-radius: 6px; color: #94a3b8; 
    transition: all 0.2s; display: flex; align-items: center; justify-content: center;
}
.btn-icon:hover { border-color: #f59e0b; color: #f59e0b; }
.btn-icon.promoted { background: #f59e0b; color: white; border-color: #f59e0b; }

.btn-primary { 
    background: #3b82f6; color: white; border: none; padding: 10px 20px; 
    border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s;
}
.btn-primary:hover { background: #2563eb; transform: translateY(-1px); }

.btn-secondary { 
    background: white; color: #475569; border: 1px solid #e2e8f0; 
    padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; 
    transition: all 0.2s; 
}
.btn-secondary:hover { background: #f8fafc; border-color: #3b82f6; color: #3b82f6; }

.btn-default {
    background: transparent; color: #64748b; border: none; padding: 10px 20px;
    cursor: pointer; font-weight: 600;
}
.btn-default:hover { color: #ef4444; }

.btn-sm { 
    padding: 6px 12px; font-size: 0.8rem; background: #f1f5f9; 
    border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; color: #475569;
}
.btn-sm:hover { border-color: #3b82f6; color: #3b82f6; }

.empty-msg { padding: 60px; text-align: center; color: #94a3b8; font-style: italic; }
</style>
```
