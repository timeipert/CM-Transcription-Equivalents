<script setup>
import { useOmmrContext } from '../../composables/ommr/ommrContext';
import PatternDisplay from '../../components/PatternDisplay.vue';

const {
    selectedPattern,
    searchFilter,
    sortOrder,
    isIncluded,
    toggleInclude,
    includeAll,
    includeNone,
    includedCount,
    allPatterns,
    coveredPatterns,
    ommrStore,
    glyphs
} = useOmmrContext();
</script>

<template>
        <aside class="ommr-ui pattern-sidebar">
            <div class="sidebar-search">
                <input type="text" v-model="searchFilter" placeholder="Search pattern or neume name…" class="search-input" />
            </div>
            <div class="sort-controls">
                <label>Sort</label>
                <select v-model="sortOrder" class="sort-select">
                    <option value="freq">Highest frequency</option>
                    <option value="length">Length</option>
                    <option value="alpha">Alphabetical</option>
                </select>
            </div>
            <div class="include-controls">
                <span>Optimize <b>{{ includedCount }}</b>/{{ allPatterns.length }}</span>
                <div class="incl-btns">
                    <button class="btn-xs" @click="includeAll">All</button>
                    <button class="btn-xs" @click="includeNone">None</button>
                </div>
            </div>
            <div class="pattern-list">
                <div
                    v-for="pat in allPatterns"
                    :key="pat"
                    class="pattern-item"
                    :class="{ active: selectedPattern === pat, excluded: !isIncluded(pat) }"
                    @click="selectedPattern = pat"
                >
                    <input
                        type="checkbox"
                        class="incl-check"
                        :checked="isIncluded(pat)"
                        title="Include this pattern in the optimization"
                        @click.stop
                        @change="toggleInclude(pat)"
                    />
                    <div class="pattern-title">
                        <PatternDisplay :pattern="pat" :glyphs="glyphs" />
                    </div>
                    <span class="pattern-badges">
                        <span v-if="coveredPatterns.has(pat)" class="cover-dot" title="Has a selected example">✓</span>
                        <span class="count-badge">{{ ommrStore.patternFrequencies[pat] }}</span>
                    </span>
                </div>
                <div v-if="!allPatterns.length" class="sidebar-empty">No patterns match “{{ searchFilter }}”.</div>
            </div>
        </aside>
</template>

<style scoped>
.pattern-sidebar {
    width: 320px; background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex; flex-direction: column; flex-shrink: 0;
}
.sidebar-search { padding: 12px; border-bottom: 1px solid var(--color-border); }
.search-input {
    width: 100%; box-sizing: border-box; padding: 8px 12px;
    border: 1px solid var(--color-border); border-radius: 6px;
    background: var(--color-bg); color: var(--color-text); font-size: 0.9rem;
}
.sort-controls, .include-controls {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 12px; border-bottom: 1px solid var(--color-border);
    font-size: 0.78rem; color: var(--color-text-muted);
}
.sort-select {
    background: var(--color-bg); color: var(--color-text);
    border: 1px solid var(--color-border); border-radius: 4px;
    padding: 2px 6px; font-size: 0.78rem;
}
.incl-btns { display: flex; gap: 4px; }
.pattern-list { flex: 1; overflow-y: auto; list-style: none; margin: 0; padding: 0; }
.pattern-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px; border-bottom: 1px solid var(--color-border);
    cursor: pointer; transition: background 0.15s ease;
}
.pattern-item:hover { background: var(--color-surface-hover, rgba(255,255,255,0.03)); }
.pattern-item.active {
    background: var(--color-primary-soft, rgba(99, 102, 241, 0.15));
    border-left: 3px solid var(--color-primary);
}
</style>
