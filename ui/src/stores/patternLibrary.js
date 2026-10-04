import { defineStore } from 'pinia'
import { ref } from 'vue'
import { isPlainObject } from '../utils/shape'
import { getBaseCode } from '../utils/patternCode'
import { normalizeNcTemplate } from '../utils/meiTemplate'

/**
 * Per-pattern configuration for the pattern library.
 *
 * Deliberately narrow: the set of patterns that exist is derived from the
 * transcription data, the equivalents tables and the annotations, and the
 * variant vocabulary lives in the settings store (`customSigns` / `codeVariants`).
 * What is kept here is only what the researcher writes about a pattern and
 * cannot be derived: a free label, notes, and the MEI template.
 *
 *   patterns: { [code]: { code, label, notes, manual, mei: [ {..}, ... ] } }
 *
 * `manual: true` marks a pattern that exists only on a local scan, not in the
 * digital data — the one case where this store also defines *that* a pattern is.
 */
export const usePatternLibraryStore = defineStore('patternLibrary', () => {
    const patterns = ref({})

    function getEntry(code) {
        return patterns.value[getBaseCode(code)] || null
    }

    function updateEntry(code, updates) {
        const key = getBaseCode(code)
        if (!key) return
        const current = patterns.value[key] || { code: key, label: '', notes: '', manual: false, mei: null }
        patterns.value = { ...patterns.value, [key]: { ...current, ...updates, code: key } }
    }

    function getLabel(code) {
        return getEntry(code)?.label || ''
    }

    function getNotes(code) {
        return getEntry(code)?.notes || ''
    }

    /** Add a pattern that exists only on a scan, not in the transcription data. */
    function addManualPattern(code, fields = {}) {
        const key = getBaseCode(code)
        if (!key) return null
        const existing = patterns.value[key]
        updateEntry(key, { ...fields, manual: existing ? existing.manual : true })
        return key
    }

    function removeEntry(code) {
        const next = { ...patterns.value }
        delete next[getBaseCode(code)]
        patterns.value = next
    }

    /** Codes that exist only in this library. */
    function manualCodes() {
        return Object.values(patterns.value).filter(p => p.manual).map(p => p.code)
    }

    // --- MEI templates ---

    function getMeiTemplate(code, signKeys = []) {
        return normalizeNcTemplate(code, getEntry(code)?.mei, signKeys)
    }

    function setMeiTemplate(code, template, signKeys = []) {
        updateEntry(code, { mei: normalizeNcTemplate(code, template, signKeys) })
    }

    function hasMeiTemplate(code) {
        const mei = getEntry(code)?.mei
        return Array.isArray(mei) && mei.some(nc => nc && Object.keys(nc).length > 0)
    }

    // --- Bulk state (workspace file / backup) ---

    function serialize() {
        return { patterns: patterns.value }
    }

    function hydrate(payload) {
        if (isPlainObject(payload?.patterns)) patterns.value = payload.patterns
    }

    function reset() {
        patterns.value = {}
    }

    return {
        patterns,
        getEntry,
        updateEntry,
        getLabel,
        getNotes,
        addManualPattern,
        removeEntry,
        manualCodes,
        getMeiTemplate,
        setMeiTemplate,
        hasMeiTemplate,
        serialize,
        hydrate,
        reset
    }
})
