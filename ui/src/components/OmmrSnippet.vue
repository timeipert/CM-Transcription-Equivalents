<script setup>
/**
 * Lightweight OMMR neume thumbnail.
 *
 * Performance strategy (per project spec):
 *  - Loads ONLY the neume bounding-box region via the IIIF Image API
 *    (`.../pct:x,y,w,h/<width>,/0/default.jpg`) at a small size, instead of
 *    pulling the whole folio and cropping it client-side.
 *  - Lazy-mounts the network request with an IntersectionObserver so a pattern
 *    with hundreds of instances never fires hundreds of requests at once.
 *  - Caches the fetched region blob in IndexedDB, keyed by the region URL, so
 *    re-visiting a pattern is instant and offline-friendly.
 *  - Falls back to an SVG-clipped full image only for non-IIIF (local) scans.
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useImageManifest } from '../composables/useImageManifest';
import { getCachedItem, setCachedItem } from '../utils/idb';

const props = defineProps({
    source: { type: String, required: true },
    folio: { type: String, required: true },
    points: { type: String, required: true }, // "x,y x,y ..." in % (0-100)
    width: { type: Number, default: 160 },
    height: { type: Number, default: 110 },
    padding: { type: Number, default: 0.35 }, // context factor around the box
    // Requested pixel width of the region image. Kept small for the grid;
    // callers can bump it (e.g. hover preview) for a sharper view.
    resolution: { type: Number, default: 0 },
    // Per-source calibration mapping OMMR (deskewed-image) space to the IIIF
    // original: percent = pct * scale + offset, per axis. Identity by default.
    calibration: {
        type: Object,
        default: () => ({ sx: 1, sy: 1, dx: 0, dy: 0 })
    },
    // Object URL of the exact (deskewed) image the coords were normalized
    // against. When present it is cropped directly — no IIIF, no calibration.
    localSrc: { type: String, default: '' },
    // OMMR deskew rotation (PIL Image.rotate: CCW, about center, size-preserving)
    // that produced the deskewed image. We invert it to map coords onto the
    // un-deskewed IIIF original. Needs the page pixel dims for the aspect ratio.
    deskewAngle: { type: Number, default: 0 },
    pageW: { type: Number, default: 0 },
    pageH: { type: Number, default: 0 },
    // Explicit IIIF image service URL (e.g. resolved by canvas index). When set,
    // the region is built from this instead of folio-label matching.
    serviceUrl: { type: String, default: '' },
    // Exact note-head centres in per-axis percent [{x,y},...] for overlay dots.
    markers: { type: Array, default: () => [] },
    showMarkers: { type: Boolean, default: true }
});

const { getIiifRegionUrl, getImageUrl } = useImageManifest();

const containerRef = ref(null);
const isVisible = ref(false);
const status = ref('idle'); // 'idle' | 'loading' | 'loaded' | 'error'
const blobUrl = ref(null);
let observer = null;
let objectUrl = null;

// Invert OMMR's deskew for a single percent-point (0-100), mapping it from the
// deskewed image back onto the un-deskewed original. PIL rotate is CCW about
// centre and size-preserving, so this is a pure rotation by +angle in pixel space.
function undeskew(px, py) {
    const { deskewAngle: a, pageW: W, pageH: H } = props;
    if (!a || !W || !H) return [px, py];
    const th = a * Math.PI / 180;
    const cos = Math.cos(th), sin = Math.sin(th);
    // percent -> pixels, translate to centre
    const dx = (px / 100) * W - W / 2;
    const dy = (py / 100) * H - H / 2;
    // inverse of the forward (image-coords, y-down, visual CCW) rotation
    const ox = dx * cos - dy * sin + W / 2;
    const oy = dx * sin + dy * cos + H / 2;
    return [(ox / W) * 100, (oy / H) * 100];
}

// --- Geometry: bounding box of the neume polygon, in % ---
const box = computed(() => {
    let pts = (props.points || '').split(/\s+/)
        .map(p => p.split(',').map(parseFloat))
        .filter(([x, y]) => !isNaN(x) && !isNaN(y));
    if (!pts.length) return { x: 0, y: 0, w: 100, h: 100 };

    // For the IIIF path, rotate the polygon back onto the original image.
    if (!props.localSrc && props.deskewAngle) {
        pts = pts.map(([x, y]) => undeskew(x, y));
    }

    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    let minX = Math.min(...xs), maxX = Math.max(...xs);
    let minY = Math.min(...ys), maxY = Math.max(...ys);
    let w = Math.max(maxX - minX, 0.5);
    let h = Math.max(maxY - minY, 0.5);

    // Local image = exact source of the coordinates → no calibration needed.
    // Otherwise apply per-source calibration (scale + offset) to correct the
    // deskew/crop mismatch between OMMR's derivative image and the IIIF original.
    if (!props.localSrc) {
        const c = props.calibration || {};
        const sx = c.sx ?? 1, sy = c.sy ?? 1, dx = c.dx ?? 0, dy = c.dy ?? 0;
        minX = minX * sx + dx; maxX = maxX * sx + dx;
        minY = minY * sy + dy; maxY = maxY * sy + dy;
        w = (maxX - minX);
        h = (maxY - minY);
    }

    const padX = w * props.padding;
    const padY = h * props.padding;
    const x = Math.max(0, Math.min(99, minX - padX));
    const y = Math.max(0, Math.min(99, minY - padY));
    return {
        x,
        y,
        w: Math.max(0.5, Math.min(100 - x, w + padX * 2)),
        h: Math.max(0.5, Math.min(100 - y, h + padY * 2))
    };
});

// Target pixel width, capped and DPR-aware for crisp small crops.
const targetPx = computed(() => {
    if (props.resolution) return Math.min(1600, props.resolution);
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    return Math.min(480, Math.max(120, Math.round(props.width * dpr)));
});

const regionUrl = computed(() => {
    if (props.localSrc) return null; // exact local crop takes precedence
    const b = box.value;
    const region = `pct:${b.x.toFixed(3)},${b.y.toFixed(3)},${b.w.toFixed(3)},${b.h.toFixed(3)}`;
    if (props.serviceUrl) {
        return `${props.serviceUrl}/${region}/${targetPx.value},/0/default.jpg`;
    }
    return getIiifRegionUrl(props.source, props.folio, region, targetPx.value);
});

// SVG-cropped image source: the exact local image, or a non-IIIF local scan.
const cropSrc = computed(() => {
    if (props.localSrc) return props.localSrc;
    return regionUrl.value ? null : getImageUrl(props.source, props.folio);
});

// Render in PIXEL space so x and y share one scale (percent-x is % of width,
// percent-y is % of height — mixing them distorts). Falls back to percent
// units when page dimensions are unknown.
const dims = computed(() => ({
    W: props.pageW || 100,
    H: props.pageH || 100
}));
const boxPx = computed(() => {
    const b = box.value, { W, H } = dims.value;
    return { x: b.x / 100 * W, y: b.y / 100 * H, w: b.w / 100 * W, h: b.h / 100 * H };
});
const viewBox = computed(() => {
    const b = boxPx.value;
    return `${b.x} ${b.y} ${b.w} ${b.h}`;
});
// For the IIIF path the region image already IS the box, placed to fill it.
const iiifImageBox = computed(() => boxPx.value);

// Note-head markers in pixel space (deskew-corrected for the IIIF path).
const markerPx = computed(() => {
    if (!props.showMarkers || !props.markers?.length) return [];
    const { W, H } = dims.value;
    return props.markers.map(m => {
        let [x, y] = [m.x, m.y];
        if (!props.localSrc && props.deskewAngle) [x, y] = undeskew(x, y);
        return { cx: x / 100 * W, cy: y / 100 * H };
    });
});
// Marker radius in pixel units, scaled to the crop size.
const markerR = computed(() => Math.max(Math.min(boxPx.value.w, boxPx.value.h) * 0.05, dims.value.H * 0.004));

async function load() {
    if (props.localSrc || !regionUrl.value) {
        // Local / SVG-crop path is handled declaratively in the template.
        status.value = cropSrc.value ? 'loading' : 'error';
        return;
    }
    const url = regionUrl.value;
    status.value = 'loading';
    try {
        let blob = await getCachedItem('images', url);
        if (!(blob instanceof Blob)) {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            blob = await res.blob();
            setCachedItem('images', url, blob); // fire-and-forget
        }
        revokeObjectUrl();
        objectUrl = URL.createObjectURL(blob);
        blobUrl.value = objectUrl;
        status.value = 'loaded';
    } catch (e) {
        // CORS or network failure: fall back to letting the <img> load the URL directly.
        blobUrl.value = url;
        status.value = 'loading';
    }
}

function revokeObjectUrl() {
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
    }
}

onMounted(() => {
    if ('IntersectionObserver' in window && containerRef.value) {
        observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    isVisible.value = true;
                    observer.disconnect();
                    observer = null;
                    break;
                }
            }
        }, { rootMargin: '300px 0px' });
        observer.observe(containerRef.value);
    } else {
        isVisible.value = true;
    }
});

onUnmounted(() => {
    if (observer) observer.disconnect();
    revokeObjectUrl();
});

// (Re)load when the card scrolls into view or the target region changes.
watch([isVisible, regionUrl], () => {
    if (isVisible.value) load();
});
</script>

<template>
<div class="ommr-snippet" ref="containerRef" :style="{ width: width + 'px', height: height + 'px' }">
    <div v-if="status === 'loading' || status === 'idle'" class="snippet-shimmer">
        <div class="mini-spinner"></div>
    </div>
    <div v-else-if="status === 'error'" class="snippet-error" title="Image unavailable">⚠️</div>

    <!-- Everything renders in a single SVG in PIXEL space so x/y share one
         scale (no distortion) and note markers align exactly. -->
    <svg
        v-if="(regionUrl || cropSrc) && isVisible"
        :viewBox="viewBox"
        preserveAspectRatio="xMidYMid meet"
        class="snippet-svg"
    >
        <!-- IIIF region already cropped to the box → placed to fill it -->
        <image
            v-if="regionUrl"
            :href="blobUrl || ''"
            :x="iiifImageBox.x" :y="iiifImageBox.y"
            :width="iiifImageBox.w" :height="iiifImageBox.h"
            preserveAspectRatio="none"
            @load="status = 'loaded'"
            @error="status = 'error'"
        />
        <!-- Local / non-IIIF: full page image, cropped by the viewBox -->
        <image
            v-else
            :href="cropSrc"
            x="0" y="0" :width="dims.W" :height="dims.H"
            preserveAspectRatio="none"
            @load="status = 'loaded'"
            @error="status = 'error'"
        />

        <!-- Exact note-head markers -->
        <g v-if="status === 'loaded'">
            <circle
                v-for="(m, i) in markerPx"
                :key="i"
                :cx="m.cx" :cy="m.cy" :r="markerR"
                class="note-marker"
                vector-effect="non-scaling-stroke"
            />
        </g>
    </svg>
</div>
</template>

<style scoped>
.ommr-snippet {
    position: relative;
    display: block;
    background: var(--color-surface-muted, #0f172a);
    border-radius: 4px;
    overflow: hidden;
}
.note-marker {
    fill: rgba(37, 99, 235, 0.25);
    stroke: #f59e0b;
    stroke-width: 1.25;
}
.snippet-img,
.snippet-svg {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
}
.snippet-shimmer,
.snippet-error {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}
.snippet-error { color: #ef4444; font-size: 14px; }
.mini-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.15);
    border-top-color: var(--color-primary, #6366f1);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
