<script setup>
import { ref, computed, watch } from 'vue';
import { useDataManagement } from '../composables/useDataManagement';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useIiifStore } from '../stores/iiif';
import { useOmmrStore } from '../stores/ommr';
import { getManuscriptStats } from '../utils/workspaceSharing';

const props = defineProps({
    isOpen: { type: Boolean, default: false },
    source: { type: String, default: '' }
});

const emit = defineEmits(['close', 'deleted']);

const { getLocalFullState, deleteManuscriptData } = useDataManagement();
const annotStore = useAnnotationsStore();
const tablesStore = usePersonalTablesStore();
const iiifStore = useIiifStore();
const ommrStore = useOmmrStore();

// Selection options
const deleteSnippets = ref(true);
const deleteRegions = ref(true);
const deleteManualLines = ref(true);
const deleteTable = ref(false);
const deleteIiifLink = ref(false);
const deleteOmmrDataset = ref(false);

// Folio scope
const folioScope = ref('all'); // 'all' | 'specific'
const selectedFolios = ref([]);

// Stats for current source
const sourceStats = computed(() => {
    if (!props.source) return null;
    const state = getLocalFullState();
    const stats = getManuscriptStats(state, props.source);
    
    // Check if IIIF manifest exists
    const hasIiif = !!(iiifStore.links && iiifStore.links[props.source]);
    
    // Check if OMMR dataset loaded
    const hasOmmr = !!(ommrStore.loadedDatasets && ommrStore.loadedDatasets[props.source]);
    
    return {
        ...stats,
        hasIiif,
        hasOmmr
    };
});

// Reset selections on open
watch(() => props.isOpen, (open) => {
    if (open) {
        deleteSnippets.value = true;
        deleteRegions.value = true;
        deleteManualLines.value = true;
        deleteTable.value = false;
        deleteIiifLink.value = false;
        deleteOmmrDataset.value = false;
        folioScope.value = 'all';
        selectedFolios.value = sourceStats.value?.foliosList ? [...sourceStats.value.foliosList] : [];
    }
});

function toggleAllFolios(checked) {
    if (checked && sourceStats.value?.foliosList) {
        selectedFolios.value = [...sourceStats.value.foliosList];
    } else {
        selectedFolios.value = [];
    }
}

function executeDelete() {
    if (!props.source) return;
    
    const confirmMsg = `Are you sure you want to remove the selected data for manuscript "${props.source}"?`;
    if (!confirm(confirmMsg)) return;

    const foliosToTarget = folioScope.value === 'specific' ? selectedFolios.value : null;

    deleteManuscriptData(props.source, {
        snippets: deleteSnippets.value,
        regions: deleteRegions.value,
        manualLines: deleteManualLines.value,
        table: deleteTable.value,
        iiifLink: deleteIiifLink.value,
        ommrDataset: deleteOmmrDataset.value,
        folios: foliosToTarget
    });

    emit('deleted', `Successfully deleted selected data for "${props.source}".`);
    emit('close');
}

function executePurgeAll() {
    if (!props.source) return;
    const confirmMsg = `WARNING: This will permanently delete ALL annotations, line regions, table patterns, and links for "${props.source}". Proceed?`;
    if (!confirm(confirmMsg)) return;

    deleteManuscriptData(props.source, {
        snippets: true,
        regions: true,
        manualLines: true,
        table: true,
        iiifLink: true,
        ommrDataset: true,
        folios: null
    });

    emit('deleted', `Purged all data for "${props.source}".`);
    emit('close');
}
</script>

