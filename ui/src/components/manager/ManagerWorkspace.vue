<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useManagerWorkspace } from '../../composables/useManagerWorkspace';

import ManagerWorkspaceHeader from './ManagerWorkspaceHeader.vue';
import ManagerWorkspaceOverview from './ManagerWorkspaceOverview.vue';
import ManagerWorkspaceDetail from './ManagerWorkspaceDetail.vue';
import PatternDisplay from '../PatternDisplay.vue';
import FolioAnnotator from '../FolioAnnotator.vue';
import SnippetDetailModal from '../SnippetDetailModal.vue';

const props = defineProps(['source', 'folio', 'initialRegionId', 'highlightPattern', 'returnTo', 'returnId']);
const router = useRouter();

const workspace = useManagerWorkspace(props);

// Destructure some refs that we need to watch or mutate
const { 
    stdSource, stdFolio, highlightHint, allLinesOnPage, regions, existingRegionLines, 
    linesToAnnotate, pagePatterns, otherPageAnnotations, patternSort, patternSearch,
    activeRegion, activeRegionRect, activeRegionItems, activePattern, activeVariant, 
    linkCandidates, patternCustomIdMap, glyphs, getImageUrl, getIiifThumbnailUrl, 
    hasTranscriptionData, getBasePattern, parseLineNumber, annotStore, manualLines
} = workspace;

function handleAddManualLine(num) {
    annotStore.addManualLine(stdSource.value, stdFolio.value, num);
}

function handleRemoveManualLine(num) {
    if (confirm(`Remove manually added line ${num}?`)) {
        annotStore.removeManualLine(stdSource.value, stdFolio.value, num);
    }
}

// Deep Link Watcher
watch([() => props.initialRegionId, regions], ([id, list]) => {
    if (id && list && list.length > 0) {
        const match = list.find(r => r.id === id);
        if (match) activeRegion.value = match;
    }
}, { immediate: true });

// --- UI State for Modals/Linker ---
const showLinker = ref(false);

function navigateToCreateRegion() {
    router.push({
        name: 'region_editor',
        query: {
            source: props.source,
            folio: props.folio,
            return_to: props.returnTo || undefined,
            return_id: props.returnId || undefined,
            highlight: props.highlightPattern || undefined
        }
    });
}

function navigateToEditRegion(regionObj) {
    if (!regionObj || regionObj.isLegacy) return;
    router.push({
        name: 'region_editor',
        query: {
            source: props.source,
            folio: props.folio,
            region: regionObj.id,
            return_to: props.returnTo || undefined,
            return_id: props.returnId || undefined,
            highlight: props.highlightPattern || undefined
        }
    });
}

// Auto-select existing or navigate when navigating from gallery with a highlight
watch(highlightHint, (newHint) => {
    if (props.initialRegionId) return; 
    if (newHint && props.highlightPattern) {
        const targetLines = newHint.lines;
        const existing = regions.value.find(r => {
            const num = parseLineNumber(r.name);
            return num !== null && targetLines.includes(num);
        });
        if (existing) {
            selectRegion(existing);
        } else {
            navigateToCreateRegion();
        }
    }
}, { immediate: true });

function selectPatternBase(pat) {
    const parts = pat.split(' ');
    activePattern.value = parts[0];
    activeVariant.value = parts.length > 1 ? parts[1] : "";
}

function setVariant(v) {
    activeVariant.value = v;
}

const pendingItemPoints = ref(null); 
const selectedSnippet = ref(null);

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
    if (!activePattern.value && pagePatterns.value.list.length > 0) {
        activePattern.value = pagePatterns.value.list[0];
    }
}

function onAnnotateItem(points) {
    if (!activePattern.value) {
        alert("Please select a pattern first.");
        return;
    }
    pendingItemPoints.value = points;
    if (linkCandidates.value.length > 0) {
        showLinker.value = true;
    } else {
        finalizeItem({});
    }
}

function selectLink(occ) {
    finalizeItem({ sysId: Array.isArray(occ) ? occ.join('|') : String(occ) });
}

