<script setup>
import { useOmmrContext } from '../../composables/ommr/ommrContext';

const {
    ommrStore,
    availableProjectSources,
    showRemapModal,
    remapTargetSource,
    customRemapSource,
    applyRemap
} = useOmmrContext();
</script>

<template>
    <div v-if="showRemapModal" class="ommr-ui preview-overlay" @click.self="showRemapModal = false">
        <div class="remap-dialog">
            <header class="preview-head">
                <h3>Map OMMR Dataset to Project Manuscript</h3>
                <button class="close-btn" @click="showRemapModal = false">✕</button>
            </header>
            <div class="remap-body">
                <p class="hint">
                    Select which real project manuscript this OMMR dataset (currently labeled <b>{{ ommrStore.activeSource }}</b>) corresponds to.
                    This connects the project's IIIF manifest and makes imported neumes visible in that manuscript's tables.
                </p>
                <div class="field-row">
                    <label>Target Manuscript:</label>
                    <select v-model="remapTargetSource" class="manuscript-select">
                        <optgroup label="Manuscripts in Project Database">
                            <option v-for="src in availableProjectSources" :key="src.name" :value="src.name">
                                {{ src.name }} {{ src.hasIiif ? '· ✓ IIIF' : '' }} {{ src.folioCount ? `(${src.folioCount} folios)` : '' }}
                            </option>
                        </optgroup>
                        <option value="__custom__">➕ Custom Manuscript Name…</option>
                    </select>
                </div>
                <div v-if="remapTargetSource === '__custom__'" class="field-row">
                    <label>Custom Name:</label>
                    <input v-model="customRemapSource" placeholder="e.g. Paris 14819" class="custom-name-input" />
                </div>
                <div class="remap-actions">
                    <button class="btn-secondary" @click="showRemapModal = false">Cancel</button>
                    <button class="btn-primary" @click="applyRemap">Apply Mapping</button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.remap-dialog {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    width: min(520px, 94vw);
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}
.remap-body {
    padding: 20px;
}
.remap-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
}
</style>
