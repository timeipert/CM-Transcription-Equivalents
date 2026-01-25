<script setup>
import { ref, computed, onMounted } from 'vue';
import { useSettingsStore } from '../stores/settings';
import PatternDisplay from '../components/PatternDisplay.vue';
import SvgPattern from '../components/SvgPattern.vue'; // Keep for group headers if needed, or refactorGroups?

const settings = useSettingsStore();

import { useTranscriptionData } from '../composables/useTranscriptionData';



// Use Composable
const { rawData, patStats, glyphs, manifests, overallMax, loading } = useTranscriptionData();

// State
const colSort = ref('freq'); // freq, alpha, length
const rowSort = ref('alpha'); // alpha, similarity
const displayMode = ref(settings.displayMode); // default from store
const hideEmpty = ref(false);
const showHeatmap = ref(false);
const currentPage = ref(1);
const rowsPerPage = 50;
const expandedGroups = ref(new Set());

// Modal State
const showModal = ref(false);
const modalTitle = ref('');
const modalContent = ref(null); // content array

// Helpers
function getBasicType(pattern) {
    let p = pattern.replace(/[\*\[\]]/g, "");
    p = p.replace(/[LQOS]/g, "");
    if (p === "") return "(Start)";
    return p;
}

const sources = computed(() => Object.keys(rawData.value).sort());
const allPatterns = computed(() => Object.keys(patStats.value));

const patternGroups = computed(() => {
    const groups = {};
    for (const p of allPatterns.value) {
        const basic = getBasicType(p);
        if (!groups[basic]) groups[basic] = [];
        groups[basic].push(p);
    }
    return groups;
});

const allBasicTypes = computed(() => Object.keys(patternGroups.value).sort());

const groupStats = computed(() => {
    const stats = {};
    for (const g of allBasicTypes.value) {
        let total = 0;
        // Use the pre-calculated stats from data.json if available?
        // Actually locally calculating is safer if we filter sources later.
        // But data.json aggregation is fast.
        
        // Re-calculate to support potential source filtering later
        for (const src of sources.value) {
            const row = rawData.value[src];
            if (!row) continue;
            for (const v of patternGroups.value[g]) {
                if (row[v]) total += row[v].length;
            }
        }
        stats[g] = total;
    }
    return stats;
});


const sortedGroups = computed(() => {
    const sorted = [...allBasicTypes.value];
    if (colSort.value === 'alpha') {
        sorted.sort();
    } else if (colSort.value === 'length') {
        sorted.sort((a, b) => {
            if (a.length !== b.length) return a.length - b.length;
            return a.localeCompare(b);
        });
    } else if (colSort.value === 'freq') {
        sorted.sort((a, b) => {
            if (a === "(Start)") return -1;
            if (b === "(Start)") return 1;
            return groupStats.value[b] - groupStats.value[a];
        });
    }
    return sorted;
});


const visibleCols = computed(() => {
    const cols = [];
    for (const g of sortedGroups.value) {
        // Hide Empty
        if (hideEmpty.value && groupStats.value[g] === 0) continue;

        const variants = patternGroups.value[g];
        const isSingle = (variants.length === 1);

        if (isSingle) {
            const v = variants[0];
            cols.push({ type: 'pattern', name: v, label: v, isSingle: true });
            continue;
        }

        const isExpanded = expandedGroups.value.has(g);
        cols.push({ type: 'group', name: g, label: g, expanded: isExpanded });

        if (isExpanded) {
            const sortedVars = [...variants].sort();
            for (const v of sortedVars) {
                 if (hideEmpty.value) {
                     // check if empty across all sources?
                     // patStats has global count
                     if (patStats.value[v].count === 0) continue; 
                 }
                cols.push({ type: 'pattern', name: v, label: v, parent: g });
            }
        }
    }
    return cols;
});


// Row Sorting (Clustering omitted for MVP speed, using alpha for now)
const sortedRows = computed(() => {
    const s = [...sources.value];
    // if (rowSort.value === 'similarity') ... (implement clustering if needed)
    return s.sort(); 
});


// Pagination
const totalPages = computed(() => Math.ceil(sortedRows.value.length / rowsPerPage));
const pageSources = computed(() => {
    const start = (currentPage.value - 1) * rowsPerPage;
    return sortedRows.value.slice(start, start + rowsPerPage);
});


