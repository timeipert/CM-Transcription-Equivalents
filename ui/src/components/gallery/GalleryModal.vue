<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAnnotationsStore } from '../../stores/annotations';
import { useImageManifest } from '../../composables/useImageManifest';
import AnnotationCutout from '../AnnotationCutout.vue';
import FolioAnnotator from '../FolioAnnotator.vue';

const props = defineProps({
    pattern: { type: String, required: true },
    sourceData: { type: Object, required: true }, // raw data for this source
    sourceName: { type: String, required: true }, 
    visible: { type: Boolean, default: false }
});

const emit = defineEmits(['close']);

const annotStore = useAnnotationsStore();
const { hasImage, getImageUrl, getStandardSource, loaded: manifestLoaded } = useImageManifest();

const currentGalleryItems = computed(() => {
    if (!props.sourceData || !props.sourceData[props.pattern]) return [];
    
    // occurrences: [[doc, fol], ...]
    const occurrences = props.sourceData[props.pattern];
    
    // Deduplicate by physical page identity { stdSource, folio }
    const uniquePhysicalPages = new Set();
    const physicalPages = [];

    occurrences.forEach(o => {
        const d = o[0];
        const f = o[1];
        const std = getStandardSource(d, f);
        const key = `${std}_${f}`;
        if (!uniquePhysicalPages.has(key)) {
            uniquePhysicalPages.add(key);
            physicalPages.push({ std, f });
        }
    });
    
    const list = [];
    for (const { std, f } of physicalPages) {
        const anns = annotStore.getAnnotations(std, f, props.pattern);
        for (const a of anns) {
             list.push({
                 id: a.id,
                 source: std,
                 folio: f,
                 points: a.points
             });
        }
    }
    return list;
});

const availablePages = computed(() => {
    if (!props.sourceData || !props.sourceData[props.pattern]) return [];
     const occurrences = props.sourceData[props.pattern];
     
     // Deduplicate by Standardized Identity: { standardSource, folio }
     const uniquePages = new Map();
     
     occurrences.forEach(o => {
         const d = o[0];
         const f = o[1];
         if (hasImage(d, f)) {
             const std = getStandardSource(d, f);
             const key = `${std}_${f}`;
             if (!uniquePages.has(key)) {
                 uniquePages.set(key, { d, f, label: String(f) });
             }
         }
     });
     
     return Array.from(uniquePages.values()).sort((a,b) => a.label.localeCompare(b.label));
});

// Helper for UI
const activeFolioLabel = ref("");

const activeFolio = ref(null); // { d, f }
const activeImage = ref("");
const showAnnotator = ref(false); // Move declaration here or check top

function startAnnotating(pageObj) {
     activeFolio.value = { d: pageObj.d, f: pageObj.f };
     activeImage.value = getImageUrl(pageObj.d, pageObj.f);
     activeFolioLabel.value = pageObj.label;
     showAnnotator.value = true;
}

function saveAnnotation(points) {
    if (!props.pattern || !activeFolio.value) return;
    const { d, f } = activeFolio.value;
    const std = getStandardSource(d, f);
    annotStore.addAnnotation(std, f, props.pattern, points);
    showAnnotator.value = false;
}

function removeAnnot(id, source, folio) {
    if (confirm("Delete annotation?")) {
        const std = getStandardSource(source, folio);
        annotStore.removeAnnotation(std, folio, props.pattern, id);
    }
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
                    <div class="cutouts-grid">
                        <div v-for="item in currentGalleryItems" :key="item.id" class="cutout-container">
                            <AnnotationCutout 
                                :source="item.source" :folio="item.folio" :points="item.points"
                            />
                             <button @click="removeAnnot(item.id, item.source, item.folio)" class="btn-del" title="Delete">&times;</button>
                        </div>
                    </div>
                    <div v-if="currentGalleryItems.length===0" class="no-cutouts">
                        <span>No annotations yet for this pattern.</span>
                    </div>
                </div>
                
                <div class="gallery-footer">
                     <h4>Available for annotation</h4>
                     
                     <div v-if="!manifestLoaded" class="loading">Loading image list...</div>
                     <div v-else-if="availablePages.length===0" class="warn">
                         No images found for this pattern in '{{sourceName}}'.
                     </div>
                     <div v-else class="page-chips">
                         <button 
                            v-for="p in availablePages" 
                            :key="p.label" 
                            class="chip" 
                            @click="startAnnotating(p)"
                         >
                             {{ p.label }}
                         </button>
                     </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Nested Annotator Modal -->
    <div v-if="showAnnotator" class="modal" style="z-index: 1100;">
        <div class="modal-content annot-modal">
            <div class="modal-header">
                <h3>Annotate: {{ pattern }} ({{ activeFolioLabel }})</h3>
                <button class="close-btn" @click="showAnnotator=false">&times;</button>
            </div>
            <div class="modal-body-annot">
                <FolioAnnotator 
                    :imageUrl="activeImage" 
                    @save="saveAnnotation" 
                />
            </div>
        </div>
    </div>
</template>

<style scoped>
.modal { 
    position: fixed; top:0; left:0; width:100%; height:100%; 
    background: rgba(15, 23, 42, 0.7); 
    backdrop-filter: blur(4px);
    display:flex; justify-content:center; align-items:center; z-index:1000; 
}

.gallery-modal { 
    width: 860px; max-width: 95vw; height: 80vh; 
    background: white; display: flex; flex-direction: column; 
    border-radius: 12px; overflow: hidden; 
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
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

.gallery-footer { 
    background: white; border-top: 1px solid #f1f5f9; padding: 20px 24px; 
}
.gallery-footer h4 { margin: 0 0 12px 0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; }

.page-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { 
    padding: 6px 14px; background: #fff; border: 1px solid #e2e8f0; 
    border-radius: 20px; cursor: pointer; font-size: 0.85rem; font-weight: 500;
    transition: all 0.2s; color: #334155;
    display: flex; align-items: center; gap: 4px;
}
.chip:hover { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; }
.chip::before { content: "+"; opacity: 0.5; }

.no-cutouts { 
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 60px 0; color: #94a3b8; font-style: italic; font-size: 0.95rem;
}
.warn { color: #f59e0b; font-size: 0.85rem; padding: 8px 12px; background: #fffbeb; border-radius: 6px; border: 1px solid #fef3c7; }
.loading { color: #64748b; font-size: 0.9rem; }

/* Nested Annotator Styles */
.annot-modal { width: 95vw; height: 95vh; background:white; display:flex; flex-direction:column; border-radius:12px; overflow:hidden; }
.modal-body-annot { flex:1; overflow:hidden; position: relative; }
</style>
