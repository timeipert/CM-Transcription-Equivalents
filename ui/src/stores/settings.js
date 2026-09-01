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
        } catch (e) {
            console.error("Error loading settings", e)
        }
    }

    // Persist to LocalStorage
    watch([displayMode, autoFillIds, globalDisplayIds, snippetSize, snippetPadding, backupLabel, sourceAlignments, neumeNames, customSigns, codeVariants, discriminateSigns], () => {
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
            discriminateSigns: discriminateSigns.value
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
