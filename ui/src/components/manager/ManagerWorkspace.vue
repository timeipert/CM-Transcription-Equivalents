<script setup>
import { ref, computed } from 'vue';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { useAnnotationsStore } from '../../stores/annotations';
import { useImageManifest } from '../../composables/useImageManifest';
import PatternDisplay from '../PatternDisplay.vue';
import AnnotationCutout from '../AnnotationCutout.vue';
import FolioAnnotator from '../FolioAnnotator.vue';
import SnippetDetailModal from '../SnippetDetailModal.vue';

const props = defineProps(['source', 'folio', 'initialRegionId']);
const annotStore = useAnnotationsStore();
const { pagePatternsIndex, glyphs, rawData } = useTranscriptionData();
const { getImageUrl, getStandardSource } = useImageManifest();

// --- Computed Data for Page ---
const stdSource = computed(() => getStandardSource(props.source, props.folio));

// Patterns available to annotate
const pagePatterns = computed(() => {
    if (!props.source || !props.folio || !pagePatternsIndex.value) return [];
    return pagePatternsIndex.value[props.source]?.[props.folio] || [];
});

// Regions (Lines)
const regions = computed(() => {
    if (!stdSource.value || !props.folio) return [];
    return annotStore.getRegions(stdSource.value, props.folio);
});

// Deep Link Watcher
import { watch } from 'vue';
watch([() => props.initialRegionId, regions], ([id, list]) => {
    if (id && list && list.length > 0) {
        const match = list.find(r => r.id === id);
        if (match) {
             activeRegion.value = match;
        }
    }
}, { immediate: true });

// --- State ---
const showRegionCreator = ref(false); // Modal to create a new region
const activeRegion = ref(null); // The region currently being edited
const activePattern = ref(""); // The full pattern string (e.g. "Virga a")

// Variant Helper
function getBasePattern(p) {
    if (!p) return "";
    return p.split(' ')[0]; // Simple assumption: variants are space-delimited suffix
}

const currentVariant = computed(() => {
    const parts = activePattern.value.split(' ');
    return parts.length > 1 ? parts[1] : '';
});

function selectPatternBase(pat) {
    // If switching base, reset variant? Or keep?
    // Let's reset for clarity, or if variant was 'a', maybe keeps 'a'?
    // Reset is safer.
    activePattern.value = pat; 
}

function setVariant(v) {
    const base = getBasePattern(activePattern.value);
    if (!base) return;
    activePattern.value = v ? `${base} ${v}` : base;
}

const showLinker = ref(false);
const pendingItemPoints = ref(null); // Points for the item just drawn
const selectedSnippet = ref(null);

// --- Computed ---
const activeRegionItems = computed(() => {
    if (!activeRegion.value) return [];
    return annotStore.getRegionItems(activeRegion.value.id);
});

const linkCandidates = computed(() => {
    if (!activePattern.value || !props.source) return [];
    const srcData = rawData.value[props.source];
    if (!srcData) return [];
    const allOccs = srcData[activePattern.value] || [];
    
    // Fuzzy match folio:
    // props.folio (image identifier) e.g., "145" or "145v"
    // data folio e.g., "145", "145b" (column b), "145v", "145vb"
    
    const target = props.folio;
    
    return allOccs.filter(o => {
        const dFolio = o[1];
        if (dFolio === target) return true;
        
        // Check for column suffix (a, b, c...)
        // Logic: dFolio must start with target.
        // And the suffix must be a single letter that is NOT 'v' (unless target ends in digit, then 'v' means verso which is different page)
        // Actually simpler: 
        // If target is "145" (recto), we match "145", "145a", "145b". We do NOT match "145v".
        // If target is "145v" (verso), we match "145v", "145va", "145vb".
        
        if (dFolio.startsWith(target)) {
            const suffix = dFolio.substring(target.length);
            // If suffix is just a column letter like "a", "b", "c"
            // We need to avoid "v" if we are on recto.
            
            // If we are on recto "145", suffix "v" implies verso page -> NO match.
            // If we are on recto "145", suffix "b" implies column -> MATCH.
            
            // If we are on verso "145v", suffix "a" -> MATCH.
            
            // General rule:
            // Suffix should match /^[a-z]$/
            // AND if suffix is 'v', verify target didn't end in number?
            // "145" + "v" -> "145v" (Different page)
            // "145v" + "a" -> "145va" (Column on same page)
            
            // If target ends in digit (recto), exclude 'v' suffix.
            if (/[0-9]$/.test(target) && suffix === 'v') return false;
            
            // Otherwise, if it's just suffix letters, assume it's a column
            if (/^[a-z]+$/.test(suffix)) return true;
        }
        
        return false;
    });
});

