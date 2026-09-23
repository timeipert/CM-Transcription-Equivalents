<script setup>
/**
 * Pattern library — one page for the whole notation vocabulary.
 *
 * Patterns are collected from the transcription data, the equivalents tables,
 * the annotations and the project's code variants; shapes that exist only on a
 * local scan can be added by hand. Per pattern it shows the code, the Ref-ID
 * label, image examples from the annotations, and an MEI template editor.
 *
 * The variant vocabulary itself (custom signs, code variants) lives in the
 * settings store and is edited through the same VariantEditorModal the polygon
 * editor uses — this page only gives it a pattern-centric home.
 */
import { ref, computed, onMounted } from 'vue';
import { usePatternLibraryStore } from '../stores/patternLibrary';
import { useSettingsStore } from '../stores/settings';
import { usePatternIndex } from '../composables/usePatternIndex';
import { parsePatternCode, getBaseCode } from '../utils/patternCode';
import { stripSignKeys } from '../utils/signs';

import PatternDisplay from '../components/PatternDisplay.vue';
import PatternCode from '../components/PatternCode.vue';
import VariantEditorModal from '../components/VariantEditorModal.vue';
import PatternHierarchyTree from '../components/patterns/PatternHierarchyTree.vue';
import PatternMeiEditor from '../components/patterns/PatternMeiEditor.vue';
import PatternExamples from '../components/patterns/PatternExamples.vue';
import StateWrapper from '../components/StateWrapper.vue';

const library = usePatternLibraryStore();
const settings = useSettingsStore();
const {
    sources, loadAllSources, index, allCodes, getInfo, refIdFor, signKeys, glyphs, loading
} = usePatternIndex();

onMounted(() => {
    loadAllSources();
});

// --- Filtering ---
const search = ref('');
const onlyAnnotated = ref(false);

const filteredCodes = computed(() => {
    let codes = allCodes.value;

    if (onlyAnnotated.value) {
        codes = codes.filter(c => (getInfo(c)?.annotationCount || 0) > 0);
    }

    const q = search.value.trim().toLowerCase();
    if (q) {
        codes = codes.filter(c =>
            c.toLowerCase().includes(q) ||
            library.getLabel(c).toLowerCase().includes(q) ||
            String(refIdFor(c)).toLowerCase().includes(q)
        );
    }
    return codes;
});

const treeRef = ref(null);
const showSnippetVariants = ref(false);

// --- Detail expansion ---
const expanded = ref(new Set());
function toggleDetail(code) {
    const next = new Set(expanded.value);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    expanded.value = next;
}
function isExpanded(code) {
    return expanded.value.has(code);
}

function entryOf(code) {
    return library.getEntry(code) || { code, label: '', notes: '', mei: null, manual: false };
}

function onLabel(code, value) {
    library.updateEntry(code, { label: value });
}
function onNotes(code, value) {
    library.updateEntry(code, { notes: value });
}
function onMei(code, template) {
    library.setMeiTemplate(code, template, signKeys.value);
}

// --- Manual patterns (scan-only shapes) ---
const newCode = ref('');
const newLabel = ref('');
const addError = ref('');

function addManual() {
    const code = getBaseCode(newCode.value.trim());
    addError.value = '';
    if (!code) {
        addError.value = 'Bitte einen Pattern-Code angeben.';
        return;
    }
    if (parsePatternCode(code, signKeys.value).isSpecial) {
        addError.value = 'Der Code muss ein "*" enthalten, z.B. *u oder [*ud].';
        return;
    }
    if (index.value.has(code)) {
        addError.value = `"${code}" ist bereits vorhanden.`;
        return;
    }
    library.addManualPattern(code, { label: newLabel.value.trim() });
    expanded.value = new Set([...expanded.value, code]);
    newCode.value = '';
    newLabel.value = '';
}

function removeManual(code) {
    if (!confirm(`Manuell angelegtes Pattern "${code}" entfernen?`)) return;
    library.removeEntry(code);
    const next = new Set(expanded.value);
    next.delete(code);
    expanded.value = next;
}

const newCodePreview = computed(() => {
    const code = getBaseCode(newCode.value.trim());
    if (!code) return null;
    const parsed = parsePatternCode(code, signKeys.value);
    return parsed.isSpecial ? null : parsed;
});

