<script setup>
import { useOmmrContext } from '../../composables/ommr/ommrContext';

const {
    resolvedIiifKey,
    anyImages,
    ommrStore,
    showSettings,
    statusMessage
} = useOmmrContext();
</script>

<template>
    <div v-if="ommrStore.isProcessing" class="ommr-ui progress-banner">
        <div class="progress-spinner"></div>
        <span>{{ ommrStore.progressStatus || 'Processing…' }}</span>
    </div>
    <div v-else-if="statusMessage" class="ommr-ui status-banner">{{ statusMessage }}</div>

    <div
        v-if="ommrStore.activeSource && ommrStore.activeSnippets.length && !anyImages && !ommrStore.isProcessing"
        class="ommr-ui warn-banner"
    >
        <span>
            No page images for <b>{{ resolvedIiifKey || ommrStore.activeSource }}</b>.
            Re-import the OMMR folder <i>with its images</i> for exact crops, or link a IIIF manifest URL in settings.
        </span>
        <button class="btn-xs" @click="showSettings = true">Open settings</button>
    </div>
</template>

<style scoped>
.status-banner,
.progress-banner,
.warn-banner {
    padding: 8px 16px;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: center;
}
.status-banner {
    background: rgba(16, 185, 129, 0.15);
    border-bottom: 1px solid var(--color-success);
    color: var(--color-success);
}
.progress-banner {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    background: rgba(99, 102, 241, 0.12);
    border-bottom: 1px solid var(--color-primary);
    color: var(--color-primary);
}
.warn-banner {
    display: flex; align-items: center; justify-content: center; gap: 12px;
    background: rgba(245, 158, 11, 0.15);
    border-bottom: 1px solid var(--color-warning, #f59e0b);
    color: var(--color-warning, #f59e0b);
}
</style>
