<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAnnotationsStore } from '../stores/annotations';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { useImageManifest } from '../composables/useImageManifest';
import FolioAnnotator from '../components/FolioAnnotator.vue';
import PatternDisplay from '../components/PatternDisplay.vue';

const route = useRoute();
const router = useRouter();

const annotStore = useAnnotationsStore();
const { sourceFolios, rawData, glyphs } = useTranscriptionData();
const { getImageUrl } = useImageManifest();

// Query params
const source = computed(() => route.query.source || '');
const folio = computed(() => route.query.folio || '');
const regionId = computed(() => route.query.region || '');
const returnTo = computed(() => route.query.return_to || '');
const returnId = computed(() => route.query.return_id || '');
const highlightPattern = computed(() => route.query.highlight || '');

// Editing vs New
const isEditing = computed(() => !!regionId.value);

// Existing regions on page (for overlay context & line calculations)
const pageRegions = computed(() => {
    if (!source.value || !folio.value) return [];
    return annotStore.getRegions(source.value, folio.value);
});

const currentEditingRegion = computed(() => {
    if (!isEditing.value) return null;
    return pageRegions.value.find(r => r.id === regionId.value) || null;
});

// Overlays of OTHER regions on page (dimmed for visual context)
const otherRegionOverlays = computed(() => {
    return pageRegions.value
        .filter(r => r.id !== regionId.value)
        .map(r => ({
            id: r.id,
            points: r.points,
            displayId: r.name
        }));
});

// Lines available in transcription data for this page
const allLinesOnPage = computed(() => {
    if (!source.value || !folio.value || !rawData.value[source.value]) return [];
    const srcData = rawData.value[source.value];
    const lines = new Set();

    for (const pat in srcData) {
        for (const occ of srcData[pat]) {
            if (String(occ[1]) === String(folio.value)) {
                const l = parseInt(occ[2]);
                if (!isNaN(l)) lines.add(l);
            }
        }
    }
    // Also include manually added lines
    const manuals = annotStore.getManualLines(source.value, folio.value);
    manuals.forEach(l => lines.add(l));

    return Array.from(lines).sort((a, b) => a - b);
});

// Line numbers that already have regions
const existingRegionLines = computed(() => {
    const set = new Set();
    pageRegions.value.forEach(r => {
        if (r.id === regionId.value) return; // ignore current
        const m = r.name.match(/(\d+)/);
        if (m) set.add(parseInt(m[1]));
    });
    return set;
});

const linesToAnnotate = computed(() => {
    return allLinesOnPage.value.filter(l => !existingRegionLines.value.has(l));
});

// Target Line selection
const regionNameChoice = ref('');
const customRegionName = ref('');
const initialPoints = ref('');

function parseLineNumber(name) {
    if (!name) return null;
    const m = name.match(/(\d+)/);
    return m ? parseInt(m[1]) : null;
}

const isCustomChoice = computed(() => regionNameChoice.value === 'Custom');

function initForm() {
    if (isEditing.value && currentEditingRegion.value) {
        const reg = currentEditingRegion.value;
        initialPoints.value = reg.points || '';
        const lineNum = parseLineNumber(reg.name);
        if (lineNum !== null && allLinesOnPage.value.includes(lineNum) && reg.name === `Line ${lineNum}`) {
            regionNameChoice.value = `Line ${lineNum}`;
            customRegionName.value = '';
        } else {
            regionNameChoice.value = 'Custom';
            customRegionName.value = reg.name;
        }
    } else {
        initialPoints.value = '';
        if (linesToAnnotate.value.length > 0) {
            regionNameChoice.value = `Line ${linesToAnnotate.value[0]}`;
        } else {
            const maxLineInTranscription = allLinesOnPage.value.length > 0 ? Math.max(...allLinesOnPage.value) : 0;
            const maxLineInRegions = pageRegions.value.length > 0 ? Math.max(...pageRegions.value.map(r => parseLineNumber(r.name) || 0)) : 0;
            regionNameChoice.value = `Line ${Math.max(maxLineInTranscription, maxLineInRegions) + 1}`;
        }
        customRegionName.value = '';
    }
}

