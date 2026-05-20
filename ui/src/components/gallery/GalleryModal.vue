<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAnnotationsStore } from '../../stores/annotations';
import { useImageManifest } from '../../composables/useImageManifest';
import { useIiifStore } from '../../stores/iiif';
import AnnotationCutout from '../AnnotationCutout.vue';
import { compareFolios } from '../../utils/sorting';

const props = defineProps({
    pattern: { type: String, required: true },
    sourceData: { type: Object, required: true }, // raw data for this source
    sourceName: { type: String, required: true }, 
    visible: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'select']);
const router = useRouter();

const annotStore = useAnnotationsStore();
const iiifStore = useIiifStore();
const tableStore = usePersonalTablesStore();
const { hasImage, getImageUrl, getStandardSource, getStandardFolio, loaded: manifestLoaded } = useImageManifest();

import { usePersonalTablesStore } from '../../stores/personalTables';


const iiifLoading = ref(false);

// Ensure the IIIF manifest is loaded when the gallery becomes visible
watch(() => props.visible, async (vis) => {
    if (vis && props.sourceName && iiifStore.links[props.sourceName] && !iiifStore.parsedData[props.sourceName]) {
        iiifLoading.value = true;
        await iiifStore.ensureLoaded(props.sourceName);
        iiifLoading.value = false;
    }
}, { immediate: true });

const allOccurrences = ref([]);
const occurrencesLoading = ref(false);

const pageSearch = ref("");
const pitchSearch = ref("");

const filteredPages = computed(() => {
    const qPage = pageSearch.value.toLowerCase().trim();
    const qPitch = pitchSearch.value.toLowerCase().trim();
    
    let res = [];
    for (const p of availablePages.value) {
        // 1. Filter by page label
        if (qPage && !p.label.toLowerCase().includes(qPage)) continue;
        
        // 2. Filter occurrences by pitch
        let matchingOccs = p.occs;
        if (qPitch) {
            matchingOccs = p.occs.filter(o => o.notes.toLowerCase().includes(qPitch));
        }
        
        // 3. If no matches left, skip page
        if (matchingOccs.length === 0) continue;
        
        // 4. Recalculate line hint for matching occurrences
        const lineList = Array.from(new Set(matchingOccs.map(o => o.line))).sort((a,b) => a-b);
        const lineStr = lineList.length > 0 ? `L${lineList.join(', ')}` : '';
        
        res.push({
            ...p,
            lineHint: lineStr,
            matchSummary: Array.from(new Set(matchingOccs.map(o => o.notes))).join(', ')
        });
    }
    return res;
});

const currentGalleryItems = ref([]);
const snippetsLoading = ref(false);

// Deferred available pages - optimized for large datasets
const availablePages = ref([]);
const pagesLoading = ref(false);
const processingProgress = ref(0);

