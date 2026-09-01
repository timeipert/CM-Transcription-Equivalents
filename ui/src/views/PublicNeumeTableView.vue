<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useAnnotationsStore } from '../stores/annotations';
import { useIiifStore } from '../stores/iiif';
import { useSettingsStore } from '../stores/settings';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { useImageManifest } from '../composables/useImageManifest';
import { comparePatternIds } from '../utils/sorting';
import { getNeumeName } from '../config/neumeNames';
import PatternDisplay from '../components/PatternDisplay.vue';
import PatternCode from '../components/PatternCode.vue';
import AnnotationCutout from '../components/AnnotationCutout.vue';
import StateWrapper from '../components/StateWrapper.vue';

const router = useRouter();
const tableStore = usePersonalTablesStore();
const annotStore = useAnnotationsStore();
const iiifStore = useIiifStore();
const settings = useSettingsStore();
const directStore = useDirectSnippetsStore();
const { glyphs, rawData, loadSource, loading: dataLoading, error: dataError } = useTranscriptionData();
const { hasImage } = useImageManifest();

// View Controls
const selectedManuscriptFilter = ref([]);
const patternSearchQuery = ref('');
const displaySize = ref(80); // Snippet width in px
const onlyAnnotatedPatterns = ref(true); // If true, only show patterns that have at least 1 polygon snippet
const patternSortMode = ref('freq'); // 'freq' | 'length' | 'alpha' | 'id'

import { compareChantPatterns } from '../utils/sorting';

// Magnifier / Zoom Modal
const isZoomOpen = ref(false);
const zoomedItem = ref(null);

function handleZoom(item) {
    zoomedItem.value = item;
    isZoomOpen.value = true;
}

function closeZoom() {
    isZoomOpen.value = false;
    zoomedItem.value = null;
}

function isStarred(item) {
    if (!item) return false;
    const sid = `${item.source}|${item.folio}|${item.pattern}|${item.id}`;
    return tableStore.starredItems.has(sid);
}

function toggleStar(item) {
    if (!item) return;
    const sid = `${item.source}|${item.folio}|${item.pattern}|${item.id}`;
    tableStore.toggleStarred(sid);
}

// 1. Published Manuscripts
const publishedTables = computed(() => {
    return tableStore.tables.filter(t => {
        if (!t.isPublished) return false;
        const prefix = t.source + '_';
        return Object.keys(annotStore.regions).some(k => 
            k.startsWith(prefix) && annotStore.regions[k].length > 0
        );
    });
});

const filteredTables = computed(() => {
    if (selectedManuscriptFilter.value.length === 0) {
        return publishedTables.value;
    }
    const set = new Set(selectedManuscriptFilter.value);
    return publishedTables.value.filter(t => set.has(t.source));
});

// Load manifests and raw transcription data for all published sources
onMounted(async () => {
    directStore.load();
    for (const t of publishedTables.value) {
        iiifStore.ensureLoaded(t.source);
        loadSource(t.source);
    }
});

watch(publishedTables, (tables) => {
    for (const t of tables) {
        iiifStore.ensureLoaded(t.source);
        loadSource(t.source);
    }
}, { deep: true });

// 2. Collect all annotated items grouped by [source][pattern]
// A single snippet is a polygon annotation item attached to a line region.
const snippetMatrix = computed(() => {
    // Structure: { [source]: { [pattern]: [ { item, line, folio, ... } ] } }
    const matrix = {};

    for (const table of publishedTables.value) {
        const source = table.source;
        matrix[source] = {};

        const prefix = source + '_';
        for (const [key, pageRegions] of Object.entries(annotStore.regions || {})) {
            if (!key.startsWith(prefix)) continue;
            const folio = key.substring(prefix.length);

            for (const r of pageRegions) {
                const items = annotStore.regionItems?.[r.id] || [];
                for (const item of items) {
                    if (!item || !item.pattern || !item.points) continue;
                    
                    const pat = item.pattern.trim();
                    const basePat = pat.split(' ')[0];

                    // Determine display Ref ID
                    const rowMatch = (table.rows || []).find(row => row.pattern === basePat || row.pattern === pat);
                    const baseRefId = rowMatch?.customId || settings.getGlobalId(basePat) || '-';
                    let variant = item.variant || '';
                    if (!variant && pat.includes(' ')) variant = pat.split(' ')[1];
                    const displayId = variant ? `${baseRefId}${variant}` : baseRefId;

                    if (!matrix[source][pat]) matrix[source][pat] = [];

                    matrix[source][pat].push({
                        ...item,
                        source,
                        folio,
                        regionId: r.id,
                        lineName: r.name,
                        displayId,
                        variant,
                        points: item.points
                    });
                }
            }
        }
    }
    return matrix;
});

