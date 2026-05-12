<script setup>
import { ref, computed, watch } from 'vue';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { useAnnotationsStore } from '../../stores/annotations';
import { usePersonalTablesStore } from '../../stores/personalTables';
import { useSettingsStore } from '../../stores/settings';
import { useImageManifest } from '../../composables/useImageManifest';
import PatternDisplay from '../PatternDisplay.vue';
import AnnotationCutout from '../AnnotationCutout.vue';
import FolioAnnotator from '../FolioAnnotator.vue';
import SnippetDetailModal from '../SnippetDetailModal.vue';
import { useRouter } from 'vue-router';

const props = defineProps(['source', 'folio', 'initialRegionId', 'highlightPattern', 'returnTo', 'returnId']);
const router = useRouter();
const annotStore = useAnnotationsStore();
const tableStore = usePersonalTablesStore();
const settings = useSettingsStore();
const { pagePatternsIndex, folioLinesIndex, glyphs, rawData, patStats } = useTranscriptionData();
const { getImageUrl, getStandardSource, getStandardFolio } = useImageManifest();

// --- Utils ---
function parseLineNumber(name) {
    if (!name) return null;
    const m = name.match(/(\d+)/);
    return m ? parseInt(m[1]) : null;
}

// --- Computed Data for Page ---
const stdSource = computed(() => getStandardSource(props.source, props.folio));
const stdFolio = computed(() => getStandardFolio(props.source, props.folio));

// Find the key in indices that matches our current source
const resolvedSrcKey = computed(() => {
    if (!props.source || !rawData.value) return props.source;
    const keys = Object.keys(rawData.value);
    // 1. Exact
    if (keys.includes(props.source)) return props.source;
    // 2. Standardized match
    const targetStd = getStandardSource(props.source);
    const match = keys.find(k => getStandardSource(k) === targetStd || k.toLowerCase() === props.source.toLowerCase());
    return match || props.source;
});

// Global base stats for sorting
const patternCustomIdMap = computed(() => {
    const table = tableStore.tables.find(t => t.source === props.source);
    if (!table) return {};
    const map = {};
    for (const row of table.rows) {
        map[row.pattern] = row.customId;
    }
    return map;
});

const highlightHint = computed(() => {
    if (!props.highlightPattern || !rawData.value) return null;
    
    const srcKey = resolvedSrcKey.value;
    if (!srcKey || !rawData.value[srcKey]) return null;
    
    const patData = rawData.value[srcKey][props.highlightPattern] || [];
    const targetFolio = stdFolio.value;
    
    const onThisPage = patData.filter(o => getStandardFolio(srcKey, o[1]) === targetFolio);
    if (onThisPage.length === 0) return null;
    
    const lines = Array.from(new Set(onThisPage.map(o => o[2]))).sort((a,b) => a-b);
    
    const sortedOccs = [...onThisPage].sort((a, b) => {
        const lineA = parseInt(a[2]) || 0;
        const lineB = parseInt(b[2]) || 0;
        return lineA - lineB;
    });

    return {
        pattern: props.highlightPattern,
        lines: lines,
        occurrences: sortedOccs
    };
});

const allLinesOnPage = computed(() => {
    if (!folioLinesIndex.value) return [];
    
    const srcKey = resolvedSrcKey.value;
    if (!srcKey || !folioLinesIndex.value[srcKey]) return [];
    
    // Check original folio name or standardized fallback
    let lines = folioLinesIndex.value[srcKey][props.folio] || [];
    if (lines.length === 0) {
        const targetFolio = stdFolio.value;
        for (const [idxFolio, fLines] of Object.entries(folioLinesIndex.value[srcKey])) {
            if (getStandardFolio(srcKey, idxFolio) === targetFolio) {
                lines = lines.concat(fLines);
            }
        }
        lines = Array.from(new Set(lines)).sort((a,b) => a-b);
    }
    return lines;
});

const existingRegionLines = computed(() => {
    return new Set(regions.value.map(r => parseLineNumber(r.name)).filter(n => n !== null));
});

