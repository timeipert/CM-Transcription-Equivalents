<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useOmmrStore } from '../stores/ommr';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useIiifStore } from '../stores/iiif';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { useImageManifest } from '../composables/useImageManifest';
import { compareChantPatterns } from '../utils/sorting';
import { undeskewPoint } from '../utils/ommrGeometry';
import PatternDisplay from '../components/PatternDisplay.vue';
import OmmrSnippet from '../components/OmmrSnippet.vue';
import OmmrLineStrip from '../components/OmmrLineStrip.vue';
import OmmrPageModal from '../components/OmmrPageModal.vue';
import ManuscriptCleanupModal from '../components/ManuscriptCleanupModal.vue';

const ommrStore = useOmmrStore();
const annotStore = useAnnotationsStore();
const personalTablesStore = usePersonalTablesStore();
const iiifStore = useIiifStore();
const { glyphs, sourceFolios, manifests } = useTranscriptionData();
const { getIiifRegionUrl, getStandardSource, getStandardFolio,
        getIiifCanvasByIndex, getIiifCanvasCount } = useImageManifest();

// --- Manuscript Selection & Project Correspondence ---
const selectedTargetSource = ref(''); // pre-selected manuscript before upload
const customTargetSourceName = ref(''); // custom manuscript input

// --- Staged import (explicit folio-naming step) ---
const showImportModal = ref(false);
const importStaging = ref(null); // { detectedSource, entries: [{rawFolio, json, image, angle, w, h}] }
const importSourceName = ref('');
const folioRule = reactive({ preset: 'as-is', pattern: '', replace: '', stripZeros: true, suffix: '', mode: 'label', offset: 0, startVerso: false });

const FOLIO_PRESETS = {
    'as-is':   { label: 'As-is', pattern: '', replace: '', stripZeros: true, suffix: '', mode: 'label' },
    'digits':  { label: 'Digits only (→ 22)', pattern: '\\D+', replace: '', stripZeros: true, suffix: '', mode: 'label' },
    'trailing-r': { label: 'Number + r (→ 22r)', pattern: '^.*?(\\d+)\\D*$', replace: '$1', stripZeros: true, suffix: 'r', mode: 'label' },
    'page-folio': { label: 'Page → folio (1r,1v,2r…)', pattern: '^.*?(\\d+)\\D*$', replace: '$1', stripZeros: true, suffix: '', mode: 'pagefolio' },
    'custom':  { label: 'Custom regex', pattern: '', replace: '', stripZeros: false, suffix: '', mode: 'label' }
};
function applyPreset(key) {
    const p = FOLIO_PRESETS[key];
    if (!p) return;
    folioRule.preset = key;
    if (key !== 'custom') {
        folioRule.pattern = p.pattern; folioRule.replace = p.replace;
        folioRule.stripZeros = p.stripZeros; folioRule.suffix = p.suffix;
        folioRule.mode = p.mode;
    }
}
// Convert a 1-based page index to a folio label (recto/verso), with offset.
function pageToFolio(page) {
    let p = page + (folioRule.offset || 0);
    if (folioRule.startVerso) p += 1; // shift parity if the run starts on a verso
    if (p < 1) return String(page);
    const num = Math.ceil(p / 2);
    const side = (p % 2 === 1) ? 'r' : 'v';
    return `${num}${side}`;
}
function mapFolio(raw) {
    let out = String(raw);
    if (folioRule.stripZeros) out = out.replace(/^0+(?=\d)/, '');
    if (folioRule.pattern) {
        try { out = out.replace(new RegExp(folioRule.pattern, 'g'), folioRule.replace || ''); } catch { /* invalid regex */ }
    }
    out = out.trim();
    if (folioRule.mode === 'pagefolio') {
        const n = parseInt((out.match(/\d+/) || [])[0], 10);
        if (!isNaN(n)) return pageToFolio(n);
        return out || String(raw);
    }
    if (folioRule.suffix && /\d$/.test(out)) out += folioRule.suffix;
    return out || String(raw);
}
const showThumbs = ref(true);
const importPreview = computed(() => {
    if (!importStaging.value) return [];
    const limit = showThumbs.value ? 30 : 60;
    return importStaging.value.entries.slice(0, limit)
        .map(e => ({ raw: e.rawFolio, mapped: mapFolio(e.rawFolio), image: e.image }));
});

// Object URLs for page thumbnails (created lazily, revoked on close).
const thumbCache = new Map();
function thumbUrl(file) {
    if (!file) return '';
    if (!thumbCache.has(file)) thumbCache.set(file, URL.createObjectURL(file));
    return thumbCache.get(file);
}
function clearThumbs() {
    for (const url of thumbCache.values()) URL.revokeObjectURL(url);
    thumbCache.clear();
}
function closeImport() { clearThumbs(); showImportModal.value = false; importStaging.value = null; }
const importCollision = computed(() => {
    if (!importStaging.value) return 0;
    const seen = new Set(); let dup = 0;
    for (const e of importStaging.value.entries) {
        const m = mapFolio(e.rawFolio);
        if (seen.has(m)) dup++; else seen.add(m);
    }
    return dup;
});
const showRemapModal = ref(false); // modal to re-assign/remap active source
const showCleanupModal = ref(false); // modal to delete/clean manuscript annotations
const remapTargetSource = ref('');
const customRemapSource = ref('');

// Computed list of known project manuscripts with metadata
const availableProjectSources = computed(() => {
    const sMap = new Map();
    // Sources from index.json
    if (sourceFolios.value) {
        for (const [src, fSet] of Object.entries(sourceFolios.value)) {
            const count = fSet instanceof Set ? fSet.size : (Array.isArray(fSet) ? fSet.length : 0);
            sMap.set(src, {
                name: src,
                folioCount: count,
                hasIiif: !!(iiifStore.links[src] || manifests.value?.[src])
            });
        }
    }
    // Any sources with IIIF links
    for (const src of Object.keys(iiifStore.links)) {
        if (!sMap.has(src)) {
            sMap.set(src, { name: src, folioCount: 0, hasIiif: true });
        }
    }
    // Any personal tables
    for (const t of personalTablesStore.tables) {
        if (t.source && !sMap.has(t.source)) {
            sMap.set(t.source, { name: t.source, folioCount: 0, hasIiif: !!iiifStore.links[t.source] });
        }
    }
    return Array.from(sMap.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
});

/**
 * Smart matcher: maps an arbitrary folder name or string (e.g. 'Pa_14819', '14819')
 * to an existing project manuscript (e.g. 'Pa 14819').
 */
function findMatchingProjectSource(folderOrName) {
    if (!folderOrName) return null;
    const raw = String(folderOrName).trim();
    const list = availableProjectSources.value.map(s => s.name);
    if (!list.length) return null;

    // 1. Exact match (case-insensitive)
    const exact = list.find(s => s.toLowerCase() === raw.toLowerCase());
    if (exact) return exact;

    // 2. Normalized alphanumeric comparison ('pa_14819' -> 'pa14819' matches 'Pa 14819')
    const norm = (str) => String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetNorm = norm(raw);
    if (targetNorm) {
        const normMatch = list.find(s => norm(s) === targetNorm);
        if (normMatch) return normMatch;
    }

    // 3. Extract number if distinctive (e.g. '14819' in 'paris_14819' -> matches 'Pa 14819')
    const numMatch = raw.match(/(\d+)/);
    if (numMatch) {
        const num = numMatch[1];
        const numSources = list.filter(s => {
            const sNum = s.match(/(\d+)/);
            return sNum && sNum[1] === num;
        });
        if (numSources.length === 1) return numSources[0];
    }

    // 4. Substring containment
    const subMatch = list.find(s => targetNorm && (targetNorm.includes(norm(s)) || norm(s).includes(targetNorm)));
    if (subMatch) return subMatch;

    return null;
}

// Active project manuscript metadata for activeSource
const activeProjectManuscript = computed(() => {
    if (!ommrStore.activeSource) return null;
    return availableProjectSources.value.find(s => s.name === ommrStore.activeSource) || null;
});

// Count how many folios in the loaded OMMR dataset exist in the project manuscript
const matchingProjectFoliosCount = computed(() => {
    if (!ommrStore.activeSource || !sourceFolios.value?.[ommrStore.activeSource]) return 0;
    const projectFSet = sourceFolios.value[ommrStore.activeSource];
    const ommrFList = Object.keys(ommrStore.currentDataset?.folios || {});
    let matched = 0;
    for (const f of ommrFList) {
        if (projectFSet.has(f) || projectFSet.has(f.replace(/[rv]$/i, ''))) matched++;
    }
    return matched;
});

// --- View state ---
const selectedPattern = ref(null);
const searchFilter = ref('');
const sortOrder = ref('freq');       // 'freq' | 'length' | 'alpha'
const folioFilter = ref('');         // filter snippets by folio within a pattern
const selectedSnippets = ref(new Set());

// Which patterns to include in the optimizers. null = all included (default).
const includedPatterns = ref(null);
function isIncluded(pat) { return !includedPatterns.value || includedPatterns.value.has(pat); }
function toggleInclude(pat) {
    if (!includedPatterns.value) includedPatterns.value = new Set(Object.keys(ommrStore.snippetsByPattern));
    const next = new Set(includedPatterns.value);
    next.has(pat) ? next.delete(pat) : next.add(pat);
    includedPatterns.value = next;
}
function includeAll() { includedPatterns.value = null; }
function includeNone() { includedPatterns.value = new Set(); }
const includedCount = computed(() => allPatterns.value.filter(isIncluded).length);

// --- Settings drawer ---
const showSettings = ref(false);
const manifestUrlInput = ref('');
const renameInput = ref('');
// Rendering tuning (persisted per browser)
const cardPadding = ref(Number(localStorage.getItem('ommrPadding')) || 0.5);
watch(cardPadding, (v) => localStorage.setItem('ommrPadding', String(v)));

// Prefer IIIF over bundled local images (persisted per browser).
const preferIiif = ref(localStorage.getItem('ommrPreferIiif') === '1');
watch(preferIiif, (v) => localStorage.setItem('ommrPreferIiif', v ? '1' : '0'));
function localFor(snip) {
    return preferIiif.value ? '' : (ommrStore.getLocalImageUrl(snip.source, snip.folio) || '');
}

// Per-source calibration (deskew/crop correction), persisted per browser.
const IDENTITY_CALIB = { sx: 1, sy: 1, dx: 0, dy: 0 };
const calibrations = ref(JSON.parse(localStorage.getItem('ommrCalibrations') || '{}'));
const calibration = computed(() => calibrations.value[ommrStore.activeSource] || { ...IDENTITY_CALIB });
function updateCalib(patch) {
    const src = ommrStore.activeSource;
    if (!src) return;
    calibrations.value = {
        ...calibrations.value,
        [src]: { ...IDENTITY_CALIB, ...calibration.value, ...patch }
    };
    localStorage.setItem('ommrCalibrations', JSON.stringify(calibrations.value));
}
function resetCalib() {
    const next = { ...calibrations.value };
    delete next[ommrStore.activeSource];
    calibrations.value = next;
    localStorage.setItem('ommrCalibrations', JSON.stringify(calibrations.value));
}
const pageMeta = computed(() => ommrStore.currentDataset?.pageMeta || null);
const EMPTY_DESKEW = { angle: 0, w: 0, h: 0 };
function deskewFor(folio) {
    return ommrStore.getFolioMeta(ommrStore.activeSource, folio) || EMPTY_DESKEW;
}

// --- Folio mapping: shift OMMR folios onto the IIIF canvases (per source) ---
// Offset is measured in "sides" (recto/verso steps). Persisted per source.
const folioOffsets = ref(JSON.parse(localStorage.getItem('ommrFolioOffsets') || '{}'));
const folioOffset = computed(() => folioOffsets.value[ommrStore.activeSource] || 0);
function setFolioOffset(n) {
    folioOffsets.value = { ...folioOffsets.value, [ommrStore.activeSource]: n };
    localStorage.setItem('ommrFolioOffsets', JSON.stringify(folioOffsets.value));
}
// Convert "47r"/"47v"/"47" to an effective IIIF folio after applying the offset.
function effFolio(folio) {
    const off = folioOffset.value;
    if (!off) return folio;
    const m = String(folio).match(/^(\d+)\s*([rv])?/i);
    if (!m) return folio;
    const num = parseInt(m[1], 10);
    const side = (m[2] || 'r').toLowerCase();
    let idx = num * 2 + (side === 'v' ? 1 : 0) + off;
    if (idx < 0) idx = 0;
    const newNum = Math.floor(idx / 2);
    const newSide = idx % 2 === 0 ? 'r' : 'v';
    return `${newNum}${newSide}`;
}

// --- Index mode: folios named by page index (…_022) → resolve by canvas position.
const indexModes = ref(JSON.parse(localStorage.getItem('ommrIndexModes') || '{}'));
const indexMode = computed(() => !!indexModes.value[ommrStore.activeSource]);
function setIndexMode(on) {
    indexModes.value = { ...indexModes.value, [ommrStore.activeSource]: on };
    localStorage.setItem('ommrIndexModes', JSON.stringify(indexModes.value));
}
function trailingNum(folio) {
    const m = String(folio).match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : null;
}
// Canvas index (0-based) for a folio, with the folio offset applied.
function canvasIndexFor(folio) {
    const n = trailingNum(folio);
    if (n === null) return null;
    return n - 1 + folioOffset.value;
}
// IIIF service URL for a snippet when in index mode (else '').
function serviceUrlFor(snip) {
    if (!indexMode.value || preferLocal(snip)) return '';
    const idx = canvasIndexFor(snip.folio);
    if (idx === null) return '';
    const c = getIiifCanvasByIndex(snip.source, idx);
    return c?.serviceUrl || '';
}
function preferLocal(snip) {
    return !preferIiif.value && !!ommrStore.getLocalImageUrl(snip.source, snip.folio);
}

// --- Full-page peek modal ---
const peekSnippet = ref(null);
function openPeek(snip) { peekSnippet.value = snip; }

// --- Final-strips preview modal ---
const showPreview = ref(false);
// Selected snippets grouped by pattern, ordered like the sidebar.
const selectedByPattern = computed(() => {
    const sel = selectedSnippets.value;
    const groups = new Map();
    for (const s of ommrStore.activeSnippets) {
        if (!sel.has(s.id)) continue;
        if (!groups.has(s.pattern)) groups.set(s.pattern, []);
        groups.get(s.pattern).push(s);
    }
    return [...groups.entries()]
        .sort((a, b) => compareChantPatterns(a[0], b[0], sortOrder.value, ommrStore.patternFrequencies))
        .map(([pattern, snippets]) => ({ pattern, snippets }));
});
// How many loaded folios carry a nonzero deskew angle (for the settings badge).
const deskewedCount = computed(() => {
    const fm = ommrStore.currentDataset?.folioMeta || {};
    return Object.values(fm).filter(m => m && m.angle).length;
});
// A representative sample snippet used for the calibration live-preview.
const sampleSnippet = computed(() => {
    const list = ommrStore.activeSnippets;
    if (!list.length) return null;
    return list.find(s => s.noteCount >= 2) || list[0];
});
const statusMessage = ref('');
const cardSize = ref(160);           // grid density (px)
const showMarkers = ref(localStorage.getItem('ommrShowMarkers') !== '0');
watch(showMarkers, (v) => localStorage.setItem('ommrShowMarkers', v ? '1' : '0'));

// --- Windowed rendering: never mount more than a page of cards at once ---
const PAGE = 60;
const visibleCount = ref(PAGE);
const sentinelRef = ref(null);
let sentinelObserver = null;

// ------------------------------------------------------------------
// Pattern catalog (sidebar)
// ------------------------------------------------------------------
const allPatterns = computed(() => {
    const pats = Object.keys(ommrStore.snippetsByPattern);
    if (!pats.length) return [];
    const q = searchFilter.value.trim().toLowerCase();
    return pats.filter(p => {
        if (!q) return true;
        return p.toLowerCase().includes(q) || name.includes(q);
    }).sort((a, b) => compareChantPatterns(a, b, sortOrder.value, ommrStore.patternFrequencies));
});

// ------------------------------------------------------------------
// Candidate snippets for the selected pattern (heuristically ordered)
// ------------------------------------------------------------------
const sortedSnippets = computed(() => {
    if (!selectedPattern.value) return [];
    const list = ommrStore.snippetsByPattern[selectedPattern.value] || [];
    const sel = selectedSnippets.value;
    // Selected first, then representative shapes (balanced aspect), then folio.
    return [...list].sort((a, b) => {
        const sa = sel.has(a.id) ? 0 : 1, sb = sel.has(b.id) ? 0 : 1;
        if (sa !== sb) return sa - sb;
        const distA = Math.abs(a.aspectRatio - 1.2);
        const distB = Math.abs(b.aspectRatio - 1.2);
        if (Math.abs(distA - distB) > 0.4) return distA - distB;
        return a.folio.localeCompare(b.folio, undefined, { numeric: true });
    });
});

const filteredSnippets = computed(() => {
    const f = folioFilter.value.trim().toLowerCase();
    if (!f) return sortedSnippets.value;
    return sortedSnippets.value.filter(s => String(s.folio).toLowerCase().includes(f));
});

// Only this slice is actually rendered.
const visibleSnippets = computed(() => filteredSnippets.value.slice(0, visibleCount.value));
const hasMore = computed(() => visibleCount.value < filteredSnippets.value.length);

// Distinct folios present for the selected pattern (for context/quick filter).
const folioOptions = computed(() => {
    const set = new Set(sortedSnippets.value.map(s => s.folio));
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
});

// Reset the window whenever the visible list changes underneath us.
watch([selectedPattern, folioFilter], () => {
    visibleCount.value = PAGE;
});

// ------------------------------------------------------------------
// Infinite scroll sentinel
// ------------------------------------------------------------------
function setupSentinel() {
    teardownSentinel();
    if (!sentinelRef.value) return;
    sentinelObserver = new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting) && hasMore.value) {
            visibleCount.value = Math.min(visibleCount.value + PAGE, filteredSnippets.value.length);
        }
    }, { rootMargin: '400px 0px' });
    sentinelObserver.observe(sentinelRef.value);
}
function teardownSentinel() {
    if (sentinelObserver) { sentinelObserver.disconnect(); sentinelObserver = null; }
}
watch(sentinelRef, () => setupSentinel());
onUnmounted(() => { teardownSentinel(); clearThumbs(); });