<template>
<div v-if="isOpen" class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-panel">
        <div class="modal-head">
            <div class="head-title">
                <span class="icon">🗑️</span>
                <h3>Manage / Delete Manuscript Data</h3>
            </div>
            <button class="close-btn" @click="$emit('close')">✕</button>
        </div>

        <div class="modal-body" v-if="sourceStats">
            <div class="source-summary-card">
                <div class="src-title">
                    <h4>{{ source }}</h4>
                    <span class="src-badge" v-if="sourceStats.hasData">Has Workspace Data</span>
                    <span class="src-badge empty" v-else>No Data</span>
                </div>
                
                <div class="stat-pills">
                    <span class="stat-pill" :class="{ empty: !sourceStats.annotationsCount }">
                        <b>{{ sourceStats.annotationsCount }}</b> Snippets
                    </span>
                    <span class="stat-pill" :class="{ empty: !sourceStats.regionsCount }">
                        <b>{{ sourceStats.regionsCount }}</b> Lines
                    </span>
                    <span class="stat-pill" :class="{ empty: !sourceStats.foliosCount }">
                        <b>{{ sourceStats.foliosCount }}</b> Folios
                    </span>
                    <span class="stat-pill" :class="{ empty: !sourceStats.patternRowsCount }">
                        <b>{{ sourceStats.patternRowsCount }}</b> Table Rows
                    </span>
                    <span class="stat-pill" v-if="sourceStats.hasIiif">
                        ✓ IIIF Linked
                    </span>
                    <span class="stat-pill" v-if="sourceStats.hasOmmr">
                        ✓ OMMR Dataset
                    </span>
                </div>
            </div>

            <div class="options-section">
                <h5>What would you like to remove?</h5>
                
                <div class="checkbox-group">
                    <label class="opt-row" :class="{ disabled: !sourceStats.annotationsCount }">
                        <input type="checkbox" v-model="deleteSnippets" :disabled="!sourceStats.annotationsCount" />
                        <div class="opt-text">
                            <strong>Snippet Annotations</strong>
                            <small>Removes cropped neume snippet annotations ({{ sourceStats.annotationsCount }} items)</small>
                        </div>
                    </label>

                    <label class="opt-row" :class="{ disabled: !sourceStats.regionsCount }">
                        <input type="checkbox" v-model="deleteRegions" :disabled="!sourceStats.regionsCount" />
                        <div class="opt-text">
                            <strong>Staff Line Regions</strong>
                            <small>Removes polygon boundaries for staff lines ({{ sourceStats.regionsCount }} lines)</small>
                        </div>
                    </label>

                    <label class="opt-row">
                        <input type="checkbox" v-model="deleteManualLines" />
                        <div class="opt-text">
                            <strong>Manual Line Number Registers</strong>
                            <small>Resets line number list for this manuscript</small>
                        </div>
                    </label>

                    <label class="opt-row" :class="{ disabled: !sourceStats.patternRowsCount }">
                        <input type="checkbox" v-model="deleteTable" :disabled="!sourceStats.patternRowsCount" />
                        <div class="opt-text">
                            <strong>Personal Transcription Table</strong>
                            <small>Deletes the entire transcription equivalents table for this manuscript ({{ sourceStats.patternRowsCount }} rows)</small>
                        </div>
                    </label>

                    <label class="opt-row" :class="{ disabled: !sourceStats.hasIiif }">
                        <input type="checkbox" v-model="deleteIiifLink" :disabled="!sourceStats.hasIiif" />
                        <div class="opt-text">
                            <strong>Linked IIIF Manifest URL</strong>
                            <small>Unlinks the IIIF manifest for this manuscript</small>
                        </div>
                    </label>

                    <label class="opt-row" v-if="sourceStats.hasOmmr">
                        <input type="checkbox" v-model="deleteOmmrDataset" />
                        <div class="opt-text">
                            <strong>Loaded OMMR In-Memory Dataset</strong>
                            <small>Clears raw OMMR PCGTS parse cache</small>
                        </div>
                    </label>
                </div>
            </div>

            <!-- Optional Folio Scope -->
            <div class="options-section" v-if="sourceStats.foliosCount > 1">
                <h5>Scope / Folio Filter</h5>
                <div class="scope-radios">
                    <label class="radio-label">
                        <input type="radio" v-model="folioScope" value="all" />
                        <span>All Folios in Manuscript ({{ sourceStats.foliosCount }} folios)</span>
                    </label>
                    <label class="radio-label">
                        <input type="radio" v-model="folioScope" value="specific" />
                        <span>Select Specific Folios Only</span>
                    </label>
                </div>

                <div v-if="folioScope === 'specific'" class="folio-picker-box">
                    <div class="picker-head">
                        <button class="btn-xs" @click="toggleAllFolios(true)">Select All</button>
                        <button class="btn-xs" @click="toggleAllFolios(false)">Deselect All</button>
                        <span class="count-note">{{ selectedFolios.length }} of {{ sourceStats.foliosList.length }} selected</span>
                    </div>
                    <div class="folio-chips">
                        <label v-for="f in sourceStats.foliosList" :key="f" class="folio-chip" :class="{ selected: selectedFolios.includes(f) }">
                            <input type="checkbox" :value="f" v-model="selectedFolios" />
                            <span>{{ f }}</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>

        <div class="modal-foot">
            <button class="btn-danger-outline" @click="executePurgeAll" title="Completely purge all data for this manuscript">
                🔥 Purge Everything
            </button>
            <div class="foot-right">
                <button class="btn-secondary" @click="$emit('close')">Cancel</button>
                <button 
                    class="btn-danger" 
                    @click="executeDelete"
                    :disabled="!deleteSnippets && !deleteRegions && !deleteManualLines && !deleteTable && !deleteIiifLink && !deleteOmmrDataset"
                >
                    Delete Selected Data
                </button>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}
