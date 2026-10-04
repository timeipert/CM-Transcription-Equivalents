/**
 * Turning the page folders of an OMMR4all export into folio labels.
 *
 * OMMR4all names each page folder after its scan ("0022", "Seite_22",
 * "f022"…), while the IIIF manifest and the transcription use folio labels
 * ("22r"). The import dialog lets the user pick a rule that maps one to the other;
 * a rule is a plain object so the dialog can edit it with v-model:
 *
 *   preset      which preset it started from ('custom' once edited by hand)
 *   pattern     a regular expression applied to the raw folder name…
 *   replace     …and what to replace each match with
 *   stripZeros  drop leading zeros first ("0022" → "22")
 *   suffix      appended to a name that ends in a digit ("22" → "22r")
 *   mode        'label' (use the result as the folio) or 'pagefolio' (read it as
 *               a page number and turn pages into recto/verso: 1→1r, 2→1v, 3→2r…)
 *   offset      shifts the page number in 'pagefolio' mode
 *   startVerso  the run begins on a verso (shifts the parity)
 */

export const FOLIO_PRESETS = {
    'as-is': { label: 'As-is', pattern: '', replace: '', stripZeros: true, suffix: '', mode: 'label' },
    'digits': { label: 'Digits only (→ 22)', pattern: '\\D+', replace: '', stripZeros: true, suffix: '', mode: 'label' },
    'trailing-r': { label: 'Number + r (→ 22r)', pattern: '^.*?(\\d+)\\D*$', replace: '$1', stripZeros: true, suffix: 'r', mode: 'label' },
    'page-folio': { label: 'Page → folio (1r,1v,2r…)', pattern: '^.*?(\\d+)\\D*$', replace: '$1', stripZeros: true, suffix: '', mode: 'pagefolio' },
    'custom': { label: 'Custom regex', pattern: '', replace: '', stripZeros: false, suffix: '', mode: 'label' }
};

export function createFolioRule() {
    return { preset: 'as-is', pattern: '', replace: '', stripZeros: true, suffix: '', mode: 'label', offset: 0, startVerso: false };
}

/** Load a preset into `rule` (in place). Choosing 'custom' keeps the current fields. */
export function applyPreset(rule, key) {
    const preset = FOLIO_PRESETS[key];
    if (!preset) return;
    rule.preset = key;
    if (key !== 'custom') {
        rule.pattern = preset.pattern;
        rule.replace = preset.replace;
        rule.stripZeros = preset.stripZeros;
        rule.suffix = preset.suffix;
        rule.mode = preset.mode;
    }
}

/** A 1-based page index as a recto/verso folio label, honouring offset and parity. */
export function pageToFolio(page, rule) {
    let p = page + (rule.offset || 0);
    if (rule.startVerso) p += 1; // shift parity if the run starts on a verso
    if (p < 1) return String(page);
    const num = Math.ceil(p / 2);
    const side = (p % 2 === 1) ? 'r' : 'v';
    return `${num}${side}`;
}

/** The folio label for one raw folder name under `rule`. Never returns an empty label. */
export function mapFolio(raw, rule) {
    const stripZeros = text => (rule.stripZeros ? text.replace(/^0+(?=\d)/, '') : text);
    let out = stripZeros(String(raw));
    if (rule.pattern) {
        try { out = out.replace(new RegExp(rule.pattern, 'g'), rule.replace || ''); } catch { /* an invalid regex leaves the name as it is */ }
    }
    // Strip again: a pattern that cuts a prefix off ("Seite_0022" -> "0022") exposes zeros the first pass could not see.
    out = stripZeros(out.trim());
    if (rule.mode === 'pagefolio') {
        const n = parseInt((out.match(/\d+/) || [])[0], 10);
        if (!isNaN(n)) return pageToFolio(n, rule);
        return out || String(raw);
    }
    if (rule.suffix && /\d$/.test(out)) out += rule.suffix;
    return out || String(raw);
}

/** How many raw names map to a folio label that an earlier one already took. */
export function countCollisions(rawFolios, rule) {
    const seen = new Set();
    let dup = 0;
    for (const raw of rawFolios) {
        const mapped = mapFolio(raw, rule);
        if (seen.has(mapped)) dup++;
        else seen.add(mapped);
    }
    return dup;
}
