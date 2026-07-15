<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import AnnotationCutout from './AnnotationCutout.vue';
import PatternDisplay from './PatternDisplay.vue';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useSettingsStore } from '../stores/settings';
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
const tableStore = usePersonalTablesStore();
const settings = useSettingsStore();
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

// Full variant ID logic
const fullDisplayId = computed(() => {
    const ann = liveAnnotation.value;
    if (!ann) return '?';
    
    // 1. Resolve Base Ref ID
    const basePat = ann.pattern.split(' ')[0];
    const table = tableStore.tables.find(t => t.source === ann.source);
    const localId = table?.rows.find(r => r.pattern === basePat)?.customId;
    const globalId = settings.getGlobalId(basePat);
    const refId = localId || globalId || ann.linkData?.sysId?.split('|')[0] || String(ann.id).substring(0,4);
    
    // 2. Resolve Variant
    let variant = ann.variant || '';
    const trans = ann.linkData?.transcription || '';
    if (!variant && trans && trans.length > basePat.length && trans.startsWith(basePat)) {
        variant = trans.substring(basePat.length).trim();
    }
    if (!variant && ann.pattern.includes(' ')) {
        variant = ann.pattern.split(' ')[1];
    }
    
    return variant ? `${refId}${variant}` : refId;
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
                   <span class="ref-id-badge">{{ fullDisplayId }}</span>
                   <span class="pattern-text">{{ annotation.pattern }}</span>
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
    padding: 16px 20px; border-bottom: 1px solid var(--color-surface-muted);
    display: flex; justify-content: space-between; align-items: center;
    flex-shrink: 0;
}
.card-header h3 { margin: 0; font-size: 1.1rem; color: var(--color-text); }

.close-btn {
    background: transparent; border: none; font-size: 1.5rem; color: var(--color-text-muted); cursor: pointer;
}

.card-body { 
    padding: 0; 
    overflow-y: auto; 
    flex: 1; /* Take remaining space */
}

.visual-section {
    background: var(--color-text); padding: 20px;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.cutout-wrapper {
    border: 2px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3); background: var(--color-text);
}
.pattern-badge {
    background: rgba(255,255,255,0.1); color: white;
    padding: 6px 16px; border-radius: 20px;
    display: flex; align-items: center; gap: 12px; font-size: 0.95rem;
}
.ref-id-badge { font-family: monospace; font-weight: 800; color: var(--color-primary); }
.pattern-text { font-family: monospace; opacity: 0.8; font-size: 0.8rem; }

.info-section { padding: 20px; color: var(--color-text); }

.info-group { margin-bottom: 12px; }
.info-group label { 
    display: flex; justify-content: space-between; align-items: center;
    font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; 
    color: var(--color-text-muted); font-weight: 600; margin-bottom: 4px; 
}
.val { font-size: 1rem; font-weight: 500; }
.val-grid { 
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px; 
    background: var(--color-bg); padding: 10px; border-radius: 6px; border: 1px solid var(--color-border);
}
.notes { grid-column: span 2; font-family: monospace; color: var(--color-text); }

.badge-link { background: var(--color-primary-light); color: var(--color-primary-hover); padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; }
.text-muted { color: var(--color-text-light); font-style: italic; font-size: 0.9rem; }
.divider { border: 0; border-top: 1px solid var(--color-surface-muted); margin: 16px 0; }

.actions-section {
    padding: 20px; background: var(--color-bg); border-top: 1px solid var(--color-border);
    display: flex; flex-direction: column; gap: 10px;
}

.btn-action {
    width: 100%; padding: 10px; border-radius: 6px; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: all 0.2s; border: 1px solid transparent;
}
.primary { background: var(--color-primary); color: white; }
.primary:hover { background: var(--color-primary-hover); }

.secondary { background: white; border-color: var(--color-border-hover); color: var(--color-text); }
.secondary:hover { border-color: var(--color-text-light); color: var(--color-text); }

.variant-select {
    width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--color-border);
    font-size: 1rem; background: var(--color-surface);
}

</style>
