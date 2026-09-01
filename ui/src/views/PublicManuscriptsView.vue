<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useAnnotationsStore } from '../stores/annotations';
import { useSettingsStore } from '../stores/settings';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { parseDateRange, rangesOverlap, yearLabel } from '../utils/sourceMeta';
import DateRangeTimeline from '../components/DateRangeTimeline.vue';

const tableStore = usePersonalTablesStore();
const annotStore = useAnnotationsStore();
const settings = useSettingsStore();
const directStore = useDirectSnippetsStore();
const router = useRouter();

const sortBy = ref('source');
const sortOrder = ref(1); // 1 for asc, -1 for desc

// --- Metadata search & filtering ---
const searchQuery = ref('');
// { [fieldKey]: "selected value" } — empty string means "any".
const metaFilters = ref({});

const metaFields = computed(() => settings.sourceMetaFields || []);
const dateFields = computed(() => metaFields.value.filter(f => f.type === 'century'));
const choiceFields = computed(() => metaFields.value.filter(f => f.type !== 'century'));

// --- Date range filters ---
// The timeline always spans at least this, so the axis reads as a period rather
// than a window tightly cropped to whatever happens to be entered.
const DEFAULT_MIN = 400;
const DEFAULT_MAX = 1600;

// { [fieldKey]: [fromYear, toYear] }; absent means "the full extent".
const dateRanges = ref({});

/** Every parsed dating recorded for a field, with its source, for the marks. */
function datedPoints(key) {
    const out = [];
    for (const t of publishedList.value) {
        const raw = settings.getSourceMetaValue(t.source, key);
        const r = parseDateRange(raw);
        if (!r) continue;
        // Open-ended datings are clamped to the axis so they stay drawable.
        out.push({
            start: Number.isFinite(r.start) ? r.start : DEFAULT_MIN,
            end: Number.isFinite(r.end) ? r.end : DEFAULT_MAX,
            label: `${t.source} — ${raw}`
        });
    }
    return out;
}

/** Axis extent: the default period, widened by any data lying outside it. */
function dateBounds(key) {
    const pts = datedPoints(key);
    let min = DEFAULT_MIN, max = DEFAULT_MAX;
    for (const p of pts) {
        if (p.start < min) min = p.start;
        if (p.end > max) max = p.end;
    }
    // Round outwards to a tidy century so the axis labels stay readable.
    min = Math.floor(min / 100) * 100;
    max = Math.ceil(max / 100) * 100;
    return { min, max };
}

function rangeFor(key) {
    const b = dateBounds(key);
    return dateRanges.value[key] || [b.min, b.max];
}

function setRangeEnd(key, which, year) {
    const cur = rangeFor(key);
    const next = which === 'from' ? [year, cur[1]] : [cur[0], year];
    dateRanges.value = { ...dateRanges.value, [key]: next };
}

function isRangeNarrowed(key) {
    const b = dateBounds(key);
    const r = dateRanges.value[key];
    return !!(r && (r[0] > b.min || r[1] < b.max));
}

function resetRange(key) {
    const next = { ...dateRanges.value };
    delete next[key];
    dateRanges.value = next;
}

/** How many published sources have a dating that could not be read. */
function undatedCount(key) {
    return publishedList.value.filter(t => {
        const raw = settings.getSourceMetaValue(t.source, key);
        return raw && parseDateRange(raw) === null;
    }).length;
}

// Undated sources would otherwise vanish the moment a range is touched, which
// silently hides material. They are kept unless the reader opts out.
const includeUndated = ref(true);

function setMetaFilter(key, value) {
    metaFilters.value = { ...metaFilters.value, [key]: value };
}

function clearFilters() {
    metaFilters.value = {};
    dateRanges.value = {};
    includeUndated.value = true;
    searchQuery.value = '';
}

const hasActiveFilters = computed(() =>
    !!searchQuery.value.trim()
    || Object.values(metaFilters.value).some(v => v)
    || dateFields.value.some(f => isRangeNarrowed(f.key))
    || !includeUndated.value
);

/**
 * Values actually present among the published sources, with how many carry each,
 * so a reader can see the shape of the collection before committing to a filter
 * and never picks an option that returns nothing.
 */