const linesToAnnotate = computed(() => {
    const existing = existingRegionLines.value;
    return allLinesOnPage.value.filter(l => !existing.has(l));
});

const baseStats = computed(() => {
    const stats = {};
    if (!patStats.value) return stats;
    for (const [pat, data] of Object.entries(patStats.value)) {
        const base = pat.split(' ')[0]; // Simple getBasePattern equivalent
        stats[base] = (stats[base] || 0) + data.count;
    }
    return stats;
});

const patternSort = ref('freq'); // freq, alpha, length
const patternSearch = ref('');

// Patterns available to annotate (Base patterns, sorted by chosen order)
const pagePatterns = computed(() => {
    const srcKey = resolvedSrcKey.value;
    if (!srcKey || !pagePatternsIndex.value) return { list: [], isFallback: false };
    
    const sourceData = pagePatternsIndex.value[srcKey];
    if (!sourceData) return { list: [], isFallback: false };

    // 1. Try exact match for folio
    let pats = sourceData[props.folio] || [];
    
    // 2. Try standardized match
    if (pats.length === 0) {
        const targetFolio = stdFolio.value;
        for (const [idxFolio, fPats] of Object.entries(sourceData)) {
            if (getStandardFolio(srcKey, idxFolio) === targetFolio) {
                pats = pats.concat(fPats);
            }
        }
        pats = Array.from(new Set(pats));
    }

    // 3. Fallback: Show all patterns for the manuscript
    const isGlobalFallback = ref(false);
    if (pats.length === 0) {
        const allPats = new Set();
        for (const fPats of Object.values(sourceData)) {
            for (const p of fPats) allPats.add(p);
        }
        pats = Array.from(allPats);
        isGlobalFallback.value = true;
    }
    
    const baseSet = new Set();
    for (const p of pats) {
        baseSet.add(p.split(' ')[0]);
    }
    
    let result = Array.from(baseSet);

    // Apply Search Filter
    if (patternSearch.value.trim()) {
        const q = patternSearch.value.toLowerCase();
        result = result.filter(p => p.toLowerCase().includes(q));
    }
    
    if (patternSort.value === 'alpha') {
        result.sort();
    } else if (patternSort.value === 'length') {
        result.sort((a, b) => {
            if (a.length !== b.length) return a.length - b.length;
            return a.localeCompare(b);
        });
    } else if (patternSort.value === 'freq') {
        result.sort((a, b) => {
            if (a === "(Start)") return -1;
            if (b === "(Start)") return 1;
            const countA = baseStats.value[a] || 0;
            const countB = baseStats.value[b] || 0;
            if (countA !== countB) return countB - countA;
            return a.localeCompare(b);
        });
    }
    
    return { list: result, isFallback: isGlobalFallback.value };
});

// Regions (Lines)
const regions = computed(() => {
    if (!stdSource.value || !stdFolio.value) return [];
    
    // 1. Get standard line regions
    const standardRegions = annotStore.getRegions(stdSource.value, stdFolio.value);
    
    // 2. Find legacy annotations (saved before line regions existed)
    const prefix = `${stdSource.value}_${stdFolio.value}_`;
    let hasLegacy = false;
    for (const key in annotStore.annotations) {
        if (key.startsWith(prefix) && annotStore.annotations[key].length > 0) {
            hasLegacy = true;
            break;
        }
    }
    
    // If we have legacy annotations, inject a pseudo-region to view them
    if (hasLegacy) {
        return [
            { 
                id: 'legacy', 
                name: 'Legacy Annotations (Whole Page)', 
                points: '0,0 100,0 100,100 0,100',
                isLegacy: true
            },
            ...standardRegions
        ];
    }
    
    return standardRegions;
});

// Deep Link Watcher
watch([() => props.initialRegionId, regions], ([id, list]) => {
    if (id && list && list.length > 0) {
        const match = list.find(r => r.id === id);
        if (match) {
             activeRegion.value = match;
        }
    }
}, { immediate: true });