onMounted(() => {
    initForm();
});

watch([isEditing, currentEditingRegion, allLinesOnPage], () => {
    initForm();
});

// Highlight hint (if opened from gallery)
const highlightHint = computed(() => {
    if (!highlightPattern.value || !source.value || !folio.value || !rawData.value[source.value]) return null;
    const pat = highlightPattern.value;
    const srcData = rawData.value[source.value];
    const occs = [];
    for (const p in srcData) {
        if (p === pat || p.startsWith(pat + ' ')) {
            for (const o of srcData[p]) {
                if (String(o[1]) === String(folio.value)) {
                    occs.push(o);
                }
            }
        }
    }
    if (occs.length === 0) return null;
    return {
        pattern: pat,
        lines: Array.from(new Set(occs.map(o => parseInt(o[2])).filter(n => !isNaN(n)))),
        occurrences: occs
    };
});

function handleSave(points) {
    let finalName = regionNameChoice.value;
    if (finalName === 'Custom') {
        finalName = customRegionName.value.trim() || `Line ${pageRegions.value.length + 1}`;
    }

    let targetRegionId = regionId.value;

    if (isEditing.value && targetRegionId) {
        annotStore.updateRegion(source.value, folio.value, targetRegionId, {
            name: finalName,
            points
        });
    } else {
        targetRegionId = annotStore.addRegion(source.value, folio.value, finalName, points);
    }

    // Return to workspace detail with this region selected
    router.push({
        name: 'polygons',
        query: {
            source: source.value,
            folio: folio.value,
            region: targetRegionId,
            return_to: returnTo.value || undefined,
            return_id: returnId.value || undefined,
            highlight: highlightPattern.value || undefined
        }
    });
}

function handleCancel() {
    if (returnTo.value === 'annotations' && returnId.value) {
        router.push({
            name: 'annotations',
            params: { id: returnId.value },
            query: { gallery: highlightPattern.value || undefined }
        });
        return;
    }
    
    // Normal back to polygons workspace
    router.push({
        name: 'polygons',
        query: {
            source: source.value,
            folio: folio.value,
            region: isEditing.value ? regionId.value : undefined,
            return_to: returnTo.value || undefined,
            return_id: returnId.value || undefined,
            highlight: highlightPattern.value || undefined
        }
    });
}
</script>