const activeRegionRect = computed(() => {
    if (!activeRegion.value) return null;
    return getRectFromPoints(activeRegion.value.points);
});

// --- Methods ---

function getRectFromPoints(pointsStr) {
    if (!pointsStr) return null;
    const parts = pointsStr.split(' ');
    let minX = 100, minY = 100, maxX = 0, maxY = 0;
    for (const p of parts) {
        const [x, y] = p.split(',').map(Number);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY
    };
}

// 1. Region Management
function openRegionCreator() {
    showRegionCreator.value = true;
}

function saveRegion(points) {
    const name = prompt("Name for this Line (e.g. 'Line 1'):", `Line ${regions.value.length + 1}`);
    if (name) {
        annotStore.addRegion(stdSource.value, props.folio, name, points);
    }
    showRegionCreator.value = false;
}

function deleteRegion(r) {
    if (confirm(`Delete region "${r.name}" and all its contents?`)) {
        annotStore.removeRegion(stdSource.value, props.folio, r.id);
        if (activeRegion.value && activeRegion.value.id === r.id) {
            activeRegion.value = null;
        }
    }
}

function selectRegion(r) {
    activeRegion.value = r;
    // Auto-select first pattern if none
    if (!activePattern.value && pagePatterns.value.length > 0) {
        activePattern.value = pagePatterns.value[0];
    }
}

// 2. Item Annotation (inside Region)
function onAnnotateItem(points) {
    if (!activePattern.value) {
        alert("Please select a pattern first.");
        return;
    }
    
    pendingItemPoints.value = points;
    
    // Check for link candidates
    if (linkCandidates.value.length > 0) {
        showLinker.value = true;
    } else {
        finalizeItem({});
    }
}

function finalizeItem(linkData = {}) {
    if (!activeRegion.value || !pendingItemPoints.value) return;
    
    annotStore.addItemToRegion(
        activeRegion.value.id,
        activePattern.value,
        pendingItemPoints.value,
        { linkData }
    );
    
    pendingItemPoints.value = null;
    showLinker.value = false;
}

function deleteItem(itemId) {
    if (confirm("Delete this item?")) {
        annotStore.removeItemFromRegion(activeRegion.value.id, itemId);
    }
}

// 3. View Details
function openSnippet(item) {
    selectedSnippet.value = {
        id: item.id,
        source: stdSource.value,
        folio: props.folio,
        points: item.points,
        pattern: item.pattern,
        linkData: item.linkData
    };
}

</script>

