<script setup>
import { ref, computed, watch } from 'vue';
import { useSettingsStore } from '../stores/settings';
import SvgPattern from './SvgPattern.vue';
import PatternDisplay from './PatternDisplay.vue';

const props = defineProps({
    visible: { type: Boolean, default: false },
    baseCode: { type: String, default: '' },
    glyphs: { type: Object, required: true },
    // Optional: an existing variant to edit { id, code, label, description }
    editing: { type: Object, default: null }
});

const emit = defineEmits(['close', 'saved']);

const settings = useSettingsStore();

const signKeys = computed(() => settings.customSigns.map(s => s.key));

const description = ref('');
const label = ref('');

// notes: [{ type:'br', ch } | { type:'note', move, suffix, sign }]
const notes = ref([]);

function tokenize(code) {
    const out = [];
    let i = 0;
    const keys = signKeys.value;
    while (i < code.length) {
        const c = code[i];
        if ('[]{}'.includes(c)) { out.push({ type: 'br', ch: c }); i++; continue; }
        const move = c; i++;
        let suffix = '', sign = '';
        while (i < code.length && /[A-Z]/.test(code[i])) {
            if (keys.includes(code[i])) sign += code[i];
            else suffix += code[i];
            i++;
        }
        out.push({ type: 'note', move, suffix, sign });
    }
    return out;
}

function rebuild(list) {
    return list.map(t => t.type === 'br' ? t.ch : (t.move + (t.suffix || '') + (t.sign || ''))).join('');
}

watch(() => [props.visible, props.baseCode, props.editing], () => {
    if (!props.visible) return;
    const source = props.editing?.code || props.baseCode || '';
    notes.value = tokenize(source);
    description.value = props.editing?.description || '';
    label.value = props.editing?.label || '';
}, { immediate: true });

const noteItems = computed(() => notes.value.filter(t => t.type === 'note'));

const previewCode = computed(() => rebuild(notes.value));

const isValid = computed(() =>
    previewCode.value && previewCode.value !== props.baseCode && settings.customSigns.length > 0
);

function setSign(noteRef, key) {
    // Toggle: clicking the active sign clears it.
    noteRef.sign = (noteRef.sign === key) ? '' : key;
    notes.value = [...notes.value]; // trigger reactivity
}

function moveLabel(move) {
    if (move === '*') return 'start';
    if (move === 'u') return 'up';
    if (move === 'd') return 'down';
    if (move === 'e') return 'equal';
    return move;
}

