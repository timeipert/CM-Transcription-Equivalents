<script setup>
import { reactive, ref } from 'vue';

/**
 * Asks, for each manuscript an incoming file shares with the workspace, whether
 * to skip it, import it as a copy or overwrite the local one. Shows the figures
 * for both sides so the choice is informed.
 *
 * `analysis` is one result of `analyzeImportFiles`. The choices start at "skip"
 * (nothing is replaced unless the user says so); mount it fresh for each import.
 */
const props = defineProps({
    analysis: { type: Object, required: true }
});
const emit = defineEmits(['confirm', 'cancel']);

const choices = reactive({});
for (const item of props.analysis.overlapSources || []) choices[item.source] = 'skip';
const importSettings = ref(!!props.analysis.hasSettings);

function setAllMergeChoices(choice) {
    for (const item of props.analysis.overlapSources || []) {
        // Do not allow overwrite/copy if incoming has no data
        if (choice !== 'skip' && !item.incomingStats.hasData) continue;
        choices[item.source] = choice;
    }
}

function confirm() {
    emit('confirm', { choices: { ...choices }, importSettings: importSettings.value });
}
</script>

<template>
    <div class="modal">
        <div class="modal-content" style="width: 750px; max-width: 95vw;">
            <div class="modal-header">
                <h3>Merge Conflict Resolution</h3>
                <span class="close" @click="$emit('cancel')">&times;</span>
            </div>
            <div class="modal-body">
                <p>The imported file <strong>{{ analysis.fileName }}</strong> contains data for manuscripts that already exist in your workspace.</p>
            
                <div v-if="analysis.newSources && analysis.newSources.length > 0" class="merge-section">
                    <h4>New Manuscripts (Will be imported safely)</h4>
                    <div class="new-sources-list">
                        <span v-for="item in analysis.newSources" :key="item.source" class="badge">
                            {{ item.source }} ({{ item.incomingStats.annotationsCount }} snips, {{ item.incomingStats.foliosCount }} fols)
                        </span>
                    </div>
                </div>

                <div class="merge-section">
                    <div class="merge-section-header">
                        <h4>Overlapping Manuscripts</h4>
                        <div v-if="analysis.overlapSources && analysis.overlapSources.length > 0" class="bulk-select-bar">
                            <span class="bulk-label">Select all:</span>
                            <button type="button" class="btn-bulk" @click="setAllMergeChoices('skip')">Skip All</button>
                            <button type="button" class="btn-bulk" @click="setAllMergeChoices('copy')">Import All as Copy</button>
                            <button type="button" class="btn-bulk btn-bulk-danger" @click="setAllMergeChoices('overwrite')">Overwrite All</button>
                        </div>
                    </div>
                    <p class="desc">Compare the incoming vs local data metrics below and select the desired action for each manuscript.</p>
                
                    <div class="conflict-list">
                        <div v-for="item in analysis.overlapSources" :key="item.source" class="conflict-card">
                            <div class="conflict-header-row">
                                <span class="src-name">{{ item.source }}</span>
                                <div class="conflict-stats-row">
                                    <div class="stat-pill incoming">
                                        <strong>Incoming File:</strong>
                                        <span v-if="item.incomingStats.hasData">
                                            {{ item.incomingStats.annotationsCount }} snips across {{ item.incomingStats.foliosCount }} fols ({{ item.incomingStats.foliosList.slice(0, 4).join(', ') }}{{ item.incomingStats.foliosList.length > 4 ? '...' : '' }})
                                        </span>
                                        <span v-else class="text-muted">Empty (0 annotations)</span>
                                    </div>
                                    <div class="stat-pill local">
                                        <strong>Local Workspace:</strong>
                                        <span v-if="item.localStats.hasData">
                                            {{ item.localStats.annotationsCount }} snips across {{ item.localStats.foliosCount }} fols ({{ item.localStats.foliosList.slice(0, 4).join(', ') }}{{ item.localStats.foliosList.length > 4 ? '...' : '' }})
                                        </span>
                                        <span v-else class="text-muted">Empty</span>
                                    </div>
                                </div>
                            </div>

                            <div class="conflict-actions mt-10">
                                <label class="radio-label" :class="{ selected: choices[item.source] === 'skip' }">
                                    <input type="radio" :name="'merge_' + item.source" value="skip" v-model="choices[item.source]">
                                    Skip
                                </label>
                                <label 
                                    :class="['radio-label', { selected: choices[item.source] === 'copy', disabled: !item.incomingStats.hasData }]"
                                    :title="!item.incomingStats.hasData ? 'Cannot copy empty manuscript' : ''"
                                >
                                    <input type="radio" :name="'merge_' + item.source" value="copy" v-model="choices[item.source]" :disabled="!item.incomingStats.hasData">
                                    Import as Copy
                                </label>
                                <label 
                                    :class="['radio-label overwrite', { selected: choices[item.source] === 'overwrite', disabled: !item.incomingStats.hasData }]"
                                    :title="!item.incomingStats.hasData ? 'Cannot overwrite with empty manuscript' : ''"
                                >
                                    <input type="radio" :name="'merge_' + item.source" value="overwrite" v-model="choices[item.source]" :disabled="!item.incomingStats.hasData">
                                    Overwrite Local
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="analysis.hasSettings" class="merge-section">
                    <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" v-model="importSettings" />
                        <strong>Import App Settings &amp; Preferences</strong> (global IDs, neume names, alignments) from this file
                    </label>
                </div>
            </div>
            <div class="modal-footer">
                <button @click="$emit('cancel')" class="btn-secondary">Cancel</button>
                <button @click="confirm" class="btn-primary">Confirm Import</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background: white; border-radius: 8px; width: 600px; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