// --- Code variants (project-wide, owned by the settings store) ---
const showVariantEditor = ref(false);
const variantBaseCode = ref('');
const editingVariant = ref(null);

function createVariantFor(code) {
    // A variant is always derived from the unmodified base shape.
    variantBaseCode.value = stripSignKeys(code, signKeys.value) || code;
    editingVariant.value = null;
    showVariantEditor.value = true;
}

/** The code variant entry a code corresponds to, if it is one. */
function variantEntryFor(code) {
    for (const [base, list] of Object.entries(settings.codeVariants || {})) {
        const hit = (list || []).find(v => v.code === code);
        if (hit) return { base, variant: hit };
    }
    return null;
}

function editVariant(code) {
    const found = variantEntryFor(code);
    if (!found) return;
    variantBaseCode.value = found.base;
    editingVariant.value = found.variant;
    showVariantEditor.value = true;
}

function deleteVariant(code) {
    const found = variantEntryFor(code);
    if (!found) return;
    if (!confirm(`Code-Variante "${code}" entfernen?`)) return;
    settings.removeCodeVariant(found.base, found.variant.id);
}

const hasSigns = computed(() => settings.customSigns.length > 0);

// --- Snippet variants (classifier letters offered while annotating) ---
// Only *configured* rows are editable. While nothing is configured the store
// serves the built-in a–g, which must not appear here as if it were saved
// state — otherwise removing a row would do nothing and re-adding one of the
// letters would look like a duplicate.
const snippetVariantRows = computed(() =>
    settings.hasSnippetVariantConfig() ? settings.getSnippetVariants().filter(v => v.key) : []
);

const usesDefaultVariants = computed(() => !settings.hasSnippetVariantConfig());

/** Copy the built-in a–g into the configuration, as a starting point to edit. */
function adoptDefaultVariants() {
    settings.setSnippetVariants(
        settings.getSnippetVariants().filter(v => v.key).map(v => ({ key: v.key, label: v.label }))
    );
}

/** Drop the configuration again, so the built-in a–g apply. */
function resetSnippetVariants() {
    if (!confirm('Konfiguration verwerfen und wieder a–g anbieten?')) return;
    settings.setSnippetVariants([]);
}
const newVariantKey = ref('');
const newVariantLabel = ref('');

function commitSnippetVariants(list) {
    settings.setSnippetVariants(list);
}

function updateSnippetVariant(i, field, value) {
    const list = snippetVariantRows.value.map(v => ({ ...v }));
    list[i][field] = value;
    commitSnippetVariants(list);
}

function removeSnippetVariant(i) {
    const list = snippetVariantRows.value.map(v => ({ ...v }));
    list.splice(i, 1);
    commitSnippetVariants(list);
}

function addSnippetVariant() {
    const key = newVariantKey.value.trim();
    if (!key) return;
    if (snippetVariantRows.value.some(v => v.key === key)) {
        alert(`Variante "${key}" ist bereits konfiguriert.`);
        return;
    }
    commitSnippetVariants([...snippetVariantRows.value.map(v => ({ ...v })),
        { key, label: newVariantLabel.value.trim() || key }]);
    newVariantKey.value = '';
    newVariantLabel.value = '';
}

const stats = computed(() => ({
    total: allCodes.value.length,
    manual: library.manualCodes().length,
    variants: allCodes.value.filter(c => getInfo(c)?.isCodeVariant).length,
    withMei: allCodes.value.filter(c => library.hasMeiTemplate(c)).length
}));
</script>

