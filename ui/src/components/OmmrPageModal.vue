<script setup>
/**
 * Full-page view for one OMMR neume, used to (a) give context and (b) verify
 * and fix the OMMR->IIIF folio mapping. Shows the whole IIIF page with the
 * deskew-corrected neume outline highlighted, and lets the user nudge the
 * per-source folio offset until the highlight sits on the right neume.
 */
import { ref, computed, watch } from 'vue';
import { useImageManifest } from '../composables/useImageManifest';
import { correctedPolygon, correctedBox, undeskewPoint } from '../utils/ommrGeometry';

const props = defineProps({
    snippet: { type: Object, required: true },
    effectiveFolio: { type: String, required: true },
    deskew: { type: Object, default: () => ({ angle: 0, w: 0, h: 0 }) },
    folioOffset: { type: Number, default: 0 },
    patternName: { type: String, default: '' },
    // Index-mode: explicit canvas service URL + label resolved by page index.
    serviceUrl: { type: String, default: '' },
    canvasLabel: { type: String, default: '' }
});
const emit = defineEmits(['close', 'set-offset']);

const { getIiifThumbnailUrl, getStandardFolio } = useImageManifest();

const imgStatus = ref('loading');
const pageUrl = computed(() => {
    if (props.serviceUrl) return `${props.serviceUrl}/full/1600,/0/default.jpg`;
    return getIiifThumbnailUrl(props.snippet.source, props.effectiveFolio, 1600);
});
watch(pageUrl, () => { imgStatus.value = 'loading'; });

const resolvedLabel = computed(() =>
    props.canvasLabel || getStandardFolio(props.snippet.source, props.effectiveFolio)
);

// Deskew-corrected geometry in percent (matches the IIIF original space).
const polygon = computed(() => correctedPolygon(props.snippet.points, props.deskew));
const box = computed(() => correctedBox(props.snippet.points, props.deskew, 0.15));
const noteMarkers = computed(() => {
    const pts = props.snippet.notePoints || [];
    const d = props.deskew;
    return pts.map(p => {
        if (d && d.angle) {
            const [x, y] = undeskewPoint(p.x, p.y, d.angle, d.w, d.h);
            return { x, y };
        }
        return { x: p.x, y: p.y };
    });
});

function nudge(delta) { emit('set-offset', props.folioOffset + delta); }
</script>

<template>
<div class="peek-overlay" @click.self="emit('close')">
    <div class="peek-panel">
        <header class="peek-head">
            <div class="peek-title">
                <b>{{ patternName || snippet.pattern }}</b>
                <span class="peek-sub">
                    OMMR folio <b>{{ snippet.folio }}</b>
                    <template v-if="effectiveFolio !== snippet.folio"> → <b>{{ effectiveFolio }}</b> (offset {{ folioOffset > 0 ? '+' : '' }}{{ folioOffset }})</template>
                    · IIIF canvas <b>{{ resolvedLabel || '—' }}</b>
                </span>
            </div>
            <button class="peek-close" @click="emit('close')">✕</button>
        </header>

        <div class="peek-toolbar">
            <span class="toolbar-label">Folio mapping:</span>
            <button class="btn-xs" @click="nudge(-2)" title="Shift one full folio earlier">− folio</button>
            <button class="btn-xs" @click="nudge(-1)" title="Shift one side (r/v) earlier">− side</button>
            <span class="offset-pill">offset {{ folioOffset > 0 ? '+' : '' }}{{ folioOffset }}</span>
            <button class="btn-xs" @click="nudge(1)" title="Shift one side (r/v) later">+ side</button>
            <button class="btn-xs" @click="nudge(2)" title="Shift one full folio later">+ folio</button>
            <button class="btn-xs ghost" @click="emit('set-offset', 0)" :disabled="!folioOffset">Reset</button>
            <span class="toolbar-hint">Nudge until the box sits on the highlighted neume, then close.</span>
        </div>

        <div class="peek-stage">
            <div v-if="imgStatus === 'loading'" class="peek-loader"><div class="spinner"></div></div>
            <div v-else-if="imgStatus === 'error'" class="peek-error">
                ⚠️ No IIIF image for <b>{{ effectiveFolio }}</b>. Try a different offset or link the manifest.
            </div>

            <div class="peek-imgwrap">
                <img
                    :src="pageUrl || ''"
                    class="peek-img"
                    alt=""
                    @load="imgStatus = 'loaded'"
                    @error="imgStatus = 'error'"
                />
                <svg class="peek-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <!-- context box -->
                    <rect :x="box.x" :y="box.y" :width="box.w" :height="box.h"
                          fill="none" stroke="var(--color-primary, #6366f1)"
                          stroke-width="0.25" vector-effect="non-scaling-stroke" />
                    <!-- exact neume outline -->
                    <polygon :points="polygon"
                             fill="rgba(99,102,241,0.15)"
                             stroke="#f59e0b" stroke-width="0.4"
                             vector-effect="non-scaling-stroke" />
                    <!-- exact note-head centres -->
                    <circle v-for="(m, i) in noteMarkers" :key="i"
                            :cx="m.x" :cy="m.y" r="0.4"
                            fill="rgba(37,99,235,0.6)" stroke="#fff" stroke-width="0.15"
                            vector-effect="non-scaling-stroke" />
                </svg>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.peek-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center; padding: 24px;
}
.peek-panel {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: 12px; width: min(920px, 95vw); max-height: 92vh;
    display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.peek-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid var(--color-border);
}
.peek-title { display: flex; flex-direction: column; gap: 2px; }
.peek-sub { font-size: 0.8rem; color: var(--color-text-muted); }
.peek-close { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: var(--color-text-muted); }

.peek-toolbar {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 10px 16px; border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-muted);
}
.toolbar-label { font-size: 0.8rem; font-weight: 600; }
.toolbar-hint { font-size: 0.75rem; color: var(--color-text-muted); }
.offset-pill {
    font-size: 0.78rem; font-weight: 700; padding: 2px 8px; border-radius: 10px;
    background: var(--color-bg); color: var(--color-primary);
}
.btn-xs {
    background: var(--color-bg); color: var(--color-text);
    border: 1px solid var(--color-border); padding: 4px 10px; border-radius: 4px;
    font-size: 0.78rem; font-weight: 600; cursor: pointer;
}
.btn-xs:hover:not(:disabled) { background: var(--color-border); }
.btn-xs.ghost { font-weight: 500; color: var(--color-text-muted); }
.btn-xs:disabled { opacity: 0.4; cursor: not-allowed; }

.peek-stage { position: relative; overflow: auto; padding: 16px; background: var(--color-bg); }
.peek-imgwrap { position: relative; display: inline-block; margin: 0 auto; }
.peek-img { display: block; max-width: 100%; max-height: 70vh; }
.peek-svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

.peek-loader, .peek-error {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    z-index: 2;
}
.peek-error { color: #ef4444; font-size: 0.9rem; text-align: center; padding: 20px; }
.spinner {
    width: 28px; height: 28px; border: 3px solid rgba(99,102,241,0.25);
    border-top-color: var(--color-primary, #6366f1); border-radius: 50%;
    animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
