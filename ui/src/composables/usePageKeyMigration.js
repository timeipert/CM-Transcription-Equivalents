import { watch, effectScope, computed } from 'vue';
import { useAnnotationsStore } from '../stores/annotations';
import { useIiifStore } from '../stores/iiif';
import { useSettingsStore, effectiveAlignment } from '../stores/settings';
import { useTranscriptionData } from './useTranscriptionData';
import { useImageManifest } from './useImageManifest';
import { planPageKeys, linkedFolios } from '../services/alignment/pageKeys';
import { parsePageKey, folioIdentity } from '../utils/keys';

let started = false;

/**
 * Keep stored page keys on the transcription's folios.
 *
 * Whenever a manuscript's page map becomes available (its manifest loaded, the
 * transcription data arrived, an alignment pin changed) and some of its stored
 * keys are not folios of the transcription, the keys are planned by
 * services/alignment/pageKeys.js and moved with `annotations.rekeyPages()`. Keys
 * the planner will not move are reported once. Call once, after Pinia is installed.
 *
 * @param {Object} [options]
 * @param {(message: string) => void} [options.notify]  tell the user what happened
 * @returns {{ runNow: () => { moved: number, kept: Array } }}
 */
export function initPageKeyMigration({ notify = () => {} } = {}) {
    const annotations = useAnnotationsStore();
    const iiif = useIiifStore();
    const settings = useSettingsStore();
    const { sourceFolios, loading, error } = useTranscriptionData();
    const { pageMapFor, resolveIiifSource } = useImageManifest();
    const reported = new Set();

    /** Keys whose folio is not (exactly) a folio of the transcription, by source. */
    const suspectKeys = computed(() => {
        const bySource = new Map();
        const folios = sourceFolios.value || {};
        const consider = key => {
            const k = parsePageKey(key);
            if (!k || !k.folio) return;
            const data = folios[k.source];
            if (data && data.has(k.folio)) return;
            if (!bySource.has(k.source)) bySource.set(k.source, new Set());
            bySource.get(k.source).add(key);
        };
        Object.keys(annotations.regions).forEach(consider);
        Object.keys(annotations.manualLines).forEach(consider);
        return bySource;
    });

    function runNow() {
        if (loading.value || error.value || !Object.keys(sourceFolios.value || {}).length) return { moved: 0, kept: [] };
        const moves = [];
        const kept = [];
        for (const [source, keys] of suspectKeys.value) {
            const iiifKey = resolveIiifSource(source);
            const pageMap = pageMapFor(source);
            if (iiifKey && !pageMap && !iiif.manifestStatus[iiifKey]?.error) continue; // wait for the manifest
            const plan = planPageKeys({
                source,
                keys: [...keys],
                dataFolios: [...(sourceFolios.value[source] || [])],
                pageMap,
                hasManifestLink: !!iiifKey && !pageMap,
                alignment: effectiveAlignment(settings.sourceAlignments[iiifKey || source], settings.defaultAlignments[iiifKey || source]),
                evidence: key => linkedFolios((annotations.regions[key] || []).flatMap(r => annotations.regionItems[r.id] || []))
            });
            moves.push(...plan.moves);
            kept.push(...plan.kept);
        }

        let moved = 0;
        if (moves.length) {
            moved = annotations.rekeyPages(moves);
            const sources = [...new Set(moves.map(m => parsePageKey(m.from)?.source))];
            const sample = moves.slice(0, 3).map(m => `“${parsePageKey(m.from)?.folio}” → ${parsePageKey(m.to)?.folio}`).join(', ');
            console.info('Page keys moved onto transcription folios:', moves);
            notify(`Lines of ${sources.join(', ')} were stored under scan labels and now sit under the transcription's folios (${sample}${moves.length > 3 ? ', …' : ''}). Nothing was removed.`);
        }
        const fresh = kept.filter(k => !reported.has(k.key));
        if (fresh.length) {
            fresh.forEach(k => reported.add(k.key));
            console.warn('Page keys left as they are:', fresh);
            notify(`Some pages could not be matched to a folio and were left as they are: ${fresh.slice(0, 2).map(k => k.why).join('; ')}${fresh.length > 2 ? ` (and ${fresh.length - 2} more)` : ''}.`);
        }
        return { moved, kept };
    }

    if (!started) {
        started = true;
        const scope = effectScope(true);
        scope.run(() => {
            watch(
                () => [
                    loading.value,
                    Object.keys(iiif.parsedData).join('|'),
                    [...suspectKeys.value.keys()].join('|'),
                    [...suspectKeys.value.values()].reduce((n, s) => n + s.size, 0),
                    JSON.stringify([settings.sourceAlignments, settings.defaultAlignments])
                ],
                () => runNow(),
                { immediate: true }
            );
        });
    }
    return { runNow };
}

/** Whether two folio names are the same page (any spelling). */
export const samePage = (a, b) => folioIdentity(a) === folioIdentity(b);