// Methods
function toggleGroup(group) {
    if (expandedGroups.value.has(group)) {
        expandedGroups.value.delete(group);
    } else {
        expandedGroups.value.add(group);
    }
    // Trigger reactivity for Set? Vue 3 ref(Set) is reactive but mutations need .value replacement or standard methods work?
    // Vue 3 reactive Set: standard methods should trigger if created with reactive(). But ref() containing Set doesn't trigger on inside changes unless reassigned?
    // Better: Use new Set() reassignment
    expandedGroups.value = new Set(expandedGroups.value);
}

function expandAll() {
    expandedGroups.value = new Set(allBasicTypes.value);
}
function collapseAll() {
    expandedGroups.value = new Set();
}
function changePage(d) {
    let p = currentPage.value + d;
    if (p < 1) p = 1;
    if (p > totalPages.value) p = totalPages.value;
    currentPage.value = p;
}

function getCellValue(source, pattern) {
    if (rawData.value[source] && rawData.value[source][pattern]) {
        return rawData.value[source][pattern].length;
    }
    return 0;
}

function getGroupValue(source, groupName) {
    let sum = 0;
    if (!rawData.value[source]) return 0;
    const variants = patternGroups.value[groupName];
    for (const v of variants) {
        if (rawData.value[source][v]) sum += rawData.value[source][v].length;
    }
    return sum;
}

function getCellStyle(val) {
    if (!showHeatmap.value || val === 0) return {};
    
    // Log scale color
    const logVal = Math.log(val + 1);
    const logMax = Math.log(overallMax.value + 1);
    let ratio = logVal / logMax;
    if (ratio > 1) ratio = 1;

    const r = Math.round(220 + (35 * ratio));
    const g = Math.round(220 - (220 * ratio));
    const b = Math.round(220 - (220 * ratio));
    const textColor = (g < 100) ? "white" : "black";
    
    return {
        backgroundColor: `rgb(${r},${g},${b})`,
        color: textColor
    };
}

function onCellClick(source, pattern) {
    const data = rawData.value[source] && rawData.value[source][pattern];
    if (data && data.length > 0) {
        // [doc, fol, line, syl, notes]
        modalTitle.value = `Source: ${source} | Pattern: ${pattern} (${data.length})`;
        modalContent.value = { pattern, rows: data };
        showModal.value = true;
    }
}

</script>