watch([() => props.visible, () => iiifStore.parsedData, () => props.pattern], async ([vis, parsed, pattern]) => {
    if (!vis) { 
        availablePages.value = []; 
        allOccurrences.value = [];
        currentGalleryItems.value = [];
        return; 
    }
    
    pagesLoading.value = true;
    occurrencesLoading.value = true;
    snippetsLoading.value = true;
    processingProgress.value = 0;
    
    // 1. Gather occurrences asynchronously (0-20% progress)
    const base = pattern.split(' ')[0];
    const gathered = [];
    const entries = Object.entries(props.sourceData);
    const entryBatch = 100;
    for (let i = 0; i < entries.length; i += entryBatch) {
        const chunk = entries.slice(i, i + entryBatch);
        for (const [fullPat, occs] of chunk) {
            if (fullPat === base || fullPat.startsWith(base + ' ')) {
                for (const o of occs) {
                    gathered.push({ 
                        source: o[0], 
                        folio: o[1], 
                        line: o[2], 
                        pattern: fullPat,
                        syl: o[3] || '',
                        notes: o[4] || ''
                    });
                }
            }
        }
        processingProgress.value = Math.round((i / entries.length) * 20); 
        await new Promise(r => setTimeout(r, 0));
    }
    allOccurrences.value = gathered;
    occurrencesLoading.value = false;

    // 2. Gather existing snippets asynchronously (20-40% progress)
    const snippets = [];
    
    // A. Legacy Annotations pass
    const annotKeys = Object.keys(annotStore.annotations);
    const annotBatch = 500;
    for (let i = 0; i < annotKeys.length; i += annotBatch) {
        const chunk = annotKeys.slice(i, i + annotBatch);
        for (const key of chunk) {
            // key is "Source_Folio_Pattern"
            // We need to check if Pattern starts with base
            const parts = key.split('_');
            if (parts.length < 3) continue;
            const src = parts[0];
            if (src !== props.sourceName) continue; // Only current manuscript
            
            const fol = parts[1];
            const pat = parts.slice(2).join('_'); // handle patterns with underscores
            
            if (pat === base || pat.startsWith(base + ' ')) {
                const anns = annotStore.annotations[key] || [];
                for (const a of anns) {
                    snippets.push({
                        ...a,
                        source: src,
                        folio: fol,
                        pattern: pat,
                        variant: a.variant || (pat.includes(' ') ? pat.split(' ')[1] : '')
                    });
                }
            }
        }
        processingProgress.value = 20 + Math.round((i / annotKeys.length) * 10);
        await new Promise(r => setTimeout(r, 0));
    }

    // B. Region-based items pass
    const regionIds = Object.keys(annotStore.regionItems);
    for (let i = 0; i < regionIds.length; i += 200) {
        const chunk = regionIds.slice(i, i + 200);
        for (const rid of chunk) {
            const items = annotStore.regionItems[rid] || [];
            const matches = items.filter(i => i.pattern === base || i.pattern === props.pattern);
            if (matches.length > 0) {
                // We need to find which page this region belongs to
                // We'll search in annotStore.regions
                let foundPage = null;
                for (const pageKey in annotStore.regions) {
                    const rMatch = annotStore.regions[pageKey].find(r => r.id === rid);
                    if (rMatch) {
                        const [src, fol] = pageKey.split('_');
                        if (src === props.sourceName) {
                            foundPage = { src, fol };
                            break;
                        }
                    }
                }
                
                if (foundPage) {
                    for (const m of matches) {
                        snippets.push({
                            ...m,
                            source: foundPage.src,
                            folio: foundPage.fol,
                            regionId: rid
                        });
                    }
                }
            }
        }
        processingProgress.value = 30 + Math.round((i / regionIds.length) * 10);
        await new Promise(r => setTimeout(r, 0));
    }
    currentGalleryItems.value = snippets;
    snippetsLoading.value = false;

    // 3. Match occurrences to unique physical pages (40-70% progress)
    const occurrences = allOccurrences.value;
    const uniqueKeys = new Set();
    const pageMap = new Map();
    const oBatch = 5000;
    for (let i = 0; i < occurrences.length; i += oBatch) {
        const chunk = occurrences.slice(i, i + oBatch);
        for (const o of chunk) {
            const key = `${o.source}_${o.folio}`;
            if (!uniqueKeys.has(key)) {
                uniqueKeys.add(key);
                pageMap.set(key, { 
                    d: o.source, f: o.folio, pat: o.pattern, 
                    occs: [o]
                });
            } else {
                const entry = pageMap.get(key);
                entry.occs.push(o);
            }
        }
        processingProgress.value = 40 + Math.round((i / occurrences.length) * 30);
        await new Promise(r => setTimeout(r, 0));
    }

    // 4. Process annotation status for unique pages (70-90% progress)
    const uniquePages = Array.from(pageMap.values());
    const result = [];
    const statusBatch = 200;
    for (let i = 0; i < uniquePages.length; i += statusBatch) {
        const chunk = uniquePages.slice(i, i + statusBatch);
        for (const p of chunk) {
            if (hasImage(p.d, p.f)) {
                const std = getStandardSource(p.d, p.f);
                const stf = getStandardFolio(p.d, p.f);
                
                // Check if this page is in our snippets list
                const snippetMatch = currentGalleryItems.value.find(s => s.source === std && s.folio === stf);
                const hasAnnot = !!snippetMatch;
                


                result.push({
                    d: p.d, f: p.f, stf,
                    pat: p.pat,
                    label: String(p.f),
                    isAnnotated: hasAnnot,
                    regionId: snippetMatch ? snippetMatch.regionId : null,
                    occs: p.occs,
                    allPitches: Array.from(new Set(p.occs.map(o => o.notes))).join(' | ')
                });
            }
        }
        processingProgress.value = 70 + Math.round((i / uniquePages.length) * 20);
        await new Promise(r => setTimeout(r, 0));
    }

    // 5. Sort (90-100% progress)
    const orderMap = {};
    if (iiifStore.parsedData[props.sourceName]) {
        iiifStore.parsedData[props.sourceName].forEach((item, idx) => {
            orderMap[item.folio] = idx;
        });
    }

    result.sort((a, b) => {
        if (a.isAnnotated && !b.isAnnotated) return -1;
        if (!a.isAnnotated && b.isAnnotated) return 1;
        if (iiifStore.parsedData[props.sourceName]) {
            const idxA = orderMap[a.stf] ?? 9999;
            const idxB = orderMap[b.stf] ?? 9999;
            if (idxA !== idxB) return idxA - idxB;
        }
        return compareFolios(a.label, b.label);
    });
    
    availablePages.value = result;
    pagesLoading.value = false;
    processingProgress.value = 100;
}, { immediate: true, deep: false });