// 3. Extract all unique patterns across all published manuscripts
const allPatterns = computed(() => {
    const patternCountMap = new Map(); // pattern -> total annotated count

    for (const table of publishedTables.value) {
        const source = table.source;
        // Include patterns from table rows
        for (const row of table.rows || []) {
            if (!patternCountMap.has(row.pattern)) {
                patternCountMap.set(row.pattern, 0);
            }
        }
        // Include patterns from real annotated snippets
        if (snippetMatrix.value[source]) {
            for (const [pat, items] of Object.entries(snippetMatrix.value[source])) {
                const cur = patternCountMap.get(pat) || 0;
                patternCountMap.set(pat, cur + items.length);
            }
        }
    }

    // Include patterns declared in / used by published direct collections, so a
    // collection documented entirely without IIIF still gets its own columns.
    for (const c of directStore.publishedCollections) {
        for (const p of c.patterns || []) {
            if (!patternCountMap.has(p.code)) patternCountMap.set(p.code, 0);
        }
        for (const s of c.snippets || []) {
            if (!s.pattern) continue;
            patternCountMap.set(s.pattern, (patternCountMap.get(s.pattern) || 0) + 1);
        }
    }

    let patterns = Array.from(patternCountMap.keys());

    // Filter only annotated if toggled
    if (onlyAnnotatedPatterns.value) {
        patterns = patterns.filter(p => (patternCountMap.get(p) || 0) > 0);
    }

    // Filter by search query
    if (patternSearchQuery.value.trim()) {
        const q = patternSearchQuery.value.toLowerCase().trim();
        patterns = patterns.filter(p => {
            const name = getNeumeName(p, settings.neumeNames).toLowerCase();
            return p.toLowerCase().includes(q) || name.includes(q);
        });
    }

    // Sort patterns using chosen sort mode
    patterns.sort((a, b) => compareChantPatterns(a, b, patternSortMode.value, patternCountMap));
    return patterns;
});

// --- Direct snippet collections (no IIIF, images pasted straight in) ---
// These appear as ordinary rows: their snippets are stored images rather than
// IIIF crops, so the cell renders an <img> instead of an AnnotationCutout.
const directRows = computed(() => {
    const rows = directStore.publishedCollections.map(c => ({
        id: c.id,
        source: c.source,
        name: c.name,
        isDirect: true,
        collection: c
    }));
    if (selectedManuscriptFilter.value.length === 0) return rows;
    const set = new Set(selectedManuscriptFilter.value);
    return rows.filter(r => set.has(r.source));
});

/** { [collectionId]: { [pattern]: [snippet] } } */
const directMatrix = computed(() => {
    const matrix = {};
    for (const c of directStore.publishedCollections) {
        matrix[c.id] = {};
        for (const s of c.snippets) {
            if (!s.pattern) continue;
            if (!matrix[c.id][s.pattern]) matrix[c.id][s.pattern] = [];
            matrix[c.id][s.pattern].push({
                ...s,
                source: c.source,
                displayId: s.refId || '-',
                isDirect: true
            });
        }
    }
    return matrix;
});

// Navigation helpers
function goToSingleManuscript(source, isDirect = false) {
    // Custom manuscripts have their own public page — the IIIF notation view
    // would find no folios or line regions for them.
    router.push(isDirect
        ? `/public/custom/${encodeURIComponent(source)}`
        : `/public/${encodeURIComponent(source)}`);
}

function toggleManuscriptFilter(source) {
    const idx = selectedManuscriptFilter.value.indexOf(source);
    if (idx === -1) {
        selectedManuscriptFilter.value.push(source);
    } else {
        selectedManuscriptFilter.value.splice(idx, 1);
    }
}

