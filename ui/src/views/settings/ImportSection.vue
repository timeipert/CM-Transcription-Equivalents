<script setup>
import { ref, computed } from 'vue';
import { useDataManagement } from '../../composables/useDataManagement';
import { expandImportFiles } from '../../utils/importFiles';
import { findBatchOverlaps } from '../../utils/workspaceSharing';

/**
 * The one place to load files into the workspace: backups, manuscript exports,
 * custom-manuscript files, configuration files, workspace-folder files, and ZIPs
 * of them. Any number of files can be dropped or picked at once; they are
 * analysed first and listed, nothing changes until "Import" is pressed.
 *
 * Files are applied from top to bottom, so a manuscript in two files is a
 * conflict for the lower one even when the workspace does not hold it yet.
 * The whole import can be undone in one step until the page is left.
 */
const { analyzeImportFiles, importBatch, restoreSnapshot } = useDataManagement();

const STRATEGY_LABELS = { overwrite: 'Import', skip: 'Skip', merge: 'Merge', copy: 'Import as copy' };
const CONFLICT_LABELS = { skip: 'Skip (keep mine)', merge: 'Merge (add, keep mine)', overwrite: 'Overwrite mine', copy: 'Import as copy' };
const KIND_LABELS = { backup: 'Backup', manuscripts: 'Export', custom: 'Custom manuscript', config: 'Configuration', workspace: 'Workspace file' };

let nextKey = 1;
/** `{ key, analysis, include, choices, collectionChoices, importSettings }` per file, in import order. */
const items = ref([]);
const skipped = ref([]);
const busy = ref(false);
const dragging = ref(false);
const fileInput = ref(null);
const message = ref('');
const status = ref('');
const undoSnapshot = ref(null);

const ok = it => it.analysis.success;
const sourcesOf = it => [...(it.analysis.newSources || []), ...(it.analysis.overlapSources || [])];
const collectionsOf = it => [...(it.analysis.newCollections || []), ...(it.analysis.overlapCollections || [])];

async function addFiles(fileList) {
    if (!fileList || !fileList.length) return;
    busy.value = true;
    message.value = '';
    try {
        const { files, skipped: notUsed } = await expandImportFiles(fileList);
        skipped.value = [...skipped.value, ...notUsed];
        const analyses = await analyzeImportFiles(files);
        // Older files first, so that with "overwrite" the newest version wins.
        const time = a => Date.parse(a.exportedAt || '') || 0;
        analyses.sort((a, b) => time(a) - time(b));
        for (const analysis of analyses) {
            items.value.push({ key: nextKey++, analysis, include: analysis.success, choices: {}, collectionChoices: {}, importSettings: undefined });
        }
    } catch (e) {
        status.value = 'error';
        message.value = e.message;
    } finally {
        busy.value = false;
    }
}

function onPick(event) {
    addFiles(event.target.files).finally(() => { event.target.value = null; });
}
function onDrop(event) {
    dragging.value = false;
    addFiles(event.dataTransfer?.files);
}
function removeItem(key) {
    items.value = items.value.filter(it => it.key !== key);
}
function clearList() {
    items.value = [];
    skipped.value = [];
}

// --- Conflicts within the batch and with the workspace --------------------------

const included = computed(() => items.value.filter(it => it.include && ok(it)));
const overlaps = computed(() => {
    const list = findBatchOverlaps(items.value.map(it => (it.include && ok(it) && !it.analysis.isConfigOnly)
        ? { sources: sourcesOf(it).map(s => s.source), collections: collectionsOf(it) }
        : null));
    return new Map(items.value.map((it, i) => [it.key, list[i]]));
});
const fileNumber = computed(() => new Map(items.value.map((it, i) => [i, i + 1])));

/** For one manuscript of one file: is it already here, in an earlier file, both, or new. */
function sourceRow(it, s) {
    const local = (it.analysis.overlapSources || []).some(o => o.source === s.source);
    const earlier = overlaps.value.get(it.key)?.sources[s.source];
    return { ...s, local, earlier, conflict: local || earlier !== undefined };
}
function collectionRow(it, c) {
    const local = (it.analysis.overlapCollections || []).some(o => o.id === c.id);
    const earlier = overlaps.value.get(it.key)?.collections[c.id];
    return { ...c, local, earlier, conflict: local || earlier !== undefined };
}

