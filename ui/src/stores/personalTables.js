import { defineStore } from 'pinia'
import { ref } from 'vue'
import { newId } from '../utils/id'
import { isPlainObject } from '../utils/shape'

/**
 * One equivalents table per source: the Ref-ID given to each pattern, plus the
 * table's publication flag and notes.
 *
 *   tables   [ { id, name, source, notes, isPublished?, patterns: [code], rows: [{ pattern, customId, notes? }] } ]
 *
 * `starredItems` is a personal UI marker ("source|folio|pattern|id"); it lives
 * in browser storage only and is not part of the workspace file or backups.
 */
export const usePersonalTablesStore = defineStore('personalTables', () => {
    const tables = ref([])
    const starredItems = ref(new Set())

    /** Make a table safe to use: every container the views iterate exists. */
    function normalizeTable(t) {
        if (!isPlainObject(t)) return null
        return {
            ...t,
            id: t.id !== undefined && t.id !== null && t.id !== '' ? t.id : newId('t'),
            rows: Array.isArray(t.rows) ? t.rows : [],
            patterns: Array.isArray(t.patterns) ? t.patterns : []
        }
    }

    // --- Persistence ---------------------------------------------------------

    /** What browser storage keeps (the workspace file takes just `tables`). */
    function serialize() {
        return { tables: tables.value, starredItems: Array.from(starredItems.value) }
    }

    /**
     * Accepts `{ tables, starredItems }`, or — from the oldest builds — the bare
     * array of tables. Malformed entries are dropped.
     */
    function hydrate(payload) {
        const list = Array.isArray(payload) ? payload : payload?.tables
        if (Array.isArray(list)) {
            tables.value = list.map(normalizeTable).filter(Boolean)
        }
        if (isPlainObject(payload) && Array.isArray(payload.starredItems)) {
            starredItems.value = new Set(payload.starredItems)
        }
    }

    function reset() {
        tables.value = []
        starredItems.value = new Set()
    }

    function toggleStarred(id) {
        if (starredItems.value.has(id)) {
            starredItems.value.delete(id)
        } else {
            starredItems.value.add(id)
        }
        starredItems.value = new Set(starredItems.value) // trigger reactivity
    }

    function createTable(name) {
        const id = newId('t')
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

    function ensurePatternsInTable(sourceName, patternList) {
        if (!sourceName || !Array.isArray(patternList) || !patternList.length) return null;
        const tableId = getOrCreateTableForSource(sourceName);
        const table = getTable(tableId);
        if (!table) return tableId;

        const existingPats = new Set(table.rows.map(r => r.pattern));
        let added = false;
        for (const pat of patternList) {
            if (pat && !existingPats.has(pat)) {
                table.rows.push({ pattern: pat, customId: pat });
                if (!table.patterns.includes(pat)) table.patterns.push(pat);
                existingPats.add(pat);
                added = true;
            }
        }
        if (added) {
            updateTable(tableId, { rows: [...table.rows], patterns: [...table.patterns] });
        }
        return tableId;
    }

    function deleteTableForSource(sourceName) {
        const idx = tables.value.findIndex(t => t.source === sourceName);
        if (idx !== -1) {
            tables.value.splice(idx, 1);
            return true;
        }
        return false;
    }

    function clearTableRowsForSource(sourceName) {
        const table = tables.value.find(t => t.source === sourceName);
        if (table) {
            table.rows = [];
            table.patterns = [];
            updateTable(table.id, { rows: [], patterns: [] });
            return true;
        }
        return false;
    }

    return { 
        tables, 
        starredItems, 
        serialize,
        hydrate,
        reset,
        toggleStarred, 
        createTable, 
        getTable, 
        updateTable, 
        deleteTable, 
        deleteTableForSource,
        clearTableRowsForSource,
        getOrCreateTableForSource,
        ensurePatternsInTable
    }
})