// Helper for UI
const activeFolioLabel = ref("");

function startAnnotating(pageObj) {
     emit('select', pageObj);
}

function removeAnnot(id, source, folio) {
    if (confirm("Delete annotation?")) {
        const std = getStandardSource(source, folio);
        annotStore.removeAnnotation(std, folio, props.pattern, id);
    }
}

function goToRegion(item) {
    if (!item.regionId) return;
    router.push({
        path: '/polygons',
        query: {
            source: item.source,
            folio: item.folio,
            region: item.regionId
        }
    });
}

// Snippet Modal
import SnippetDetailModal from '../SnippetDetailModal.vue';
const selectedSnippet = ref(null);

function openSnippet(item) {
    const anns = annotStore.getAnnotations(item.source, item.folio, props.pattern);
    const full = anns.find(a => a.id === item.id);
    selectedSnippet.value = { ...item, pattern: props.pattern, linkData: full?.linkData };
}

// Starring Logic
function toggleStar(item) {
    const sid = `${props.sourceName}|${item.folio}|${item.pattern}|${item.id || item.sysId}`;
    tableStore.toggleStarred(sid);
}

function isStarred(item) {
    const sid = `${props.sourceName}|${item.folio}|${item.pattern}|${item.id || item.sysId}`;
    return tableStore.starredItems.has(sid);
}

const virtualLines = computed(() => {
    const map = {};
    for (const o of allOccurrences.value) {
        const key = `${o.folio}|${o.line}`;
        if (!map[key]) map[key] = { folio: o.folio, line: o.line, items: [] };
        map[key].items.push({
            ...o,
            sysId: [o.source, o.folio, o.line, o.syl, o.notes].join('|') // more unique
        });
    }
    // Sort
    return Object.values(map).sort((a,b) => compareFolios(a.folio, b.folio));
});

</script>

