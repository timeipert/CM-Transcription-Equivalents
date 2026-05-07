<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useAnnotationsStore } from '../stores/annotations';
import { useIiifStore } from '../stores/iiif';
import { useSettingsStore } from '../stores/settings';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import PatternDisplay from '../components/PatternDisplay.vue';
import AnnotationCutout from '../components/AnnotationCutout.vue';
import { useImageManifest } from '../composables/useImageManifest';

const route = useRoute();
const router = useRouter();
const tableStore = usePersonalTablesStore();
const annotStore = useAnnotationsStore();
const iiifStore = useIiifStore();
const settings = useSettingsStore();
const { glyphs, rawData } = useTranscriptionData();
const { hasImage } = useImageManifest();

const source = route.params.source;

const zoomedItem = ref(null);
const isZoomOpen = ref(false);

const highlightedLineId = ref(null);
const highlightedPattern = ref(null);
const highlightedAnnotationId = ref(null);

function handleZoom(item) {
    zoomedItem.value = item;
    isZoomOpen.value = true;
}


function scrollToLine(regionId, annId) {
    const el = document.getElementById(`line-${regionId}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightedLineId.value = regionId;
        highlightedAnnotationId.value = annId;
        setTimeout(() => {
            highlightedLineId.value = null;
            highlightedAnnotationId.value = null;
        }, 3000);
    }
}

function scrollToPattern(pattern) {
    const el = document.getElementById(`pattern-${pattern}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightedPattern.value = pattern;
        setTimeout(() => highlightedPattern.value = null, 2000);
    }
}

const starredIdsSet = computed(() => {
    const set = new Set();
    for (const sid of tableStore.starredItems) {
        if (sid.startsWith(source + '|')) {
            const parts = sid.split('|');
            set.add(parts[parts.length - 1]); // the ann.id
        }
    }
    return set;
});

function toggleStar(item) {
    const sid = `${source}|${item.folio}|${item.pattern}|${item.id}`;
    tableStore.toggleStarred(sid);
}

function isStarred(item) {
    const sid = `${source}|${item.folio}|${item.pattern}|${item.id}`;
    return tableStore.starredItems.has(sid);
}

onMounted(async () => {
    // Ensure IIIF manifest is loaded for snippets to work
    await iiifStore.ensureLoaded(source);
});
const table = computed(() => tableStore.tables.find(t => t.source === source));

// Build a map of Ref IDs for each pattern
const patternRefMap = computed(() => {
    const map = {};
    if (!table.value) return map;
    for (const row of table.value.rows) {
        const localId = row.customId;
        const globalId = settings.getGlobalId(row.pattern);
        map[row.pattern] = localId || globalId || '-';
    }
    return map;
});

// Split table rows into two halves for the 2-column layout
const tableHalves = computed(() => {
    if (!table.value) return [[], []];
    const rows = table.value.rows;
    const mid = Math.ceil(rows.length / 2);
    return [rows.slice(0, mid), rows.slice(mid)];
});

function getBasePattern(p) {
    if (!p) return "";
    return p.split(' ')[0];
}

