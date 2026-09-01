<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { useSettingsStore } from '../stores/settings';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { getNeumeName } from '../config/neumeNames';
import { fileToSnippet, imageFromPaste, imagesFromDrop, formatBytes } from '../utils/snippetImages';
import PatternDisplay from '../components/PatternDisplay.vue';
import PatternCode from '../components/PatternCode.vue';

const store = useDirectSnippetsStore();
const settings = useSettingsStore();
const { glyphs } = useTranscriptionData();

const activeId = ref('');
const active = computed(() => store.getCollection(activeId.value));

// --- Manuscript list: search, sort, paginate ---
// A chip cloud stops being usable somewhere around a dozen entries, and this is
// meant to hold a whole project's worth of sources.
const listSearch = ref('');
const listSort = ref('source');
const listDir = ref(1);
const page = ref(1);
const PAGE_SIZE = 10;

function sortBy(col) {
    if (listSort.value === col) listDir.value *= -1;
    else { listSort.value = col; listDir.value = 1; }
    page.value = 1;
}

const filteredCollections = computed(() => {
    const q = listSearch.value.trim().toLowerCase();
    let list = store.collections.filter(c =>
        !q || `${c.source} ${c.name} ${c.notes}`.toLowerCase().includes(q)
    );
    list = [...list].sort((a, b) => {
        let va, vb;
        switch (listSort.value) {
            case 'patterns': va = a.patterns.length; vb = b.patterns.length; break;
            case 'snippets': va = a.snippets.length; vb = b.snippets.length; break;
            case 'size': va = store.collectionBytes(a.id); vb = store.collectionBytes(b.id); break;
            case 'published': va = a.isPublished ? 1 : 0; vb = b.isPublished ? 1 : 0; break;
            case 'name': va = a.name || ''; vb = b.name || ''; break;
            default: va = a.source || ''; vb = b.source || '';
        }
        if (typeof va === 'string') {
            return va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' }) * listDir.value;
        }
        return (va - vb) * listDir.value;
    });
    return list;
});

const pageCount = computed(() => Math.max(1, Math.ceil(filteredCollections.value.length / PAGE_SIZE)));

// Keep the page in range when filtering or deleting shrinks the list.
watch([filteredCollections, pageCount], () => {
    if (page.value > pageCount.value) page.value = pageCount.value;
});

const pagedCollections = computed(() =>
    filteredCollections.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
);

function goToPage(n) {
    page.value = Math.min(pageCount.value, Math.max(1, n));
}

/** Jump to the page holding a given manuscript, so a new one is never off-screen. */
function revealCollection(id) {
    const idx = filteredCollections.value.findIndex(c => c.id === id);
    if (idx >= 0) page.value = Math.floor(idx / PAGE_SIZE) + 1;
}

// --- Collection creation ---
const newSource = ref('');
const newName = ref('');

function createCollection() {
    if (!newSource.value.trim()) return;
    const c = store.createCollection(newSource.value, newName.value);
    activeId.value = c.id;
    newSource.value = '';
    newName.value = '';
    listSearch.value = '';
    // Land on whichever page now holds it rather than silently adding off-screen.
    nextTick(() => revealCollection(c.id));
}

function deleteCollection(c) {
    if (confirm(`Delete the custom manuscript "${c.source}" and its ${c.snippets.length} snippet(s)? This cannot be undone.`)) {
        store.removeCollection(c.id);
        if (activeId.value === c.id) activeId.value = '';
    }
}

// --- Patterns ---
const newPatternCode = ref('');
const newPatternLabel = ref('');
const patternError = ref('');

function addPattern() {
    patternError.value = '';
    const code = newPatternCode.value.trim();
    if (!code || !active.value) return;
    const added = store.addPattern(active.value.id, code, newPatternLabel.value);
    if (!added) {
        patternError.value = `"${code}" is already in this collection.`;
        return;
    }
    if (!selectedPattern.value) selectedPattern.value = code;
    newPatternCode.value = '';
    newPatternLabel.value = '';
}

// --- Snippet intake ---
const selectedPattern = ref('');
const busy = ref(false);
const intakeError = ref('');
const isDragging = ref(false);
const fileInput = ref(null);

const lastAddedCount = ref(0);