function valuesForField(key) {
    const counts = new Map();
    for (const t of publishedList.value) {
        const v = settings.getSourceMetaValue(t.source, key);
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    return Array.from(counts, ([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
}

/** Every filter currently applied, as removable chips. */
const activeChips = computed(() => {
    const out = [];
    if (searchQuery.value.trim()) {
        out.push({ id: 'q', label: 'Search', value: `“${searchQuery.value.trim()}”`, clear: () => { searchQuery.value = ''; } });
    }
    for (const f of choiceFields.value) {
        const v = metaFilters.value[f.key];
        if (v) out.push({ id: 'm:' + f.key, label: f.label, value: v, clear: () => setMetaFilter(f.key, '') });
    }
    for (const f of dateFields.value) {
        if (!isRangeNarrowed(f.key)) continue;
        const [lo, hi] = dateRanges.value[f.key];
        out.push({ id: 'd:' + f.key, label: f.label, value: `${lo}–${hi}`, clear: () => resetRange(f.key) });
    }
    if (!includeUndated.value) {
        out.push({ id: 'undated', label: 'Undated', value: 'hidden', clear: () => { includeUndated.value = true; } });
    }
    return out;
});

/** Published IIIF-backed tables plus published direct-snippet collections. */
const publishedList = computed(() => {
    const out = tableStore.tables.filter(t => {
        if (!t.isPublished) return false;
        const prefix = t.source + '_';
        return Object.keys(annotStore.regions).some(k =>
            k.startsWith(prefix) && annotStore.regions[k].length > 0
        );
    }).map(t => ({ ...t, isDirect: false }));

    for (const c of directStore.publishedCollections) {
        out.push({
            id: c.id,
            source: c.source,
            name: c.name,
            rows: c.patterns || [],
            isDirect: true
        });
    }
    return out;
});

const sortedTables = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    const list = [...publishedList.value.filter(t => {
        // Attribute filters: every chosen value must match.
        for (const [key, want] of Object.entries(metaFilters.value)) {
            if (!want) continue;
            if (settings.getSourceMetaValue(t.source, key) !== want) return false;
        }
        // Date ranges match by OVERLAP: a source dated "11th-12th c." should
        // surface when looking at 1150, even though it is not wholly inside.
        for (const f of dateFields.value) {
            if (!isRangeNarrowed(f.key)) continue;
            const [lo, hi] = dateRanges.value[f.key];
            const r = parseDateRange(settings.getSourceMetaValue(t.source, f.key));
            if (!r) {
                if (!includeUndated.value) return false;
                continue;
            }
            if (!rangesOverlap(r, { start: lo, end: hi })) return false;
        }
        if (!q) return true;
        // Free-text search covers the siglum, title, and all metadata values.
        const meta = settings.getSourceMeta(t.source);
        const hay = [t.source, t.name, ...Object.values(meta)].join(' ').toLowerCase();
        return hay.includes(q);
    })];
    list.sort((a, b) => {
        let valA, valB;
        if (sortBy.value === 'source') {
            valA = a.source;
            valB = b.source;
        } else if (sortBy.value === 'name') {
            valA = a.name;
            valB = b.name;
        } else if (sortBy.value === 'patterns') {
            valA = a.rows.length;
            valB = b.rows.length;
        }
        
        if (typeof valA === 'string') {
            return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * sortOrder.value;
        }
        return (valA - valB) * sortOrder.value;
    });
    return list;
});

function toggleSort(field) {
    if (sortBy.value === field) {
        sortOrder.value *= -1;
    } else {
        sortBy.value = field;
        sortOrder.value = 1;
    }
}

function goToOverview(source, isDirect = false) {
    // Custom manuscripts have no IIIF folios or line regions, so they get their
    // own public page rather than the IIIF notation view.
    router.push(isDirect
        ? `/public/custom/${encodeURIComponent(source)}`
        : `/public/${encodeURIComponent(source)}`);
}
</script>

<template>
<div class="public-container">
    <div class="header-section">
        <div class="top-nav-bar">
            <div class="nav-tab active">Manuscript Directory</div>
            <button class="nav-tab" @click="router.push('/public/table')">Neumentabelle (Comparison) &rarr;</button>
        </div>

        <h1>Notationsdokumentation</h1>
        <p class="subtitle">Index of manuscripts with notation transcriptions and cross-referenced pattern IDs.</p>
    </div>

    <div class="content-section">
        <!-- Search & metadata filters -->
        <section class="filters" aria-label="Search and filter manuscripts">
            <!-- Row 1: search, always the primary action -->
            <div class="search-row">
                <div class="search-field">
                    <span class="search-icon" aria-hidden="true">⌕</span>
                    <input v-model="searchQuery" class="ms-search" type="search"
                           placeholder="Search sigla, titles and attributes…"
                           aria-label="Search manuscripts"
                           @keydown.esc="searchQuery = ''" />
                    <button v-if="searchQuery" class="search-clear" aria-label="Clear search"
                            @click="searchQuery = ''">×</button>
                </div>
                <div class="result-summary">
                    <strong>{{ sortedTables.length }}</strong>
                    <span>of {{ publishedList.length }} manuscripts</span>
                </div>
            </div>

            <!-- Row 2: attribute filters, only when the project defines any -->
            <div v-if="metaFields.length" class="filter-fields">
                <div v-for="f in choiceFields" :key="f.key" class="field" :title="f.description">
                    <label :for="'filter-' + f.key">{{ f.label }}</label>
                    <select :id="'filter-' + f.key"
                            :class="{ set: metaFilters[f.key] }"
                            :value="metaFilters[f.key] || ''"
                            @change="setMetaFilter(f.key, $event.target.value)">
                        <option value="">All</option>
                        <option v-for="v in valuesForField(f.key)" :key="v.value" :value="v.value">
                            {{ v.value }} ({{ v.count }})
                        </option>
                    </select>
                </div>

                <div v-for="f in dateFields" :key="f.key" class="field field-timeline" :title="f.description">
                    <div class="field-head">
                        <label>{{ f.label }}</label>
                        <label v-if="undatedCount(f.key)" class="undated-toggle"
                               :title="'Sources whose ' + f.label + ' could not be read as a date'">
                            <input type="checkbox" v-model="includeUndated" />
                            include {{ undatedCount(f.key) }} undated
                        </label>
                    </div>
                    <DateRangeTimeline
                        :from="rangeFor(f.key)[0]"
                        :to="rangeFor(f.key)[1]"
                        :min="dateBounds(f.key).min"
                        :max="dateBounds(f.key).max"
                        :points="datedPoints(f.key)"
                        @update:from="setRangeEnd(f.key, 'from', $event)"
                        @update:to="setRangeEnd(f.key, 'to', $event)"
                    />
                </div>
            </div>

            <!-- Row 3: what is currently applied, each removable -->
            <div v-if="activeChips.length" class="active-row">
                <span class="active-label">Filtering by</span>
                <button v-for="c in activeChips" :key="c.id" class="chip" @click="c.clear()"
                        :title="'Remove this filter'">
                    <span class="chip-key">{{ c.label }}</span>
                    <span class="chip-val">{{ c.value }}</span>
                    <span class="chip-x" aria-hidden="true">×</span>
                </button>
                <button class="btn-clear" @click="clearFilters">Clear all</button>
            </div>
        </section>

        <div v-if="sortedTables.length === 0" class="empty-state">
            <div class="icon">📚</div>
            <template v-if="hasActiveFilters">
                <h3>No manuscripts match</h3>
                <p>
                    Nothing satisfies all
                    {{ activeChips.length }} active filter{{ activeChips.length === 1 ? '' : 's' }}.
                    Try removing one:
                </p>
                <div class="empty-chips">
                    <button v-for="c in activeChips" :key="c.id" class="chip" @click="c.clear()">
                        <span class="chip-key">{{ c.label }}</span>
                        <span class="chip-val">{{ c.value }}</span>
                        <span class="chip-x" aria-hidden="true">×</span>
                    </button>
                </div>
                <button class="btn-view" @click="clearFilters">Clear all filters</button>
            </template>
            <template v-else>
                <h3>No Published Manuscripts</h3>
                <p>Manuscripts must be marked as 'Published' in the editor before they appear here.</p>
            </template>
        </div>

        <div v-else class="table-container">
            <table class="ms-table">
                <thead>
                    <tr>
                        <th @click="toggleSort('source')" :class="{ active: sortBy === 'source' }">
                            Source 
                            <span class="sort-icon" v-if="sortBy === 'source'">{{ sortOrder === 1 ? '↑' : '↓' }}</span>
                        </th>
                        <th @click="toggleSort('name')" :class="{ active: sortBy === 'name' }">
                            Manuscript Title
                            <span class="sort-icon" v-if="sortBy === 'name'">{{ sortOrder === 1 ? '↑' : '↓' }}</span>
                        </th>
                        <th v-for="f in metaFields" :key="f.key" :title="f.description" class="meta-col">
                            {{ f.label }}
                        </th>
                        <th @click="toggleSort('patterns')" :class="{ active: sortBy === 'patterns' }" class="text-right">
                            Patterns
                            <span class="sort-icon" v-if="sortBy === 'patterns'">{{ sortOrder === 1 ? '↑' : '↓' }}</span>
                        </th>
                        <th class="text-right w-100"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="table in sortedTables" :key="table.id" @click="goToOverview(table.source, table.isDirect)">
                        <td class="font-bold">
                            {{ table.source }}
                            <span v-if="table.notes" class="note-icon" title="Has Notes">📝</span>
                            <span v-if="table.isDirect" class="direct-badge" title="Documented from directly added snippets (no IIIF)">own snippets</span>
                        </td>
                        <td class="text-secondary">{{ table.name }}</td>
                        <td v-for="f in metaFields" :key="f.key" class="meta-col">
                            <span v-if="settings.getSourceMetaValue(table.source, f.key)" class="meta-chip">
                                {{ settings.getSourceMetaValue(table.source, f.key) }}
                            </span>
                            <span v-else class="meta-empty">—</span>
                        </td>
                        <td class="text-right">
                            <span class="badge">{{ table.rows.length }}</span>
                        </td>
                        <td class="text-right">
                            <button class="btn-view-sm">View &rarr;</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
</template>

<style scoped>
/* --- Search & filter panel --------------------------------------------- */
.filters {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 16px 18px;
    margin-bottom: 20px;
    display: flex; flex-direction: column; gap: 14px;
}

/* Row 1 — search leads, result count answers it */
.search-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.search-field { position: relative; flex: 1; min-width: 240px; display: flex; align-items: center; }
.search-icon {
    position: absolute; left: 12px; font-size: 17px;
    color: var(--color-text-light); pointer-events: none; line-height: 1;
}
.ms-search {
    width: 100%; padding: 10px 34px 10px 34px;
    border: 1px solid var(--color-border); border-radius: 8px;
    font-size: 14px; font-family: inherit; background: white; color: var(--color-text);
    transition: border-color .15s, box-shadow .15s;
}
.ms-search::placeholder { color: var(--color-text-light); }
.ms-search:focus {
    outline: none; border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
}
/* The native search clear button would sit beside ours */
.ms-search::-webkit-search-cancel-button { display: none; }
.search-clear {
    position: absolute; right: 8px;
    width: 22px; height: 22px; border: none; border-radius: 50%;
    background: var(--color-surface-muted); color: var(--color-text-muted);
    font-size: 15px; line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
}
.search-clear:hover { background: var(--color-border-hover); color: var(--color-text); }

.result-summary { display: flex; align-items: baseline; gap: 5px; white-space: nowrap; font-size: 13px; color: var(--color-text-muted); }
.result-summary strong { font-size: 19px; color: var(--color-text); font-variant-numeric: tabular-nums; }

/* Row 2 — attribute filters */
.filter-fields {
    display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start;
    padding-top: 14px; border-top: 1px solid var(--color-border);
}
.field { display: flex; flex-direction: column; gap: 5px; min-width: 150px; }
.field > label, .field-head > label {
    font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
    font-weight: 700; color: var(--color-text-muted);
}
.field select {
    padding: 8px 10px; border: 1px solid var(--color-border); border-radius: 7px;
    font-size: 13px; font-family: inherit; background: white; color: var(--color-text);
    cursor: pointer; transition: border-color .15s, box-shadow .15s;
}
.field select:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); }
/* A set filter should be visible at a glance among several dropdowns */
.field select.set { border-color: var(--color-primary); background: var(--color-primary-light); font-weight: 600; color: var(--color-primary-hover); }

