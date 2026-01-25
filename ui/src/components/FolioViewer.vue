<script setup>
import { computed } from 'vue';

const props = defineProps({
    imageUrl: { type: String, required: true },
    annotations: { type: Array, default: () => [] } // [{ points: "10,10 20,20...", color: "red", id: 1 }]
});

// Since polygons are relative (%), we use viewBox 0 0 100 100 to map them easily?
// CSS handles the aspect ratio scaling.
</script>

<template>
<div class="folio-viewer">
    <div class="image-container">
        <!-- Image -->
        <img :src="imageUrl" alt="Folio Scan" class="scan-image" />
        
        <!-- SVG Overlay -->
        <svg class="overlay-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon 
                v-for="ann in annotations" 
                :key="ann.id"
                :points="ann.points"
                class="annotation-poly"
                :stroke="ann.color || 'red'"
                fill="rgba(255, 0, 0, 0.2)"
                vector-effect="non-scaling-stroke"
            />
        </svg>
    </div>
</div>
</template>

<style scoped>
.folio-viewer {
    width: 100%;
    height: 100%;
    background: #333;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: auto;
}
.image-container {
    position: relative;
    display: inline-block;
    max-width: 95%;
    max-height: 95%;
}
.scan-image {
    display: block;
    max-width: 100%;
    max-height: 80vh; 
    border: 2px solid #555;
}
.overlay-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none; /* Let clicks pass unless editing */
}
.annotation-poly {
    stroke-width: 0.5px;
    transition: fill 0.2s;
}
.annotation-poly:hover {
    fill: rgba(255, 0, 0, 0.4);
    cursor: pointer;
    pointer-events: auto;
}
</style>
