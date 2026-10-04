<script setup>
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { folioToIndex, indexToFolio } from '../../utils/folioMath';

const store = useSettingsStore();
const { sourceFolios } = useTranscriptionData();

const editingAlignment = ref(null); // { source, dataType, iiifType, offset, adjustments }
const testDataFolio = ref('170r');

const availableSources = computed(() => Object.keys(sourceFolios.value || {}).sort());
const configuredAlignments = computed(() => Object.keys(store.sourceAlignments || {}));

function startEditAlignment(source) {
    const existing = store.sourceAlignments[source];
    if (existing) {
        editingAlignment.value = {
            source,
            dataType: existing.dataType || 'foliated',
            iiifType: existing.iiifType || 'paginated',
            offset: existing.offset || 0,
            adjustments: existing.adjustments ? JSON.parse(JSON.stringify(existing.adjustments)) : []
        };
    } else {
        editingAlignment.value = {
            source: source || '',
            dataType: 'foliated',
            iiifType: 'paginated',
            offset: 0,
            adjustments: []
        };
    }
}

function saveAlignment() {
    const edit = editingAlignment.value;
    if (!edit.source) return;
    store.setSourceAlignment(edit.source, {
        dataType: edit.dataType,
        iiifType: edit.iiifType,
        offset: parseInt(edit.offset) || 0,
        adjustments: edit.adjustments.map(r => ({ fromFolio: r.fromFolio, adjust: parseInt(r.adjust)||0 }))
    });
    editingAlignment.value = null;
}

function deleteAlignment(source) {
    store.removeSourceAlignment(source);
}

function addAdjustment() {
    editingAlignment.value.adjustments.push({ fromFolio: '1r', adjust: 1 });
}
function removeAdjustment(idx) {
    editingAlignment.value.adjustments.splice(idx, 1);
}

const alignPreview = computed(() => {
    if (!editingAlignment.value) return '';
    const startStr = testDataFolio.value;
    const dataIdx = folioToIndex(startStr, editingAlignment.value.dataType);
    if (dataIdx === null) return 'Invalid Data Folio';
    
    let totalOffset = parseInt(editingAlignment.value.offset) || 0;
    for (const rule of editingAlignment.value.adjustments) {
        const ruleIdx = folioToIndex(rule.fromFolio, editingAlignment.value.dataType);
        if (ruleIdx !== null && dataIdx >= ruleIdx) {
            totalOffset += (parseInt(rule.adjust) || 0);
        }
    }
    
    const iiifIdx = dataIdx + totalOffset;
    const iiifStr = indexToFolio(iiifIdx, editingAlignment.value.iiifType);
    return `Data [${startStr}] ➔ IIIF [${iiifStr || 'Invalid'}]`;
});
</script>