.field-timeline { flex: 1 1 480px; min-width: 320px; }
.field-head { display: flex; align-items: baseline; gap: 12px; }
.undated-toggle {
    display: flex; align-items: center; gap: 5px; margin-left: auto;
    font-size: 10px; font-weight: 600; color: var(--color-text-muted);
    cursor: pointer; white-space: nowrap;
}
.undated-toggle input { width: auto; margin: 0; }

/* Row 3 — what is applied right now */
.active-row {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding-top: 12px; border-top: 1px solid var(--color-border);
}
.active-label { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; font-weight: 700; color: var(--color-text-muted); }
.chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 6px 4px 10px; border-radius: 999px;
    border: 1px solid var(--color-primary); background: var(--color-primary-light);
    font-size: 12px; font-family: inherit; cursor: pointer; color: var(--color-primary-hover);
    transition: background .15s;
}
.chip:hover { background: var(--color-primary); color: #fff; }
.chip:hover .chip-key { color: rgba(255,255,255,.8); }
.chip-key { font-weight: 700; opacity: .8; }
.chip-val { font-weight: 600; }
.chip-x { font-size: 14px; line-height: 1; opacity: .7; }
.btn-clear {
    margin-left: auto; padding: 5px 12px;
    border: 1px solid var(--color-border-hover); background: white;
    border-radius: 7px; cursor: pointer; font-size: 12px; font-weight: 600;
    color: var(--color-text-muted); font-family: inherit;
}
.btn-clear:hover { background: var(--color-bg); color: var(--color-text); }

@media (max-width: 640px) {
    .filters { padding: 14px; }
    .result-summary { margin-left: auto; }
    .field { min-width: 0; flex: 1 1 100%; }
    .btn-clear { margin-left: 0; }
}

.empty-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 14px 0 18px; }
.empty-state h3 { margin-bottom: 6px; }

