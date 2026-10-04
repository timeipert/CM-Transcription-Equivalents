import { ref, reactive, computed, nextTick, onUnmounted } from 'vue';
import { useOmmrStore } from '../../stores/ommr';
import { useIiifStore } from '../../stores/iiif';
import { useTranscriptionData } from '../useTranscriptionData';
import { readOmmrExport, OmmrImportError } from '../../services/ommr/folderImport';
import { createFolioRule, applyPreset, mapFolio, countCollisions } from '../../utils/ommrFolioRule';
import { findMatchingProjectSource } from '../../utils/ommrProjectMatch';

/**
 * Loading an OMMR4all export folder into the explorer.
 *
 * Two steps, so a wrongly named export cannot silently land in the wrong
 * manuscript: choosing the folder STAGES it (reads the pages, nothing is loaded
 * yet), and the import dialog then lets the user pick the manuscript and the rule
 * that turns page folders into folio labels before `commitImport` loads it.
 *
 * @param {Object} deps
 * @param {import('vue').ComputedRef<Array<{ name: string }>>} deps.projectSources manuscripts known to the project
 * @param {(message: string) => void} deps.flash
 * @param {() => void} deps.onLoaded called after a dataset was loaded (to select its first pattern)
 */
export function useOmmrImport({ projectSources, flash, onLoaded }) {
    const ommrStore = useOmmrStore();
    const iiifStore = useIiifStore();
    const { manifests } = useTranscriptionData();

    // Chosen before choosing a folder, on the empty-state card
    const selectedTargetSource = ref(''); // a project manuscript, '' (auto-detect) or '__custom__'
    const customTargetSourceName = ref('');

    // The staged import
    const showImportModal = ref(false);
    const importStaging = ref(null); // { detectedSource, entries: [{ rawFolio, json, image, angle, w, h }] }
    const importSourceName = ref('');
    const folioRule = reactive(createFolioRule());
    const showThumbs = ref(true);

    const importPreview = computed(() => {
        if (!importStaging.value) return [];
        const limit = showThumbs.value ? 30 : 60;
        return importStaging.value.entries.slice(0, limit)
            .map(e => ({ raw: e.rawFolio, mapped: mapFolio(e.rawFolio, folioRule), image: e.image }));
    });
    const importCollision = computed(() => {
        if (!importStaging.value) return 0;
        return countCollisions(importStaging.value.entries.map(e => e.rawFolio), folioRule);
    });

    // Object URLs for page thumbnails: created lazily, revoked on close.
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
    onUnmounted(clearThumbs);

    function closeImport() {
        clearThumbs();
        showImportModal.value = false;
        importStaging.value = null;
    }

    /** The folder chooser's change handler: read the pages and open the import dialog. */
    async function handleFolderUpload(event) {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        ommrStore.isProcessing = true;
        try {
            const staging = await readOmmrExport(files, {
                onProgress: message => { ommrStore.progressStatus = message; }
            });
            importStaging.value = staging;
            importSourceName.value =
                (selectedTargetSource.value && selectedTargetSource.value !== '__custom__' ? selectedTargetSource.value : '')
                || findMatchingProjectSource(staging.detectedSource, projectSources.value.map(s => s.name))
                || staging.detectedSource;
            applyPreset(folioRule, 'as-is');
            showImportModal.value = true;
        } catch (err) {
            if (err instanceof OmmrImportError) {
                flash(err.message);
            } else {
                console.error('Error reading OMMR files:', err);
                flash(`Error reading OMMR files: ${err.message}`);
            }
        } finally {
            ommrStore.isProcessing = false;
            ommrStore.progressStatus = '';
            event.target.value = '';
        }
    }

    /** Load the staged export under the chosen manuscript name, applying the folio rule. */
    async function commitImport() {
        const staged = importStaging.value;
        if (!staged) return;
        const finalSource = importSourceName.value.trim() || staged.detectedSource;

        const batch = {};
        const imageForFolio = {};
        const folioMeta = {};
        for (const entry of staged.entries) {
            const folio = mapFolio(entry.rawFolio, folioRule);
            batch[folio] = entry.json;
            if (entry.image) imageForFolio[folio] = entry.image;
            folioMeta[folio] = { angle: entry.angle, w: entry.w, h: entry.h };
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

        onLoaded();
        const imageCount = Object.keys(imageForFolio).length;
        flash(`✓ Loaded ${Object.keys(batch).length} folios for “${finalSource}” — ${ommrStore.activeSnippets.length} neumes${imageCount ? ' · ' + imageCount + ' local images' : ''}`);

        ommrStore.isProcessing = false;
        ommrStore.progressStatus = '';
        closeImport();
    }

    return {
        selectedTargetSource, customTargetSourceName,
        showImportModal, importStaging, importSourceName, folioRule, showThumbs,
        importPreview, importCollision, thumbUrl, closeImport,
        handleFolderUpload, commitImport
    };
}
