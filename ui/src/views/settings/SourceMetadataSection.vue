<script setup>
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { usePersonalTablesStore } from '../../stores/personalTables';
import { useDirectSnippetsStore } from '../../stores/directSnippets';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { META_TYPES, parseCentury } from '../../utils/sourceMeta';

const store = useSettingsStore();
const tablesStore = usePersonalTablesStore();
const directStore = useDirectSnippetsStore();
const { sourceFolios } = useTranscriptionData();

const newMetaLabel = ref('');
const newMetaDesc = ref('');
const newMetaType = ref('text');
const metaError = ref('');
const metaSourceSearch = ref('');

function addMetaField() {
    metaError.value = '';
    if (!newMetaLabel.value.trim()) return;
    const f = store.addSourceMetaField(newMetaLabel.value, newMetaDesc.value, newMetaType.value);
    if (!f) {
        metaError.value = 'That attribute already exists (or the name is unusable).';
        return;
    }
    newMetaLabel.value = '';
    newMetaDesc.value = '';
    newMetaType.value = 'text';
}

function metaTypeLabel(t) {
    return (META_TYPES.find(x => x.key === (t || 'text')) || META_TYPES[0]).label;
}
/** How many recorded values of a century field could not be parsed. */
function unparsedCount(key) {
    return store.sourceMetaValuesFor(key).filter(v => parseCentury(v) === null).length;
}

// Every source we could attach metadata to: transcription sources, personal
// tables, and direct snippet collections.
const metaSources = computed(() => {
    const set = new Set();
    for (const s of Object.keys(sourceFolios.value || {})) set.add(s);
    for (const t of tablesStore.tables || []) if (t.source) set.add(t.source);
    for (const c of directStore.collections || []) if (c.source) set.add(c.source);
    // Keep any source that already has values, even if it is gone from the data.
    for (const s of Object.keys(store.sourceMeta || {})) set.add(s);
    let list = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const q = metaSourceSearch.value.trim().toLowerCase();
    if (q) list = list.filter(s => s.toLowerCase().includes(q));
    return list;
});

/** Sources that already carry at least one value — shown first for quick review. */
const metaSourcesWithValues = computed(() =>
    metaSources.value.filter(s => Object.keys(store.getSourceMeta(s)).length > 0)
);

const showAllMetaSources = ref(false);
const visibleMetaSources = computed(() => {
    if (showAllMetaSources.value || metaSourceSearch.value.trim()) return metaSources.value;
    // Default to the ones already filled in, so the table isn't 100 empty rows.
    return metaSourcesWithValues.value;
});
</script>

