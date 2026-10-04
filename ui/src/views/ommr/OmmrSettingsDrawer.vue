<script setup>
import { useOmmrContext } from '../../composables/ommr/ommrContext';
import OmmrSnippet from '../../components/OmmrSnippet.vue';

const {
    cardPadding,
    preferIiif,
    calibration,
    updateCalib,
    resetCalib,
    folioOffset,
    setFolioOffset,
    indexMode,
    setIndexMode,
    pageMeta,
    deskewFor,
    deskewedCount,
    sampleSnippet,
    resolvedIiifKey,
    manifestState,
    resolveSample,
    imagesResolve,
    sampleDiagnostics,
    getIiifCanvasCount,
    ommrStore,
    iiifStore,
    availableProjectSources,
    activeProjectManuscript,
    matchingProjectFoliosCount,
    showSettings,
    showCleanupModal,
    applyRemap,
    manifestUrlInput,
    renameInput,
    applyRename,
    refreshManifest,
    saveManifestUrl,
    importAllLines
} = useOmmrContext();
</script>

<template>
    <div v-if="showSettings" class="ommr-ui settings-overlay" @click.self="showSettings = false">
        <div class="settings-panel">
            <div class="settings-head">
                <h3>OMMR Explorer Settings</h3>
                <button class="close-btn" @click="showSettings = false">✕</button>
            </div>

            <section class="settings-section" v-if="ommrStore.activeSource">
                <h4>Manuscript Correspondence</h4>
                <p class="hint">
                    Currently linked to: <b>{{ ommrStore.activeSource }}</b>
                    <span v-if="activeProjectManuscript">
                        (Project manuscript · {{ matchingProjectFoliosCount }} matching folios)
                    </span>
                </p>
                <div class="field-row">
                    <label>Project Source</label>
                    <select :value="ommrStore.activeSource" @change="applyRemap($event.target.value)" class="manuscript-select">
                        <optgroup label="Manuscripts in Project Database">
                            <option v-for="src in availableProjectSources" :key="src.name" :value="src.name">
                                {{ src.name }} {{ src.hasIiif ? '· ✓ IIIF' : '' }}
                            </option>
                        </optgroup>
                    </select>
                </div>
                <div class="field-row">
                    <label>Rename / Custom</label>
                    <input v-model="renameInput" class="url-input" @keyup.enter="applyRename" />
                    <button class="btn-xs" @click="applyRename" :disabled="!renameInput.trim() || renameInput.trim() === ommrStore.activeSource">Rename</button>
                </div>
                <div class="field-row" v-if="ommrStore.activeLines.length" style="margin-top: 10px;">
                    <button class="btn-secondary" style="width: 100%; justify-content: center;" @click="importAllLines">
                        🎼 Import All {{ ommrStore.activeLines.length }} Staff Line Regions
                    </button>
                </div>
                <div class="field-row" style="margin-top: 8px;">
                    <button class="btn-xs btn-danger-outline" style="width: 100%; justify-content: center; padding: 6px;" @click="showCleanupModal = true">
                        🗑 Manage / Delete Annotations for {{ ommrStore.activeSource }}
                    </button>
                </div>
            </section>

            <section class="settings-section" v-if="ommrStore.activeSource">
                <h4>Image source</h4>
                <div class="img-source-badge" :class="ommrStore.hasLocalImages ? 'local' : (imagesResolve ? 'iiif' : 'none')">
                    <span v-if="ommrStore.hasLocalImages">
                        ✓ Using local deskewed images — exact crops, no calibration needed
                        ({{ Object.keys(ommrStore.localImages[ommrStore.activeSource] || {}).length }} folios)
                    </span>
                    <span v-else-if="imagesResolve">
                        ◇ Using IIIF regions with automatic deskew correction
                        <span v-if="deskewedCount"> — {{ deskewedCount }} folios rotated back into place</span>
                    </span>
                    <span v-else>⚠️ No image source yet</span>
                </div>
                <p class="hint">
                    OMMR coordinates live in the deskewed image (<code>{{ pageMeta?.imageFilename || 'color_deskewed.jpg' }}</code>).
                    Each neume's region is rotated back by that folio's <code>deskewing_degrees</code> (from meta.json)
                    so it lands correctly on the IIIF original — no manual alignment needed.
                </p>
                <label class="toggle-row" v-if="ommrStore.hasLocalImages">
                    <input type="checkbox" v-model="preferIiif" />
                    Prefer IIIF images (ignore the bundled local images)
                </label>
            </section>

            <section class="settings-section">
                <h4>IIIF Manifest</h4>
                <p class="hint">
                    Neume thumbnails are cropped on-demand from the manuscript's IIIF images.
                    Link the manifest for the source below.
                </p>
                <div class="field-row">
                    <label>Resolves to IIIF key</label>
                    <div class="value-static">{{ resolvedIiifKey || '—' }}</div>
                </div>
                <div class="field-row">
                    <label>Manifest URL</label>
                    <input
                        v-model="manifestUrlInput"
                        type="url"
                        placeholder="https://gallica.bnf.fr/iiif/ark:/.../manifest.json"
                        class="url-input"
                        @keyup.enter="saveManifestUrl"
                    />
                </div>

                <div class="manifest-status-line" :class="manifestState.status">
                    <span v-if="manifestState.status === 'ok'">✓ Loaded — {{ manifestState.count }} canvases</span>
                    <span v-else-if="manifestState.status === 'loading'">↻ Loading manifest…</span>
                    <span v-else-if="manifestState.status === 'error'">⚠️ {{ manifestState.error }}</span>
                    <span v-else-if="manifestState.status === 'linked'">Linked, not yet loaded.</span>
                    <span v-else-if="manifestState.status === 'unlinked'">No manifest linked for this source.</span>
                    <span v-else>Load OMMR data first.</span>
                </div>

                <div
                    v-if="manifestState.status === 'ok'"
                    class="manifest-status-line"
                    :class="resolveSample.matched ? 'ok' : 'error'"
                >
                    Folio match probe: {{ resolveSample.matched }}/{{ resolveSample.total }} sampled folios resolve.
                    <span v-if="!resolveSample.matched">
                        — labels may differ (e.g. OMMR “47r” vs. manifest “f. 47r”).
                    </span>
                </div>

                <!-- Per-folio resolution diagnostic -->
                <details v-if="manifestState.status === 'ok'" class="diag">
                    <summary>Folio resolution ({{ resolveSample.matched }}/{{ resolveSample.total }})</summary>
                    <ul class="diag-list">
                        <li v-for="d in sampleDiagnostics" :key="d.folio" :class="{ bad: !d.matched }">
                            <span>{{ d.folio }}<span v-if="d.eff !== d.folio"> → {{ d.eff }}</span></span>
                            <span>{{ d.matched ? '✓ ' + (d.label || d.eff) : '✗ no canvas' }}</span>
                        </li>
                    </ul>
                    <p class="hint mini">Canvas count in manifest: {{ manifestState.count }}. If folios don't match, adjust the folio offset below.</p>
                </details>

                <label class="toggle-row" style="margin-top:10px;">
                    <input type="checkbox" :checked="indexMode" @change="setIndexMode($event.target.checked)" />
                    Folios are page indices (…_022) — match by canvas position
                    <span v-if="indexMode" class="hint mini" style="margin:0;">· manifest has {{ getIiifCanvasCount(ommrStore.activeSource) }} canvases</span>
                </label>

                <div class="field-row" style="margin-top:10px;">
                    <label>Folio offset</label>
                    <div class="offset-controls">
                        <button class="btn-xs" @click="setFolioOffset(folioOffset - 2)">− folio</button>
                        <button class="btn-xs" @click="setFolioOffset(folioOffset - 1)">− side</button>
                        <span class="offset-pill">{{ folioOffset > 0 ? '+' : '' }}{{ folioOffset }}</span>
                        <button class="btn-xs" @click="setFolioOffset(folioOffset + 1)">+ side</button>
                        <button class="btn-xs" @click="setFolioOffset(folioOffset + 2)">+ folio</button>
                        <button class="btn-xs ghost" @click="setFolioOffset(0)" :disabled="!folioOffset">Reset</button>
                    </div>
                </div>
                <p class="hint mini">Shifts every OMMR folio onto the IIIF canvases. Use the 🔍 on a snippet to verify against the full page.</p>

                <div class="settings-actions">
                    <button class="btn-primary" @click="saveManifestUrl" :disabled="!manifestUrlInput.trim()">
                        Load manifest
                    </button>
                    <button
                        v-if="manifestState.url"
                        class="btn-secondary"
                        @click="refreshManifest"
                        title="Clear caches and re-fetch"
                    >↻ Refresh cache</button>
                </div>
            </section>

            <section class="settings-section">
                <h4>Thumbnail crop padding</h4>
                <p class="hint">How much surrounding context to include around each neume box.</p>
                <div class="field-row">
                    <input type="range" min="0" max="1" step="0.05" v-model.number="cardPadding" />
                    <div class="value-static">{{ Math.round(cardPadding * 100) }}%</div>
                </div>
            </section>

            <section class="settings-section" v-if="!ommrStore.hasLocalImages">
                <h4>Deskew correction (automatic)</h4>
                <p class="hint">
                    The neume regions are automatically rotated back by each folio's
                    <code>deskewing_degrees</code>. The optional nudge below only corrects any small
                    residual offset (e.g. if the IIIF original is cropped slightly differently).
                </p>

                <!-- Live preview: deskew off vs. on for one sample neume -->
                <div class="calib-preview" v-if="sampleSnippet && imagesResolve">
                    <div class="calib-cell">
                        <OmmrSnippet
                            :key="'nodeskew'"
                            :source="sampleSnippet.source"
                            :folio="sampleSnippet.folio"
                            :points="sampleSnippet.points"
                            :padding="0.6" :width="150" :height="110" :resolution="600"
                        />
                        <small>deskew off</small>
                    </div>
                    <span class="calib-arrow">→</span>
                    <div class="calib-cell">
                        <OmmrSnippet
                            :key="'deskew-' + deskewFor(sampleSnippet.folio).angle + calibration.dx + calibration.dy"
                            :source="sampleSnippet.source"
                            :folio="sampleSnippet.folio"
                            :points="sampleSnippet.points"
                            :calibration="calibration"
                            :deskewAngle="deskewFor(sampleSnippet.folio).angle"
                            :pageW="deskewFor(sampleSnippet.folio).w"
                            :pageH="deskewFor(sampleSnippet.folio).h"
                            :padding="0.6" :width="150" :height="110" :resolution="600"
                        />
                        <small>deskew on ({{ deskewFor(sampleSnippet.folio).angle }}°)</small>
                    </div>
                </div>
                <p class="hint mini" v-if="sampleSnippet">Sample: Fol. {{ sampleSnippet.folio }}</p>

                <div class="calib-grid">
                    <label>Offset X</label>
                    <input type="range" min="-15" max="15" step="0.25"
                           :value="calibration.dx" @input="updateCalib({ dx: +$event.target.value })" />
                    <span>{{ calibration.dx.toFixed(2) }}%</span>

                    <label>Offset Y</label>
                    <input type="range" min="-15" max="15" step="0.25"
                           :value="calibration.dy" @input="updateCalib({ dy: +$event.target.value })" />
                    <span>{{ calibration.dy.toFixed(2) }}%</span>

                    <label>Scale X</label>
                    <input type="range" min="0.85" max="1.15" step="0.005"
                           :value="calibration.sx" @input="updateCalib({ sx: +$event.target.value })" />
                    <span>{{ calibration.sx.toFixed(3) }}</span>

                    <label>Scale Y</label>
                    <input type="range" min="0.85" max="1.15" step="0.005"
                           :value="calibration.sy" @input="updateCalib({ sy: +$event.target.value })" />
                    <span>{{ calibration.sy.toFixed(3) }}</span>
                </div>
                <div class="settings-actions">
                    <button class="btn-secondary" @click="resetCalib">Reset alignment</button>
                </div>
            </section>

            <section class="settings-section" v-if="iiifStore.links && Object.keys(iiifStore.links).length">
                <h4>Known manifests</h4>
                <ul class="manifest-list">
                    <li v-for="(url, src) in iiifStore.links" :key="src">
                        <span class="mf-src">{{ src }}</span>
                        <span class="mf-badge" :class="iiifStore.manifestStatus[src]?.status || 'idle'">
                            {{ iiifStore.parsedData[src]?.length ? iiifStore.parsedData[src].length + ' pages' : (iiifStore.manifestStatus[src]?.status || 'not loaded') }}
                        </span>
                    </li>
                </ul>
            </section>
        </div>
    </div>