async function ingest(files) {
    if (!active.value) return;
    // A snippet is never rejected for lacking a pattern: it lands in "Unassigned"
    // and can be filed afterwards. Losing a pasted screenshot to a validation
    // error is far worse than an untidy inbox.
    intakeError.value = '';
    busy.value = true;
    let added = 0;
    try {
        for (const f of files) {
            const { dataUrl, width, height } = await fileToSnippet(f);
            store.addSnippet(active.value.id, {
                pattern: selectedPattern.value || '',
                image: dataUrl,
                width, height
            });
            added++;
        }
        lastAddedCount.value = added;
        setTimeout(() => { lastAddedCount.value = 0; }, 2500);
    } catch (e) {
        intakeError.value = e?.message || 'Could not read that image.';
    } finally {
        busy.value = false;
    }
}

function onPaste(e) {
    if (!active.value) return;
    const f = imageFromPaste(e);
    if (!f) return;
    e.preventDefault();
    ingest([f]);
}

function onDrop(e) {
    e.preventDefault();
    isDragging.value = false;
    const files = imagesFromDrop(e);
    if (files.length) ingest(files);
}

function onPickFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) ingest(files);
    e.target.value = null;
}

// Saves are debounced, so make sure nothing is lost if the tab is closed or
// backgrounded right after a paste.
function flushNow() { store.flush(); }

onMounted(async () => {
    await store.load();
    // With a single collection there is nothing to choose — open it.
    if (!activeId.value && store.collections.length === 1) {
        activeId.value = store.collections[0].id;
    }
    window.addEventListener('paste', onPaste);
    window.addEventListener('beforeunload', flushNow);
    document.addEventListener('visibilitychange', flushNow);
});
onBeforeUnmount(() => {
    window.removeEventListener('paste', onPaste);
    window.removeEventListener('beforeunload', flushNow);
    document.removeEventListener('visibilitychange', flushNow);
    store.flush();
});

// Patterns already known to the project, offered as suggestions so codes stay
// consistent with the transcription data instead of being retyped from memory.
const { patStats } = useTranscriptionData();
const patternSuggestions = computed(() => {
    const used = new Set((active.value?.patterns || []).map(p => p.code));
    return Object.keys(patStats.value || {})
        .filter(p => !used.has(p))
        .sort((a, b) => (patStats.value[b]?.count || 0) - (patStats.value[a]?.count || 0))
        .slice(0, 200);
});

const WARN_BYTES = 40 * 1024 * 1024;
const storageWarning = computed(() => store.totalBytes > WARN_BYTES);

// Snippets grouped by pattern, for the review grid.
const grouped = computed(() => {
    if (!active.value) return [];
    const map = {};
    for (const p of active.value.patterns) map[p.code] = [];
    const orphans = [];
    for (const s of active.value.snippets) {
        if (s.pattern && map[s.pattern]) map[s.pattern].push(s);
        else orphans.push(s);
    }
    const out = active.value.patterns.map(p => ({ pattern: p, snippets: map[p.code] }));
    if (orphans.length) out.push({ pattern: { code: '', label: 'Unassigned' }, snippets: orphans });
    return out;
});
</script>

