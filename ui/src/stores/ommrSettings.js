import { defineStore } from 'pinia'
import { ref } from 'vue'
import { isPlainObject } from '../utils/shape'

/**
 * Per-manuscript corrections the OMMR explorer applies when it maps an OMMR4all
 * dataset onto IIIF images. They are work product — hours of calibration that
 * the imported annotations depend on — so they belong in the workspace file and
 * in backups, not just in one browser's localStorage where they used to live.
 *
 *   calibrations  { [source]: { sx, sy, dx, dy } }  deskew/crop correction
 *   folioOffsets  { [source]: number }              shift onto the IIIF canvases, in recto/verso steps
 *   indexModes    { [source]: boolean }             folios are page indexes, resolved by canvas position
 *
 * Purely visual preferences of the explorer (card padding, markers) stay with
 * the view.
 */

export const IDENTITY_CALIBRATION = Object.freeze({ sx: 1, sy: 1, dx: 0, dy: 0 })

export const useOmmrSettingsStore = defineStore('ommrSettings', () => {
    const calibrations = ref({})
    const folioOffsets = ref({})
    const indexModes = ref({})

    // --- Calibration ---

    function calibrationFor(source) {
        return calibrations.value[source] || { ...IDENTITY_CALIBRATION }
    }

    function updateCalibration(source, patch) {
        if (!source) return
        calibrations.value = {
            ...calibrations.value,
            [source]: { ...IDENTITY_CALIBRATION, ...calibrationFor(source), ...patch }
        }
    }

    function resetCalibration(source) {
        const next = { ...calibrations.value }
        delete next[source]
        calibrations.value = next
    }

    // --- Folio offset ---

    function folioOffsetFor(source) {
        return folioOffsets.value[source] || 0
    }

    function setFolioOffset(source, offset) {
        if (!source) return
        folioOffsets.value = { ...folioOffsets.value, [source]: offset }
    }

    // --- Index mode ---

    function indexModeFor(source) {
        return !!indexModes.value[source]
    }

    function setIndexMode(source, on) {
        if (!source) return
        indexModes.value = { ...indexModes.value, [source]: !!on }
    }

    // --- Persistence ---

    function serialize() {
        return {
            calibrations: calibrations.value,
            folioOffsets: folioOffsets.value,
            indexModes: indexModes.value
        }
    }

    function hydrate(payload) {
        if (!isPlainObject(payload)) return
        if (isPlainObject(payload.calibrations)) calibrations.value = payload.calibrations
        if (isPlainObject(payload.folioOffsets)) folioOffsets.value = payload.folioOffsets
        if (isPlainObject(payload.indexModes)) indexModes.value = payload.indexModes
    }

    function reset() {
        calibrations.value = {}
        folioOffsets.value = {}
        indexModes.value = {}
    }

    return {
        calibrations, folioOffsets, indexModes,
        calibrationFor, updateCalibration, resetCalibration,
        folioOffsetFor, setFolioOffset,
        indexModeFor, setIndexMode,
        serialize, hydrate, reset
    }
})
