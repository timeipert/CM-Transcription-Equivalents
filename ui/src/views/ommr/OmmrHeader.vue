<script setup>
import { useOmmrContext } from '../../composables/ommr/ommrContext';

const {
    manifestState,
    anyImages,
    selectedSnippets,
    allPatterns,
    suggestSet,
    suggestLines,
    handleFolderUpload,
    ommrStore,
    activeProjectManuscript,
    matchingProjectFoliosCount,
    showSettings,
    showPreview,
    openRemapModal,
    transferSelectedToAnnotations
} = useOmmrContext();
</script>

<template>
    <header class="ommr-ui explorer-header">
        <div class="header-left">
            <div class="title-with-switcher">
                <h2>Import <span class="title-sub">· OMMR4all</span></h2>
            
                <!-- Active Manuscript Switcher if multiple loaded -->
                <div class="source-switcher-container" v-if="ommrStore.activeSource">
                    <span class="switcher-label">Manuscript:</span>
                    <select 
                        v-if="ommrStore.availableSources.length > 1"
                        :value="ommrStore.activeSource" 
                        @change="ommrStore.activeSource = $event.target.value"
                        class="source-switcher-select"
                    >
                        <option v-for="src in ommrStore.availableSources" :key="src" :value="src">
                            {{ src }} ({{ ommrStore.loadedDatasets[src]?.totalSnippets || 0 }} neumes)
                        </option>
                    </select>
                    <span v-else class="single-source-name">{{ ommrStore.activeSource }}</span>

                    <button class="btn-xs ghost-btn" @click="openRemapModal" title="Re-assign to another project manuscript">
                        ⇄ Change
                    </button>
                </div>
            </div>

            <div class="source-meta-bar" v-if="ommrStore.activeSource">
                <span class="source-tag">
                    <b>{{ ommrStore.activeSnippets.length }}</b> neumes · <b>{{ allPatterns.length }}</b> patterns
                </span>
            
                <!-- Project correspondence badge -->
                <span v-if="activeProjectManuscript" class="proj-badge" :class="{ 'has-match': matchingProjectFoliosCount > 0 }">
                    ✓ Project Manuscript <span v-if="matchingProjectFoliosCount">({{ matchingProjectFoliosCount }} folios matched)</span>
                </span>
                <span v-else class="proj-badge unlinked">
                    Custom Manuscript
                </span>

                <!-- IIIF status badge -->
                <span class="iiif-badge" :class="manifestState.status">
                    <span v-if="manifestState.status === 'ok'">✓ IIIF Connected ({{ manifestState.count }} canvases)</span>
                    <span v-else-if="manifestState.status === 'loading'">↻ IIIF Loading…</span>
                    <span v-else-if="manifestState.status === 'error'">⚠️ IIIF Error</span>
                    <span v-else-if="ommrStore.hasLocalImages">✓ Local Images</span>
                    <span v-else>⚠️ No IIIF Manifest</span>
                </span>
            </div>
        </div>

        <div class="header-actions" v-if="ommrStore.activeSource">
            <!-- Auto-select tools -->
            <div class="action-group" role="group" aria-label="Auto-select">
                <button class="btn-secondary" @click="suggestSet"
                    title="Auto-select one example per pattern from as few lines as possible">
                    ✨ Suggest set
                </button>
                <button class="btn-secondary" @click="suggestLines"
                    title="Fewest staff lines that show all patterns — preview as line strips">
                    🎼 Lines
                </button>
            </div>

            <!-- Utilities -->
            <div class="action-group" role="group" aria-label="Utilities">
                <label class="btn-secondary upload-btn" title="Load another OMMR export">
                    <span>📁 Load</span>
                    <input type="file" webkitdirectory directory multiple @change="handleFolderUpload" hidden />
                </label>
                <button class="btn-secondary icon-btn" :class="{ 'needs-attention': !anyImages }"
                    @click="showSettings = true" title="Manifest & display settings" aria-label="Settings">
                    ⚙<span v-if="!anyImages" class="attn-dot">!</span>
                </button>
            </div>

            <!-- Commit -->
            <div class="action-group commit-group" role="group" aria-label="Import">
                <button class="btn-secondary" :disabled="selectedSnippets.size === 0"
                    @click="showPreview = true" title="Preview the selected representatives as final strips">
                    👁 Preview ({{ selectedSnippets.size }})
                </button>
                <button class="btn-primary" :disabled="selectedSnippets.size === 0"
                    @click="transferSelectedToAnnotations" title="Convert selected snippets into annotations">
                    ✓ Import ({{ selectedSnippets.size }})
                </button>
            </div>
        </div>
    </header>
</template>

<style scoped>
.explorer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4) var(--space-6);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    flex-wrap: wrap;
    gap: 12px;
}
.header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.title-with-switcher {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
}
.title-with-switcher h2 { margin: 0; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.01em; }
.title-sub { font-size: 0.82rem; font-weight: 500; color: var(--color-text-muted); }
.source-switcher-container {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--color-surface-muted, rgba(255,255,255,0.05));
    border: 1px solid var(--color-border);
    padding: 3px 8px;
    border-radius: 6px;
}
.switcher-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-weight: 600;
}
.source-switcher-select {
    background: var(--color-bg);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
}
.single-source-name {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-primary);
}
/* The base look has always come from .btn-xs (it was defined later and won every tie);
   this only adds the hover accent. */
.ghost-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
}
.source-meta-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 2px;
}
.source-tag { font-size: 0.8rem; color: var(--color-text-muted); }
.proj-badge, .iiif-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.72rem;
    font-weight: 600;
}
.proj-badge {
    background: rgba(99, 102, 241, 0.12);
    color: var(--color-primary);
}
.proj-badge.has-match {
    background: rgba(16, 185, 129, 0.15);
    color: var(--color-success);
}
.proj-badge.unlinked {
    background: rgba(255, 255, 255, 0.07);
    color: var(--color-text-muted);
}
.iiif-badge.ok { background: rgba(16, 185, 129, 0.15); color: var(--color-success); }
.iiif-badge.loading { background: rgba(99, 102, 241, 0.12); color: var(--color-primary); }
.iiif-badge.error, .iiif-badge.unlinked { background: rgba(245, 158, 11, 0.14); color: var(--color-warning, #f59e0b); }
.header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.action-group {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px; border-radius: 9px;
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
}
.action-group .btn-secondary { border: 1px solid transparent; background: transparent; box-shadow: none; }
.action-group .btn-secondary:hover:not(:disabled) { background: var(--color-surface); border-color: var(--color-border); }
.commit-group { background: transparent; border-color: transparent; padding: 0; }
/* (its own `padding: 8px 10px` never applied: .btn-secondary, defined later, won the tie) */
.icon-btn { position: relative; font-size: 1rem; line-height: 1; }
@media (max-width: 1100px) {
    .action-group { padding: 3px; }
    .header-actions { gap: 6px; }
}
.btn-secondary.needs-attention { border-color: var(--color-warning, #f59e0b); }
.attn-dot {
    display: inline-flex; align-items: center; justify-content: center;
    width: 14px; height: 14px; margin-left: 6px; border-radius: 50%;
    background: var(--color-warning, #f59e0b); color: #1a1200;
    font-size: 10px; font-weight: 800;
}
</style>