<template>
<div class="direct-view">
    <div class="page-head">
        <h1>Custom Manuscripts</h1>
        <p class="desc">
            Document a source that isn't in IIIF — a photograph, a PDF, a facsimile you own.
            Create the manuscript, declare the patterns you want to show by code, then paste
            (<kbd>Ctrl</kbd>+<kbd>V</kbd>), drop or upload cropped images.
            Everything is stored in your workspace and travels with the JSON backup.
        </p>
    </div>

    <!-- Collections -->
    <div class="card">
        <h2><span class="step">1</span> Manuscripts</h2>
        <div class="add-row">
            <input v-model="newSource" placeholder="Siglum (e.g. Cod. Sang. 359)" @keyup.enter="createCollection" />
            <input v-model="newName" placeholder="Title (optional)" @keyup.enter="createCollection" />
            <button class="btn-primary" @click="createCollection" :disabled="!newSource.trim()">Add Manuscript</button>
        </div>

        <div v-if="store.collections.length === 0" class="empty">No custom manuscripts yet — add one above to begin.</div>

        <template v-else>
            <div class="list-toolbar">
                <input v-model="listSearch" class="list-search" placeholder="Search manuscripts…" />
                <span class="list-count">
                    {{ filteredCollections.length }} of {{ store.collections.length }}
                </span>
            </div>

            <div class="table-wrap">
                <table class="coll-table">
                    <thead>
                        <tr>
                            <th class="sortable" @click="sortBy('source')">
                                Siglum <span v-if="listSort==='source'" class="sort-ind">{{ listDir===1?'▲':'▼' }}</span>
                            </th>
                            <th class="sortable" @click="sortBy('name')">
                                Title <span v-if="listSort==='name'" class="sort-ind">{{ listDir===1?'▲':'▼' }}</span>
                            </th>
                            <th class="sortable num" @click="sortBy('patterns')">
                                Patterns <span v-if="listSort==='patterns'" class="sort-ind">{{ listDir===1?'▲':'▼' }}</span>
                            </th>
                            <th class="sortable num" @click="sortBy('snippets')">
                                Snippets <span v-if="listSort==='snippets'" class="sort-ind">{{ listDir===1?'▲':'▼' }}</span>
                            </th>
                            <th class="sortable num" @click="sortBy('size')">
                                Size <span v-if="listSort==='size'" class="sort-ind">{{ listDir===1?'▲':'▼' }}</span>
                            </th>
                            <th class="sortable" @click="sortBy('published')">
                                Public <span v-if="listSort==='published'" class="sort-ind">{{ listDir===1?'▲':'▼' }}</span>
                            </th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="c in pagedCollections" :key="c.id"
                            class="coll-row" :class="{ active: c.id === activeId }"
                            @click="activeId = c.id">
                            <td class="c-source">
                                <strong>{{ c.source }}</strong>
                                <span v-if="c.id === activeId" class="editing-badge">editing</span>
                            </td>
                            <td class="c-name">{{ c.name || '—' }}</td>
                            <td class="num">{{ c.patterns.length }}</td>
                            <td class="num">{{ c.snippets.length }}</td>
                            <td class="num size">{{ formatBytes(store.collectionBytes(c.id)) }}</td>
                            <td>
                                <span v-if="c.isPublished" class="pub-badge" title="Shown in the public views">public</span>
                                <span v-else class="priv-badge">private</span>
                            </td>
                            <td class="c-actions">
                                <button class="row-btn" @click.stop="activeId = c.id" title="Edit this manuscript">Edit</button>
                                <button class="row-btn danger" @click.stop="deleteCollection(c)" title="Delete manuscript">×</button>
                            </td>
                        </tr>
                        <tr v-if="pagedCollections.length === 0">
                            <td colspan="7" class="no-match">No manuscripts match “{{ listSearch }}”.</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div v-if="pageCount > 1" class="pager">
                <button class="row-btn" :disabled="page === 1" @click="goToPage(1)">« First</button>
                <button class="row-btn" :disabled="page === 1" @click="goToPage(page - 1)">‹ Prev</button>
                <span class="pager-info">Page {{ page }} of {{ pageCount }}</span>
                <button class="row-btn" :disabled="page === pageCount" @click="goToPage(page + 1)">Next ›</button>
                <button class="row-btn" :disabled="page === pageCount" @click="goToPage(pageCount)">Last »</button>
            </div>
        </template>
    </div>

    <template v-if="active">
        <!-- Collection settings -->
        <div class="card">
            <h2>{{ active.source }}</h2>
            <div class="settings-row">
                <label class="ff">
                    <span>Title</span>
                    <input :value="active.name" @input="store.updateCollection(active.id, { name: $event.target.value })" />
                </label>
                <label class="ff grow">
                    <span>Notes</span>
                    <input :value="active.notes" @input="store.updateCollection(active.id, { notes: $event.target.value })" />
                </label>
                <label class="pub-toggle" title="Show this manuscript in the public directory and Neumentabelle">
                    <input type="checkbox" :checked="active.isPublished"
                           @change="store.updateCollection(active.id, { isPublished: $event.target.checked })" />
                    Publish
                </label>
            </div>
            <div v-if="settings.sourceMetaFields.length" class="meta-block">
                <div class="meta-block-head">
                    Metadata
                    <span class="meta-hint">shown publicly and filterable in the directory</span>
                </div>
                <div class="meta-grid">
                    <label v-for="f in settings.sourceMetaFields" :key="f.key" class="meta-field">
                        <span :title="f.description">{{ f.label }}</span>
                        <input :value="settings.getSourceMetaValue(active.source, f.key)"
                               :placeholder="f.description || f.label"
                               :list="`cmmeta-${f.key}`"
                               @input="settings.setSourceMetaValue(active.source, f.key, $event.target.value)" />
                        <datalist :id="`cmmeta-${f.key}`">
                            <option v-for="v in settings.sourceMetaValuesFor(f.key)" :key="v" :value="v" />
                        </datalist>
                    </label>
                </div>
            </div>

            <div class="size-note">
                Stored images: {{ formatBytes(store.collectionBytes(active.id)) }}
                <span class="size-total">(all collections: {{ formatBytes(store.totalBytes) }})</span>
            </div>
            <div v-if="storageWarning" class="size-warn">
                These collections are getting large. Export a JSON backup — browser storage can be
                cleared by the browser itself when space runs low.
            </div>
        </div>

        <!-- Patterns -->
        <div class="card">
            <h2><span class="step">2</span> Patterns</h2>
            <p class="desc">Declare the patterns you want to document, by code (e.g. <span class="mono">*uudd</span>).
                They are independent of the transcription dataset, so any code works — including code variants
                like <span class="mono">*uuVdd</span>.</p>
            <div class="add-row">
                <input v-model="newPatternCode" placeholder="Code (e.g. *uudd)" list="known-patterns" @keyup.enter="addPattern" />
                <datalist id="known-patterns">
                    <option v-for="p in patternSuggestions" :key="p" :value="p" />
                </datalist>
                <input v-model="newPatternLabel" placeholder="Label (optional, e.g. Scandicus)" @keyup.enter="addPattern" />
                <button @click="addPattern" :disabled="!newPatternCode.trim()">Add Pattern</button>
            </div>
            <div v-if="newPatternCode.trim()" class="code-preview">
                Preview:
                <PatternDisplay :pattern="newPatternCode.trim()" :glyphs="glyphs" />
                <PatternCode :pattern="newPatternCode.trim()" />
            </div>
            <div v-if="patternError" class="err">{{ patternError }}</div>

            <div v-if="active.patterns.length === 0" class="empty">No patterns yet — add one to start filing snippets.</div>
            <div v-else class="pat-chips">
                <button v-for="p in active.patterns" :key="p.code"
                        class="pat-chip" :class="{ active: selectedPattern === p.code }"
                        @click="selectedPattern = p.code">
                    <PatternDisplay :pattern="p.code" :glyphs="glyphs" />
                    <PatternCode :pattern="p.code" />
                    <span class="pat-label">{{ p.label || getNeumeName(p.code) }}</span>
                    <span class="pat-count">{{ active.snippets.filter(s => s.pattern === p.code).length }}</span>
                    <span class="pat-del" @click.stop="store.removePattern(active.id, p.code)" title="Remove pattern">×</span>
                </button>
            </div>
        </div>

        <!-- Intake -->
        <div class="card">
            <h2><span class="step">3</span> Add Snippets</h2>
            <div class="intake"
                 :class="{ dragging: isDragging }"
                 @dragover.prevent="isDragging = true"
                 @dragleave.prevent="isDragging = false"
                 @drop="onDrop"
                 @click="fileInput?.click()">
                <input ref="fileInput" type="file" accept="image/*" multiple class="hidden-file" @change="onPickFiles" />
                <div v-if="busy" class="intake-msg">Processing…</div>
                <div v-else-if="lastAddedCount" class="intake-msg ok">
                    ✓ Added {{ lastAddedCount }} snippet{{ lastAddedCount > 1 ? 's' : '' }}
                    <span v-if="selectedPattern">under <span class="mono">{{ selectedPattern }}</span></span>
                    <span v-else>to <em>Unassigned</em></span>
                </div>
                <template v-else>
                    <div class="intake-msg">
                        <strong v-if="selectedPattern">Filing under <span class="mono">{{ selectedPattern }}</span></strong>
                        <strong v-else-if="active.patterns.length">Filing as <em>Unassigned</em></strong>
                        <strong v-else>Paste away — you can add patterns later</strong>
                    </div>
                    <div class="intake-sub">Paste (Ctrl+V), drop images here, or click to choose files</div>
                    <div class="intake-sub" v-if="!selectedPattern && active.patterns.length">
                        Pick a pattern above to file them directly.
                    </div>
                </template>
            </div>
            <div v-if="intakeError" class="err">{{ intakeError }}</div>
        </div>

        <!-- Review -->
        <div class="card">
            <h2><span class="step">4</span> Review ({{ active.snippets.length }} snippets)</h2>
            <div v-if="active.snippets.length === 0" class="empty">Nothing added yet.</div>
            <div v-for="g in grouped" :key="g.pattern.code || '_orphan'" class="group">
                <div class="group-head" v-if="g.snippets.length">
                    <PatternDisplay v-if="g.pattern.code" :pattern="g.pattern.code" :glyphs="glyphs" />
                    <PatternCode v-if="g.pattern.code" :pattern="g.pattern.code" />
                    <span class="group-label">{{ g.pattern.label || getNeumeName(g.pattern.code) }}</span>
                    <span class="group-count">{{ g.snippets.length }}</span>
                </div>
                <div class="snip-grid" v-if="g.snippets.length">
                    <div v-for="s in g.snippets" :key="s.id" class="snip-card">
                        <img :src="s.image" :alt="s.caption || g.pattern.code" />
                        <input class="snip-caption" :value="s.caption" placeholder="Caption (e.g. f. 12r, l. 3)"
                               @input="store.updateSnippet(active.id, s.id, { caption: $event.target.value })" />
                        <div class="snip-row">
                            <input class="snip-ref" :value="s.refId" placeholder="Ref ID"
                                   @input="store.updateSnippet(active.id, s.id, { refId: $event.target.value })" />
                            <select class="snip-pat" :value="s.pattern"
                                    @change="store.updateSnippet(active.id, s.id, { pattern: $event.target.value })">
                                <option value="">— unassigned —</option>
                                <option v-for="p in active.patterns" :key="p.code" :value="p.code">{{ p.code }}</option>
                            </select>
                            <button class="del-snip" @click="store.removeSnippet(active.id, s.id)" title="Delete snippet">×</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </template>

    <div v-else-if="store.collections.length > 0" class="empty pad">Select a manuscript above to edit it.</div>
