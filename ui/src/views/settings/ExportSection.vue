<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useSettingsStore, SETTINGS_GROUPS } from '../../stores/settings';
import { useDirectSnippetsStore } from '../../stores/directSnippets';
import { useDataManagement } from '../../composables/useDataManagement';
import { getManuscriptStats, customManuscriptStats, DATA_PARTS } from '../../utils/workspaceSharing';
import { exportableSources, isEmptySelection } from '../../services/persistence/exportBuilder';

/**
 * The export builder: the one place to save the workspace, or any part of it, to
 * a file. "Everything" is a full backup (and resets the backup reminder); the
 * other presets and the check boxes narrow it down. The files are read back by
 * Settings → Import.
 */
const settings = useSettingsStore();
const direct = useDirectSnippetsStore();
const { getLocalFullState, exportSelection, exportWorkspace } = useDataManagement();

const GROUP_KEYS = Object.keys(SETTINGS_GROUPS);
const PART_INFO = {
    annotations: { label: 'Annotations', description: 'line regions, the snippets in them, manual line numbers' },
    tables: { label: 'Equivalents tables', description: 'Ref IDs and notes per pattern, published flag' },
    iiifLinks: { label: 'IIIF links', description: 'the manifest URL of each manuscript' }
};

const manuscripts = computed(() => {
    const state = getLocalFullState();
    return exportableSources(state).map(src => getManuscriptStats(state, src));
});
const collections = computed(() => direct.collections.map(c => ({ id: c.id, source: c.source || '(no siglum)', ...customManuscriptStats(c) })));

const sel = reactive({
    sources: [],
    parts: [...DATA_PARTS],
    collections: [],
    settingsGroups: [...GROUP_KEYS],
    patternLibrary: true,
    ommrSettings: true
});
const perItem = ref(false);
const filter = ref('');

function applyPreset(name) {
    const all = name === 'everything';
    const withManuscripts = all || name === 'manuscripts';
    const withSettings = all || name === 'settings';
    sel.sources = withManuscripts ? manuscripts.value.map(m => m.source) : [];
    sel.parts = withManuscripts ? [...DATA_PARTS] : [];
    sel.collections = withManuscripts ? collections.value.map(c => c.id) : [];
    sel.settingsGroups = withSettings ? [...GROUP_KEYS] : [];
    sel.patternLibrary = withSettings;
    sel.ommrSettings = withSettings;
}

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const preset = computed(() => {
    const allSources = sameSet(sel.sources, manuscripts.value.map(m => m.source));
    const allCollections = sameSet(sel.collections, collections.value.map(c => c.id));
    const allParts = sameSet(sel.parts, DATA_PARTS);
    const allSettings = sameSet(sel.settingsGroups, GROUP_KEYS) && sel.patternLibrary && sel.ommrSettings;
    const noManuscripts = !sel.sources.length && !sel.collections.length;
    const noSettings = !sel.settingsGroups.length && !sel.patternLibrary && !sel.ommrSettings;
    if (allSources && allCollections && allParts && allSettings) return 'everything';
    if (allSources && allCollections && allParts && noSettings) return 'manuscripts';
    if (noManuscripts && allSettings) return 'settings';
    return 'custom';
});

const visibleManuscripts = computed(() => {
    const q = filter.value.trim().toLowerCase();
    return q ? manuscripts.value.filter(m => m.source.toLowerCase().includes(q)) : manuscripts.value;
});

function toggleAll(list, key, values, on) {
    const set = new Set(sel[key]);
    for (const v of values) on ? set.add(v) : set.delete(v);
    sel[key] = list.map(x => x).filter(v => set.has(v));
}
const selectVisible = on => toggleAll(manuscripts.value.map(m => m.source), 'sources', visibleManuscripts.value.map(m => m.source), on);
const selectPublished = () => { sel.sources = manuscripts.value.filter(m => m.isPublished).map(m => m.source); };
const selectCollections = on => { sel.collections = on ? collections.value.map(c => c.id) : []; };

const empty = computed(() => isEmptySelection(sel));
const summary = computed(() => {
    const out = [];
    if (sel.sources.length && sel.parts.length) {
        const parts = sel.parts.length === DATA_PARTS.length ? 'all data' : sel.parts.map(p => PART_INFO[p].label).join(', ');
        out.push(`${sel.sources.length} manuscript${sel.sources.length === 1 ? '' : 's'} (${parts})`);
    }
    if (sel.collections.length) out.push(`${sel.collections.length} custom manuscript${sel.collections.length === 1 ? '' : 's'}`);
    const settingParts = sel.settingsGroups.length + (sel.patternLibrary ? 1 : 0) + (sel.ommrSettings ? 1 : 0);
    if (settingParts) out.push(settingParts === GROUP_KEYS.length + 2 ? 'all settings' : `${settingParts} kind${settingParts === 1 ? '' : 's'} of settings`);
    return out.join(' · ');
});

