import { defineStore } from 'pinia'
import { ref } from 'vue'
import { isPlainObject } from '../utils/shape'

/**
 * Every setting that persists, in one table.
 *
 * Loading from browser storage, the workspace file, backups and configuration
 * exports all iterate this table, so adding a setting is a one-line change and
 * cannot be forgotten in one of the places (a setting added to the store but not
 * to a hand-written field list used to silently drop out of backups).
 *
 *   default  value for a fresh workspace (a function for objects/arrays, so each
 *            store instance gets its own copy)
 *   share    false keeps it out of exported backups and configuration files
 *            (it is still kept in browser storage and the workspace file)
 *
 * The comments describe each value's shape.
 */
export const PERSISTED_SETTINGS = {
    // 'svg' | 'arrow' | 'text'
    displayMode: { default: 'svg' },
    autoFillIds: { default: true },
    // { [pattern]: "customId" }
    globalDisplayIds: { default: () => ({}) },
    snippetSize: { default: 60 },
    snippetPadding: { default: 0.3 },
    backupLabel: { default: 'My Backup', share: false },
    // { [source]: { iiifType, dataType, offset, pins, … } }
    sourceAlignments: { default: () => ({}) },
    // The reusable sign vocabulary: [{ key, label, abbrev, description, glyph, glyphSvg }]
    customSigns: { default: () => [] },
    // Per base pattern, its derived variant codes: { [baseCode]: [{ id, code, label, description }] }
    codeVariants: { default: () => ({}) },
    // When true, overviews/IDs treat a code variant as distinct; when false they
    // are merged back into their base pattern ("all in one").
    discriminateSigns: { default: true },
    // Project-defined free-text attributes of a source (century, region, …) used
    // for filtering in the public views: [{ key, label, description, type }]
    sourceMetaFields: { default: () => [] },
    // { [source]: { [fieldKey]: "value" } }
    sourceMeta: { default: () => ({}) },
    // The classifier letters offered when annotating a snippet (same code,
    // different graphical realisation); empty = the built-in a–g: [{ key, label }]
    snippetVariants: { default: () => [] }
};

const specDefault = spec => (typeof spec.default === 'function' ? spec.default() : spec.default);

/**
 * The value if it fits the shape of the setting's default, otherwise undefined.
 * A wrong container type is rejected instead of being assigned into the store;
 * numeric strings are accepted for numeric settings (older builds bound range
 * inputs without `.number`).
 */
function coerceSetting(spec, value) {
    const sample = specDefault(spec);
    if (Array.isArray(sample)) return Array.isArray(value) ? value : undefined;
    if (isPlainObject(sample)) return isPlainObject(value) ? value : undefined;
    if (typeof sample === 'boolean') return typeof value === 'boolean' ? value : undefined;
    if (typeof sample === 'number') {
        const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
        return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
    }
    if (typeof sample === 'string') return typeof value === 'string' ? value : undefined;
    return undefined;
}