/**
 * The choice in force: what the person picked, else the default — a new
 * manuscript is imported, one that is already here is kept (skip), one that only
 * an earlier file brings is merged with it.
 */
function defaultFor(row) {
    if (!row.conflict) return 'overwrite';
    return row.local ? 'skip' : 'merge';
}
const sourceChoice = (it, row) => it.choices[row.source] ?? defaultFor(row);
const collectionChoice = (it, row) => it.collectionChoices[row.id] ?? (row.conflict ? (row.local ? 'skip' : 'overwrite') : 'overwrite');

function rowsOf(it) {
    return {
        sources: sourcesOf(it).map(s => sourceRow(it, s)),
        collections: collectionsOf(it).map(c => collectionRow(it, c))
    };
}

function setAll(it, strategy) {
    const { sources, collections } = rowsOf(it);
    for (const r of sources) {
        if (!r.conflict) continue;
        if ((strategy === 'copy' || strategy === 'overwrite') && !r.incomingStats.hasData) continue;
        it.choices[r.source] = strategy;
    }
    for (const r of collections) {
        if (!r.conflict) continue;
        it.collectionChoices[r.id] = strategy === 'merge' ? 'overwrite' : strategy;
    }
}
function setAllFiles(strategy) {
    for (const it of included.value) setAll(it, strategy);
}

/** Settings are applied from one file unless the person ticks more: the newest file that has any. */
const defaultSettingsKey = computed(() => {
    const withSettings = included.value.filter(it => it.analysis.hasSettings);
    return withSettings.length ? withSettings[withSettings.length - 1].key : null;
});
const settingsOn = it => it.importSettings ?? (it.key === defaultSettingsKey.value);

function summaryOf(it) {
    const { sources, collections } = rowsOf(it);
    const conflicts = sources.filter(r => r.conflict).length + collections.filter(r => r.conflict).length;
    const parts = [];
    if (sources.length) parts.push(`${sources.length} manuscript${sources.length === 1 ? '' : 's'}`);
    if (collections.length) parts.push(`${collections.length} custom`);
    if (it.analysis.hasSettings) parts.push('settings');
    return { text: parts.join(' · ') || 'nothing to import', conflicts };
}

const totals = computed(() => {
    // A manuscript in two files is one manuscript in the workspace.
    const manuscripts = new Set();
    const custom = new Set();
    let conflicts = 0;
    for (const it of included.value) {
        const { sources, collections } = rowsOf(it);
        for (const r of sources) if (sourceChoice(it, r) !== 'skip') manuscripts.add(r.source);
        for (const r of collections) if (collectionChoice(it, r) !== 'skip') custom.add(String(r.source || r.id).toLowerCase());
        conflicts += sources.filter(r => r.conflict).length + collections.filter(r => r.conflict).length;
    }
    const settingsFrom = included.value.filter(settingsOn).length;
    return { files: included.value.length, manuscripts: manuscripts.size, custom: custom.size, conflicts, settingsFrom };
});

const formatDate = iso => {
    const t = Date.parse(iso || '');
    return t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '';
};
const statsText = st => st ? `${st.annotationsCount} snippets · ${st.foliosCount} folios · ${st.patternRowsCount} rows` : '';

// --- Running the import ---------------------------------------------------------

async function runImport() {
    if (busy.value || !included.value.length) return;
    busy.value = true;
    try {
        const batch = included.value.map(it => {
            const { sources, collections } = rowsOf(it);
            return {
                analysis: it.analysis,
                choices: Object.fromEntries(sources.map(r => [r.source, sourceChoice(it, r)])),
                collectionChoices: Object.fromEntries(collections.map(r => [r.id, collectionChoice(it, r)])),
                importSettings: settingsOn(it)
            };
        });
        const notes = included.value.flatMap(it => it.analysis.notes || []);
        const { snapshot, files, errors } = await importBatch(batch);
        undoSnapshot.value = snapshot;
        const t = totals.value;
        status.value = errors.length ? 'error' : 'success';
        message.value = `Imported ${files} file${files === 1 ? '' : 's'}: ${t.manuscripts} manuscript${t.manuscripts === 1 ? '' : 's'}`
            + (t.custom ? `, ${t.custom} custom manuscript${t.custom === 1 ? '' : 's'}` : '')
            + (t.settingsFrom ? ', settings' : '') + '.'
            + (errors.length ? ' Failed: ' + errors.map(e => `${e.fileName} (${e.error})`).join('; ') : '')
            + (notes.length ? ' ' + notes.join(' ') : '');
        items.value = items.value.filter(it => !(it.include && ok(it)));
    } catch (e) {
        status.value = 'error';
        message.value = e.message;
    } finally {
        busy.value = false;
    }
}

