import { ref, computed, watch, onMounted } from 'vue';
import { useOmmrStore } from '../../stores/ommr';
import { useAnnotationsStore } from '../../stores/annotations';
import { usePersonalTablesStore } from '../../stores/personalTables';
import { useIiifStore } from '../../stores/iiif';
import { useTranscriptionData } from '../useTranscriptionData';
import { bakeSnippet, bakeLine } from '../../utils/ommrBake';
import { useOmmrPrefs } from './useOmmrPrefs';
import { useOmmrImages } from './useOmmrImages';
import { useOmmrCatalog } from './useOmmrCatalog';
import { useOmmrImport } from './useOmmrImport';

/**
 * Everything the OMMR explorer's screens share, in one object.
 *
 * The explorer is one feature with several screens — header, pattern sidebar,
 * snippet gallery, previews, settings drawer, import dialog. They all read and
 * change the same state (what is loaded, what is selected, which dialog is open),
 * so the view creates it once and provides it (see ommrContext.js); each screen
 * takes what it needs from it.
 *
 * It is assembled from focused pieces:
 *   useOmmrPrefs    how it looks (per browser)
 *   useOmmrImages   where page images come from and how folios map onto them
 *   useOmmrCatalog  the pattern catalog, the candidate snippets, the selection
 *   useOmmrImport   reading an export folder and the import dialog
 * and adds the manuscript linking, the dialogs' open/closed state and the actions
 * that write into the workspace.
 */
