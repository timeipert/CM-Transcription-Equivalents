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

    function updateRegion(source, folio, regionId, updates) {
        const key = `${source}_${folio}`
        if (regions.value[key]) {
            const reg = regions.value[key].find(r => r.id === regionId);
            if (reg) {
                if (updates.name !== undefined) reg.name = updates.name;
                if (updates.points !== undefined) reg.points = updates.points;
                return true;
            }
        }
        return false;
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

    /**
     * Convert an axis-aligned bounding box {x, y, w, h} into a standard polygon string "x1,y1 x2,y2 x3,y3 x4,y4"
     */
    function bboxToPolygon(bbox) {
        if (!bbox) return "0,0 0,0 0,0 0,0";
        const x1 = Math.max(0, +bbox.x).toFixed(2);
        const y1 = Math.max(0, +bbox.y).toFixed(2);
        const x2 = Math.min(100, +(bbox.x + bbox.w)).toFixed(2);
        const y2 = Math.min(100, +(bbox.y + bbox.h)).toFixed(2);
        return `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`;
    }

    function getRectFromPoints(pointsStr) {
        if (!pointsStr) return { x: 0, y: 0, w: 0, h: 0 };
        const pairs = pointsStr.trim().split(/\s+/).map(p => p.split(',').map(Number));
        const xs = pairs.map(p => p[0]).filter(n => !isNaN(n));
        const ys = pairs.map(p => p[1]).filter(n => !isNaN(n));
        if (!xs.length || !ys.length) return { x: 0, y: 0, w: 0, h: 0 };
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /**
     * Imports staff line regions from OMMR dataset for a manuscript.
     * lineList: Array of { id, source, folio, bbox, ... }
     */
    function importOmmrLines(source, lineList) {
        if (!source || !Array.isArray(lineList) || !lineList.length) return 0;
        let createdCount = 0;

        // Group lines by folio
        const linesByFolio = {};
        for (const ln of lineList) {
            if (!ln.folio || !ln.bbox) continue;
            if (!linesByFolio[ln.folio]) linesByFolio[ln.folio] = [];
            linesByFolio[ln.folio].push(ln);
        }

        for (const [folio, fLines] of Object.entries(linesByFolio)) {
            const key = `${source}_${folio}`;
            if (!regions.value[key]) regions.value[key] = [];
            if (!manualLines.value[key]) manualLines.value[key] = [];

            // Sort lines top-to-bottom by y coordinate
            fLines.sort((a, b) => (a.bbox.y || 0) - (b.bbox.y || 0));

            fLines.forEach((ln, idx) => {
                const lineNum = idx + 1;
                const lineName = `Line ${lineNum}`;
                const polyPoints = bboxToPolygon(ln.bbox);

                // Check if a region already exists at similar coords or with same line id
                let existing = regions.value[key].find(r => r.ommrLineId === ln.id || r.name === lineName);
                if (!existing) {
                    const regionId = `r_${source}_${folio}_l${lineNum}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
                    regions.value[key].push({
                        id: regionId,
                        name: lineName,
                        points: polyPoints,
                        ommrLineId: ln.id
                    });
                    createdCount++;
                }

                if (!manualLines.value[key].includes(lineNum)) {
                    manualLines.value[key].push(lineNum);
                    manualLines.value[key].sort((a, b) => a - b);
                }
            });
        }

        return createdCount;
    }

    /**
     * Imports selected OMMR snippets and links them to line regions.
     * @param {string} source
     * @param {Array} snippetList
     * @param {Array} allLines (optional list of OMMR lines from store)
     */
    function importOmmrSnippets(source, snippetList, allLines = []) {
        let count = 0;
        if (!source || !Array.isArray(snippetList) || !snippetList.length) return 0;

        // 1. Ensure staff line regions exist for folios in the dataset
        if (allLines && allLines.length) {
            importOmmrLines(source, allLines);
        }

        for (const s of snippetList) {
            const folio = s.folio;
            const pattern = s.pattern;
            const points = s.points;
            if (!folio || !pattern || !points) continue;

            const itemId = `ommr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            // 2. Add to legacy annotations for full backward compatibility
            addAnnotation(source, folio, pattern, points, {
                id: itemId,
                importedFrom: 'OMMR4all',
                displayId: s.pattern,
                aspectRatio: s.aspectRatio
            });

            // 3. Find corresponding staff line region and attach item
            const pageRegions = getRegions(source, folio);
            if (pageRegions && pageRegions.length) {
                let targetRegion = pageRegions.find(r => r.ommrLineId === s.lineId);
                if (!targetRegion && s.notePoints && s.notePoints.length) {
                    const avgY = s.notePoints.reduce((sum, p) => sum + p.y, 0) / s.notePoints.length;
                    targetRegion = pageRegions.find(r => {
                        const rect = getRectFromPoints(r.points);
                        return avgY >= rect.y && avgY <= (rect.y + rect.h);
                    }) || pageRegions[0];
                } else if (!targetRegion) {
                    targetRegion = pageRegions[0];
                }

                if (targetRegion) {
                    if (!regionItems.value[targetRegion.id]) regionItems.value[targetRegion.id] = [];
                    // Avoid duplicates
                    const exists = regionItems.value[targetRegion.id].some(i => i.points === points && i.pattern === pattern);
                    if (!exists) {
                        regionItems.value[targetRegion.id].push({
                            id: itemId,
                            pattern: pattern,
                            points: points,
                            displayId: pattern,
                            importedFrom: 'OMMR4all',
                            aspectRatio: s.aspectRatio
                        });
                    }
                }
            }

            count++;
        }

        return count;
    }

    /**
     * Granularly removes annotations, regions, items, and manual lines for a specific manuscript.
     * @param {string} source
     * @param {Object} options { snippets: boolean, regions: boolean, manualLines: boolean, folios: string[], patterns: string[] }
     */
    function clearManuscript(source, options = {}) {
        if (!source) return;
        const {
            snippets = true,
            regions: clearRegs = true,
            manualLines: clearLines = true,
            folios = null,
            patterns = null
        } = options;

        const folioSet = folios && folios.length ? new Set(folios) : null;
        const patternSet = patterns && patterns.length ? new Set(patterns) : null;
        const prefix = `${source}_`;

        // 1. Clear legacy annotations
        if (snippets) {
            for (const key in annotations.value) {
                if (key.startsWith(prefix)) {
                    const sub = key.substring(prefix.length); // "folio_pattern"
                    const parts = sub.split('_');
                    const fol = parts[0];
                    const pat = parts.slice(1).join('_');

                    if (folioSet && !folioSet.has(fol)) continue;
                    if (patternSet && !patternSet.has(pat)) continue;

                    delete annotations.value[key];
                }
            }
        }

        // 2. Clear regions & region items
        for (const key in regions.value) {
            if (key.startsWith(prefix)) {
                const fol = key.substring(prefix.length);
                if (folioSet && !folioSet.has(fol)) continue;

                const regList = regions.value[key] || [];

                if (clearRegs) {
                    // Remove all region items for these regions
                    for (const r of regList) {
                        delete regionItems.value[r.id];
                    }
                    delete regions.value[key];
                } else if (snippets) {
                    // Keep regions but remove/filter their items
                    for (const r of regList) {
                        if (patternSet) {
                            if (regionItems.value[r.id]) {
                                regionItems.value[r.id] = regionItems.value[r.id].filter(i => !patternSet.has(i.pattern));
                            }
                        } else {
                            delete regionItems.value[r.id];
                        }
                    }
                }
            }
        }

        // 3. Clear manual lines
        if (clearLines) {
            for (const key in manualLines.value) {
                if (key.startsWith(prefix)) {
                    const fol = key.substring(prefix.length);
                    if (folioSet && !folioSet.has(fol)) continue;
                    delete manualLines.value[key];
                }
            }
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
        updateRegion,
        removeRegion,
        getRegionItems,
        addItemToRegion,
        removeItemFromRegion,
        manualLines,
        getManualLines,
        addManualLine,
        removeManualLine,
        importOmmrLines,
        importOmmrSnippets,
        clearManuscript
    }
})