function selectAllManuscripts() {
    selectedManuscriptFilter.value = [];
}
</script>

<template>
<div class="neume-table-view">
    <!-- Header Section -->
    <header class="header">
        <div class="header-content">
            <div class="top-nav-bar">
                <button class="nav-tab" @click="router.push('/public')">&larr; Manuscript Directory</button>
                <div class="nav-tab active">Neumentabelle (Comparison)</div>
            </div>

            <div class="title-stack">
                <div class="brand">Comparative Notation Analysis</div>
                <h1>Neumentabelle</h1>
                <p class="subtitle">Side-by-side comparison of annotated neume shapes across published manuscripts.</p>
            </div>

            <!-- Controls Panel -->
            <div class="controls-card">
                <div class="control-group">
                    <label class="control-label">Search Patterns / Names:</label>
                    <input 
                        type="text" 
                        v-model="patternSearchQuery" 
                        placeholder="Search e.g. *u, Pes, Torculus..."
                        class="search-input"
                    />
                </div>

                <div class="control-group">
                    <label class="control-label">Order Patterns:</label>
                    <select v-model="patternSortMode" class="search-input" style="padding: 6px 10px; cursor: pointer;">
                        <option value="freq">Overall Frequency (Most used first)</option>
                        <option value="length">Neume Length (Shorter first)</option>
                        <option value="alpha">Alphabetical (Ignoring [ ])</option>
                        <option value="id">Pattern Code / ID</option>
                    </select>
                </div>

                <div class="control-group">
                    <label class="control-label">Snippet Size ({{ displaySize }}px):</label>
                    <input 
                        type="range" 
                        min="50" 
                        max="180" 
                        step="10" 
                        v-model.number="displaySize" 
                        class="range-slider"
                    />
                </div>

                <div class="control-group check-group">
                    <label class="checkbox-label">
                        <input type="checkbox" v-model="onlyAnnotatedPatterns" />
                        Only show patterns with snippets
                    </label>
                </div>

                <div class="control-group ms-filter-group">
                    <span class="control-label">Filter Manuscripts:</span>
                    <div class="filter-pills">
                        <button 
                            class="pill-btn" 
                            :class="{ active: selectedManuscriptFilter.length === 0 }"
                            @click="selectAllManuscripts"
                        >
                            All ({{ publishedTables.length + directStore.publishedCollections.length }})
                        </button>
                        <button
                            v-for="t in publishedTables"
                            :key="t.id"
                            class="pill-btn"
                            :class="{ active: selectedManuscriptFilter.includes(t.source) }"
                            @click="toggleManuscriptFilter(t.source)"
                        >
                            {{ t.source }}
                        </button>
                        <button
                            v-for="c in directStore.publishedCollections"
                            :key="c.id"
                            class="pill-btn"
                            :class="{ active: selectedManuscriptFilter.includes(c.source) }"
                            @click="toggleManuscriptFilter(c.source)"
                        >
                            {{ c.source }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Table Section -->
    <main class="table-wrapper">
        <div v-if="filteredTables.length === 0 && directRows.length === 0" class="empty-state">
            <h3>No Published Manuscripts</h3>
            <p>Publish manuscripts with annotations in the editor to see them in this comparative table.</p>
        </div>

        <div v-else-if="allPatterns.length === 0" class="empty-state">
            <h3>No Matching Patterns</h3>
            <p>No patterns match your search filter or have snippet annotations.</p>
        </div>

        <div v-else class="matrix-container">
            <table class="neume-matrix">
                <thead>
                    <tr>
                        <th class="corner-cell sticky-col sticky-corner">
                            <span class="corner-title">Manuscript \ Pattern</span>
                        </th>
                        <th v-for="pat in allPatterns" :key="pat" class="pattern-header-cell">
                            <div class="pat-header-box">
                                <div class="pat-svg-box">
                                    <PatternDisplay :pattern="pat" :glyphs="glyphs" />
                                </div>
                                <div class="pat-code"><PatternCode :pattern="pat" /></div>
                                <div class="pat-name" v-if="getNeumeName(pat, settings.neumeNames)">
                                    {{ getNeumeName(pat, settings.neumeNames) }}
                                </div>
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="table in filteredTables" :key="table.id">
                        <!-- Left Manuscript Header Column -->
                        <td class="ms-cell sticky-col">
                            <div class="ms-info-box">
                                <button class="ms-link" @click="goToSingleManuscript(table.source)">
                                    <strong>{{ table.source }}</strong>
                                    <span class="link-arrow">&rarr;</span>
                                </button>
                                <span class="ms-title" v-if="table.name">{{ table.name }}</span>
                            </div>
                        </td>

                        <!-- Pattern Cells for this Manuscript -->
                        <td v-for="pat in allPatterns" :key="pat" class="snippet-cell">
                            <div 
                                v-if="snippetMatrix[table.source] && snippetMatrix[table.source][pat] && snippetMatrix[table.source][pat].length > 0" 
                                class="snippets-grid"
                            >
                                <div 
                                    v-for="snip in snippetMatrix[table.source][pat]" 
                                    :key="snip.id"
                                    class="snippet-card"
                                    @click="handleZoom(snip)"
                                    title="Click to zoom snippet"
                                >
                                    <div class="cutout-wrapper">
                                        <AnnotationCutout 
                                            v-if="hasImage(table.source, snip.folio) && snip.points"
                                            :source="table.source" 
                                            :folio="snip.folio" 
                                            :points="snip.points"
                                            :width="displaySize" 
                                            :height="Math.round(displaySize * 0.75)" 
                                            :padding="0.08"
                                            :hideLabel="true"
                                            :overlays="[snip]"
                                        />
                                    </div>
                                    <div class="snip-meta">
                                        <span class="snip-id">{{ snip.displayId }}</span>
                                        <span class="snip-loc">{{ snip.folio }}</span>
                                    </div>
                                </div>
                            </div>
                            <div v-else class="empty-cell">
                                <span class="dash">—</span>
                            </div>
                        </td>
                    </tr>

                    <!-- Direct snippet collections: stored images, no IIIF -->
                    <tr v-for="row in directRows" :key="row.id">
                        <td class="ms-cell sticky-col">
                            <div class="ms-info-box">
                                <button class="ms-link" @click="goToSingleManuscript(row.source, true)">
                                    <strong>{{ row.source }}</strong>
                                    <span class="link-arrow">&rarr;</span>
                                </button>
                                <span class="ms-title" v-if="row.name">{{ row.name }}</span>
                                <span class="direct-badge" title="Documented from directly added snippets (no IIIF)">own snippets</span>
                            </div>
                        </td>
                        <td v-for="pat in allPatterns" :key="pat" class="snippet-cell">
                            <div v-if="directMatrix[row.id] && directMatrix[row.id][pat] && directMatrix[row.id][pat].length > 0"
                                 class="snippets-grid">
                                <div v-for="snip in directMatrix[row.id][pat]" :key="snip.id"
                                     class="snippet-card"
                                     @click="handleZoom(snip)"
                                     title="Click to zoom snippet">
                                    <div class="cutout-wrapper">
                                        <img class="direct-img" :src="snip.image"
                                             :alt="snip.caption || pat"
                                             :style="{ width: displaySize + 'px', height: Math.round(displaySize * 0.75) + 'px' }" />
                                    </div>
                                    <div class="snip-meta">
                                        <span class="snip-id">{{ snip.displayId }}</span>
                                        <span class="snip-loc">{{ snip.caption }}</span>
                                    </div>
                                </div>
                            </div>
                            <div v-else class="empty-cell">
                                <span class="dash">—</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </main>

    <!-- Detail Magnifier Modal -->
    <Transition name="fade">
        <div v-if="isZoomOpen && zoomedItem" class="zoom-overlay" @click.self="closeZoom">
            <div class="zoom-content">
                <button class="close-btn" @click="closeZoom">&times;</button>
                
                <div class="zoom-header">
                    <button class="star-toggle-btn" :class="{ active: isStarred(zoomedItem) }" @click="toggleStar(zoomedItem)">
                        {{ isStarred(zoomedItem) ? '★ Starred' : '☆ Star' }}
                    </button>
                    <div class="ref-pill">
                        Ref ID: {{ zoomedItem.displayId }}
                    </div>
                    <div class="zoom-meta">
                        <PatternDisplay :pattern="zoomedItem.pattern" :glyphs="glyphs" />
                        <span class="zoom-neume-name" v-if="getNeumeName(zoomedItem.pattern, settings.neumeNames)">
                            ({{ getNeumeName(zoomedItem.pattern, settings.neumeNames) }})
                        </span>
                    </div>
                </div>

                <div class="zoom-body">
                    <img v-if="zoomedItem.isDirect" class="zoom-direct-img"
                         :src="zoomedItem.image" :alt="zoomedItem.caption || zoomedItem.pattern" />
                    <AnnotationCutout
                        v-else
                        :source="zoomedItem.source"
                        :folio="zoomedItem.folio"
                        :points="zoomedItem.points"
                        :width="550"
                        :height="320"
                        fit="contain"
                        :hideLabel="true"
                        :overlays="[zoomedItem]"
                        :useFullRes="true"
                    />
                </div>

                <div class="zoom-footer-info">
                    <template v-if="zoomedItem.isDirect">
                        <strong>{{ zoomedItem.source }}</strong>
                        <span v-if="zoomedItem.caption"> &bull; {{ zoomedItem.caption }}</span>
                        <span class="direct-badge">own snippet</span>
                    </template>
                    <template v-else>
                        <strong>{{ zoomedItem.source }}</strong> &bull; Folio {{ zoomedItem.folio }} &bull; {{ zoomedItem.lineName }}
                        <button class="btn-jump-source" @click="goToSingleManuscript(zoomedItem.source, zoomedItem.isDirect)">
                            Open Manuscript View &rarr;
                        </button>
                    </template>
                </div>
            </div>
        </div>
    </Transition>
</div>
</template>

<style scoped>
/* Direct (non-IIIF) snippets: stored images rather than live IIIF crops. */
.direct-img { object-fit: contain; background: var(--color-bg); border-radius: 3px; display: block; }
.zoom-direct-img { max-width: 550px; max-height: 320px; width: auto; height: auto; object-fit: contain; background: var(--color-bg); border-radius: 6px; }
.direct-badge { font-size: 9px; text-transform: uppercase; font-weight: 800; letter-spacing: .03em; background: var(--color-surface-muted); color: var(--color-text-muted); padding: 2px 6px; border-radius: 3px; margin-left: 6px; }

.neume-table-view {
    background: var(--color-bg);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

.header {
    background: linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-muted) 100%);
    border-bottom: 1px solid var(--color-border);
    padding: 30px 20px;
}

