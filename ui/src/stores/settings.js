import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
    // State
    const displayMode = ref('svg') // 'svg', 'arrow', 'text'
    const autoFillIds = ref(true)
    const globalDisplayIds = ref({}) // { pattern: "customId" }

    // Load from LocalStorage
    const stored = localStorage.getItem('globalSettings')
    if (stored) {
        try {
            const parsed = JSON.parse(stored)
            // Restore individually to handle missing keys in old versions
            if (parsed.displayMode) displayMode.value = parsed.displayMode
            if (parsed.autoFillIds !== undefined) autoFillIds.value = parsed.autoFillIds
            if (parsed.globalDisplayIds) globalDisplayIds.value = parsed.globalDisplayIds
        } catch (e) {
            console.error("Error loading settings", e)
        }
    }

    // Persist to LocalStorage
    watch([displayMode, autoFillIds, globalDisplayIds], () => {
        localStorage.setItem('globalSettings', JSON.stringify({
            displayMode: displayMode.value,
            autoFillIds: autoFillIds.value,
            globalDisplayIds: globalDisplayIds.value
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

    return {
        displayMode,
        autoFillIds,
        globalDisplayIds,
        setGlobalId,
        removeGlobalId,
        getGlobalId
    }
})
