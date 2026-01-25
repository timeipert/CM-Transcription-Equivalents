<script setup>
import { ref, watch, computed } from 'vue';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { useImageManifest } from '../../composables/useImageManifest';

const props = defineProps(['selectedSource', 'selectedFolio']);
const emits = defineEmits(['select']);

const { sourceFolios, loading: dataLoading } = useTranscriptionData();
const { manifest, hasImage, loaded: manifestLoaded } = useImageManifest();

// Tree Structure
const tree = computed(() => {
    if (!sourceFolios.value || !manifestLoaded.value) return {};
    
    const t = {};
    const sourceKeys = Object.keys(sourceFolios.value).sort();
    
    for (const src of sourceKeys) {
        const folios = sourceFolios.value[src]; // This is a Set
        const availableFolios = [];
        
        for (const fol of folios) {
            if (hasImage(src, fol)) {
                availableFolios.push(fol);
            }
        }
        
        if (availableFolios.length > 0) {
            t[src] = availableFolios.sort();
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