<template>
<div class="region-editor-layout">
    <!-- Top Header -->
    <header class="editor-header">
        <div class="header-left">
            <button @click="handleCancel" class="btn-secondary">&larr; Back</button>
            <div class="breadcrumb-info">
                <h2>
                    {{ isEditing ? 'Edit Line Region' : 'Create Line Region' }}
                    <span class="sub-crumb">({{ source }} / {{ folio }})</span>
                </h2>
            </div>
        </div>

        <div class="header-center">
            <div class="target-control-group">
                <label>Line Label:</label>
                <select v-model="regionNameChoice" class="line-select">
                    <optgroup label="Available / Unannotated Lines">
                        <option v-for="l in linesToAnnotate" :key="'missing-' + l" :value="'Line ' + l">Line {{ l }}</option>
                    </optgroup>
                    <optgroup label="Existing Lines on Page">
                        <option 
                            v-for="l in allLinesOnPage.filter(l => existingRegionLines.has(l))" 
                            :key="'existing-' + l" 
                            :value="'Line ' + l"
                            :disabled="!isEditing || currentEditingRegion?.name !== ('Line ' + l)"
                        >
                            Line {{ l }} {{ isEditing && currentEditingRegion?.name === ('Line ' + l) ? '(Current)' : '✓' }}
                        </option>
                    </optgroup>
                    <option value="Custom">Custom Name...</option>
                </select>
                <input 
                    v-if="isCustomChoice" 
                    v-model="customRegionName" 
                    placeholder="Enter custom line name..." 
                    class="custom-line-input" 
                />
            </div>
        </div>

        <div class="header-right">
            <span class="status-tip">Drag a box on the folio. Click "Save Selection" when done.</span>
        </div>
    </header>

    <!-- Context Guidance Bar -->
    <div v-if="highlightHint" class="guidance-bar highlight">
        <div class="hint-label">
            Target Notation Pattern: <PatternDisplay :pattern="highlightHint.pattern" :glyphs="glyphs" class="hint-visual" /> 
            <strong>{{ highlightHint.pattern }}</strong>
        </div>
        <div class="hint-pills">
            <span v-for="(occ, idx) in highlightHint.occurrences" :key="idx" class="hint-pill">
                <strong>L{{ occ[2] }}</strong> "{{ occ[3] }}" ({{ occ[4] }})
            </span>
        </div>
    </div>
    <div v-else-if="allLinesOnPage.length > 0" class="guidance-bar">
        <span>Lines in source transcription: <strong>{{ allLinesOnPage.join(', ') }}</strong></span>
    </div>

    <!-- Main Canvas Area -->
    <main class="editor-canvas-container">
        <FolioAnnotator 
            v-if="getImageUrl(source, folio)"
            :imageUrl="getImageUrl(source, folio)" 
            :existingPoints="initialPoints"
            :overlays="otherRegionOverlays"
            @save="handleSave"
            @cancel="handleCancel"
        />
        <div v-else class="empty-canvas-state">
            <p>Could not load folio image for <strong>{{ source }} / {{ folio }}</strong>.</p>
            <button @click="handleCancel" class="btn-primary">Return to Workspace</button>
        </div>
    </main>
</div>
</template>

<style scoped>
.region-editor-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: var(--color-bg);
    overflow: hidden;
}

.editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: white;
    border-bottom: 1px solid var(--color-border);
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    z-index: 20;
    gap: 15px;
    flex-wrap: wrap;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 15px;
}

.breadcrumb-info h2 {
    margin: 0;
    font-size: 1.15rem;
    color: var(--color-text);
}

.sub-crumb {
    font-size: 0.9rem;
    font-weight: normal;
    color: var(--color-text-muted);
    margin-left: 6px;
}

.header-center {
    display: flex;
    align-items: center;
    gap: 10px;
}

.target-control-group {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-bg);
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--color-border);
}

.target-control-group label {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--color-text);
}

.line-select {
    padding: 5px 8px;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    font-size: 0.9rem;
    font-weight: 500;
    outline: none;
    background: white;
}

.custom-line-input {
    padding: 5px 8px;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    font-size: 0.9rem;
    width: 160px;
}

.header-right {
    display: flex;
    align-items: center;
    gap: 10px;
}

.status-tip {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    font-style: italic;
}

.guidance-bar {
    padding: 8px 20px;
    background: var(--color-surface-muted);
    border-bottom: 1px solid var(--color-border);
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.guidance-bar.highlight {
    background: var(--color-warning-light);
    border-color: rgba(251, 191, 36, 0.4);
    color: var(--color-warning-dark);
}

.hint-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
}

.hint-visual {
    height: 24px;
    background: white;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid rgba(251,191,36,0.5);
}

.hint-pills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}

.hint-pill {
    background: rgba(255,255,255,0.85);
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid rgba(251,191,36,0.5);
    font-size: 0.8rem;
}

.editor-canvas-container {
    flex: 1;
    position: relative;
    overflow: hidden;
}

.empty-canvas-state {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: var(--color-text-muted);
    gap: 15px;
}

.btn-secondary {
    background: white;
    color: var(--color-text);
    border: 1px solid var(--color-border);
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.15s;
}

.btn-secondary:hover {
    background: var(--color-surface-muted);
}

.btn-primary {
    background: var(--color-primary);
    color: white;
    border: none;
    padding: 6px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
}

.btn-primary:hover {
    background: var(--color-primary-hover);
}
</style>
