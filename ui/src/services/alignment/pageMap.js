/**
 * The page map of one manuscript: which IIIF canvas shows which folio of the
 * transcription, and which folio a canvas shows.
 *
 * Built from the pages of a parsed manifest (see services/iiif/manifestParser.js),
 * the transcription's folios and the manuscript's alignment settings, by one pure
 * function — so every view that needs an image, a canvas label or a folio asks
 * the same map and gets the same answer.
 *
 * Finding the canvas of a folio, in order of precedence:
 *
 *   1. a person's pin                        ("canvas 17 is 9r")         via 'pinned'
 *   2. the configured offset/jump rules      (older alignment settings)   via 'offset'
 *   3. the one canvas whose label names it   ("fol. 18v" for 18v)         via 'label'
 *   4. the inferred running count            (folioAlignment.js)          via 'label' | 'position'
 *   5. the first of several canvases named so ("f. 001 - vue 1/2/3")     via 'label'
 *
 * "Names it" means what the running count trusts as a page's name: a folio marker
 * or "18v" for foliated data, a page number for paginated data. A scan counter
 * such as "(0044)" never names folio 44r.
 *   6. a canvas with the same number and no side in its label            via 'fuzzy'
 *
 * The two directions agree: `folioOf(i)` is a folio only if `canvasFor` of that
 * folio is canvas `i` again. A canvas that cannot be named consistently (a
 * divider, a binding, a second view of an already claimed folio) has no folio.
 */

import { inferAlignment, applyOffsetAlignment, detectScheme } from '../../utils/folioAlignment';
import { matchName, tidyFolio, guessDataType } from './folios';
import { legacyCleanLabel } from '../iiif/manifestParser';

/**
 * @typedef {Object} ManifestPage   one entry of a parsed manifest
 * @property {string} folio          the label after the source's label rule and clean-up
 * @property {string} [originalFolio] the label exactly as the manifest has it
 * @property {string} [imgUrl]
 * @property {string|null} [serviceUrl]
 *
 * @typedef {Object} CanvasHit
 * @property {number} index          position in the page list
 * @property {ManifestPage} page
 * @property {string} via            'pinned' | 'offset' | 'label' | 'position' | 'fuzzy'
 * @property {number} confidence     0..1
 *
 * @typedef {Object} AlignmentSettings   settings.sourceAlignments[source]
 * @property {'foliated'|'paginated'} [dataType]
 * @property {Object<number,string>} [pins]   canvas index -> folio ('' = not a page)
 * @property {number} [offset]                older offset rules
 * @property {Array} [adjustments]
 * @property {string} [iiifType]
 */

const push = (map, key, value) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
};

/**
 * @param {Object} args
 * @param {ManifestPage[]} [args.pages]
 * @param {string[]} [args.dataFolios]   the transcription's folios for this manuscript
 * @param {AlignmentSettings|null} [args.alignment]
 */