// Extract all lines from both transcription data AND annotations
const manuscriptLines = computed(() => {
    const linesMap = {}; // "folio|lineName" -> { ... }
    
    // 1. Process all raw transcription occurrences
    const rawDataForSource = rawData.value[source];
    if (rawDataForSource) {
        for (const [pattern, instances] of Object.entries(rawDataForSource)) {
            for (const inst of instances) {
                const [doc, fol, lineName] = inst;
                const key = `${fol}|${lineName}`;
                if (!linesMap[key]) {
                    linesMap[key] = { 
                        folio: fol, 
                        lineName, 
                        items: [], 
                        regionId: null, 
                        points: null 
                    };
                }
                
                const basePat = getBasePattern(pattern);
                const baseRefId = patternRefMap.value[basePat] || '-';
                let variant = (pattern.length > basePat.length) ? pattern.substring(basePat.length).trim() : '';
                const displayId = variant ? `${baseRefId}${variant}` : baseRefId;

                linesMap[key].items.push({
                    id: inst.join('|'), // Stable ID from transcription
                    pattern,
                    displayId,
                    variant,
                    folio: fol,
                    lineName,
                    syl: inst[3],
                    notes: inst[4],
                    isVirtual: true
                });
            }
        }
    }

    // 2. Overlay with real annotations (polygons)
    const prefix = source + '_';
    for (const [key, pageRegions] of Object.entries(annotStore.regions)) {
        if (!key.startsWith(prefix)) continue;
        const folio = key.substring(prefix.length);
        
        for (const r of pageRegions) {
            const lKey = `${folio}|${r.name}`;
            if (!linesMap[lKey]) {
                linesMap[lKey] = { folio, lineName: r.name, items: [], regionId: r.id, points: r.points };
            } else {
                linesMap[lKey].regionId = r.id;
                linesMap[lKey].points = r.points;
            }
            
            // If real polygons exist, we might want to prioritize them or merge
            const realItems = annotStore.regionItems[r.id] || [];
            if (realItems.length > 0) {
                // Merge real items into the list (avoid duplicates if possible, or just append)
                // For now, let's just use real items if they exist for this line
                const enrichedReal = realItems.map(ri => {
                    const basePat = getBasePattern(ri.pattern);
                    const baseRefId = patternRefMap.value[basePat] || ri.linkData?.sysId?.split('|')[0] || '-';
                    let variant = ri.variant || '';
                    if (!variant && ri.pattern.includes(' ')) variant = ri.pattern.split(' ')[1];
                    const displayId = variant ? `${baseRefId}${variant}` : baseRefId;
                    
                    // Extract syl/notes from linkData if present
                    let syl = '', notes = '';
                    if (ri.linkData?.sysId) {
                        const p = ri.linkData.sysId.split('|');
                        syl = p[3] || '';
                        notes = p[4] || '';
                    }

                    return { ...ri, displayId, folio, regionId: r.id, syl, notes };
                });
                
                // Replace virtual items with real ones for this specific line if polygons exist
                linesMap[lKey].items = enrichedReal;
            }
        }
    }
    
    // Filter: Only include lines that actually HAVE polygons/annotations
    const lines = Object.values(linesMap).filter(l => l.points && l.items.length > 0);
    
    // Sort by Folio and Line
    lines.sort((a, b) => {
        if (a.folio !== b.folio) return a.folio.localeCompare(b.folio, undefined, { numeric: true });
        return a.lineName.localeCompare(b.lineName, undefined, { numeric: true });
    });
    
    return lines;
});

// For the Patterns table: map pattern -> { variant -> Set({ label, regionId, annId }) }
const patternOccurrences = computed(() => {
    const map = {};
    const lines = manuscriptLines.value || [];
    for (const line of lines) {
        const lineLabel = `${line.folio} / ${line.lineName}`;
        for (const item of line.items || []) {
            if (!item || !item.pattern) continue;
            if (!map[item.pattern]) map[item.pattern] = {};
            const vKey = item.variant || '_base';
            if (!map[item.pattern][vKey]) map[item.pattern][vKey] = new Set();
            
            map[item.pattern][vKey].add({ 
                label: lineLabel, 
                regionId: line.regionId,
                annId: item.id
            });
        }
    }
    return map;
});

</script>

<template>
<div v-if="!table" class="error-state">
    Manuscript not found or not published.
    <button @click="router.push('/public')">Back to Directory</button>