const busy = ref(false);
const message = ref('');
const status = ref('');

async function doExport() {
    if (busy.value || empty.value) return;
    busy.value = true;
    message.value = '';
    try {
        const res = await exportSelection(JSON.parse(JSON.stringify(sel)), { perItem: perItem.value, label: settings.backupLabel });
        status.value = 'success';
        message.value = `Saved ${res.filename}` + (res.files > 1 ? ` (${res.files} files)` : '')
            + (res.complete ? '. This is a full backup.' : '.');
    } catch (e) {
        status.value = 'error';
        message.value = e.message;
    } finally {
        busy.value = false;
    }
}

onMounted(async () => {
    // Custom manuscripts load from IndexedDB; the lists must be complete before the preset is applied.
    await exportWorkspace();
    applyPreset('everything');
});
</script>

<template>
    <div class="card section settings-card export-builder">
        <h2>Export</h2>
        <p class="desc">Save the whole workspace as a backup, or pick exactly what goes into the file. Everything here is read back by <router-link :to="{ query: { section: 'import' } }">Import</router-link>.</p>

        <div class="presets" role="radiogroup" aria-label="What to export">
            <button v-for="p in [
                { id: 'everything', label: 'Everything', hint: 'full backup' },
                { id: 'manuscripts', label: 'Manuscripts only', hint: 'no settings' },
                { id: 'settings', label: 'Settings only', hint: 'no manuscript data' }
            ]" :key="p.id" type="button" role="radio" :aria-checked="preset === p.id"
                :class="['preset', { active: preset === p.id }]" @click="applyPreset(p.id)">
                <strong>{{ p.label }}</strong><span>{{ p.hint }}</span>
            </button>
            <span :class="['preset', 'passive', { active: preset === 'custom' }]"><strong>Custom</strong><span>pick below</span></span>
        </div>

        <!-- Manuscripts -->
        <fieldset class="block">
            <legend>Manuscripts <span class="count">{{ sel.sources.length }} / {{ manuscripts.length }}</span></legend>
            <template v-if="manuscripts.length">
                <div class="list-tools">
                    <input v-model="filter" class="filter" type="search" placeholder="Filter by siglum">
                    <button type="button" class="btn-sm btn-secondary" @click="selectVisible(true)">Select {{ filter ? 'shown' : 'all' }}</button>
                    <button type="button" class="btn-sm btn-secondary" @click="selectVisible(false)">Clear {{ filter ? 'shown' : 'all' }}</button>
                    <button type="button" class="btn-sm btn-secondary" @click="selectPublished">Published only</button>
                </div>
                <div class="check-list">
                    <label v-for="m in visibleManuscripts" :key="m.source" class="check-row">
                        <input type="checkbox" :value="m.source" v-model="sel.sources">
                        <span class="name">{{ m.source }}</span>
                        <span v-if="m.isPublished" class="tag pub">published</span>
                        <span class="stats">{{ m.annotationsCount }} snippets · {{ m.foliosCount }} folios · {{ m.patternRowsCount }} rows</span>
                    </label>
                </div>
            </template>
            <p v-else class="empty-line">No manuscript holds data yet.</p>

            <div class="parts">
                <span class="parts-label">Kinds of data</span>
                <label v-for="p in DATA_PARTS" :key="p" class="part" :title="PART_INFO[p].description">
                    <input type="checkbox" :value="p" v-model="sel.parts">
                    {{ PART_INFO[p].label }}
                    <small>{{ PART_INFO[p].description }}</small>
                </label>
            </div>
        </fieldset>

        <!-- Custom manuscripts -->
        <fieldset class="block">
            <legend>Custom manuscripts <span class="count">{{ sel.collections.length }} / {{ collections.length }}</span></legend>
            <template v-if="collections.length">
                <div class="list-tools">
                    <button type="button" class="btn-sm btn-secondary" @click="selectCollections(true)">Select all</button>
                    <button type="button" class="btn-sm btn-secondary" @click="selectCollections(false)">Clear all</button>
                </div>
                <div class="check-list">
                    <label v-for="c in collections" :key="c.id" class="check-row">
                        <input type="checkbox" :value="c.id" v-model="sel.collections">
                        <span class="name">{{ c.source }}</span>
                        <span class="stats">{{ c.snippets }} images · {{ c.patterns }} patterns</span>
                    </label>
                </div>
                <p class="text-sm-muted-mt0 note">Images are stored inside the file, so these can make it large.</p>
            </template>
            <p v-else class="empty-line">No custom manuscripts.</p>
        </fieldset>

        <!-- Settings -->
        <fieldset class="block">
            <legend>Settings</legend>
            <div class="settings-grid">
                <label v-for="(g, key) in SETTINGS_GROUPS" :key="key" class="part">
                    <input type="checkbox" :value="key" v-model="sel.settingsGroups">
                    {{ g.label }}
                    <small>{{ g.description }}</small>
                </label>
                <label class="part">
                    <input type="checkbox" v-model="sel.patternLibrary">
                    Pattern library
                    <small>labels, notes and MEI templates of patterns</small>
                </label>
                <label class="part">
                    <input type="checkbox" v-model="sel.ommrSettings">
                    OMMR import settings
                    <small>folio offsets and other import options</small>
                </label>
            </div>
        </fieldset>

        <!-- Output -->
        <fieldset class="block">
            <legend>File</legend>
            <div class="output-row">
                <label class="label-field">
                    <span>Label</span>
                    <input v-model="settings.backupLabel" class="text-input" placeholder="My Backup">
                </label>
                <div class="format">
                    <label><input type="radio" :value="false" v-model="perItem"> One JSON file</label>
                    <label><input type="radio" :value="true" v-model="perItem"> ZIP with one file per manuscript</label>
                </div>
            </div>
        </fieldset>

        <div class="export-bar">
            <div class="summary">
                <strong v-if="preset === 'everything'">Full backup</strong>
                <strong v-else>Selection</strong>
                <span>{{ empty ? 'Nothing selected' : summary }}</span>
            </div>
            <button class="btn-primary" :disabled="busy || empty" @click="doExport">
                {{ busy ? 'Exporting…' : perItem ? 'Download ZIP' : 'Download file' }}
            </button>
        </div>
        <div v-if="message" :class="['msg', status]">{{ message }}</div>
    </div>
