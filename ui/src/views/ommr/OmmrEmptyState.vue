<script setup>
import { useOmmrContext } from '../../composables/ommr/ommrContext';

const {
    selectedTargetSource,
    customTargetSourceName,
    handleFolderUpload,
    availableProjectSources
} = useOmmrContext();
</script>

<template>
    <div class="ommr-ui empty-explorer">
        <div class="empty-card">
            <span class="empty-icon">🎼</span>
            <h3>Import OMMR4all Transcription Data</h3>
            <p>Upload an OMMR4all export directory containing <code>pcgts.json</code> files to extract all neumes and match them against your manuscript.</p>
        
            <div class="import-setup-box">
                <div class="step-row">
                    <label class="step-label"><b>Step 1:</b> Select Target Manuscript</label>
                    <select v-model="selectedTargetSource" class="manuscript-select">
                        <option value="">✨ Auto-detect from folder name (e.g. Pa_14819 → Pa 14819)</option>
                        <optgroup label="Manuscripts in Project Database">
                            <option v-for="src in availableProjectSources" :key="src.name" :value="src.name">
                                {{ src.name }} {{ src.hasIiif ? '· ✓ IIIF' : '' }} {{ src.folioCount ? `(${src.folioCount} folios)` : '' }}
                            </option>
                        </optgroup>
                        <option value="__custom__">➕ Other / Custom Manuscript Name…</option>
                    </select>
                </div>

                <div v-if="selectedTargetSource === '__custom__'" class="step-row custom-name-row">
                    <label class="step-label">Custom Manuscript Name:</label>
                    <input v-model="customTargetSourceName" placeholder="e.g. Paris 14819 or SG 390" class="custom-name-input" />
                </div>

                <div class="step-row upload-row">
                    <label class="step-label"><b>Step 2:</b> Select OMMR Export Directory</label>
                    <label class="btn-primary btn-large upload-btn">
                        <span>📁 Choose OMMR Folder</span>
                        <input type="file" webkitdirectory directory multiple @change="handleFolderUpload" hidden />
                    </label>
                </div>
            </div>

            <p class="empty-subtext">
                Supports standard OMMR4all export structures, page folders with <code>pcgts.json</code>, and optional color images for exact local crops.
            </p>
        </div>
    </div>
</template>

<style scoped>
.empty-explorer { flex: 1; display: flex; justify-content: center; align-items: center; padding: 40px; }
.empty-card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: 14px; padding: 36px 40px; max-width: 620px; width: 100%; text-align: center;
    box-shadow: 0 16px 36px rgba(0,0,0,0.12);
}
.empty-icon { font-size: 44px; display: block; margin-bottom: 10px; }
.empty-card h3 { margin: 0 0 8px 0; font-size: 1.3rem; }
.empty-card p { color: var(--color-text-muted); font-size: 0.9rem; line-height: 1.5; margin-bottom: 20px; }
.import-setup-box {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 20px;
    text-align: left;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.step-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.step-label {
    font-size: 0.85rem;
    color: var(--color-text);
}
.upload-row {
    align-items: flex-start;
}
.btn-large {
    padding: 12px 24px;
    font-size: 0.95rem;
    width: 100%;
    box-sizing: border-box;
}
.empty-subtext {
    font-size: 0.78rem;
    color: var(--color-text-muted);
    line-height: 1.4;
    margin: 0;
}
</style>