export function buildPageMap({ pages = [], dataFolios = [], alignment = null } = {}) {
    const align = alignment || {};
    const pins = align.pins || {};
    const data = [...(dataFolios || [])].filter(f => f !== '' && f !== null && f !== undefined).map(String);
    // The label each canvas carries after the source's label rule: a rule exists
    // precisely to correct what the library wrote (see config/iiifRules.js).
    const labels = pages.map(p => String(p.folio ?? p.originalFolio ?? ''));

    // How the pages are numbered: as set, else as the transcription numbers them,
    // else (nothing transcribed yet) as the manifest's labels do.
    const dataType = align.dataType
        || (data.length ? guessDataType(data) : (detectScheme(labels).scheme === 'foliated' ? 'foliated' : 'paginated'));
    const inferred = inferAlignment({ canvasLabels: labels, dataType, pins });

    const isPinned = index => Object.prototype.hasOwnProperty.call(pins, index);

    // Canvases by label, pinned canvases excluded (a pin says what a canvas is,
    // whatever its label claims):
    //   byNamingLabel  only labels the running count trusted as naming a page
    //                  ("fol. 18v", "18v", or a bare page number in paginated
    //                  data) — a scan counter like "(0044)" names no folio;
    //   byAnyLabel     every label, for the older offset rules (which compute the
    //                  expected label, scan counters included) and for reading
    //                  keys an older version wrote with a canvas label.
    const byNamingLabel = new Map();
    const byAnyLabel = new Map();
    pages.forEach((p, i) => {
        if (isPinned(i)) return;
        if (inferred.entries[i]?.via === 'label') push(byNamingLabel, matchName(inferred.entries[i].resolvedFolio), i);
        push(byAnyLabel, matchName(labels[i]), i);
        const original = p.originalFolio && matchName(p.originalFolio);
        if (original && original !== matchName(labels[i])) push(byAnyLabel, original, i);
    });

    const pinnedFolio = new Map(); // match name -> canvas index
    for (const [index, folio] of Object.entries(pins)) {
        if (folio) pinnedFolio.set(matchName(folio), Number(index));
    }

    // The running count's claims, the more trusted claim winning a contested folio.
    const inferredByFolio = new Map();
    for (const e of inferred.entries) {
        if (!e.resolvedFolio || e.via === 'pinned') continue;
        const key = matchName(e.resolvedFolio);
        const existing = inferredByFolio.get(key);
        if (!existing || e.confidence > existing.confidence) inferredByFolio.set(key, e);
    }

    const hasOffsets = !!(align.offset || (Array.isArray(align.adjustments) && align.adjustments.length));
    const dataByMatch = new Map();
    for (const f of data) if (!dataByMatch.has(matchName(f))) dataByMatch.set(matchName(f), f);

    const hit = (index, via, confidence) =>
        (index === undefined || index === null || !pages[index]) ? null : { index, page: pages[index], via, confidence };

    /** @returns {CanvasHit|null} */
    function canvasFor(folio) {
        const key = matchName(folio);
        if (!key || !pages.length) return null;

        if (pinnedFolio.has(key)) return hit(pinnedFolio.get(key), 'pinned', 1);

        if (hasOffsets) {
            const expected = applyOffsetAlignment(String(folio), align);
            const candidates = expected ? byAnyLabel.get(matchName(expected)) : null;
            if (candidates && candidates.length) return hit(candidates[0], 'offset', 0.9);
        }

        // Several canvases may carry the same number ("V10" on a flyleaf, "10" in the
        // body): the one whose label is exactly the folio's name wins.
        const named = byNamingLabel.get(key);
        const exact = named && named.filter(i => matchName(labels[i]) === key || matchName(pages[i].originalFolio) === key);
        if (named && named.length === 1) return hit(named[0], 'label', 0.95);
        if (exact && exact.length === 1) return hit(exact[0], 'label', 0.95);

        const claim = inferredByFolio.get(key);
        if (claim && !isPinned(claim.canvasIndex)) return hit(claim.canvasIndex, claim.via, claim.confidence);

        if (exact && exact.length) return hit(exact[0], 'label', 0.6);
        if (named && named.length) return hit(named[0], 'label', 0.6);

        // Same number, and a label that does not say which side.
        const num = key.match(/(\d+)/);
        if (num) {
            for (let i = 0; i < pages.length; i++) {
                if (isPinned(i)) continue;
                const l = matchName(labels[i]);
                const m = l.match(/(\d+)/);
                if (!m || m[1] !== num[1]) continue;
                const sameSide = key.includes('v') === l.includes('v');
                if (sameSide || (!l.includes('r') && !l.includes('v'))) return hit(i, 'fuzzy', 0.3);
            }
        }
        return null;
    }

    /** The transcription's spelling of a folio named loosely, or the tidy form. */
    const spell = folio => dataByMatch.get(matchName(folio)) ?? tidyFolio(folio);

    // Which folio each canvas shows — only where both directions agree. Candidates:
    // its pin; the transcription's folios that resolve to it (this is how an offset
    // rule or a fuzzy match is read backwards); what the running count made of it.
    const claimedBy = new Map(); // canvas index -> data folios resolving to it
    for (const f of data) {
        const h = canvasFor(f);
        if (h) push(claimedBy, h.index, f);
    }
    const folioByIndex = pages.map((p, i) => {
        const candidates = [];
        if (isPinned(i)) {
            if (pins[i]) candidates.push(pins[i]);
        } else {
            const resolved = inferred.entries[i]?.resolvedFolio;
            const claims = claimedBy.get(i) || [];
            // the claim that agrees with the running count first, then the rest
            candidates.push(...claims.filter(f => resolved && matchName(f) === matchName(resolved)));
            candidates.push(...claims);
            if (resolved) candidates.push(resolved);
        }
        for (const c of candidates) {
            if (!c || !/\d/.test(c)) continue;
            if (canvasFor(c)?.index === i) return spell(c);
        }
        return null;
    });

    /** @returns {string|null} the folio canvas `index` shows, in the transcription's spelling */
    function folioOf(index) {
        return folioByIndex[index] ?? null;
    }

    /**
     * The folio a canvas *label* stands for — to read keys that older versions
     * wrote with a canvas label instead of a folio. Null unless the label names
     * exactly one canvas, or all the canvases it names show the same folio.
     */
    function folioForLabel(label, { loose = true } = {}) {
        if (label === null || label === undefined || label === '') return null;
        const raw = String(label);
        const all = pages.map((p, i) => i);
        // Keys were written with the label after the source's label rule, so that
        // reading comes first; the library's own label (or an older clean-up of it)
        // only if no canvas carries the corrected one.
        let matches = all.filter(i => labels[i] === raw);
        if (!matches.length) {
            matches = all.filter(i => pages[i].originalFolio === raw
                || (pages[i].originalFolio !== undefined && legacyCleanLabel(pages[i].originalFolio) === raw));
        }
        // Any canvas whose label reads the same, pinned ones included: an older
        // version wrote the label of whatever canvas it showed.
        if (!matches.length && loose) {
            const key = matchName(raw);
            matches = all.filter(i => matchName(labels[i]) === key || (pages[i].originalFolio && matchName(pages[i].originalFolio) === key));
        }
        const folios = new Set(matches.map(folioOf).filter(Boolean));
        return folios.size === 1 ? [...folios][0] : null;
    }

    const entries = pages.map((p, i) => ({
        ...inferred.entries[i],
        canvas: p,
        folio: folioByIndex[i]
    }));

    const dataMatch = new Set(data.map(matchName));
    return {
        dataType,
        dataFolios: data,
        pages,
        entries,
        canvasFor,
        folioOf,
        folioForLabel,
        stats: {
            total: pages.length,
            matched: inferred.matched,
            dividerCount: inferred.dividerCount,
            withDataCount: entries.filter(e => e.folio && dataMatch.has(matchName(e.folio))).length
        }
    };
}