<template>
    <!-- Gallery Modal -->
    <div v-if="visible" class="modal">
        <div class="modal-content gallery-modal">
             <div class="modal-header">
                <h3>Gallery: {{ pattern }}</h3>
                <button class="close-btn" @click="$emit('close')">&times;</button>
            </div>
            <div class="modal-body gallery-body">
                <div class="scroll-area">
                    <div v-if="snippetsLoading" class="snippets-loader">
                        <div class="spinner"></div>
                        <span>Loading personal snippets...</span>
                    </div>
                    <div v-else class="cutouts-grid">
                        <!-- Real Snippets -->
                        <div v-for="item in currentGalleryItems" :key="item.id" 
                             class="cutout-wrapper-cell">
                             
                             <div class="cutout-container" @click="openSnippet(item)">
                                 <AnnotationCutout 
                                    :source="item.source" 
                                    :folio="item.folio" 
                                    :points="item.points"
                                    :starredIds="tableStore.starredItems"
                                />
                                <div class="item-label">{{ item.pattern }} {{ item.variant || '' }}</div>
                                <button class="star-btn" @click.stop="toggleStar(item)">
                                    {{ isStarred(item) ? '★' : '☆' }}
                                </button>
                                <button @click.stop="removeAnnot(item.id, item.source, item.folio)" class="btn-del" title="Delete">&times;</button>
                             </div>
                             
                             <button v-if="item.regionId" 
                                     class="btn-line-link" 
                                     @click="goToRegion(item)">
                                 Line View &rarr;
                             </button>
                        </div>
                        
                        <!-- Virtual Gallery (when no real snippets) -->
                        <template v-if="currentGalleryItems.length === 0">
                            <div v-for="line in virtualLines" :key="line.folio + line.line" class="v-line-row">
                                <div class="v-line-info">
                                    <span class="v-loc">{{ line.folio }} / {{ line.line }}</span>
                                    <button v-if="hasImage(props.sourceName, line.folio)" 
                                            class="v-row-annot-btn" 
                                            @click="startAnnotating({d: props.sourceName, f: line.folio})">
                                        Annotate Line
                                    </button>
                                </div>
                                <div class="v-tokens-list">
                                    <div v-for="item in line.items" :key="item.sysId" 
                                         class="v-token-compact" 
                                         :class="{starred: isStarred(item)}">
                                        <div class="v-token-content">
                                            <div class="v-token-top">
                                                <span class="v-token-syl">{{ item.syl || '—' }}</span>
                                                <button class="v-token-star" @click="toggleStar(item)">
                                                    {{ isStarred(item) ? '★' : '☆' }}
                                                </button>
                                            </div>
                                            <div class="v-token-pitch">{{ item.notes || '—' }}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </div>
                    
                    <div v-if="currentGalleryItems.length===0 && virtualLines.length===0" class="no-cutouts">
                        <span>No occurrences found for this pattern.</span>
                    </div>
                </div>
                
                <div class="gallery-footer">
                     <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <h4>Available for annotation ({{ availablePages.length }})</h4>
                             <input v-if="availablePages.length > 5" 
                                   v-model="pageSearch" 
                                   placeholder="Filter folio..." 
                                   class="page-filter" />
                             <input v-if="availablePages.length > 5" 
                                   v-model="pitchSearch" 
                                   placeholder="Filter pitches..." 
                                   class="page-filter" />
                        </div>
                        <div v-if="pagesLoading || occurrencesLoading || snippetsLoading" class="mini-loader">
                             <div class="spinner"></div>
                             <span>
                                {{ occurrencesLoading ? 'Gathering...' : (snippetsLoading ? 'Loading Snippets...' : 'Matching Pages...') }} 
                                {{ processingProgress }}%
                             </span>
                        </div>
                     </div>
                     
                     <div v-if="iiifLoading" class="loading">Loading manuscript manifest...</div>
                     <div v-else-if="!pagesLoading && availablePages.length===0" class="warn">
                          No images found for this pattern in '{{sourceName}}'.
                     </div>
                     <div v-else class="page-chips" :class="{ 'faded': pagesLoading }">
                          <button 
                             v-for="p in filteredPages" 
                             :key="p.label" 
                             class="chip" 
                             :class="{ 'is-annotated': p.isAnnotated }"
                             :title="p.matchSummary"
                             @click="startAnnotating(p)"
                          >
                              <span v-if="p.isAnnotated" class="annot-check">✓</span>
                              <span class="folio-lbl">{{ p.label }}</span>
                              <span v-if="p.lineHint" class="line-hint">{{ p.lineHint }}</span>
                              <span v-if="pitchSearch && p.matchSummary" class="pitch-preview">{{ p.matchSummary }}</span>
                          </button>
                     </div>
                </div>
            </div>
        </div>
    </div>


    <!-- Snippet Detail Modal -->
    <SnippetDetailModal 
        :visible="!!selectedSnippet"
        :annotation="selectedSnippet"
        @close="selectedSnippet = null"
    />
</template>

<style scoped>
.modal { 
    position: fixed; top:0; left:0; width:100%; height:100%; 
    background: rgba(15, 23, 42, 0.7); 
    backdrop-filter: blur(4px);
    display:flex; justify-content:center; align-items:center; z-index:1000; 
}

.gallery-modal { 
    width: 100vw; height: 100vh; 
    max-width: none; max-height: none;
    background: white; display: flex; flex-direction: column; 
    border-radius: 0; overflow: hidden; 
    box-shadow: none;
}