// ------------------------------------------------------------------
// Selection
// ------------------------------------------------------------------
function toggleSelect(snippet) {
    const next = new Set(selectedSnippets.value);
    next.has(snippet.id) ? next.delete(snippet.id) : next.add(snippet.id);
    selectedSnippets.value = next;
}
function selectAllVisible() {
    const next = new Set(selectedSnippets.value);
    for (const s of filteredSnippets.value) next.add(s.id);
    selectedSnippets.value = next;
}
function clearSelection() {
    selectedSnippets.value = new Set();
}

// ------------------------------------------------------------------
// Optimal-coverage suggestion (greedy set cover over lines)
// ------------------------------------------------------------------
const lastSuggestion = ref(null); // { lines:[{folio,lineId,covers}], covered, total, lineCount }

// Snippet id -> snippet, and which patterns currently have a selected example.
const snippetById = computed(() => {
    const m = new Map();
    for (const s of ommrStore.activeSnippets) m.set(s.id, s);
    return m;
});
const coveredPatterns = computed(() => {
    const set = new Set();
    for (const id of selectedSnippets.value) {
        const s = snippetById.value.get(id);
        if (s) set.add(s.pattern);
    }
    return set;
});

// Lower = better representative (balanced aspect ratio).
const repScore = (s) => Math.abs(s.aspectRatio - 1.2);

/**
 * Select one example per pattern using as few distinct lines as possible.
 * A single line containing every pattern would be ideal; greedy set cover
 * approximates that. The result is just a starting selection — tweak freely.
 */
function suggestOptimalSelection() {
    const snippets = ommrStore.activeSnippets;
    if (!snippets.length) return;

    // Index lines: lineKey -> best snippet per pattern on that line.
    const lines = new Map();
    const universe = new Set();
    for (const s of snippets) {
        if (!isIncluded(s.pattern)) continue;
        universe.add(s.pattern);
        const key = `${s.folio}|||${s.lineId}`;
        let e = lines.get(key);
        if (!e) { e = { folio: s.folio, lineId: s.lineId, best: new Map() }; lines.set(key, e); }
        const cur = e.best.get(s.pattern);
        if (!cur || repScore(s) < repScore(cur)) e.best.set(s.pattern, s);
    }
    if (!universe.size) { flash('No patterns selected to optimize.'); return; }

    const lineArr = [...lines.values()];
    const uncovered = new Set(universe);
    const chosen = new Map();       // pattern -> snippet
    const chosenLines = [];

    while (uncovered.size > 0) {
        let bestLine = null, bestGain = 0;
        for (const line of lineArr) {
            let gain = 0;
            for (const pat of line.best.keys()) if (uncovered.has(pat)) gain++;
            // tie-break: prefer better average representative quality → earlier folio
            if (gain > bestGain) { bestGain = gain; bestLine = line; }
        }
        if (!bestLine || bestGain === 0) break;
        const covers = [];
        for (const [pat, snip] of bestLine.best) {
            if (uncovered.has(pat)) { chosen.set(pat, snip); uncovered.delete(pat); covers.push(pat); }
        }
        chosenLines.push({ folio: bestLine.folio, lineId: bestLine.lineId, covers });
    }

    selectedSnippets.value = new Set([...chosen.values()].map(s => s.id));
    lastSuggestion.value = {
        lines: chosenLines,
        covered: chosen.size,
        total: universe.size,
        lineCount: chosenLines.length,
        totalLines: lines.size
    };
    flash(`✨ Selected ${chosen.size}/${universe.size} patterns from ${chosenLines.length} lines (of ${lines.size})`);
}

// ------------------------------------------------------------------
// Line-coverage: pick the fewest staff LINES that show all patterns,
// and preview those line strips with the neumes labelled.
// ------------------------------------------------------------------
const showLinePreview = ref(false);
const lineCoverage = ref(null); // { lines:[{line,newPatterns}], covered, total, totalLines }

function suggestLineCoverage() {
    const lines = ommrStore.activeLines;
    if (!lines.length) { flash('No staff lines found — re-import the OMMR folder.'); return; }

    const universe = new Set();
    for (const l of lines) l.patterns.forEach(p => { if (isIncluded(p)) universe.add(p); });
    if (!universe.size) { flash('No patterns selected to optimize.'); return; }
    const uncovered = new Set(universe);
    const chosen = [];

    while (uncovered.size) {
        let best = null, bestNew = null, bestGain = 0;
        for (const l of lines) {
            const nw = l.patterns.filter(p => uncovered.has(p));
            // prefer more new patterns; tie-break toward denser (more total patterns) lines
            if (nw.length > bestGain || (nw.length === bestGain && best && l.patterns.length > best.patterns.length)) {
                bestGain = nw.length; best = l; bestNew = nw;
            }
        }
        if (!best || !bestGain) break;
        chosen.push({ line: best, newPatterns: bestNew });
        bestNew.forEach(p => uncovered.delete(p));
    }

    lineCoverage.value = {
        lines: chosen,
        covered: universe.size - uncovered.size,
        total: universe.size,
        totalLines: lines.length
    };
    showLinePreview.value = true;
    flash(`🎼 ${chosen.length} lines cover ${universe.size - uncovered.size}/${universe.size} patterns`);
}