.meta-col { white-space: nowrap; }
.meta-chip { display: inline-block; font-size: 12px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 12px; padding: 2px 10px; }
.meta-empty { color: var(--color-text-light); font-size: 12px; }
.direct-badge { font-size: 9px; text-transform: uppercase; font-weight: 800; letter-spacing: .03em; background: var(--color-surface-muted); color: var(--color-text-muted); padding: 2px 6px; border-radius: 3px; margin-left: 6px; }

.public-container {
    max-width: 1000px;
    margin: 0 auto;
    padding: 40px 20px;
}

.header-section {
    text-align: center;
    margin-bottom: 50px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.top-nav-bar {
    display: inline-flex;
    gap: 8px;
    background: var(--color-surface-muted);
    padding: 4px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    margin-bottom: 12px;
}

.nav-tab {
    background: transparent;
    border: none;
    padding: 6px 16px;
    border-radius: 6px;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}

.nav-tab:hover {
    color: var(--color-text);
}

.nav-tab.active {
    background: white;
    color: var(--color-primary-hover);
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

h1 {
    font-size: 2.5rem;
    color: var(--color-text);
    margin-bottom: 10px;
    font-weight: 800;
}

.subtitle {
    font-size: 1.1rem;
    color: var(--color-text-muted);
}

.empty-state {
    text-align: center;
    padding: 80px 20px;
    background: white;
    border-radius: 12px;
    border: 1px dashed var(--color-border-hover);
}

.empty-state .icon {
    font-size: 3rem;
    margin-bottom: 20px;
    opacity: 0.5;
}

.empty-state h3 {
    color: var(--color-text);
    margin-bottom: 10px;
}

.empty-state p {
    color: var(--color-text-light);
}

.manuscript-grid {
    display: none;
}

.table-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    border: 1px solid var(--color-border);
    overflow: hidden;
}

.ms-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
}

