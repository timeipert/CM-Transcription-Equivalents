<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
    imageUrl: { type: String, required: true },
    existingPoints: { type: String, default: "" },
    cropRect: { type: Object, default: null }, // { x, y, w, h } in %
    overlays: { type: Array, default: () => [] } // [{ id, points, color }]
});

const emit = defineEmits(['save', 'cancel']);

// State
const dragStart = ref(null); // {x, y}
const dragCurrent = ref(null); // {x, y}
const isDraggingBox = ref(false);

// Zoom/Pan State
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);
const isPanning = ref(false);
const startPanX = ref(0);
const startPanY = ref(0);

const containerRef = ref(null);
const viewportRef = ref(null);

function initFromExistingPoints() {
    if (props.existingPoints) {
        const rect = getRectFromPoints(props.existingPoints);
        if (rect.w > 0.05 && rect.h > 0.05) {
            dragStart.value = { x: rect.x, y: rect.y };
            dragCurrent.value = { x: rect.x + rect.w, y: rect.y + rect.h };
            return;
        }
    }
    dragStart.value = null;
    dragCurrent.value = null;
}

onMounted(() => {
    initFromExistingPoints();
});

watch(() => props.existingPoints, () => {
    initFromExistingPoints();
});

const imageLoaded = ref(false);
const imageError = ref(false);

function onImageLoad(e) {
    imageLoaded.value = true;
    imageError.value = false;
    if (viewportRef.value && e.target) {
        const vpWidth = viewportRef.value.clientWidth;
        const imgWidth = e.target.clientWidth;
        // Center horizontally if viewport is wider than image
        if (vpWidth > imgWidth) {
            translateX.value = (vpWidth - imgWidth) / 2;
        }
    }
}

function onImageError() {
    imageLoaded.value = false;
    imageError.value = true;
}

watch(() => props.imageUrl, () => {
    imageLoaded.value = false;
    imageError.value = false;
});

// Helpers
function getRelativeCoords(e) {
    if (!containerRef.value) return { x: 0, y: 0 };
    const rootRect = containerRef.value.getBoundingClientRect();
    const x = ((e.clientX - rootRect.left) / rootRect.width) * 100;
    const y = ((e.clientY - rootRect.top) / rootRect.height) * 100;
    return { x, y };
}

function getRectFromPoints(pointsStr) {
    if (!pointsStr) return { x: 0, y: 0, w: 0, h: 0 };
    const parts = pointsStr.split(' ');
    let minX = 100, minY = 100, maxX = 0, maxY = 0;
    for (const p of parts) {
        if (!p.trim()) continue;
        const [x, y] = p.split(',').map(Number);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function onMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        startPan(e); // Allow pan in all modes
        return;
    }
    if (e.button === 0) {
        // Start Box
        const p = getRelativeCoords(e);
        dragStart.value = p;
        dragCurrent.value = p;
        isDraggingBox.value = true;
    }
}

function onMouseMove(e) {
    if (isPanning.value) {
        doPan(e);
        return;
    }
    if (isDraggingBox.value) {
        dragCurrent.value = getRelativeCoords(e);
    }
}

function onMouseUp(e) {
    if (isPanning.value) {
        endPan();
        return;
    }
    if (isDraggingBox.value) {
        isDraggingBox.value = false;
        // Optional: Auto-save if size > threshold?
    }
}

const boxRect = computed(() => {
    if (!dragStart.value || !dragCurrent.value) return { x:0, y:0, w:0, h:0 };
    const x1 = dragStart.value.x;
    const y1 = dragStart.value.y;
    const x2 = dragCurrent.value.x;
    const y2 = dragCurrent.value.y;
    
    return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1)
    };
});

function finishPolygon() {
    if (!dragStart.value || !dragCurrent.value) return;
    const b = boxRect.value;
    if (b.w < 0.1 || b.h < 0.1) {
        dragStart.value = null;
        dragCurrent.value = null;
        return;
    }
    
    // Create 4 points: TL, TR, BR, BL
    const x1 = b.x.toFixed(2);
    const y1 = b.y.toFixed(2);
    const x2 = (b.x + b.w).toFixed(2);
    const y2 = (b.y + b.h).toFixed(2);
    
    const str = `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`;
    emit('save', str);
    
    dragStart.value = null;
    dragCurrent.value = null;
}

function undo() {
    dragStart.value = null;
    dragCurrent.value = null;
}

// Pan/Zoom implementation
function onWheel(e) {
    e.preventDefault();
    if (!viewportRef.value) return;
    
    const rect = viewportRef.value.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const oldScale = scale.value;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    let newScale = oldScale * delta;
    if (newScale < 0.1) newScale = 0.1; 
    if (newScale > 50) newScale = 50;
    
    translateX.value = mouseX - (mouseX - translateX.value) * (newScale / oldScale);
    translateY.value = mouseY - (mouseY - translateY.value) * (newScale / oldScale);
    
    scale.value = newScale;
}
function startPan(e) {
    isPanning.value = true;
    startPanX.value = e.clientX - translateX.value;
    startPanY.value = e.clientY - translateY.value;
    e.preventDefault();
}
function doPan(e) {
    translateX.value = e.clientX - startPanX.value;
    translateY.value = e.clientY - startPanY.value;
}
function endPan() {
    isPanning.value = false;
}

