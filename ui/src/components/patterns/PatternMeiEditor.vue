<script setup>
/**
 * Structured editor for a pattern's MEI template.
 *
 * One row per <nc> (neume component) with dropdowns/checkboxes for the common
 * attributes plus free key/value rows for anything else. The generated XML is
 * shown live next to the table. Pitches are not edited here — Monodi Zero adds
 * pname/oct from the position in the staff.
 */
import { ref, computed, watch } from 'vue';
import {
    NC_ATTRIBUTES,
    customAttributeNames,
    normalizeNcTemplate,
    ncTemplateToXml,
    patternToMeiDocument,
    patternXmlId
} from '../../utils/meiTemplate';

const props = defineProps({
    code: { type: String, required: true },
    template: { type: Array, default: () => [] },
    label: { type: String, default: '' },
    refId: { type: String, default: '' },
    // Project sign keys, so a sign letter is not counted as a note
    signKeys: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:template']);

const rows = computed(() => normalizeNcTemplate(props.code, props.template, props.signKeys));

function setAttr(index, attrName, value) {
    const next = rows.value.map(nc => ({ ...nc }));
    if (value === '' || value === false || value === null || value === undefined) {
        delete next[index][attrName];
    } else {
        next[index][attrName] = value;
    }
    emit('update:template', next);
}

function clearRow(index) {
    const next = rows.value.map((nc, i) => (i === index ? {} : { ...nc }));
    emit('update:template', next);
}

function clearAll() {
    emit('update:template', rows.value.map(() => ({})));
}

/** Copy one nc's attributes to every following nc — handy for uniform tilts. */
function applyToAll(index) {
    const source = { ...rows.value[index] };
    emit('update:template', rows.value.map(() => ({ ...source })));
}

// --- Custom attributes ---
const newAttrName = ref({});
const newAttrValue = ref({});

function customEntries(index) {
    const nc = rows.value[index] || {};
    return customAttributeNames(nc).map(k => ({ name: k, value: nc[k] }));
}

function addCustomAttr(index) {
    const name = (newAttrName.value[index] || '').trim();
    if (!name) return;
    const value = (newAttrValue.value[index] || '').trim();
    setAttr(index, name, value || 'true');
    newAttrName.value = { ...newAttrName.value, [index]: '' };
    newAttrValue.value = { ...newAttrValue.value, [index]: '' };
}

function removeCustomAttr(index, name) {
    setAttr(index, name, '');
}

// --- XML preview & output ---
const xml = computed(() => ncTemplateToXml(rows.value, { xmlId: patternXmlId(props.code) }));

const copyState = ref('');
async function copyXml() {
    try {
        await navigator.clipboard.writeText(xml.value);
        copyState.value = 'Kopiert!';
    } catch (e) {
        copyState.value = 'Kopieren fehlgeschlagen';
    }
    setTimeout(() => (copyState.value = ''), 1800);
}

function downloadXml() {
    const doc = patternToMeiDocument(props.code, rows.value, { name: props.label, refId: props.refId });
    const blob = new Blob([doc], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${patternXmlId(props.code)}.xml`;
    a.click();
    URL.revokeObjectURL(url);
}
</script>

<template>
<div class="mei-editor">
    <div class="mei-grid">
        <!-- Structured nc table -->
        <div class="nc-panel">
            <div class="panel-head">
                <h5>Neume Components ({{ rows.length }} <code>&lt;nc&gt;</code>)</h5>
                <button type="button" class="btn-xs" @click="clearAll">Alle leeren</button>
            </div>

            <div v-if="rows.length === 0" class="nc-empty">
                Dieser Code beschreibt keine Tonfolge — kein MEI-Template möglich.
            </div>

            <table v-else class="nc-table">
                <thead>
                    <tr>
                        <th class="col-idx">#</th>
                        <th v-for="attr in NC_ATTRIBUTES" :key="attr.name" :title="attr.title">
                            {{ attr.label }}
                        </th>
                        <th class="col-actions"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(nc, i) in rows" :key="i">
                        <td class="col-idx">{{ i + 1 }}</td>
                        <td v-for="attr in NC_ATTRIBUTES" :key="attr.name">
                            <select
                                v-if="attr.type === 'select'"
                                class="nc-select"
                                :value="nc[attr.name] || ''"
                                @change="setAttr(i, attr.name, $event.target.value)"
                            >
                                <option v-for="opt in attr.options" :key="opt.value" :value="opt.value">
                                    {{ opt.label }}
                                </option>
                            </select>
                            <input
                                v-else
                                type="checkbox"
                                :checked="nc[attr.name] === true || nc[attr.name] === 'true'"
                                @change="setAttr(i, attr.name, $event.target.checked ? 'true' : '')"
                            />
                        </td>
                        <td class="col-actions">
                            <button type="button" class="btn-xs" title="Diese Attribute auf alle nc übertragen" @click="applyToAll(i)">↓ alle</button>
                            <button type="button" class="btn-xs" title="Zeile leeren" @click="clearRow(i)">×</button>
                        </td>
                    </tr>
                </tbody>
            </table>

            <!-- Custom attributes per nc -->
            <div v-if="rows.length" class="custom-section">
                <h6>Eigene Attribute</h6>
                <div v-for="(nc, i) in rows" :key="'c' + i" class="custom-row">
                    <span class="custom-idx">nc {{ i + 1 }}</span>
                    <span v-for="ce in customEntries(i)" :key="ce.name" class="custom-chip">
                        {{ ce.name }}="{{ ce.value }}"
                        <button type="button" class="chip-x" @click="removeCustomAttr(i, ce.name)">×</button>
                    </span>
                    <input
                        class="custom-input"
                        placeholder="Attribut"
                        :value="newAttrName[i] || ''"
                        @input="newAttrName = { ...newAttrName, [i]: $event.target.value }"
                        @keyup.enter="addCustomAttr(i)"
                    />
                    <input
                        class="custom-input"
                        placeholder="Wert"
                        :value="newAttrValue[i] || ''"
                        @input="newAttrValue = { ...newAttrValue, [i]: $event.target.value }"
                        @keyup.enter="addCustomAttr(i)"
                    />
                    <button type="button" class="btn-xs" @click="addCustomAttr(i)">+</button>
                </div>
            </div>
        </div>

        <!-- Live XML preview -->
        <div class="xml-panel">
            <div class="panel-head">
                <h5>MEI-Vorschau</h5>
                <div class="xml-actions">
                    <span v-if="copyState" class="copy-state">{{ copyState }}</span>
                    <button type="button" class="btn-xs" @click="copyXml">Kopieren</button>
                    <button type="button" class="btn-xs" @click="downloadXml">.xml laden</button>
                </div>
            </div>
            <pre class="xml-preview">{{ xml }}</pre>
            <p class="xml-hint">
                Tonhöhen (<code>pname</code>, <code>oct</code>) ergänzt Monodi Zero anhand der Position im System.
            </p>
        </div>
    </div>
</div>
</template>

<style scoped>
.mei-editor { margin-top: 10px; }
.mei-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; }
@media (max-width: 1100px) { .mei-grid { grid-template-columns: 1fr; } }

.nc-panel, .xml-panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    min-width: 0;
}

.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.panel-head h5 { margin: 0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); }
.panel-head code { font-size: 0.85em; }

.nc-empty { font-size: 0.85rem; color: var(--color-text-muted); padding: 10px 0; }

.nc-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.nc-table th {
    text-align: left;
    padding: 4px 6px;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-light);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
}
.nc-table td { padding: 4px 6px; border-bottom: 1px solid var(--color-surface-muted); }
.col-idx { width: 28px; color: var(--color-text-muted); font-family: monospace; font-weight: 700; }
.col-actions { white-space: nowrap; text-align: right; }

.nc-select {
    width: 100%;
    min-width: 72px;
    padding: 3px 5px;
    font-size: 0.78rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    cursor: pointer;
}

.btn-xs {
    padding: 2px 7px;
    font-size: 0.72rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    cursor: pointer;
    margin-left: 3px;
}

.custom-section { margin-top: 12px; border-top: 1px dashed var(--color-border); padding-top: 8px; }
.custom-section h6 { margin: 0 0 6px; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-light); }
.custom-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-bottom: 5px; }
.custom-idx { font-family: monospace; font-size: 0.72rem; color: var(--color-text-muted); min-width: 34px; }
.custom-chip {
    font-family: monospace;
    font-size: 0.72rem;
    background: var(--color-primary-light);
    color: var(--color-primary-dark);
    border-radius: 10px;
    padding: 1px 4px 1px 8px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
}
.chip-x { border: none; background: transparent; cursor: pointer; padding: 0 3px; color: inherit; font-size: 0.9em; }
.custom-input {
    width: 82px;
    padding: 2px 6px;
    font-size: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
}

.xml-actions { display: flex; align-items: center; gap: 4px; }
.copy-state { font-size: 0.7rem; color: var(--color-success); font-weight: 600; }
.xml-preview {
    margin: 0;
    padding: 10px;
    background: var(--color-nav-bg);
    color: #e2e8f0;
    border-radius: var(--radius-sm);
    font-size: 0.76rem;
    line-height: 1.5;
    overflow-x: auto;
    white-space: pre;
}
.xml-hint { font-size: 0.72rem; color: var(--color-text-muted); margin: 8px 0 0; }
.xml-hint code { font-size: 0.95em; }
</style>
