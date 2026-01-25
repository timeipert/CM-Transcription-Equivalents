<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
    imageUrl: { type: String, required: true },
    existingPoints: { type: String, default: "" } 
});

const emit = defineEmits(['save']);

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
const imageLoaded = ref(false);

import { watch } from 'vue';
watch(() => props.imageUrl, () => {
    imageLoaded.value = false;
});

// Helpers
function getRelativeCoords(e) {
    if (!containerRef.value) return { x: 0, y: 0 };
    const rootRect = containerRef.value.getBoundingClientRect();
    const x = ((e.clientX - rootRect.left) / rootRect.width) * 100;
    const y = ((e.clientY - rootRect.top) / rootRect.height) * 100;
    return { x, y };
}

function onMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        startPan(e);
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
    if (b.w < 0.5 || b.h < 0.5) {
        alert("Box too small");
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
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    let newScale = scale.value * delta;
    if (newScale < 1) newScale = 1;
    if (newScale > 10) newScale = 10;
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

const contentStyle = computed(() => ({
    transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
    transformOrigin: '0 0'
}));
</script>

<template>
<div class="annotator-container">
    <div class="toolbar">
        <span class="hint">Draw a Box. <b>Save</b> to finish. <b>Alt+Drag</b> or Scroll to Zoom/Pan.</span>
        <div class="actions">
             <button @click="undo" :disabled="!dragStart" class="btn-secondary">Reset</button>
             <button @click="finishPolygon" class="btn-primary" :disabled="!dragStart">Save Selection</button>
        </div>
    </div>
    
    <div class="canvas-viewport" 
         @wheel="onWheel"
         @mousedown="onMouseDown"
         @mousemove="onMouseMove"
         @mouseup="onMouseUp"
         @mouseleave="onMouseUp">
         
         <div class="canvas-content" :style="contentStyle" ref="containerRef">
             <div v-if="!imageLoaded" class="loading-overlay">Loading Image...</div>
             <img :src="imageUrl" class="bg-image" draggable="false" @load="imageLoaded = true" />
             
             <!-- Drawing Layer -->
             <svg class="drawing-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
                 <!-- Current Box Draft -->
                 <rect v-if="dragStart && dragCurrent" 
                       :x="boxRect.x" :y="boxRect.y" :width="boxRect.w" :height="boxRect.h"
                       fill="rgba(0,123,255,0.2)" stroke="#007bff" stroke-width="0.3" 
                       vector-effect="non-scaling-stroke"/>
             </svg>
         </div>
    </div>
</div>
</template>

<style scoped>
.annotator-container { 
    display: flex; flex-direction: column; height: 100%; 
    background: #0f172a; /* Deep slate */
}
.toolbar { 
    padding: 12px 20px; 
    background: #ffffff; 
    display: flex; justify-content: space-between; align-items: center; 
    z-index: 10;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.hint { font-size: 0.85rem; color: #64748b; }
.hint b { color: #334155; }

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
    background: #3b82f6; color: white; border: none; 
    padding: 6px 16px; border-radius: 6px; cursor: pointer; 
    font-weight: 600; transition: all 0.2s;
}
.btn-primary:hover { background: #2563eb; transform: translateY(-1px); }
.btn-primary:disabled { background: #94a3b8; transform: none; cursor: not-allowed; }

.btn-secondary {
    background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;
    padding: 6px 16px; border-radius: 6px; cursor: pointer;
    font-weight: 500; transition: all 0.2s;
}
.btn-secondary:hover { background: #e2e8f0; color: #1e293b; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

button { margin-left: 8px; }

.loading-overlay {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; justify-content: center; align-items: center;
    background: rgba(15, 23, 42, 0.8); color: white;
    z-index: 5;
    font-weight: 500;
}
</style>