.modal-header { 
    padding: 20px 24px; border-bottom: 1px solid #f1f5f9; 
    display: flex; justify-content: space-between; align-items: center; 
    background: #fff;
}
.modal-header h3 { margin: 0; font-size: 1.25rem; color: #1e293b; font-weight: 700; }

.close-btn {
    background: #f1f5f9; border: none; border-radius: 50%;
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.2s; color: #64748b; font-size: 1.2rem;
}
.close-btn:hover { background: #e2e8f0; color: #0f172a; transform: rotate(90deg); }

.gallery-body { 
    flex: 1; overflow: hidden; display: flex; flex-direction: column;
}

.scroll-area { 
    flex: 1; overflow-y: auto; padding: 24px; background: #f8fafc;
    position: relative;
}

.snippets-loader {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 40px; color: #3b82f6; gap: 10px; font-weight: 600;
}

.cutouts-grid { 
    display: grid; 
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); 
    gap: 20px; 
}

.cutout-container { position: relative; }
.btn-del { 
    position: absolute; top: -8px; right: -8px; 
    background: #ef4444; color: white; border: none; 
    border-radius: 50%; width: 24px; height: 24px; 
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    opacity: 0; transform: scale(0.8); transition: all 0.2s ease;
    z-index: 5;
}
.cutout-container:hover .btn-del { opacity: 1; transform: scale(1); }

.item-label {
    font-size: 10px;
    font-family: monospace;
    text-align: center;
    background: white;
    padding: 2px;
    border-top: 1px solid #eee;
    color: #334155;
}

.gallery-footer { 
    background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; 
}
.gallery-footer h4 { margin: 0 0 12px 0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; }

.page-chips { 
    display: flex; flex-wrap: wrap; gap: 8px; 
    max-height: 120px; overflow-y: auto; padding-bottom: 8px;
}
.chip { 
    padding: 6px 14px; background: #fff; border: 1px solid #e2e8f0; 
    border-radius: 20px; cursor: pointer; font-size: 0.85rem; font-weight: 500;
    transition: all 0.2s; color: #334155;
    display: flex; align-items: center; gap: 4px;
}
.chip:hover { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; }
.chip.is-annotated { background: #f0fdf4; border-color: #86efac; color: #166534; }
.chip.is-annotated:hover { background: #dcfce7; border-color: #4ade80; }

.folio-lbl { font-weight: bold; }
.line-hint { 
    font-size: 9px; 
    background: #e2e8f0; 
    color: #475569; 
    padding: 1px 4px; 
    border-radius: 4px; 
    margin-left: 4px;
    font-family: monospace;
}
.chip.is-annotated .line-hint { background: #dcfce7; color: #166534; }
.annot-check { color: #22c55e; font-weight: bold; margin-right: 2px; }
.no-cutouts { 
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 60px 0; color: #94a3b8; font-style: italic; font-size: 0.95rem;
}
.warn { color: #f59e0b; font-size: 0.85rem; padding: 8px 12px; background: #fffbeb; border-radius: 6px; border: 1px solid #fef3c7; }
.loading { color: #64748b; font-size: 0.9rem; }

.mini-loader { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #3b82f6; font-weight: 600; }
.spinner {
    width: 16px; height: 16px;
    border: 2px solid rgba(59, 130, 246, 0.2);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }


.star-btn {
    position: absolute; top: 4px; left: 4px; background: rgba(255,255,255,0.8);
    border: none; border-radius: 4px; padding: 2px 4px; cursor: pointer;
    font-size: 14px; color: #cbd5e1; z-index: 10;
}
.star-btn:hover { color: #f59e0b; }

/* Compact Virtual Gallery Styles */
.v-line-row {
    background: white; border: 1px solid #e2e8f0; border-radius: 6px; 
    margin-bottom: 12px; display: flex; flex-direction: column; overflow: hidden;
    grid-column: 1 / -1;
}
.v-line-info {
    background: #f8fafc; padding: 6px 12px; border-bottom: 1px solid #e2e8f0;
    display: flex; justify-content: space-between; align-items: center;
}
.v-loc { font-weight: 800; font-size: 0.75rem; color: #64748b; font-family: monospace; }
.v-row-annot-btn { 
    font-size: 0.65rem; background: #3b82f6; color: white; border: none; 
    border-radius: 4px; padding: 2px 8px; cursor: pointer; font-weight: 600;
}
.v-tokens-list { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px; }
.v-token-compact {
    border: 1px solid #f1f5f9; border-radius: 4px; background: #fff;
    padding: 4px 8px; min-width: 80px; transition: all 0.2s;
}
.v-token-compact.starred { background: #fffbeb; border-color: #f59e0b; }
.v-token-content { display: flex; flex-direction: column; gap: 2px; }
.v-token-top { display: flex; justify-content: space-between; align-items: center; gap: 4px; }
.v-token-syl { font-size: 0.75rem; font-weight: 800; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-token-star { background: none; border: none; cursor: pointer; font-size: 0.85rem; color: #cbd5e1; padding: 0; line-height: 1; }
.v-token-compact.starred .v-token-star { color: #f59e0b; }
.v-token-pitch { font-size: 0.65rem; color: #64748b; font-family: monospace; }

.faded { opacity: 0.5; pointer-events: none; }


.page-filter {
    padding: 4px 10px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 12px;
    outline: none;
}
.page-filter:focus { border-color: #3b82f6; }

/* Nested Annotator Styles */
.annot-modal { width: 95vw; height: 95vh; background:white; display:flex; flex-direction:column; border-radius:12px; overflow:hidden; }
.modal-body-annot { flex:1; overflow:hidden; position: relative; }
.pitch-preview {
    display: block;
    font-size: 8px;
    color: #6366f1;
    margin-top: 2px;
    font-family: monospace;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