function undo() {
    restoreSnapshot(undoSnapshot.value);
    undoSnapshot.value = null;
    status.value = 'success';
    message.value = 'The import was undone; the workspace is as it was before.';
}
</script>

<template>
    <div class="card section settings-card import-section">
        <h2>Import</h2>
        <p class="desc">
            Load backups, exports, custom-manuscript files, configuration files or ZIPs of them — as many as you like at once.
            Nothing changes until you press <em>Import</em>, and an import can be undone.
        </p>

        <div
            :class="['drop-zone', { dragging, busy }]"
            @dragenter.prevent="dragging = true"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
            @click="fileInput.click()"
            role="button"
            tabindex="0"
            @keydown.enter.prevent="fileInput.click()"
            @keydown.space.prevent="fileInput.click()"
        >
            <input ref="fileInput" type="file" accept=".json,.zip,application/json,application/zip" multiple class="d-none" @change="onPick">
            <div class="drop-icon" aria-hidden="true">⇪</div>
            <strong>{{ busy ? 'Reading files…' : 'Drop files here or click to choose' }}</strong>
            <span>.json and .zip · several at once</span>
        </div>

        <ul v-if="skipped.length" class="skipped">
            <li v-for="(s, i) in skipped" :key="i">Not used: <strong>{{ s.name }}</strong> — {{ s.reason }}</li>
        </ul>

        <template v-if="items.length">
            <div class="batch-tools">
                <span class="text-sm-muted-mt0">Files are applied from top to bottom (older files first).</span>
                <div v-if="totals.conflicts" class="bulk">
                    <span>All conflicts:</span>
                    <button type="button" class="btn-sm btn-secondary" @click="setAllFiles('skip')">Keep mine</button>
                    <button type="button" class="btn-sm btn-secondary" @click="setAllFiles('merge')">Merge</button>
                    <button type="button" class="btn-sm btn-secondary btn-danger" @click="setAllFiles('overwrite')">Overwrite</button>
                </div>
            </div>

            <div v-for="(it, index) in items" :key="it.key" :class="['file-card', { off: !it.include, failed: !ok(it) }]">
                <div class="file-head">
                    <label class="include" :title="ok(it) ? 'Include this file' : 'This file cannot be imported'">
                        <input type="checkbox" v-model="it.include" :disabled="!ok(it)">
                        <span class="file-no">{{ fileNumber.get(index) }}</span>
                    </label>
                    <div class="file-title">
                        <strong class="file-name">{{ it.analysis.fileName }}</strong>
                        <div class="file-meta">
                            <span v-if="ok(it)" class="kind">{{ KIND_LABELS[it.analysis.kind] || 'File' }}</span>
                            <span v-if="it.analysis.label">“{{ it.analysis.label }}”</span>
                            <span v-if="it.analysis.exportedAt">{{ formatDate(it.analysis.exportedAt) }}</span>
                            <span v-if="ok(it)">{{ summaryOf(it).text }}</span>
                            <span v-if="ok(it) && it.analysis.parts" class="partial" title="An overwrite replaces only these kinds of data">only {{ it.analysis.parts.join(', ') }}</span>
                            <span v-if="ok(it) && summaryOf(it).conflicts" class="conflict-count">{{ summaryOf(it).conflicts }} conflict{{ summaryOf(it).conflicts === 1 ? '' : 's' }}</span>
                        </div>
                    </div>
                    <button type="button" class="remove" title="Remove from the list" @click="removeItem(it.key)">×</button>
                </div>

                <p v-if="!ok(it)" class="file-error">{{ it.analysis.error }}</p>

                <div v-else-if="it.include" class="file-body">
                    <ul v-if="it.analysis.notes && it.analysis.notes.length" class="notes">
                        <li v-for="(n, i) in it.analysis.notes" :key="i">{{ n }}</li>
                    </ul>

                    <table v-if="rowsOf(it).sources.length || rowsOf(it).collections.length" class="rows">
                        <thead>
                            <tr><th>Manuscript</th><th>In this file</th><th>Already here</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                            <tr v-for="r in rowsOf(it).sources" :key="'s:' + r.source" :class="{ conflict: r.conflict }">
                                <td class="name">{{ r.source }}</td>
                                <td>{{ statsText(r.incomingStats) }}</td>
                                <td>
                                    <span v-if="r.local">{{ statsText(r.localStats) }}</span>
                                    <span v-if="r.earlier !== undefined" class="earlier">also in file {{ fileNumber.get(r.earlier) }}</span>
                                    <span v-if="!r.conflict" class="new">new</span>
                                </td>
                                <td>
                                    <select v-if="r.conflict" :value="sourceChoice(it, r)" @change="it.choices[r.source] = $event.target.value" :class="['choice', sourceChoice(it, r)]">
                                        <option value="skip">{{ CONFLICT_LABELS.skip }}</option>
                                        <option value="merge">{{ CONFLICT_LABELS.merge }}</option>
                                        <option value="overwrite" :disabled="!r.incomingStats.hasData">{{ CONFLICT_LABELS.overwrite }}</option>
                                        <option value="copy" :disabled="!r.incomingStats.hasData">{{ CONFLICT_LABELS.copy }}</option>
                                    </select>
                                    <select v-else :value="sourceChoice(it, r)" @change="it.choices[r.source] = $event.target.value" :class="['choice', sourceChoice(it, r)]">
                                        <option value="overwrite">{{ STRATEGY_LABELS.overwrite }}</option>
                                        <option value="skip">{{ STRATEGY_LABELS.skip }}</option>
                                    </select>
                                </td>
                            </tr>
                            <tr v-for="r in rowsOf(it).collections" :key="'c:' + r.id" :class="{ conflict: r.conflict }">
                                <td class="name">{{ r.source || '(no siglum)' }} <span class="kind small">custom</span></td>
                                <td>{{ r.incomingStats.snippets }} images · {{ r.incomingStats.patterns }} patterns</td>
                                <td>
                                    <span v-if="r.local">{{ r.localStats.snippets }} images · {{ r.localStats.patterns }} patterns{{ r.sameId ? '' : ' (same siglum)' }}</span>
                                    <span v-if="r.earlier !== undefined" class="earlier">also in file {{ fileNumber.get(r.earlier) }}</span>
                                    <span v-if="!r.conflict" class="new">new</span>
                                </td>
                                <td>
                                    <select :value="collectionChoice(it, r)" @change="it.collectionChoices[r.id] = $event.target.value" :class="['choice', collectionChoice(it, r)]">
                                        <template v-if="r.conflict">
                                            <option value="skip">{{ CONFLICT_LABELS.skip }}</option>
                                            <option value="overwrite" :disabled="!r.incomingStats.hasData">{{ CONFLICT_LABELS.overwrite }}</option>
                                            <option value="copy" :disabled="!r.incomingStats.hasData">{{ CONFLICT_LABELS.copy }}</option>
                                        </template>
                                        <template v-else>
                                            <option value="overwrite">{{ STRATEGY_LABELS.overwrite }}</option>
                                            <option value="skip">{{ STRATEGY_LABELS.skip }}</option>
                                        </template>
                                    </select>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <label v-if="it.analysis.hasSettings" class="settings-toggle">
                        <input type="checkbox" :checked="settingsOn(it)" @change="it.importSettings = $event.target.checked">
                        Apply the settings in this file
                        <small>(preferred IDs, signs, alignments, pattern library, … — settings not in the file stay as they are)</small>
                    </label>
                </div>
            </div>

            <div class="import-bar">
                <div class="summary">
                    <strong>{{ totals.files }} file{{ totals.files === 1 ? '' : 's' }}</strong>
                    <span>
                        {{ totals.manuscripts }} manuscript{{ totals.manuscripts === 1 ? '' : 's' }}<template v-if="totals.custom">, {{ totals.custom }} custom</template><template v-if="totals.settingsFrom">, settings from {{ totals.settingsFrom }} file{{ totals.settingsFrom === 1 ? '' : 's' }}</template>
                    </span>
                </div>
                <div class="bar-actions">
                    <button type="button" class="btn-secondary" @click="clearList">Clear list</button>
                    <button type="button" class="btn-primary" :disabled="busy || !totals.files" @click="runImport">Import</button>
                </div>
            </div>
        </template>

        <div v-if="message" :class="['msg', status]">
            {{ message }}
            <button v-if="undoSnapshot" type="button" class="btn-link" @click="undo">Undo import</button>
        </div>
    </div>
