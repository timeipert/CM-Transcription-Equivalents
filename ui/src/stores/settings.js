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
        } catch (e) {
            console.error("Error loading settings", e)
        }
    }

    // Persist to LocalStorage
    watch([displayMode, autoFillIds, globalDisplayIds, snippetSize, snippetPadding, backupLabel, sourceAlignments], () => {
        localStorage.setItem('globalSettings', JSON.stringify({
            displayMode: displayMode.value,
            autoFillIds: autoFillIds.value,
            globalDisplayIds: globalDisplayIds.value,
            snippetSize: snippetSize.value,
            snippetPadding: snippetPadding.value,
            backupLabel: backupLabel.value,
            sourceAlignments: sourceAlignments.value
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
        setGlobalId,
        removeGlobalId,
        getGlobalId,
        setSourceAlignment,
        removeSourceAlignment
    }
})
