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
    overlays: { type: Array, default: () => [] } // [{ points, color? }]
});

const { getImageUrl } = useImageManifest();
const imgUrl = computed(() => getImageUrl(props.source, props.folio));

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
    const padX = Math.max(w * props.padding, 2);
    const padY = Math.max(h * props.padding, 2);
    
    // Expand box
    const vbX = Math.max(0, minX - padX);
    const vbY = Math.max(0, minY - padY);
    const vbW = Math.min(100, w + padX*2);
    const vbH = Math.min(100, h + padY*2);
    
    return `${vbX} ${vbY} ${vbW} ${vbH}`;
});

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
        <!-- Map image to 100x100 space so % coords work -->
        <image 
            :href="imgUrl" 
            x="0" y="0" width="100" height="100" 
            preserveAspectRatio="none"
            :clip-path="clip ? `url(#${clipId})` : undefined"
        />
        
        <!-- Overlays (Items on the line) -->
        <polygon v-for="(ov, idx) in overlays" :key="idx"
            :points="ov.points"
            fill="rgba(0, 255, 0, 0.3)"
            stroke="#00cc00"
            stroke-width="0.5"
            vector-effect="non-scaling-stroke"
        />
        
        <!-- ID Labels in Cutout -->
        <g v-for="(ov, idx) in overlays" :key="'lbl-'+idx">
             <!-- Simple logic to find top-left of point string -->
             <text :x="ov.points.split(' ')[0].split(',')[0]" 
                   :y="ov.points.split(' ')[0].split(',')[1] - 2" 
                   fill="black" font-size="6" font-weight="bold" stroke="white" stroke-width="0.5">
                 {{ ov.id }}
             </text>
        </g>
        
        <!-- Region Outline -->
        <polygon 
            :points="polyPoints" 
            fill="none" 
            stroke="red" 
            stroke-width="1" 
            vector-effect="non-scaling-stroke" 
            opacity="0.8"
        />
    </svg>
    <div class="label">{{ folio }}</div>
</div>
</template>

<style scoped>
.cutout-wrapper {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    transition: all 0.2s ease;
    cursor: zoom-in;
}
.cutout-wrapper:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    border-color: #007bff;
}
.cutout-svg {
    background: #fdfdfd;
    display: block;
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