.header-content {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.top-nav-bar {
    display: flex;
    gap: 12px;
    align-items: center;
}

.nav-tab {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    padding: 6px 14px;
    border-radius: 6px;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.2s;
}

.nav-tab:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
}

.nav-tab.active {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
}

.title-stack h1 {
    font-size: 2.2rem;
    margin: 4px 0 0;
    color: var(--color-text);
    font-weight: 800;
}

.brand {
    color: var(--color-primary-hover);
    font-size: 0.85rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.subtitle {
    color: var(--color-text-muted);
    margin: 4px 0 0;
    font-size: 1.05rem;
}

/* Controls Card */
.controls-card {
    background: white;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 16px 20px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 24px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.03);
}

.control-group {
    display: flex;
    align-items: center;
    gap: 10px;
}

.control-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-muted);
}

.search-input {
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font-size: 0.9rem;
    width: 220px;
}

.search-input:focus {
    outline: none;
    border-color: var(--color-primary);
}

.range-slider {
    cursor: pointer;
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text);
    cursor: pointer;
}

.ms-filter-group {
    flex-basis: 100%;
    margin-top: 4px;
}

.filter-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.pill-btn {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.2s;
}

.pill-btn:hover {
    background: var(--color-surface-muted);
}

.pill-btn.active {
    background: var(--color-primary-light);
    color: var(--color-primary-hover);
    border-color: var(--color-primary);
}