<template>
<StateWrapper :loading="loading" loadingText="Lade Pattern-Daten...">
<div class="library-view">
    <header class="lib-header">
        <div class="header-main">
            <h2>Pattern-Bibliothek</h2>
            <p class="subtitle">
                Alle Notationsformen dieses Arbeitsbereichs — gesammelt aus Transkriptionsdaten,
                Annotationen und Code-Varianten, ergänzbar um Formen, die nur auf Scans existieren.
            </p>
        </div>
        <div class="header-stats">
            <div class="stat"><strong>{{ stats.total }}</strong><span>Pattern</span></div>
            <div class="stat"><strong>{{ stats.variants }}</strong><span>Varianten</span></div>
            <div class="stat"><strong>{{ stats.manual }}</strong><span>manuell</span></div>
            <div class="stat"><strong>{{ stats.withMei }}</strong><span>mit MEI</span></div>
        </div>
    </header>

    <!-- Sign vocabulary lives in Settings; this is the pointer to it -->
    <section class="card signs-card">
        <div class="signs-row">
            <div class="signs-text">
                <strong>Zeichen-Vokabular</strong>
                <span class="signs-desc">
                    Code-Varianten entstehen aus projektweiten Zeichen, die einzelne Noten markieren
                    (z.B. <span class="code-font">*uudd</span> → <span class="code-font">*uuVdd</span>).
                </span>
            </div>
            <div class="signs-list">
                <span v-for="s in settings.customSigns" :key="s.key" class="sign-chip" :title="s.description">
                    <strong>{{ s.key }}</strong> {{ s.label }}
                </span>
                <span v-if="!hasSigns" class="no-signs">Noch keine Zeichen definiert</span>
            </div>
            <router-link class="btn-link" to="/settings">In den Einstellungen pflegen →</router-link>
        </div>
        <label class="discriminate">
            <input type="checkbox" v-model="settings.discriminateSigns" />
            Code-Varianten in Übersichten und IDs unterscheiden
            <span class="hint">(aus = jede Variante zählt zu ihrem Basis-Pattern)</span>
        </label>
    </section>

    <!-- Snippet variants: the buttons offered while annotating -->
    <section class="card">
        <button type="button" class="card-toggle" @click="showSnippetVariants = !showSnippetVariants">
            <span class="caret" :class="{ open: showSnippetVariants }">▸</span>
            <span>
                <strong>Snippet-Varianten</strong>
                <span class="card-desc">
                    Die Knöpfe beim Annotieren für Formen mit <em>gleichem</em> Code, aber anderer
                    graphischer Ausführung.
                    <template v-if="!settings.hasSnippetVariantConfig()">Derzeit die Vorgabe a–g.</template>
                </span>
            </span>
        </button>

        <div v-if="showSnippetVariants" class="card-body">
            <table class="sv-table">
                <thead>
                    <tr><th class="sv-key">Schlüssel</th><th>Beschriftung</th><th class="sv-actions"></th></tr>
                </thead>
                <tbody>
                    <tr class="base-row">
                        <td class="sv-key"><code>—</code></td>
                        <td>Basis</td>
                        <td class="sv-actions"></td>
                    </tr>
                    <tr v-if="usesDefaultVariants" class="default-row">
                        <td class="sv-key"><code>a–g</code></td>
                        <td>Vorgabe (nicht konfiguriert)</td>
                        <td class="sv-actions">
                            <button type="button" class="btn-sm" @click="adoptDefaultVariants">Übernehmen</button>
                        </td>
                    </tr>
                    <tr v-for="(v, i) in snippetVariantRows" :key="v.key">
                        <td class="sv-key"><code>{{ v.key }}</code></td>
                        <td>
                            <input class="field-input" :value="v.label"
                                   @input="updateSnippetVariant(i, 'label', $event.target.value)" />
                        </td>
                        <td class="sv-actions">
                            <button type="button" class="btn-sm danger" @click="removeSnippetVariant(i)">Entfernen</button>
                        </td>
                    </tr>
                    <tr class="new-row">
                        <td class="sv-key">
                            <input class="field-input mono" v-model="newVariantKey" placeholder="b" @keyup.enter="addSnippetVariant" />
                        </td>
                        <td>
                            <input class="field-input" v-model="newVariantLabel" placeholder="Beschriftung" @keyup.enter="addSnippetVariant" />
                        </td>
                        <td class="sv-actions">
                            <button type="button" class="btn-sm" @click="addSnippetVariant">Hinzufügen</button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <p class="sv-hint">
                Die Schlüssel werden auf den Annotationen gespeichert. Bestehende Annotationen
                behalten ihren Buchstaben, auch wenn er hier nicht (mehr) aufgeführt ist.
                <button v-if="!usesDefaultVariants" type="button" class="btn-link-inline" @click="resetSnippetVariants">
                    Wieder a–g anbieten
                </button>
            </p>
        </div>
    </section>

    <!-- Add a scan-only pattern -->
    <section class="card">
        <div class="add-row">
            <div class="add-fields">
                <input v-model="newCode" class="add-input mono" placeholder="Pattern-Code, z.B. [*ud]" @keyup.enter="addManual" />
                <input v-model="newLabel" class="add-input" placeholder="Beschriftung (optional)" @keyup.enter="addManual" />
                <button type="button" class="btn-primary" @click="addManual">Pattern hinzufügen</button>
            </div>
            <div class="add-preview" v-if="newCodePreview">
                <PatternDisplay :pattern="newCodePreview.code" :glyphs="glyphs" />
                <span class="preview-text">
                    {{ newCodePreview.noteCount }} Note{{ newCodePreview.noteCount === 1 ? '' : 'n' }},
                    {{ newCodePreview.ligature === 'connected' ? 'verbunden'
                        : newCodePreview.ligature === 'partial' ? 'teilweise verbunden' : 'offen' }}
                </span>
            </div>
        </div>
        <div v-if="addError" class="add-error">{{ addError }}</div>
    </section>

    <!-- The hierarchy -->
    <section class="card list-card">
        <div class="list-controls">
            <input v-model="search" class="search-input" placeholder="Suche nach Code, Beschriftung oder Ref-ID..." />
            <label class="check">
                <input type="checkbox" v-model="onlyAnnotated" />
                Nur mit Annotationen
            </label>
            <span class="spacer"></span>
            <span class="shown-count">{{ filteredCodes.length }} von {{ stats.total }}</span>
            <button type="button" class="btn-sm" @click="treeRef?.expandAll()">Alle aufklappen</button>
            <button type="button" class="btn-sm" @click="treeRef?.collapseAll()">Einklappen</button>
        </div>

        <PatternHierarchyTree
            ref="treeRef"
            :codes="filteredCodes"
            :forceOpen="!!search.trim()"
            emptyText="Keine Pattern gefunden."
            v-slot="{ code }"
        >
            <div class="pattern-row" :class="{ open: isExpanded(code) }">
                <div class="row-main" @click="toggleDetail(code)">
                    <span class="row-caret" :class="{ open: isExpanded(code) }">▸</span>

                    <span class="row-glyph">
                        <PatternDisplay :pattern="code" :glyphs="glyphs" />
                    </span>

                    <span class="row-code"><PatternCode :pattern="code" /></span>

                    <span class="row-label" v-if="entryOf(code).label">{{ entryOf(code).label }}</span>

                    <PatternExamples :examples="getInfo(code)?.examples || []" :limit="4" :size="50" />

                    <span class="row-meta">
                        <span v-if="getInfo(code)?.isCodeVariant" class="variant-chip"
                              :title="`Code-Variante von ${getInfo(code).baseCode}`">Variante</span>
                        <span v-if="getInfo(code)?.manual" class="manual-chip"
                              title="Nur in der Bibliothek, nicht in den Transkriptionsdaten">Scan</span>
                        <span v-if="library.hasMeiTemplate(code)" class="mei-chip" title="MEI-Template konfiguriert">MEI</span>
                        <span v-if="refIdFor(code)" class="ref-chip" title="Ref-ID (für den Druckband)">
                            Ref {{ refIdFor(code) }}
                        </span>
                        <span class="count-chip"
                              :title="`${getInfo(code)?.dataCount || 0} Belege in den Transkriptionsdaten, ${getInfo(code)?.annotationCount || 0} Annotationen`">
                            {{ getInfo(code)?.dataCount || 0 }} / {{ getInfo(code)?.annotationCount || 0 }}
                        </span>
                    </span>
                </div>

                <div v-if="isExpanded(code)" class="row-detail">
                    <div class="detail-fields">
                        <label class="field">
                            <span class="field-label">Beschriftung</span>
                            <input
                                class="field-input"
                                :value="entryOf(code).label"
                                placeholder="eigene Bezeichnung dieser Form"
                                @input="onLabel(code, $event.target.value)"
                            />
                        </label>
                        <label class="field field-wide">
                            <span class="field-label">Notizen</span>
                            <input
                                class="field-input"
                                :value="entryOf(code).notes"
                                placeholder="Beobachtungen zu dieser Form..."
                                @input="onNotes(code, $event.target.value)"
                            />
                        </label>
                        <div class="detail-actions">
                            <button v-if="hasSigns && !getInfo(code)?.isCodeVariant"
                                    type="button" class="btn-sm" @click="createVariantFor(code)">+ Variante</button>
                            <template v-if="getInfo(code)?.isCodeVariant">
                                <button type="button" class="btn-sm" @click="editVariant(code)">Variante bearbeiten</button>
                                <button type="button" class="btn-sm danger" @click="deleteVariant(code)">Variante löschen</button>
                            </template>
                            <button v-if="getInfo(code)?.manual"
                                    type="button" class="btn-sm danger" @click="removeManual(code)">Entfernen</button>
                        </div>
                    </div>

                    <div class="detail-sources" v-if="getInfo(code)?.sources?.size">
                        <span class="field-label">Handschriften:</span>
                        <span v-for="s in Array.from(getInfo(code).sources)" :key="s" class="src-chip">{{ s }}</span>
                    </div>

                    <div class="detail-examples" v-if="(getInfo(code)?.examples || []).length">
                        <span class="field-label">Bildbeispiele:</span>
                        <PatternExamples :examples="getInfo(code).examples" :limit="8" :size="76" />
                    </div>

                    <PatternMeiEditor
                        :code="code"
                        :template="library.getMeiTemplate(code, signKeys)"
                        :label="entryOf(code).label"
                        :refId="refIdFor(code)"
                        :signKeys="signKeys"
                        @update:template="tpl => onMei(code, tpl)"
                    />
                </div>
            </div>
        </PatternHierarchyTree>
    </section>

    <VariantEditorModal
        :visible="showVariantEditor"
        :baseCode="variantBaseCode"
        :editing="editingVariant"
        :glyphs="glyphs"
        @close="showVariantEditor = false"
        @saved="showVariantEditor = false"
    />
