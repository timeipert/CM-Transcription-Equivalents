import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
    // State
    const displayMode = ref('svg') // 'svg', 'arrow', 'text'
    const autoFillIds = ref(true)
    const globalDisplayIds = ref({}) // { pattern: "customId" }
    const snippetSize = ref(60)
    const snippetPadding = ref(0.3)
    const backupLabel = ref("My Backup")
    const sourceAlignments = ref({}) // { [source]: { iiifType: 'paginated'|'foliated', dataType: 'paginated'|'foliated', offset: 0 } }
    const neumeNames = ref({}) // { pattern: "Custom Name" }
    // Code-changing variants (project-wide):
    // customSigns: the reusable sign vocabulary. Each: { key, label, abbrev, description, glyph, glyphSvg }
    const customSigns = ref([])
    // codeVariants: per-base-pattern list of derived variant codes.
    // { [baseCode]: [ { id, code, label, description } ] }
    const codeVariants = ref({})
    // When true, overviews/IDs treat a code variant as distinct; when false they
    // are merged back into their base pattern ("all in one").
    const discriminateSigns = ref(true)
    // Source metadata: a project-defined set of free-text attributes (e.g. "Century",
    // "Region", "Notation type") plus per-source values, used for filtering in the
    // public views.
    // sourceMetaFields: [{ key, label, description }]
    const sourceMetaFields = ref([])
    // sourceMeta: { [source]: { [fieldKey]: "value" } }
    const sourceMeta = ref({})

    // Load from LocalStorage
    const stored = localStorage.getItem('globalSettings')
    if (stored) {
        try {
            const parsed = JSON.parse(stored)
            // Restore individually to handle missing keys in old versions
            if (parsed.displayMode) displayMode.value = parsed.displayMode
            if (parsed.autoFillIds !== undefined) autoFillIds.value = parsed.autoFillIds
            if (parsed.globalDisplayIds) globalDisplayIds.value = parsed.globalDisplayIds
            if (parsed.snippetSize) snippetSize.value = parsed.snippetSize
            if (parsed.snippetPadding) snippetPadding.value = parsed.snippetPadding
            if (parsed.backupLabel) backupLabel.value = parsed.backupLabel
            if (parsed.sourceAlignments) sourceAlignments.value = parsed.sourceAlignments
            if (parsed.neumeNames) neumeNames.value = parsed.neumeNames
            if (Array.isArray(parsed.customSigns)) customSigns.value = parsed.customSigns
            if (parsed.codeVariants) codeVariants.value = parsed.codeVariants
            if (parsed.discriminateSigns !== undefined) discriminateSigns.value = parsed.discriminateSigns
            if (Array.isArray(parsed.sourceMetaFields)) sourceMetaFields.value = parsed.sourceMetaFields
            if (parsed.sourceMeta) sourceMeta.value = parsed.sourceMeta
        } catch (e) {
            console.error("Error loading settings", e)
        }
    }

    // Persist to LocalStorage
    watch([displayMode, autoFillIds, globalDisplayIds, snippetSize, snippetPadding, backupLabel, sourceAlignments, neumeNames, customSigns, codeVariants, discriminateSigns, sourceMetaFields, sourceMeta], () => {
        localStorage.setItem('globalSettings', JSON.stringify({
            displayMode: displayMode.value,
            autoFillIds: autoFillIds.value,
            globalDisplayIds: globalDisplayIds.value,
            snippetSize: snippetSize.value,
            snippetPadding: snippetPadding.value,
            backupLabel: backupLabel.value,
            sourceAlignments: sourceAlignments.value,
            neumeNames: neumeNames.value,
            customSigns: customSigns.value,
            codeVariants: codeVariants.value,
            discriminateSigns: discriminateSigns.value,
            sourceMetaFields: sourceMetaFields.value,
            sourceMeta: sourceMeta.value
        }))
    }, { deep: true })

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

    function setNeumeName(pattern, name) {
        neumeNames.value = { ...neumeNames.value, [pattern]: name }
    }

    function removeNeumeName(pattern) {
        const next = { ...neumeNames.value }
        delete next[pattern]
        neumeNames.value = next
    }

    function getNeumeNameValue(pattern) {
        return neumeNames.value[pattern] || ''
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

    function addSourceMetaField(label, description = '') {
        const clean = String(label).trim()
        if (!clean) return null
        const key = slugifyFieldKey(clean)
        if (!key || sourceMetaFields.value.some(f => f.key === key)) return null
        const field = { key, label: clean, description: String(description).trim() }
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

    function setSourceAlignment(source, config) {
        sourceAlignments.value = { ...sourceAlignments.value, [source]: config }
    }

    function removeSourceAlignment(source) {
        const next = { ...sourceAlignments.value }
        delete next[source]
        sourceAlignments.value = next
    }

    return {
        displayMode,
        autoFillIds,
        globalDisplayIds,
        snippetSize,
        snippetPadding,
        backupLabel,
        sourceAlignments,
        neumeNames,
        customSigns,
        codeVariants,
        discriminateSigns,
        sourceMetaFields,
        sourceMeta,
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
        setNeumeName,
        removeNeumeName,
        getNeumeNameValue,
        setSourceAlignment,
        removeSourceAlignment
    }
})
