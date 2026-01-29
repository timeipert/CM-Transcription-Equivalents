<script setup>
import { ref, watch, computed } from 'vue';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { useImageManifest } from '../../composables/useImageManifest';

const props = defineProps(['selectedSource', 'selectedFolio']);
const emits = defineEmits(['select']);

const { sourceFolios, loading: dataLoading } = useTranscriptionData();
const { manifest, hasImage, loaded: manifestLoaded, getManifestStructure } = useImageManifest();

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
        const foliosFromString = new Set();
        
        // Add from Data
        if (dataStruct[src]) {
            for (const f of dataStruct[src]) foliosFromString.add(f);
        }
        
        // Add from Manifest
        if (manifestStruct[src]) {
            for (const f of manifestStruct[src]) foliosFromString.add(f);
        }
        
        // Filter: Only keep folios that exist in Manifest (or satisfy hasImage)
        // Actually, manifestStruct already implies hasImage is true.
        // But dataStruct might have folios without images.
        // We generally only want to show folios that HAVE images in this view (Polygon Manager).
        
        const validFolios = [];
        for (const fol of foliosFromString) {
            if (hasImage(src, fol)) {
                validFolios.push(fol);
            }
        }
        
        if (validFolios.length > 0) {
            t[src] = validFolios.sort(); // alpha sort
        }
    }
    return t;
});

function onSelect(src, fol) {
    emits('select', { source: src, folio: fol });
}
</script>

<template>
<div class="sidebar">
    <h3>Manuscripts</h3>
    <div v-if="dataLoading">Loading Data...</div>
    <div v-else-if="Object.keys(tree).length === 0">
        <div style="padding:10px; color:#888;">
            No manuscripts with images found.
        </div>
    </div>
    <div class="tree" v-else>
        <div v-for="(folios, src) in tree" :key="src" class="tree-node">
            <div class="src-label">{{ src }}</div>
            <div class="folio-list">
                <div v-for="fol in folios" :key="fol" 
                     class="folio-item" 
                     :class="{active: selectedSource===src && selectedFolio===fol}"
                     @click="onSelect(src, fol)">
                    {{ fol }}
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.sidebar { width: 250px; border-right: 1px solid #ddd; background: #f9f9f9; display: flex; flex-direction: column; height: 100%; }
.sidebar h3 { padding: 15px; margin: 0; border-bottom: 1px solid #eee; background: white; }
.tree { flex: 1; overflow-y: auto; padding: 10px; }
.src-label { font-weight: bold; margin-top: 10px; color: #555; position: sticky; top:0; background:#f9f9f9; }
.folio-item { padding: 4px 10px; cursor: pointer; border-radius: 4px; font-family: monospace; font-size: 0.9em; margin-bottom: 1px; }
.folio-item:hover { background: #eee; }
.folio-item.active { background: #007bff; color: white; }
</style>
