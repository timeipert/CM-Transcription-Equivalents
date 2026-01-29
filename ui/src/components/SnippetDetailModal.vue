<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import AnnotationCutout from './AnnotationCutout.vue';
import PatternDisplay from './PatternDisplay.vue';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { useAnnotationsStore } from '../stores/annotations';
import { useImageManifest } from '../composables/useImageManifest';

const props = defineProps({
    visible: Boolean,
    annotation: Object, // { id, source, folio, pattern, points, linkData: { sysId } }
});

const emit = defineEmits(['close']);
const router = useRouter();
const route = useRoute();
const { glyphs } = useTranscriptionData();
const annotStore = useAnnotationsStore();
const { getStandardSource } = useImageManifest();

// Reactive check against store to ensure latest link status
const liveAnnotation = computed(() => {
    if (!props.annotation) return null;
    const { source, folio, pattern, id } = props.annotation;
    
    const std = getStandardSource(source, folio);
    const anns = annotStore.getAnnotations(std, folio, pattern);
    const found = anns.find(a => a.id === id) || props.annotation;
    
    return found;
});

// Parse System ID if available: "doc|fol|line|syl|notes"
const textData = computed(() => {
    const sysId = liveAnnotation.value?.linkData?.sysId;
    if (!sysId) return null;
    const parts = sysId.split('|');
    if (parts.length < 5) return null;
    return {
        doc: parts[0],
        line: parts[2],
        syl: parts[3],
        notes: parts[4]
    };
});

function updateVariant(val) {
    if (!props.annotation) return;
    const { source, folio, pattern, id } = props.annotation;
    const std = getStandardSource(source, folio);
    
    annotStore.updateAnnotation(std, folio, pattern, id, { variant: val });
}

function goToGlobalTable() {
    if (!props.annotation) return;
    const { source, pattern } = props.annotation;
    // Navigate to Global View and try to open details
    router.push({
        name: 'home',
        query: { 
            openSource: source, 
            openPattern: pattern,
            highlightId: props.annotation.linkData?.sysId
        }
    });
}

function goToEditor() {
    if (!props.annotation) return;
    const { source, folio } = props.annotation;
    
    if (route.name === 'polygons' && route.query.source === source && route.query.folio === folio) {
        emit('close');
        return;
    }
    
    router.push({
        name: 'polygons',
        query: { source, folio }
    });
}
</script>

<template>
<div v-if="visible && annotation" class="modal-overlay" @click.self="$emit('close')">
    <div class="snippet-card">
        <div class="card-header">
            <h3>Snippet Detail</h3>
            <button class="close-btn" @click="$emit('close')">&times;</button>
        </div>
        
        <div class="card-body">
            <!-- Visuals -->
            <div class="visual-section">
                <div class="cutout-wrapper">
                    <AnnotationCutout 
                        :source="annotation.source" 
                        :folio="annotation.folio" 
                        :points="annotation.points"
                        :width="300" :height="180" 
                    />
                </div>
                <div class="pattern-badge">
                   <PatternDisplay :pattern="annotation.pattern" :glyphs="glyphs" />
                   <span>{{ annotation.pattern }}</span>
                </div>
            </div>

            <!-- Metadata -->
            <div class="info-section">
                <div class="info-group">
                    <label>Manuscript</label>
                    <div class="val">{{ annotation.source }}</div>
                </div>
                <div class="info-group">
                    <label>Folio</label>
                    <div class="val">{{ annotation.folio }}</div>
                </div>

                <div class="info-group">
                    <label>Classification</label>
                    <select :value="liveAnnotation?.variant || ''" @change="e => updateVariant(e.target.value)" class="variant-select">
                        <option value="">(None)</option>
                        <option v-for="l in 'abcdefghijklmnopqrstuvwxyz'.split('')" :key="l" :value="l">{{ l }}</option>
                    </select>
                </div>
                
                <hr class="divider"/>
                
                <div class="info-group" v-if="textData">
                    <label>Corpus Link <span class="badge-link">Linked</span></label>
                    <div class="val-grid">
                        <span>Line: <b>{{ textData.line }}</b></span>
                        <span>Syllable: <b>{{ textData.syl }}</b></span>
                        <span class="notes">Notes: {{ textData.notes }}</span>
                    </div>
                </div>
                <div class="info-group empty-link" v-else>
                    <label>Corpus Link</label>
                    <div class="text-muted">Not linked to text data.</div>
                </div>
            </div>
            
            <!-- Actions -->
            <div class="actions-section">
                <button @click="goToGlobalTable" class="btn-action primary">
                    📊 View in Global Table
                </button>
                <button @click="goToEditor" class="btn-action secondary">
                    ✏️ Edit Context
                </button>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.6); backdrop-filter: blur(2px);
    z-index: 2000; display: flex; align-items: center; justify-content: center;
}

.snippet-card {
    background: white; width: 400px; max-width: 90vw; max-height: 90vh;
    border-radius: 12px; overflow: hidden;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    display: flex; flex-direction: column;
}

.card-header {
    padding: 16px 20px; border-bottom: 1px solid #f1f5f9;
    display: flex; justify-content: space-between; align-items: center;
    flex-shrink: 0;
}
.card-header h3 { margin: 0; font-size: 1.1rem; color: #1e293b; }

.close-btn {
    background: transparent; border: none; font-size: 1.5rem; color: #64748b; cursor: pointer;
}

.card-body { 
    padding: 0; 
    overflow-y: auto; 
    flex: 1; /* Take remaining space */
}

.visual-section {
    background: #0f172a; padding: 20px;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.cutout-wrapper {
    border: 2px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3); background: #000;
}
.pattern-badge {
    background: rgba(255,255,255,0.1); color: white;
    padding: 4px 12px; border-radius: 20px;
    display: flex; align-items: center; gap: 8px; font-size: 0.9rem;
    font-family: monospace;
}

.info-section { padding: 20px; color: #334155; }

.info-group { margin-bottom: 12px; }
.info-group label { 
    display: flex; justify-content: space-between; align-items: center;
    font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; 
    color: #64748b; font-weight: 600; margin-bottom: 4px; 
}
.val { font-size: 1rem; font-weight: 500; }
.val-grid { 
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px; 
    background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;
}
.notes { grid-column: span 2; font-family: monospace; color: #0f172a; }

.badge-link { background: #dbeafe; color: #2563eb; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; }
.text-muted { color: #94a3b8; font-style: italic; font-size: 0.9rem; }
.divider { border: 0; border-top: 1px solid #f1f5f9; margin: 16px 0; }

.actions-section {
    padding: 20px; background: #f8fafc; border-top: 1px solid #e2e8f0;
    display: flex; flex-direction: column; gap: 10px;
}

.btn-action {
    width: 100%; padding: 10px; border-radius: 6px; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: all 0.2s; border: 1px solid transparent;
}
.primary { background: #3b82f6; color: white; }
.primary:hover { background: #2563eb; }

.secondary { background: white; border-color: #cbd5e1; color: #475569; }
.secondary:hover { border-color: #94a3b8; color: #1e293b; }

.variant-select {
    width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;
    font-size: 1rem; background: #fff;
}

</style>