</div>
</StateWrapper>
</template>

<style scoped>
.library-view {
    max-width: 1280px;
    margin: 0 auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.lib-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.lib-header h2 { margin: 0 0 4px; }
.subtitle { margin: 0; color: var(--color-text-muted); font-size: 0.88rem; max-width: 64ch; line-height: 1.55; }

.header-stats { display: flex; gap: 10px; }
.stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 7px 14px;
    min-width: 62px;
}
.stat strong { font-size: 1.12rem; }
.stat span { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); }

.card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
}

.signs-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.signs-text { display: flex; flex-direction: column; gap: 2px; }
.signs-desc { font-size: 0.78rem; color: var(--color-text-muted); max-width: 48ch; }
.code-font { font-family: monospace; background: var(--color-surface-muted); padding: 0 4px; border-radius: 3px; }
.signs-list { display: flex; gap: 5px; flex-wrap: wrap; flex: 1; }
.sign-chip {
    font-size: 0.75rem;
    background: var(--color-primary-light);
    color: var(--color-primary-dark);
    border-radius: 10px;
    padding: 2px 10px;
}
.sign-chip strong { font-family: monospace; }
.no-signs { font-size: 0.78rem; color: var(--color-text-light); font-style: italic; }
.btn-link { font-size: 0.78rem; color: var(--color-primary); text-decoration: none; white-space: nowrap; }
.btn-link:hover { text-decoration: underline; }
.discriminate { display: flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 0.8rem; color: var(--color-text-muted); }
.discriminate .hint { font-size: 0.74rem; color: var(--color-text-light); }

