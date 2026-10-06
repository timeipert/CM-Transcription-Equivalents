<script setup>
import { ref, watch, computed, reactive } from 'vue';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { useImageManifest } from '../../composables/useImageManifest';
import { useIiifStore } from '../../stores/iiif';
import { useAnnotationsStore } from '../../stores/annotations';
import AlignmentReview from './AlignmentReview.vue';

const props = defineProps(['selectedSource', 'selectedFolio']);
const emits = defineEmits(['select']);

const iiifStore = useIiifStore();
const annotStore = useAnnotationsStore();

const { sourceFolios, loading: dataLoading } = useTranscriptionData();
const { hasImage, loaded: manifestLoaded, getManifestStructure, getStandardFolio, hasTranscriptionData, getAlignmentReport, resolveIiifSource } = useImageManifest();

const alignSource = ref(null);

function getFolioRegionsCount(src, fol) {
    return annotStore.getRegions(src, fol).length;
}


/**
 * Per-source page list that keeps the original scan label visible and shows the
 * data folio it resolved to alongside it, rather than silently replacing one
 * with the other.
 */
const pageTree = computed(() => {
    if (!manifestLoaded.value) return {};

    const manifestStruct = getManifestStructure();
    const dataStruct = sourceFolios.value || {};
    const sources = Array.from(new Set([...Object.keys(manifestStruct), ...Object.keys(dataStruct)])).sort();

    const result = {};
    for (const src of sources) {
        const iiifKey = resolveIiifSource(src) || src;
        const report = iiifStore.parsedData[iiifKey] ? getAlignmentReport(src) : null;
        const hasIiif = !!(iiifStore.links[src] || iiifStore.parsedData[iiifKey]);

        let pages;
        if (report) {
            pages = report.entries.map(e => ({
                key: `c${e.canvasIndex}`,
                label: e.originalLabel,
                folio: e.resolvedFolio,
                via: e.via,
                isDivider: e.isDivider
            }));
        } else {
            const folios = (manifestStruct[src] || dataStruct[src] || []);
            const seen = new Set();
            pages = [];
            for (const f of folios) {
                const std = getStandardFolio(src, f);
                if (seen.has(std)) continue;
                seen.add(std);
                if (manifestStruct[src] || hasImage(src, std)) {
                    pages.push({ key: std, label: std, folio: std, via: 'label' });
                }
            }
        }

        if (pages.length > 0 || hasIiif) result[src] = { hasIiif, pages };
    }
    return result;
});

const folioSearch = reactive({});

function pageMatchesSearch(page, term) {
    if (!term) return true;
    const t = term.toLowerCase();
    return String(page.label).toLowerCase().includes(t)
        || (page.folio && String(page.folio).toLowerCase().includes(t));
}

