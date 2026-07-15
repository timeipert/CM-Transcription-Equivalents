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
import { comparePatternIds } from '../utils/sorting';


const store = usePersonalTablesStore();
const settings = useSettingsStore();
const route = useRoute();
const router = useRouter();

// Data
const { rawData, glyphs, loading: dataLoading, patStats, sourceFolios, loadSource } = useTranscriptionData();
const { generatePdf } = usePdfExport();

const tableId = route.params.id;
const table = ref(null);
const loading = ref(true); // Table loading state

// Selection State
const searchTerm = ref("");
const patternSort = ref('freq'); // freq, alpha, length

// Setup Data & Table
watch(dataLoading, async (val) => {
    if (!val) {
        initTable();
        if (table.value && table.value.source) {
            await loadSource(table.value.source);
        }
    }
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
    const data = JSON.parse(JSON.stringify(existing));
    // Sort rows initially
    data.rows.sort((a, b) => comparePatternIds(a.customId, b.customId));
    table.value = data;
    loading.value = false;
}


// Computed Data
const sources = computed(() => Object.keys(sourceFolios.value || {}).sort());

// Global base stats for sorting
const baseStats = computed(() => {
    const stats = {};
    if (!patStats.value) return stats;
    for (const [pat, data] of Object.entries(patStats.value)) {
        const base = pat.split(' ')[0];
        stats[base] = (stats[base] || 0) + data.count;
    }
    return stats;
});

const availablePatterns = computed(() => {
    if (!table.value || !table.value.source) return [];
    if (!rawData.value) return [];
    
    // Get all patterns for this source
    const srcData = rawData.value[table.value.source];
    if (!srcData) return [];
    
    // Group by base pattern
    const baseSet = new Set();
    for (const pat of Object.keys(srcData)) {
        baseSet.add(pat.split(' ')[0]);
    }
    
    let pats = Array.from(baseSet);
    
    // Search Filtering
    if (searchTerm.value) {
        const lower = searchTerm.value.toLowerCase();
        pats = pats.filter(p => p.toLowerCase().includes(lower));
    }
    
    // Sorting
    if (patternSort.value === 'alpha') {
        pats.sort();
    } else if (patternSort.value === 'length') {
        pats.sort((a, b) => {
            if (a.length !== b.length) return a.length - b.length;
            return a.localeCompare(b);
        });
    } else if (patternSort.value === 'freq') {
        pats.sort((a, b) => {
            if (a === "(Start)") return -1;
            if (b === "(Start)") return 1;
            const countA = baseStats.value[a] || 0;
            const countB = baseStats.value[b] || 0;
            if (countA !== countB) return countB - countA;
            return a.localeCompare(b);
        });
    }
    
    return pats;
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
        sortTable();
    } else {
        table.value.rows.splice(idx, 1);
    }
}

function isSelected(pat) {
    return table.value.rows.some(r => r.pattern === pat);
}

// Auto-save logic
watch(table, (newVal) => {
    if (newVal && !loading.value) {
        store.updateTable(tableId, JSON.parse(JSON.stringify(newVal)));
    }
}, { deep: true });

function sortTable() {
    if (!table.value) return;
    table.value.rows.sort((a, b) => comparePatternIds(a.customId, b.customId));
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

function onGallerySelect(p) {
    showGallery.value = false;
    const q = { 
        source: p.d, 
        folio: p.f, 
        highlight: p.pat,
        return_to: 'annotations',
        return_id: tableId
    };
    if (p.regionId) q.region = p.regionId;
    
    router.push({ 
        name: 'polygons', 
        query: q
    });
}

onMounted(() => {
    if (route.query.gallery) {
        // Wait for data and table to load before opening
        const stop = watch([loading, dataLoading], ([l, dl]) => {
            if (!l && !dl) {
                galleryPattern.value = route.query.gallery;
                showGallery.value = true;
                stop();
                
                // Optional: Clear the query param so it doesn't reopen on refresh?
                // router.replace({ query: { ...route.query, gallery: undefined } });
            }
        });
    }
});

</script>

<template>
<div v-if="loading || dataLoading">Loading...</div>
<div v-else class="editor-container">
    <!-- Header -->
    <div class="editor-header">
        <h2 class="table-title">{{ table.name }}</h2>
        <div class="actions">
            <label class="publish-toggle" title="Make this manuscript visible in the Public Notation Overview">
                <input type="checkbox" v-model="table.isPublished" /> Published
            </label>
            <span class="auto-save-hint">Changes saved automatically</span>
            <button @click="doPdf" class="btn-secondary" :disabled="isProducingPdf">
                {{ isProducingPdf ? 'Exporting...' : 'Export PDF' }}
            </button>
            <button @click="router.push('/equivalents')">Close</button>
        </div>
    </div>

    <div class="editor-body">
        <!-- Left Panel: Pattern Library -->
        <div class="config-panel">
            <div class="panel-header">
                <h3>Pattern Library</h3>
                <p class="panel-desc">Select patterns to add them to your table.</p>
            </div>
            
            <div class="field-group" v-if="table.source">
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="margin-bottom: 0;">Add Patterns</label>
                    <select v-model="patternSort" style="padding: 2px; font-size: 11px; border-radius: 4px;">
                        <option value="freq">Frequency</option>
                        <option value="alpha">Alphabetical</option>
                        <option value="length">Length</option>
                    </select>
                 </div>
                 <input v-model="searchTerm" placeholder="Search patterns..." class="search-input" />
                 
                 <div class="pattern-list">
                     <div v-for="pat in availablePatterns" :key="pat" 
                          class="pattern-item" 
                          :class="{selected: isSelected(pat)}"
                          @click="togglePattern(pat)">
                         <span class="pat-name">{{ pat }}</span>
                         <span class="pat-visual">
                            <PatternDisplay :pattern="pat" :glyphs="glyphs" />
                         </span>
                     </div>
                 </div>
            </div>
        </div>

        <!-- Right Panel: Main Content -->
        <div class="preview-panel">
            <div class="content-max-width">
                <!-- Patterns Table Section -->
                <div class="card table-card">
                    <div class="card-header">
                        <h3>Selected Patterns</h3>
                        <p class="card-desc">Manage the patterns included in this manuscript's table and set their global IDs.</p>
                    </div>
                    <div class="card-body">
                        <div v-if="table.rows.length === 0" class="empty-msg">
                            <div class="empty-icon">👈</div>
                            <h4>No patterns selected</h4>
                            <p>Select patterns from the library on the left to add them to your table.</p>
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
                    <tr v-for="row in table.rows" :key="row.pattern">
                        <td>
                            <div class="id-cell">
                                <input v-model="row.customId" placeholder="ID..." @blur="sortTable" />
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
                                    {{ 
                                        Object.keys(rawData[table.source])
                                            .filter(k => k === row.pattern || k.startsWith(row.pattern + ' '))
                                            .reduce((sum, k) => sum + rawData[table.source][k].length, 0)
                                    }}
                                </span>
                                <button class="btn-sm" @click="openGallery(row)">Gallery</button>
                            </div>
                        </td>
                        <td>
                            <button @click="togglePattern(row.pattern)" class="btn-default">Remove</button>
                        </td>
                    </tr>
                </tbody>
            </table>
                    </div>
                </div>

                <!-- Notes Section -->
                <div class="card notes-card">
                    <div class="card-header">
                        <h3>Public Notes (Anmerkungen)</h3>
                        <p class="card-desc">These notes will be displayed publicly on the manuscript's notation overview page.</p>
                    </div>
                    <div class="card-body">
                        <textarea v-model="table.notes" class="notes-textarea large" placeholder="Write any remarks, observations, or metadata about this manuscript here..."></textarea>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <GalleryModal 
        v-if="showGallery"
        :visible="true"
        :pattern="galleryPattern"
        :sourceData="rawData[table.source]"
        :sourceName="table.source"
        @select="onGallerySelect"
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
.actions { display: flex; gap: 12px; align-items: center; }

.publish-toggle {
    display: flex; align-items: center; gap: 6px; font-weight: 600; color: #475569;
    padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc;
    cursor: pointer; transition: all 0.2s;
}
.publish-toggle:hover { background: #f1f5f9; border-color: #94a3b8; }
.publish-toggle input { margin: 0; cursor: pointer; }

.editor-body { flex: 1; display: flex; min-height: 0; }

.config-panel { 
    width: 350px; background: #ffffff; border-right: 1px solid #e2e8f0; 
    display: flex; flex-direction: column; overflow: scroll;
    box-shadow: 2px 0 10px rgba(0,0,0,0.02); z-index: 5;
}
.panel-header {
    padding: 24px 20px 10px 20px;
}
.panel-header h3 { margin: 0; font-size: 1.1rem; color: #1e293b; }
.panel-desc { margin: 4px 0 0 0; font-size: 0.85rem; color: #64748b; }

.field-group { padding: 10px 20px 20px 20px; }
.field-group label { display: block; font-weight: 700; margin-bottom: 8px; font-size: 0.75rem; text-transform: uppercase; color: #475569; letter-spacing: 0.05em; }

.search-input { 
    width: 100%; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; 
    font-size: 0.95rem; background: #f8fafc; transition: all 0.2s;
}
.search-input:focus { border-color: #3b82f6; outline: none; background: #fff; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }

.notes-textarea.large {
    min-height: 240px;
    padding: 16px;
    font-size: 1rem;
    line-height: 1.5;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    border-radius: 8px;
    width: 100%;
    resize: vertical;
    font-family: inherit;
    transition: all 0.2s;
}
.notes-textarea.large:focus { background: #fff; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }

.pattern-list { flex: 1; overflow-y: auto; background: white; margin-top: 15px; border: 1px solid #e2e8f0; border-radius: 8px; }
.pattern-item {
    padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer;
    display: flex; gap: 12px; align-items: center; font-size: 0.9rem;
    transition: all 0.2s;
}
.pattern-item:last-child { border-bottom: none; }
.pattern-item:hover { background: #f8fafc; }
.pattern-item.selected { background: #eff6ff; }
.pat-name { font-family: monospace; font-weight: 600; color: #475569; width: 60px; }

.preview-panel { flex: 1; padding: 40px; overflow-y: auto; background: #f1f5f9; }
.content-max-width { max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 30px; }

.card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    border: 1px solid #e2e8f0;
    overflow: hidden;
}

.card-header { padding: 24px 24px 16px 24px; border-bottom: 1px solid #f1f5f9; }
.card-header h3 { margin: 0; color: #0f172a; font-size: 1.25rem; font-weight: 700; }
.card-desc { margin: 6px 0 0 0; color: #64748b; font-size: 0.95rem; }
.card-body { padding: 24px; }

.edit-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 0; }
.edit-table th { 
    padding: 12px 16px; font-weight: 700; text-align: left; text-transform: uppercase;
    color: #64748b; font-size: 0.75rem; border-bottom: 2px solid #e2e8f0; letter-spacing: 0.05em;
}
.edit-table td { 
    padding: 16px; background: white; border-bottom: 1px solid #f1f5f9;
}

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
    background: white; color: #475569; border: 1px solid #cbd5e1; 
    padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; 
    transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.btn-secondary:hover { background: #f8fafc; border-color: #94a3b8; color: #0f172a; }

.btn-default {
    background: white; color: #ef4444; border: 1px solid #fee2e2; padding: 8px 16px;
    border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;
}
.btn-default:hover { background: #fef2f2; border-color: #fca5a5; }

.btn-sm { 
    padding: 6px 12px; font-size: 0.8rem; background: #fff; font-weight: 600;
    border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; color: #475569;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all 0.2s;
}
.btn-sm:hover { border-color: #3b82f6; color: #3b82f6; background: #f0f7ff; }

.auto-save-hint { font-size: 0.8rem; color: #94a3b8; font-weight: 500; }

.empty-msg { padding: 60px 20px; text-align: center; color: #64748b; }
.empty-icon { font-size: 3rem; margin-bottom: 16px; opacity: 0.5; }
.empty-msg h4 { margin: 0 0 8px 0; color: #334155; font-size: 1.1rem; }
.empty-msg p { margin: 0; font-size: 0.95rem; }
</style>
```
