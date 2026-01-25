<script setup>
import { ref, computed } from 'vue';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { useAnnotationsStore } from '../../stores/annotations';
import { useImageManifest } from '../../composables/useImageManifest';
import PatternDisplay from '../PatternDisplay.vue';
import AnnotationCutout from '../AnnotationCutout.vue';
import FolioAnnotator from '../FolioAnnotator.vue';

const props = defineProps(['source', 'folio']);
const annotStore = useAnnotationsStore();
const { pagePatternsIndex, glyphs } = useTranscriptionData();
const { getImageUrl, getStandardSource } = useImageManifest();

// --- Computed Data for Page ---
const stdSource = computed(() => getStandardSource(props.source, props.folio));

const pagePatterns = computed(() => {
    if (!props.source || !props.folio || !pagePatternsIndex.value) return [];
    return pagePatternsIndex.value[props.source]?.[props.folio] || [];
});

const pageAnnotations = computed(() => {
    if (!stdSource.value || !props.folio) return [];
    
    const list = [];
    for (const pat of pagePatterns.value) {
        const anns = annotStore.getAnnotations(stdSource.value, props.folio, pat);
        if (anns && anns.length > 0) {
            list.push({ pattern: pat, items: anns });
        }
    }
    return list;
});

// --- Annotator State ---
const showAnnotator = ref(false);
const activePattern = ref("");

function openAdd(pattern) {
    activePattern.value = pattern;
    showAnnotator.value = true;
}

function saveAnnotation(points) {
    if (!stdSource.value) return;
    annotStore.addAnnotation(stdSource.value, props.folio, activePattern.value, points);
    showAnnotator.value = false;
}

function removeAnnot(pattern, id) {
    if (confirm("Delete annotation?")) {
        annotStore.removeAnnotation(stdSource.value, props.folio, pattern, id);
    }
}
</script>

<template>
<div class="workspace-container">
    <div v-if="!source" class="empty-state">Select a Folio from the sidebar.</div>
    <div v-else class="content-wrapper">
        <div class="header">
            <h2>{{ source }} / {{ folio }}</h2>
            <div class="stats">{{ pageAnnotations.length }} annotated patterns</div>
        </div>
        
        <div class="panels">
             <!-- Pattern List -->
             <div class="pattern-panel">
                 <h4>Patterns on Page</h4>
                 <div v-for="pat in pagePatterns" :key="pat" class="pat-row">
                     <div class="pat-info">
                         <PatternDisplay :pattern="pat" :glyphs="glyphs" />
                         <span class="code">{{ pat }}</span>
                     </div>
                     <div class="pat-actions">
                         <button @click="openAdd(pat)" class="btn-sm">Add Region</button>
                     </div>
                 </div>
             </div>
             
             <!-- Existing Annotations -->
             <div class="annot-panel">
                 <h4>Existing Polygons</h4>
                 <div v-if="pageAnnotations.length === 0" class="no-annot">
                     No regions annotated yet. Select a pattern to add one.
                 </div>
                 <div v-for="group in pageAnnotations" :key="group.pattern" class="annot-group">
                     <div class="grp-header">
                        <h5>
                            <PatternDisplay :pattern="group.pattern" :glyphs="glyphs" />
                            {{ group.pattern }}
                        </h5>
                     </div>
                     <div class="grp-items">
                         <div v-for="a in group.items" :key="a.id" class="poly-item-vis">
                             <AnnotationCutout 
                                 :source="stdSource" 
                                 :folio="folio" 
                                 :points="a.points" 
                                 :width="120" :height="80"
                                 class="mini-cutout"
                             />
                             <button @click="removeAnnot(group.pattern, a.id)" class="btn-xs delete-x">x</button>
                         </div>
                     </div>
                 </div>
             </div>
        </div>
    </div>

    <!-- Modal -->
    <div v-if="showAnnotator" class="modal">
        <div class="modal-content annot-modal">
             <div class="modal-header">
                <h3>Annotate: {{ activePattern }}</h3>
                <span class="close" @click="showAnnotator=false">&times;</span>
            </div>
            <div class="modal-body-annot">
                <FolioAnnotator 
                    :imageUrl="getImageUrl(source, folio)" 
                    @save="saveAnnotation" 
                />
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.workspace-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; height: 100%; }
.empty-state { padding: 40px; color: #888; text-align: center; font-size: 1.2em; }
.content-wrapper { display: flex; flex-direction: column; height: 100%; }

.header { padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: white; }
.panels { flex: 1; display: flex; overflow: hidden; }

.pattern-panel { width: 320px; border-right: 1px solid #ddd; overflow-y: auto; padding: 15px; background: white; }
.annot-panel { flex: 1; overflow-y: auto; padding: 20px; background: #f4f4f4; }

.pat-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; }
.pat-info { display: flex; gap: 10px; align-items: center; flex: 1; min-width: 0; }
.code { color: #888; font-size: 0.85em; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.btn-sm { padding: 4px 8px; font-size: 0.85em; background: #fff; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; }
.btn-sm:hover { background: #f0f0f0; }

.annot-group { background: white; padding: 15px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #ddd; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.grp-header { margin-bottom: 10px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #f0f0f0; padding-bottom: 5px; }
.grp-items { display: flex; flex-wrap: wrap; gap: 15px; }

.poly-item-vis { position: relative; border: 1px solid #eee; border-radius: 4px; overflow: hidden; transition: transform 0.2s; }
.poly-item-vis:hover { transform: scale(1.02); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
.delete-x { position: absolute; top: 0; right: 0; background: red; color: white; border: none; width: 20px; height: 20px; cursor: pointer; opacity: 0; transition: opacity 0.2s; z-index: 10; }
.poly-item-vis:hover .delete-x { opacity: 1; }

/* Modal */
.modal { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; justify-content:center; align-items:center; z-index:1000; }
.annot-modal { width: 95vw; height: 95vh; background:white; display:flex; flex-direction:column; border-radius:8px; overflow:hidden; }
.modal-header { padding:15px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; }
.close { font-size:24px; cursor:pointer; }
.modal-body-annot { flex:1; overflow:hidden; position: relative; }
</style>
