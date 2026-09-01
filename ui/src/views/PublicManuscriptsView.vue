<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useAnnotationsStore } from '../stores/annotations';
import { useSettingsStore } from '../stores/settings';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { parseCentury, centuryLabel } from '../utils/sourceMeta';

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
const centuryFields = computed(() => metaFields.value.filter(f => f.type === 'century'));
const choiceFields = computed(() => metaFields.value.filter(f => f.type !== 'century'));

// --- Century range filters ---
// { [fieldKey]: [min, max] }; absent means "no range set".
const centuryRanges = ref({});

/** The span of centuries actually recorded for a field, used as slider bounds. */
function centuryBounds(key) {
    const nums = publishedList.value
        .map(t => parseCentury(settings.getSourceMetaValue(t.source, key)))
        .filter(n => n !== null);
    if (!nums.length) return null;
    return { min: Math.min(...nums), max: Math.max(...nums) };
}

function rangeFor(key) {
    const b = centuryBounds(key);
    if (!b) return null;
    return centuryRanges.value[key] || [b.min, b.max];
}

function setRange(key, which, value) {
    const b = centuryBounds(key);
    if (!b) return;
    const cur = rangeFor(key);
    let [lo, hi] = cur;
    const v = Number(value);
    if (which === 'min') lo = Math.min(v, hi);
    else hi = Math.max(v, lo);
    centuryRanges.value = { ...centuryRanges.value, [key]: [lo, hi] };
}

function isRangeNarrowed(key) {
    const b = centuryBounds(key);
    const r = centuryRanges.value[key];
    return !!(b && r && (r[0] > b.min || r[1] < b.max));
}

/** How many published sources have no readable century for this field. */
function undatedCount(key) {
    return publishedList.value.filter(t => {
        const raw = settings.getSourceMetaValue(t.source, key);
        return raw && parseCentury(raw) === null;
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
    centuryRanges.value = {};
    includeUndated.value = true;
    searchQuery.value = '';
}

const hasActiveFilters = computed(() =>
    !!searchQuery.value.trim()
    || Object.values(metaFilters.value).some(v => v)
    || centuryFields.value.some(f => isRangeNarrowed(f.key))
    || !includeUndated.value
);

/** Values actually present among the published sources, so filters never dead-end. */
function valuesForField(key) {
    const set = new Set();
    for (const t of publishedList.value) {
        const v = settings.getSourceMetaValue(t.source, key);
        if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

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
        // Century ranges, compared on the parsed number rather than the text.
        for (const f of centuryFields.value) {
            if (!isRangeNarrowed(f.key)) continue;
            const [lo, hi] = centuryRanges.value[f.key];
            const n = parseCentury(settings.getSourceMetaValue(t.source, f.key));
            if (n === null) {
                if (!includeUndated.value) return false;
                continue;
            }
            if (n < lo || n > hi) return false;
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
        <div class="filter-bar">
            <input v-model="searchQuery" class="ms-search"
                   placeholder="Search manuscripts, titles and attributes…" />
            <!-- Text and location attributes: pick one of the values in use -->
            <div v-for="f in choiceFields" :key="f.key" class="filter-group" :title="f.description">
                <label>{{ f.label }}</label>
                <select :value="metaFilters[f.key] || ''" @change="setMetaFilter(f.key, $event.target.value)">
                    <option value="">Any</option>
                    <option v-for="v in valuesForField(f.key)" :key="v" :value="v">{{ v }}</option>
                </select>
            </div>

            <!-- Century attributes: a range over the centuries actually present -->
            <div v-for="f in centuryFields" :key="f.key" class="filter-group range-group" :title="f.description">
                <template v-if="rangeFor(f.key)">
                    <label>
                        {{ f.label }}
                        <span class="range-value">
                            {{ centuryLabel(rangeFor(f.key)[0]) }} – {{ centuryLabel(rangeFor(f.key)[1]) }}
                        </span>
                    </label>
                    <div class="range-sliders">
                        <input type="range" class="range-input"
                               :min="centuryBounds(f.key).min" :max="centuryBounds(f.key).max" step="1"
                               :value="rangeFor(f.key)[0]"
                               :aria-label="f.label + ' from'"
                               @input="setRange(f.key, 'min', $event.target.value)" />
                        <input type="range" class="range-input"
                               :min="centuryBounds(f.key).min" :max="centuryBounds(f.key).max" step="1"
                               :value="rangeFor(f.key)[1]"
                               :aria-label="f.label + ' to'"
                               @input="setRange(f.key, 'max', $event.target.value)" />
                    </div>
                    <label v-if="undatedCount(f.key)" class="undated-toggle"
                           :title="'Sources whose ' + f.label + ' could not be read as a century'">
                        <input type="checkbox" v-model="includeUndated" />
                        keep {{ undatedCount(f.key) }} undated
                    </label>
                </template>
                <template v-else>
                    <label>{{ f.label }}</label>
                    <span class="range-empty">no dated sources</span>
                </template>
            </div>
            <button v-if="hasActiveFilters" class="btn-clear" @click="clearFilters">Clear</button>
            <span class="result-count">{{ sortedTables.length }} shown</span>
        </div>

        <div v-if="sortedTables.length === 0" class="empty-state">
            <div class="icon">📚</div>
            <template v-if="hasActiveFilters">
                <h3>No Matching Manuscripts</h3>
                <p>No manuscript matches your search or attribute filters.</p>
                <button class="btn-view-sm" @click="clearFilters">Clear filters</button>
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
.filter-bar { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; margin-bottom: 18px; padding: 14px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; }
.ms-search { flex: 1; min-width: 220px; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 14px; }
.filter-group { display: flex; flex-direction: column; gap: 4px; }
.filter-group label { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; font-weight: 700; color: var(--color-text-muted); }
.filter-group select { padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; background: white; }
.btn-clear { padding: 7px 12px; border: 1px solid var(--color-border-hover); background: white; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
.btn-clear:hover { background: var(--color-bg); }
.result-count { font-size: 12px; color: var(--color-text-muted); margin-left: auto; align-self: center; }

.range-group { min-width: 210px; }
.range-value { font-weight: 800; color: var(--color-primary-hover); margin-left: 6px; text-transform: none; letter-spacing: 0; }
.range-sliders { display: flex; flex-direction: column; gap: 2px; }
.range-input { width: 100%; accent-color: var(--color-primary); margin: 0; }
.range-empty { font-size: 12px; color: var(--color-text-light); font-style: italic; padding: 6px 0; }
.undated-toggle { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 600; color: var(--color-text-muted); text-transform: none; letter-spacing: 0; cursor: pointer; margin-top: 2px; }
.undated-toggle input { width: auto; }

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