<template>
    <div class="card section settings-card">
            <h2>Source Metadata</h2>
            <p class="desc">Define free-text attributes for manuscripts (e.g. <em>Century</em>, <em>Region</em>,
                <em>Notation type</em>), then fill in a value per source. Readers can filter and search by these
                attributes in the public manuscript directory.</p>

            <div class="add-row">
                <input v-model="newMetaLabel" placeholder="Attribute name (e.g. Century)" @keyup.enter="addMetaField" />
                <input v-model="newMetaDesc" placeholder="Description (optional)" @keyup.enter="addMetaField" />
                <select v-model="newMetaType" class="meta-type-select" title="How this attribute is filtered publicly">
                    <option v-for="t in META_TYPES" :key="t.key" :value="t.key">{{ t.label }}</option>
                </select>
                <button @click="addMetaField" :disabled="!newMetaLabel.trim()">Add Attribute</button>
            </div>
            <div v-if="metaError" class="sign-error">{{ metaError }}</div>
            <p class="desc type-hint">{{ (META_TYPES.find(t => t.key === newMetaType) || {}).hint }}</p>

            <div class="ids-list">
                <table v-if="store.sourceMetaFields.length > 0">
                    <thead>
                        <tr><th>Attribute</th><th>Key</th><th>Type</th><th>Description</th><th>Values in use</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="f in store.sourceMetaFields" :key="f.key">
                            <td><strong>{{ f.label }}</strong></td>
                            <td class="code-font">{{ f.key }}</td>
                            <td>
                                <span class="type-chip" :class="'t-' + (f.type || 'text')">{{ metaTypeLabel(f.type) }}</span>
                            </td>
                            <td class="text-sm-light">{{ f.description }}</td>
                            <td class="text-sm-light">
                                {{ store.sourceMetaValuesFor(f.key).length }}
                                <span v-if="(f.type === 'century') && unparsedCount(f.key)"
                                      class="warn-chip"
                                      :title="'These values could not be read as a century, so they are excluded from the range filter (but still shown).'">
                                    {{ unparsedCount(f.key) }} unparsed
                                </span>
                            </td>
                            <td><button @click="store.removeSourceMetaField(f.key)" class="btn-sm btn-danger">Remove</button></td>
                        </tr>
                    </tbody>
                </table>
                <div v-else class="empty">No attributes defined yet</div>
            </div>

            <div v-if="store.sourceMetaFields.length > 0" class="meta-values">
                <div class="flex-between-mb10">
                    <h3 class="mt-0">Values per Manuscript</h3>
                    <div class="meta-tools">
                        <input v-model="metaSourceSearch" placeholder="Search manuscripts…" class="meta-search" />
                        <label class="meta-showall">
                            <input type="checkbox" v-model="showAllMetaSources" />
                            Show all ({{ metaSources.length }})
                        </label>
                    </div>
                </div>
                <p class="desc" v-if="!showAllMetaSources && !metaSourceSearch.trim()">
                    Showing the {{ metaSourcesWithValues.length }} manuscript(s) that already have values.
                    Tick “Show all” or search to add more.
                </p>

                <div class="meta-table-scroll">
                    <table v-if="visibleMetaSources.length > 0">
                        <thead>
                            <tr>
                                <th class="meta-src-col">Manuscript</th>
                                <th v-for="f in store.sourceMetaFields" :key="f.key" :title="f.description">{{ f.label }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="src in visibleMetaSources" :key="src">
                                <td class="meta-src-col"><strong>{{ src }}</strong></td>
                                <td v-for="f in store.sourceMetaFields" :key="f.key">
                                    <input class="meta-input"
                                           :value="store.getSourceMetaValue(src, f.key)"
                                           :placeholder="f.label"
                                           :list="`metavals-${f.key}`"
                                           @input="store.setSourceMetaValue(src, f.key, $event.target.value)" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-else class="empty">No manuscripts match.</div>
                </div>

                <!-- Suggest values already used elsewhere, to keep them consistent -->
                <datalist v-for="f in store.sourceMetaFields" :key="f.key" :id="`metavals-${f.key}`">
                    <option v-for="v in store.sourceMetaValuesFor(f.key)" :key="v" :value="v" />
                </datalist>
            </div>
        </div>
</template>

<style scoped>
.meta-values { margin-top: 22px; border-top: 1px solid var(--color-border); padding-top: 16px; }
.meta-tools { display: flex; align-items: center; gap: 12px; }
.meta-search { padding: 6px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; }
.meta-showall { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--color-text-muted); cursor: pointer; white-space: nowrap; }
.meta-showall input { width: auto; }
.meta-table-scroll { overflow-x: auto; max-height: 420px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 6px; }
.meta-table-scroll table { margin: 0; }
.meta-table-scroll thead th { position: sticky; top: 0; background: var(--color-surface); z-index: 1; }
.meta-src-col { position: sticky; left: 0; background: var(--color-surface); white-space: nowrap; }
.meta-type-select { padding: 6px 9px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; }
/* Only the italics apply: the shared .desc look (size, margins) has always taken precedence. */
.type-hint { font-style: italic; }
.type-chip { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; padding: 2px 7px; border-radius: 999px; background: var(--color-surface-muted); color: var(--color-text-muted); }
.type-chip.t-century { background: #dbeafe; color: #1d4ed8; }
.type-chip.t-location { background: #dcfce7; color: #15803d; }
.warn-chip { font-size: 10px; font-weight: 700; background: var(--color-warning-light); color: var(--color-warning-dark); padding: 1px 6px; border-radius: 3px; margin-left: 6px; }
.meta-input { width: 100%; min-width: 120px; padding: 5px 8px; border: 1px solid var(--color-border); border-radius: 4px; font-size: 12px; box-sizing: border-box; }
</style>
