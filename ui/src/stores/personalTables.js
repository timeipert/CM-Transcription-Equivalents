import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const usePersonalTablesStore = defineStore('personalTables', () => {
    const tables = ref([])
    const starredItems = ref(new Set()) // "source|folio|pattern|id"

    // Load from local storage
    const stored = localStorage.getItem('personalTables')
    if (stored) {
        try {
            const data = JSON.parse(stored)
            tables.value = data.tables || data // handle legacy
            if (data.starredItems) starredItems.value = new Set(data.starredItems)
        } catch (e) {
            console.error("Failed to parse local storage", e)
        }
    }

    // Sync to local storage
    watch([tables, starredItems], () => {
        const data = {
            tables: tables.value,
            starredItems: Array.from(starredItems.value)
        }
        localStorage.setItem('personalTables', JSON.stringify(data))
    }, { deep: true })

    function toggleStarred(id) {
        if (starredItems.value.has(id)) {
            starredItems.value.delete(id)
        } else {
            starredItems.value.add(id)
        }
        starredItems.value = new Set(starredItems.value) // trigger reactivity
    }

    function createTable(name) {
        const id = Date.now().toString()
        tables.value.push({
            id,
            name,
            source: '',
            notes: '',
            patterns: [], // List of strings (pattern names)
            rows: [] // List of { pattern: "...", customId: "..." }
        })
        return id
    }

    function getTable(id) {
        return tables.value.find(t => t.id === id)
    }

    function updateTable(id, updates) {
        const idx = tables.value.findIndex(t => t.id === id)
        if (idx !== -1) {
            tables.value[idx] = { ...tables.value[idx], ...updates }
        }
    }

    function deleteTable(id) {
        const idx = tables.value.findIndex(t => t.id === id)
        if (idx !== -1) {
            tables.value.splice(idx, 1)
        }
    }

    function getOrCreateTableForSource(sourceName) {
        const existing = tables.value.find(t => t.source === sourceName)
        if (existing) return existing.id

        const id = createTable(sourceName) // Use source name as table name
        updateTable(id, { source: sourceName })
        return id
    }

    return { tables, starredItems, toggleStarred, createTable, getTable, updateTable, deleteTable, getOrCreateTableForSource }
})