<template>
<div class="workspace-container">
    <div v-if="!source" class="empty-state">Select a Folio from the sidebar.</div>
    <div v-else class="content-wrapper">
        
        <!-- HEADER -->
        <div class="header">
            <div class="left">
                <button v-if="activeRegion" @click="activeRegion = null" class="btn-secondary">&larr; Back</button>
                <h2>
                    {{ source }} / {{ folio }} 
                    <span v-if="activeRegion" class="crumb"> / {{ activeRegion.name }}</span>
                </h2>
            </div>
            <div class="stats">
                <span v-if="!activeRegion">{{ regions.length }} Regions</span>
                <span v-else>{{ activeRegionItems.length }} Items</span>
            </div>
        </div>
        
        <!-- BODY -->
        <div class="main-body">
            
            <!-- OVERVIEW MODE -->
            <div v-if="!activeRegion" class="overview-grid">
                <div class="overview-toolbar">
                    <button @click="openRegionCreator" class="btn-primary">+ Add Line Region</button>
                </div>
                
                <div class="regions-list">
                     <div v-if="regions.length === 0" class="empty-msg">No regions defined.</div>
                     <div v-for="r in regions" :key="r.id" class="region-card" @click="selectRegion(r)">
                         <div class="r-preview">
                             <AnnotationCutout 
                                 :source="stdSource" 
                                 :folio="folio" 
                                 :points="r.points"
                                 :width="300" 
                                 :height="80" 
                                 fit="contain"
                             />
                         </div>
                         <div class="r-info">
                             <h4>{{ r.name }}</h4>
                             <button @click.stop="deleteRegion(r)" class="btn-xs delete-btn">Delete</button>
                         </div>
                     </div>
                </div>
            </div>
            
            <!-- DETAIL MODE (Two-Pane) -->
            <div v-else class="detail-split">
                <!-- Left: Canvas -->
                <div class="detail-canvas">
                    <FolioAnnotator 
                        :imageUrl="getImageUrl(source, folio)" 
                        :cropRect="activeRegionRect"
                        :overlays="activeRegionItems"
                        @save="onAnnotateItem" 
                    />
                </div>
                
                <!-- Right: Tools & List -->
                <div class="detail-sidebar">
                    <div class="tool-section">
                        <h4>Select Pattern</h4>
                        
                        <!-- Variant Controls -->
                        <div class="variant-controls" v-if="activePattern">
                             <span class="active-label">{{ activePattern }}</span>
                             <div class="letters">
                                 <button class="btn-xs" @click="setVariant('')">Base</button>
                                 <button v-for="l in ['a','b','c','d','e','f','g']" :key="l"
                                         class="btn-xs" 
                                         :class="{active: currentVariant === l}"
                                         @click="setVariant(l)">
                                     {{ l }}
                                 </button>
                             </div>
                        </div>

                        <div class="pattern-list">
                            <div v-for="pat in pagePatterns" :key="pat" 
                                 class="pat-option" 
                                 :class="{active: getBasePattern(activePattern) === pat}"
                                 @click="selectPatternBase(pat)">
                                 <PatternDisplay :pattern="pat" :glyphs="glyphs" />
                                 <span>{{ pat }}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="items-section">
                        <h4>Items in Region</h4>
                        <div class="items-list">
                            <div v-for="item in activeRegionItems" :key="item.id" 
                                 class="item-row"
                                 @click="openSnippet(item)">
                                <span class="pat-tag">{{ item.pattern }}</span>
                                <span v-if="item.linkData && item.linkData.sysId" class="link-icon">🔗</span>
                                <button @click.stop="deleteItem(item.id)" class="btn-xs delete-item">x</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
        </div>
    </div>

    <!-- Modals -->
    
    <!-- Region Creator Modal -->
    <div v-if="showRegionCreator" class="modal">
        <div class="modal-content annot-modal">
             <div class="modal-header">
                <h3>Define New Region (Line)</h3>
                <span class="close" @click="showRegionCreator=false">&times;</span>
            </div>
            <div class="modal-body-annot">
                <FolioAnnotator 
                    :imageUrl="getImageUrl(source, folio)" 
                    @save="saveRegion" 
                />
            </div>
        </div>
    </div>
    
    <!-- Linker Modal -->
    <div v-if="showLinker" class="modal">
        <div class="modal-content link-modal">
            <div class="modal-header">
                <h3>Link {{ activePattern }}</h3>
                <button class="btn-sm" @click="finalizeItem({})">Skip Link</button>
            </div>
            <div class="modal-body-link">
                 <table>
                    <thead>
                        <tr><th>Line</th><th>Syl.</th><th>Notes</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="(occ, idx) in linkCandidates" :key="idx">
                            <td>{{ occ[2] }}</td>
                            <td>{{ occ[3] }}</td>
                            <td class="notes-cell">{{ occ[4] }}</td>
                            <td>
                                <button class="btn-primary btn-sm" @click="finalizeItem({ sysId: occ.join('|') })">
                                    Select
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    
    <SnippetDetailModal 
        :visible="!!selectedSnippet"
        :annotation="selectedSnippet"
        @close="selectedSnippet = null"
    />