function save() {
    if (!isValid.value) return;
    const variant = {
        id: props.editing?.id || `cv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        code: previewCode.value,
        label: label.value.trim(),
        description: description.value.trim()
    };
    if (props.editing) {
        settings.updateCodeVariant(props.baseCode, variant.id, variant);
    } else {
        settings.addCodeVariant(props.baseCode, variant);
    }
    emit('saved', variant);
    emit('close');
}
</script>

<template>
<div v-if="visible" class="modal" @click.self="$emit('close')">
    <div class="modal-content variant-modal">
        <div class="modal-header">
            <h3 class="m-0">{{ editing ? 'Edit' : 'Create' }} code variant of <code>{{ baseCode }}</code></h3>
            <span class="close" @click="$emit('close')">&times;</span>
        </div>

        <div class="variant-body">
            <div v-if="settings.customSigns.length === 0" class="no-signs">
                <p class="m-0">No custom signs defined yet. A code variant marks a note with a
                    project-defined sign (e.g. a <em>virga</em>), so you need at least one sign first.</p>
                <router-link to="/settings" class="btn-primary go-settings" @click="$emit('close')">
                    Define signs in Settings →
                </router-link>
            </div>

            <template v-else>
                <p class="hint">Apply a sign to any note. The sign changes the code itself
                    (e.g. <code>*uudd</code> → <code>*uuVdd</code>).</p>

                <div class="notes-grid">
                    <div v-for="(t, idx) in noteItems" :key="idx" class="note-cell">
                        <div class="note-pos">{{ idx + 1 }}. {{ moveLabel(t.move) }}</div>
                        <div class="sign-buttons">
                            <button class="btn-xs" :class="{ active: !t.sign }" @click="setSign(t, '')">·</button>
                            <button v-for="s in settings.customSigns" :key="s.key"
                                    class="btn-xs"
                                    :class="{ active: t.sign === s.key }"
                                    :title="s.label + (s.description ? ' — ' + s.description : '')"
                                    @click="setSign(t, s.key)">
                                {{ s.abbrev || s.key }}
                            </button>
                        </div>
                    </div>
                </div>

                <div class="preview-row">
                    <div class="preview-box">
                        <div class="preview-label">Base</div>
                        <PatternDisplay :pattern="baseCode" :glyphs="glyphs" />
                        <code>{{ baseCode }}</code>
                    </div>
                    <div class="preview-arrow">→</div>
                    <div class="preview-box" :class="{ changed: previewCode !== baseCode }">
                        <div class="preview-label">Variant</div>
                        <SvgPattern :pattern="previewCode" :glyphs="glyphs" />
                        <code>{{ previewCode }}</code>
                    </div>
                </div>

                <div class="field">
                    <label>Short label (optional)</label>
                    <input v-model="label" placeholder="e.g. virga form" />
                </div>
                <div class="field">
                    <label>Description</label>
                    <textarea v-model="description" rows="2"
                              placeholder="What distinguishes this variant?"></textarea>
                </div>
            </template>
        </div>

        <div class="modal-footer">
            <button class="btn-secondary" @click="$emit('close')">Cancel</button>
            <button class="btn-primary" :disabled="!isValid" @click="save">
                {{ editing ? 'Save changes' : 'Create variant' }}
            </button>
        </div>
    </div>
</div>
</template>

<style scoped>
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1100; }
.modal-content { background: white; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
.variant-modal { width: 560px; max-width: 95vw; max-height: 90vh; }
.modal-header { padding: 15px 20px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; background: var(--color-surface); }
.m-0 { margin: 0; font-size: 1.05em; }
.close { font-size: 24px; cursor: pointer; color: var(--color-text-muted); line-height: 1; }
.close:hover { color: var(--color-text); }
.variant-body { padding: 18px 20px; overflow-y: auto; }
.hint { font-size: 13px; color: var(--color-text-muted); margin-top: 0; }
.no-signs { padding: 14px; background: var(--color-warning-light); border-radius: 6px; color: var(--color-warning-dark); font-size: 13px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
.no-signs .m-0 { margin: 0; line-height: 1.5; }
.go-settings { text-decoration: none; display: inline-block; }

.notes-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0; }
.note-cell { border: 1px solid var(--color-border); border-radius: 6px; padding: 8px; min-width: 84px; }
.note-pos { font-size: 11px; color: var(--color-text-muted); margin-bottom: 6px; text-align: center; }
.sign-buttons { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
.btn-xs { padding: 3px 7px; font-size: 12px; border: 1px solid var(--color-border-hover); background: white; border-radius: 4px; cursor: pointer; min-width: 24px; }
.btn-xs.active { background: var(--color-primary); color: white; border-color: var(--color-primary-hover); }

.preview-row { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 18px 0; padding: 14px; background: var(--color-bg); border-radius: 8px; }
.preview-box { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 14px; border-radius: 6px; }
.preview-box.changed { background: var(--color-primary-light); }
.preview-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); }
.preview-box code { font-size: 12px; }
.preview-arrow { font-size: 20px; color: var(--color-text-muted); }

.field { margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 12px; font-weight: 600; color: var(--color-text-muted); }
.field input, .field textarea { padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; box-sizing: border-box; width: 100%; font-family: inherit; }

.modal-footer { padding: 14px 20px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 10px; background: var(--color-surface); }
.btn-primary { background: var(--color-primary); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border-hover); padding: 8px 14px; border-radius: 6px; cursor: pointer; }
code { font-family: monospace; background: var(--color-surface-muted); padding: 1px 5px; border-radius: 3px; }
</style>