// Mark only ONE neume per pattern that this line newly contributes, so each
// pattern is labelled exactly once (avoids a wall of punctum labels).
function markedNeumes(item) {
    const wanted = new Set(item.newPatterns);
    const seen = new Set();
    const out = [];
    for (const n of item.line.neumes) {
        if (wanted.has(n.pattern) && !seen.has(n.pattern)) { seen.add(n.pattern); out.push(n); }
    }
    return out;
}

// ------------------------------------------------------------------
// Bake OMMR corrections into the data before importing into the manuscript,
// so the IIIF view renders it correctly WITHOUT any explorer-side transforms:
//  - coordinates are rotated back out of OMMR's deskewed space onto the
//    un-deskewed original (which is what IIIF serves),
//  - the OMMR folio id is mapped to the resolvable IIIF folio label.
// ------------------------------------------------------------------
function undeskewPointsStr(str, angle, W, H) {
    if (!angle || !W || !H || !str) return str;
    return str.split(/\s+/).map(tok => {
        const [x, y] = tok.split(',').map(parseFloat);
        if (isNaN(x) || isNaN(y)) return tok;
        const [ox, oy] = undeskewPoint(x, y, angle, W, H);
        return `${ox.toFixed(3)},${oy.toFixed(3)}`;
    }).join(' ');
}
function undeskewBbox(bbox, angle, W, H) {
    if (!angle || !W || !H || !bbox) return bbox;
    const corners = [[bbox.x, bbox.y], [bbox.x + bbox.w, bbox.y],
                     [bbox.x + bbox.w, bbox.y + bbox.h], [bbox.x, bbox.y + bbox.h]]
        .map(([x, y]) => undeskewPoint(x, y, angle, W, H));
    const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    return { x: +minX.toFixed(3), y: +minY.toFixed(3),
             w: +(Math.max(...xs) - minX).toFixed(3), h: +(Math.max(...ys) - minY).toFixed(3) };
}
// OMMR folio -> IIIF-resolvable folio label (honours offset & index mode).
function manuscriptFolio(folio, source) {
    if (indexMode.value) {
        const idx = canvasIndexFor(folio);
        const c = idx !== null ? getIiifCanvasByIndex(source, idx) : null;
        if (c?.label) return c.label;
    }
    const eff = effFolio(folio);
    return getStandardFolio(source, eff) || eff;
}
function bakeSnippet(s) {
    const dk = deskewFor(s.folio);
    return {
        ...s,
        folio: manuscriptFolio(s.folio, s.source),
        points: undeskewPointsStr(s.points, dk.angle, dk.w, dk.h),
        notePoints: (s.notePoints || []).map(p => {
            const [x, y] = undeskewPoint(p.x, p.y, dk.angle, dk.w, dk.h);
            return { x: +x.toFixed(3), y: +y.toFixed(3) };
        })
    };
}
function bakeLine(l) {
    const dk = deskewFor(l.folio);
    return {
        ...l,
        folio: manuscriptFolio(l.folio, l.source),
        bbox: undeskewBbox(l.bbox, dk.angle, dk.w, dk.h),
        neumes: (l.neumes || []).map(n => ({
            ...n,
            points: undeskewPointsStr(n.points, dk.angle, dk.w, dk.h)
        }))
    };
}

function transferSelectedToAnnotations() {
    if (selectedSnippets.value.size === 0) return;
    const rawSelected = ommrStore.activeSnippets.filter(s => selectedSnippets.value.has(s.id));
    if (rawSelected.length === 0) return;

    const targetSource = ommrStore.activeSource;
    const toImport = rawSelected.map(bakeSnippet);
    // Only the lines that carry a selected snippet, baked for IIIF.
    const usedLineKeys = new Set(rawSelected.map(s => `${s.folio}|||${s.lineId}`));
    const bakedLines = ommrStore.activeLines
        .filter(l => usedLineKeys.has(`${l.folio}|||${l.id}`))
        .map(bakeLine);

    const count = annotStore.importOmmrSnippets(targetSource, toImport, bakedLines);
    const patterns = Array.from(new Set(toImport.map(s => s.pattern)));
    personalTablesStore.ensurePatternsInTable(targetSource, patterns);
    const foliosAffected = new Set(toImport.map(s => s.folio)).size;
    flash(`✓ Imported ${count} snippet${count === 1 ? '' : 's'} (deskew-corrected) across ${foliosAffected} folios into ${targetSource}!`);
    clearSelection();
}

function importAllLines() {
    if (!ommrStore.activeSource || !ommrStore.activeLines.length) return;
    const targetSource = ommrStore.activeSource;
    const created = annotStore.importOmmrLines(targetSource, ommrStore.activeLines);
    const foliosCount = Object.keys(ommrStore.currentDataset?.lines || {}).length;
    flash(`✓ Imported ${created} staff line regions across ${foliosCount} folios for ${targetSource}!`);
}

function openRemapModal() {
    remapTargetSource.value = ommrStore.activeSource || (availableProjectSources.value[0]?.name || '');
    customRemapSource.value = '';
    showRemapModal.value = true;
}

function applyRemap() {
    let next = remapTargetSource.value;
    if (next === '__custom__') {
        next = customRemapSource.value.trim();
    }
    if (!next || next === ommrStore.activeSource) {
        showRemapModal.value = false;
        return;
    }
    ommrStore.renameSource(ommrStore.activeSource, next);
    renameInput.value = next;
    ensureActiveManifest();
    showRemapModal.value = false;
    flash(`✓ Dataset remapped to manuscript “${next}”`);
}

function flash(msg) {
    statusMessage.value = msg;
    setTimeout(() => { statusMessage.value = ''; }, 4000);
}

// ------------------------------------------------------------------
// IIIF manifest binding for the active source
// ------------------------------------------------------------------
// The base IIIF key the active OMMR source resolves to (e.g. "Pa 14819").
const resolvedIiifKey = computed(() => {
    if (!ommrStore.activeSource) return null;
    const sample = ommrStore.activeSnippets[0];
    const folio = sample ? sample.folio : '';
    return getStandardSource(ommrStore.activeSource, folio);
});

const manifestState = computed(() => {
    const key = resolvedIiifKey.value;
    if (!key) return { status: 'none', key: null, url: null };
    const url = iiifStore.links[key] || null;
    const st = iiifStore.manifestStatus[key]?.status;
    if (!url) return { status: 'unlinked', key, url: null };
    if (st === 'loading') return { status: 'loading', key, url };
    if (st === 'error') return { status: 'error', key, url, error: iiifStore.manifestStatus[key]?.error };
    if (iiifStore.parsedData[key]?.length) return { status: 'ok', key, url, count: iiifStore.parsedData[key].length };
    return { status: 'linked', key, url };
});

// Sample distinct folios and count how many resolve to a IIIF region URL.
// Using several folios (not just the first) avoids false "no images" warnings
// when one folio label happens not to match.
const resolveSample = computed(() => {
    // touch reactive deps so this recomputes when a manifest loads
    void iiifStore.parsedData;
    void ommrStore.activeSource;
    const snippets = ommrStore.activeSnippets;
    if (!snippets.length) return { total: 0, matched: 0 };
    const seen = new Set();
    let matched = 0;
    for (const s of snippets) {
        if (seen.has(s.folio)) continue;
        seen.add(s.folio);
        if (folioResolves(s)) matched++;
        if (seen.size >= 30) break; // cap the probe
    }
    return { total: seen.size, matched };
});

// Whether a snippet's page image can be resolved (index mode or label mode).
function folioResolves(s) {
    if (indexMode.value) {
        const idx = canvasIndexFor(s.folio);
        return idx !== null && !!getIiifCanvasByIndex(s.source, idx);
    }
    return !!getIiifRegionUrl(s.source, effFolio(s.folio), 'pct:0,0,5,5', 80);
}

// Consider images "resolvable" if the manifest is loaded and at least one
// sampled folio matches — tolerant of partial label mismatches.
const imagesResolve = computed(() => resolveSample.value.matched > 0);

// Per-folio resolution list for the settings diagnostic (first few folios).
const sampleDiagnostics = computed(() => {
    void iiifStore.parsedData;
    void folioOffset.value;
    void indexModes.value;
    const seen = new Set();
    const out = [];
    for (const s of ommrStore.activeSnippets) {
        if (seen.has(s.folio)) continue;
        seen.add(s.folio);
        let eff, label, matched;
        if (indexMode.value) {
            const idx = canvasIndexFor(s.folio);
            const c = idx !== null ? getIiifCanvasByIndex(s.source, idx) : null;
            eff = idx !== null ? `#${idx + 1}` : '?';
            matched = !!c;
            label = c?.label || '';
        } else {
            eff = effFolio(s.folio);
            matched = !!getIiifRegionUrl(s.source, eff, 'pct:0,0,5,5', 80);
            label = getStandardFolio(s.source, eff);
        }
        out.push({ folio: s.folio, eff, matched, label });
        if (out.length >= 8) break;
    }
    return out;
});

// Any image source available (local exact images OR IIIF).
const anyImages = computed(() => ommrStore.hasLocalImages || imagesResolve.value);

async function ensureActiveManifest() {
    const key = resolvedIiifKey.value;
    if (key && iiifStore.links[key] && !iiifStore.parsedData[key]) {
        await iiifStore.ensureLoaded(key);
    }
}

async function refreshManifest() {
    const key = resolvedIiifKey.value;
    if (!key) return;
    ommrStore.isProcessing = true;
    ommrStore.progressStatus = `Refreshing manifest for ${key}…`;
    try {
        await iiifStore.refreshManifest(key);
        const count = iiifStore.parsedData[key]?.length || 0;
        flash(count > 0 ? `✓ Manifest reloaded (${count} canvases)` : `⚠️ ${iiifStore.manifestStatus[key]?.error || 'reload failed'}`);
    } finally {
        ommrStore.isProcessing = false;
        ommrStore.progressStatus = '';
    }
}

async function saveManifestUrl() {
    const url = manifestUrlInput.value.trim();
    const key = resolvedIiifKey.value || ommrStore.activeSource;
    if (!url || !key) return;
    ommrStore.progressStatus = `Loading manifest for ${key}…`;
    ommrStore.isProcessing = true;
    try {
        await iiifStore.addManifest(key, url);
        const count = iiifStore.parsedData[key]?.length || 0;
        if (count > 0) flash(`✓ Manifest linked to ${key} (${count} canvases)`);
        else flash(`⚠️ Manifest could not be parsed: ${iiifStore.manifestStatus[key]?.error || 'no canvases found'}`);
    } catch (e) {
        flash(`Error loading manifest: ${e.message}`);
    } finally {
        ommrStore.isProcessing = false;
        ommrStore.progressStatus = '';
    }
}

function applyRename() {
    const next = renameInput.value.trim();
    if (!next || next === ommrStore.activeSource) return;
    ommrStore.renameSource(ommrStore.activeSource, next);
    ensureActiveManifest();
    flash(`Renamed source to “${next}”`);
}

// Auto-load a linked manifest whenever the active source changes.
watch(() => ommrStore.activeSource, () => {
    manifestUrlInput.value = manifestState.value.url || '';
    renameInput.value = ommrStore.activeSource || '';
    ensureActiveManifest();
}, { immediate: true });