</div>
<div v-else class="public-notation-view">
    <header class="header">
        <div class="header-content">
            <button class="back-link" @click="router.push('/public')">
                <span class="icon">&larr;</span> Back to Directory
            </button>
            <div class="title-stack">
                <div class="brand">Notationsdokumentation</div>
                <h1>{{ source }}</h1>
                <p class="subtitle">{{ table.name }}</p>
            </div>
        </div>
    </header>

    <div class="main-content">
        <div class="page-intro">
            <p>This page provides a detailed index of transcription patterns and their corresponding locations within the manuscript. Patterns are identified by Ref IDs, which are cross-referenced with the annotated line gallery below.</p>
        </div>

        <!-- Section 1: Patterns Overview -->
        <section class="section table-section">
            <div class="section-header">
                <h2>Patterns & Equivalents</h2>
                <span class="badge">{{ table?.rows.length || 0 }} Patterns</span>
            </div>
            
            <div class="table-columns">
                <div v-for="(half, hIdx) in tableHalves" :key="hIdx" class="table-column">
                    <table class="pattern-table">
                        <thead>
                            <tr>
                                <th style="width: 70px">Ref ID</th>
                                <th style="width: 140px">Pattern</th>
                                <th>Occurrences</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in half" :key="row.pattern" 
                                :id="`pattern-${row.pattern}`"
                                :class="{ 'row-highlight': highlightedPattern === row.pattern }">
                                <td class="ref-id">
                                    <button class="btn-scroll-link" @click="scrollToPattern(row.pattern)">
                                        <strong>{{ patternRefMap[row.pattern] }}</strong>
                                    </button>
                                </td>
                                <td class="pattern-cell">
                                    <PatternDisplay :pattern="row.pattern" :glyphs="glyphs" />
                                </td>
                                <td class="occurrences-cell">
                                    <div v-if="patternOccurrences?.[row.pattern]" class="variant-groups">
                                        <div v-for="(locs, variant) in patternOccurrences[row.pattern]" :key="variant" class="variant-group">
                                            <div class="variant-header" v-if="variant !== '_base'">
                                                Variant {{ variant }}
                                            </div>
                                            <div class="loc-list">
                                                <span v-for="loc in Array.from(locs)" :key="loc.annId" 
                                                      class="loc-tag clickable"
                                                      @click="scrollToLine(loc.regionId, loc.annId)">
                                                    {{ loc.label }}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <span v-else class="no-data">None</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <!-- Section 2: Manuscript Line Gallery -->
        <section class="section lines-section">
            <div class="section-header">
                <h2>Manuscript Line Gallery</h2>
                <span class="badge">{{ manuscriptLines.length }} Entries</span>
                <span class="hint">Includes all transcription occurrences and annotated polygons</span>
            </div>

            <div v-if="manuscriptLines.length === 0" class="empty-msg">
                No annotated manuscript lines found for this source.
            </div>

            <div class="lines-list">
            <div v-for="line in manuscriptLines" :key="line.regionId || (line.folio + line.lineName)" 
                 :id="`line-${line.regionId || (line.folio + line.lineName)}`"
                 class="line-card"
                 :class="{ 'line-highlight': highlightedLineId === (line.regionId || (line.folio + line.lineName)) }">
                <div class="line-header">
                    <h3>
                        <span class="fol">{{ line.folio }}</span>
                        <span class="divider">/</span>
                        <span class="num">{{ line.lineName }}</span>
                    </h3>
                    <div class="line-tags">
                        <span v-for="item in line.items" :key="item.id" 
                              class="ref-tag clickable"
                              @click="scrollToPattern(item.pattern)">
                            {{ item.displayId }}
                        </span>
                    </div>
                </div>
                    
                    <div class="line-content">
                        <AnnotationCutout 
                            v-if="hasImage(source, line.folio) && line.points"
                            :source="source" 
                            :folio="line.folio" 
                            :points="line.points"
                            :width="1200" 
                            :height="200" 
                            fit="cover"
                            :padding="0.05"
                            :hideLabel="true"
                            :overlays="line.items"
                            :highlightId="highlightedAnnotationId"
                            :starredIds="starredIdsSet"
                            @zoom-item="handleZoom"
                        />
                    </div>
                </div>
            </div>
        </section>
    </div>

    <!-- Magnifier Modal -->
    <Transition name="fade">
        <div v-if="isZoomOpen" class="zoom-overlay" @click.self="isZoomOpen = false">
            <div class="zoom-content">
                <button class="close-btn" @click="isZoomOpen = false">&times;</button>
                
                <div class="zoom-header">
                    <button class="star-toggle-btn" :class="{active: isStarred(zoomedItem)}" @click="toggleStar(zoomedItem)">
                        {{ isStarred(zoomedItem) ? '★ Starred' : '☆ Star' }}
                    </button>
                    <button class="ref-pill clickable" @click="scrollToPattern(zoomedItem.pattern); isZoomOpen = false">
                        {{ zoomedItem.displayId }}
                    </button>
                    <div class="zoom-meta">
                        <PatternDisplay :pattern="zoomedItem.pattern" :glyphs="glyphs" />
                    </div>
                </div>

                <div class="zoom-body">
                    <AnnotationCutout 
                        v-if="zoomedItem"
                        :source="source" 
                        :folio="zoomedItem.folio" 
                        :points="zoomedItem.points"
                        :width="600" 
                        :height="350" 
                        fit="contain"
                        :hideLabel="true"
                        :overlays="[zoomedItem]"
                        :useFullRes="true"
                    />
                </div>
                <p class="zoom-caption">Detail View • <span class="clickable" @click="scrollToLine(zoomedItem.regionId); isZoomOpen = false">Ref ID {{ zoomedItem.displayId }}</span></p>
            </div>
        </div>
    </Transition>