.modal-panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    width: min(560px, 96vw);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
    animation: scaleIn 0.15s ease;
}
@keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }

.modal-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-muted, rgba(255, 255, 255, 0.03));
}
.head-title {
    display: flex;
    align-items: center;
    gap: 10px;
}
.head-title h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
}
.close-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    color: var(--color-text-muted);
    cursor: pointer;
}
.close-btn:hover { color: var(--color-text); }

.modal-body {
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.source-summary-card {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 14px 16px;
}
.src-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}
.src-title h4 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--color-primary);
}
.src-badge {
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(16, 185, 129, 0.15);
    color: var(--color-success);
    font-weight: 600;
}
.src-badge.empty {
    background: rgba(255, 255, 255, 0.07);
    color: var(--color-text-muted);
}
.stat-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
.stat-pill {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 0.78rem;
    color: var(--color-text);
}
.stat-pill.empty {
    opacity: 0.5;
}

.options-section h5 {
    margin: 0 0 10px 0;
    font-size: 0.88rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.opt-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
}
.opt-row:hover:not(.disabled) {
    border-color: var(--color-primary);
}
.opt-row.disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
.opt-row input[type="checkbox"] {
    margin-top: 3px;
    accent-color: var(--color-danger, #ef4444);
}
.opt-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.opt-text strong {
    font-size: 0.88rem;
    color: var(--color-text);
}
.opt-text small {
    font-size: 0.75rem;
    color: var(--color-text-muted);
}

.scope-radios {
    display: flex;
    gap: 18px;
    margin-bottom: 10px;
    flex-wrap: wrap;
}
.radio-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    cursor: pointer;
}
.folio-picker-box {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px;
}
.picker-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.count-note {
    font-size: 0.78rem;
    color: var(--color-text-muted);
    margin-left: auto;
}
.folio-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 140px;
    overflow-y: auto;
}
.folio-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-size: 0.78rem;
    cursor: pointer;
}
.folio-chip.selected {
    border-color: var(--color-danger, #ef4444);
    background: rgba(239, 68, 68, 0.1);
}

.modal-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-muted, rgba(255, 255, 255, 0.03));
    gap: 12px;
    flex-wrap: wrap;
}
.foot-right {
    display: flex;
    gap: 10px;
}

.btn-danger-outline {
    background: transparent;
    border: 1px solid var(--color-danger, #ef4444);
    color: var(--color-danger, #ef4444);
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
}
.btn-danger-outline:hover {
    background: var(--color-danger, #ef4444);
    color: white;
}

.btn-danger {
    background: var(--color-danger, #ef4444);
    border: 1px solid var(--color-danger, #ef4444);
    color: white;
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
}
.btn-danger:hover:not(:disabled) {
    background: #dc2626;
}
.btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