/* Matrix Table Container */
.table-wrapper {
    flex: 1;
    padding: 20px;
    overflow: auto;
}

.matrix-container {
    max-width: 100%;
    overflow: auto;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: white;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
}

.neume-matrix {
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    text-align: left;
}

/* Sticky Headers and Columns */
.sticky-col {
    position: sticky;
    left: 0;
    background: white;
    z-index: 2;
    border-right: 2px solid var(--color-border);
}

.sticky-corner {
    position: sticky;
    top: 0;
    left: 0;
    z-index: 4;
    background: var(--color-bg) !important;
}

.corner-cell {
    padding: 16px 20px;
    min-width: 220px;
    border-bottom: 2px solid var(--color-border);
}

.corner-title {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
}

.pattern-header-cell {
    position: sticky;
    top: 0;
    background: var(--color-bg);
    z-index: 3;
    border-bottom: 2px solid var(--color-border);
    border-right: 1px solid var(--color-border);
    padding: 12px 14px;
    min-width: 130px;
    text-align: center;
    vertical-align: top;
}

.pat-header-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.pat-svg-box {
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.pat-code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-text);
}

.pat-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-primary-hover);
    background: var(--color-primary-light);
    padding: 1px 6px;
    border-radius: 4px;
    white-space: nowrap;
}