<template>
<div class="app-container">
    <div class="controls">
        <div class="control-group">
            <label>Sort Groups: 
            <select v-model="colSort">
                <option value="freq">Frequency</option>
                <option value="alpha">Alphabetical</option>
                <option value="length">Length</option>
            </select>
            </label>
        </div>
        <!-- Row sort omitted for MVP simplicity or add empty impl -->
        
        <div class="control-group">
            <label>Display Mode:
            <select v-model="displayMode">
                <option value="svg">Graphic (SVG)</option>
                <option value="arrow">Arrows (↗/↘)</option>
                <option value="text">Letters (u/d/e)</option>
            </select>
            </label>
        </div>
        
        <div class="control-group">
             <label><input type="checkbox" v-model="hideEmpty"> Hide Empty</label>
        </div>
        <div class="control-group">
             <label><input type="checkbox" v-model="showHeatmap"> Heatmap</label>
        </div>
         <div class="control-group">
            <button @click="collapseAll">Collapse All</button>
            <button @click="expandAll">Expand All</button>
        </div>
    </div>
    
    <div v-if="loading">Loading...</div>
    
    <div v-else class="table-scroll">
        <table>
            <thead>
                <tr>
                    <th class="source-col">Source</th>
                    <th v-for="col in visibleCols" :key="col.name + col.type" 
                        :class="{'group-header': col.type==='group', 'pattern-col': col.type==='pattern', 'expanded': col.expanded}"
                        @click="col.type==='group' && toggleGroup(col.name)">
                        
                        <div class="header-content">
                            <!-- Unified Display -->
                            <div v-if="col.type==='pattern'">
                                 <PatternDisplay 
                                     :pattern="col.name" 
                                     :glyphs="glyphs" 
                                 />
                            </div>
                            <div v-else-if="col.type==='group' && displayMode==='svg'">
                                 <SvgPattern 
                                     :pattern="col.name" 
                                     :glyphs="glyphs" 
                                     :isGroup="true" 
                                 />
                            </div>
                            <div v-else>
                                {{ col.name }}
                            </div>

                            <!-- Arrow if Group -->
                            <span v-if="col.type==='group'" class="arrow" :class="{'arrow-down': !col.expanded}">▶</span>
                        </div>
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="src in pageSources" :key="src">
                    <td class="source-col">
                        {{ src }} 
                        <a v-if="manifests[src]" :href="manifests[src].url" target="_blank" title="Manifest">📜</a>
                    </td>
                    <td v-for="col in visibleCols" :key="src + col.name + col.type"
                        :class="col.type==='group' ? 'group-col' : 'pattern-col cell-clickable'"
                        :style="getCellStyle(col.type==='group' ? getGroupValue(src, col.name) : getCellValue(src, col.name))"
                        @click="col.type==='pattern' && onCellClick(src, col.name)">
                        
                        <template v-if="col.type==='group'">
                            {{ getGroupValue(src, col.name) || '-' }}
                        </template>
                        <template v-else>
                            {{ getCellValue(src, col.name) || '-' }}
                        </template>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
    
    <div class="pagination">
        <button @click="changePage(-1)" :disabled="currentPage===1">Prev</button>
        <span>Page {{ currentPage }} of {{ totalPages }}</span>
        <button @click="changePage(1)" :disabled="currentPage===totalPages">Next</button>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="modal" @click.self="showModal=false">
        <div class="modal-content">
            <div class="modal-header">
                <h2>{{ modalTitle }}</h2>
                <span class="close" @click="showModal=false">&times;</span>
            </div>
            <div class="modal-body">
                <div class="modal-text">
                     <div v-if="displayMode==='svg' && modalContent" class="modal-pattern-preview">
                         <SvgPattern :pattern="modalContent.pattern" :glyphs="glyphs" />
                     </div>
                     
                     <table v-if="modalContent">
                         <thead>
                             <tr>
                                 <th>Doc</th><th>Folio</th><th>Line</th><th>Syllable</th><th>Notes</th>
                             </tr>
                         </thead>
                         <tbody>
                             <tr v-for="(row, idx) in modalContent.rows" :key="idx">
                                 <td>{{ row[0] }}</td>
                                 <td>{{ row[1] }}</td>
                                 <td>{{ row[2] }}</td>
                                 <td>{{ row[3] }}</td>
                                 <td>{{ row[4] }}</td>
                             </tr>
                         </tbody>
                     </table>
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
/* CSS Port from HTML */
.controls {
    padding: 12px;
    background: #f9f9f9;
    border-bottom: 1px solid #ddd;
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    align-items: center;
}
.control-group {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 12px;
}
.app-container {
    height: 100%; /* Changed from 100vh */
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.table-scroll {
    flex: 1;
    overflow: auto;
    background: white;
    min-height: 0; /* Critical for flex scrolling */
}

table {
    border-collapse: separate; 
    border-spacing: 0;
    min-width: 100%;
}

th, td {
    padding: 6px 10px;
    text-align: center;
    border-bottom: 1px solid #eee;
    border-right: 1px solid #eee;
    white-space: nowrap;
}

th {
    background: #f1f1f1;
    position: sticky;
    top: 0;
    z-index: 10;
    font-weight: 600;
}
th.source-col {
    position: sticky;
    left: 0;
    z-index: 20;
    text-align: left;
    min-width: 150px;
}
td.source-col {
    position: sticky;
    left: 0;
    z-index: 5;
    background: #fff;
    text-align: left;
    font-weight: 600;
}
tr:nth-child(even) td.source-col { background: #fafafa; }
tr:nth-child(even) { background: #fafafa; }
tr:hover td { background: #f0f0f0 !important; }

/* Group Headers */
.group-header {
    cursor: pointer;
    background: #e8e8e8;
}
.group-header:hover {
    background: #ddd;
}
.header-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}
.arrow {
    font-size: 10px;
    transition: transform 0.2s;
    color: #666;
}
.arrow-down {
    transform: rotate(90deg);
}

.pagination {
    padding: 10px;
    border-top: 1px solid #ddd;
    display: flex;
    gap: 10px;
    justify-content: center;
    background: #f9f9f9;
    flex-shrink: 0; /* Prevent shrinking */
}

/* Modal */
.modal {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.5);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
}
.modal-content {
    background: #fff;
    width: 80vw;
    height: 80vh;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.modal-header {
    padding: 15px;
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
}
.modal-text {
    flex: 1;
    overflow: auto;
    padding: 20px;
}
.close {
    font-size: 24px;
    cursor: pointer;
}
.modal-pattern-preview {
    display: flex; justify-content: center; margin-bottom: 20px;
    border: 1px solid #eee; padding: 10px;
}
.cell-clickable {
    cursor: pointer;
}
.cell-clickable:hover {
    background-color: #f0f0f0;
}
</style>