// ------------------------------------------------------------------
// Import (folder of pcgts.json)
// ------------------------------------------------------------------
async function handleFolderUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const pcgtsFiles = files.filter(f => f.name.endsWith('pcgts.json'));
    if (!pcgtsFiles.length) {
        flash('No pcgts.json files found in the selected folder.');
        e.target.value = '';
        return;
    }

    // Index meta.json files by their folio directory (holds deskewing_degrees).
    const metaByDir = {};
    for (const f of files) {
        if (f.name !== 'meta.json') continue;
        const parts = f.webkitRelativePath ? f.webkitRelativePath.split('/') : [f.name];
        metaByDir[parts.slice(0, -1).join('/')] = f;
    }
    async function readDeskewAngle(dir) {
        const mf = metaByDir[dir];
        if (!mf) return 0;
        try {
            let m = JSON.parse(await mf.text());
            if (typeof m === 'string') m = JSON.parse(m); // meta.json is double-encoded
            return Number(m?.preprocessing?.deskewing_degrees) || 0;
        } catch { return 0; }
    }

    // Index any bundled images by their containing folio directory so we can
    // pair each folio with its (deskewed) source image for exact crops.
    const imagesByDir = {}; // dirPath -> [File...]
    const IMG_RE = /\.(jpe?g|png)$/i;
    for (const f of files) {
        if (!IMG_RE.test(f.name)) continue;
        const parts = f.webkitRelativePath ? f.webkitRelativePath.split('/') : [f.name];
        const dir = parts.slice(0, -1).join('/');
        (imagesByDir[dir] ||= []).push(f);
    }

    // Rank the images in a folio directory and return the best COLOR one.
    function pickBestColorImage(imgs) {
        const score = (name) => {
            const n = name.toLowerCase();
            if (/binary|gray|grey|overlay/.test(n)) return -1;      // B/W derivatives
            if (/thumbnail|preview|_lowres|lowres|_norm/.test(n)) return -1; // low-res
            if (!/color|colour/.test(n)) return -1;                 // must be colour
            if (/original/.test(n)) return -1;                      // NOT deskewed → misaligns
            if (/highres|high_res/.test(n)) return 100;             // full-res deskewed
            if (/deskew/.test(n)) return 60;                        // deskewed (may be preview res)
            return 20;                                              // some other colour image
        };
        let best = null, bestScore = 0;
        for (const f of imgs) {
            const s = score(f.name);
            if (s > bestScore) { best = f; bestScore = s; }
        }
        return best;
    }

    ommrStore.isProcessing = true;
    let detectedSource = 'Pa 14819';
    const entries = []; // { rawFolio, json, image, angle, w, h }

    try {
        for (let i = 0; i < pcgtsFiles.length; i++) {
            const file = pcgtsFiles[i];
            const parts = file.webkitRelativePath ? file.webkitRelativePath.split('/') : [file.name];

            // Raw folio = the folio directory name (kept verbatim; renaming is
            // an explicit step in the import dialog).
            let rawFolio = parts.length >= 2 ? parts[parts.length - 2] : file.name;
            if (rawFolio === 'pages' || rawFolio === 'pcgts' || rawFolio.endsWith('.json')) {
                rawFolio = file.name.replace(/\.?pcgts\.json$|\.json$/i, '') || rawFolio;
            }
            // Source = dir above the folio dir; skip an intermediate "pages" dir.
            if (parts.length >= 3) {
                let srcIdx = parts.length - 3;
                if (parts[srcIdx] === 'pages' && srcIdx > 0) srcIdx -= 1;
                detectedSource = parts[srcIdx].replace(/_/g, ' ');
            }

            ommrStore.progressStatus = `Reading folio ${i + 1} / ${pcgtsFiles.length}`;
            let json = null;
            try { json = JSON.parse(await file.text()); } catch { /* skip malformed */ }
            if (!json) continue;

            const dir = parts.slice(0, -1).join('/');
            const imgs = imagesByDir[dir] || [];
            const image = imgs.length ? pickBestColorImage(imgs) : null;

            entries.push({
                rawFolio, json, image,
                angle: await readDeskewAngle(dir),
                w: json?.page?.imageWidth || 0,
                h: json?.page?.imageHeight || 0
            });

            if (i % 10 === 0) await new Promise(r => setTimeout(r));
        }

        if (!entries.length) { flash('No readable pcgts.json files.'); return; }

        // Stage for the explicit naming/mapping step.
        importStaging.value = { detectedSource, entries };
        importSourceName.value =
            (selectedTargetSource.value && selectedTargetSource.value !== '__custom__' ? selectedTargetSource.value : '') ||
            findMatchingProjectSource(detectedSource) || detectedSource;
        applyPreset('as-is');
        showImportModal.value = true;
    } catch (err) {
        console.error('Error reading OMMR files:', err);
        flash(`Error reading OMMR files: ${err.message}`);
    } finally {
        ommrStore.isProcessing = false;
        ommrStore.progressStatus = '';
        e.target.value = '';
    }
}

/**
 * Commit the staged import, applying the folio-naming rule.
 */
async function commitImport() {
    const st = importStaging.value;
    if (!st) return;
    const finalSource = importSourceName.value.trim() || st.detectedSource;

    const batch = {}, imageForFolio = {}, folioMeta = {};
    for (const en of st.entries) {
        const folio = mapFolio(en.rawFolio);
        batch[folio] = en.json;
        if (en.image) imageForFolio[folio] = en.image;
        folioMeta[folio] = { angle: en.angle, w: en.w, h: en.h };
    }

    ommrStore.isProcessing = true;
    ommrStore.progressStatus = 'Extracting neumes…';
    await nextTick();
    ommrStore.ingestBatch(finalSource, batch);
    ommrStore.setFolioMeta(finalSource, folioMeta);
    for (const folio of Object.keys(imageForFolio)) {
        ommrStore.setLocalImage(finalSource, folio, imageForFolio[folio]);
    }
    if (iiifStore.links[finalSource] || manifests.value?.[finalSource]) {
        await iiifStore.ensureLoaded(finalSource);
    }

    selectedPattern.value = allPatterns.value[0] || null;
    const imgN = Object.keys(imageForFolio).length;
    flash(`✓ Loaded ${Object.keys(batch).length} folios for “${finalSource}” — ${ommrStore.activeSnippets.length} neumes${imgN ? ' · ' + imgN + ' local images' : ''}`);

    ommrStore.isProcessing = false;
    ommrStore.progressStatus = '';
    clearThumbs();
    showImportModal.value = false;
    importStaging.value = null;
}

onMounted(() => {
    if (!selectedPattern.value && allPatterns.value.length) {
        selectedPattern.value = allPatterns.value[0];
    }
});
</script>

