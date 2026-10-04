import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { newId } from '../utils/id'
import { pageKey, parsePageKey } from '../utils/keys'
import { isPlainObject } from '../utils/shape'
import { pointsToRect, rectToPolygon } from '../utils/geometry'
import { foldLegacyAnnotations, hasLegacyAnnotations } from '../services/persistence/migrations/legacyAnnotations'

/**
 * The annotation model: line regions on a page, and the snippets (items) inside
 * each region.
 *
 *   regions      { "Source_Folio": [ { id, name, points, ommrLineId?, unassigned? } ] }
 *   regionItems  { [regionId]: [ { id, pattern, points, variant?, linkData?, … } ] }
 *   manualLines  { "Source_Folio": [ lineNumber, … ] }
 *
 * Pattern codes carry no variant suffix: a snippet's variant is its own field.
 *
 * A fourth map, `annotations` ("Source_Folio_Pattern" → entries, no region), used
 * to live beside these. It is gone: `hydrate()` folds any legacy entries it is
 * given into regions (see migrations/legacyAnnotations.js), so data written by an
 * older build still loads.
 */
export const useAnnotationsStore = defineStore('annotations', () => {
    const regions = ref({})
    const regionItems = ref({})
    const manualLines = ref({})

    // Which page a region lives on. Items reference their region by id only, so
    // answering "which page is this item on?" otherwise means scanning every page.
    const pageKeyByRegionId = computed(() => {
        const index = {}
        for (const [key, list] of Object.entries(regions.value)) {
            for (const r of list) index[r.id] = key
        }
        return index
    })

    // --- Persistence ---------------------------------------------------------

    function serialize() {
        return {
            regions: regions.value,
            regionItems: regionItems.value,
            manualLines: manualLines.value
        }
    }

    /**
     * Replace the parts present in `payload`. Legacy whole-page entries (an
     * `annotations` map from an older build) are folded into regions on the way in.
     */
    function hydrate(payload) {
        if (!isPlainObject(payload)) return
        let nextRegions = isPlainObject(payload.regions) ? payload.regions : undefined
        let nextItems = isPlainObject(payload.regionItems) ? payload.regionItems : undefined
        const nextLines = isPlainObject(payload.manualLines) ? payload.manualLines : undefined

        if (hasLegacyAnnotations(payload)) {
            const { state } = foldLegacyAnnotations({
                annotations: payload.annotations,
                regions: nextRegions ?? regions.value,
                regionItems: nextItems ?? regionItems.value
            })
            nextRegions = state.regions
            nextItems = state.regionItems
        }

        if (nextRegions) regions.value = nextRegions
        if (nextItems) regionItems.value = nextItems
        if (nextLines) manualLines.value = nextLines
    }

    function reset() {
        regions.value = {}
        regionItems.value = {}
        manualLines.value = {}
    }

    // --- Items (snippets) ----------------------------------------------------

    /** All snippets of a pattern on a page, each tagged with its region and page. */
    function getAnnotations(source, folio, pattern) {
        const out = []
        for (const r of getRegions(source, folio)) {
            for (const item of regionItems.value[r.id] || []) {
                if (item.pattern !== pattern) continue
                out.push({ ...item, regionId: r.id, regionPoints: r.points, source, folio })
            }
        }
        return out
    }

    /** Find an item by id among the regions of a page. */
    function findItem(source, folio, id) {
        for (const r of getRegions(source, folio)) {
            const item = (regionItems.value[r.id] || []).find(i => i.id === id)
            if (item) return { item, regionId: r.id }
        }
        return null
    }

    function removeAnnotation(source, folio, pattern, id) {
        const found = findItem(source, folio, id)
        if (found) removeItemFromRegion(found.regionId, id)
    }

    function updateAnnotation(source, folio, pattern, id, updates) {
        const found = findItem(source, folio, id)
        if (found) Object.assign(found.item, updates)
    }

    function getRegionItems(regionId) {
        return regionItems.value[regionId] || []
    }

    function addItemToRegion(regionId, pattern, points, metadata = {}) {
        if (!regionItems.value[regionId]) regionItems.value[regionId] = []
        const id = newId('i')
        regionItems.value[regionId].push({ id, pattern, points, ...metadata })
        return id
    }

    function removeItemFromRegion(regionId, itemId) {
        if (!regionItems.value[regionId]) return
        regionItems.value[regionId] = regionItems.value[regionId].filter(i => i.id !== itemId)
    }

    // --- Regions -------------------------------------------------------------

    function getRegions(source, folio) {
        return regions.value[pageKey(source, folio)] || []
    }

    function addRegion(source, folio, name, points) {
        const key = pageKey(source, folio)
        if (!regions.value[key]) regions.value[key] = []
        const id = newId('r')
        regions.value[key].push({ id, name, points })
        return id
    }

    function updateRegion(source, folio, regionId, updates) {
        const reg = (regions.value[pageKey(source, folio)] || []).find(r => r.id === regionId)
        if (!reg) return false
        if (updates.name !== undefined) reg.name = updates.name
        if (updates.points !== undefined) reg.points = updates.points
        return true
    }

    function removeRegion(source, folio, regionId) {
        const key = pageKey(source, folio)
        if (regions.value[key]) {
            regions.value[key] = regions.value[key].filter(r => r.id !== regionId)
        }
        delete regionItems.value[regionId]
    }

    // --- Manual lines --------------------------------------------------------

    function getManualLines(source, folio) {
        return manualLines.value[pageKey(source, folio)] || []
    }

    function addManualLine(source, folio, lineNum) {
        const key = pageKey(source, folio)
        if (!manualLines.value[key]) manualLines.value[key] = []
        if (!manualLines.value[key].includes(lineNum)) {
            manualLines.value[key].push(lineNum)
            manualLines.value[key].sort((a, b) => a - b)
        }
    }

    function removeManualLine(source, folio, lineNum) {
        const key = pageKey(source, folio)
        if (manualLines.value[key]) {
            manualLines.value[key] = manualLines.value[key].filter(l => l !== lineNum)
        }
    }

    // --- OMMR import ---------------------------------------------------------

    /**
     * Imports staff line regions from an OMMR dataset for a manuscript.
     * lineList: Array of { id, source, folio, bbox, ... }
     */
    function importOmmrLines(source, lineList) {
        if (!source || !Array.isArray(lineList) || !lineList.length) return 0
        let createdCount = 0

        const linesByFolio = {}
        for (const ln of lineList) {
            if (!ln.folio || !ln.bbox) continue
            if (!linesByFolio[ln.folio]) linesByFolio[ln.folio] = []
            linesByFolio[ln.folio].push(ln)
        }

        for (const [folio, fLines] of Object.entries(linesByFolio)) {
            const key = pageKey(source, folio)
            if (!regions.value[key]) regions.value[key] = []
            if (!manualLines.value[key]) manualLines.value[key] = []

            // Sort lines top-to-bottom by y coordinate
            fLines.sort((a, b) => (a.bbox.y || 0) - (b.bbox.y || 0))

            fLines.forEach((ln, idx) => {
                const lineNum = idx + 1
                const lineName = `Line ${lineNum}`

                // A region may already exist for this OMMR line, or under the same name
                const existing = regions.value[key].find(r => r.ommrLineId === ln.id || r.name === lineName)
                if (!existing) {
                    regions.value[key].push({
                        id: newId('r'),
                        name: lineName,
                        points: rectToPolygon(ln.bbox),
                        ommrLineId: ln.id
                    })
                    createdCount++
                }

                if (!manualLines.value[key].includes(lineNum)) {
                    manualLines.value[key].push(lineNum)
                    manualLines.value[key].sort((a, b) => a - b)
                }
            })
        }

        return createdCount
    }

    /** The page's "Unassigned" whole-page region, created on first use. */
    function ensureUnassignedRegion(source, folio) {
        const key = pageKey(source, folio)
        if (!regions.value[key]) regions.value[key] = []
        let region = regions.value[key].find(r => r.unassigned)
        if (!region) {
            region = {
                id: `r_unassigned_${source}_${folio}`,
                name: 'Unassigned',
                points: '0,0 100,0 100,100 0,100',
                unassigned: true
            }
            regions.value[key].push(region)
        }
        return region
    }

    /**
     * Imports selected OMMR snippets into the line regions of their page.
     * @param {string} source
     * @param {Array} snippetList
     * @param {Array} allLines (optional list of OMMR lines to create regions from first)
     * @returns {number} how many snippets were added (re-imports add nothing)
     */
    function importOmmrSnippets(source, snippetList, allLines = []) {
        let count = 0
        if (!source || !Array.isArray(snippetList) || !snippetList.length) return 0

        // Make sure staff line regions exist for the folios in the dataset
        if (allLines && allLines.length) importOmmrLines(source, allLines)

        for (const s of snippetList) {
            const { folio, pattern, points } = s
            if (!folio || !pattern || !points) continue

            // Prefer the region of the OMMR line the snippet came from, then the
            // region whose vertical extent holds it, then the first region.
            const pageRegions = getRegions(source, folio).filter(r => !r.unassigned)
            let target = pageRegions.find(r => r.ommrLineId === s.lineId)
            if (!target && pageRegions.length) {
                if (s.notePoints && s.notePoints.length) {
                    const avgY = s.notePoints.reduce((sum, p) => sum + p.y, 0) / s.notePoints.length
                    target = pageRegions.find(r => {
                        const rect = pointsToRect(r.points)
                        return avgY >= rect.y && avgY <= rect.y + rect.h
                    })
                }
                target = target || pageRegions[0]
            }
            if (!target) target = ensureUnassignedRegion(source, folio)

            if (!regionItems.value[target.id]) regionItems.value[target.id] = []
            const exists = regionItems.value[target.id].some(i => i.points === points && i.pattern === pattern)
            if (exists) continue

            regionItems.value[target.id].push({
                id: newId('ommr'),
                pattern,
                points,
                displayId: pattern,
                importedFrom: 'OMMR4all',
                aspectRatio: s.aspectRatio
            })
            count++
        }

        return count
    }

    /**
     * Granularly removes regions, items and manual lines for a specific manuscript.
     * @param {string} source
     * @param {Object} options { snippets: boolean, regions: boolean, manualLines: boolean, folios: string[], patterns: string[] }
     */
    function clearManuscript(source, options = {}) {
        if (!source) return
        const {
            snippets = true,
            regions: clearRegs = true,
            manualLines: clearLines = true,
            folios = null,
            patterns = null
        } = options

        const folioSet = folios && folios.length ? new Set(folios) : null
        const patternSet = patterns && patterns.length ? new Set(patterns) : null

        // Regions & their items
        for (const key of Object.keys(regions.value)) {
            const k = parsePageKey(key)
            if (k?.source !== source) continue
            if (folioSet && !folioSet.has(k.folio)) continue

            const regList = regions.value[key] || []

            if (clearRegs) {
                for (const r of regList) delete regionItems.value[r.id]
                delete regions.value[key]
            } else if (snippets) {
                // Keep the regions, drop (or filter) what is inside them
                for (const r of regList) {
                    if (patternSet) {
                        if (regionItems.value[r.id]) {
                            regionItems.value[r.id] = regionItems.value[r.id].filter(i => !patternSet.has(i.pattern))
                        }
                    } else {
                        delete regionItems.value[r.id]
                    }
                }
            }
        }

        // Manual lines
        if (clearLines) {
            for (const key of Object.keys(manualLines.value)) {
                const k = parsePageKey(key)
                if (k?.source !== source) continue
                if (folioSet && !folioSet.has(k.folio)) continue
                delete manualLines.value[key]
            }
        }
    }

    return {
        regions,
        regionItems,
        manualLines,
        pageKeyByRegionId,
        serialize,
        hydrate,
        reset,
        getAnnotations,
        removeAnnotation,
        updateAnnotation,
        getRegions,
        addRegion,
        updateRegion,
        removeRegion,
        getRegionItems,
        addItemToRegion,
        removeItemFromRegion,
        getManualLines,
        addManualLine,
        removeManualLine,
        ensureUnassignedRegion,
        importOmmrLines,
        importOmmrSnippets,
        clearManuscript
    }
})
