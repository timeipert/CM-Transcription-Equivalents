/**
 * Bringing stored page keys onto the transcription's folios.
 *
 * Older versions keyed a page's line regions and manual lines by whatever
 * `getStandardFolio()` returned at that moment: the IIIF canvas label when the
 * manifest happened to be loaded ("fol. 18v", "(0339)", "1r [3]"), the folio
 * otherwise. This plans, per manuscript, which keys to move onto the folio they
 * stand for. It is deliberately conservative:
 *
 *   - a key is read as a canvas label only through the manuscript's page map, and
 *     moved only to the folio that canvas shows *now* — so the lines stay on the
 *     image they were drawn on;
 *   - the transcription links of the snippets on that page are evidence: if they
 *     name a different folio than the label does, the key is left alone and
 *     reported, never guessed at;
 *   - without a manifest only the spelling is tidied ("018v" -> "18v"), and not
 *     even that where offset rules or pins could make a label mean another page.
 *
 * Pure: it returns a plan; `annotations.rekeyPages()` applies it.
 */

import { parsePageKey, pageKey, folioIdentity } from '../../utils/keys';
import { indexFolios } from './folios';

/** "18v", "117bv", "f.116", "A1r", "24": a folio's name, not a scan label. */
const FOLIO_LIKE = /^(f\.)?[a-z]?\d+[a-z]{0,2}$/i;

/**
 * @typedef {Object} PageKeyMove
 * @property {string} from     the stored key
 * @property {string} to       the key it moves to
 * @property {'spelling'|'label'|'canvas-label'} why
 * @property {{ index: number, label: string }} [canvas]  the canvas the lines were drawn on, when known
 *
 * @typedef {Object} PageKeyKept
 * @property {string} key
 * @property {string} why      shown to the user
 */

/**
 * @param {Object} args
 * @param {string} args.source
 * @param {string[]} args.keys                 this manuscript's stored page keys
 * @param {string[]} [args.dataFolios]         the transcription's folios
 * @param {Object|null} [args.pageMap]         from buildPageMap(), or null if the manuscript has no manifest
 * @param {boolean} [args.hasManifestLink]     the manuscript has a manifest that is not loaded (yet)
 * @param {Object|null} [args.alignment]       its alignment settings (pins, offsets)
 * @param {(key: string) => string[]} [args.evidence]  folios named by the transcription links of the snippets under a key
 * @returns {{ moves: PageKeyMove[], kept: PageKeyKept[] }}
 */
export function planPageKeys({ source, keys, dataFolios = [], pageMap = null, hasManifestLink = false, alignment = null, evidence = () => [] }) {
    const dataIndex = indexFolios(dataFolios);
    const configured = !!(alignment && (alignment.offset || alignment.adjustments?.length || Object.keys(alignment.pins || {}).length));
    const moves = [];
    const kept = [];

    for (const key of keys) {
        const parsed = parsePageKey(key);
        if (!parsed || parsed.source !== source || !parsed.folio) continue;
        const folio = parsed.folio;
        // The transcription's own spelling of this folio, if it has the page.
        const spelled = dataIndex.get(folioIdentity(folio)) ?? null;
        const linked = new Set((evidence(key) || []).map(folioIdentity).filter(Boolean));

        // No manifest to read labels with.
        if (!pageMap) {
            if (!spelled || spelled === folio) continue;
            if (hasManifestLink || configured) continue; // a label could mean another page: wait for the manifest
            moves.push({ from: key, to: pageKey(source, spelled), why: 'spelling' });
            continue;
        }

        // How the key reads as a canvas label: the exact label first; a loose reading
        // only for names that are not folio-like (a folio-like name such as "3r" must
        // never be re-read as the scan counter "(0003)").
        const fromLabel = pageMap.folioForLabel(folio, { loose: !FOLIO_LIKE.test(folio) });
        const labelCanvas = fromLabel ? pageMap.canvasFor(fromLabel) : null;
        const canvas = labelCanvas ? { index: labelCanvas.index, label: String(labelCanvas.page.originalFolio ?? labelCanvas.page.folio) } : undefined;
        const linksSayLabel = fromLabel && linked.size && linked.has(folioIdentity(fromLabel)) && !linked.has(folioIdentity(folio));

        // How the key reads as a folio: a page the map knows by this name.
        const asFolio = pageMap.canvasFor(folio);
        const named = spelled ?? (asFolio ? pageMap.folioOf(asFolio.index) : null);
        const isFolio = !!spelled || (named && folioIdentity(named) === folioIdentity(folio));

        if (isFolio) {
            // A folio already. Only the snippets' links can show it was written as the
            // label of the canvas that shows another folio.
            if (fromLabel && folioIdentity(fromLabel) !== folioIdentity(folio) && linksSayLabel) {
                moves.push({ from: key, to: pageKey(source, fromLabel), why: 'canvas-label', canvas });
            } else if (named && named !== folio) {
                moves.push({ from: key, to: pageKey(source, named), why: fromLabel ? 'label' : 'spelling', canvas });
            }
            continue;
        }

        if (fromLabel) {
            // A canvas label: "fol. 18v" is 18v, "(0339)" is 170r.
            if (linked.size && !linked.has(folioIdentity(fromLabel))) {
                kept.push({ key, why: `"${folio}" is the scan of ${fromLabel}, but its snippets are linked to ${[...linked].join(', ')}` });
                continue;
            }
            const why = folioIdentity(fromLabel) === folioIdentity(folio) ? 'label' : 'canvas-label';
            moves.push({ from: key, to: pageKey(source, fromLabel), why, canvas });
            continue;
        }

        // Neither a folio nor a label of the manifest. A folio-like name is just a page
        // without transcription rows; anything that looks like a scan label is reported.
        if (!FOLIO_LIKE.test(folio) && /\d/.test(folio)) {
            kept.push({ key, why: `"${folio}" is neither a folio of the transcription nor a label of the manifest` });
        }
    }
    return { moves, kept };
}

/** The folios named by the transcription links ("Src-doc|18v|2|syl|pitches") of some snippets. */
export function linkedFolios(items) {
    const out = [];
    for (const item of items || []) {
        const sysId = item?.linkData?.sysId;
        if (typeof sysId !== 'string') continue;
        const folio = sysId.split('|')[1];
        if (folio) out.push(folio);
    }
    return out;
}
