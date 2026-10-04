<script setup>
import './ommr/ommrShared.css';
import { computed } from 'vue';
import { useOmmrExplorer } from '../composables/ommr/useOmmrExplorer';
import { provideOmmrContext } from '../composables/ommr/ommrContext';
import OmmrHeader from './ommr/OmmrHeader.vue';
import OmmrBanners from './ommr/OmmrBanners.vue';
import OmmrEmptyState from './ommr/OmmrEmptyState.vue';
import OmmrPatternSidebar from './ommr/OmmrPatternSidebar.vue';
import OmmrSnippetGallery from './ommr/OmmrSnippetGallery.vue';
import OmmrLinePreview from './ommr/OmmrLinePreview.vue';
import OmmrSelectionPreview from './ommr/OmmrSelectionPreview.vue';
import OmmrRemapModal from './ommr/OmmrRemapModal.vue';
import OmmrImportModal from './ommr/OmmrImportModal.vue';
import OmmrSettingsDrawer from './ommr/OmmrSettingsDrawer.vue';
import OmmrPageModal from '../components/OmmrPageModal.vue';
import ManuscriptCleanupModal from '../components/ManuscriptCleanupModal.vue';

/**
 * The OMMR4all import screen: browse the neumes found in an OMMR export, pick
 * one good example per pattern, and import them as annotations.
 *
 * This view only lays the screens out. The state they share (what is loaded,
 * what is selected, which dialog is open) is created once here and provided to
 * them; see composables/ommr/useOmmrExplorer.js.
 */
const explorer = provideOmmrContext(useOmmrExplorer());
const {
    ommrStore, flash, showCleanupModal,
    peekSnippet, effFolio, deskewFor, folioOffset, setFolioOffset,
    indexMode, getIiifCanvasByIndex, canvasIndexFor
} = explorer;

const isEmpty = computed(() => !ommrStore.activeSource || ommrStore.activeSnippets.length === 0);
</script>

<template>
<div class="ommr-explorer-view">
    <OmmrHeader />
    <OmmrBanners />

    <OmmrEmptyState v-if="isEmpty" />

    <!-- Master-Detail Explorer -->
    <div v-else class="explorer-body">
        <OmmrPatternSidebar />
        <OmmrSnippetGallery />
    </div>

    <OmmrPageModal
        v-if="peekSnippet"
        :snippet="peekSnippet"
        :effectiveFolio="effFolio(peekSnippet.folio)"
        :deskew="deskewFor(peekSnippet.folio)"
        :folioOffset="folioOffset"
        :serviceUrl="indexMode ? (getIiifCanvasByIndex(peekSnippet.source, canvasIndexFor(peekSnippet.folio))?.serviceUrl || '') : ''"
        :canvasLabel="indexMode ? (getIiifCanvasByIndex(peekSnippet.source, canvasIndexFor(peekSnippet.folio))?.label || '') : ''"
        @close="peekSnippet = null"
        @set-offset="setFolioOffset"
    />

    <OmmrLinePreview />
    <OmmrSelectionPreview />
    <OmmrRemapModal />
    <OmmrImportModal />
    <OmmrSettingsDrawer />

    <!-- Manuscript Cleanup Modal -->
    <ManuscriptCleanupModal
        :isOpen="showCleanupModal"
        :source="ommrStore.activeSource"
        @close="showCleanupModal = false"
        @deleted="flash"
    />
</div>
</template>

<style scoped>
.ommr-explorer-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
    color: var(--color-text);
}
.explorer-body { flex: 1; display: flex; overflow: hidden; }
</style>