// --- State ---
const showRegionCreator = ref(false);
const showLinker = ref(false);
const newRegionName = ref('');

// Auto-open region creator or select existing when navigating from gallery with a highlight
watch(highlightHint, (newHint) => {
    if (props.initialRegionId) return; // We already have a specific region targeted
    if (newHint && props.highlightPattern) {
        // Find if any of the target lines already have a region
        const targetLines = newHint.lines;
        const existing = regions.value.find(r => {
            const num = parseLineNumber(r.name);
            return num !== null && targetLines.includes(num);
        });

        if (existing) {
            selectRegion(existing);
        } else {
            showRegionCreator.value = true;
        }
    }
}, { immediate: true });

// Pre-select the line when modal opens
watch(showRegionCreator, (open) => {
    if (open) {
        // If we have a highlight hint, try to pick one of its lines
        if (highlightHint.value && highlightHint.value.lines.length > 0) {
            const firstAvailable = highlightHint.value.lines.find(l => linesToAnnotate.value.includes(l));
            if (firstAvailable) {
                newRegionName.value = `Line ${firstAvailable}`;
                return;
            }
        }
        // Fallback to first available line on page
        if (linesToAnnotate.value.length > 0) {
            newRegionName.value = `Line ${linesToAnnotate.value[0]}`;
        } else {
            newRegionName.value = `Line ${regions.value.length + 1}`;
        }
    }
});

const activeRegion = ref(null); // The region currently being edited
const activePattern = ref(""); // The base pattern string (e.g. "Virga")
const activeVariant = ref(""); // The variant letter (e.g. "a")

// Variant Helper
function getBasePattern(p) {
    if (!p) return "";
    return p.split(' ')[0];
}

function selectPatternBase(pat) {
    // If pat contains a variant (e.g. "Virga a"), split it
    const parts = pat.split(' ');
    activePattern.value = parts[0];
    if (parts.length > 1) {
        activeVariant.value = parts[1];
    } else {
        activeVariant.value = "";
    }
}

function setVariant(v) {
    activeVariant.value = v;
}


const pendingItemPoints = ref(null); // Points for the item just drawn
const selectedSnippet = ref(null);

// --- Computed ---

const otherPageAnnotations = computed(() => {
    const res = {};
    const currentSrc = stdSource.value;
    const currentFol = stdFolio.value;
    
    // 1. Legacy Annotations
    for (const key in annotStore.annotations) {
        const parts = key.split('_');
        if (parts.length >= 3) {
            const src = parts[0];
            const fol = parts[1];
            if (src === currentSrc && fol === currentFol) continue;
            
            const pat = parts.slice(2).join('_');
            const basePat = getBasePattern(pat);
            
            if (!res[basePat]) res[basePat] = [];
            const count = annotStore.annotations[key].length;
            if (count > 0) {
                 res[basePat].push({ folio: fol, line: '', count });
            }
        }
    }
    
    // 2. Region Items
    const regionToLoc = {};
    for (const key in annotStore.regions) {
        const parts = key.split('_');
        if (parts.length >= 2) {
            const src = parts[0];
            const fol = parts[1];
            if (src === currentSrc && fol === currentFol) continue;
            
            for (const r of annotStore.regions[key]) {
                 regionToLoc[r.id] = { folio: fol, name: r.name };
            }
        }
    }
    
    for (const rid in annotStore.regionItems) {
        if (!regionToLoc[rid]) continue;
        
        const loc = regionToLoc[rid];
        const items = annotStore.regionItems[rid];
        
        const patCounts = {};
        for (const item of items) {
             const basePat = getBasePattern(item.pattern);
             if (!patCounts[basePat]) patCounts[basePat] = 0;
             patCounts[basePat]++;
        }
        
        for (const pat in patCounts) {
             if (!res[pat]) res[pat] = [];
             res[pat].push({ folio: loc.folio, line: loc.name, count: patCounts[pat] });
        }
    }
    
    return res;
});

