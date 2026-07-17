import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useAnnotationsStore = defineStore('annotations', () => {
    // Legacy: "Source_Folio_Pattern" -> [...]
    // We might migrate away from this, or keep it for non-line-based usage?
    // For now, let's keep it to avoid breaking existing views until fully migrated.
    const annotations = ref({})

    // New: Regions (Lines)
    // Key: "Source_Folio" -> [{ id: "ts", name: "Line 1", points: "x1,y1 x2,y2..." }]
    const regions = ref({})

    // New: Items within Regions
    // Key: "RegionID" -> [{ id: "ts", pattern: "clef", points: "x1,y1...", linkData: {} }]
    const regionItems = ref({})

    // New: Manual Lines
    // Key: "Source_Folio" -> [lineNum1, lineNum2, ...]
    const manualLines = ref({})

    // Load
    const stored = localStorage.getItem('annotations_v2') // Versioning 
    if (stored) {
        try {
            const data = JSON.parse(stored)
            annotations.value = data.annotations || {}
            regions.value = data.regions || {}
            regionItems.value = data.regionItems || {}
            manualLines.value = data.manualLines || {}
            
            // Ensure all legacy annotations have IDs
            let fallbackId = 0;
            for (const key in annotations.value) {
                annotations.value[key] = annotations.value[key].map(a => {
                    if (!a.id) return { ...a, id: `migrated-${Date.now()}-${fallbackId++}` };
                    return a;
                });
            }
        } catch (e) {
            console.error("Error loading annotations", e)
        }
    } else {
        // Fallback to v1 if v2 not found
        const v1 = localStorage.getItem('annotations')
        if (v1) {
            try {
                const v1Data = JSON.parse(v1)
                let fallbackId = 0;
                for (const key in v1Data) {
                    v1Data[key] = v1Data[key].map(a => {
                        if (!a.id) return { ...a, id: `migrated-${Date.now()}-${fallbackId++}` };
                        return a;
                    });
                }
                annotations.value = v1Data;
            } catch (e) { }
        }
    }

    // Save
    watch([annotations, regions, regionItems, manualLines], () => {
        localStorage.setItem('annotations_v2', JSON.stringify({
            annotations: annotations.value,
            regions: regions.value,
            regionItems: regionItems.value,
            manualLines: manualLines.value
        }))
    }, { deep: true })

    // --- Legacy Actions (Updated to include Region Items) ---
    function getAnnotations(source, folio, pattern) {
        const key = `${source}_${folio}_${pattern}`
        const legacy = annotations.value[key] || []

        // Gather items from regions on this page
        const pageRegions = getRegions(source, folio);
        const regionBased = [];

        for (const r of pageRegions) {
            const items = regionItems.value[r.id] || [];
            const matches = items.filter(i => i.pattern === pattern);
            // Attach region info to items so consumers know they belong to a Line
            const enhanced = matches.map(m => ({
                ...m,
                regionId: r.id,
                regionPoints: r.points,
                source,  // ensure context is present
                folio
            }));
            regionBased.push(...enhanced);
        }

        return [...legacy, ...regionBased];
    }

    function addAnnotation(source, folio, pattern, points, metadata = {}) {
        const key = `${source}_${folio}_${pattern}`
        if (!annotations.value[key]) annotations.value[key] = []
        annotations.value[key].push({
            points,
            id: Date.now(),
            ...metadata
        })
    }

    function removeAnnotation(source, folio, pattern, id) {
        // 1. Try Legacy
        const key = `${source}_${folio}_${pattern}`
        if (annotations.value[key]) {
            const initialLen = annotations.value[key].length;
            annotations.value[key] = annotations.value[key].filter(a => a.id !== id)
            if (annotations.value[key].length < initialLen) return; // Found and removed
        }

        // 2. Try Regions
        const pageRegions = getRegions(source, folio);
        for (const r of pageRegions) {
            if (regionItems.value[r.id]) {
                const initialLen = regionItems.value[r.id].length;
                regionItems.value[r.id] = regionItems.value[r.id].filter(i => i.id !== id);
                if (regionItems.value[r.id].length < initialLen) return; // Found and removed
            }
        }
    }

    function updateAnnotation(source, folio, pattern, id, updates) {
        // 1. Try Legacy
        const key = `${source}_${folio}_${pattern}`
        if (annotations.value[key]) {
            const item = annotations.value[key].find(a => a.id === id)
            if (item) {
                Object.assign(item, updates);
                return;
            }
        }

        // 2. Try Regions
        const pageRegions = getRegions(source, folio);
        for (const r of pageRegions) {
            if (regionItems.value[r.id]) {
                const item = regionItems.value[r.id].find(i => i.id === id);
                if (item) {
                    Object.assign(item, updates);
                    return;
                }
            }
        }
    }

    // --- Region Actions ---

    function getRegions(source, folio) {
        const key = `${source}_${folio}`
        return regions.value[key] || []
    }

    function addRegion(source, folio, name, points) {
        const key = `${source}_${folio}`
        if (!regions.value[key]) regions.value[key] = []

        const id = 'r_' + Date.now()
        regions.value[key].push({
            id,
            name,
            points
        })
        return id
    }

    function removeRegion(source, folio, regionId) {
        const key = `${source}_${folio}`
        // Remove region
        if (regions.value[key]) {
            regions.value[key] = regions.value[key].filter(r => r.id !== regionId)
        }
        // Remove associated items
        delete regionItems.value[regionId]
    }

    function getRegionItems(regionId) {
        return regionItems.value[regionId] || []
    }

    function addItemToRegion(regionId, pattern, points, metadata = {}) {
        if (!regionItems.value[regionId]) regionItems.value[regionId] = []
        regionItems.value[regionId].push({
            id: Date.now(),
            pattern,
            points,
            ...metadata
        })
    }

    function removeItemFromRegion(regionId, itemId) {
        if (!regionItems.value[regionId]) return
        regionItems.value[regionId] = regionItems.value[regionId].filter(i => i.id !== itemId)
    }

    // --- Manual Lines Actions ---

    function getManualLines(source, folio) {
        const key = `${source}_${folio}`
        return manualLines.value[key] || []
    }

    function addManualLine(source, folio, lineNum) {
        const key = `${source}_${folio}`
        if (!manualLines.value[key]) manualLines.value[key] = []
        if (!manualLines.value[key].includes(lineNum)) {
            manualLines.value[key].push(lineNum)
            manualLines.value[key].sort((a, b) => a - b)
        }
    }

    function removeManualLine(source, folio, lineNum) {
        const key = `${source}_${folio}`
        if (manualLines.value[key]) {
            manualLines.value[key] = manualLines.value[key].filter(l => l !== lineNum)
        }
    }

    return {
        annotations,
        regions,
        regionItems,
        getAnnotations,
        addAnnotation,
        removeAnnotation,
        updateAnnotation,
        getRegions,
        addRegion,
        removeRegion,
        getRegionItems,
        addItemToRegion,
        removeItemFromRegion,
        manualLines,
        getManualLines,
        addManualLine,
        removeManualLine
    }
})