</div>
</template>

<style scoped>
.workspace-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; height: 100%; }
.empty-state { padding: 40px; color: #888; text-align: center; }
.content-wrapper { display: flex; flex-direction: column; height: 100%; }

.header { padding: 15px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: white; }
.left { display: flex; align-items: center; gap: 15px; }
.crumb { color: #666; font-weight: normal; }
.main-body { flex: 1; overflow: hidden; position: relative; background: #f8fafc; }

/* Overview */
.overview-grid { padding: 20px; height: 100%; overflow-y: auto; }
.overview-toolbar { margin-bottom: 20px; }
.regions-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 15px; }
.region-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
.region-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.r-preview { height: 100px; background: #0f172a; display: flex; justify-content: center; align-items: center; }
.r-info { padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; }

/* Detail Split */
.detail-split { display: flex; height: 100%; }
.detail-canvas { flex: 1; border-right: 1px solid #e2e8f0; background: #0f172a; position: relative; }
.detail-sidebar { width: 300px; display: flex; flex-direction: column; background: white; border-left: 1px solid #ddd; }

.tool-section, .items-section { padding: 15px; border-bottom: 1px solid #eee; display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.tool-section { flex: 0 0 45%; } /* Increased height for variants */
.items-section { flex: 1; background: #f8fafc; }

.variant-controls { margin-bottom: 10px; padding: 10px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; }
.active-label { display: block; font-weight: bold; margin-bottom: 5px; color: #3b82f6; text-align: center; font-size: 1.1em; }
.letters { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; }
.letters .btn-xs { min-width: 24px; text-align: center; }
.letters .btn-xs.active { background: #3b82f6; color: white; border-color: #2563eb; }

.pattern-list { overflow-y: auto; flex: 1; margin-top: 10px; border: 1px solid #e2e8f0; border-radius: 4px; }
.pat-option { padding: 8px; display: flex; align-items: center; gap: 8px; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
.pat-option:hover { background: #f8fafc; }
.pat-option.active { background: #eff6ff; border-left: 3px solid #3b82f6; }

.items-list { overflow-y: auto; flex: 1; margin-top: 10px; }
.item-row { background: white; padding: 8px; margin-bottom: 6px; border-radius: 4px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
.pat-tag { font-weight: 500; font-family: monospace; }
.link-icon { font-size: 12px; }

/* Buttons & Utils */
.btn-primary { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-primary:hover { background: #2563eb; }
.btn-secondary { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
.btn-xs { padding: 2px 6px; font-size: 11px; border-radius: 3px; cursor: pointer; border: 1px solid #ccc; background: white; }
.delete-btn { color: red; border-color: #fca5a5; }
.delete-item { color: inherit; }

/* Modals */
.modal { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; justify-content:center; align-items:center; z-index:1000; }
.annot-modal { width: 95vw; height: 95vh; background:white; display:flex; flex-direction:column; border-radius:8px; overflow:hidden; }
.link-modal { width: 600px; max-height: 80vh; background: white; display:flex; flex-direction: column; border-radius: 8px; overflow: hidden; padding: 20px; }
.modal-header { padding:15px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; }
.close { font-size:24px; cursor:pointer; }
.modal-body-annot { flex:1; overflow:hidden; position: relative; }
.modal-body-link { flex: 1; overflow-y: auto; margin-top: 10px; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 8px; border-bottom: 1px solid #eee; text-align: left; }
.notes-cell { font-family: monospace; color: #666; font-size: 0.9em; }
</style>