<template>
    <div class="card section settings-card">
            <h2>Manuscript Alignment</h2>
            <p class="desc">Map and align folios between transcription data and IIIF manifests. Supports jumping offsets.</p>

            <div v-if="!editingAlignment">
                <div class="ids-list">
                    <table v-if="configuredAlignments.length > 0">
                        <thead>
                            <tr>
                                <th>Source</th>
                                <th>Data</th>
                                <th>IIIF</th>
                                <th>Base Offset</th>
                                <th>Rules</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="src in configuredAlignments" :key="src">
                                <td class="code-font">{{ src }}</td>
                                <td>{{ store.sourceAlignments[src].dataType }}</td>
                                <td>{{ store.sourceAlignments[src].iiifType }}</td>
                                <td>{{ store.sourceAlignments[src].offset }}</td>
                                <td>{{ store.sourceAlignments[src].adjustments?.length || 0 }} jumps</td>
                                <td>
                                    <button @click="startEditAlignment(src)" class="btn-sm btn-primary mr-8">Edit</button>
                                    <button @click="deleteAlignment(src)" class="btn-sm btn-danger">Remove</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-else class="empty mb-15">No manuscripts have custom alignment rules configured.</div>
                </div>
                <button @click="startEditAlignment('')" class="btn-primary">Add Configuration</button>
            </div>

            <div v-else class="alignment-editor">
                <div class="setting-row" v-if="!store.sourceAlignments[editingAlignment.source]">
                    <label>Select Manuscript to Configure</label>
                    <select v-model="editingAlignment.source">
                        <option value="">-- Select Source --</option>
                        <option v-for="src in availableSources" :key="src" :value="src">{{ src }}</option>
                    </select>
                </div>
                <h3 v-else class="mt-0">Configuring: {{ editingAlignment.source }}</h3>

                <div class="align-grid">
                    <div>
                        <label>Data Format</label>
                        <label class="radio-label"><input type="radio" value="foliated" v-model="editingAlignment.dataType"> Foliated (1r, 1v)</label>
                        <label class="radio-label"><input type="radio" value="paginated" v-model="editingAlignment.dataType"> Paginated (1, 2)</label>
                    </div>
                    <div>
                        <label>IIIF Format</label>
                        <label class="radio-label"><input type="radio" value="foliated" v-model="editingAlignment.iiifType"> Foliated (1r, 1v)</label>
                        <label class="radio-label"><input type="radio" value="paginated" v-model="editingAlignment.iiifType"> Paginated (1, 2)</label>
                    </div>
                    <div>
                        <label>Base Offset</label>
                        <input type="number" v-model="editingAlignment.offset" class="w-80-p6">
                        <p class="text-sm-light">Applied to all folios</p>
                    </div>
                </div>

                <div class="jump-rules">
                    <div class="flex-between-mb10">
                        <label class="fw-bold">Jump Rules</label>
                        <button @click="addAdjustment" class="btn-sm btn-secondary">+ Add Jump</button>
                    </div>
                    <p class="text-sm-muted-mt0">Use this if the IIIF manifest skips images or jumps midway (e.g. missing pages).</p>
                
                    <table v-if="editingAlignment.adjustments.length > 0">
                        <thead><tr><th>From Data Folio</th><th>Extra Offset</th><th></th></tr></thead>
                        <tbody>
                            <tr v-for="(rule, idx) in editingAlignment.adjustments" :key="idx">
                                <td><input v-model="rule.fromFolio" placeholder="e.g. 170r"></td>
                                <td><input type="number" v-model="rule.adjust" placeholder="e.g. +2"></td>
                                <td><button @click="removeAdjustment(idx)" class="btn-sm btn-danger">X</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="align-preview mt-20">
                    <div class="mb-10">
                        <strong>Live Preview</strong> - Test a Data Folio: 
                        <input v-model="testDataFolio" class="w-60-p4" />
                    </div>
                    <div>{{ alignPreview }}</div>
                </div>

                <div class="add-row add-row-actions">
                    <button @click="editingAlignment = null" class="btn-secondary mr-auto">Cancel</button>
                    <button @click="saveAlignment" class="btn-primary" :disabled="!editingAlignment.source">Save Alignment</button>
                </div>
            </div>
        </div>
</template>

<style scoped>
.alignment-editor { margin-top: 15px; padding: 15px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 6px; }
.align-grid { display: flex; gap: 40px; margin-bottom: 20px; }
.align-grid > div > label { display: block; font-weight: bold; margin-bottom: 8px; color: var(--color-text); }
/* The option labels keep the base look of a radio option (size, radius, hover) and
   only drop its box. */
.radio-label { display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 6px 12px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-bg); transition: all 0.2s; font-size: 0.9em; }
.radio-label:hover:not(.disabled) { background: #f0f0f0; }
.radio-label input { margin: 0; }
.align-grid .radio-label { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-weight: normal; cursor: pointer; border: none; padding: 0; background: transparent; }
.jump-rules { margin-top:20px; padding:15px; background:white; border:1px solid var(--color-border); border-radius:4px; }
.jump-rules table { margin-top:10px; }
.jump-rules input { padding:6px; border:1px solid var(--color-border); border-radius:4px; width:100%; box-sizing:border-box;}
.align-preview { padding: 12px; background: var(--color-primary-light); color: var(--color-primary); border: 1px solid var(--color-primary-light); border-radius: 4px; font-family: monospace; font-size: 1.1em; text-align: center; }
</style>
