<script setup>
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { validateSignKey } from '../../utils/signs';
import SvgPattern from '../../components/SvgPattern.vue';
import VariantEditorModal from '../../components/VariantEditorModal.vue';

const store = useSettingsStore();
const { glyphs } = useTranscriptionData();
const glyphOptions = computed(() => Object.keys(glyphs.value || {}));

const newSign = ref({ key: '', label: '', abbrev: '', description: '', glyph: 'note', glyphSvg: '' });
const signError = ref('');

function addSign() {
    const key = newSign.value.key.trim().toUpperCase();
    const err = validateSignKey(key, store.customSigns.map(s => s.key));
    if (err) { signError.value = err; return; }
    if (!newSign.value.label.trim()) { signError.value = 'A label is required.'; return; }
    store.addCustomSign({
        key,
        label: newSign.value.label.trim(),
        abbrev: newSign.value.abbrev.trim() || key,
        description: newSign.value.description.trim(),
        glyph: newSign.value.glyph || '',
        glyphSvg: newSign.value.glyphSvg.trim()
    });
    newSign.value = { key: '', label: '', abbrev: '', description: '', glyph: 'note', glyphSvg: '' };
    signError.value = '';
}

async function onSignSvgFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    newSign.value.glyphSvg = await file.text();
    e.target.value = null;
}

// Flat list of all defined code variants for review/removal.
const allCodeVariants = computed(() => {
    const out = [];
    for (const [base, list] of Object.entries(store.codeVariants || {})) {
        for (const v of list) out.push({ base, ...v });
    }
    return out;
});

// Variant editor, reachable from Settings for any pattern (no region needed).
const newVariantBase = ref('');
const showVariantEditor = ref(false);
const variantBaseCode = ref('');
const editingVariant = ref(null);

function openVariantEditorFor(base) {
    const b = (base || '').trim();
    if (!b) return;
    variantBaseCode.value = b;
    editingVariant.value = null;
    showVariantEditor.value = true;
    newVariantBase.value = '';
}

function editVariantFromSettings(v) {
    variantBaseCode.value = v.base;
    editingVariant.value = v;
    showVariantEditor.value = true;
}
</script>