</template>

<style scoped>
.settings-overlay {
    position: fixed; inset: 0; z-index: 100;
    background: rgba(0, 0, 0, 0.45);
    display: flex; justify-content: flex-end;
}
.settings-panel {
    width: 420px; max-width: 90vw; height: 100%; overflow-y: auto;
    background: var(--color-surface); border-left: 1px solid var(--color-border);
    box-shadow: -8px 0 24px rgba(0,0,0,0.25);
    padding: 20px; box-sizing: border-box;
    animation: slideIn 0.2s ease;
}
@keyframes slideIn { from { transform: translateX(30px); opacity: 0.4; } to { transform: none; opacity: 1; } }
.settings-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.settings-head h3 { margin: 0; font-size: 1.1rem; }
.settings-section { padding: 16px 0; border-top: 1px solid var(--color-border); }
.settings-section h4 { margin: 0 0 6px 0; font-size: 0.95rem; }
.manifest-status-line { font-size: 0.8rem; margin: 6px 0 12px 0; font-weight: 600; }
.manifest-status-line.ok { color: var(--color-success); }
.manifest-status-line.error { color: var(--color-danger, #ef4444); }
.manifest-status-line.loading { color: var(--color-primary); }
.manifest-status-line.unlinked, .manifest-status-line.linked { color: var(--color-text-muted); }
.settings-actions { display: flex; gap: 8px; }
.manifest-list { list-style: none; margin: 0; padding: 0; }
.manifest-list li { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 0.8rem; border-bottom: 1px solid var(--color-border); }
.mf-src { font-weight: 600; }
.mf-badge { color: var(--color-text-muted); font-size: 0.72rem; }
.mf-badge.ok { color: var(--color-success); }
.mf-badge.error { color: var(--color-danger, #ef4444); }
.calib-preview {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    padding: 10px; background: var(--color-bg); border-radius: 8px;
    border: 1px solid var(--color-border);
}
.calib-arrow { color: var(--color-text-muted); font-size: 1.2rem; }
.calib-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.calib-cell small { font-size: 0.68rem; color: var(--color-text-muted); }
.diag { margin: 8px 0; font-size: 0.78rem; }
.diag summary { cursor: pointer; color: var(--color-text-muted); }
.diag-list { list-style: none; margin: 8px 0 0 0; padding: 0; }
.diag-list li {
    display: flex; justify-content: space-between; gap: 10px; padding: 3px 0;
    border-bottom: 1px solid var(--color-border); font-variant-numeric: tabular-nums;
}
.diag-list li.bad { color: var(--color-danger, #ef4444); }
.toggle-row { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; margin-top: 8px; cursor: pointer; }
.calib-grid {
    display: grid; grid-template-columns: 70px 1fr 52px; align-items: center;
    gap: 8px 10px; margin: 12px 0;
}
.calib-grid > label { font-size: 0.78rem; color: var(--color-text-muted); }
.calib-grid > span { font-size: 0.75rem; font-variant-numeric: tabular-nums; text-align: right; }
.img-source-badge {
    padding: 8px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;
    margin-bottom: 10px;
}
.img-source-badge.local { background: rgba(16, 185, 129, 0.15); color: var(--color-success); }
.img-source-badge.iiif { background: rgba(99, 102, 241, 0.12); color: var(--color-primary); }
.img-source-badge.none { background: rgba(245, 158, 11, 0.14); color: var(--color-warning, #f59e0b); }
</style>
