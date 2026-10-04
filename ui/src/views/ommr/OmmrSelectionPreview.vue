<script setup>
import { useOmmrContext } from '../../composables/ommr/ommrContext';
import PatternDisplay from '../../components/PatternDisplay.vue';
import OmmrSnippet from '../../components/OmmrSnippet.vue';

const {
    cardPadding,
    calibration,
    deskewFor,
    effFolio,
    localFor,
    serviceUrlFor,
    selectedSnippets,
    toggleSelect,
    selectedByPattern,
    glyphs,
    showPreview,
    transferSelectedToAnnotations
} = useOmmrContext();
</script>

<template>
    <div v-if="showPreview" class="ommr-ui preview-overlay" @click.self="showPreview = false">
        <div class="preview-panel">
            <header class="preview-head">
                <div>
                    <h3>Selection preview</h3>
                    <span class="preview-sub">{{ selectedSnippets.size }} representatives · {{ selectedByPattern.length }} patterns</span>
                </div>
                <div class="preview-actions">
                    <button class="btn-primary" :disabled="selectedSnippets.size === 0"
                            @click="transferSelectedToAnnotations(); showPreview = false">
                        ✓ Import to Manuscript
                    </button>
                    <button class="close-btn" @click="showPreview = false">✕</button>
                </div>
            </header>

            <div class="preview-body">
                <div v-if="selectedByPattern.length === 0" class="preview-empty">Nothing selected yet.</div>
                <div v-for="grp in selectedByPattern" :key="grp.pattern" class="preview-row">
                    <div class="preview-rowhead">
                        <PatternDisplay :pattern="grp.pattern" :glyphs="glyphs" />
                        <span class="preview-name">{{ grp.pattern }}</span>
                    </div>
                    <div class="preview-strips">
                        <div v-for="snip in grp.snippets" :key="snip.id" class="preview-strip">
                            <OmmrSnippet
                                :source="snip.source"
                                :folio="effFolio(snip.folio)"
                                :points="snip.points"
                                :padding="cardPadding"
                                :calibration="calibration"
                                :localSrc="localFor(snip)"
                                :serviceUrl="serviceUrlFor(snip)"
                                :deskewAngle="deskewFor(snip.folio).angle"
                                :pageW="deskewFor(snip.folio).w"
                                :pageH="deskewFor(snip.folio).h"
                                :markers="snip.notePoints"
                                :showMarkers="false"
                                :width="200"
                                :height="76"
                            />
                            <span class="preview-folio">Fol. {{ snip.folio }}</span>
                            <button class="strip-remove" title="Remove from selection" @click="toggleSelect(snip)">✕</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.preview-empty { color: var(--color-text-muted); text-align: center; padding: 40px; }
.preview-row { display: flex; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--color-border); }
.preview-rowhead { flex: 0 0 120px; display: flex; flex-direction: column; gap: 4px; padding-top: 4px; }
.preview-name { font-size: 0.78rem; color: var(--color-text-muted); font-style: italic; }
.preview-strips { display: flex; flex-wrap: wrap; gap: 12px; flex: 1; }
.preview-strip { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.preview-strip:hover .strip-remove { opacity: 1; }
.preview-folio { font-size: 0.72rem; color: var(--color-text-muted); }
.strip-remove {
    position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%;
    border: none; background: var(--color-danger, #ef4444); color: white; font-size: 10px;
    cursor: pointer; opacity: 0; transition: opacity 0.15s ease;
}
</style>
