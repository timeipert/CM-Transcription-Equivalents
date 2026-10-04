<script setup>
import { useOmmrContext } from '../../composables/ommr/ommrContext';
import { FOLIO_PRESETS, applyPreset } from '../../utils/ommrFolioRule';

const {
    showImportModal,
    importStaging,
    importSourceName,
    folioRule,
    showThumbs,
    importPreview,
    importCollision,
    thumbUrl,
    closeImport,
    commitImport
} = useOmmrContext();

// Choosing a preset loads its fields into the rule being edited.
const selectPreset = key => applyPreset(folioRule, key);
</script>

<template>
    <div v-if="showImportModal" class="ommr-ui preview-overlay" @click.self="closeImport">
        <div class="preview-panel import-panel">
            <header class="preview-head">
                <div>
                    <h3>Import OMMR export</h3>
                    <span class="preview-sub" v-if="importStaging">
                        {{ importStaging.entries.length }} folios detected
                        <template v-if="importStaging.entries.filter(e => e.image).length">
                            · {{ importStaging.entries.filter(e => e.image).length }} with color images
                        </template>
                    </span>
                </div>
                <button class="close-btn" @click="closeImport">✕</button>
            </header>

            <div class="preview-body import-body">
                <div class="field-row">
                    <label>Manuscript source</label>
                    <input v-model="importSourceName" class="url-input" placeholder="e.g. Pa 1235" />
                </div>

                <h4>Folio naming rule</h4>
                <p class="hint">
                    Turn the raw OMMR page folders into folio labels matching your IIIF manifest.
                    “Page → folio” maps sequential pages to recto/verso (1→1r, 2→1v, …); use the offset
                    to line up the first page. Check the page images to identify the true folio.
                </p>
                <div class="preset-row">
                    <button v-for="(p, k) in FOLIO_PRESETS" :key="k"
                            class="btn-xs" :class="{ 'preset-on': folioRule.preset === k }"
                            @click="selectPreset(k)">{{ p.label }}</button>
                </div>

                <div class="rule-grid">
                    <label>Regex match</label>
                    <input v-model="folioRule.pattern" class="url-input" placeholder="e.g. ^.*?(\d+)\D*$"
                           @input="folioRule.preset = 'custom'" />
                    <label>Replace with</label>
                    <input v-model="folioRule.replace" class="url-input" placeholder="e.g. $1"
                           @input="folioRule.preset = 'custom'" />
                    <template v-if="folioRule.mode === 'pagefolio'">
                        <label>Page offset</label>
                        <div class="offset-controls">
                            <button class="btn-xs" @click="folioRule.offset--">−1</button>
                            <span class="offset-pill">{{ folioRule.offset > 0 ? '+' : '' }}{{ folioRule.offset }}</span>
                            <button class="btn-xs" @click="folioRule.offset++">+1</button>
                            <label class="mini-toggle"><input type="checkbox" v-model="folioRule.startVerso" /> start on verso</label>
                        </div>
                    </template>
                    <template v-else>
                        <label>Append suffix</label>
                        <input v-model="folioRule.suffix" class="url-input mini" placeholder="e.g. r" />
                    </template>
                    <label>Strip leading zeros</label>
                    <input type="checkbox" v-model="folioRule.stripZeros" />
                </div>

                <div v-if="importCollision && folioRule.mode !== 'pagefolio'" class="collision-warn">
                    ⚠️ {{ importCollision }} folios map to a name already used — they'll be merged. Adjust the rule.
                </div>

                <div class="preview-headrow">
                    <h4>Preview</h4>
                    <label class="mini-toggle"><input type="checkbox" v-model="showThumbs" /> show page images</label>
                </div>
                <table class="map-table">
                    <thead><tr><th v-if="showThumbs">Page</th><th>Raw folder</th><th>→ Folio</th></tr></thead>
                    <tbody>
                        <tr v-for="row in importPreview" :key="row.raw">
                            <td v-if="showThumbs" class="thumb-cell">
                                <img v-if="row.image" :src="thumbUrl(row.image)" loading="lazy" class="page-thumb" alt="" />
                                <span v-else class="no-thumb">—</span>
                            </td>
                            <td class="raw-cell">{{ row.raw }}</td>
                            <td class="mapped-cell">{{ row.mapped }}</td>
                        </tr>
                    </tbody>
                </table>
                <p class="hint mini" v-if="importStaging && importStaging.entries.length > importPreview.length">
                    Showing {{ importPreview.length }} of {{ importStaging.entries.length }}.
                </p>
            </div>

            <footer class="import-foot">
                <button class="btn-secondary" @click="closeImport">Cancel</button>
                <button class="btn-primary" @click="commitImport" :disabled="!importSourceName.trim()">
                    Import {{ importStaging ? importStaging.entries.length : 0 }} folios
                </button>
            </footer>
        </div>
    </div>
</template>

<style scoped>
.import-panel { width: min(680px, 95vw); }
.import-body { padding: 16px 18px; }
.import-body h4 { margin: 16px 0 6px; font-size: 0.95rem; }
.preset-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.preset-on { background: var(--color-primary) !important; color: #fff !important; border-color: var(--color-primary) !important; }
.rule-grid { display: grid; grid-template-columns: 130px 1fr; gap: 8px 10px; align-items: center; }
.rule-grid > label { font-size: 0.8rem; color: var(--color-text-muted); }
.url-input.mini { max-width: 100px; }
.collision-warn { margin: 12px 0; font-size: 0.82rem; color: var(--color-warning, #f59e0b); font-weight: 600; }
.map-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.map-table th { text-align: left; color: var(--color-text-muted); font-weight: 600; padding: 4px 6px; border-bottom: 1px solid var(--color-border); }
.map-table td { padding: 3px 6px; border-bottom: 1px solid var(--color-border); font-variant-numeric: tabular-nums; }
.raw-cell { color: var(--color-text-muted); }
.mapped-cell { font-weight: 600; }
.import-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--color-border); background: var(--color-surface); }
.preview-headrow { display: flex; align-items: center; justify-content: space-between; }
.mini-toggle { display: inline-flex; align-items: center; gap: 5px; font-size: 0.76rem; color: var(--color-text-muted); cursor: pointer; }
.thumb-cell { width: 96px; }
.page-thumb { width: 88px; height: 58px; object-fit: cover; border-radius: 3px; border: 1px solid var(--color-border); display: block; background: #0f172a; }
.no-thumb { color: var(--color-text-muted); }
.offset-controls .mini-toggle { margin-left: 8px; }
</style>
