import { ref, computed, watch } from 'vue';
import { useTranscriptionData } from './useTranscriptionData';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useSettingsStore } from '../stores/settings';
import { useImageManifest } from './useImageManifest';

function parseLineNumber(name) {
    if (!name) return null;
    const m = name.match(/(\d+)/);
    return m ? parseInt(m[1]) : null;
}

function getBasePattern(p) {
    if (!p) return "";
    return p.split(' ')[0];
}

function getRectFromPoints(pointsStr) {
    if (!pointsStr) return null;
    const parts = pointsStr.split(' ');
    let minX = 100, minY = 100, maxX = 0, maxY = 0;
    for (const p of parts) {
        const [x, y] = p.split(',').map(Number);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function useManagerWorkspace(props) {
    const annotStore = useAnnotationsStore();
    const tableStore = usePersonalTablesStore();
    const settings = useSettingsStore();
    const { pagePatternsIndex, folioLinesIndex, glyphs, rawData, patStats, loadSource } = useTranscriptionData();
    const { getImageUrl, getStandardSource, getStandardFolio, getIiifThumbnailUrl, hasTranscriptionData } = useImageManifest();

    const stdSource = computed(() => getStandardSource(props.source, props.folio));
    const stdFolio = computed(() => getStandardFolio(props.source, props.folio));

    const resolvedSrcKey = computed(() => {
        if (!props.source || !rawData.value) return props.source;
        const keys = Object.keys(rawData.value);
        if (keys.includes(props.source)) return props.source;
        const targetStd = getStandardSource(props.source);
        const match = keys.find(k => getStandardSource(k) === targetStd || k.toLowerCase() === props.source.toLowerCase());
        return match || props.source;
    });

    const patternCustomIdMap = computed(() => {
        let table = null;
        if (props.returnId) {
            table = tableStore.getTable(props.returnId);
        } else {
            table = tableStore.tables.find(t => t.source === props.source || getStandardSource(t.source) === stdSource.value);
        }
        if (!table) return {};
        const map = {};
        for (const row of table.rows) {
            const base = row.pattern.split(' ')[0];
            map[base] = row.customId;
        }
        return map;
    });

    const highlightHint = computed(() => {
        if (!props.highlightPattern || !rawData.value) return null;
        const srcKey = resolvedSrcKey.value;
        if (!srcKey || !rawData.value[srcKey]) return null;
        
        const patData = rawData.value[srcKey][props.highlightPattern] || [];
        const targetFolio = stdFolio.value;
        
        const onThisPage = patData.filter(o => getStandardFolio(srcKey, o[1]) === targetFolio);
        if (onThisPage.length === 0) return null;
        
        const lines = Array.from(new Set(onThisPage.map(o => Number(o[2])))).sort((a,b) => a-b);
        const sortedOccs = [...onThisPage].sort((a, b) => (parseInt(a[2]) || 0) - (parseInt(b[2]) || 0));

        return { pattern: props.highlightPattern, lines, occurrences: sortedOccs };
    });

    const allLinesOnPage = computed(() => {
        if (!folioLinesIndex.value) return [];
        const srcKey = resolvedSrcKey.value;
        if (!srcKey || !folioLinesIndex.value[srcKey]) return [];
        
        let lines = folioLinesIndex.value[srcKey][props.folio] || [];
        if (lines.length === 0) {
            const targetFolio = stdFolio.value;
            for (const [idxFolio, fLines] of Object.entries(folioLinesIndex.value[srcKey])) {
                if (getStandardFolio(srcKey, idxFolio) === targetFolio) {
                    lines = lines.concat(fLines);
                }
            }
            lines = Array.from(new Set(lines));
        }
        return lines.map(Number).sort((a,b) => a-b);
    });

    const regions = computed(() => {
        if (!stdSource.value || !stdFolio.value) return [];
        const standardRegions = annotStore.getRegions(stdSource.value, stdFolio.value);
        const prefix = `${stdSource.value}_${stdFolio.value}_`;
        let hasLegacy = false;
        for (const key in annotStore.annotations) {
            if (key.startsWith(prefix) && annotStore.annotations[key].length > 0) {
                hasLegacy = true; break;
            }
        }
        if (hasLegacy) {
            return [{ id: 'legacy', name: 'Legacy Annotations (Whole Page)', points: '0,0 100,0 100,100 0,100', isLegacy: true }, ...standardRegions];
        }
        return standardRegions;
    });

    const existingRegionLines = computed(() => new Set(regions.value.map(r => parseLineNumber(r.name)).filter(n => n !== null)));
    const linesToAnnotate = computed(() => {
        const existing = existingRegionLines.value;
        return allLinesOnPage.value.filter(l => !existing.has(l));
    });

    const baseStats = computed(() => {
        const stats = {};
        if (!patStats.value) return stats;
        for (const [pat, data] of Object.entries(patStats.value)) {
            const base = getBasePattern(pat);
            stats[base] = (stats[base] || 0) + data.count;
        }
        return stats;
    });

    const patternSort = ref('freq');
    const patternSearch = ref('');

    const pagePatterns = computed(() => {
        const srcKey = resolvedSrcKey.value;
        if (!srcKey || !pagePatternsIndex.value) return { list: [], isFallback: false };
        const sourceData = pagePatternsIndex.value[srcKey];
        if (!sourceData) return { list: [], isFallback: false };

        let pats = sourceData[props.folio] || [];
        if (pats.length === 0) {
            const targetFolio = stdFolio.value;
            for (const [idxFolio, fPats] of Object.entries(sourceData)) {
                if (getStandardFolio(srcKey, idxFolio) === targetFolio) {
                    pats = pats.concat(fPats);
                }
            }
            pats = Array.from(new Set(pats));
        }

        const isGlobalFallback = ref(false);
        if (pats.length === 0) {
            const allPats = new Set();
            for (const fPats of Object.values(sourceData)) {
                for (const p of fPats) allPats.add(p);
            }
            pats = Array.from(allPats);
            isGlobalFallback.value = true;
        }
        
        const baseSet = new Set(pats.map(p => getBasePattern(p)));
        let result = Array.from(baseSet);

        if (patternSearch.value.trim()) {
            const q = patternSearch.value.toLowerCase();
            result = result.filter(p => p.toLowerCase().includes(q));
        }
        
        if (patternSort.value === 'alpha') {
            result.sort();
        } else if (patternSort.value === 'length') {
            result.sort((a, b) => a.length !== b.length ? a.length - b.length : a.localeCompare(b));
        } else if (patternSort.value === 'freq') {
            result.sort((a, b) => {
                if (a === "(Start)") return -1;
                if (b === "(Start)") return 1;
                const countA = baseStats.value[a] || 0;
                const countB = baseStats.value[b] || 0;
                if (countA !== countB) return countB - countA;
                return a.localeCompare(b);
            });
        }
        
        return { list: result, isFallback: isGlobalFallback.value };
    });

    const otherPageAnnotations = computed(() => {
        const res = {};
        const currentSrc = stdSource.value;
        const currentFol = stdFolio.value;
        
        for (const key in annotStore.annotations) {
            const parts = key.split('_');
            if (parts.length >= 3) {
                const src = parts[0], fol = parts[1];
                if (src === currentSrc && fol === currentFol) continue;
                const pat = parts.slice(2).join('_');
                const basePat = getBasePattern(pat);
                if (!res[basePat]) res[basePat] = [];
                const count = annotStore.annotations[key].length;
                if (count > 0) res[basePat].push({ folio: fol, line: '', count });
            }
        }
        
        const regionToLoc = {};
        for (const key in annotStore.regions) {
            const parts = key.split('_');
            if (parts.length >= 2) {
                const src = parts[0], fol = parts[1];
                if (src === currentSrc && fol === currentFol) continue;
                for (const r of annotStore.regions[key]) {
                     regionToLoc[r.id] = { folio: fol, name: r.name };
                }
            }
        }
        
        for (const rid in annotStore.regionItems) {
            if (!regionToLoc[rid]) continue;
            const loc = regionToLoc[rid], items = annotStore.regionItems[rid];
            const patCounts = {};
            for (const item of items) {
                 const basePat = getBasePattern(item.pattern);
                 patCounts[basePat] = (patCounts[basePat] || 0) + 1;
            }
            for (const pat in patCounts) {
                 if (!res[pat]) res[pat] = [];
                 res[pat].push({ folio: loc.folio, line: loc.name, count: patCounts[pat] });
            }
        }
        return res;
    });

    const activeRegion = ref(null);
    
    const activeRegionRect = computed(() => activeRegion.value ? getRectFromPoints(activeRegion.value.points) : null);

    const activeRegionItems = computed(() => {
        if (!activeRegion.value) return [];
        
        if (activeRegion.value.isLegacy) {
            const prefix = `${stdSource.value}_${stdFolio.value}_`;
            const items = [];
            for (const key in annotStore.annotations) {
                if (key.startsWith(prefix)) {
                    const pattern = key.substring(prefix.length);
                     for (const a of annotStore.annotations[key]) {
                         const basePat = getBasePattern(pattern);
                         const localId = patternCustomIdMap.value[basePat];
                         const globalId = settings.getGlobalId(basePat);
                         let dId = localId || globalId || basePat;
                         
                         let variant = a.variant || '';
                         const trans = a.linkData?.transcription || '';
                         if (!variant && trans && trans.length > basePat.length && trans.startsWith(basePat)) {
                             variant = trans.substring(basePat.length).trim();
                         }
                         if (!variant && pattern.includes(' ')) {
                             variant = pattern.split(' ')[1];
                         }
                         if (variant) dId = `${dId}${variant}`;
                         items.push({ ...a, pattern, displayId: dId, variant });
                    }
                }
            }
            return items;
        }
        
        const items = annotStore.getRegionItems(activeRegion.value.id);
        return items.map(item => {
            const basePat = getBasePattern(item.pattern);
            const localId = patternCustomIdMap.value[basePat];
            const globalId = settings.getGlobalId(basePat);
            let dId = localId || globalId || basePat;
            
            let variant = item.variant || '';
            const trans = item.linkData?.transcription || '';
            if (!variant && trans && trans.length > basePat.length && trans.startsWith(basePat)) {
                variant = trans.substring(basePat.length).trim();
            }
            if (variant) dId = `${dId}${variant}`;
            return { ...item, displayId: dId, variant };
        });
    });

    const activePattern = ref("");
    const activeVariant = ref("");

    const linkCandidates = computed(() => {
        if (!activePattern.value || !props.source) return [];
        const srcData = rawData.value[props.source];
        if (!srcData) return [];
        const allOccs = srcData[activePattern.value] || [];
        
        const target = String(props.folio).toLowerCase();
        const stdTarget = String(getStandardFolio(props.source, props.folio)).toLowerCase();
        
        const candidates = allOccs.map(o => {
            const dFolio = String(o[1]).toLowerCase();
            let score = 0;
            if (dFolio === target) score = 100;
            else if (dFolio === stdTarget) score = 90;
            else if (dFolio.includes(target) || target.includes(dFolio)) score = 50;
            else if (stdTarget && (dFolio.includes(stdTarget) || stdTarget.includes(dFolio))) score = 40;
            return { occ: o, score };
        });

        candidates.sort((a, b) => b.score - a.score);
        if (candidates[0] && candidates[0].score > 0) {
            return candidates.filter(c => c.score > 0).map(c => c.occ);
        }
        return allOccs;
    });

    watch(() => props.source, async (newSrc) => {
        if (newSrc) await loadSource(newSrc);
    }, { immediate: true });

    return {
        stdSource, stdFolio, resolvedSrcKey, highlightHint,
        allLinesOnPage, regions, existingRegionLines, linesToAnnotate,
        pagePatterns, otherPageAnnotations, patternSort, patternSearch,
        activeRegion, activeRegionRect, activeRegionItems,
        activePattern, activeVariant, linkCandidates, patternCustomIdMap,
        glyphs, getImageUrl, getIiifThumbnailUrl, hasTranscriptionData,
        getBasePattern, parseLineNumber, annotStore
    };
}
