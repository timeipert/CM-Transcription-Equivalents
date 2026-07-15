<script setup>
import { ref, watch, computed, reactive } from 'vue';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { useImageManifest, compareFolios } from '../../composables/useImageManifest';
import { useIiifStore } from '../../stores/iiif';

const props = defineProps(['selectedSource', 'selectedFolio']);
const emits = defineEmits(['select']);

const iiifStore = useIiifStore();

const { sourceFolios, loading: dataLoading } = useTranscriptionData();
const { manifest, hasImage, loaded: manifestLoaded, getManifestStructure, getStandardFolio, hasTranscriptionData } = useImageManifest();

// Tree Structure
const tree = computed(() => {
    // We need at least one source of truth loaded.
    // Ideally both, but if only manifest is loaded, we can show images without data.
    if (!manifestLoaded.value) return {};
    
    // 1. Get structure from Manifest
    const manifestStruct = getManifestStructure();
    
    // 2. Get structure from Data (if loaded)
    const dataStruct = sourceFolios.value || {};
    
    // 3. Merge
    const t = {};
    const allSources = new Set([
        ...Object.keys(manifestStruct),
        ...Object.keys(dataStruct)
    ]);
    
    const sortedSources = Array.from(allSources).sort();
    
    for (const src of sortedSources) {
        const validFoliosSet = new Set();
        
        // Add from Manifest
        if (manifestStruct[src]) {
            for (const f of manifestStruct[src]) {
                validFoliosSet.add(getStandardFolio(src, f));
            }
        }
        
        // Add from Data (mapped to standard folio)
        if (dataStruct[src]) {
            for (const f of dataStruct[src]) {
                const stdFol = getStandardFolio(src, f);
                if (hasImage(src, stdFol)) {
                    validFoliosSet.add(stdFol);
                }
            }
        }
        
        const validFolios = Array.from(validFoliosSet);
        
        if (validFolios.length > 0) {
            const orderMap = {};
            if (iiifStore.parsedData[src]) {
                iiifStore.parsedData[src].forEach((item, idx) => {
                    orderMap[item.folio] = idx;
                });
            }

            t[src] = validFolios.sort((a, b) => {
                // 1. IIIF Order
                if (iiifStore.parsedData[src]) {
                    const idxA = orderMap[a] ?? 9999;
                    const idxB = orderMap[b] ?? 9999;
                    if (idxA !== idxB) return idxA - idxB;
                }
                
                // 2. Fallback Natural Sort
                return compareFolios(a, b);
            });
        }
    }
    return t;
});

const folioSearch = reactive({});

function onSelect(src, fol) {
    emits('select', { source: src, folio: fol });
}

// Accordion State
const expandedSources = reactive(new Set());
function toggleSource(src) {
    if (expandedSources.has(src)) expandedSources.delete(src);
    else {
        expandedSources.add(src);
        // Lazy-load IIIF manifest when expanding
        if (iiifStore.links[src] && !iiifStore.parsedData[src]) {
            iiifStore.ensureLoaded(src);
        }
    }
}

// Auto-expand the source if it's selected initially
watch(() => props.selectedSource, (newSrc) => {
    if (newSrc && !expandedSources.has(newSrc)) {
        expandedSources.add(newSrc);
    }
}, { immediate: true });

// IIIF Modal State
const showIiifModal = ref(false);
const iiifSource = ref('');
const iiifUrl = ref('');
const isSubmittingIiif = ref(false);

async function submitIiif() {
    if (!iiifSource.value || !iiifUrl.value) return;
    isSubmittingIiif.value = true;
    try {
        await iiifStore.addManifest(iiifSource.value, iiifUrl.value);
        showIiifModal.value = false;
        iiifSource.value = '';
        iiifUrl.value = '';
    } catch (e) {
        alert("Error loading IIIF Manifest: " + e.message);
    } finally {
        isSubmittingIiif.value = false;
    }
}
</script>

