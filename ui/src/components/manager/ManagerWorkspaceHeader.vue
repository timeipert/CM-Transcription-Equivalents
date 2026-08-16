<script setup>
import { ref } from 'vue';
import PatternDisplay from '../PatternDisplay.vue';

const props = defineProps([
    'source', 'folio', 'activeRegion', 'highlightHint', 
    'allLinesOnPage', 'manualLines', 'regions', 'activeRegionItems', 
    'returnTo', 'returnId', 'glyphs', 'highlightPattern'
]);

const emit = defineEmits(['backToGallery', 'backToRegions', 'editRegion', 'addManualLine', 'removeManualLine']);

const isAddingLine = ref(false);
const newLineNum = ref('');

function submitLine() {
    const num = parseInt(newLineNum.value);
    if (!isNaN(num)) {
        emit('addManualLine', num);
    }
    isAddingLine.value = false;
    newLineNum.value = '';
}
</script>

<template>
<div class="header">
    <div class="left">
        <button v-if="returnTo === 'annotations'" 
                @click="$emit('backToGallery')" 
                class="btn-secondary mr-10">&larr; Back to Gallery</button>
        <button v-if="activeRegion" @click="$emit('backToRegions')" class="btn-secondary">&larr; Back to Line Regions</button>
        <button v-if="activeRegion && !activeRegion.isLegacy" @click="$emit('editRegion', activeRegion)" class="btn-secondary" title="Edit line boundaries and name">✎ Edit Line</button>
        <h2>
            {{ source }} / {{ folio }} 
            <span v-if="activeRegion" class="crumb"> / {{ activeRegion.name }}</span>
        </h2>
        <div v-if="highlightHint" class="highlight-hint-detailed">
            <div class="hint-title">
                Searching: <PatternDisplay :pattern="highlightHint.pattern" :glyphs="glyphs" class="hint-visual" /> <strong>{{ highlightHint.pattern }}</strong>
            </div>
            <div class="hint-occ-list">
                <div v-for="(occ, idx) in highlightHint.occurrences" :key="idx" class="hint-occ">
                    <span class="h-line">L{{ occ[2] }}</span>
                    <span class="h-syl">"{{ occ[3] }}"</span>
                    <span class="h-notes">{{ occ[4] }}</span>
                </div>
            </div>
        </div>
        <div v-else-if="allLinesOnPage.length > 0 && !activeRegion" class="general-hint-bubble">
            Data available for lines: 
            <strong>
                <template v-for="(l, i) in allLinesOnPage" :key="l">
                    <span :class="{ 'manual-line': manualLines && manualLines.includes(l) }">
                        {{ l }}
                        <span v-if="manualLines && manualLines.includes(l)" class="manual-badge">M</span>
                        <button v-if="manualLines && manualLines.includes(l)" @click="emit('removeManualLine', l)" class="btn-remove-manual">&times;</button>
                    </span><span v-if="i < allLinesOnPage.length - 1">, </span>
                </template>
            </strong>
            <button v-if="!isAddingLine" @click="isAddingLine = true" class="btn-add-line">+ Add Line</button>
            <div v-else class="add-line-form">
                <input v-model="newLineNum" type="number" placeholder="#" @keyup.enter="submitLine" class="add-line-input" autofocus />
                <button @click="submitLine" class="btn-submit-line">OK</button>
                <button @click="isAddingLine = false" class="btn-cancel-line">&times;</button>
            </div>
        </div>
    </div>
    <div class="stats">
        <span v-if="!activeRegion">{{ regions.length }} Line Regions</span>
        <span v-else>{{ activeRegionItems.length }} Items</span>
    </div>
</div>
</template>

<style scoped>
.header { padding: 15px 20px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; background: white; }
.left { display: flex; align-items: center; gap: 15px; }
.crumb { color: var(--color-text-light); font-weight: 400; }
.mr-10 { margin-right: 10px; }

.highlight-hint-detailed {
    margin-left: 0; background: var(--color-warning-light); border: 1px solid var(--color-warning-light); 
    padding: 4px 10px; border-radius: 6px; font-size: 11px; color: var(--color-warning-dark);
    display: flex; flex-direction: column; gap: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    max-height: 100px; overflow-y: auto; width: 100%; box-sizing: border-box;
}
.hint-title { display: flex; gap: 8px; align-items: center; font-weight: 500; font-size: 12px; }
.hint-title strong { color: var(--color-warning-dark); }
.hint-occ-list { display: flex; flex-wrap: wrap; gap: 4px; }
.hint-occ { display: flex; gap: 4px; align-items: center; background: rgba(255,255,255,0.7); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(251,191,36,0.3); font-size: 11px; }
.h-line { font-weight: 700; color: var(--color-warning-dark); }
.h-syl { font-style: italic; color: var(--color-warning-dark); }
.h-notes { font-family: monospace; font-size: 10px; color: var(--color-warning); background: rgba(255,255,255,0.9); padding: 1px 3px; border-radius: 4px; }
.hint-visual { 
    height: 32px; 
    width: auto;
    display: inline-block; 
    vertical-align: middle; 
    background: white; 
    border-radius: 6px; 
    padding: 2px 8px;
    margin: 0;
    border: 1px solid var(--color-warning-light);
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
}

.general-hint-bubble {
    margin-left: 20px; background: var(--color-surface-muted); border: 1px solid var(--color-border); 
    padding: 6px 14px; border-radius: 20px; font-size: 13px; color: var(--color-text);
    display: flex; gap: 10px; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.manual-line {
    border-bottom: 1px dotted var(--color-primary);
    position: relative;
    padding-right: 2px;
}
.manual-badge {
    font-size: 8px;
    vertical-align: super;
    color: var(--color-primary);
    margin-left: 1px;
}
.btn-add-line {
    background: white; border: 1px solid var(--color-border); border-radius: 12px;
    font-size: 11px; padding: 2px 8px; cursor: pointer; color: var(--color-text-light);
}
.btn-add-line:hover { background: var(--color-surface-muted); color: var(--color-text); }

.add-line-form {
    display: flex; gap: 4px; align-items: center;
}
.add-line-input {
    width: 40px; font-size: 12px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px;
}
.btn-submit-line {
    background: var(--color-primary); color: white; border: none; border-radius: 4px; font-size: 11px; padding: 3px 6px; cursor: pointer;
}
.btn-cancel-line {
    background: transparent; border: none; font-size: 14px; cursor: pointer; color: var(--color-text-light);
}

.btn-remove-manual {
    background: transparent; border: none; font-size: 12px; cursor: pointer; color: var(--color-error); padding: 0 2px;
    vertical-align: top; line-height: 1; margin-left: 1px; opacity: 0.6;
}
.btn-remove-manual:hover { opacity: 1; }
</style>