<template>
<div class="ommr-explorer-view">
    <!-- Top Action Bar -->
    <header class="explorer-header">
        <div class="header-left">
            <div class="title-with-switcher">
                <h2>Import <span class="title-sub">· OMMR4all</span></h2>
                
                <!-- Active Manuscript Switcher if multiple loaded -->
                <div class="source-switcher-container" v-if="ommrStore.activeSource">
                    <span class="switcher-label">Manuscript:</span>
                    <select 
                        v-if="ommrStore.availableSources.length > 1"
                        :value="ommrStore.activeSource" 
                        @change="ommrStore.activeSource = $event.target.value"
                        class="source-switcher-select"
                    >
                        <option v-for="src in ommrStore.availableSources" :key="src" :value="src">
                            {{ src }} ({{ ommrStore.loadedDatasets[src]?.totalSnippets || 0 }} neumes)
                        </option>
                    </select>
                    <span v-else class="single-source-name">{{ ommrStore.activeSource }}</span>

                    <button class="btn-xs ghost-btn" @click="openRemapModal" title="Re-assign to another project manuscript">
                        ⇄ Change
                    </button>
                </div>
            </div>

            <div class="source-meta-bar" v-if="ommrStore.activeSource">
                <span class="source-tag">
                    <b>{{ ommrStore.activeSnippets.length }}</b> neumes · <b>{{ allPatterns.length }}</b> patterns
                </span>
                
                <!-- Project correspondence badge -->
                <span v-if="activeProjectManuscript" class="proj-badge" :class="{ 'has-match': matchingProjectFoliosCount > 0 }">
                    ✓ Project Manuscript <span v-if="matchingProjectFoliosCount">({{ matchingProjectFoliosCount }} folios matched)</span>
                </span>
                <span v-else class="proj-badge unlinked">
                    Custom Manuscript
                </span>

                <!-- IIIF status badge -->
                <span class="iiif-badge" :class="manifestState.status">
                    <span v-if="manifestState.status === 'ok'">✓ IIIF Connected ({{ manifestState.count }} canvases)</span>
                    <span v-else-if="manifestState.status === 'loading'">↻ IIIF Loading…</span>
                    <span v-else-if="manifestState.status === 'error'">⚠️ IIIF Error</span>
                    <span v-else-if="ommrStore.hasLocalImages">✓ Local Images</span>
                    <span v-else>⚠️ No IIIF Manifest</span>
                </span>
            </div>
        </div>

        <div class="header-actions" v-if="ommrStore.activeSource">
            <!-- Auto-select tools -->
            <div class="action-group" role="group" aria-label="Auto-select">
                <button class="btn-secondary" @click="suggestOptimalSelection"
                    title="Auto-select one example per pattern from as few lines as possible">
                    ✨ Suggest set
                </button>
                <button class="btn-secondary" @click="suggestLineCoverage"
                    title="Fewest staff lines that show all patterns — preview as line strips">
                    🎼 Lines
                </button>
            </div>

            <!-- Utilities -->
            <div class="action-group" role="group" aria-label="Utilities">
                <label class="btn-secondary upload-btn" title="Load another OMMR export">
                    <span>📁 Load</span>
                    <input type="file" webkitdirectory directory multiple @change="handleFolderUpload" hidden />
                </label>
                <button class="btn-secondary icon-btn" :class="{ 'needs-attention': !anyImages }"
                    @click="showSettings = true" title="Manifest & display settings" aria-label="Settings">
                    ⚙<span v-if="!anyImages" class="attn-dot">!</span>
                </button>
            </div>

            <!-- Commit -->
            <div class="action-group commit-group" role="group" aria-label="Import">
                <button class="btn-secondary" :disabled="selectedSnippets.size === 0"
                    @click="showPreview = true" title="Preview the selected representatives as final strips">
                    👁 Preview ({{ selectedSnippets.size }})
                </button>
                <button class="btn-primary" :disabled="selectedSnippets.size === 0"
                    @click="transferSelectedToAnnotations" title="Convert selected snippets into annotations">
                    ✓ Import ({{ selectedSnippets.size }})
                </button>
            </div>
        </div>
    </header>

    <!-- Import progress -->
    <div v-if="ommrStore.isProcessing" class="progress-banner">
        <div class="progress-spinner"></div>
        <span>{{ ommrStore.progressStatus || 'Processing…' }}</span>
    </div>
    <!-- Notification -->
    <div v-else-if="statusMessage" class="status-banner">{{ statusMessage }}</div>

    <!-- No-image warning: snippets were extracted but no IIIF manifest resolves -->
    <div
        v-if="ommrStore.activeSource && ommrStore.activeSnippets.length && !anyImages && !ommrStore.isProcessing"
        class="warn-banner"
    >
        <span>
            No page images for <b>{{ resolvedIiifKey || ommrStore.activeSource }}</b>.
            Re-import the OMMR folder <i>with its images</i> for exact crops, or link a IIIF manifest URL in settings.
        </span>
        <button class="btn-xs" @click="showSettings = true">Open settings</button>
    </div>

    <!-- Empty State -->
    <div v-if="!ommrStore.activeSource || ommrStore.activeSnippets.length === 0" class="empty-explorer">
        <div class="empty-card">
            <span class="empty-icon">🎼</span>
            <h3>Import OMMR4all Transcription Data</h3>
            <p>Upload an OMMR4all export directory containing <code>pcgts.json</code> files to extract all neumes and match them against your manuscript.</p>
            
            <div class="import-setup-box">
                <div class="step-row">
                    <label class="step-label"><b>Step 1:</b> Select Target Manuscript</label>
                    <select v-model="selectedTargetSource" class="manuscript-select">
                        <option value="">✨ Auto-detect from folder name (e.g. Pa_14819 → Pa 14819)</option>
                        <optgroup label="Manuscripts in Project Database">
                            <option v-for="src in availableProjectSources" :key="src.name" :value="src.name">
                                {{ src.name }} {{ src.hasIiif ? '· ✓ IIIF' : '' }} {{ src.folioCount ? `(${src.folioCount} folios)` : '' }}
                            </option>
                        </optgroup>
                        <option value="__custom__">➕ Other / Custom Manuscript Name…</option>
                    </select>
                </div>

                <div v-if="selectedTargetSource === '__custom__'" class="step-row custom-name-row">
                    <label class="step-label">Custom Manuscript Name:</label>
                    <input v-model="customTargetSourceName" placeholder="e.g. Paris 14819 or SG 390" class="custom-name-input" />
                </div>

                <div class="step-row upload-row">
                    <label class="step-label"><b>Step 2:</b> Select OMMR Export Directory</label>
                    <label class="btn-primary btn-large upload-btn">
                        <span>📁 Choose OMMR Folder</span>
                        <input type="file" webkitdirectory directory multiple @change="handleFolderUpload" hidden />
                    </label>
                </div>
            </div>

            <p class="empty-subtext">
                Supports standard OMMR4all export structures, page folders with <code>pcgts.json</code>, and optional color images for exact local crops.
            </p>
        </div>
    </div>

    <!-- Master-Detail Explorer -->
    <div v-else class="explorer-body">
        <!-- Sidebar: Pattern Catalog -->
        <aside class="pattern-sidebar">
            <div class="sidebar-search">
                <input type="text" v-model="searchFilter" placeholder="Search pattern or neume name…" class="search-input" />
            </div>
            <div class="sort-controls">
                <label>Sort</label>
                <select v-model="sortOrder" class="sort-select">
                    <option value="freq">Highest frequency</option>
                    <option value="length">Length</option>
                    <option value="alpha">Alphabetical</option>
                </select>
            </div>
            <div class="include-controls">
                <span>Optimize <b>{{ includedCount }}</b>/{{ allPatterns.length }}</span>
                <div class="incl-btns">
                    <button class="btn-xs" @click="includeAll">All</button>
                    <button class="btn-xs" @click="includeNone">None</button>
                </div>
            </div>
            <div class="pattern-list">
                <div
                    v-for="pat in allPatterns"
                    :key="pat"
                    class="pattern-item"
                    :class="{ active: selectedPattern === pat, excluded: !isIncluded(pat) }"
                    @click="selectedPattern = pat"
                >
                    <input
                        type="checkbox"
                        class="incl-check"
                        :checked="isIncluded(pat)"
                        title="Include this pattern in the optimization"
                        @click.stop
                        @change="toggleInclude(pat)"
                    />
                    <div class="pattern-title">
                        <PatternDisplay :pattern="pat" :glyphs="glyphs" />
                    </div>
                    <span class="pattern-badges">
                        <span v-if="coveredPatterns.has(pat)" class="cover-dot" title="Has a selected example">✓</span>
                        <span class="count-badge">{{ ommrStore.patternFrequencies[pat] }}</span>
                    </span>
                </div>
                <div v-if="!allPatterns.length" class="sidebar-empty">No patterns match “{{ searchFilter }}”.</div>
            </div>
        </aside>

        <!-- Main: Snippet Gallery -->
        <main class="snippet-gallery-area">
            <div class="gallery-header" v-if="selectedPattern">
                <div class="gallery-title">
                    <h3>
                        <PatternDisplay :pattern="selectedPattern" :glyphs="glyphs" />
                    </h3>
                    <span class="gallery-count">
                        {{ filteredSnippets.length }} candidate{{ filteredSnippets.length === 1 ? '' : 's' }}
                        <template v-if="folioFilter"> · filtered</template>
                    </span>
                </div>

                <div class="gallery-controls">
                    <select v-model="folioFilter" class="folio-select" title="Filter by folio">
                        <option value="">All folios ({{ folioOptions.length }})</option>
                        <option v-for="f in folioOptions" :key="f" :value="f">Fol. {{ f }}</option>
                    </select>
                    <div class="density">
                        <span title="Thumbnail size">🔍</span>
                        <input type="range" min="110" max="240" step="10" v-model.number="cardSize" />
                    </div>
                    <label class="marker-toggle" title="Overlay exact note positions">
                        <input type="checkbox" v-model="showMarkers" /> ⊙ marks
                    </label>
                    <button @click="selectAllVisible" class="btn-xs">Select all</button>
                    <button @click="clearSelection" class="btn-xs" :disabled="selectedSnippets.size === 0">Clear</button>
                </div>
            </div>

            <!-- Optimal-coverage suggestion summary -->
            <div v-if="lastSuggestion" class="suggest-panel">
                <div class="suggest-head">
                    <span>
                        ✨ Covered <b>{{ lastSuggestion.covered }}/{{ lastSuggestion.total }}</b> patterns
                        from <b>{{ lastSuggestion.lineCount }}</b> line{{ lastSuggestion.lineCount === 1 ? '' : 's' }}
                        (of {{ lastSuggestion.totalLines }}). Review per pattern, adjust, then Import.
                    </span>
                    <button class="btn-xs" @click="lastSuggestion = null">Dismiss</button>
                </div>
                <details class="suggest-lines">
                    <summary>Lines used</summary>
                    <ul>
                        <li v-for="(ln, i) in lastSuggestion.lines" :key="i">
                            <span class="ln-loc">Fol. {{ ln.folio }} · {{ ln.lineId.split(':').pop() }}</span>
                            <span class="ln-pats">
                                <PatternDisplay v-for="p in ln.covers" :key="p" :pattern="p" :glyphs="glyphs" class="ln-pat" />
                            </span>
                        </li>
                    </ul>
                </details>
            </div>

            <!-- Grid -->
            <div
                class="snippets-grid"
                v-if="filteredSnippets.length > 0"
                :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }"
            >
                <div
                    v-for="(snip, idx) in visibleSnippets"
                    :key="snip.id"
                    class="snippet-card"
                    :class="{ 'is-selected': selectedSnippets.has(snip.id) }"
                    @click="toggleSelect(snip)"
                >
                    <span v-if="idx === 0 && !folioFilter" class="rep-badge" title="Best representative by shape">★ suggested</span>
                    <span class="check" :class="{ on: selectedSnippets.has(snip.id) }">✓</span>
                    <button class="peek-btn" @click.stop="openPeek(snip)" title="View full page / fix folio">🔍</button>

                    <OmmrSnippet
                        :source="snip.source"
                        :folio="effFolio(snip.folio)"
                        :points="snip.points"
                        :padding="cardPadding"
                        :calibration="calibration"
                        :localSrc="localFor(snip)"
                        :serviceUrl="serviceUrlFor(snip)"
                        :deskewAngle="deskewFor(snip.folio).angle"
                        :pageW="deskewFor(snip.folio).w"
                        :pageH="deskewFor(snip.folio).h"
                        :markers="snip.notePoints"
                        :showMarkers="showMarkers"
                        :width="cardSize - 16"
                        :height="Math.round((cardSize - 16) * 0.66)"
                    />

                    <div class="snippet-meta">
                        <span class="folio-label">Fol. {{ snip.folio }}</span>
                        <span class="aspect-label" :class="{ outlier: Math.abs(snip.aspectRatio - 1.2) > 1.2 }">
                            {{ snip.aspectRatio }}×
                        </span>
                    </div>
                </div>
            </div>

            <div v-else class="empty-pattern-snippets">
                <p>No snippets found for this pattern{{ folioFilter ? ' on folio ' + folioFilter : '' }}.</p>
            </div>

            <!-- Infinite-scroll sentinel + "load more" affordance -->
            <div v-if="hasMore" ref="sentinelRef" class="load-more">
                <div class="progress-spinner small"></div>
                Showing {{ visibleSnippets.length }} of {{ filteredSnippets.length }} — loading more…
            </div>
        </main>
    </div>

    <!-- Full-page peek / folio-mapping modal -->
    <OmmrPageModal
        v-if="peekSnippet"
        :snippet="peekSnippet"
        :effectiveFolio="effFolio(peekSnippet.folio)"
        :deskew="deskewFor(peekSnippet.folio)"
        :folioOffset="folioOffset"
        :serviceUrl="indexMode ? (getIiifCanvasByIndex(peekSnippet.source, canvasIndexFor(peekSnippet.folio))?.serviceUrl || '') : ''"
        :canvasLabel="indexMode ? (getIiifCanvasByIndex(peekSnippet.source, canvasIndexFor(peekSnippet.folio))?.label || '') : ''"
        @close="peekSnippet = null"
        @set-offset="setFolioOffset"
    />

    <!-- Line-coverage preview: staff line strips with pattern labels -->
    <div v-if="showLinePreview" class="preview-overlay" @click.self="showLinePreview = false">
        <div class="preview-panel wide">
            <header class="preview-head">
                <div>
                    <h3>Line coverage preview</h3>
                    <span class="preview-sub" v-if="lineCoverage">
                        {{ lineCoverage.lines.length }} lines · covers {{ lineCoverage.covered }}/{{ lineCoverage.total }} patterns
                        (of {{ lineCoverage.totalLines }} lines)
                    </span>
                </div>
                <button class="close-btn" @click="showLinePreview = false">✕</button>
            </header>
            <div class="preview-body" v-if="lineCoverage">
                <div v-for="(item, i) in lineCoverage.lines" :key="item.line.id + i" class="line-row">
                    <div class="line-meta">
                        <span class="line-loc">Fol. {{ item.line.folio }} · {{ item.line.id.split(':').pop() }}</span>
                        <span class="line-newpats">
                            <span class="newpat-label">adds:</span>
                            <PatternDisplay v-for="p in item.newPatterns" :key="p" :pattern="p" :glyphs="glyphs" class="ln-pat" />
                        </span>
                    </div>
                    <OmmrLineStrip
                        :source="item.line.source"
                        :folio="effFolio(item.line.folio)"
                        :bbox="item.line.bbox"
                        :neumes="markedNeumes(item)"
                        :localSrc="localFor(item.line)"
                        :serviceUrl="serviceUrlFor(item.line)"
                        :deskewAngle="deskewFor(item.line.folio).angle"
                        :pageW="deskewFor(item.line.folio).w"
                        :pageH="deskewFor(item.line.folio).h"
                        :width="820"
                    />
                </div>
            </div>
        </div>
    </div>

    <!-- Final strips preview -->
    <div v-if="showPreview" class="preview-overlay" @click.self="showPreview = false">
        <div class="preview-panel">
            <header class="preview-head">
                <div>
                    <h3>Selection preview</h3>
                    <span class="preview-sub">{{ selectedSnippets.size }} representatives · {{ selectedByPattern.length }} patterns</span>
                </div>
                <div class="preview-actions">
                    <button class="btn-primary" :disabled="selectedSnippets.size === 0"
                            @click="transferSelectedToAnnotations(); showPreview = false">
                        ✓ Import to Manuscript
                    </button>
                    <button class="close-btn" @click="showPreview = false">✕</button>
                </div>
            </header>

            <div class="preview-body">
                <div v-if="selectedByPattern.length === 0" class="preview-empty">Nothing selected yet.</div>
                <div v-for="grp in selectedByPattern" :key="grp.pattern" class="preview-row">
                    <div class="preview-rowhead">
                        <PatternDisplay :pattern="grp.pattern" :glyphs="glyphs" />
                        <span class="preview-name">{{ grp.pattern }}</span>
                    </div>
                    <div class="preview-strips">
                        <div v-for="snip in grp.snippets" :key="snip.id" class="preview-strip">
                            <OmmrSnippet
                                :source="snip.source"
                                :folio="effFolio(snip.folio)"
                                :points="snip.points"
                                :padding="cardPadding"
                                :calibration="calibration"
                                :localSrc="localFor(snip)"
                                :serviceUrl="serviceUrlFor(snip)"
                                :deskewAngle="deskewFor(snip.folio).angle"
                                :pageW="deskewFor(snip.folio).w"
                                :pageH="deskewFor(snip.folio).h"
                                :markers="snip.notePoints"
                                :showMarkers="false"
                                :width="200"
                                :height="76"
                            />
                            <span class="preview-folio">Fol. {{ snip.folio }}</span>
                            <button class="strip-remove" title="Remove from selection" @click="toggleSelect(snip)">✕</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Re-map / Manuscript Correspondence Modal -->
    <div v-if="showRemapModal" class="preview-overlay" @click.self="showRemapModal = false">
        <div class="remap-dialog">
            <header class="preview-head">
                <h3>Map OMMR Dataset to Project Manuscript</h3>
                <button class="close-btn" @click="showRemapModal = false">✕</button>
            </header>
            <div class="remap-body">
                <p class="hint">
                    Select which real project manuscript this OMMR dataset (currently labeled <b>{{ ommrStore.activeSource }}</b>) corresponds to.
                    This connects the project's IIIF manifest and makes imported neumes visible in that manuscript's tables.
                </p>
                <div class="field-row">
                    <label>Target Manuscript:</label>
                    <select v-model="remapTargetSource" class="manuscript-select">
                        <optgroup label="Manuscripts in Project Database">
                            <option v-for="src in availableProjectSources" :key="src.name" :value="src.name">
                                {{ src.name }} {{ src.hasIiif ? '· ✓ IIIF' : '' }} {{ src.folioCount ? `(${src.folioCount} folios)` : '' }}
                            </option>
                        </optgroup>
                        <option value="__custom__">➕ Custom Manuscript Name…</option>
                    </select>
                </div>
                <div v-if="remapTargetSource === '__custom__'" class="field-row">
                    <label>Custom Name:</label>
                    <input v-model="customRemapSource" placeholder="e.g. Paris 14819" class="custom-name-input" />
                </div>
                <div class="remap-actions">
                    <button class="btn-secondary" @click="showRemapModal = false">Cancel</button>
                    <button class="btn-primary" @click="applyRemap">Apply Mapping</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Import: folio naming step -->
    <div v-if="showImportModal" class="preview-overlay" @click.self="closeImport">
        <div class="preview-panel import-panel">
            <header class="preview-head">
                <div>
                    <h3>Import OMMR export</h3>
                    <span class="preview-sub" v-if="importStaging">
                        {{ importStaging.entries.length }} folios detected
                        <template v-if="importStaging.entries.filter(e => e.image).length">
                            · {{ importStaging.entries.filter(e => e.image).length }} with color images
                        </template>
                    </span>
                </div>
                <button class="close-btn" @click="closeImport">✕</button>
            </header>

            <div class="preview-body import-body">
                <div class="field-row">
                    <label>Manuscript source</label>
                    <input v-model="importSourceName" class="url-input" placeholder="e.g. Pa 1235" />
                </div>

                <h4>Folio naming rule</h4>
                <p class="hint">
                    Turn the raw OMMR page folders into folio labels matching your IIIF manifest.
                    “Page → folio” maps sequential pages to recto/verso (1→1r, 2→1v, …); use the offset
                    to line up the first page. Check the page images to identify the true folio.
                </p>
                <div class="preset-row">
                    <button v-for="(p, k) in FOLIO_PRESETS" :key="k"
                            class="btn-xs" :class="{ 'preset-on': folioRule.preset === k }"
                            @click="applyPreset(k)">{{ p.label }}</button>
                </div>

                <div class="rule-grid">
                    <label>Regex match</label>
                    <input v-model="folioRule.pattern" class="url-input" placeholder="e.g. ^.*?(\d+)\D*$"
                           @input="folioRule.preset = 'custom'" />
                    <label>Replace with</label>
                    <input v-model="folioRule.replace" class="url-input" placeholder="e.g. $1"
                           @input="folioRule.preset = 'custom'" />
                    <template v-if="folioRule.mode === 'pagefolio'">
                        <label>Page offset</label>
                        <div class="offset-controls">
                            <button class="btn-xs" @click="folioRule.offset--">−1</button>
                            <span class="offset-pill">{{ folioRule.offset > 0 ? '+' : '' }}{{ folioRule.offset }}</span>
                            <button class="btn-xs" @click="folioRule.offset++">+1</button>
                            <label class="mini-toggle"><input type="checkbox" v-model="folioRule.startVerso" /> start on verso</label>
                        </div>
                    </template>
                    <template v-else>
                        <label>Append suffix</label>
                        <input v-model="folioRule.suffix" class="url-input mini" placeholder="e.g. r" />
                    </template>
                    <label>Strip leading zeros</label>
                    <input type="checkbox" v-model="folioRule.stripZeros" />
                </div>

                <div v-if="importCollision && folioRule.mode !== 'pagefolio'" class="collision-warn">
                    ⚠️ {{ importCollision }} folios map to a name already used — they'll be merged. Adjust the rule.
                </div>

                <div class="preview-headrow">
                    <h4>Preview</h4>
                    <label class="mini-toggle"><input type="checkbox" v-model="showThumbs" /> show page images</label>
                </div>
                <table class="map-table">
                    <thead><tr><th v-if="showThumbs">Page</th><th>Raw folder</th><th>→ Folio</th></tr></thead>
                    <tbody>
                        <tr v-for="row in importPreview" :key="row.raw">
                            <td v-if="showThumbs" class="thumb-cell">
                                <img v-if="row.image" :src="thumbUrl(row.image)" loading="lazy" class="page-thumb" alt="" />
                                <span v-else class="no-thumb">—</span>
                            </td>
                            <td class="raw-cell">{{ row.raw }}</td>
                            <td class="mapped-cell">{{ row.mapped }}</td>
                        </tr>
                    </tbody>
                </table>
                <p class="hint mini" v-if="importStaging && importStaging.entries.length > importPreview.length">
                    Showing {{ importPreview.length }} of {{ importStaging.entries.length }}.
                </p>
            </div>

            <footer class="import-foot">
                <button class="btn-secondary" @click="closeImport">Cancel</button>
                <button class="btn-primary" @click="commitImport" :disabled="!importSourceName.trim()">
                    Import {{ importStaging ? importStaging.entries.length : 0 }} folios
                </button>
            </footer>
        </div>
    </div>

    <!-- Settings drawer -->
    <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
        <div class="settings-panel">
            <div class="settings-head">
                <h3>OMMR Explorer Settings</h3>
                <button class="close-btn" @click="showSettings = false">✕</button>
            </div>

            <section class="settings-section" v-if="ommrStore.activeSource">
                <h4>Manuscript Correspondence</h4>
                <p class="hint">
                    Currently linked to: <b>{{ ommrStore.activeSource }}</b>
                    <span v-if="activeProjectManuscript">
                        (Project manuscript · {{ matchingProjectFoliosCount }} matching folios)
                    </span>
                </p>
                <div class="field-row">
                    <label>Project Source</label>
                    <select :value="ommrStore.activeSource" @change="applyRemap($event.target.value)" class="manuscript-select">
                        <optgroup label="Manuscripts in Project Database">
                            <option v-for="src in availableProjectSources" :key="src.name" :value="src.name">
                                {{ src.name }} {{ src.hasIiif ? '· ✓ IIIF' : '' }}
                            </option>
                        </optgroup>
                    </select>
                </div>
                <div class="field-row">
                    <label>Rename / Custom</label>
                    <input v-model="renameInput" class="url-input" @keyup.enter="applyRename" />
                    <button class="btn-xs" @click="applyRename" :disabled="!renameInput.trim() || renameInput.trim() === ommrStore.activeSource">Rename</button>
                </div>
                <div class="field-row" v-if="ommrStore.activeLines.length" style="margin-top: 10px;">
                    <button class="btn-secondary" style="width: 100%; justify-content: center;" @click="importAllLines">
                        🎼 Import All {{ ommrStore.activeLines.length }} Staff Line Regions
                    </button>
                </div>
                <div class="field-row" style="margin-top: 8px;">
                    <button class="btn-xs btn-danger-outline" style="width: 100%; justify-content: center; padding: 6px;" @click="showCleanupModal = true">
                        🗑 Manage / Delete Annotations for {{ ommrStore.activeSource }}
                    </button>
                </div>
            </section>

            <section class="settings-section" v-if="ommrStore.activeSource">
                <h4>Image source</h4>
                <div class="img-source-badge" :class="ommrStore.hasLocalImages ? 'local' : (imagesResolve ? 'iiif' : 'none')">
                    <span v-if="ommrStore.hasLocalImages">
                        ✓ Using local deskewed images — exact crops, no calibration needed
                        ({{ Object.keys(ommrStore.localImages[ommrStore.activeSource] || {}).length }} folios)
                    </span>
                    <span v-else-if="imagesResolve">
                        ◇ Using IIIF regions with automatic deskew correction
                        <span v-if="deskewedCount"> — {{ deskewedCount }} folios rotated back into place</span>
                    </span>
                    <span v-else>⚠️ No image source yet</span>
                </div>
                <p class="hint">
                    OMMR coordinates live in the deskewed image (<code>{{ pageMeta?.imageFilename || 'color_deskewed.jpg' }}</code>).
                    Each neume's region is rotated back by that folio's <code>deskewing_degrees</code> (from meta.json)
                    so it lands correctly on the IIIF original — no manual alignment needed.
                </p>
                <label class="toggle-row" v-if="ommrStore.hasLocalImages">
                    <input type="checkbox" v-model="preferIiif" />
                    Prefer IIIF images (ignore the bundled local images)
                </label>
            </section>

            <section class="settings-section">
                <h4>IIIF Manifest</h4>
                <p class="hint">
                    Neume thumbnails are cropped on-demand from the manuscript's IIIF images.
                    Link the manifest for the source below.
                </p>
                <div class="field-row">
                    <label>Resolves to IIIF key</label>
                    <div class="value-static">{{ resolvedIiifKey || '—' }}</div>
                </div>
                <div class="field-row">
                    <label>Manifest URL</label>
                    <input
                        v-model="manifestUrlInput"
                        type="url"
                        placeholder="https://gallica.bnf.fr/iiif/ark:/.../manifest.json"
                        class="url-input"
                        @keyup.enter="saveManifestUrl"
                    />
                </div>

                <div class="manifest-status-line" :class="manifestState.status">
                    <span v-if="manifestState.status === 'ok'">✓ Loaded — {{ manifestState.count }} canvases</span>
                    <span v-else-if="manifestState.status === 'loading'">↻ Loading manifest…</span>
                    <span v-else-if="manifestState.status === 'error'">⚠️ {{ manifestState.error }}</span>
                    <span v-else-if="manifestState.status === 'linked'">Linked, not yet loaded.</span>
                    <span v-else-if="manifestState.status === 'unlinked'">No manifest linked for this source.</span>
                    <span v-else>Load OMMR data first.</span>
                </div>

                <div
                    v-if="manifestState.status === 'ok'"
                    class="manifest-status-line"
                    :class="resolveSample.matched ? 'ok' : 'error'"
                >
                    Folio match probe: {{ resolveSample.matched }}/{{ resolveSample.total }} sampled folios resolve.
                    <span v-if="!resolveSample.matched">
                        — labels may differ (e.g. OMMR “47r” vs. manifest “f. 47r”).
                    </span>
                </div>

                <!-- Per-folio resolution diagnostic -->
                <details v-if="manifestState.status === 'ok'" class="diag">
                    <summary>Folio resolution ({{ resolveSample.matched }}/{{ resolveSample.total }})</summary>
                    <ul class="diag-list">
                        <li v-for="d in sampleDiagnostics" :key="d.folio" :class="{ bad: !d.matched }">
                            <span>{{ d.folio }}<span v-if="d.eff !== d.folio"> → {{ d.eff }}</span></span>
                            <span>{{ d.matched ? '✓ ' + (d.label || d.eff) : '✗ no canvas' }}</span>
                        </li>
                    </ul>
                    <p class="hint mini">Canvas count in manifest: {{ manifestState.count }}. If folios don't match, adjust the folio offset below.</p>
                </details>

                <label class="toggle-row" style="margin-top:10px;">
                    <input type="checkbox" :checked="indexMode" @change="setIndexMode($event.target.checked)" />
                    Folios are page indices (…_022) — match by canvas position
                    <span v-if="indexMode" class="hint mini" style="margin:0;">· manifest has {{ getIiifCanvasCount(ommrStore.activeSource) }} canvases</span>
                </label>

                <div class="field-row" style="margin-top:10px;">
                    <label>Folio offset</label>
                    <div class="offset-controls">
                        <button class="btn-xs" @click="setFolioOffset(folioOffset - 2)">− folio</button>
                        <button class="btn-xs" @click="setFolioOffset(folioOffset - 1)">− side</button>
                        <span class="offset-pill">{{ folioOffset > 0 ? '+' : '' }}{{ folioOffset }}</span>
                        <button class="btn-xs" @click="setFolioOffset(folioOffset + 1)">+ side</button>
                        <button class="btn-xs" @click="setFolioOffset(folioOffset + 2)">+ folio</button>
                        <button class="btn-xs ghost" @click="setFolioOffset(0)" :disabled="!folioOffset">Reset</button>
                    </div>
                </div>
                <p class="hint mini">Shifts every OMMR folio onto the IIIF canvases. Use the 🔍 on a snippet to verify against the full page.</p>

                <div class="settings-actions">
                    <button class="btn-primary" @click="saveManifestUrl" :disabled="!manifestUrlInput.trim()">
                        Load manifest
                    </button>
                    <button
                        v-if="manifestState.url"
                        class="btn-secondary"
                        @click="refreshManifest"
                        title="Clear caches and re-fetch"
                    >↻ Refresh cache</button>
                </div>
            </section>

            <section class="settings-section">
                <h4>Thumbnail crop padding</h4>
                <p class="hint">How much surrounding context to include around each neume box.</p>
                <div class="field-row">
                    <input type="range" min="0" max="1" step="0.05" v-model.number="cardPadding" />
                    <div class="value-static">{{ Math.round(cardPadding * 100) }}%</div>
                </div>
            </section>

            <section class="settings-section" v-if="!ommrStore.hasLocalImages">
                <h4>Deskew correction (automatic)</h4>
                <p class="hint">
                    The neume regions are automatically rotated back by each folio's
                    <code>deskewing_degrees</code>. The optional nudge below only corrects any small
                    residual offset (e.g. if the IIIF original is cropped slightly differently).
                </p>

                <!-- Live preview: deskew off vs. on for one sample neume -->
                <div class="calib-preview" v-if="sampleSnippet && imagesResolve">
                    <div class="calib-cell">
                        <OmmrSnippet
                            :key="'nodeskew'"
                            :source="sampleSnippet.source"
                            :folio="sampleSnippet.folio"
                            :points="sampleSnippet.points"
                            :padding="0.6" :width="150" :height="110" :resolution="600"
                        />
                        <small>deskew off</small>
                    </div>
                    <span class="calib-arrow">→</span>
                    <div class="calib-cell">
                        <OmmrSnippet
                            :key="'deskew-' + deskewFor(sampleSnippet.folio).angle + calibration.dx + calibration.dy"
                            :source="sampleSnippet.source"
                            :folio="sampleSnippet.folio"
                            :points="sampleSnippet.points"
                            :calibration="calibration"
                            :deskewAngle="deskewFor(sampleSnippet.folio).angle"
                            :pageW="deskewFor(sampleSnippet.folio).w"
                            :pageH="deskewFor(sampleSnippet.folio).h"
                            :padding="0.6" :width="150" :height="110" :resolution="600"
                        />
                        <small>deskew on ({{ deskewFor(sampleSnippet.folio).angle }}°)</small>
                    </div>
                </div>
                <p class="hint mini" v-if="sampleSnippet">Sample: Fol. {{ sampleSnippet.folio }}</p>

                <div class="calib-grid">
                    <label>Offset X</label>
                    <input type="range" min="-15" max="15" step="0.25"
                           :value="calibration.dx" @input="updateCalib({ dx: +$event.target.value })" />
                    <span>{{ calibration.dx.toFixed(2) }}%</span>

                    <label>Offset Y</label>
                    <input type="range" min="-15" max="15" step="0.25"
                           :value="calibration.dy" @input="updateCalib({ dy: +$event.target.value })" />
                    <span>{{ calibration.dy.toFixed(2) }}%</span>

                    <label>Scale X</label>
                    <input type="range" min="0.85" max="1.15" step="0.005"
                           :value="calibration.sx" @input="updateCalib({ sx: +$event.target.value })" />
                    <span>{{ calibration.sx.toFixed(3) }}</span>

                    <label>Scale Y</label>
                    <input type="range" min="0.85" max="1.15" step="0.005"
                           :value="calibration.sy" @input="updateCalib({ sy: +$event.target.value })" />
                    <span>{{ calibration.sy.toFixed(3) }}</span>
                </div>
                <div class="settings-actions">
                    <button class="btn-secondary" @click="resetCalib">Reset alignment</button>
                </div>
            </section>

            <section class="settings-section" v-if="iiifStore.links && Object.keys(iiifStore.links).length">
                <h4>Known manifests</h4>
                <ul class="manifest-list">
                    <li v-for="(url, src) in iiifStore.links" :key="src">
                        <span class="mf-src">{{ src }}</span>
                        <span class="mf-badge" :class="iiifStore.manifestStatus[src]?.status || 'idle'">
                            {{ iiifStore.parsedData[src]?.length ? iiifStore.parsedData[src].length + ' pages' : (iiifStore.manifestStatus[src]?.status || 'not loaded') }}
                        </span>
                    </li>
                </ul>
            </section>
        </div>
    </div>

    <!-- Manuscript Cleanup Modal -->
    <ManuscriptCleanupModal
        :isOpen="showCleanupModal"
        :source="ommrStore.activeSource"
        @close="showCleanupModal = false"
        @deleted="flash"
    />