export const useSettingsStore = defineStore('settings', () => {
    // State: one ref per entry of PERSISTED_SETTINGS
    const state = {}
    for (const [key, spec] of Object.entries(PERSISTED_SETTINGS)) {
        state[key] = ref(specDefault(spec))
    }

    /**
     * The persisted settings as a plain object.
     * @param {{ shared?: boolean }} [options] `shared` leaves out settings that
     *   should not travel in exported backups and configuration files.
     */
    function serialize({ shared = false } = {}) {
        const out = {}
        for (const [key, spec] of Object.entries(PERSISTED_SETTINGS)) {
            if (shared && spec.share === false) continue
            out[key] = state[key].value
        }
        return out
    }

    /**
     * Apply a settings object. Keys that are absent, or whose value has the wrong
     * shape, keep their current value, so an old or partial payload cannot wipe a
     * setting it never mentioned.
     */
    function hydrate(payload, { shared = false } = {}) {
        if (!isPlainObject(payload)) return
        for (const [key, spec] of Object.entries(PERSISTED_SETTINGS)) {
            if (shared && spec.share === false) continue
            if (!(key in payload)) continue
            const value = coerceSetting(spec, payload[key])
            if (value !== undefined) state[key].value = value
        }
    }

    /** Back to the defaults of a fresh workspace. */
    function reset() {
        for (const [key, spec] of Object.entries(PERSISTED_SETTINGS)) {
            state[key].value = specDefault(spec)
        }
    }

    // The refs the actions below work on
    const {
        globalDisplayIds, sourceAlignments, customSigns, codeVariants,
        sourceMetaFields, sourceMeta, snippetVariants
    } = state

    // Actions
    function setGlobalId(pattern, id) {
        // Force reactivity update
        globalDisplayIds.value = { ...globalDisplayIds.value, [pattern]: id }
    }

    function removeGlobalId(pattern) {
        const next = { ...globalDisplayIds.value }
        delete next[pattern]
        globalDisplayIds.value = next
    }

    function getGlobalId(pattern) {
        return globalDisplayIds.value[pattern] || ''
    }




    // --- Custom signs (code-variant vocabulary) ---
    function addCustomSign(sign) {
        customSigns.value = [...customSigns.value, sign]
    }
    function updateCustomSign(key, patch) {
        customSigns.value = customSigns.value.map(s => s.key === key ? { ...s, ...patch } : s)
    }
    function removeCustomSign(key) {
        customSigns.value = customSigns.value.filter(s => s.key !== key)
    }

    // --- Code variants (per base pattern) ---
    function getCodeVariants(base) {
        return codeVariants.value[base] || []
    }
    function addCodeVariant(base, variant) {
        const list = codeVariants.value[base] || []
        codeVariants.value = { ...codeVariants.value, [base]: [...list, variant] }
    }
    function updateCodeVariant(base, id, patch) {
        const list = (codeVariants.value[base] || []).map(v => v.id === id ? { ...v, ...patch } : v)
        codeVariants.value = { ...codeVariants.value, [base]: list }
    }
    function removeCodeVariant(base, id) {
        const list = (codeVariants.value[base] || []).filter(v => v.id !== id)
        const next = { ...codeVariants.value }
        if (list.length) next[base] = list
        else delete next[base]
        codeVariants.value = next
    }

    // --- Source metadata ---
    function slugifyFieldKey(label) {
        return String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    }

    function addSourceMetaField(label, description = '', type = 'text') {
        const clean = String(label).trim()
        if (!clean) return null
        const key = slugifyFieldKey(clean)
        if (!key || sourceMetaFields.value.some(f => f.key === key)) return null
        const field = { key, label: clean, description: String(description).trim(), type: type || 'text' }
        sourceMetaFields.value = [...sourceMetaFields.value, field]
        return field
    }

    function updateSourceMetaField(key, patch) {
        sourceMetaFields.value = sourceMetaFields.value.map(f => f.key === key ? { ...f, ...patch } : f)
    }

    function removeSourceMetaField(key) {
        sourceMetaFields.value = sourceMetaFields.value.filter(f => f.key !== key)
        // Drop the now-orphaned values so they don't linger in exports.
        const next = {}
        for (const [src, vals] of Object.entries(sourceMeta.value)) {
            const { [key]: _drop, ...rest } = vals
            if (Object.keys(rest).length) next[src] = rest
        }
        sourceMeta.value = next
    }

    function setSourceMetaValue(source, key, value) {
        const cur = sourceMeta.value[source] || {}
        const val = String(value ?? '')
        const nextForSource = { ...cur }
        if (val.trim()) nextForSource[key] = val
        else delete nextForSource[key]

        const next = { ...sourceMeta.value }
        if (Object.keys(nextForSource).length) next[source] = nextForSource
        else delete next[source]
        sourceMeta.value = next
    }

    function getSourceMeta(source) {
        return sourceMeta.value[source] || {}
    }

    function getSourceMetaValue(source, key) {
        return (sourceMeta.value[source] || {})[key] || ''
    }

    /** Distinct non-empty values recorded for a field, for filter dropdowns. */
    function sourceMetaValuesFor(key) {
        const set = new Set()
        for (const vals of Object.values(sourceMeta.value)) {
            const v = (vals || {})[key]
            if (v && String(v).trim()) set.add(String(v).trim())
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    }

    // --- Snippet variants (classifier letters) ---
    const DEFAULT_SNIPPET_VARIANTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

    /**
     * The variant buttons to offer when annotating, always led by the base entry.
     * Falls back to the built-in letters so existing workspaces keep the choices
     * their annotations already use.
     *
     * `currentKey` is the value already stored on the annotation being edited. A
     * key that is no longer configured is appended and flagged `legacy`, so an
     * older classification stays visible and cannot be lost by accident.
     */
    function getSnippetVariants(currentKey = '') {
        const base = { key: '', label: 'Basis' }
        const configured = snippetVariants.value.filter(v => v && v.key)

        const list = configured.length === 0
            ? DEFAULT_SNIPPET_VARIANTS.map(k => ({ key: k, label: k }))
            : configured.map(v => ({ key: String(v.key), label: v.label || String(v.key) }))

        const key = currentKey ? String(currentKey) : ''
        if (key && !list.some(v => v.key === key)) {
            list.push({ key, label: key, legacy: true })
        }
        return [base, ...list]
    }

    function hasSnippetVariantConfig() {
        return snippetVariants.value.some(v => v && v.key)
    }

    function setSnippetVariants(list) {
        snippetVariants.value = (list || [])
            .filter(v => v && v.key)
            .map(v => ({ key: String(v.key).trim(), label: (v.label || '').trim() || String(v.key).trim() }))
    }

    function setSourceAlignment(source, config) {
        sourceAlignments.value = { ...sourceAlignments.value, [source]: config }
    }

    function removeSourceAlignment(source) {
        const next = { ...sourceAlignments.value }
        delete next[source]
        sourceAlignments.value = next
    }

    function alignmentFor(source) {
        return sourceAlignments.value[source] || null
    }

    function mergeAlignment(source, patch) {
        const current = sourceAlignments.value[source] || {}
        sourceAlignments.value = { ...sourceAlignments.value, [source]: { ...current, ...patch } }
    }

    /**
     * A manual pin fixes one canvas to one data folio, keyed by the canvas's
     * position in the manifest. The alignment engine treats every pin both as
     * that canvas's resolved folio AND as a resync point for the running count
     * it applies to every page after it — so fixing one drifted page fixes
     * every page that follows, not just that one.
     *
     * An empty-string folio pins the canvas to "not a page", for the rare
     * stray scan (a color chart, a ruler) that carries a digit but should be
     * skipped like a structural divider rather than counted.
     */
    function setAlignmentPin(source, canvasIndex, dataFolio) {
        const current = sourceAlignments.value[source] || {}
        const pins = { ...(current.pins || {}) }
        if (dataFolio || dataFolio === '') pins[canvasIndex] = dataFolio
        else delete pins[canvasIndex]
        mergeAlignment(source, { pins })
    }

    function removeAlignmentPin(source, canvasIndex) {
        const current = sourceAlignments.value[source] || {}
        const pins = { ...(current.pins || {}) }
        delete pins[canvasIndex]
        mergeAlignment(source, { pins })
    }

    return {
        ...state,
        serialize,
        hydrate,
        reset,
        getSnippetVariants,
        hasSnippetVariantConfig,
        setSnippetVariants,
        addSourceMetaField,
        updateSourceMetaField,
        removeSourceMetaField,
        setSourceMetaValue,
        getSourceMeta,
        getSourceMetaValue,
        sourceMetaValuesFor,
        addCustomSign,
        updateCustomSign,
        removeCustomSign,
        getCodeVariants,
        addCodeVariant,
        updateCodeVariant,
        removeCodeVariant,
        setGlobalId,
        removeGlobalId,
        getGlobalId,
        setSourceAlignment,
        removeSourceAlignment,
        alignmentFor,
        setAlignmentPin,
        removeAlignmentPin
    }
})