</template>

<style scoped>
.drop-zone { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 28px 16px; border: 2px dashed var(--color-border-hover); border-radius: var(--radius-lg); background: var(--color-bg); cursor: pointer; text-align: center; transition: border-color 0.15s, background 0.15s; }
.drop-zone:hover, .drop-zone:focus-visible { border-color: var(--color-primary); outline: none; }
.drop-zone.dragging { border-color: var(--color-primary); background: var(--color-primary-light); }
.drop-zone.busy { opacity: 0.7; }
.drop-zone span { font-size: 0.8rem; color: var(--color-text-muted); }
.drop-icon { font-size: 1.6rem; color: var(--color-primary); line-height: 1; }

.skipped { margin: 10px 0 0; padding: 8px 12px 8px 28px; background: var(--color-warning-light); border-radius: var(--radius-md); font-size: 0.85rem; }

.batch-tools { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin: 16px 0 8px; }
.bulk { display: flex; gap: 6px; align-items: center; font-size: 0.85rem; }

.file-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); margin-bottom: 10px; background: var(--color-surface); }
.file-card.off .file-head { opacity: 0.55; }
.file-card.failed { border-color: var(--color-danger-muted); }
.file-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px; }
.include { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.file-no { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: var(--color-surface-muted); font-size: 0.75rem; font-weight: 700; }
.file-title { flex: 1; min-width: 0; }
.file-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 0.78rem; color: var(--color-text-muted); }
.kind { font-weight: 600; color: var(--color-primary-dark); background: var(--color-primary-light); padding: 0 6px; border-radius: 10px; }
.kind.small { font-size: 0.7rem; }
.partial { color: var(--color-warning-dark); }
.conflict-count { color: var(--color-warning-dark); font-weight: 600; }
.remove { border: none; background: none; font-size: 1.3rem; line-height: 1; color: var(--color-text-light); cursor: pointer; padding: 0 4px; }
.remove:hover { color: var(--color-danger); }
.file-error { margin: 0; padding: 0 12px 10px 44px; color: var(--color-danger); font-size: 0.88rem; }
.file-body { padding: 0 12px 12px; }
.notes { margin: 0 0 8px; padding: 6px 10px 6px 26px; background: var(--color-surface-muted); border-radius: var(--radius-md); font-size: 0.8rem; }

