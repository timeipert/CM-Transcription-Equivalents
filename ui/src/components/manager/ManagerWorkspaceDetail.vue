<script setup>
import FolioAnnotator from '../FolioAnnotator.vue';
import PatternDisplay from '../PatternDisplay.vue';

const props = defineProps([
    'source', 'folio', 'getImageUrl', 'activeRegionRect', 'activeRegionItems',
    'patternSort', 'activePattern', 'activeVariant', 'patternSearch',
    'pagePatterns', 'glyphs', 'patternCustomIdMap', 'otherPageAnnotations', 'getBasePattern'
]);

const emit = defineEmits([
    'onAnnotateItem', 'update:patternSort', 'setVariant', 
    'update:patternSearch', 'selectPatternBase', 'openSnippet', 'deleteItem'
]);
</script>

<template>
<div class="detail-split">
    <!-- Left: Canvas -->
    <div class="detail-canvas">
        <FolioAnnotator 
            :imageUrl="getImageUrl(source, folio)" 
            :cropRect="activeRegionRect"
            :overlays="activeRegionItems"
            @save="$emit('onAnnotateItem', $event)" 
        />
    </div>
    
    <!-- Right: Tools & List -->
    <div class="detail-sidebar">
        <div class="tool-section">
            <div class="flex-between-center">
                <h4>Select Pattern</h4>
                <select :value="patternSort" @change="$emit('update:patternSort', $event.target.value)" class="small-select">
                    <option value="freq">Frequency</option>
                    <option value="alpha">Alphabetical</option>
                    <option value="length">Length</option>
                </select>
            </div>
            
            <!-- Variant Controls -->
            <div class="variant-controls" v-if="activePattern">
                 <span class="active-label">{{ activePattern }} <span v-if="activeVariant" class="text-muted">{{ activeVariant }}</span></span>
                 <div class="letters">
                     <button class="btn-xs" :class="{active: !activeVariant}" @click="$emit('setVariant', '')">Base</button>
                     <button v-for="l in ['a','b','c','d','e','f','g']" :key="l"
                             class="btn-xs" 
                             :class="{active: activeVariant === l}"
                             @click="$emit('setVariant', l)">
                         {{ l }}
                     </button>
                 </div>
            </div>

            <div class="pattern-list-header">
                <input :value="patternSearch" @input="$emit('update:patternSearch', $event.target.value)" placeholder="Search patterns..." class="pattern-search" />
                <div v-if="pagePatterns.isFallback" class="fallback-badge">Manuscript-wide fallback</div>
            </div>

            <div class="pattern-list">
                <div v-for="pat in pagePatterns.list" :key="pat" 
                     class="pat-option" 
                     :class="{active: getBasePattern(activePattern) === pat}"
                     @click="$emit('selectPatternBase', pat)">
                     <PatternDisplay :pattern="pat" :glyphs="glyphs" />
                     <span class="pat-name-text">{{ pat }}</span>
                     <div v-if="patternCustomIdMap[pat]" class="in-table-badge" title="Present in Transcription Equivalent Table">
                         {{ patternCustomIdMap[pat] }}
                     </div>
                     <div v-if="otherPageAnnotations[pat] && otherPageAnnotations[pat].length > 0" 
                          class="other-annot-badge"
                          :title="otherPageAnnotations[pat].map(x => `${x.folio} ${x.line || ''} (${x.count}x)`).join('\n')">
                         {{ otherPageAnnotations[pat].reduce((sum, x) => sum + x.count, 0) }}
                     </div>
                </div>
            </div>
        </div>
        
        <div class="items-section">
            <h4>Items in Region</h4>
            <div class="items-list">
                <div v-for="item in activeRegionItems" :key="item.id" 
                     class="item-row"
                     @click="$emit('openSnippet', item)">
                    <span class="pat-tag">
                        <span class="d-id">{{ item.displayId }}</span>
                        <span class="p-name">{{ item.pattern }}</span>
                    </span>
                    <span v-if="item.linkData && item.linkData.sysId" class="link-icon">🔗</span>
                    <button @click.stop="$emit('deleteItem', item)" class="btn-xs delete-item">x</button>
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.detail-split { display: flex; height: 100%; }
.detail-canvas { flex: 1; border-right: 1px solid var(--color-border); background: var(--color-text); position: relative; }
.detail-sidebar { width: 350px; display: flex; flex-direction: column; background: white; border-left: 1px solid var(--color-border); }

.tool-section { padding: 15px; border-bottom: 1px solid var(--color-border); display: flex; flex-direction: column; flex: 3; overflow: hidden; }
.items-section { padding: 15px; border-bottom: 1px solid var(--color-border); display: flex; flex-direction: column; flex: 2; overflow: hidden; background: var(--color-bg); min-height: 200px; }

.variant-controls { margin-bottom: 10px; padding: 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; }
.active-label { display: block; font-weight: bold; margin-bottom: 5px; color: var(--color-primary); text-align: center; font-size: 1.1em; }
.letters { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; }
.letters .btn-xs { min-width: 24px; text-align: center; }
.letters .btn-xs.active { background: var(--color-primary); color: white; border-color: var(--color-primary-hover); }

.pattern-list-header { margin-top: 10px; }
.pattern-search { width: 100%; padding: 6px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; box-sizing: border-box; }
.fallback-badge { font-size: 10px; color: var(--color-warning); background: var(--color-warning-light); border: 1px solid var(--color-warning-light); padding: 2px 6px; border-radius: 4px; margin-top: 4px; text-align: center; }

.pattern-list { overflow-y: auto; flex: 1; margin-top: 6px; border: 1px solid var(--color-border); border-radius: 4px; }
.pat-option { padding: 8px; display: flex; align-items: center; gap: 8px; cursor: pointer; border-bottom: 1px solid var(--color-surface-muted); }
.pat-option:hover { background: var(--color-bg); }
.pat-option.active { background: var(--color-primary-light); border-left: 3px solid var(--color-primary); }

.items-list { overflow-y: auto; flex: 1; margin-top: 10px; }
.item-row { background: white; padding: 8px; margin-bottom: 6px; border-radius: 4px; border: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all 0.2s; }
.item-row:hover { border-color: var(--color-primary); box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.pat-tag { display: flex; align-items: center; gap: 8px; font-family: monospace; }
.d-id { font-weight: 800; color: var(--color-primary-hover); font-size: 13px; }
.p-name { color: var(--color-text-muted); font-size: 11px; }
.link-icon { font-size: 12px; opacity: 0.7; }
</style>