function finalizeItem(linkData = {}) {
    if (!activeRegion.value || !pendingItemPoints.value) return;
    
    if (activeRegion.value.isLegacy) {
        annotStore.addAnnotation(stdSource.value, stdFolio.value, activePattern.value, pendingItemPoints.value, { linkData, variant: activeVariant.value });
    } else {
        annotStore.addItemToRegion(activeRegion.value.id, activePattern.value, pendingItemPoints.value, { linkData, variant: activeVariant.value });
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

function handleBackToGallery() {
    router.push({ name: 'annotations', params: { id: props.returnId }, query: { gallery: props.highlightPattern } });
}

function handleBackToOverview() {
    activeRegion.value = null;
    router.push({
        name: 'polygons',
        query: {
            ...router.currentRoute.value.query,
            region: undefined
        }
    });
}

</script>

<template>
<div class="workspace-container">
    <div v-if="!source" class="empty-state">Select a Folio from the sidebar.</div>
    <div v-else class="content-wrapper">
        
        <ManagerWorkspaceHeader 
            :source="source"
            :folio="folio"
            :activeRegion="activeRegion"
            :highlightHint="highlightHint"
            :allLinesOnPage="allLinesOnPage"
            :manualLines="manualLines"
            :regions="regions"
            :activeRegionItems="activeRegionItems"
            :returnTo="returnTo"
            :returnId="returnId"
            :glyphs="glyphs"
            :highlightPattern="highlightPattern"
            @backToGallery="handleBackToGallery"
            @backToRegions="handleBackToOverview"
            @editRegion="navigateToEditRegion"
            @addManualLine="handleAddManualLine"
            @removeManualLine="handleRemoveManualLine"
        />
        
        <div class="main-body">
            <ManagerWorkspaceOverview 
                v-if="!activeRegion"
                :source="source"
                :folio="folio"
                :stdSource="stdSource"
                :stdFolio="stdFolio"
                :regions="regions"
                :hasTranscriptionData="hasTranscriptionData"
                :getIiifThumbnailUrl="getIiifThumbnailUrl"
                @openRegionCreator="navigateToCreateRegion"
                @selectRegion="selectRegion"
                @editRegion="navigateToEditRegion"
                @deleteRegion="deleteRegion"
            />
            
            <ManagerWorkspaceDetail 
                v-else
                :source="source"
                :folio="folio"
                :getImageUrl="getImageUrl"
                :activeRegionRect="activeRegionRect"
                :activeRegionItems="activeRegionItems"
                :patternSort="patternSort"
                :activePattern="activePattern"
                :activeVariant="activeVariant"
                :patternSearch="patternSearch"
                :pagePatterns="pagePatterns"
                :glyphs="glyphs"
                :patternCustomIdMap="patternCustomIdMap"
                :otherPageAnnotations="otherPageAnnotations"
                :getBasePattern="getBasePattern"
                @onAnnotateItem="onAnnotateItem"
                @update:patternSort="patternSort = $event"
                @setVariant="setVariant"
                @update:patternSearch="patternSearch = $event"
                @selectPatternBase="selectPatternBase"
                @openSnippet="openSnippet"
                @deleteItem="deleteItem"
            />
        </div>
    </div>

    <!-- Modals -->
    
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
.empty-state { padding: 40px; color: var(--color-text-light); text-align: center; }
.content-wrapper { display: flex; flex-direction: column; height: 100%; }

.main-body { flex: 1; overflow: hidden; position: relative; background: var(--color-bg); }

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

.line-selector-group { display: flex; align-items: center; gap: 8px; background: var(--color-bg); padding: 4px 10px; border-radius: 8px; border: 1px solid var(--color-border); }
.line-selector-group label { font-size: 12px; font-weight: 600; color: var(--color-text-muted); }
.line-select { padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border-hover); background: white; font-weight: 600; color: var(--color-text); }
.custom-input { padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border-hover); width: 120px; }

.btn-primary { background: var(--color-primary); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-primary:hover { background: var(--color-primary-hover); }
.btn-secondary { background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border-hover); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 500; }
.btn-secondary:hover { background: var(--color-surface-muted); }
.btn-sm { padding: 4px 8px; font-size: 12px; }

.modal { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background: white; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
.annot-modal { width: 95vw; height: 95vh; }
.link-modal { width: 600px; max-height: 80vh; }
.modal-header { padding: 15px 20px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; background: var(--color-surface); }
.modal-body-annot { flex: 1; overflow: hidden; position: relative; }
.modal-body-link { padding: 15px; overflow-y: auto; }
.close { font-size: 24px; cursor: pointer; color: var(--color-text-muted); line-height: 1; }
.close:hover { color: var(--color-text); }
.m-0 { margin: 0; }
.flex-center-gap { display: flex; align-items: center; gap: 15px; }

.notes-cell { font-family: monospace; font-size: 11px; color: var(--color-text-muted); max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px; border-bottom: 1px solid var(--color-border); }
th { background: var(--color-surface); font-weight: 600; font-size: 13px; }
tbody tr:hover { background: var(--color-bg); }
</style>