/* Rows and Cells */
.ms-cell {
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
    vertical-align: top;
    min-width: 220px;
}

.ms-info-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.ms-link {
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    color: var(--color-text);
    font-size: 1.05rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
}

.ms-link:hover {
    color: var(--color-primary);
}

.link-arrow {
    font-size: 0.9rem;
    color: var(--color-primary);
}

.ms-title {
    font-size: 0.8rem;
    color: var(--color-text-muted);
}

.snippet-cell {
    padding: 10px;
    border-bottom: 1px solid var(--color-border);
    border-right: 1px solid var(--color-surface-muted);
    vertical-align: top;
}

.snippets-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-start;
}

.snippet-card {
    background: white;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 4px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
}

.snippet-card:hover {
    border-color: var(--color-primary);
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    transform: translateY(-2px);
}

.cutout-wrapper {
    border-radius: 4px;
    overflow: hidden;
    background: var(--color-bg);
}

.snip-meta {
    display: flex;
    justify-content: space-between;
    width: 100%;
    padding: 2px 4px 0;
    font-size: 0.7rem;
    font-family: 'JetBrains Mono', monospace;
}

.snip-id {
    font-weight: 700;
    color: var(--color-primary-hover);
}

.snip-loc {
    color: var(--color-text-muted);
}

.empty-cell {
    height: 100%;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.dash {
    color: var(--color-border);
    font-size: 1.2rem;
}

.empty-state {
    text-align: center;
    padding: 80px 20px;
    background: white;
    border-radius: 12px;
    border: 1px dashed var(--color-border-hover);
    max-width: 600px;
    margin: 40px auto;
}

/* Modal */
.zoom-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
}

.zoom-content {
    background: white; border-radius: 20px; padding: 30px; position: relative;
    max-width: 90%; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    display: flex; flex-direction: column; align-items: center; gap: 16px;
}

.close-btn {
    position: absolute; top: 16px; right: 20px; background: none; border: none;
    font-size: 2rem; color: var(--color-text-light); cursor: pointer; line-height: 1;
}
.close-btn:hover { color: var(--color-text); }

.zoom-header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.ref-pill {
    background: var(--color-text); color: white; padding: 4px 14px; border-radius: 20px;
    font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 1rem;
}

.zoom-meta {
    display: flex;
    align-items: center;
    gap: 8px;
}

.zoom-neume-name {
    font-weight: 600;
    color: var(--color-primary-hover);
    font-size: 0.95rem;
}

.zoom-body {
    border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden;
    background: var(--color-bg); padding: 12px;
}

.zoom-footer-info {
    font-size: 0.9rem;
    color: var(--color-text);
    display: flex;
    align-items: center;
    gap: 16px;
}

.btn-jump-source {
    background: var(--color-primary-light);
    color: var(--color-primary-hover);
    border: 1px solid var(--color-primary);
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
}

.btn-jump-source:hover {
    background: var(--color-primary);
    color: white;
}

.star-toggle-btn {
    background: white;
    border: 1px solid var(--color-border);
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
}

.star-toggle-btn.active {
    background: var(--color-warning-light, #fef3c7);
    color: var(--color-warning, #d97706);
    border-color: var(--color-warning, #d97706);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