function onSelect(src, page) {
    const folio = page.folio || page.label;
    if (!folio) return;
    emits('select', { source: src, folio });
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

// Auto-expand the source if it's selected initially. Expanding by hand loads its
// IIIF manifest; a page opened by link or after a reload needs it just the same,
// or its images and canvas labels are missing.
watch(() => props.selectedSource, (newSrc) => {
    if (newSrc && !expandedSources.has(newSrc)) {
        expandedSources.add(newSrc);
    }
    if (newSrc && iiifStore.links[newSrc] && !iiifStore.parsedData[newSrc]) {
        iiifStore.ensureLoaded(newSrc);
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
    <div v-else-if="Object.keys(pageTree).length === 0">
        <div class="empty-state">
            No manuscripts with images found.
        </div>
    </div>
    <div class="tree" v-else>
        <div v-for="(node, src) in pageTree" :key="src" class="tree-node">
            <div class="src-label-container">
                <div class="src-label" @click="toggleSource(src)">
                    <span class="chevron">{{ expandedSources.has(src) ? '▼' : '▶' }}</span>
                    {{ src }}
                    <span v-if="iiifStore.manifestStatus[src]?.status === 'loading'" class="manifest-status loading" title="Loading Manifest...">↻</span>
                    <span v-else-if="iiifStore.manifestStatus[src]?.status === 'error'" class="manifest-status error" :title="iiifStore.manifestStatus[src]?.error">⚠️</span>
                </div>
                <button v-if="node.hasIiif" class="align-icon-btn" @click.stop="alignSource = src" title="Review how scan pages map to folios">⇄</button>
                <button v-if="iiifStore.manifestStatus[src]?.status === 'error'" class="btn-xs retry-btn" @click.stop="iiifStore.ensureLoaded(src)" title="Retry loading IIIF Manifest">Retry</button>
            </div>
            <div class="folio-list" v-show="expandedSources.has(src)">
                <input v-if="node.pages.length > 10"
                       v-model="folioSearch[src]"
                       placeholder="Search page or folio..."
                       class="folio-search"
                       @click.stop />
                <div v-for="page in node.pages.filter(p => pageMatchesSearch(p, folioSearch[src]))" :key="page.key"
                     class="folio-item"
                     :class="{
                         active: selectedSource===src && selectedFolio===(page.folio || page.label),
                         'has-data': page.folio && hasTranscriptionData(src, page.folio),
                         'has-regions': page.folio && getFolioRegionsCount(src, page.folio) > 0,
                         unresolved: node.hasIiif && !page.folio && !page.isDivider,
                         divider: page.isDivider
                      }"
                     :title="page.isDivider ? `“${page.label}” — a structural marker, not a page` : (page.folio ? `Scan “${page.label}” → folio ${page.folio}. ` : `Scan “${page.label}” — no folio matched. `) + (page.folio && getFolioRegionsCount(src, page.folio) > 0 ? `${getFolioRegionsCount(src, page.folio)} line regions annotated. ` : '') + (page.folio && hasTranscriptionData(src, page.folio) ? 'Contains Monodi data' : '')"
                     @click="onSelect(src, page)">
                    <span class="scan-label">{{ page.label }}</span>
                    <span class="folio-side">
                        <span v-if="page.folio && getFolioRegionsCount(src, page.folio) > 0" class="folio-lines-badge">
                            {{ getFolioRegionsCount(src, page.folio) }}L
                        </span>
                        <span v-if="page.isDivider" class="folio-tag divider">—</span>
                        <span v-else-if="page.folio" class="folio-tag" :class="'via-' + page.via">{{ page.folio }}</span>
                        <span v-else class="folio-tag none">?</span>
                    </span>
                </div>
            </div>
        </div>
    </div>

    <AlignmentReview v-if="alignSource" :source="alignSource" @close="alignSource = null" />

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
                <div class="modal-actions">
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
.sidebar { width: 250px; border-right: 1px solid var(--color-border); background: var(--color-bg); display: flex; flex-direction: column; height: 100%; }
.sidebar-header { display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid var(--color-border); background: white; }
.sidebar-header h3 { margin: 0; }
.iiif-btn { background: var(--color-primary-light); color: var(--color-primary-dark); border: 1px solid var(--color-primary-light); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold; }
.iiif-btn:hover { background: var(--color-primary-light); }
.tree { flex: 1; overflow-y: auto; padding: 10px; }
.src-label-container { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-right: 4px; background: var(--color-bg); position: sticky; top:0; z-index: 10; border-radius: 4px; }
.src-label-container:hover { background: var(--color-border); }
.src-label { font-weight: bold; color: var(--color-text-muted); cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 4px; flex: 1; }
.manifest-status.loading { display: inline-block; animation: spin 1s linear infinite; color: var(--color-text-light); font-size: 0.8em; }
.manifest-status.error { color: var(--color-danger); cursor: help; font-size: 0.9em; }
@keyframes spin { 100% { transform: rotate(360deg); } }
.retry-btn { background: var(--color-danger-light); color: var(--color-danger); border: 1px solid var(--color-danger-muted); padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 0.7em; }
.retry-btn:hover { background: var(--color-danger-muted); }
.chevron { font-size: 0.8em; color: var(--color-text-light); }
.folio-list { padding-left: 15px; padding-bottom: 5px; }
.folio-search { width: 90%; margin: 4px 0 8px 4px; padding: 4px 8px; border: 1px solid var(--color-border); border-radius: 4px; font-size: 0.85em; }
.folio-item { padding: 4px 10px; cursor: pointer; border-radius: 4px; font-family: monospace; font-size: 0.9em; margin-bottom: 1px; display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.folio-item:hover { background: var(--color-border); }
.folio-item.active { background: var(--color-primary); color: white; }
.folio-item.has-data { font-weight: 600; color: var(--color-text); }
.folio-item.has-regions { border-left: 3px solid var(--color-success); }
.folio-item.active.has-data { color: white; }
.data-indicator { color: var(--color-warning); font-size: 1.2em; line-height: 0.5; margin-right: 2px; }
.folio-name { flex: 1; }
.scan-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-muted, #666); }
.folio-item.active .scan-label { color: rgba(255,255,255,0.85); }
.folio-item.has-data .scan-label { color: var(--color-text); }
.folio-side { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; }
.folio-tag { font-size: 0.82em; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: var(--color-border, #e5e7eb); color: var(--color-text); }
.folio-tag.via-position { background: #fef9c3; color: #854d0e; }
.folio-tag.via-pinned { background: #dbeafe; color: #1e40af; }
.folio-tag.none { background: #fee2e2; color: #991b1b; }
.folio-item.active .folio-tag { background: rgba(255,255,255,0.25); color: #fff; }
.folio-item.unresolved { opacity: 0.7; }
.folio-item.divider { opacity: 0.55; cursor: default; font-style: italic; }
.folio-item.divider .scan-label { color: var(--color-text-muted, #999); }
.folio-tag.divider { background: transparent; color: var(--color-text-muted, #aaa); font-weight: 400; }
.align-icon-btn {
    background: none; border: none; cursor: pointer; font-size: 13px; line-height: 1;
    padding: 3px 5px; border-radius: 4px; color: var(--color-text-light, #999);
    opacity: 0.4; transition: opacity 0.15s, background 0.15s, color 0.15s;
}
.src-label-container:hover .align-icon-btn { opacity: 1; }
.align-icon-btn:hover { background: var(--color-border, #e5e7eb); color: var(--color-text); opacity: 1; }
.folio-lines-badge { background: #dcfce7; color: #166534; font-size: 0.72rem; padding: 1px 5px; border-radius: 10px; font-weight: 700; border: 1px solid #bbf7d0; }
.folio-item.active .folio-lines-badge { background: rgba(255,255,255,0.25); color: white; border-color: rgba(255,255,255,0.4); }

/* Modals */
.modal { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; justify-content:center; align-items:center; z-index:1000; }
.iiif-modal { width: 400px; background: white; border-radius: 8px; overflow: hidden; }
.modal-header { padding: 15px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { margin: 0; }
.close { font-size: 24px; cursor: pointer; color: var(--color-text-light); }
.close:hover { color: var(--color-text); }
.modal-body { padding: 20px; }
.form-group { margin-bottom: 15px; }
.form-group label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 0.9em; color: var(--color-text-muted); }
.form-group input { width: 100%; padding: 8px; border: 1px solid var(--color-border); border-radius: 4px; box-sizing: border-box; }
.btn-primary { background: var(--color-primary); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-primary:hover:not(:disabled) { background: var(--color-primary-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.empty-state { padding: 10px; color: var(--color-text-light); }
.modal-actions { margin-top: 15px; display: flex; justify-content: flex-end; }

@media (max-width: 768px) {
    .sidebar { width: 100%; height: auto; max-height: 40vh; border-right: none; border-bottom: 1px solid var(--color-border); flex: none; }
    .tree { max-height: 30vh; }
}
</style>
