import { ref, computed, watch, onUnmounted } from 'vue';
import { useOmmrStore } from '../../stores/ommr';
import { compareChantPatterns } from '../../utils/sorting';
import { suggestOptimalSelection, suggestLineCoverage } from '../../utils/ommrOptimizers';

/** How many snippet cards are mounted at once; more load as the user scrolls. */
const PAGE = 60;

/**
 * What the explorer shows and what the user has picked: the pattern catalog, the
 * candidate snippets for the selected pattern, the selection, and the two
 * helpers that propose a good selection automatically.
 *
 * @param {{ flash: (message: string) => void }} deps
 */
export function useOmmrCatalog({ flash }) {
    const ommrStore = useOmmrStore();

    // --- View state ---
    const selectedPattern = ref(null);
    const searchFilter = ref('');
    const sortOrder = ref('freq'); // 'freq' | 'length' | 'alpha'
    const folioFilter = ref(''); // filter snippets by folio within a pattern
    const selectedSnippets = ref(new Set());
    const cardSize = ref(160); // grid density (px)

    // Which patterns take part in the optimizers. null = all (the default).
    const includedPatterns = ref(null);
    const isIncluded = pattern => !includedPatterns.value || includedPatterns.value.has(pattern);
    function toggleInclude(pattern) {
        if (!includedPatterns.value) includedPatterns.value = new Set(Object.keys(ommrStore.snippetsByPattern));
        const next = new Set(includedPatterns.value);
        next.has(pattern) ? next.delete(pattern) : next.add(pattern);
        includedPatterns.value = next;
    }
    const includeAll = () => { includedPatterns.value = null; };
    const includeNone = () => { includedPatterns.value = new Set(); };

    // --- Pattern catalog (sidebar) ---
    const allPatterns = computed(() => {
        const patterns = Object.keys(ommrStore.snippetsByPattern);
        if (!patterns.length) return [];
        const q = searchFilter.value.trim().toLowerCase();
        return patterns
            .filter(p => !q || p.toLowerCase().includes(q))
            .sort((a, b) => compareChantPatterns(a, b, sortOrder.value, ommrStore.patternFrequencies));
    });
    const includedCount = computed(() => allPatterns.value.filter(isIncluded).length);

    // --- Candidate snippets for the selected pattern, best representatives first ---
    const sortedSnippets = computed(() => {
        if (!selectedPattern.value) return [];
        const list = ommrStore.snippetsByPattern[selectedPattern.value] || [];
        const sel = selectedSnippets.value;
        // Selected first, then representative shapes (balanced aspect), then folio.
        return [...list].sort((a, b) => {
            const sa = sel.has(a.id) ? 0 : 1;
            const sb = sel.has(b.id) ? 0 : 1;
            if (sa !== sb) return sa - sb;
            const distA = Math.abs(a.aspectRatio - 1.2);
            const distB = Math.abs(b.aspectRatio - 1.2);
            if (Math.abs(distA - distB) > 0.4) return distA - distB;
            return a.folio.localeCompare(b.folio, undefined, { numeric: true });
        });
    });
    const filteredSnippets = computed(() => {
        const f = folioFilter.value.trim().toLowerCase();
        if (!f) return sortedSnippets.value;
        return sortedSnippets.value.filter(s => String(s.folio).toLowerCase().includes(f));
    });
    /** Distinct folios present for the selected pattern (for the quick filter). */
    const folioOptions = computed(() => {
        const set = new Set(sortedSnippets.value.map(s => s.folio));
        return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    });

    // --- Windowed rendering: never mount more than a page of cards at once ---
    const visibleCount = ref(PAGE);
    const visibleSnippets = computed(() => filteredSnippets.value.slice(0, visibleCount.value));
    const hasMore = computed(() => visibleCount.value < filteredSnippets.value.length);
    // Start from the first page again whenever the list changes underneath us.
    watch([selectedPattern, folioFilter], () => { visibleCount.value = PAGE; });

    // Infinite scroll: a sentinel below the last card loads the next page when it scrolls into view.
    const sentinelRef = ref(null);
    let observer = null;
    function teardownSentinel() {
        if (observer) { observer.disconnect(); observer = null; }
    }
    function setupSentinel() {
        teardownSentinel();
        if (!sentinelRef.value) return;
        observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting) && hasMore.value) {
                visibleCount.value = Math.min(visibleCount.value + PAGE, filteredSnippets.value.length);
            }
        }, { rootMargin: '400px 0px' });
        observer.observe(sentinelRef.value);
    }
    watch(sentinelRef, setupSentinel);
    onUnmounted(teardownSentinel);

    // --- Selection ---
    function toggleSelect(snippet) {
        const next = new Set(selectedSnippets.value);
        next.has(snippet.id) ? next.delete(snippet.id) : next.add(snippet.id);
        selectedSnippets.value = next;
    }
    function selectAllVisible() {
        const next = new Set(selectedSnippets.value);
        for (const s of filteredSnippets.value) next.add(s.id);
        selectedSnippets.value = next;
    }
    const clearSelection = () => { selectedSnippets.value = new Set(); };

    const snippetById = computed(() => new Map(ommrStore.activeSnippets.map(s => [s.id, s])));
    /** Which patterns currently have a selected example. */
    const coveredPatterns = computed(() => {
        const set = new Set();
        for (const id of selectedSnippets.value) {
            const s = snippetById.value.get(id);
            if (s) set.add(s.pattern);
        }
        return set;
    });
    /** The selected snippets grouped by pattern, in sidebar order. */
    const selectedByPattern = computed(() => {
        const groups = new Map();
        for (const s of ommrStore.activeSnippets) {
            if (!selectedSnippets.value.has(s.id)) continue;
            if (!groups.has(s.pattern)) groups.set(s.pattern, []);
            groups.get(s.pattern).push(s);
        }
        return [...groups.entries()]
            .sort((a, b) => compareChantPatterns(a[0], b[0], sortOrder.value, ommrStore.patternFrequencies))
            .map(([pattern, snippets]) => ({ pattern, snippets }));
    });

    // --- Automatic suggestions ---
    const lastSuggestion = ref(null); // { lines, covered, total, lineCount, totalLines }
    const showLinePreview = ref(false);
    const lineCoverage = ref(null); // { lines: [{ line, newPatterns }], covered, total, totalLines }

    /** Select one example per pattern using as few distinct lines as possible. A starting point: tweak freely. */
    function suggestSet() {
        if (!ommrStore.activeSnippets.length) return;
        const result = suggestOptimalSelection(ommrStore.activeSnippets, isIncluded);
        if (!result) { flash('No patterns selected to optimize.'); return; }
        selectedSnippets.value = new Set(result.chosenIds);
        lastSuggestion.value = result.summary;
        const s = result.summary;
        flash(`✨ Selected ${s.covered}/${s.total} patterns from ${s.lineCount} lines (of ${s.totalLines})`);
    }

    /** Pick the fewest staff LINES that show all patterns, and preview them as labelled strips. */
    function suggestLines() {
        const lines = ommrStore.activeLines;
        if (!lines.length) { flash('No staff lines found — re-import the OMMR folder.'); return; }
        const result = suggestLineCoverage(lines, isIncluded);
        if (!result) { flash('No patterns selected to optimize.'); return; }
        lineCoverage.value = result;
        showLinePreview.value = true;
        flash(`🎼 ${result.lines.length} lines cover ${result.covered}/${result.total} patterns`);
    }

    return {
        selectedPattern, searchFilter, sortOrder, folioFilter, selectedSnippets, cardSize,
        isIncluded, toggleInclude, includeAll, includeNone, includedCount,
        allPatterns, filteredSnippets, folioOptions, visibleSnippets, hasMore, sentinelRef,
        toggleSelect, selectAllVisible, clearSelection, coveredPatterns, selectedByPattern,
        lastSuggestion, showLinePreview, lineCoverage, suggestSet, suggestLines
    };
}