.ms-table th {
    background: var(--color-bg);
    padding: 16px 24px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.025em;
    border-bottom: 1px solid var(--color-border);
    cursor: pointer;
    user-select: none;
}

.ms-table th:hover {
    background: var(--color-surface-muted);
    color: var(--color-text);
}

.ms-table th.active {
    color: var(--color-primary-hover);
}

.sort-icon {
    display: inline-block;
    margin-left: 4px;
}

.ms-table td {
    padding: 16px 24px;
    border-bottom: 1px solid var(--color-surface-muted);
    font-size: 0.95rem;
    color: var(--color-text);
    transition: background 0.2s;
}

.ms-table tr {
    cursor: pointer;
}

.ms-table tr:hover td {
    background: var(--color-bg);
}

.ms-table tr:last-child td {
    border-bottom: none;
}

.font-bold {
    font-weight: 700;
    color: var(--color-text);
}

.text-secondary {
    color: var(--color-text-muted);
}

.note-icon {
    font-size: 0.9em;
    margin-left: 8px;
    opacity: 0.7;
}

.badge {
    background: var(--color-primary-light);
    color: var(--color-primary-hover);
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
}

.btn-view {
    background: var(--color-primary); color: #fff; border: none;
    padding: 9px 18px; border-radius: 7px; cursor: pointer;
    font-weight: 600; font-size: 13px; font-family: inherit;
}
.btn-view:hover { background: var(--color-primary-hover); }

.btn-view-sm {
    background: transparent;
    color: var(--color-primary);
    border: none;
    padding: 0;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
}

.ms-table tr:hover .btn-view-sm {
    color: var(--color-primary-hover);
}

.text-right { text-align: right; }
.w-100 { width: 100px; }
</style>
