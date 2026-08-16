<script setup>
/**
 * Renders one staff line as a horizontal strip (from the line's own coords),
 * with each neume on it outlined and labelled by its chant pattern.
 * Reuses the same pixel-space rendering + deskew handling as OmmrSnippet.
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useImageManifest } from '../composables/useImageManifest';
import { undeskewPoint, parsePoints } from '../utils/ommrGeometry';
import { getCachedItem, setCachedItem } from '../utils/idb';

const props = defineProps({
    source: { type: String, required: true },
    folio: { type: String, required: true },
    bbox: { type: Object, required: true },          // {x,y,w,h} in %
    neumes: { type: Array, default: () => [] },      // [{pattern, points, notePoints}]
    deskewAngle: { type: Number, default: 0 },
    pageW: { type: Number, default: 0 },
    pageH: { type: Number, default: 0 },
    localSrc: { type: String, default: '' },
    serviceUrl: { type: String, default: '' },
    width: { type: Number, default: 720 },
    padding: { type: Number, default: 0.08 }
});

const { getIiifRegionUrl } = useImageManifest();

const containerRef = ref(null);
const isVisible = ref(false);
const status = ref('idle');
const blobUrl = ref(null);
let observer = null, objectUrl = null;

const dims = computed(() => ({ W: props.pageW || 100, H: props.pageH || 100 }));
const iiif = computed(() => !props.localSrc);

// Deskew-correct a percent point for the IIIF path only.
function corr(x, y) {
    if (iiif.value && props.deskewAngle) return undeskewPoint(x, y, props.deskewAngle, props.pageW, props.pageH);
    return [x, y];
}

// Displayed box in percent (corrected + padded), then in pixels.
const boxPct = computed(() => {
    const b = props.bbox;
    // corners
    const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]
        .map(([x, y]) => corr(x, y));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    let minX = Math.min(...xs), maxX = Math.max(...xs);
    let minY = Math.min(...ys), maxY = Math.max(...ys);
    const px = (maxX - minX) * props.padding, py = (maxY - minY) * props.padding + 1;
    minX = Math.max(0, minX - px); minY = Math.max(0, minY - py);
    return { x: minX, y: minY, w: Math.min(100 - minX, (maxX - minX) + px * 2), h: Math.min(100 - minY, (maxY - minY) + py * 2) };
});
const boxPx = computed(() => {
    const b = boxPct.value, { W, H } = dims.value;
    return { x: b.x / 100 * W, y: b.y / 100 * H, w: b.w / 100 * W, h: b.h / 100 * H };
});
const viewBox = computed(() => { const b = boxPx.value; return `${b.x} ${b.y} ${b.w} ${b.h}`; });
const stripHeight = computed(() => {
    const b = boxPx.value;
    return Math.max(48, Math.round(props.width * (b.h / Math.max(b.w, 1))));
});

// Neume overlays in pixel coords (polygon + label anchor).
const overlays = computed(() => {
    const { W, H } = dims.value;
    return props.neumes.map(n => {
        const pts = parsePoints(n.points).map(([x, y]) => {
            const [cx, cy] = corr(x, y);
            return [cx / 100 * W, cy / 100 * H];
        });
        if (!pts.length) return null;
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys);
        return {
            pattern: n.pattern,
            poly: pts.map(p => `${p[0]},${p[1]}`).join(' '),
            lx: (minX + maxX) / 2,
            ly: minY
        };
    }).filter(Boolean);
});
const fontPx = computed(() => Math.max(boxPx.value.h * 0.16, dims.value.H * 0.008));

// --- IIIF region loading (few strips at a time → simple direct fetch + cache) ---
const regionUrl = computed(() => {
    if (props.localSrc) return null;
    const b = boxPct.value;
    const region = `pct:${b.x.toFixed(3)},${b.y.toFixed(3)},${b.w.toFixed(3)},${b.h.toFixed(3)}`;
    const w = Math.min(2000, Math.round(props.width * 2));
    if (props.serviceUrl) return `${props.serviceUrl}/${region}/${w},/0/default.jpg`;
    return getIiifRegionUrl(props.source, props.folio, region, w);
});
const imgHref = computed(() => (props.localSrc ? props.localSrc : blobUrl.value || ''));
const iiifImageBox = computed(() => boxPx.value);

async function load() {
    if (props.localSrc) { status.value = 'loading'; return; }
    const url = regionUrl.value;
    if (!url) { status.value = 'error'; return; }
    status.value = 'loading';
    try {
        let blob = await getCachedItem('images', url);
        if (!(blob instanceof Blob)) {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            blob = await res.blob();
            setCachedItem('images', url, blob);
        }
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(blob);
        blobUrl.value = objectUrl;
    } catch {
        blobUrl.value = url; // let <image> load directly
    }
}

onMounted(() => {
    if ('IntersectionObserver' in window && containerRef.value) {
        observer = new IntersectionObserver((es) => {
            if (es.some(e => e.isIntersecting)) { isVisible.value = true; observer.disconnect(); observer = null; }
        }, { rootMargin: '300px 0px' });
        observer.observe(containerRef.value);
    } else isVisible.value = true;
});
onUnmounted(() => { if (observer) observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); });
watch([isVisible, regionUrl], () => { if (isVisible.value) load(); });
</script>

<template>
<div class="line-strip" ref="containerRef" :style="{ width: width + 'px', height: stripHeight + 'px' }">
    <div v-if="status === 'loading' || status === 'idle'" class="strip-shimmer"><div class="sp"></div></div>
    <div v-else-if="status === 'error'" class="strip-error">⚠️ image unavailable</div>

    <svg v-if="isVisible" :viewBox="viewBox" preserveAspectRatio="xMidYMid meet" class="strip-svg">
        <image
            v-if="localSrc"
            :href="imgHref" x="0" y="0" :width="dims.W" :height="dims.H"
            preserveAspectRatio="none" @load="status = 'loaded'" @error="status = 'error'"
        />
        <image
            v-else
            :href="imgHref"
            :x="iiifImageBox.x" :y="iiifImageBox.y" :width="iiifImageBox.w" :height="iiifImageBox.h"
            preserveAspectRatio="none" @load="status = 'loaded'" @error="status = 'error'"
        />

        <g v-if="status === 'loaded'">
            <polygon v-for="(ov, i) in overlays" :key="'p' + i"
                :points="ov.poly" fill="rgba(37,99,235,0.12)" stroke="#f59e0b"
                stroke-width="1" vector-effect="non-scaling-stroke" />
            <g v-for="(ov, i) in overlays" :key="'l' + i">
                <rect :x="ov.lx - ov.pattern.length * fontPx * 0.32" :y="ov.ly - fontPx * 1.4"
                      :width="ov.pattern.length * fontPx * 0.64" :height="fontPx * 1.25"
                      rx="2" fill="rgba(15,23,42,0.85)" />
                <text :x="ov.lx" :y="ov.ly - fontPx * 0.45" :font-size="fontPx"
                      fill="#fbbf24" text-anchor="middle" font-family="monospace" font-weight="700">{{ ov.pattern }}</text>
            </g>
        </g>
    </svg>
</div>
</template>

<style scoped>
.line-strip {
    position: relative; background: var(--color-surface-muted, #0f172a);
    border-radius: 4px; overflow: hidden;
}
.strip-svg { width: 100%; height: 100%; display: block; }
.strip-shimmer, .strip-error {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 0.8rem; color: var(--color-text-muted);
}
.strip-error { color: #ef4444; }
.sp { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.15); border-top-color: var(--color-primary, #6366f1); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