<template>
    <div class="card section settings-card">
            <h2>Custom Signs &amp; Code Variants</h2>
            <p class="desc">Define project-wide special signs (e.g. a <em>virga</em>) that can be applied to
                individual notes to create <strong>code variants</strong> of a pattern — variants that change the
                code itself, e.g. <span class="code-font">*uudd</span> &rarr; <span class="code-font">*uuVdd</span>.
                Each sign is a single uppercase letter used as a per-note suffix (like the built-in O/Q/S/L signs).
                Create variants by clicking <span class="code-font">+var</span> on a pattern in the Polygon editor.</p>

            <div class="sign-form">
                <div class="sign-form-row">
                    <div class="ff">
                        <label>Key (A–Z)</label>
                        <input v-model="newSign.key" maxlength="1" placeholder="V" class="key-input" />
                    </div>
                    <div class="ff">
                        <label>Label</label>
                        <input v-model="newSign.label" placeholder="Virga" />
                    </div>
                    <div class="ff">
                        <label>Abbrev.</label>
                        <input v-model="newSign.abbrev" maxlength="3" placeholder="v" />
                    </div>
                    <div class="ff">
                        <label>Built-in glyph</label>
                        <select v-model="newSign.glyph">
                            <option value="">(none)</option>
                            <option v-for="g in glyphOptions" :key="g" :value="g">{{ g }}</option>
                        </select>
                    </div>
                </div>
                <div class="sign-form-row">
                    <div class="ff grow">
                        <label>Description</label>
                        <input v-model="newSign.description" placeholder="Shown as a virga (vertical stroke) instead of a punctum" />
                    </div>
                </div>
                <div class="sign-form-row">
                    <div class="ff grow">
                        <label>Custom glyph SVG (optional — overrides the built-in glyph)</label>
                        <textarea v-model="newSign.glyphSvg" rows="2" placeholder="Paste &lt;svg&gt;…&lt;/svg&gt; here, or upload a file"></textarea>
                        <input type="file" accept=".svg,image/svg+xml" @change="onSignSvgFile" class="svg-file" />
                    </div>
                    <div class="ff preview-ff" v-if="newSign.key">
                        <label>Preview</label>
                        <div class="sign-preview">
                            <SvgPattern :pattern="'*u' + newSign.key.toUpperCase() + 'd'" :glyphs="glyphs" />
                        </div>
                    </div>
                </div>
                <div class="sign-form-actions">
                    <span v-if="signError" class="sign-error">{{ signError }}</span>
                    <button @click="addSign" :disabled="!newSign.key || !newSign.label">Add Sign</button>
                </div>
            </div>

            <div class="ids-list">
                <table v-if="store.customSigns.length > 0">
                    <thead>
                        <tr><th>Key</th><th>Label</th><th>Description</th><th>Glyph</th><th>Sample</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="s in store.customSigns" :key="s.key">
                            <td class="code-font"><strong>{{ s.key }}</strong></td>
                            <td>{{ s.label }}</td>
                            <td class="text-sm-light">{{ s.description }}</td>
                            <td>{{ s.glyphSvg ? 'custom SVG' : (s.glyph || '—') }}</td>
                            <td><SvgPattern :pattern="'*u' + s.key + 'd'" :glyphs="glyphs" /></td>
                            <td><button @click="store.removeCustomSign(s.key)" class="btn-sm btn-danger">Remove</button></td>
                        </tr>
                    </tbody>
                </table>
                <div v-else class="empty">No custom signs defined</div>
            </div>

            <label class="discriminate-toggle">
                <input type="checkbox" v-model="store.discriminateSigns" />
                Discriminate code variants in overviews &amp; IDs
                <span class="text-sm-light">(off = merge each variant back into its base pattern)</span>
            </label>

            <div class="variants-review">
                <h3 class="mt-0">Code Variants ({{ allCodeVariants.length }})</h3>
                <p class="desc">
                    Create a variant here for any pattern, or click <strong>+ Variant</strong> next to a pattern
                    in <router-link to="/polygons">Manuscripts</router-link> (after opening a line region).
                </p>

                <div class="add-row" v-if="store.customSigns.length > 0">
                    <input v-model="newVariantBase" placeholder="Base pattern (e.g. *uudd)" />
                    <button @click="openVariantEditorFor(newVariantBase)" :disabled="!newVariantBase.trim()">
                        Create Variant…
                    </button>
                </div>
                <div v-else class="empty">Define at least one custom sign above to create code variants.</div>

                <table v-if="allCodeVariants.length > 0">
                    <thead>
                        <tr><th>Base</th><th>Variant</th><th>Variant code</th><th>Label</th><th>Description</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="v in allCodeVariants" :key="v.base + v.id">
                            <td class="code-font">{{ v.base }}</td>
                            <td><SvgPattern :pattern="v.code" :glyphs="glyphs" /></td>
                            <td class="code-font"><strong>{{ v.code }}</strong></td>
                            <td>{{ v.label }}</td>
                            <td class="text-sm-light">{{ v.description }}</td>
                            <td>
                                <button @click="editVariantFromSettings(v)" class="btn-sm btn-secondary">Edit</button>
                                <button @click="store.removeCodeVariant(v.base, v.id)" class="btn-sm btn-danger">Remove</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div v-else-if="store.customSigns.length > 0" class="empty">No code variants defined yet</div>
            </div>
        </div>

    <VariantEditorModal
        :visible="showVariantEditor"
        :baseCode="variantBaseCode"
        :editing="editingVariant"
        :glyphs="glyphs"
        @close="showVariantEditor = false"
    />
</template>

<style scoped>
.sign-form { border: 1px solid var(--color-border); border-radius: 8px; padding: 14px; margin-bottom: 16px; background: var(--color-bg); }
.sign-form-row { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-end; }
.ff { display: flex; flex-direction: column; gap: 4px; }
.ff.grow { flex: 1; }
.ff label { font-size: 11px; font-weight: 600; color: var(--color-text-muted); }
.ff input, .ff select, .ff textarea { padding: 6px 9px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; font-family: inherit; box-sizing: border-box; }
.key-input { width: 56px; text-transform: uppercase; text-align: center; font-weight: 700; }
.svg-file { margin-top: 6px; font-size: 11px; }
.preview-ff { align-items: center; }
.sign-preview { background: white; border: 1px solid var(--color-border); border-radius: 6px; padding: 4px 10px; min-width: 60px; display: flex; justify-content: center; }
.sign-form-actions { display: flex; align-items: center; gap: 12px; justify-content: flex-end; }
.discriminate-toggle { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
.discriminate-toggle input { width: auto; }
.variants-review { margin-top: 20px; }
</style>
