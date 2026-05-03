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
const { hasImage, getImageUrl, getStandardSource, getStandardFolio, loaded: manifestLoaded } = useImageManifest();

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

const filteredPages = computed(() => {
    if (!pageSearch.value.trim()) return availablePages.value;
    const q = pageSearch.value.toLowerCase();
    return availablePages.value.filter(p => p.label.toLowerCase().includes(q));
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
                    gathered.push({ source: o[0], folio: o[1], line: o[2], pattern: fullPat });
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
                pageMap.set(key, { d: o.source, f: o.folio, pat: o.pattern, lines: new Set([o.line]) });
            } else {
                pageMap.get(key).lines.add(o.line);
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
                const hasAnnot = currentGalleryItems.value.some(s => s.source === std && s.folio === stf);
                
                const lineList = Array.from(p.lines).sort((a,b) => a-b);
                const lineStr = lineList.length > 0 ? `L${lineList.join(', ')}` : '';

                result.push({
                    d: p.d, f: p.f, stf,
                    pat: p.pat,
                    label: String(p.f),
                    lineHint: lineStr,
                    isAnnotated: hasAnnot
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
                        <div v-for="item in currentGalleryItems" :key="item.id" 
                             class="cutout-wrapper-cell">
                             
                             <div class="cutout-container" @click="openSnippet(item)">
                                 <AnnotationCutout 
                                    :source="item.source" 
                                    :folio="item.folio" 
                                    :points="item.points"
                                />
                                <div class="item-label">{{ item.pattern }} {{ item.variant || '' }}</div>
                                <button @click.stop="removeAnnot(item.id, item.source, item.folio)" class="btn-del" title="Delete">&times;</button>
                             </div>
                             
                             <button v-if="item.regionId" 
                                     class="btn-line-link" 
                                     @click="goToRegion(item)">
                                 Line View &rarr;
                             </button>
                             
                        </div>
                    </div>
                    <div v-if="currentGalleryItems.length===0" class="no-cutouts">
                        <span>No annotations yet for this pattern.</span>
                    </div>
                </div>
                
                <div class="gallery-footer">
                     <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <h4>Available for annotation ({{ availablePages.length }})</h4>
                            <input v-if="availablePages.length > 10" 
                                   v-model="pageSearch" 
                                   placeholder="Filter pages..." 
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
                             @click="startAnnotating(p)"
                          >
                              <span v-if="p.isAnnotated" class="annot-check">✓</span>
                              <span class="folio-lbl">{{ p.label }}</span>
                              <span v-if="p.lineHint" class="line-hint">{{ p.lineHint }}</span>
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
</style>
