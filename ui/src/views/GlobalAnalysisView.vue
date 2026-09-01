<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { stripSignKeys } from '../utils/signs';
import PatternDisplay from '../components/PatternDisplay.vue';
import SvgPattern from '../components/SvgPattern.vue'; // Keep for group headers if needed, or refactorGroups?

const settings = useSettingsStore();

import { useTranscriptionData } from '../composables/useTranscriptionData';
import { useAnnotationsStore } from '../stores/annotations';
import { useImageManifest } from '../composables/useImageManifest';
import AnnotationCutout from '../components/AnnotationCutout.vue';
import { useRouter } from 'vue-router';
import { compareFolios } from '../utils/sorting';

import StateWrapper from '../components/StateWrapper.vue';

// Use Composable
const { rawData, patStats, glyphs, manifests, overallMax, loading, error, sourceFolios, loadSource } = useTranscriptionData();
const annotStore = useAnnotationsStore();
const { getStandardSource } = useImageManifest();
const router = useRouter();

const isDataEmpty = computed(() => {
    return !loading.value && (!patStats.value || Object.keys(patStats.value).length === 0);
});

// ... existing code ...

// In template replace v-model="snippetSize" with v-model="settings.snippetSize"
// And snippetSize usage with settings.snippetSize

// ...
// In Template:
/*
<div class="header-controls">
    <label class="size-slider">
        Size: <input type="range" min="40" max="200" v-model="snippetSize" />
    </label>
    <label class="size-slider">
        Context: <input type="range" min="0.1" max="1.0" step="0.1" v-model="snippetPadding" />
    </label>
    <span class="close" @click="showModal=false">&times;</span>
</div>
*/

// In Table:
/*
 <AnnotationCutout 
     :source="getStandardSource(modalContent.source, row[1])"
     :folio="row[1]"
     :points="getLinkedAnnot(row).points"
     :width="snippetSize"
     :height="snippetSize * 0.6"
     :padding="Number(snippetPadding)"
 />
*/

function getLinkedAnnot(row) {
    if (!modalContent.value) return null;
    const { source, pattern } = modalContent.value;
    const folio = row[1];
    
    // Normalize source for store lookup
    // "source" here is the raw key from rawData (e.g. "Aa 13")
    // annotStore uses standard key (e.g. "Aa 13 (Scan)") if remapped.
    const stdSource = getStandardSource(source, folio);
    
    const anns = annotStore.getAnnotations(stdSource, folio, pattern);
    const sysId = row.join('|');
    return anns.find(a => a.linkData && a.linkData.sysId === sysId);
}

// ... existing code ...
// in Template:

// 1. Add size control to header
/*
<div class="modal-header">
    <h2>{{ modalTitle }}</h2>
    <div class="header-controls">
         <label class="size-slider">
             Size: <input type="range" min="30" max="150" v-model="snippetSize" />
         </label>
        <span class="close" @click="showModal=false">&times;</span>
    </div>
</div>
*/

// 2. Add Cutout to table
/*
 <td>
     <div v-if="getLinkedAnnot(row)" class="snippet-cell">
         <AnnotationCutout 
             :source="getStandardSource(modalContent.source, row[1])"
             :folio="row[1]"
             :points="getLinkedAnnot(row).points"
             :width="snippetSize"
             :height="snippetSize * 0.6"
         />
         <button class="btn-xs-link link-overlay" @click="goToPolygon(row[1])">✏️</button>
     </div>
 </td>
*/

// 3. Add styles

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
// Modal State
const showModal = ref(false);
const modalTitle = ref('');
const modalContent = ref(null); // content array
const modalSortCol = ref('folio');
const modalSortDir = ref(1); // 1 = asc, -1 = desc

// Helpers
function getBasicType(pattern) {
    let p = pattern.replace(/[\*\[\]]/g, "");
    p = p.replace(/[LQOSAD]/g, "");
    // Strip project custom-sign keys so code variants collapse under their base.
    for (const s of settings.customSigns) {
        if (s.key) p = p.split(s.key).join("");
    }
    if (p === "") return "(Start)";
    return p;
}

