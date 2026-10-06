/**
 * The composite string keys the annotation stores are indexed by:
 *
 *   page key        "Source_Folio"          (regions, manualLines)
 *   annotation key  "Source_Folio_Pattern"  (legacy annotations)
 *
 * Source sigla may themselves contain an underscore ("WiSch 4_5"), folios and
 * pattern codes do not. So a key is always split from the RIGHT, and whether a
 * key belongs to a source is decided by parsing it — never by
 * `key.startsWith(source + '_')`, which would also claim the keys of any source
 * whose name merely extends this one.
 */

export function pageKey(source, folio) {
    return `${source}_${folio}`;
}

export function annotationKey(source, folio, pattern) {
    return `${source}_${folio}_${pattern}`;
}

/** "Source_Folio" → { source, folio }, or null if the key has no separator. */
export function parsePageKey(key) {
    const i = String(key).lastIndexOf('_');
    if (i <= 0) return null;
    return { source: key.slice(0, i), folio: key.slice(i + 1) };
}

/** "Source_Folio_Pattern" → { source, folio, pattern }, or null if malformed. */
export function parseAnnotationKey(key) {
    const s = String(key);
    const j = s.lastIndexOf('_');
    if (j <= 0) return null;
    const page = parsePageKey(s.slice(0, j));
    if (!page) return null;
    return { ...page, pattern: s.slice(j + 1) };
}

export function isPageKeyOf(key, source) {
    return parsePageKey(key)?.source === source;
}

export function isAnnotationKeyOf(key, source) {
    return parseAnnotationKey(key)?.source === source;
}

/** The same key with its source replaced; the folio (and pattern) are kept. */
export function renamePageKeySource(key, newSource) {
    const p = parsePageKey(key);
    return p ? pageKey(newSource, p.folio) : key;
}

export function renameAnnotationKeySource(key, newSource) {
    const p = parseAnnotationKey(key);
    return p ? annotationKey(newSource, p.folio, p.pattern) : key;
}

/**
 * A folio label reduced to what identifies the page: case, spacing, a "fol." /
 * "f." / "p." prefix, leading zeros and recto/verso spelled out are ignored, so
 * "18v", "fol. 18v", "f.18v" and "018v" are one page. Nothing else is merged
 * ("22" and "22b" stay different pages).
 *
 * Page keys ("Source_Folio") are written with whichever label the code in use
 * called the page: the transcription's folio or the IIIF canvas label. Data saved
 * under one is found under the other by comparing identities.
 */
export function folioIdentity(folio) {
    let s = String(folio ?? '').toLowerCase().replace(/\s+/g, '').replace(/[()]/g, '');
    s = s.replace(/^(fol|f|p|bl|blatt|seite|s)\.?(?=\d)/, '');
    s = s.replace(/^0+(?=\d)/, '');
    return s.replace(/recto/g, 'r').replace(/verso/g, 'v');
}