</div>
</template>

<style scoped>
.ommr-explorer-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
    color: var(--color-text);
}

.explorer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4) var(--space-6);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    flex-wrap: wrap;
    gap: 12px;
}
.header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.title-with-switcher {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
}
.title-with-switcher h2 { margin: 0; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.01em; }
.title-sub { font-size: 0.82rem; font-weight: 500; color: var(--color-text-muted); }
.source-switcher-container {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--color-surface-muted, rgba(255,255,255,0.05));
    border: 1px solid var(--color-border);
    padding: 3px 8px;
    border-radius: 6px;
}
.switcher-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-weight: 600;
}
.source-switcher-select {
    background: var(--color-bg);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
}
.single-source-name {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-primary);
}
.ghost-btn {
    background: transparent;
    border: 1px dashed var(--color-border);
    color: var(--color-text-muted);
    font-size: 0.72rem;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
}
.ghost-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
}

.source-meta-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 2px;
}
.source-tag { font-size: 0.8rem; color: var(--color-text-muted); }

.proj-badge, .iiif-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.72rem;
    font-weight: 600;
}
.proj-badge {
    background: rgba(99, 102, 241, 0.12);
    color: var(--color-primary);
}
.proj-badge.has-match {
    background: rgba(16, 185, 129, 0.15);
    color: var(--color-success);
}
.proj-badge.unlinked {
    background: rgba(255, 255, 255, 0.07);
    color: var(--color-text-muted);
}
.iiif-badge.ok { background: rgba(16, 185, 129, 0.15); color: var(--color-success); }
.iiif-badge.loading { background: rgba(99, 102, 241, 0.12); color: var(--color-primary); }
.iiif-badge.error, .iiif-badge.unlinked { background: rgba(245, 158, 11, 0.14); color: var(--color-warning, #f59e0b); }

.header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.action-group {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px; border-radius: 9px;
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
}
.action-group .btn-secondary { border: 1px solid transparent; background: transparent; box-shadow: none; }
.action-group .btn-secondary:hover:not(:disabled) { background: var(--color-surface); border-color: var(--color-border); }
.commit-group { background: transparent; border-color: transparent; padding: 0; }
.icon-btn { position: relative; padding: 8px 10px; font-size: 1rem; line-height: 1; }
@media (max-width: 1100px) {
    .action-group { padding: 3px; }
    .header-actions { gap: 6px; }
}

.status-banner,
.progress-banner,
.warn-banner {
    padding: 8px 16px;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: center;
}
.status-banner {
    background: rgba(16, 185, 129, 0.15);
    border-bottom: 1px solid var(--color-success);
    color: var(--color-success);
}
.progress-banner {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    background: rgba(99, 102, 241, 0.12);
    border-bottom: 1px solid var(--color-primary);
    color: var(--color-primary);
}
.warn-banner {
    display: flex; align-items: center; justify-content: center; gap: 12px;
    background: rgba(245, 158, 11, 0.15);
    border-bottom: 1px solid var(--color-warning, #f59e0b);
    color: var(--color-warning, #f59e0b);
}

.upload-btn { cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }

.btn-primary {
    background: var(--color-primary); color: white; border: none;
    padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;
    transition: all 0.2s ease;
}
.btn-primary:hover:not(:disabled) { background: var(--color-primary-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
    background: var(--color-surface-muted); color: var(--color-text);
    border: 1px solid var(--color-border); padding: 8px 16px; border-radius: 6px;
    font-weight: 500; cursor: pointer; transition: all 0.2s ease;
}
.btn-secondary:hover { background: var(--color-border); }

.btn-xs {
    background: var(--color-surface-muted); color: var(--color-text);
    border: 1px solid var(--color-border); padding: 4px 10px; border-radius: 4px;
    font-size: 0.75rem; font-weight: 500; cursor: pointer;
}
.btn-xs:hover:not(:disabled) { background: var(--color-border); }
.btn-xs:disabled { opacity: 0.4; cursor: not-allowed; }

/* Empty state and import card */
.empty-explorer { flex: 1; display: flex; justify-content: center; align-items: center; padding: 40px; }
.empty-card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: 14px; padding: 36px 40px; max-width: 620px; width: 100%; text-align: center;
    box-shadow: 0 16px 36px rgba(0,0,0,0.12);
}
.empty-icon { font-size: 44px; display: block; margin-bottom: 10px; }
.empty-card h3 { margin: 0 0 8px 0; font-size: 1.3rem; }
.empty-card p { color: var(--color-text-muted); font-size: 0.9rem; line-height: 1.5; margin-bottom: 20px; }

.import-setup-box {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 20px;
    text-align: left;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.step-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.step-label {
    font-size: 0.85rem;
    color: var(--color-text);
}
.manuscript-select {
    width: 100%;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.88rem;
    box-sizing: border-box;
}
.custom-name-input {
    width: 100%;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.88rem;
    box-sizing: border-box;
}
.upload-row {
    align-items: flex-start;
}
.btn-large {
    padding: 12px 24px;
    font-size: 0.95rem;
    width: 100%;
    box-sizing: border-box;
}
.empty-subtext {
    font-size: 0.78rem;
    color: var(--color-text-muted);
    line-height: 1.4;
    margin: 0;
}

/* Remap modal */
.remap-dialog {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    width: min(520px, 94vw);
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}
.remap-body {
    padding: 20px;
}
.remap-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
}

.explorer-body { flex: 1; display: flex; overflow: hidden; }

.pattern-sidebar {
    width: 320px; background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex; flex-direction: column; flex-shrink: 0;
}
.sidebar-search { padding: 12px; border-bottom: 1px solid var(--color-border); }
.search-input {
    width: 100%; box-sizing: border-box; padding: 8px 12px;
    border: 1px solid var(--color-border); border-radius: 6px;
    background: var(--color-bg); color: var(--color-text); font-size: 0.9rem;
}
.sort-controls, .include-controls {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 12px; border-bottom: 1px solid var(--color-border);
    font-size: 0.78rem; color: var(--color-text-muted);
}
.sort-select {
    background: var(--color-bg); color: var(--color-text);
    border: 1px solid var(--color-border); border-radius: 4px;
    padding: 2px 6px; font-size: 0.78rem;
}
.incl-btns { display: flex; gap: 4px; }
.pattern-list { flex: 1; overflow-y: auto; list-style: none; margin: 0; padding: 0; }
.pattern-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px; border-bottom: 1px solid var(--color-border);
    cursor: pointer; transition: background 0.15s ease;
}
.pattern-item:hover { background: var(--color-surface-hover, rgba(255,255,255,0.03)); }
.pattern-item.active {
    background: var(--color-primary-soft, rgba(99, 102, 241, 0.15));
    border-left: 3px solid var(--color-primary);
}
.pattern-item-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.pat-info { display: flex; flex-direction: column; min-width: 0; }
.pattern-item-right { display: flex; align-items: center; gap: 8px; }
.pat-freq {
    font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted);
    background: var(--color-bg); padding: 2px 6px; border-radius: 10px;
}
.pat-selected-badge {
    font-size: 0.7rem; font-weight: 700; color: var(--color-primary);
    background: rgba(99, 102, 241, 0.15); padding: 2px 6px; border-radius: 10px;
}
.include-cb { cursor: pointer; accent-color: var(--color-primary); }

.detail-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.detail-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 20px; border-bottom: 1px solid var(--color-border);
    background: var(--color-surface); flex-wrap: wrap; gap: 8px;
}
.detail-title { display: flex; align-items: center; gap: 12px; }
.detail-meta { font-size: 0.8rem; color: var(--color-text-muted); margin-left: 8px; }
.detail-actions { display: flex; align-items: center; gap: 8px; }
.folio-filter-input {
    padding: 4px 8px; border: 1px solid var(--color-border); border-radius: 4px;
    background: var(--color-bg); color: var(--color-text); font-size: 0.78rem; width: 110px;
}

.snippets-grid {
    flex: 1; overflow-y: auto; padding: 16px 20px;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px; align-content: start;
}
.snippet-card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: 8px; padding: 8px; display: flex; flex-direction: column;
    align-items: center; cursor: pointer; transition: all 0.15s ease;
    position: relative; user-select: none;
}
.snippet-card:hover {
    border-color: var(--color-primary);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    transform: translateY(-1px);
}
.snippet-card.selected {
    border-color: var(--color-primary);
    background: var(--color-primary-soft, rgba(99, 102, 241, 0.08));
    box-shadow: 0 0 0 2px var(--color-primary);
}
.snippet-card.rep { border-color: rgba(99, 102, 241, 0.6); }