const activeRegionItems = computed(() => {
    if (!activeRegion.value) return [];
    
    if (activeRegion.value.isLegacy) {
        const prefix = `${stdSource.value}_${stdFolio.value}_`;
        const items = [];
        for (const key in annotStore.annotations) {
            if (key.startsWith(prefix)) {
                const pattern = key.substring(prefix.length);
                 for (const a of annotStore.annotations[key]) {
                     const basePat = getBasePattern(pattern);
                     const localId = patternCustomIdMap.value[basePat];
                     const globalId = settings.getGlobalId(basePat);
                     const refId = localId || globalId;
                     
                     let dId = refId;
                     if (!dId) dId = basePat;
                     
                     // Variant logic
                     let variant = a.variant || '';
                     const trans = a.linkData?.transcription || '';
                     if (!variant && trans && trans.length > basePat.length && trans.startsWith(basePat)) {
                         variant = trans.substring(basePat.length).trim();
                     }
                     // If pattern itself has a variant (legacy)
                     if (!variant && pattern.includes(' ')) {
                         variant = pattern.split(' ')[1];
                     }

                     if (variant) dId = `${dId}${variant}`;

                     items.push({ ...a, pattern, displayId: dId, variant });
                }
            }
        }
        return items;
    }
    
    const items = annotStore.getRegionItems(activeRegion.value.id);
    return items.map(item => {
        const basePat = getBasePattern(item.pattern);
        const localId = patternCustomIdMap.value[basePat];
        const globalId = settings.getGlobalId(basePat);
        const refId = localId || globalId;
        
        let dId = refId;
        if (!dId) {
             dId = basePat;
        }
        
        // Variant logic
        let variant = item.variant || '';
        const trans = item.linkData?.transcription || '';
        if (!variant && trans && trans.length > basePat.length && trans.startsWith(basePat)) {
            variant = trans.substring(basePat.length).trim();
        }
        if (variant) dId = `${dId}${variant}`;

        return {
            ...item,
            displayId: dId,
            variant
        };
    });
});

