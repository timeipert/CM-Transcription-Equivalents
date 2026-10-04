<script setup>
import { useOmmrContext } from '../../composables/ommr/ommrContext';
import PatternDisplay from '../../components/PatternDisplay.vue';
import OmmrSnippet from '../../components/OmmrSnippet.vue';

const {
    cardPadding,
    showMarkers,
    calibration,
    deskewFor,
    effFolio,
    localFor,
    serviceUrlFor,
    selectedPattern,
    folioFilter,
    selectedSnippets,
    cardSize,
    filteredSnippets,
    folioOptions,
    visibleSnippets,
    hasMore,
    sentinelRef,
    toggleSelect,
    selectAllVisible,
    clearSelection,
    lastSuggestion,
    glyphs,
    openPeek
} = useOmmrContext();
</script>

<template>
        <main class="ommr-ui snippet-gallery-area">
            <div class="gallery-header" v-if="selectedPattern">
                <div class="gallery-title">
                    <h3>
                        <PatternDisplay :pattern="selectedPattern" :glyphs="glyphs" />
                    </h3>
                    <span class="gallery-count">
                        {{ filteredSnippets.length }} candidate{{ filteredSnippets.length === 1 ? '' : 's' }}
                        <template v-if="folioFilter"> · filtered</template>
                    </span>
                </div>

                <div class="gallery-controls">
                    <select v-model="folioFilter" class="folio-select" title="Filter by folio">
                        <option value="">All folios ({{ folioOptions.length }})</option>
                        <option v-for="f in folioOptions" :key="f" :value="f">Fol. {{ f }}</option>
                    </select>
                    <div class="density">
                        <span title="Thumbnail size">🔍</span>
                        <input type="range" min="110" max="240" step="10" v-model.number="cardSize" />
                    </div>
                    <label class="marker-toggle" title="Overlay exact note positions">
                        <input type="checkbox" v-model="showMarkers" /> ⊙ marks
                    </label>
                    <button @click="selectAllVisible" class="btn-xs">Select all</button>
                    <button @click="clearSelection" class="btn-xs" :disabled="selectedSnippets.size === 0">Clear</button>
                </div>
            </div>

            <!-- Optimal-coverage suggestion summary -->
            <div v-if="lastSuggestion" class="suggest-panel">
                <div class="suggest-head">
                    <span>
                        ✨ Covered <b>{{ lastSuggestion.covered }}/{{ lastSuggestion.total }}</b> patterns
                        from <b>{{ lastSuggestion.lineCount }}</b> line{{ lastSuggestion.lineCount === 1 ? '' : 's' }}
                        (of {{ lastSuggestion.totalLines }}). Review per pattern, adjust, then Import.
                    </span>
                    <button class="btn-xs" @click="lastSuggestion = null">Dismiss</button>
                </div>
                <details class="suggest-lines">
                    <summary>Lines used</summary>
                    <ul>
                        <li v-for="(ln, i) in lastSuggestion.lines" :key="i">
                            <span class="ln-loc">Fol. {{ ln.folio }} · {{ ln.lineId.split(':').pop() }}</span>
                            <span class="ln-pats">
                                <PatternDisplay v-for="p in ln.covers" :key="p" :pattern="p" :glyphs="glyphs" class="ln-pat" />
                            </span>
                        </li>
                    </ul>
                </details>
            </div>

            <!-- Grid -->
            <div
                class="snippets-grid"
                v-if="filteredSnippets.length > 0"
                :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }"
            >
                <div
                    v-for="(snip, idx) in visibleSnippets"
                    :key="snip.id"
                    class="snippet-card"
                    :class="{ 'is-selected': selectedSnippets.has(snip.id) }"
                    @click="toggleSelect(snip)"
                >
                    <span v-if="idx === 0 && !folioFilter" class="rep-badge" title="Best representative by shape">★ suggested</span>
                    <span class="check" :class="{ on: selectedSnippets.has(snip.id) }">✓</span>
                    <button class="peek-btn" @click.stop="openPeek(snip)" title="View full page / fix folio">🔍</button>

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
                        :showMarkers="showMarkers"
                        :width="cardSize - 16"
                        :height="Math.round((cardSize - 16) * 0.66)"
                    />

                    <div class="snippet-meta">
                        <span class="folio-label">Fol. {{ snip.folio }}</span>
                        <span class="aspect-label" :class="{ outlier: Math.abs(snip.aspectRatio - 1.2) > 1.2 }">
                            {{ snip.aspectRatio }}×
                        </span>
                    </div>
                </div>
            </div>

            <div v-else class="empty-pattern-snippets">
                <p>No snippets found for this pattern{{ folioFilter ? ' on folio ' + folioFilter : '' }}.</p>
            </div>

            <!-- Infinite-scroll sentinel + "load more" affordance -->
            <div v-if="hasMore" ref="sentinelRef" class="load-more">
                <div class="progress-spinner small"></div>
                Showing {{ visibleSnippets.length }} of {{ filteredSnippets.length }} — loading more…
            </div>
        </main>
</template>

<style scoped>
.snippets-grid {
    flex: 1; overflow-y: auto; padding: 16px 20px;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px; align-content: start;
}
.snippet-card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: 8px; padding: 8px; display: flex; flex-direction: column;
    align-items: center; cursor: pointer; transition: all 0.15s ease;
    position: relative; user-select: none;
}
.snippet-card:hover {
    border-color: var(--color-primary);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    transform: translateY(-1px);
}
.snippet-card.selected {
    border-color: var(--color-primary);
    background: var(--color-primary-soft, rgba(99, 102, 241, 0.08));
    box-shadow: 0 0 0 2px var(--color-primary);
}
.snippet-card.rep { border-color: rgba(99, 102, 241, 0.6); }
.snippet-card:hover .btn-peek { opacity: 1; }
.rep-badge {
    font-size: 0.68rem; font-weight: 700; color: var(--color-primary);
    background: rgba(99, 102, 241, 0.15); padding: 1px 5px; border-radius: 8px;
}
</style>