.snippet-wrap { position: relative; width: 100%; display: flex; justify-content: center; }
.btn-peek {
    position: absolute; top: 2px; right: 2px;
    width: 24px; height: 24px; border-radius: 4px;
    background: rgba(0, 0, 0, 0.6); color: white; border: none;
    font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.15s ease;
}
.snippet-card:hover .btn-peek { opacity: 1; }
.btn-peek:hover { background: var(--color-primary); }

.snippet-footer {
    display: flex; justify-content: space-between; align-items: center;
    width: 100%; margin-top: 6px; padding-top: 4px;
    border-top: 1px solid var(--color-border); font-size: 0.75rem;
}
.snippet-folio { color: var(--color-text-muted); font-weight: 500; }
.snippet-density { font-size: 0.68rem; color: var(--color-text-muted); }
.rep-badge {
    font-size: 0.68rem; font-weight: 700; color: var(--color-primary);
    background: rgba(99, 102, 241, 0.15); padding: 1px 5px; border-radius: 8px;
}
.select-indicator {
    font-size: 0.75rem; font-weight: 700; color: var(--color-primary);
}

.no-snippets {
    grid-column: 1 / -1; color: var(--color-text-muted);
    text-align: center; padding: 40px;
}

.no-pattern-selected {
    flex: 1; display: flex; justify-content: center; align-items: center;
    color: var(--color-text-muted);
}