.card-toggle {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    padding: 0;
    font-size: 0.9rem;
}
.card-desc { display: block; font-size: 0.78rem; color: var(--color-text-muted); font-weight: 400; margin-top: 2px; }
.card-body { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--color-border); }
.caret { display: inline-block; transition: transform 0.15s ease; opacity: 0.6; font-size: 0.8em; padding-top: 2px; }
.caret.open { transform: rotate(90deg); }

.sv-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; max-width: 620px; }
.sv-table th {
    text-align: left; padding: 5px 8px; font-size: 0.68rem; text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--color-text-light); border-bottom: 1px solid var(--color-border);
}
.sv-table td { padding: 5px 8px; border-bottom: 1px solid var(--color-surface-muted); }
.sv-table .base-row { color: var(--color-text-muted); }
.sv-table .new-row td { background: var(--color-surface-muted); }
.sv-table .default-row { color: var(--color-text-muted); font-style: italic; }
.btn-link-inline {
    background: none; border: none; padding: 0; margin-left: 6px;
    color: var(--color-primary); font-size: inherit; cursor: pointer; text-decoration: underline;
}
.sv-key { width: 110px; font-family: monospace; }
.sv-actions { width: 120px; text-align: right; }
.sv-hint { font-size: 0.75rem; color: var(--color-text-muted); margin: 10px 0 0; line-height: 1.55; }