const linkCandidates = computed(() => {
    if (!activePattern.value || !props.source) return [];
    const srcData = rawData.value[props.source];
    if (!srcData) return [];
    const allOccs = srcData[activePattern.value] || [];
    
    // Fuzzy match folio
    const target = String(props.folio).toLowerCase();
    const stdTarget = String(getStandardFolio(props.source, props.folio)).toLowerCase();
    
    const candidates = allOccs.map(o => {
        const dFolio = String(o[1]).toLowerCase();
        let score = 0;
        if (dFolio === target) score = 100;
        else if (dFolio === stdTarget) score = 90;
        else if (dFolio.includes(target) || target.includes(dFolio)) score = 50;
        else if (stdTarget && (dFolio.includes(stdTarget) || stdTarget.includes(dFolio))) score = 40;
        
        return { occ: o, score };
    });

    // Sort by score (best match first)
    candidates.sort((a, b) => b.score - a.score);

    // If we have some matches, return them. 
    // If not, return all but warn they aren't on this page.
    if (candidates[0] && candidates[0].score > 0) {
        return candidates.filter(c => c.score > 0).map(c => c.occ);
    }
    
    return allOccs; // Fallback: show all if no match
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



function openRegionCreator() {
    showRegionCreator.value = true;
}

const customRegionName = ref("");
function saveRegion(points) {
    let name = newRegionName.value;
    if (name === 'Custom') name = customRegionName.value.trim() || `Line ${regions.value.length + 1}`;
    
    const newId = annotStore.addRegion(stdSource.value, stdFolio.value, name, points);
    showRegionCreator.value = false;
    customRegionName.value = "";

    // Auto-select the newly created region
    setTimeout(() => {
        const newlyCreated = regions.value.find(r => r.id === newId || r.name === name);
        if (newlyCreated) selectRegion(newlyCreated);
    }, 50);
}

function deleteRegion(r) {
    if (confirm(`Delete region "${r.name}" and all its contents?`)) {
        annotStore.removeRegion(stdSource.value, stdFolio.value, r.id);
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

function selectLink(occ) {
    if (Array.isArray(occ)) {
        finalizeItem({ sysId: occ.join('|') });
    } else {
        finalizeItem({ sysId: String(occ) });
    }
}

function finalizeItem(linkData = {}) {
    if (!activeRegion.value || !pendingItemPoints.value) return;
    
    if (activeRegion.value.isLegacy) {
        annotStore.addAnnotation(stdSource.value, stdFolio.value, activePattern.value, pendingItemPoints.value, { linkData, variant: activeVariant.value });
    } else {
        annotStore.addItemToRegion(
            activeRegion.value.id,
            activePattern.value,
            pendingItemPoints.value,
            { linkData, variant: activeVariant.value }
        );
    }
    
    pendingItemPoints.value = null;
    showLinker.value = false;
}

function deleteItem(item) {
    if (confirm("Delete this item?")) {
        if (activeRegion.value.isLegacy) {
            annotStore.removeAnnotation(stdSource.value, stdFolio.value, item.pattern, item.id);
        } else {
            annotStore.removeItemFromRegion(activeRegion.value.id, item.id);
        }
    }
}

// 3. View Details
function openSnippet(item) {
    selectedSnippet.value = {
        id: item.id,
        source: stdSource.value,
        folio: stdFolio.value,
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
                <button v-if="returnTo === 'annotations'" @click="router.push({ name: 'annotations', params: { id: returnId } })" class="btn-secondary" style="margin-right: 10px;">&larr; Back to Gallery</button>
                <button v-if="activeRegion" @click="activeRegion = null" class="btn-secondary">&larr; Back to Line Regions</button>
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
                    Data available for lines: <strong>{{ allLinesOnPage.join(', ') }}</strong>
                </div>
            </div>
            <div class="stats">
                <span v-if="!activeRegion">{{ regions.length }} Line Regions</span>
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
                     <div v-if="regions.length === 0" class="empty-msg">No line regions defined.</div>
                     <div v-for="r in regions" :key="r.id" class="region-card" @click="selectRegion(r)">
                         <div class="r-preview">
                             <AnnotationCutout 
                                 :source="stdSource" 
                                 :folio="stdFolio" 
                                 :points="r.points"
                                 :width="300" 
                                 :height="80" 
                                 fit="contain"
                                 :hideLabel="true"
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
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h4>Select Pattern</h4>
                            <select v-model="patternSort" style="padding: 2px; font-size: 11px; border-radius: 4px;">
                                <option value="freq">Frequency</option>
                                <option value="alpha">Alphabetical</option>
                                <option value="length">Length</option>
                            </select>
                        </div>
                        
                        <!-- Variant Controls -->
                        <div class="variant-controls" v-if="activePattern">
                             <span class="active-label">{{ activePattern }} <span v-if="activeVariant" style="color: #666;">{{ activeVariant }}</span></span>
                             <div class="letters">
                                 <button class="btn-xs" :class="{active: !activeVariant}" @click="setVariant('')">Base</button>
                                 <button v-for="l in ['a','b','c','d','e','f','g']" :key="l"
                                         class="btn-xs" 
                                         :class="{active: activeVariant === l}"
                                         @click="setVariant(l)">
                                     {{ l }}
                                 </button>
                             </div>
                        </div>

                        <div class="pattern-list-header">
                            <input v-model="patternSearch" placeholder="Search patterns..." class="pattern-search" />
                            <div v-if="pagePatterns.isFallback" class="fallback-badge">Manuscript-wide fallback</div>
                        </div>

                        <div class="pattern-list">
                            <div v-for="pat in pagePatterns.list" :key="pat" 
                                 class="pat-option" 
                                 :class="{active: getBasePattern(activePattern) === pat}"
                                 @click="selectPatternBase(pat)">
                                 <PatternDisplay :pattern="pat" :glyphs="glyphs" />
                                 <span>{{ pat }}</span>
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
                                 @click="openSnippet(item)">
                                <span class="pat-tag">
                                    <span class="d-id">{{ item.displayId }}</span>
                                    <span class="p-name">{{ item.pattern }}</span>
                                </span>
                                <span v-if="item.linkData && item.linkData.sysId" class="link-icon">🔗</span>
                                <button @click.stop="deleteItem(item)" class="btn-xs delete-item">x</button>
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
                <div style="display:flex; align-items:center; gap: 12px;">
                    <button v-if="returnTo === 'annotations'" @click="router.push({ name: 'annotations', params: { id: returnId } })" class="btn-secondary">&larr; Back to Gallery</button>
                    <h3 style="margin:0">Define Line Region</h3>
                    <div class="line-selector-group">
                        <label>Target:</label>
                        <select v-model="newRegionName" class="line-select">
                            <optgroup label="Missing Data Lines">
                                <option v-for="l in linesToAnnotate" :key="'missing-'+l" :value="'Line ' + l">Line {{ l }}</option>
                            </optgroup>
                            <optgroup label="Already Created">
                                <option v-for="l in allLinesOnPage.filter(l => existingRegionLines.has(l))" :key="'all-'+l" :value="'Line ' + l" disabled>
                                    Line {{ l }} ✓
                                </option>
                            </optgroup>
                            <option value="Custom">Custom Name...</option>
                        </select>
                        <input v-if="newRegionName === 'Custom'" v-model="customRegionName" placeholder="Enter name..." class="custom-input" />
                    </div>
                </div>
                <div class="creator-guidance">
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
                    <div v-else-if="allLinesOnPage.length > 0" class="general-hint">
                        <strong>Data available for lines:</strong> {{ allLinesOnPage.join(', ') }}
                    </div>
                </div>
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
                                <button class="btn-primary btn-sm" @click.stop.prevent="selectLink(occ)">
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
.crumb { color: #94a3b8; font-weight: 400; }

.highlight-hint-bubble {
    margin-left: 20px; background: #fffbeb; border: 1px solid #fef3c7; 
    padding: 4px 14px; border-radius: 20px; font-size: 13px; color: #92400e;
    display: flex; gap: 8px; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.highlight-hint-bubble strong { color: #b45309; }
.hint-visual { 
    height: 32px; 
    width: auto;
    display: inline-block; 
    vertical-align: middle; 
    background: white; 
    border-radius: 6px; 
    padding: 2px 8px;
    margin: 0;
    border: 1px solid #fef3c7;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
}

.highlight-hint-detailed {
    margin-left: 0; background: #fffbeb; border: 1px solid #fef3c7; 
    padding: 4px 10px; border-radius: 6px; font-size: 11px; color: #92400e;
    display: flex; flex-direction: column; gap: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    max-height: 100px; overflow-y: auto; width: 100%; box-sizing: border-box;
}
.hint-title { display: flex; gap: 8px; align-items: center; font-weight: 500; font-size: 12px; }
.hint-title strong { color: #b45309; }
.hint-occ-list { display: flex; flex-wrap: wrap; gap: 4px; }
.hint-occ { display: flex; gap: 4px; align-items: center; background: rgba(255,255,255,0.7); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(251,191,36,0.3); font-size: 11px; }
.h-line { font-weight: 700; color: #b45309; }
.h-syl { font-style: italic; color: #78350f; }
.h-notes { font-family: monospace; font-size: 10px; color: #d97706; background: rgba(255,255,255,0.9); padding: 1px 3px; border-radius: 4px; }

.line-selector-group { display: flex; align-items: center; gap: 8px; background: #f8fafc; padding: 4px 10px; border-radius: 8px; border: 1px solid #e2e8f0; }
.line-selector-group label { font-size: 12px; font-weight: 600; color: #64748b; }
.line-select { padding: 4px 8px; border-radius: 4px; border: 1px solid #cbd5e1; background: white; font-weight: 600; color: #1e293b; }
.custom-input { padding: 4px 8px; border-radius: 4px; border: 1px solid #cbd5e1; width: 120px; }
.general-hint-bubble {
    margin-left: 20px; background: #f1f5f9; border: 1px solid #e2e8f0; 
    padding: 6px 14px; border-radius: 20px; font-size: 13px; color: #475569;
    display: flex; gap: 10px; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.main-body { flex: 1; overflow: hidden; position: relative; background: #f8fafc; }

/* Overview */
.overview-grid { padding: 20px; height: 100%; overflow-y: auto; }
.overview-toolbar { margin-bottom: 20px; }
.regions-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 15px; }
.region-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
.region-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.r-preview { height: 100px; background: #0f172a; display: flex; justify-content: center; align-items: center; }
.r-info { padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; gap: 10px; }
.r-info h4 { margin: 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }

/* Detail Split */
.detail-split { display: flex; height: 100%; }
.detail-canvas { flex: 1; border-right: 1px solid #e2e8f0; background: #0f172a; position: relative; }
.detail-sidebar { width: 350px; display: flex; flex-direction: column; background: white; border-left: 1px solid #ddd; }

.config-panel { 
    width: 320px; background: #fdfdfd; border-right: 1px solid #e2e8f0; 
    display: flex; flex-direction: column; height: 100%;
}
.tool-section { padding: 15px; border-bottom: 1px solid #eee; display: flex; flex-direction: column; flex: 3; overflow: hidden; }
.items-section { padding: 15px; border-bottom: 1px solid #eee; display: flex; flex-direction: column; flex: 2; overflow: hidden; background: #f8fafc; min-height: 200px; }

.variant-controls { margin-bottom: 10px; padding: 10px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; }
.active-label { display: block; font-weight: bold; margin-bottom: 5px; color: #3b82f6; text-align: center; font-size: 1.1em; }
.letters { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; }
.letters .btn-xs { min-width: 24px; text-align: center; }
.letters .btn-xs.active { background: #3b82f6; color: white; border-color: #2563eb; }

.pattern-list-header { margin-top: 10px; }
.pattern-search { width: 100%; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; box-sizing: border-box; }
.fallback-badge { font-size: 10px; color: #f59e0b; background: #fffbeb; border: 1px solid #fef3c7; padding: 2px 6px; border-radius: 4px; margin-top: 4px; text-align: center; }

.pattern-list { overflow-y: auto; flex: 1; margin-top: 6px; border: 1px solid #e2e8f0; border-radius: 4px; }
.pat-option { padding: 8px; display: flex; align-items: center; gap: 8px; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
.pat-option:hover { background: #f8fafc; }
.pat-option.active { background: #eff6ff; border-left: 3px solid #3b82f6; }

.items-list { overflow-y: auto; flex: 1; margin-top: 10px; }
.item-row { background: white; padding: 8px; margin-bottom: 6px; border-radius: 4px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all 0.2s; }
.item-row:hover { border-color: #3b82f6; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.pat-tag { display: flex; align-items: center; gap: 8px; font-family: monospace; }
.d-id { font-weight: 800; color: #2563eb; font-size: 13px; }
.p-name { color: #64748b; font-size: 11px; }
.link-icon { font-size: 12px; opacity: 0.7; }

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
.creator-guidance { flex: 1; display: flex; justify-content: center; align-items: center; }
.general-hint { font-size: 13px; color: #475569; background: #f1f5f9; padding: 6px 14px; border-radius: 20px; border: 1px solid #e2e8f0; }
.close { font-size:24px; cursor:pointer; margin-left: 15px; }
.modal-body-annot { flex:1; overflow:hidden; position: relative; }
.modal-body-link { flex: 1; overflow-y: auto; margin-top: 10px; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 8px; border-bottom: 1px solid #eee; text-align: left; }
.notes-cell { font-family: monospace; color: #666; font-size: 0.9em; }
.other-annot-badge {
    margin-left: auto;
    background: #e2e8f0;
    color: #475569;
    font-size: 0.7rem;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 12px;
    cursor: help;
}
.pat-option.active .other-annot-badge {
    background: rgba(255, 255, 255, 0.2);
    color: white;
}
</style>