/* Settings button attention state */
.btn-secondary.needs-attention { border-color: var(--color-warning, #f59e0b); }
.attn-dot {
    display: inline-flex; align-items: center; justify-content: center;
    width: 14px; height: 14px; margin-left: 6px; border-radius: 50%;
    background: var(--color-warning, #f59e0b); color: #1a1200;
    font-size: 10px; font-weight: 800;
}

/* Settings drawer */
.settings-overlay {
    position: fixed; inset: 0; z-index: 100;
    background: rgba(0, 0, 0, 0.45);
    display: flex; justify-content: flex-end;
}
.settings-panel {
    width: 420px; max-width: 90vw; height: 100%; overflow-y: auto;
    background: var(--color-surface); border-left: 1px solid var(--color-border);
    box-shadow: -8px 0 24px rgba(0,0,0,0.25);
    padding: 20px; box-sizing: border-box;
    animation: slideIn 0.2s ease;
}
@keyframes slideIn { from { transform: translateX(30px); opacity: 0.4; } to { transform: none; opacity: 1; } }
.settings-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.settings-head h3 { margin: 0; font-size: 1.1rem; }
.close-btn { background: none; border: none; color: var(--color-text-muted); font-size: 1.1rem; cursor: pointer; }
.settings-section { padding: 16px 0; border-top: 1px solid var(--color-border); }
.settings-section h4 { margin: 0 0 6px 0; font-size: 0.95rem; }
.hint { font-size: 0.8rem; color: var(--color-text-muted); margin: 0 0 12px 0; line-height: 1.4; }
.field-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.field-row > label { flex: 0 0 130px; font-size: 0.8rem; color: var(--color-text-muted); }
.value-static { font-size: 0.85rem; font-weight: 600; }
.url-input {
    flex: 1; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: 6px;
    background: var(--color-bg); color: var(--color-text); font-size: 0.82rem; box-sizing: border-box;
}
.field-row input[type="range"] { flex: 1; }
.manifest-status-line { font-size: 0.8rem; margin: 6px 0 12px 0; font-weight: 600; }
.manifest-status-line.ok { color: var(--color-success); }
.manifest-status-line.error { color: var(--color-danger, #ef4444); }
.manifest-status-line.loading { color: var(--color-primary); }
.manifest-status-line.unlinked, .manifest-status-line.linked { color: var(--color-text-muted); }
.settings-actions { display: flex; gap: 8px; }
.manifest-list { list-style: none; margin: 0; padding: 0; }
.manifest-list li { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 0.8rem; border-bottom: 1px solid var(--color-border); }
.mf-src { font-weight: 600; }
.mf-badge { color: var(--color-text-muted); font-size: 0.72rem; }
.mf-badge.ok { color: var(--color-success); }
.mf-badge.error { color: var(--color-danger, #ef4444); }

.hint.mini { font-size: 0.72rem; margin: 4px 0 12px 0; text-align: center; }
.calib-preview {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    padding: 10px; background: var(--color-bg); border-radius: 8px;
    border: 1px solid var(--color-border);
}
.calib-arrow { color: var(--color-text-muted); font-size: 1.2rem; }
.calib-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.calib-cell small { font-size: 0.68rem; color: var(--color-text-muted); }
.offset-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.offset-controls .btn-xs.ghost { color: var(--color-text-muted); font-weight: 500; }
.offset-pill {
    font-size: 0.78rem; font-weight: 700; padding: 2px 8px; border-radius: 10px;
    background: var(--color-bg); color: var(--color-primary); min-width: 34px; text-align: center;
}
.diag { margin: 8px 0; font-size: 0.78rem; }
.diag summary { cursor: pointer; color: var(--color-text-muted); }
.diag-list { list-style: none; margin: 8px 0 0 0; padding: 0; }
.diag-list li {
    display: flex; justify-content: space-between; gap: 10px; padding: 3px 0;
    border-bottom: 1px solid var(--color-border); font-variant-numeric: tabular-nums;
}
.diag-list li.bad { color: var(--color-danger, #ef4444); }
.toggle-row { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; margin-top: 8px; cursor: pointer; }

/* Selection preview modal */
.preview-overlay {
    position: fixed; inset: 0; z-index: 150; background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center; padding: 24px;
}
.preview-panel {
    background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 12px;
    width: min(1000px, 95vw); max-height: 92vh; display: flex; flex-direction: column;
    overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}
.preview-panel.wide { width: min(920px, 96vw); }
.import-panel { width: min(680px, 95vw); }
.import-body { padding: 16px 18px; }
.import-body h4 { margin: 16px 0 6px; font-size: 0.95rem; }
.preset-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.preset-on { background: var(--color-primary) !important; color: #fff !important; border-color: var(--color-primary) !important; }
.rule-grid { display: grid; grid-template-columns: 130px 1fr; gap: 8px 10px; align-items: center; }
.rule-grid > label { font-size: 0.8rem; color: var(--color-text-muted); }
.url-input.mini { max-width: 100px; }
.collision-warn { margin: 12px 0; font-size: 0.82rem; color: var(--color-warning, #f59e0b); font-weight: 600; }
.map-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.map-table th { text-align: left; color: var(--color-text-muted); font-weight: 600; padding: 4px 6px; border-bottom: 1px solid var(--color-border); }
.map-table td { padding: 3px 6px; border-bottom: 1px solid var(--color-border); font-variant-numeric: tabular-nums; }
.raw-cell { color: var(--color-text-muted); }
.mapped-cell { font-weight: 600; }
.import-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--color-border); background: var(--color-surface); }
.preview-headrow { display: flex; align-items: center; justify-content: space-between; }
.mini-toggle { display: inline-flex; align-items: center; gap: 5px; font-size: 0.76rem; color: var(--color-text-muted); cursor: pointer; }
.thumb-cell { width: 96px; }
.page-thumb { width: 88px; height: 58px; object-fit: cover; border-radius: 3px; border: 1px solid var(--color-border); display: block; background: #0f172a; }
.no-thumb { color: var(--color-text-muted); }
.offset-controls .mini-toggle { margin-left: 8px; }
.line-row { padding: 10px 0 16px; border-bottom: 1px solid var(--color-border); }
.line-meta { display: flex; align-items: center; gap: 14px; margin-bottom: 6px; flex-wrap: wrap; }
.line-loc { font-weight: 600; font-size: 0.82rem; }
.line-newpats { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.newpat-label { font-size: 0.72rem; color: var(--color-text-muted); }
.line-newpats .ln-pat { transform: scale(0.8); }
.preview-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 18px; border-bottom: 1px solid var(--color-border); background: var(--color-surface);
}
.preview-head h3 { margin: 0; font-size: 1.1rem; }
.preview-sub { font-size: 0.8rem; color: var(--color-text-muted); }
.preview-actions { display: flex; align-items: center; gap: 12px; }
.preview-body { overflow-y: auto; padding: 16px 18px; }
.preview-empty { color: var(--color-text-muted); text-align: center; padding: 40px; }
.preview-row { display: flex; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--color-border); }
.preview-rowhead { flex: 0 0 120px; display: flex; flex-direction: column; gap: 4px; padding-top: 4px; }
.preview-name { font-size: 0.78rem; color: var(--color-text-muted); font-style: italic; }
.preview-strips { display: flex; flex-wrap: wrap; gap: 12px; flex: 1; }
.preview-strip { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.preview-strip:hover .strip-remove { opacity: 1; }
.preview-folio { font-size: 0.72rem; color: var(--color-text-muted); }
.strip-remove {
    position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%;
    border: none; background: var(--color-danger, #ef4444); color: white; font-size: 10px;
    cursor: pointer; opacity: 0; transition: opacity 0.15s ease;
}
.calib-grid {
    display: grid; grid-template-columns: 70px 1fr 52px; align-items: center;
    gap: 8px 10px; margin: 12px 0;
}
.calib-grid > label { font-size: 0.78rem; color: var(--color-text-muted); }
.calib-grid > span { font-size: 0.75rem; font-variant-numeric: tabular-nums; text-align: right; }

.img-source-badge {
    padding: 8px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;
    margin-bottom: 10px;
}
.img-source-badge.local { background: rgba(16, 185, 129, 0.15); color: var(--color-success); }
.img-source-badge.iiif { background: rgba(99, 102, 241, 0.12); color: var(--color-primary); }
.img-source-badge.none { background: rgba(245, 158, 11, 0.14); color: var(--color-warning, #f59e0b); }
</style>
