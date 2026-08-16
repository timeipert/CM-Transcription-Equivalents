<script setup>
import { ref, watch, onMounted } from 'vue';

const props = defineProps({
    src: { type: String, default: '' },
    alt: { type: String, default: 'Image' },
    draggable: { type: Boolean, default: false },
    aspectRatio: { type: String, default: null },
    fit: { type: String, default: 'contain' } // 'contain', 'cover', 'fill'
});

const emit = defineEmits(['load', 'error']);

const status = ref('loading'); // 'loading' | 'loaded' | 'error'

function onLoad(e) {
    status.value = 'loaded';
    emit('load', e);
}

function onError(e) {
    status.value = 'error';
    emit('error', e);
}

watch(() => props.src, (newSrc) => {
    if (!newSrc) {
        status.value = 'error';
    } else {
        status.value = 'loading';
    }
}, { immediate: true });
</script>

<template>
<div class="smart-image-wrapper" :style="aspectRatio ? { aspectRatio } : {}">
    <!-- Image Loader Shimmer -->
    <div v-if="status === 'loading'" class="img-loader-overlay">
        <div class="loader-spinner"></div>
        <span class="loader-text">Loading...</span>
    </div>

    <!-- Error Placeholder -->
    <div v-else-if="status === 'error'" class="img-error-overlay" title="Image failed to load or scan not found">
        <span class="error-icon">⚠️</span>
        <span class="error-text">Image unavailable</span>
    </div>

    <!-- Actual Image -->
    <img 
        v-show="status === 'loaded'"
        :src="src" 
        :alt="alt" 
        :draggable="draggable"
        :style="{ objectFit: fit }"
        class="smart-img"
        @load="onLoad" 
        @error="onError" 
    />
</div>
</template>

<style scoped>
.smart-image-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #0f172a;
    overflow: hidden;
}

.smart-img {
    display: block;
    width: 100%;
    height: 100%;
    transition: opacity 0.2s ease-in-out;
}

.img-loader-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    gap: 8px;
    z-index: 2;
}

.loader-spinner {
    width: 24px;
    height: 24px;
    border: 2.5px solid rgba(255, 255, 255, 0.15);
    border-top-color: var(--color-primary, #6366f1);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.loader-text {
    font-size: 11px;
    color: #94a3b8;
    font-weight: 500;
    letter-spacing: 0.02em;
}

.img-error-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: #18181b;
    border: 1px dashed rgba(239, 68, 68, 0.4);
    gap: 4px;
    color: #ef4444;
    padding: 8px;
    text-align: center;
    box-sizing: border-box;
    z-index: 2;
}

.error-icon {
    font-size: 20px;
    line-height: 1;
}

.error-text {
    font-size: 11px;
    font-weight: 600;
    color: #fca5a5;
}
</style>
