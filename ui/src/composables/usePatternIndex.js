import { computed } from 'vue';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useAnnotationsStore } from '../stores/annotations';
import { useSettingsStore } from '../stores/settings';
import { usePatternLibraryStore } from '../stores/patternLibrary';
import { useTranscriptionData } from './useTranscriptionData';
import { getBaseCode } from '../utils/patternCode';
import { stripSignKeys } from '../utils/signs';
import { parsePageKey } from '../utils/keys';

/**
 * Collects every pattern the workspace knows about:
 *
 *   1. the transcription data (for the sources already loaded),
 *   2. the manuscripts' equivalent tables,
 *   3. the polygon annotations,
 *   4. the project's code variants (settings.codeVariants),
 *   5. patterns added by hand in the library — shapes that exist only on a scan.
 *
 * Also gathers a handful of annotation cutouts per pattern, so the library can
 * show what the sign actually looks like on the page.
 */
const MAX_EXAMPLES = 8;

export function usePatternIndex() {
    const tableStore = usePersonalTablesStore();
    const annotStore = useAnnotationsStore();
    const settings = useSettingsStore();
    const library = usePatternLibraryStore();
    const { rawData, glyphs, loadSource, loading } = useTranscriptionData();

    const signKeys = computed(() => settings.customSigns.map(s => s.key));

    /** Manuscript sources that have an equivalents table. */
    const sources = computed(() => {
        const set = new Set();
        for (const t of tableStore.tables) {
            if (t.source) set.add(t.source);
        }
        return Array.from(set).sort();
    });

    async function loadAllSources() {
        await Promise.all(sources.value.map(s => loadSource(s)));
    }

    /**
     * code -> {
     *   code, sources: Set, dataCount, annotationCount, manual, isCodeVariant,
     *   baseCode, examples: [{ source, folio, lineName, regionId, id, points, variant }]
     * }
     */
    const index = computed(() => {
        const map = new Map();
        const keys = signKeys.value;

        const entry = (code) => {
            const key = getBaseCode(code);
            if (!key) return null;
            if (!map.has(key)) {
                map.set(key, {
                    code: key,
                    sources: new Set(),
                    dataCount: 0,
                    annotationCount: 0,
                    manual: false,
                    isCodeVariant: false,
                    baseCode: stripSignKeys(key, keys) || key,
                    examples: []
                });
            }
            return map.get(key);
        };

        // 1. Transcription data
        for (const [source, patterns] of Object.entries(rawData.value || {})) {
            for (const [pattern, occs] of Object.entries(patterns || {})) {
                const e = entry(pattern);
                if (!e) continue;
                e.sources.add(source);
                e.dataCount += Array.isArray(occs) ? occs.length : 0;
            }
        }

        // 2. Equivalent tables
        for (const t of tableStore.tables) {
            for (const row of t.rows || []) {
                const e = entry(row.pattern);
                if (e && t.source) e.sources.add(t.source);
            }
        }

        // 3. Annotations
        for (const t of tableStore.tables) {
            if (!t.source) continue;
            for (const [key, pageRegions] of Object.entries(annotStore.regions || {})) {
                const k = parsePageKey(key);
                if (k?.source !== t.source) continue;
                const folio = k.folio;

                for (const r of pageRegions || []) {
                    for (const item of annotStore.regionItems?.[r.id] || []) {
                        if (!item || !item.pattern) continue;
                        const e = entry(item.pattern);
                        if (!e) continue;
                        e.sources.add(t.source);
                        e.annotationCount += 1;
                        if (item.points && e.examples.length < MAX_EXAMPLES) {
                            e.examples.push({
                                id: item.id,
                                source: t.source,
                                folio,
                                lineName: r.name,
                                regionId: r.id,
                                points: item.points,
                                variant: item.variant || ''
                            });
                        }
                    }
                }
            }
        }

        // 4. Project code variants
        for (const [base, list] of Object.entries(settings.codeVariants || {})) {
            entry(base);
            for (const v of list || []) {
                const e = entry(v.code);
                if (!e) continue;
                e.isCodeVariant = true;
                e.baseCode = base;
            }
        }

        // 5. Manual library entries
        for (const code of library.manualCodes()) {
            const e = entry(code);
            if (e) e.manual = true;
        }

        return map;
    });

    const allCodes = computed(() => Array.from(index.value.keys()));

    function getInfo(code) {
        return index.value.get(getBaseCode(code)) || null;
    }

    /**
     * Ref-ID label for a pattern. Secondary information now — the pattern code
     * identifies a pattern; the Ref-ID only ties it back to the printed volume.
     * Falls back to the base pattern's ID for a code variant.
     */
    function refIdFor(code, source = null) {
        const key = getBaseCode(code);
        const base = stripSignKeys(key, signKeys.value);

        const tables = source
            ? tableStore.tables.filter(t => t.source === source)
            : tableStore.tables;

        for (const candidate of [key, base]) {
            if (!candidate) continue;
            for (const t of tables) {
                const row = (t.rows || []).find(r => getBaseCode(r.pattern) === candidate);
                if (row?.customId) return row.customId;
            }
            const global = settings.getGlobalId(candidate);
            if (global) return global;
        }
        return '';
    }

    return {
        sources,
        loadAllSources,
        index,
        allCodes,
        getInfo,
        refIdFor,
        signKeys,
        glyphs,
        loading
    };
}