</div>
</template>

<style scoped>
.public-notation-view {
    background: #f8fafc;
    min-height: 100vh;
}

.header {
    background: linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%);
    border-bottom: 1px solid #e2e8f0;
    padding: 40px 20px;
}

.header-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.back-link {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    color: #64748b;
    font-weight: 600;
    cursor: pointer;
    padding: 6px 14px;
    font-size: 0.85rem;
    border-radius: 20px;
    width: fit-content;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
}
.back-link:hover {
    color: #2563eb;
    border-color: #2563eb;
    background: #f0f7ff;
}

.title-stack h1 {
    margin: 4px 0 0 0;
    font-size: 2.8rem;
    color: #0f172a;
    font-weight: 800;
    letter-spacing: -0.02em;
}

.brand {
    color: #2563eb;
    font-size: 0.9rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: -4px;
}

.page-intro {
    max-width: 800px;
    margin-bottom: 30px;
    padding: 0;
}

.page-intro p {
    color: #475569;
    font-size: 1.1rem;
    line-height: 1.6;
    margin: 0;
}

.subtitle {
    margin: 4px 0 0 0;
    color: #64748b;
    font-size: 1.2rem;
    font-weight: 500;
}

.main-content {
    max-width: 1200px;
    margin: 40px auto;
    padding: 0 20px;
    display: flex;
    flex-direction: column;
    gap: 50px;
}

.section-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 12px;
}

.section-header h2 {
    margin: 0;
    color: #0f172a;
    font-size: 1.5rem;
    font-weight: 700;
}

.badge {
    background: #2563eb;
    color: #ffffff;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 700;
}

.table-columns {
    display: flex;
    gap: 30px;
    align-items: flex-start;
}

.table-column {
    flex: 1;
}

.pattern-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    font-size: 0.85rem;
    border: 1px solid #e2e8f0;
}

.pattern-table th { background: #f8fafc; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; padding: 10px; }
.pattern-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }

.ref-id { color: #2563eb; font-family: 'JetBrains Mono', monospace; font-size: 1rem; font-weight: 700; }

.variant-groups { display: flex; flex-direction: column; gap: 6px; }
.variant-group { display: flex; flex-direction: column; gap: 2px; }
.variant-header { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }

.loc-list { display: flex; flex-wrap: wrap; gap: 6px; }
.loc-tag {
    background: #eff6ff;
    border: 1px solid #dbeafe;
    padding: 1px 8px;
    border-radius: 4px;
    color: #1e40af;
    font-weight: 600;
    font-size: 0.75rem;
}

.loc-tag.clickable:hover {
    background: #2563eb; color: white; border-color: #1d4ed8;
}

.no-data { color: #94a3b8; font-style: italic; font-size: 0.85rem; }

.ref-tag.clickable { cursor: pointer; transition: all 0.2s; }
.ref-tag.clickable:hover { background: #e2e8f0; color: #000; border-color: #94a3b8; }

.line-highlight {
    background: #eff6ff !important;
    outline: 2px solid #3b82f6;
    outline-offset: 8px;
    transition: all 0.5s ease;
}

.row-highlight {
    background: #eff6ff !important;
    transition: all 0.5s ease;
}

.btn-scroll-link {
    background: none; border: none; padding: 0; color: inherit; cursor: pointer; text-align: left;
}
.btn-scroll-link:hover { text-decoration: underline; color: #2563eb; }

.clickable { cursor: pointer; }

/* Lines Gallery Styles */
.lines-list { display: flex; flex-direction: column; gap: 30px; }

.line-card {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border: 1px solid #e2e8f0;
}
.faded { opacity: 0.5; pointer-events: none; }


.line-header {
    padding: 10px 15px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.line-header h3 {
    margin: 0;
    font-size: 1rem;
    color: #334155;
    display: flex;
    align-items: center;
    gap: 8px;
}

.divider { color: #cbd5e1; font-weight: 400; }

.line-tags { display: flex; gap: 10px; flex-wrap: wrap; }
.ref-tag {
    background: #f1f5f9;
    color: #475569;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    border: 1px solid #e2e8f0;
}

.line-image {
    padding: 0;
    background: transparent;
    display: flex;
    justify-content: flex-start;
    border-radius: 0;
    overflow: visible;
}

.error-state {
    padding: 100px; text-align: center; color: #64748b; font-size: 1.2rem;
}
.error-state button { margin-top: 20px; padding: 10px 20px; font-size: 1rem; cursor: pointer; }

/* Magnifier Modal */
.zoom-overlay {
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
}

.zoom-content {
    background: white; border-radius: 24px; padding: 40px; position: relative;
    max-width: 90%; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    display: flex; flex-direction: column; align-items: center; gap: 24px;
}

.close-btn {
    position: absolute; top: 20px; right: 24px; background: none; border: none;
    font-size: 2rem; color: #94a3b8; cursor: pointer; line-height: 1;
}
.close-btn:hover { color: #1e293b; }

.zoom-header { display: flex; align-items: center; gap: 20px; }
.ref-pill {
    background: #000; color: #fff; padding: 6px 16px; border-radius: 30px;
    font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 1.2rem;
}

.zoom-body {
    border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;
    background: #f8fafc; padding: 20px;
}

.zoom-caption { color: #64748b; font-weight: 600; font-size: 0.9rem; margin: 0; }

/* Optimized High-Density Virtual Gallery */
.v-line-row {
    background: white; border: 1px solid #e2e8f0; border-radius: 8px; 
    margin-bottom: 16px; display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.v-line-header { background: #f8fafc; padding: 8px 16px; border-bottom: 1px solid #e2e8f0; }
.v-line-info { display: flex; justify-content: space-between; align-items: center; }
.v-fol-line { font-weight: 800; font-size: 0.8rem; color: #475569; font-family: monospace; }
.v-status-badges { display: flex; gap: 6px; }
.v-badge { font-size: 0.6rem; padding: 2px 8px; border-radius: 10px; font-weight: 700; text-transform: uppercase; }
.v-badge.warn { background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; }
.v-badge.info { background: #eff6ff; color: #3b82f6; border: 1px solid #dbeafe; }

.v-tokens-list { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; background: #fff; }
.v-token-compact {
    border: 1px solid #f1f5f9; border-radius: 6px; background: #fff;
    padding: 6px 10px; min-width: 90px; transition: all 0.2s;
    display: flex; flex-direction: column;
}
.v-token-compact.starred { background: #fffbeb; border-color: #f59e0b; }
.v-token-main { display: flex; flex-direction: column; gap: 4px; }
.v-token-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
.v-token-id { font-size: 0.7rem; font-weight: 800; color: #94a3b8; font-family: monospace; }
.v-token-star { background: none; border: none; cursor: pointer; font-size: 1rem; color: #cbd5e1; padding: 0; line-height: 1; }
.v-token-compact.starred .v-token-star { color: #f59e0b; }

.v-token-meta { margin-top: 4px; border-top: 1px solid #f1f5f9; padding-top: 4px; }
.v-syl { font-size: 0.75rem; font-weight: 800; color: #1e293b; display: block; }
.v-pitch { font-size: 0.65rem; color: #64748b; font-family: monospace; display: block; }


.hint { font-size: 0.8rem; color: #94a3b8; font-style: italic; }


.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
