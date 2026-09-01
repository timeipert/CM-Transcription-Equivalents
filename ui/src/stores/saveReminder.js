import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAnnotationsStore } from './annotations'
import { usePersonalTablesStore } from './personalTables'
import { useDirectSnippetsStore } from './directSnippets'

/**
 * Tracks work done since the last local export and decides when to nudge.
 *
 * Two situations, with very different risk:
 *  - A workspace folder is bound: the app autosaves to workspace.json, so an
 *    export is a useful second copy but not the only one.
 *  - No folder ("continue without a folder"): everything lives in browser
 *    storage, which the browser may clear on its own. An export is then the ONLY
 *    durable copy, so the nudge matters.
 *
 * This is a store rather than a plain composable so there is exactly one
 * instance: module-level state in a composable can be duplicated (e.g. by Vite
 * HMR serving the module under two URLs), which silently breaks the tracking.
 * A store setup also runs outside any component, so its watcher is never
 * disposed when a component unmounts.
 */

const LS_KEY = 'saveReminderState'

// How much work, and how long, before the first nudge.
const MIN_CHANGES = 15
const MIN_IDLE_MS = 10 * 60 * 1000        // 10 minutes since the last export
const SNOOZE_MS = 30 * 60 * 1000          // "Later" hides it for 30 minutes
const TICK_MS = 30 * 1000

export const useSaveReminderStore = defineStore('saveReminder', () => {
    const changeCount = ref(0)
    const lastExportAt = ref(null)   // epoch ms
    const snoozeUntil = ref(0)       // epoch ms
    const disabled = ref(false)
    const now = ref(Date.now())

    try {
        const raw = localStorage.getItem(LS_KEY)
        if (raw) {
            const p = JSON.parse(raw)
            if (p.lastExportAt) lastExportAt.value = p.lastExportAt
            if (p.snoozeUntil) snoozeUntil.value = p.snoozeUntil
            if (p.disabled) disabled.value = true
            if (typeof p.changeCount === 'number') changeCount.value = p.changeCount
        }
    } catch { /* ignore a corrupt entry */ }

    function persist() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({
                lastExportAt: lastExportAt.value,
                snoozeUntil: snoozeUntil.value,
                disabled: disabled.value,
                changeCount: changeCount.value
            }))
        } catch { /* storage full or blocked; not worth failing over */ }
    }

    const annotStore = useAnnotationsStore()
    const tablesStore = usePersonalTablesStore()
    const directStore = useDirectSnippetsStore()

    // Count meaningful edits. Settings are cheap to recreate, so only the data
    // stores drive the nudge.
    watch(
        [
            () => annotStore.$state,
            () => tablesStore.$state,
            () => directStore.collections
        ],
        () => {
            changeCount.value++
            persist()
        },
        { deep: true }
    )

    setInterval(() => { now.value = Date.now() }, TICK_MS)

    const hasUnsavedWork = computed(() => changeCount.value > 0)
    const neverExported = computed(() => !lastExportAt.value)
    const msSinceExport = computed(() =>
        lastExportAt.value ? now.value - lastExportAt.value : Infinity
    )

    const shouldRemind = computed(() => {
        if (disabled.value) return false
        if (now.value < snoozeUntil.value) return false
        if (changeCount.value < MIN_CHANGES) return false
        return msSinceExport.value > MIN_IDLE_MS
    })

    const sinceExportLabel = computed(() => {
        if (neverExported.value) return 'never'
        const mins = Math.floor(msSinceExport.value / 60000)
        if (mins < 1) return 'just now'
        if (mins < 60) return `${mins} min ago`
        const hrs = Math.floor(mins / 60)
        if (hrs < 24) return `${hrs} h ago`
        return `${Math.floor(hrs / 24)} d ago`
    })

    /** Call after a successful backup export. Resets the counter and the clock. */
    function markExported() {
        lastExportAt.value = Date.now()
        changeCount.value = 0
        snoozeUntil.value = 0
        now.value = Date.now()
        persist()
    }

    function snooze() {
        snoozeUntil.value = Date.now() + SNOOZE_MS
        // `now` only ticks every 30s; refresh it so the toast hides on click
        // rather than lingering for up to half a minute.
        now.value = Date.now()
        persist()
    }

    function disableReminder() {
        disabled.value = true
        persist()
    }

    function enableReminder() {
        disabled.value = false
        snoozeUntil.value = 0
        now.value = Date.now()
        persist()
    }

    return {
        changeCount, lastExportAt, snoozeUntil, disabled,
        hasUnsavedWork, neverExported, shouldRemind, sinceExportLabel,
        markExported, snooze, disableReminder, enableReminder
    }
})