<template>
<div class="sidebar">
    <div class="sidebar-header">
        <h3>Manuscripts</h3>
        <button class="btn-xs iiif-btn" @click="showIiifModal = true" title="Add IIIF Source">+ IIIF</button>
    </div>
    
    <div v-if="dataLoading">Loading Data...</div>
    <div v-else-if="Object.keys(tree).length === 0">
        <div style="padding:10px; color:#888;">
            No manuscripts with images found.
        </div>
    </div>
    <div class="tree" v-else>
        <div v-for="(folios, src) in tree" :key="src" class="tree-node">
            <div class="src-label-container">
                <div class="src-label" @click="toggleSource(src)">
                    <span class="chevron">{{ expandedSources.has(src) ? '▼' : '▶' }}</span>
                    {{ src }}
                    <span v-if="iiifStore.manifestStatus[src]?.status === 'loading'" class="manifest-status loading" title="Loading Manifest...">↻</span>
                    <span v-else-if="iiifStore.manifestStatus[src]?.status === 'error'" class="manifest-status error" :title="iiifStore.manifestStatus[src]?.error">⚠️</span>
                </div>
                <button v-if="iiifStore.manifestStatus[src]?.status === 'error'" class="btn-xs retry-btn" @click.stop="iiifStore.ensureLoaded(src)" title="Retry loading IIIF Manifest">Retry</button>
            </div>
            <div class="folio-list" v-show="expandedSources.has(src)">
                <input v-if="folios.length > 10" 
                       v-model="folioSearch[src]" 
                       placeholder="Search folio..." 
                       class="folio-search" 
                       @click.stop />
                <div v-for="fol in folios.filter(f => !folioSearch[src] || f.toLowerCase().includes(folioSearch[src].toLowerCase()))" :key="fol" 
                     class="folio-item" 
                     :class="{active: selectedSource===src && selectedFolio===fol, 'has-data': hasTranscriptionData(src, fol)}"
                     :title="hasTranscriptionData(src, fol) ? 'This page contains Monodi transcription data' : ''"
                     @click="onSelect(src, fol)">
                    <span v-if="hasTranscriptionData(src, fol)" class="data-indicator">•</span>
                    {{ fol }}
                </div>
            </div>
        </div>
    </div>

    <!-- IIIF Modal -->
    <div v-if="showIiifModal" class="modal">
        <div class="modal-content iiif-modal">
            <div class="modal-header">
                <h3>Add IIIF Source</h3>
                <span class="close" @click="showIiifModal=false">&times;</span>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Source Name</label>
                    <input v-model="iiifSource" list="source-options" placeholder="Select or type..." />
                    <datalist id="source-options">
                        <option v-for="src in Object.keys(sourceFolios || {})" :key="src" :value="src"></option>
                    </datalist>
                </div>
                <div class="form-group">
                    <label>Manifest URL</label>
                    <input v-model="iiifUrl" placeholder="https://.../manifest" />
                </div>
                <div style="margin-top: 15px; display: flex; justify-content: flex-end;">
                    <button class="btn-primary" @click="submitIiif" :disabled="isSubmittingIiif">
                        {{ isSubmittingIiif ? 'Loading...' : 'Add Source' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.sidebar { width: 250px; border-right: 1px solid #ddd; background: #f9f9f9; display: flex; flex-direction: column; height: 100%; }
.sidebar-header { display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee; background: white; }
.sidebar-header h3 { margin: 0; }
.iiif-btn { background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold; }
.iiif-btn:hover { background: #c7d2fe; }
.tree { flex: 1; overflow-y: auto; padding: 10px; }
.src-label-container { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-right: 4px; background: #f9f9f9; position: sticky; top:0; z-index: 10; border-radius: 4px; }
.src-label-container:hover { background: #eee; }
.src-label { font-weight: bold; color: #555; cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 4px; flex: 1; }
.manifest-status.loading { display: inline-block; animation: spin 1s linear infinite; color: #888; font-size: 0.8em; }
.manifest-status.error { color: #dc2626; cursor: help; font-size: 0.9em; }
@keyframes spin { 100% { transform: rotate(360deg); } }
.retry-btn { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 0.7em; }
.retry-btn:hover { background: #fecaca; }
.chevron { font-size: 0.8em; color: #888; }
.folio-list { padding-left: 15px; padding-bottom: 5px; }
.folio-search { width: 90%; margin: 4px 0 8px 4px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 0.85em; }
.folio-item { padding: 4px 10px; cursor: pointer; border-radius: 4px; font-family: monospace; font-size: 0.9em; margin-bottom: 1px; display: flex; align-items: center; gap: 6px; }
.folio-item:hover { background: #eee; }
.folio-item.active { background: #007bff; color: white; }
.folio-item.has-data { font-weight: 600; color: #1e293b; }
.folio-item.active.has-data { color: white; }
.data-indicator { color: #f59e0b; font-size: 1.2em; line-height: 0.5; }

/* Modals */
.modal { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; justify-content:center; align-items:center; z-index:1000; }
.iiif-modal { width: 400px; background: white; border-radius: 8px; overflow: hidden; }
.modal-header { padding: 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { margin: 0; }
.close { font-size: 24px; cursor: pointer; color: #888; }
.close:hover { color: #000; }
.modal-body { padding: 20px; }
.form-group { margin-bottom: 15px; }
.form-group label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 0.9em; color: #555; }
.form-group input { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
.btn-primary { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-primary:hover:not(:disabled) { background: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
