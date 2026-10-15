/**
 * Folio names.
 *
 * A page of a manuscript is called by two kinds of names:
 *
 *   - its **folio**: what the transcription calls it ("18v", "271r", "A1r"). This
 *     is the page's identity. Everything the app stores about a page — line
 *     regions, manual lines, exported files, the monodi bridge — is keyed by it.
 *   - its **canvas label**: what a library's IIIF manifest calls the image
 *     ("fol. 18v", "(0087)", "1r [3]", "NP"). Labels are display text, written
 *     by each library in its own way, and can change with a new manifest. They
 *     are never stored as a page's name; services/alignment/pageMap.js maps a
 *     folio to the canvas that shows it.
 */

import { tidyFolio, folioIdentity } from '../../utils/keys';

export { tidyFolio, folioIdentity };

const matchCache = new Map();

/**
 * A loose form of a name for *finding the canvas* of a folio — more forgiving
 * than `folioIdentity`: it also drops a trailing sub-page letter ("22b" -> "22r")
 * and reads a bare number as a recto ("12" -> "12r"), because manifests and
 * transcriptions disagree about exactly these things. Never use it to decide
 * whether two stored names are the same page — that is `folioIdentity`.
 */
export function matchName(name) {
    if (!name) return '';
    if (matchCache.has(name)) return matchCache.get(name);

    let s = String(name).toLowerCase();
    s = s.replace(/\s+/g, '');
    s = s.replace(/[()]/g, '');
    s = s.replace(/^(fol|f|p|bl|blatt|seite|s)\.?(?=\d)/, '');
    s = s.replace(/^0+/, '');
    s = s.replace(/recto/g, 'r');
    s = s.replace(/verso/g, 'v');
    s = s.replace(/[-/][a-g1-9]$/, '');       // structural suffixes like "-a", "/1"
    s = s.replace(/([0-9rv])[a-g]$/, '$1');   // "22b" -> "22"
    if (/^\d+$/.test(s)) s += 'r';

    matchCache.set(name, s);
    return s;
}

export { compareFolios } from '../../utils/sorting';

/**
 * Index a transcription's folios by identity, so any spelling of a folio can be
 * turned into the transcription's own spelling. A transcription may spell one page
 * twice ("f.14v" and "14v" in different documents); the plain spelling is the one
 * the page is stored under, whatever order the folios come in.
 * @param {Iterable<string>} dataFolios
 * @returns {Map<string, string>} identity -> spelling
 */
export function indexFolios(dataFolios) {
    const index = new Map();
    for (const raw of dataFolios || []) {
        const f = String(raw);
        const id = folioIdentity(f);
        if (!id) continue;
        const existing = index.get(id);
        const plain = tidyFolio(f) === f;
        if (!existing || (plain && tidyFolio(existing) !== existing) || (plain && f < existing && tidyFolio(existing) === existing)) {
            index.set(id, f);
        }
    }
    return index;
}

/**
 * The name a folio is stored under: the transcription's own spelling when it has
 * this page, otherwise the tidy form. Depends only on the transcription, never on
 * a manifest — so a key does not change when a manifest loads, changes or fails.
 * @param {string} folio any spelling of a folio ("fol. 18v", "018v", "18v")
 * @param {Map<string,string>|Iterable<string>} [dataFolios] the transcription's folios, or `indexFolios()` of them
 */
export function canonicalFolio(folio, dataFolios) {
    const id = folioIdentity(folio);
    if (!id) return '';
    const index = dataFolios instanceof Map ? dataFolios : indexFolios(dataFolios);
    return index.get(id) ?? tidyFolio(folio);
}

/**
 * How a transcription numbers its pages. The preprocessing appends "r" to a bare
 * page number, so a paginated manuscript arrives as "1r", "2r", "3r" … with no
 * verso at all; that is read as pagination, not as a run of rectos.
 * @returns {'foliated'|'paginated'}
 */
export function guessDataType(dataFolios) {
    const list = [...(dataFolios || [])].map(f => String(f).trim().toLowerCase()).filter(Boolean);
    const withSide = list.filter(f => /\d[rv]$/.test(f));
    if (!withSide.length) return 'paginated';
    const versos = withSide.filter(f => f.endsWith('v')).length;
    // Several pages, all "r": pagination written with the preprocessing's suffix.
    if (versos === 0 && withSide.length >= 6) return 'paginated';
    return 'foliated';
}