</template>

<style scoped>
.presets { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 18px; }
.preset { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); cursor: pointer; text-align: left; color: var(--color-text); }
.preset span { font-size: 0.78rem; color: var(--color-text-muted); }
.preset:hover:not(.passive) { border-color: var(--color-border-hover); }
.preset.active { border-color: var(--color-primary); background: var(--color-primary-light); box-shadow: inset 0 0 0 1px var(--color-primary); }
.preset.passive { cursor: default; opacity: 0.6; }
.preset.passive.active { opacity: 1; }

.block { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 12px 14px 14px; margin: 0 0 14px; }
.block legend { font-weight: 600; padding: 0 6px; }
.count { font-weight: 400; color: var(--color-text-muted); font-size: 0.85em; margin-left: 4px; }
.list-tools { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
.filter { flex: 1; min-width: 140px; padding: 5px 8px; border: 1px solid var(--color-border); border-radius: 4px; }
.check-list { max-height: 260px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); }
.check-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--color-border); cursor: pointer; font-size: 0.88rem; }
.check-row:last-child { border-bottom: none; }
.check-row:hover { background: var(--color-surface); }
.check-row .name { font-weight: 600; }
.check-row .stats { margin-left: auto; color: var(--color-text-muted); font-size: 0.8rem; white-space: nowrap; }
.tag.pub { font-size: 0.7rem; font-weight: 600; color: #166534; background: var(--color-success-light); padding: 1px 6px; border-radius: 10px; }
.empty-line { color: var(--color-text-light); font-style: italic; margin: 4px 0; }
.note { margin: 6px 0 0; }

.parts { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 12px; align-items: baseline; }
.parts-label { font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); width: 100%; }
.part { display: flex; flex-direction: column; font-size: 0.9rem; cursor: pointer; padding-left: 22px; position: relative; }
.part input { position: absolute; left: 0; top: 3px; margin: 0; }
.part small { color: var(--color-text-muted); font-size: 0.76rem; }
.settings-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px 18px; }

.output-row { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-end; }
.label-field { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; font-weight: 500; }
.text-input { padding: 6px 8px; border: 1px solid var(--color-border); border-radius: 4px; width: 220px; }
.format { display: flex; flex-direction: column; gap: 4px; font-size: 0.9rem; }

.export-bar { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; margin: 4px -4px 0; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); flex-wrap: wrap; }
.summary { display: flex; flex-direction: column; font-size: 0.88rem; }
.summary span { color: var(--color-text-muted); }
.msg { margin-top: 10px; padding: 10px; border-radius: 4px; font-size: 0.9em; }
.msg.success { background: var(--color-success-light); color: #166534; }
.msg.error { background: var(--color-danger-light); color: var(--color-danger); }
</style>
