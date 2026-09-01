<script setup>
import { computed } from 'vue';
import FolioAnnotator from '../FolioAnnotator.vue';
import PatternDisplay from '../PatternDisplay.vue';
import { useSettingsStore } from '../../stores/settings';
import { stripSignKeys } from '../../utils/signs';

const settings = useSettingsStore();

const props = defineProps([
    'source', 'folio', 'getImageUrl', 'activeRegionRect', 'activeRegionItems',
    'patternSort', 'activePattern', 'activeVariant', 'patternSearch',
    'pagePatterns', 'glyphs', 'patternCustomIdMap', 'otherPageAnnotations', 'getBasePattern',
    'codeVariants'
]);

const emit = defineEmits([
    'onAnnotateItem', 'update:patternSort', 'setVariant',
    'update:patternSearch', 'selectPatternBase', 'selectVariantCode',
    'createVariant', 'editVariant', 'deleteVariant', 'openSnippet', 'deleteItem'
]);

function variantsFor(pat) {
    return (props.codeVariants && props.codeVariants[pat]) || [];
}

const hasSigns = computed(() => settings.customSigns.length > 0);

/** True when the selected pattern carries a custom sign (i.e. it is a code variant). */
const isVariantCode = computed(() => {
    if (!props.activePattern || !hasSigns.value) return false;
    const keys = settings.customSigns.map(s => s.key);
    return stripSignKeys(props.activePattern, keys) !== props.activePattern;
});
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
                 <span class="active-label">
                     {{ activePattern }}
                     <span v-if="activeVariant" class="text-muted">{{ activeVariant }}</span>
                     <span v-if="isVariantCode" class="code-variant-badge" title="This is a code variant — the code itself differs from the base pattern">code variant</span>
                 </span>
                 <div class="variant-kind-label" title="Same code, different graphical realisation (a, b, c…)">
                     Snippet variant <span class="kind-hint">— same code, different look</span>
                 </div>
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
                <div class="variant-tip">
                    <template v-if="hasSigns">
                        Use <strong>+ Variant</strong> on a pattern to create a code variant
                        (e.g. <span class="code-font">*uudd</span> → <span class="code-font">*uuVdd</span>).
                    </template>
                    <template v-else>
                        No custom signs yet — define them in
                        <router-link to="/settings">Settings → Custom Signs</router-link>
                        to create code variants.
                    </template>
                </div>
            </div>

            <div class="pattern-list">
                <template v-for="pat in pagePatterns.list" :key="pat">
                    <div class="pat-option"
                         :class="{active: activePattern === pat}"
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
                         <button class="add-variant-btn"
                                 title="Create a code variant of this pattern (changes the code, e.g. *uudd → *uuVdd)"
                                 @click.stop="$emit('createVariant', pat)">+ Variant</button>
                    </div>
                    <div v-for="v in variantsFor(pat)" :key="v.id"
                         class="pat-variant"
                         :class="{active: activePattern === v.code}"
                         :title="v.description"
                         @click="$emit('selectVariantCode', v.code)">
                         <span class="variant-branch">↳</span>
                         <PatternDisplay :pattern="v.code" :glyphs="glyphs" />
                         <span class="pat-name-text">{{ v.label || v.code }}</span>
                         <button class="var-mini" title="Edit variant"
                                 @click.stop="$emit('editVariant', { base: pat, variant: v })">✎</button>
                         <button class="var-mini danger" title="Delete variant"
                                 @click.stop="$emit('deleteVariant', { base: pat, id: v.id })">×</button>
                    </div>
                </template>
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
.code-variant-badge { display: inline-block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; background: var(--color-primary); color: white; padding: 2px 5px; border-radius: 3px; vertical-align: middle; margin-left: 4px; }
.variant-kind-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--color-text-muted); text-align: center; margin-bottom: 6px; }
.kind-hint { font-weight: 400; text-transform: none; letter-spacing: 0; font-style: italic; }
.variant-tip { font-size: 10px; color: var(--color-text-muted); margin-top: 6px; line-height: 1.4; }
.variant-tip .code-font { font-family: monospace; background: var(--color-surface-muted); padding: 0 3px; border-radius: 3px; }
.variant-tip a { color: var(--color-primary); font-weight: 600; }
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

.add-variant-btn { margin-left: auto; flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 3px 7px; border: 1px dashed var(--color-primary); background: white; color: var(--color-primary); border-radius: 4px; cursor: pointer; opacity: 0.75; transition: all 0.15s; }
.pat-option:hover .add-variant-btn { opacity: 1; }
.add-variant-btn:hover { background: var(--color-primary); color: white; border-style: solid; }

.pat-variant { padding: 6px 8px 6px 16px; display: flex; align-items: center; gap: 8px; cursor: pointer; border-bottom: 1px solid var(--color-surface-muted); background: var(--color-bg); font-size: 12px; }
.pat-variant:hover { background: var(--color-surface); }
.pat-variant.active { background: var(--color-primary-light); border-left: 3px solid var(--color-primary); }
.variant-branch { color: var(--color-text-muted); font-size: 12px; }
.var-mini { font-size: 11px; padding: 1px 5px; border: 1px solid var(--color-border-hover); background: white; border-radius: 4px; cursor: pointer; color: var(--color-text-muted); }
.var-mini.danger:hover { background: var(--color-danger, #dc2626); color: white; border-color: var(--color-danger, #dc2626); }
.pat-variant .var-mini { margin-left: 0; }
.pat-variant .pat-name-text { margin-right: auto; }

.items-list { overflow-y: auto; flex: 1; margin-top: 10px; }
.item-row { background: white; padding: 8px; margin-bottom: 6px; border-radius: 4px; border: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all 0.2s; }
.item-row:hover { border-color: var(--color-primary); box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.pat-tag { display: flex; align-items: center; gap: 8px; font-family: monospace; }
.d-id { font-weight: 800; color: var(--color-primary-hover); font-size: 13px; }
.p-name { color: var(--color-text-muted); font-size: 11px; }
.link-icon { font-size: 12px; opacity: 0.7; }
</style>
