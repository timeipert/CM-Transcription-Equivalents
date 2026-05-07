<script setup>
import { computed } from 'vue';
import { useImageManifest } from '../composables/useImageManifest';

const props = defineProps({
    source: String,
    folio: String,
    points: String, // "x,y x,y..." in % (0-100)
    width: { type: Number, default: 150 },
    height: { type: Number, default: 100 },
    padding: { type: Number, default: 0.3 }, // Context factor
    clip: { type: Boolean, default: false }, // Whether to hard-clip to poly
    overlays: { type: Array, default: () => [] }, // [{ points, color? }]
    hideLabel: { type: Boolean, default: false },
    highlightId: { type: [String, Number], default: null },
    useFullRes: { type: Boolean, default: false },
    starredIds: { type: Object, default: () => new Set() }
});

const emit = defineEmits(['zoom-item']);

const { getImageUrl, getIiifThumbnailUrl, getIiifRegionUrl } = useImageManifest();

const vbCoords = computed(() => {
    const parts = viewBox.value.split(' ').map(parseFloat);
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
});

const imgUrl = computed(() => {
    if (props.useFullRes) {
        const { x, y, w, h } = vbCoords.value;
        // Clamp and format for IIIF pct:
        const region = `pct:${Math.max(0, x).toFixed(2)},${Math.max(0, y).toFixed(2)},${Math.min(100 - x, w).toFixed(2)},${Math.min(100 - y, h).toFixed(2)}`;
        const url = getIiifRegionUrl(props.source, props.folio, region, "1600"); // Request 1600px width for zoom
        if (url) return url;
    }
    return getIiifThumbnailUrl(props.source, props.folio, 1600); // Increased thumb size for general lists too
});

const polyPoints = computed(() => {
    if (!props.points) return "";
    return props.points;
});

const viewBox = computed(() => {
    if (!props.points) return "0 0 100 100";
    
    // Parse points
    const pts = props.points.split(' ')
        .filter(s => s.trim().length > 0)
        .map(p => {
            const [x, y] = p.split(',').map(parseFloat);
            return { x, y };
        })
        .filter(p => !isNaN(p.x) && !isNaN(p.y));

    if (pts.length === 0) return "0 0 100 100";
    
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    let w = maxX - minX;
    let h = maxY - minY;
    
    // Dynamic padding
    const padX = Math.max(w * props.padding, 1);
    const padYTop = props.hideLabel ? Math.max(h * props.padding, 1) : Math.max(h * props.padding, 5); 
    const padYBottom = Math.max(h * props.padding, 1);
    
    // Expand box
    const vbX = Math.max(0, minX - padX);
    const vbY = Math.max(0, minY - padYTop);
    const vbW = Math.min(100, w + padX*2);
    const vbH = Math.min(100, h + padYTop + padYBottom);
    return `${vbX} ${vbY} ${vbW} ${vbH}`;
});

const layerStyle = computed(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    width: `${props.width}px`,
    height: `${props.height}px`,
    pointerEvents: 'none',
    overflow: 'hidden'
}));

function getLabelStyle(ov) {
    if (!ov.points) return {};
    const [vbX, vbY, vbW, vbH] = viewBox.value.split(' ').map(parseFloat);
    const pts = ov.points.split(' ')[0].split(',');
    const xPercent = (parseFloat(pts[0]) - vbX) / vbW;
    const yPercent = (parseFloat(pts[1]) - vbY) / vbH;

    return {
        position: 'absolute',
        left: `${xPercent * 100}%`,
        top: `${yPercent * 100}%`,
        transform: 'translate(-50%, -100%) translateY(-2px)'
    };
}

// Unique ID for clip path to avoid conflicts
const clipId = computed(() => `clip-${props.source}-${props.folio}-${Math.abs(props.points.hashCode ? props.points.hashCode() : 0)}-${Math.random().toString(36).substr(2,5)}`);
</script>

<template>
<div class="cutout-wrapper">
    <svg :width="width" :height="height" :viewBox="viewBox" preserveAspectRatio="xMidYMid meet" class="cutout-svg">
        <defs>
            <clipPath :id="clipId">
                <polygon :points="polyPoints" />
            </clipPath>
        </defs>
        <!-- Map image to correct space -->
        <image 
            :href="imgUrl" 
            :x="useFullRes ? vbCoords.x : 0" 
            :y="useFullRes ? vbCoords.y : 0" 
            :width="useFullRes ? vbCoords.w : 100" 
            :height="useFullRes ? vbCoords.h : 100" 
            preserveAspectRatio="none"
            :clip-path="clip ? `url(#${clipId})` : undefined"
        />
        
        <!-- Overlays (Items on the line) -->
        <polygon v-for="(ov, idx) in overlays" :key="idx"
            :points="ov.points"
            :fill="ov.id === highlightId ? 'rgba(37, 99, 235, 0.4)' : 'rgba(0, 255, 0, 0.1)'"
            :stroke="ov.id === highlightId ? '#2563eb' : '#00cc00'"
            :stroke-width="ov.id === highlightId ? '1.5' : '0.3'"
            vector-effect="non-scaling-stroke"
            class="interactive-poly"
            :class="{ 'highlighted-poly': ov.id === highlightId }"
            @click="emit('zoom-item', ov)"
        />
        
        <!-- Region Outline -->
        <polygon 
            :points="polyPoints" 
            fill="none" 
            stroke="#cbd5e1" 
            stroke-width="0.5" 
            vector-effect="non-scaling-stroke" 
            opacity="0.8"
        />
    </svg>

    <!-- Elegant HTML Labels Overlay -->
    <div class="html-labels-layer" :style="layerStyle">
        <div v-for="(ov, idx) in overlays" :key="'lbl-'+idx" 
             class="html-label"
             :class="{ 'highlighted-label': ov.id === highlightId }"
             :style="getLabelStyle(ov)"
             @click="emit('zoom-item', ov)">
            <span v-if="starredIds.has(ov.id)" class="star-badge">★</span>
            {{ ov.displayId || (ov.id ? String(ov.id).substring(0,4) : "?") }}
        </div>
    </div>
    <div v-if="!hideLabel" class="label">{{ folio }}</div>
</div>
</template>

<style scoped>
.cutout-wrapper {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    transition: all 0.2s ease;
}

.cutout-svg {
    background: #fdfdfd;
    display: block;
    overflow: visible;
}

.html-labels-layer {
    z-index: 10;
}

.html-label {
    background: white;
    border: 1px solid black;
    color: black;
    padding: 1px 4px;
    font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    border-radius: 2px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    cursor: pointer;
}
.html-label:hover {
    background: #000;
    color: #fff;
    z-index: 20;
}
.star-badge { color: #f59e0b; margin-right: 2px; }

.highlighted-label {
    background: #2563eb !important;
    color: white !important;
    border-color: #1e3a8a !important;
    z-index: 30;
    transform: translate(-50%, -100%) translateY(-2px) scale(1.2);
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.highlighted-poly {
    filter: drop-shadow(0 0 4px rgba(37, 99, 235, 0.8));
    animation: pulse-blue 1.5s infinite;
}

@keyframes pulse-blue {
    0% { fill-opacity: 0.4; }
    50% { fill-opacity: 0.7; }
    100% { fill-opacity: 0.4; }
}

.interactive-poly {
    cursor: pointer;
}
.interactive-poly:hover {
    fill: rgba(0, 255, 0, 0.3);
}

.label {
    width: 100%;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    background: #f8f9fa;
    padding: 3px 0;
    border-top: 1px solid #eee;
    color: #666;
}
</style>