export function useOmmrExplorer() {
    const ommrStore = useOmmrStore();
    const annotStore = useAnnotationsStore();
    const personalTablesStore = usePersonalTablesStore();
    const iiifStore = useIiifStore();
    const { sourceFolios, manifests, glyphs } = useTranscriptionData();

    // --- Messages ---
    const statusMessage = ref('');
    function flash(message) {
        statusMessage.value = message;
        setTimeout(() => { statusMessage.value = ''; }, 4000);
    }

    const prefs = useOmmrPrefs();
    const images = useOmmrImages({ preferIiif: prefs.preferIiif });
    const catalog = useOmmrCatalog({ flash });

    // --- Linking the export to a project manuscript ---
    /** Known project manuscripts, with whether they have IIIF and how many folios. */
    const availableProjectSources = computed(() => {
        const sources = new Map();
        // Sources from index.json
        for (const [src, folios] of Object.entries(sourceFolios.value || {})) {
            const count = folios instanceof Set ? folios.size : (Array.isArray(folios) ? folios.length : 0);
            sources.set(src, { name: src, folioCount: count, hasIiif: !!(iiifStore.links[src] || manifests.value?.[src]) });
        }
        // Any sources with IIIF links
        for (const src of Object.keys(iiifStore.links)) {
            if (!sources.has(src)) sources.set(src, { name: src, folioCount: 0, hasIiif: true });
        }
        // Any personal tables
        for (const t of personalTablesStore.tables) {
            if (t.source && !sources.has(t.source)) {
                sources.set(t.source, { name: t.source, folioCount: 0, hasIiif: !!iiifStore.links[t.source] });
            }
        }
        return Array.from(sources.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    });

    const activeProjectManuscript = computed(() => {
        if (!ommrStore.activeSource) return null;
        return availableProjectSources.value.find(s => s.name === ommrStore.activeSource) || null;
    });

    /** How many folios of the loaded export exist in the project manuscript. */
    const matchingProjectFoliosCount = computed(() => {
        if (!ommrStore.activeSource || !sourceFolios.value?.[ommrStore.activeSource]) return 0;
        const projectFolios = sourceFolios.value[ommrStore.activeSource];
        let matched = 0;
        for (const f of Object.keys(ommrStore.currentDataset?.folios || {})) {
            if (projectFolios.has(f) || projectFolios.has(f.replace(/[rv]$/i, ''))) matched++;
        }
        return matched;
    });

    const importing = useOmmrImport({
        projectSources: availableProjectSources,
        flash,
        onLoaded: () => { catalog.selectedPattern.value = catalog.allPatterns.value[0] || null; }
    });

    // --- Dialogs ---
    const showSettings = ref(false);
    const showPreview = ref(false);
    const showCleanupModal = ref(false);
    const showRemapModal = ref(false);
    const remapTargetSource = ref('');
    const customRemapSource = ref('');
    const peekSnippet = ref(null); // the snippet whose full page is shown
    const openPeek = snippet => { peekSnippet.value = snippet; };

    function openRemapModal() {
        remapTargetSource.value = ommrStore.activeSource || (availableProjectSources.value[0]?.name || '');
        customRemapSource.value = '';
        showRemapModal.value = true;
    }

    /**
     * Re-assign the loaded export to another manuscript. With no argument it uses
     * the remap dialog's choice (the dialog's button passes its click event, which
     * is not a name); the settings drawer passes the chosen name.
     */
    function applyRemap(target) {
        let next = typeof target === 'string' ? target : remapTargetSource.value;
        if (next === '__custom__') next = customRemapSource.value.trim();
        if (!next || next === ommrStore.activeSource) {
            showRemapModal.value = false;
            return;
        }
        ommrStore.renameSource(ommrStore.activeSource, next);
        renameInput.value = next;
        images.ensureActiveManifest();
        showRemapModal.value = false;
        flash(`✓ Dataset remapped to manuscript “${next}”`);
    }

    // --- Settings drawer: the manifest and the name of the loaded export ---
    const manifestUrlInput = ref('');
    const renameInput = ref('');

    function applyRename() {
        const next = renameInput.value.trim();
        if (!next || next === ommrStore.activeSource) return;
        ommrStore.renameSource(ommrStore.activeSource, next);
        images.ensureActiveManifest();
        flash(`Renamed source to “${next}”`);
    }

    async function refreshManifest() {
        const key = images.resolvedIiifKey.value;
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
        const key = images.resolvedIiifKey.value || ommrStore.activeSource;
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

    // Auto-load a linked manifest whenever the active source changes.
    watch(() => ommrStore.activeSource, () => {
        manifestUrlInput.value = images.manifestState.value.url || '';
        renameInput.value = ommrStore.activeSource || '';
        images.ensureActiveManifest();
    }, { immediate: true });

    onMounted(() => {
        if (!catalog.selectedPattern.value && catalog.allPatterns.value.length) {
            catalog.selectedPattern.value = catalog.allPatterns.value[0];
        }
    });

    // --- Writing into the workspace ---
    /**
     * Import the selected snippets as annotations. The OMMR corrections are baked
     * in first (see utils/ommrBake.js), so the manuscript view needs no
     * explorer-side transforms to show them in the right place.
     */
    function transferSelectedToAnnotations() {
        if (catalog.selectedSnippets.value.size === 0) return;
        const selected = ommrStore.activeSnippets.filter(s => catalog.selectedSnippets.value.has(s.id));
        if (selected.length === 0) return;

        const targetSource = ommrStore.activeSource;
        const bakeContext = item => ({
            deskew: images.deskewFor(item.folio),
            folio: images.manuscriptFolio(item.folio, item.source)
        });
        const toImport = selected.map(s => bakeSnippet(s, bakeContext(s)));
        // Only the lines that carry a selected snippet, baked for IIIF.
        const usedLineKeys = new Set(selected.map(s => `${s.folio}|||${s.lineId}`));
        const bakedLines = ommrStore.activeLines
            .filter(l => usedLineKeys.has(`${l.folio}|||${l.id}`))
            .map(l => bakeLine(l, bakeContext(l)));

        const count = annotStore.importOmmrSnippets(targetSource, toImport, bakedLines);
        personalTablesStore.ensurePatternsInTable(targetSource, Array.from(new Set(toImport.map(s => s.pattern))));
        const folioCount = new Set(toImport.map(s => s.folio)).size;
        flash(`✓ Imported ${count} snippet${count === 1 ? '' : 's'} (deskew-corrected) across ${folioCount} folios into ${targetSource}!`);
        catalog.clearSelection();
    }

    function importAllLines() {
        if (!ommrStore.activeSource || !ommrStore.activeLines.length) return;
        const targetSource = ommrStore.activeSource;
        const created = annotStore.importOmmrLines(targetSource, ommrStore.activeLines);
        const folioCount = Object.keys(ommrStore.currentDataset?.lines || {}).length;
        flash(`✓ Imported ${created} staff line regions across ${folioCount} folios for ${targetSource}!`);
    }

    return {
        // stores and data the templates read directly
        ommrStore, iiifStore, glyphs,
        // pieces
        ...prefs, ...images, ...catalog, ...importing,
        // linking
        availableProjectSources, activeProjectManuscript, matchingProjectFoliosCount,
        // dialogs
        showSettings, showPreview, showCleanupModal, showRemapModal, remapTargetSource, customRemapSource,
        peekSnippet, openPeek, openRemapModal, applyRemap,
        // settings drawer
        manifestUrlInput, renameInput, applyRename, refreshManifest, saveManifestUrl,
        // messages and workspace actions
        statusMessage, flash, transferSelectedToAnnotations, importAllLines
    };
}