.modal-header { padding: 20px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { margin: 0; }
.close { font-size: 24px; cursor: pointer; color: var(--color-text-light); }
.close:hover { color: var(--color-text); }
.modal-body { padding: 20px; overflow-y: auto; flex: 1; }
.modal-footer { padding: 20px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 10px; background: var(--color-bg); }
.modal-footer .btn-secondary { background: white; color: var(--color-text); border: 1px solid var(--color-border); padding: 8px 16px; border-radius: 4px; cursor: pointer; }
.modal-footer .btn-secondary:hover { background: var(--color-surface-muted); }
.modal-footer .btn-primary { background: var(--color-primary); color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; }
.modal-footer .btn-primary:hover { background: var(--color-primary-hover); }

.desc { color: var(--color-text-muted); font-size: 14px; margin-top: -5px; margin-bottom: 15px; }
.merge-section { margin-top: 20px; padding: 15px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-bg); }
.merge-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }
.merge-section-header h4 { margin: 0; color: var(--color-text); }
.bulk-select-bar { display: flex; align-items: center; gap: 6px; }
.bulk-label { font-size: 0.85em; color: var(--color-text-muted); font-weight: 500; }
.btn-bulk { padding: 4px 10px; font-size: 0.8em; border-radius: 4px; border: 1px solid var(--color-border); background: white; cursor: pointer; color: var(--color-text); transition: all 0.15s; font-weight: 500; }
.btn-bulk:hover { background: var(--color-primary-light); border-color: var(--color-primary); color: var(--color-primary); }
.btn-bulk-danger:hover { background: var(--color-danger-light, #fee2e2); border-color: var(--color-danger); color: var(--color-danger); }
.merge-section h4 { margin-top: 0; margin-bottom: 10px; color: var(--color-text); }
.new-sources-list { display: flex; flex-wrap: wrap; gap: 8px; }
.badge { background: var(--color-primary-light); color: var(--color-primary-active); padding: 4px 10px; border-radius: 20px; font-size: 0.85em; font-weight: 500; }

.conflict-list { display: flex; flex-direction: column; gap: 12px; }
.conflict-card { background: white; padding: 14px 16px; border-radius: 8px; border: 1px solid var(--color-border); box-shadow: 0 1px 3px rgba(0,0,0,0.03); }
.conflict-header-row { display: flex; flex-direction: column; gap: 6px; }
.conflict-stats-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.stat-pill { font-size: 0.8rem; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--color-border); }
.stat-pill.incoming { background: var(--color-primary-light); color: var(--color-primary-dark); border-color: var(--color-primary-light); }
.stat-pill.local { background: var(--color-surface-muted); color: var(--color-text); }
.src-name { font-weight: 700; font-size: 1.05rem; color: var(--color-text); }
.conflict-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.mt-10 { margin-top: 10px; }
.radio-label { display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 6px 12px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-bg); transition: all 0.2s; font-size: 0.9em; }
.radio-label:hover:not(.disabled) { background: #f0f0f0; }
.radio-label.selected { background: var(--color-success-light, var(--color-success-light)); border-color: var(--color-success); color: var(--color-success); font-weight: 500; }
.radio-label.overwrite.selected { background: var(--color-danger-light, var(--color-danger-light)); border-color: var(--color-danger); color: var(--color-danger); }
.radio-label.disabled { opacity: 0.45; cursor: not-allowed; }
.radio-label input { margin: 0; }
.text-muted { color: var(--color-text-muted); font-style: italic; }
</style>