const contentStyle = computed(() => {
    if (props.cropRect) {
        const { x, y, w, h } = props.cropRect;
        const s = 100 / w; // Base scale to fit width
        
        return {
             transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value}) scale(${s}) translate(-${x}%, -${y}%)`,
             transformOrigin: '0 0'
        };
    }
    return {
        transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
        transformOrigin: '0 0'
    };
});

const imageClipStyle = computed(() => {
    if (props.cropRect) {
        const { x, y, w, h } = props.cropRect;
        const top = y;
        const right = 100 - (x + w);
        const bottom = 100 - (y + h);
        const left = x;
        return {
            clipPath: `inset(${top}% ${right}% ${bottom}% ${left}%)`
        };
    }
    return {};
});
</script>

<template>
<div class="annotator-container">
    <div class="toolbar">
        <span class="hint">Draw a Box. <b>Save</b> to finish. <span v-if="!cropRect"><b>Alt+Drag</b> or Scroll to Zoom/Pan.</span></span>
        <div class="actions">
             <button @click="undo" :disabled="!dragStart" class="btn-secondary">Reset</button>
             <button @click="finishPolygon" class="btn-primary" :disabled="!dragStart">Save Selection</button>
        </div>
    </div>
    
    <div class="canvas-viewport" 
         ref="viewportRef"
         @wheel="onWheel"
         @mousedown="onMouseDown"
         @mousemove="onMouseMove"
         @mouseup="onMouseUp"
         @mouseleave="onMouseUp">
         
             <div class="canvas-content" :style="contentStyle" ref="containerRef">
            <div v-if="!imageLoaded && !imageError" class="loading-overlay">
                <div class="annotator-spinner"></div>
                <span>Loading Image...</span>
            </div>
            <div v-else-if="imageError" class="error-overlay">
                <span class="err-icon">⚠️</span>
                <span>Failed to load folio scan</span>
            </div>
            <img :src="imageUrl" class="bg-image" :style="imageClipStyle" draggable="false" @load="onImageLoad" @error="onImageError" />
             
             <!-- Drawing Layer -->
             <svg class="drawing-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
                 <!-- Existing Overlays -->
                 <polygon v-for="ov in overlays" :key="ov.id"
                          :points="ov.points"
                          fill="rgba(0, 255, 0, 0.2)"
                          stroke="var(--color-success)"
                          stroke-width="0.3"
                          vector-effect="non-scaling-stroke" 
                 />
                 
                 <!-- ID Labels -->
                  <g v-for="ov in overlays" :key="'label-' + ov.id">
                      <rect :x="getRectFromPoints(ov.points).x - 0.05" 
                            :y="getRectFromPoints(ov.points).y - 1.4" 
                            :width="Math.max(2.2, (ov.displayId || '').length * 0.8)" 
                            height="1.5" 
                            fill="rgba(79, 70, 229, 0.9)" 
                            rx="0.2" />
                      <text :x="getRectFromPoints(ov.points).x + 0.15" 
                            :y="getRectFromPoints(ov.points).y - 0.3" 
                            fill="white" font-size="1.1" font-family="Inter, sans-serif" font-weight="bold">
                          {{ ov.displayId || (ov.id ? String(ov.id).substring(0,4) : '?') }}
                      </text>
                  </g>
                 
                 <!-- Current Box Draft -->
                 <rect v-if="dragStart && dragCurrent" 
                       :x="boxRect.x" :y="boxRect.y" :width="boxRect.w" :height="boxRect.h"
                       fill="rgba(0,123,255,0.2)"
                       stroke="var(--color-primary)"
                       stroke-width="0.3" 
                       vector-effect="non-scaling-stroke"/>
             </svg>
         </div>
    </div>
</div>
</template>

<style scoped>
.annotator-container { 
    display: flex; flex-direction: column; height: 100%; 
    background: var(--color-text); /* Deep slate */
}
.toolbar { 
    padding: 12px 20px; 
    background: var(--color-surface); 
    display: flex; justify-content: space-between; align-items: center; 
    z-index: 10;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.hint { font-size: 0.85rem; color: var(--color-text-muted); }
.hint b { color: var(--color-text); }

.canvas-viewport { 
    flex: 1; 
    overflow: hidden; 
    position: relative; 
    cursor: crosshair;
}

.canvas-content {
    display: inline-block;
    position: relative;
    transform-origin: 0 0;
}

.bg-image { 
    display: block; 
    max-width: none; 
    height: 85vh; 
    pointer-events: none; 
    user-select: none; 
    box-shadow: 0 0 40px rgba(0,0,0,0.5);
}

.drawing-layer { 
    position: absolute; top:0; left:0; width:100%; height:100%; 
}

.btn-primary { 
    background: var(--color-primary); color: white; border: none; 
    padding: 6px 16px; border-radius: 6px; cursor: pointer; 
    font-weight: 600; transition: all 0.2s;
}
.btn-primary:hover { background: var(--color-primary-hover); transform: translateY(-1px); }
.btn-primary:disabled { background: var(--color-text-light); transform: none; cursor: not-allowed; }

.btn-secondary {
    background: var(--color-surface-muted); color: var(--color-text); border: 1px solid var(--color-border);
    padding: 6px 16px; border-radius: 6px; cursor: pointer;
    font-weight: 500; transition: all 0.2s;
}
.btn-secondary:hover { background: var(--color-border); color: var(--color-text); }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

button { margin-left: 8px; }

.loading-overlay {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    background: rgba(15, 23, 42, 0.85); color: white;
    z-index: 5;
    gap: 12px;
    font-weight: 500;
}

.annotator-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--color-primary, #6366f1);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.error-overlay {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    background: rgba(24, 24, 27, 0.95); color: #ef4444;
    border: 2px dashed rgba(239, 68, 68, 0.4);
    z-index: 5;
    gap: 8px;
    font-weight: 600;
}

.err-icon {
    font-size: 32px;
}
</style>