.add-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.add-fields { display: flex; gap: 8px; flex: 1; min-width: 320px; }
.add-input {
    padding: 7px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    flex: 1;
    min-width: 0;
}
.mono { font-family: monospace; }
.btn-primary {
    background: var(--color-primary);
    color: #fff;
    border-color: var(--color-primary-hover);
    white-space: nowrap;
    font-size: 0.85rem;
}
.btn-primary:hover { background: var(--color-primary-hover); }
.add-preview { display: flex; align-items: center; gap: 10px; }
.preview-text { font-size: 0.78rem; color: var(--color-text-muted); }
.add-error { margin-top: 8px; font-size: 0.8rem; color: var(--color-danger); }

.list-card { padding-top: var(--space-3); }
.list-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.search-input {
    flex: 1;
    min-width: 220px;
    padding: 7px 11px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
}
.check { display: flex; align-items: center; gap: 5px; font-size: 0.8rem; color: var(--color-text-muted); white-space: nowrap; }
.spacer { flex: 1; }
.shown-count { font-size: 0.75rem; color: var(--color-text-muted); }
.btn-sm { padding: 4px 10px; font-size: 0.78rem; }
.btn-sm.danger { color: var(--color-danger); border-color: var(--color-danger-muted); }

/* Leaf rows */
.pattern-row {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
}
.pattern-row.open { border-color: var(--color-primary); box-shadow: var(--shadow-sm); }

.row-main { display: flex; align-items: center; gap: 11px; padding: 7px 11px; cursor: pointer; }
.row-main:hover { background: var(--color-surface-muted); }
.row-caret { font-size: 0.7em; opacity: 0.6; transition: transform 0.15s ease; }
.row-caret.open { transform: rotate(90deg); }

.row-glyph { min-width: 44px; display: flex; justify-content: center; }
.row-code :deep(.pattern-code) { font-size: 0.95rem; font-weight: 800; color: var(--color-text); }
.row-label { font-size: 0.85rem; color: var(--color-text-muted); }

.row-meta { margin-left: auto; display: flex; align-items: center; gap: 5px; white-space: nowrap; }
.ref-chip, .manual-chip, .mei-chip, .variant-chip, .count-chip {
    font-size: 0.66rem;
    font-weight: 700;
    border-radius: 10px;
    padding: 2px 8px;
    letter-spacing: 0.03em;
}
.ref-chip { background: var(--color-surface-muted); color: var(--color-text-muted); border: 1px solid var(--color-border); font-family: monospace; }
.manual-chip { background: var(--color-warning-light); color: var(--color-warning-dark); }
.mei-chip { background: var(--color-primary-light); color: var(--color-primary-dark); }
.variant-chip { background: var(--color-primary); color: #fff; }
.count-chip { color: var(--color-text-light); font-family: monospace; font-weight: 600; }

.row-detail { padding: 12px 14px 14px; border-top: 1px solid var(--color-border); background: var(--color-bg); }
.detail-fields { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 150px; }
.field-wide { flex: 2; min-width: 220px; }
.field-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-light); font-weight: 700; }
.field-input {
    padding: 6px 9px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 0.83rem;
    background: var(--color-surface);
}
.detail-actions { display: flex; gap: 6px; }

.detail-sources, .detail-examples { margin-top: 12px; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.src-chip {
    font-size: 0.72rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 2px 9px;
    color: var(--color-text-muted);
}
</style>