const sources = computed(() => Object.keys(sourceFolios.value || {}).sort());

const signKeys = computed(() => settings.customSigns.map(s => s.key).filter(Boolean));

/**
 * When "Separate code variants" is off, a variant code (e.g. *uuVdd) is folded
 * back onto its base code (*uudd) so the two share a single column ("all in one").
 */
function normalizePattern(p) {
    if (settings.discriminateSigns) return p;
    return stripSignKeys(p, signKeys.value) || p;
}

/** Displayed pattern -> the raw pattern keys whose counts it aggregates. */
const patternVariants = computed(() => {
    const map = {};
    for (const p of Object.keys(patStats.value)) {
        const key = normalizePattern(p);
        if (!map[key]) map[key] = [];
        map[key].push(p);
    }
    return map;
});

const allPatterns = computed(() => Object.keys(patternVariants.value));

/** Total occurrences for a displayed pattern, summed over the codes it merges. */
function patternCount(pattern) {
    let total = 0;
    for (const raw of patternVariants.value[pattern] || [pattern]) {
        if (patStats.value[raw]) total += patStats.value[raw].count;
    }
    return total;
}

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
        for (const v of patternGroups.value[g]) {
            total += patternCount(v);
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
            const sortedVars = [...variants].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            for (const v of sortedVars) {
                 if (hideEmpty.value) {
                     // Global count across all sources (summed over merged variants).
                     if (patternCount(v) === 0) continue;
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


watch(pageSources, async (newSources) => {
    if (!newSources) return;
    for (const src of newSources) {
        if (!rawData.value[src]) {
            await loadSource(src);
        }
    }
}, { immediate: true, deep: true });


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
    const srcData = rawData.value[source];
    if (!srcData) return 0;
    let sum = 0;
    for (const raw of patternVariants.value[pattern] || [pattern]) {
        if (srcData[raw]) sum += srcData[raw].length;
    }
    return sum;
}

function getGroupValue(source, groupName) {
    if (!rawData.value[source]) return 0;
    let sum = 0;
    for (const v of patternGroups.value[groupName]) {
        sum += getCellValue(source, v);
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
    router.push({ query: { ...route.query, openSource: source, openPattern: pattern } });
}

function closeModal() {
    router.push({ query: { ...route.query, openSource: undefined, openPattern: undefined } });
}

const showOnlyLinked = ref(false);

function isLinked(row) {
    if (!modalContent.value) return false;
    const { source, pattern } = modalContent.value;
    const folio = row[1];
    
    const stdSource = getStandardSource(source, folio);
    const anns = annotStore.getAnnotations(stdSource, folio, pattern);
    const sysId = row.join('|');
    return anns.some(a => a.linkData && a.linkData.sysId === sysId);
}

function goToPolygon(folio) {
    if (!modalContent.value) return;
    const { source } = modalContent.value;
    router.push({
        path: '/polygons',
        query: { source, folio }
    });
}

// Modal Sorting
const sortedModalRows = computed(() => {
    if (!modalContent.value) return [];
    
    // Rows: [doc, fol, line, syl, notes]
    let rows = [...modalContent.value.rows];
    
    if (showOnlyLinked.value) {
        rows = rows.filter(r => isLinked(r));
    }
    
    const colIdxMap = { 'doc': 0, 'folio': 1, 'line': 2, 'syl': 3, 'notes': 4 };
    const idx = colIdxMap[modalSortCol.value] ?? 1;
    
    rows.sort((a, b) => {
        const va = a[idx];
        const vb = b[idx];
        
        // Custom Folio Sort
        if (modalSortCol.value === 'folio') {
            return compareFolios(va, vb) * modalSortDir.value;
        }
        
        // Default Sort
        if (va < vb) return -1 * modalSortDir.value;
        if (va > vb) return 1 * modalSortDir.value;
        return 0;
    });
    
    return rows;
});

function sortModal(col) {
    if (modalSortCol.value === col) {
        modalSortDir.value *= -1;
    } else {
        modalSortCol.value = col;
        modalSortDir.value = 1; // reset to asc
    }
}

// Deep Linking
import { useRoute } from 'vue-router';
const route = useRoute();

watch([() => route.query.openSource, () => route.query.openPattern, loading], ([openSource, openPattern, isLoading]) => {
    if (openSource && openPattern) {
        if (!isLoading) {
            const data = rawData.value[openSource] && rawData.value[openSource][openPattern];
            if (data && data.length > 0) {
                modalTitle.value = `Source: ${openSource} | Pattern: ${openPattern} (${data.length})`;
                modalContent.value = { source: openSource, pattern: openPattern, rows: data };
                showModal.value = true;
            } else {
                showModal.value = false;
                modalContent.value = null;
            }
        }
    } else {
        showModal.value = false;
        modalContent.value = null;
    }
}, { immediate: true });

function isHighlighted(row) {
    if (!route.query.highlightId) return false;
    const sysId = row.join('|');
    return sysId === route.query.highlightId;
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
        <div class="control-group signs-control" v-if="settings.customSigns.length > 0"
             :title="settings.discriminateSigns
                ? 'Each code variant (e.g. *uuVdd) counts as its own column'
                : 'Code variants are merged into their base pattern (e.g. *uuVdd counts as *uudd)'">
             <label>
                <input type="checkbox" v-model="settings.discriminateSigns">
                Separate code variants
             </label>
             <span class="signs-hint">{{ settings.discriminateSigns ? 'separate' : 'all in one' }}</span>
        </div>
         <div class="control-group">
            <button @click="collapseAll">Collapse All</button>
            <button @click="expandAll">Expand All</button>
        </div>
    </div>
    
    <StateWrapper 
        :loading="loading" 
        :error="error" 
        :empty="isDataEmpty" 
        loadingText="Loading Global Data..." 
        emptyText="No pattern statistics found in the dataset."
    >
    <div class="table-scroll">
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
    
    <div class="pagination" v-if="totalPages > 1">
        <button @click="changePage(-1)" :disabled="currentPage===1">Prev</button>
        <span>Page {{ currentPage }} of {{ totalPages }}</span>
        <button @click="changePage(1)" :disabled="currentPage===totalPages">Next</button>
    </div>
    </StateWrapper>

    <!-- Modal -->
    <div v-if="showModal" class="modal" @click.self="closeModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>{{ modalTitle }}</h2>
                <div class="header-controls">
                    <label class="size-slider">
                        <input type="checkbox" v-model="showOnlyLinked" /> Show Only Linked
                    </label>
                    <label class="size-slider">
                        Size: <input type="range" min="40" max="250" v-model="settings.snippetSize" />
                    </label>
                    <label class="size-slider">
                        Context: <input type="range" min="0.1" max="1.0" step="0.1" v-model="settings.snippetPadding" />
                    </label>
                    <span class="close" @click="closeModal">&times;</span>
                </div>
            </div>
            <div class="modal-body">
                <div class="modal-text">
                     <div v-if="displayMode==='svg' && modalContent" class="modal-pattern-preview">
                         <SvgPattern :pattern="modalContent.pattern" :glyphs="glyphs" />
                     </div>
                     
                     <table v-if="modalContent">
                         <thead>
                             <tr>
                                 <th @click="sortModal('doc')">Doc ↕</th>
                                 <th @click="sortModal('folio')">Folio ↕</th>
                                 <th @click="sortModal('line')">Line ↕</th>
                                 <th @click="sortModal('syl')">Syllable ↕</th>
                                 <th @click="sortModal('notes')">Notes ↕</th>
                                 <th :style="{width: settings.snippetSize + 'px'}">Img</th>
                             </tr>
                         </thead>
                         <tbody>
                             <tr v-for="(row, idx) in sortedModalRows" :key="idx" :class="{'highlighted-row': isHighlighted(row)}">
                                 <td>{{ row[0] }}</td>
                                 <td>{{ row[1] }}</td>
                                 <td>{{ row[2] }}</td>
                                 <td>{{ row[3] }}</td>
                                 <td>{{ row[4] }}</td>
                                 <td class="img-cell">
                                     <div v-if="getLinkedAnnot(row)" class="snippet-cell" :style="{width: settings.snippetSize + 'px', height: (settings.snippetSize*0.6) + 'px'}">
                                         <AnnotationCutout 
                                             :source="getStandardSource(modalContent.source, row[1])"
                                             :folio="row[1]"
                                             :points="getLinkedAnnot(row).points"
                                             :width="settings.snippetSize"
                                             :height="settings.snippetSize * 0.6"
                                             :padding="Number(settings.snippetPadding)"
                                             :hideLabel="true"
                                         />
                                         <div class="link-overlay" @click="goToPolygon(row[1])">✏️</div>
                                     </div>
                                 </td>
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
/* Add highlight style */
.highlighted-row {
    background-color: #fef08a !important; /* Soft yellow */
    animation: flash 2s;
}
@keyframes flash {
    0% { background-color: var(--color-warning-muted); }
    100% { background-color: #fef08a; }
}

.header-controls { display: flex; align-items: center; gap: 20px; }
.size-slider { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--color-text-muted); }
.snippet-cell { position: relative; border: 1px solid var(--color-border); border-radius: 4px; overflow: hidden; background: var(--color-border); }
.link-overlay { 
    position: absolute; top: 0; right: 0; bottom: 0; left: 0; 
    background: rgba(0,0,0,0.3); color: white; display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.2s; cursor: pointer; font-size: 1.2rem;
}
.snippet-cell:hover .link-overlay { opacity: 1; }
.img-cell { padding: 4px; }

/* CSS Port from HTML */
.controls {
    padding: 12px;
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
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
.signs-control {
    padding: 4px 10px;
    border: 1px solid var(--color-primary);
    border-radius: 6px;
    background: var(--color-primary-light);
}
.signs-control label { display: flex; align-items: center; gap: 6px; font-weight: 600; cursor: pointer; }
.signs-hint { font-size: 11px; color: var(--color-primary-hover); font-style: italic; }
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
    border-bottom: 1px solid var(--color-border);
    border-right: 1px solid var(--color-border);
    white-space: nowrap;
}

th {
    background: var(--color-surface-muted);
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
    background: var(--color-surface);
    text-align: left;
    font-weight: 600;
}
tr:nth-child(even) td.source-col { background: var(--color-bg); }
tr:nth-child(even) { background: var(--color-bg); }
tr:hover td { background: #f0f0f0 !important; }

/* Group Headers */
.group-header {
    cursor: pointer;
    background: var(--color-border);
}
.group-header:hover {
    background: var(--color-border);
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
    color: var(--color-text-muted);
}
.arrow-down {
    transform: rotate(90deg);
}

.pagination {
    padding: 10px;
    border-top: 1px solid var(--color-border);
    display: flex;
    gap: 10px;
    justify-content: center;
    background: var(--color-bg);
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
    background: var(--color-surface);
    width: 80vw;
    height: 80vh;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    /* overflow: hidden; Removed per user request */
}
.modal-header {
    padding: 15px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
}
.modal-body {
    flex: 1;
    overflow: auto; /* Allow scrolling */
    min-height: 0;
}
.modal-text {
    /* flex: 1; overflow: auto; Removed wrapper scroll to rely on body */
    padding: 20px;
}
.close {
    font-size: 24px;
    cursor: pointer;
}
.modal-pattern-preview {
    display: flex; justify-content: center; margin-bottom: 20px;
    border: 1px solid var(--color-border); padding: 10px;
}
.cell-clickable {
    cursor: pointer;
}
.cell-clickable:hover {
    background-color: #f0f0f0;
}

@media (max-width: 768px) {
    .controls { flex-direction: column; align-items: flex-start; gap: 10px; }
    .control-group { width: 100%; justify-content: space-between; }
    .modal-content { width: 95vw; height: 95vh; }
    .modal-header { flex-direction: column; gap: 10px; }
    .header-controls { flex-direction: column; align-items: flex-start; width: 100%; }
    .size-slider { width: 100%; justify-content: space-between; }
    .close { position: absolute; top: 10px; right: 15px; }
}
</style>