.rows { font-size: 0.84rem; }
.rows th { font-size: 0.75rem; padding: 6px 8px; }
.rows td { padding: 6px 8px; vertical-align: middle; }
.rows tr.conflict td { background: #fffbeb; }
.rows .name { font-weight: 600; }
.earlier { display: block; color: var(--color-warning-dark); font-size: 0.78rem; }
.new { color: #166534; font-weight: 600; font-size: 0.78rem; }
.choice { padding: 4px 6px; border-radius: 4px; border: 1px solid var(--color-border); font-size: 0.82rem; background: var(--color-surface); }
.choice.overwrite { border-color: var(--color-primary); }
.choice.merge { border-color: var(--color-success); }
.choice.skip { color: var(--color-text-muted); }
.choice.copy { border-color: var(--color-accent); }
.rows tr.conflict .choice.overwrite { border-color: var(--color-danger); color: var(--color-danger); }

.settings-toggle { display: block; margin-top: 10px; font-size: 0.88rem; cursor: pointer; }
.settings-toggle small { color: var(--color-text-muted); }

.import-bar { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; margin-top: 6px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); flex-wrap: wrap; }
.summary { display: flex; flex-direction: column; font-size: 0.88rem; }
.summary span { color: var(--color-text-muted); }
.bar-actions { display: flex; gap: 8px; }
.msg { margin-top: 12px; padding: 10px; border-radius: 4px; font-size: 0.9em; }
.msg.success { background: var(--color-success-light); color: #166534; }
.msg.error { background: var(--color-danger-light); color: var(--color-danger); }
.btn-link { background: none; border: none; color: var(--color-primary-hover); cursor: pointer; font-weight: 600; margin-left: 8px; padding: 0; }
</style>