</div>
</template>

<style scoped>
.direct-view { padding: 24px; max-width: 1100px; margin: 0 auto; text-align: left; }
h1 { margin-top: 0; }
.desc { color: var(--color-text-muted); font-size: 13px; line-height: 1.6; }
.mono { font-family: monospace; background: var(--color-surface-muted); padding: 0 4px; border-radius: 3px; }
kbd { font-family: monospace; background: var(--color-surface-muted); border: 1px solid var(--color-border); border-bottom-width: 2px; border-radius: 3px; padding: 0 4px; font-size: 11px; }

.card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; padding: 18px; margin-bottom: 20px; }
.card h2 { margin-top: 0; font-size: 1.05rem; border-bottom: 1px solid var(--color-border); padding-bottom: 10px; display: flex; align-items: center; gap: 9px; }
.step { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: var(--color-primary); color: #fff; font-size: 12px; font-weight: 800; flex-shrink: 0; }
.page-head { margin-bottom: 22px; }

.add-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.add-row input { flex: 1; min-width: 160px; padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; }
button { padding: 7px 14px; border-radius: 6px; border: 1px solid var(--color-border-hover); background: white; cursor: pointer; font-weight: 600; font-size: 13px; }
button:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { background: var(--color-primary); color: white; border-color: var(--color-primary); }

.empty { color: var(--color-text-light); font-size: 13px; padding: 10px 0; }
.empty.pad { padding: 30px; text-align: center; }
.err { color: var(--color-danger, #dc2626); font-size: 12px; margin-top: 6px; }

.list-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.list-search { flex: 1; max-width: 320px; padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; }
.list-count { font-size: 12px; color: var(--color-text-muted); }

.table-wrap { border: 1px solid var(--color-border); border-radius: 8px; overflow-x: auto; }
.coll-table { width: 100%; border-collapse: collapse; font-size: 13px; background: white; }
.coll-table th { text-align: left; padding: 9px 12px; background: var(--color-bg); border-bottom: 1px solid var(--color-border); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-text-muted); white-space: nowrap; }
.coll-table th.sortable { cursor: pointer; user-select: none; }
.coll-table th.sortable:hover { color: var(--color-text); }
.sort-ind { font-size: 9px; margin-left: 2px; }
.coll-table td { padding: 9px 12px; border-bottom: 1px solid var(--color-surface-muted); }
.coll-table tbody tr:last-child td { border-bottom: none; }
.coll-table .num { text-align: right; white-space: nowrap; }
.coll-table .size { color: var(--color-text-muted); font-size: 12px; }

.coll-row { cursor: pointer; }
.coll-row:hover { background: var(--color-bg); }
.coll-row.active { background: var(--color-primary-light); }
.coll-row.active .c-source strong { color: var(--color-primary-hover); }
.c-name { color: var(--color-text-muted); }
.c-actions { text-align: right; white-space: nowrap; }
.editing-badge { font-size: 9px; text-transform: uppercase; font-weight: 800; background: var(--color-primary); color: #fff; padding: 2px 5px; border-radius: 3px; margin-left: 7px; }
.no-match { text-align: center; color: var(--color-text-light); padding: 22px; font-style: italic; }

.row-btn { padding: 4px 9px; font-size: 12px; border: 1px solid var(--color-border-hover); background: white; border-radius: 5px; cursor: pointer; font-weight: 600; margin-left: 4px; }
.row-btn:hover:not(:disabled) { background: var(--color-bg); }
.row-btn:disabled { opacity: .45; cursor: not-allowed; }
.row-btn.danger:hover { background: var(--color-danger, #dc2626); color: #fff; border-color: var(--color-danger, #dc2626); }

.pager { display: flex; align-items: center; gap: 6px; justify-content: center; margin-top: 12px; }
.pager-info { font-size: 12px; color: var(--color-text-muted); margin: 0 10px; }

.pub-badge { font-size: 9px; text-transform: uppercase; font-weight: 800; background: var(--color-primary); color: white; padding: 2px 5px; border-radius: 3px; }
.priv-badge { font-size: 9px; text-transform: uppercase; font-weight: 700; color: var(--color-text-light); }
.del, .pat-del, .del-snip { border: none; background: none; color: var(--color-text-muted); cursor: pointer; font-size: 16px; padding: 0 4px; line-height: 1; }
.del:hover, .pat-del:hover, .del-snip:hover { color: var(--color-danger, #dc2626); }

.settings-row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.ff { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--color-text-muted); }
.ff.grow { flex: 1; }
.ff input { padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; font-weight: 400; }
.pub-toggle { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; cursor: pointer; padding-bottom: 8px; }
.meta-block { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--color-border); }
.meta-block-head { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; font-weight: 800; color: var(--color-text-muted); margin-bottom: 10px; }
.meta-hint { text-transform: none; letter-spacing: 0; font-weight: 400; font-style: italic; }
.meta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.meta-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: var(--color-text-muted); }
.meta-field input { padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; font-weight: 400; color: var(--color-text); }
.size-note { margin-top: 10px; font-size: 11px; color: var(--color-text-muted); }
.size-total { opacity: .8; }
.size-warn { margin-top: 8px; font-size: 12px; padding: 8px 10px; background: var(--color-warning-light); color: var(--color-warning-dark); border-radius: 6px; }
.code-preview { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--color-text-muted); margin: -4px 0 12px; padding: 8px 10px; background: var(--color-bg); border-radius: 6px; }
.intake-msg.ok { color: var(--color-primary-hover); font-weight: 600; }

.pat-chips { display: flex; flex-wrap: wrap; gap: 10px; }
.pat-chip { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
.pat-chip.active { border-color: var(--color-primary); background: var(--color-primary-light); }
.pat-label { font-size: 12px; color: var(--color-text-muted); font-weight: 400; }
.pat-count { font-size: 10px; font-weight: 800; background: var(--color-surface-muted); border-radius: 10px; padding: 1px 7px; }

.intake { border: 2px dashed var(--color-border-hover); border-radius: 10px; padding: 28px; text-align: center; cursor: pointer; transition: all .15s; background: var(--color-bg); }
.intake:hover, .intake.dragging { border-color: var(--color-primary); background: var(--color-primary-light); }
.intake.disabled { opacity: .6; }
.intake-msg { font-size: 14px; margin-bottom: 4px; }
.intake-sub { font-size: 12px; color: var(--color-text-muted); }
.hidden-file { display: none; }

.group { margin-bottom: 20px; }
.group-head { display: flex; align-items: center; gap: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border); margin-bottom: 10px; }
.group-label { font-size: 13px; font-weight: 600; }
.group-count { font-size: 10px; font-weight: 800; background: var(--color-surface-muted); border-radius: 10px; padding: 1px 7px; margin-left: auto; }

.snip-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.snip-card { border: 1px solid var(--color-border); border-radius: 8px; padding: 8px; background: white; display: flex; flex-direction: column; gap: 6px; }
.snip-card img { width: 100%; height: 90px; object-fit: contain; background: var(--color-bg); border-radius: 4px; }
.snip-caption, .snip-ref { padding: 4px 7px; border: 1px solid var(--color-border); border-radius: 4px; font-size: 11px; width: 100%; box-sizing: border-box; }
.snip-row { display: flex; gap: 4px; align-items: center; }
.snip-ref { width: 70px; }
.snip-pat { flex: 1; font-size: 11px; padding: 4px; border: 1px solid var(--color-border); border-radius: 4px; min-width: 0; }
</style>
