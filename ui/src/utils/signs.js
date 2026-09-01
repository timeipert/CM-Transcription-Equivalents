/**
 * Helpers for "code variants" — project-configurable special signs that change
 * the transcription code itself (e.g. a virga marker on a single note, turning
 * *uudd into *uuVdd), as opposed to snippet-classifier variants (a, b, c…).
 *
 * A custom sign is a single UPPERCASE letter used as a per-note suffix, exactly
 * like the built-in note-shape suffixes O/Q/S/L that svgRenderer already parses.
 */

// Letters/characters that already carry meaning in the notation and may NOT be
// reused as custom sign keys.
export const RESERVED_SUFFIXES = ['L', 'Q', 'O', 'S', 'A', 'D'];
export const MOVEMENT_CHARS = ['*', 'u', 'd', 'e'];

/**
 * Validate a candidate sign key. Returns an error string, or '' if valid.
 * @param {string} key
 * @param {string[]} existingKeys keys already in use (for uniqueness)
 */
export function validateSignKey(key, existingKeys = []) {
    if (!key) return 'A one-letter key is required.';
    if (key.length !== 1) return 'The key must be a single character.';
    if (!/[A-Z]/.test(key)) return 'The key must be an uppercase letter (A–Z).';
    if (RESERVED_SUFFIXES.includes(key)) return `"${key}" is reserved for a built-in sign.`;
    if (existingKeys.includes(key)) return `"${key}" is already in use.`;
    return '';
}

/**
 * Extract a { viewBox, d } glyph definition (the same shape the built-in glyphs
 * use) out of a raw pasted SVG string, so custom SVGs render through the same
 * path-based pipeline as the built-in glyphs.
 * @param {string} svgString
 * @returns {{viewBox:string, d:string}|null}
 */
export function parseSvgToGlyph(svgString) {
    if (!svgString || typeof svgString !== 'string') return null;
    const vbMatch = svgString.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    const viewBox = vbMatch ? vbMatch[1].trim() : '0 0 10 10';
    const ds = [];
    const re = /<path\b[^>]*?\sd\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(svgString)) !== null) ds.push(m[1]);
    if (ds.length === 0) return null;
    return { viewBox, d: ds.join(' ') };
}

/**
 * Build a { key: {viewBox, d} } map that svgRenderer can consume, resolving each
 * sign to either a pasted custom SVG (preferred) or a named built-in glyph.
 * @param {Array} customSigns store definitions
 * @param {Object} glyphs built-in glyph map { name: {viewBox, d} }
 */
export function resolveSignGlyphs(customSigns, glyphs) {
    const map = {};
    for (const s of customSigns || []) {
        if (!s || !s.key) continue;
        let glyph = null;
        if (s.glyphSvg) glyph = parseSvgToGlyph(s.glyphSvg);
        if (!glyph && s.glyph && glyphs && glyphs[s.glyph]) glyph = glyphs[s.glyph];
        if (glyph) map[s.key] = glyph;
    }
    return map;
}

/**
 * Strip the given sign keys from a code string, recovering the underlying base
 * code (e.g. stripSignKeys('*uuVdd', ['V']) -> '*uudd').
 * @param {string} pattern
 * @param {string[]} keys
 */
export function stripSignKeys(pattern, keys) {
    if (!pattern || !keys || keys.length === 0) return pattern || '';
    const cls = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
    if (!cls) return pattern;
    return pattern.replace(new RegExp(`[${cls}]`, 'g'), '');
}

/**
 * Return the ordered list of sign keys actually present in a code string.
 * @param {string} pattern
 * @param {string[]} keys
 */
export function extractSignKeys(pattern, keys) {
    if (!pattern || !keys || keys.length === 0) return [];
    const set = new Set(keys);
    return [...pattern].filter(ch => set.has(ch));
}

/**
 * Split a code string into segments so custom-sign letters can be emphasised when
 * the code is shown as a caption. With code variants the difference between two
 * patterns may be a single letter, so the sign has to be visually findable.
 * @param {string} pattern
 * @param {string[]} keys
 * @returns {Array<{text: string, isSign: boolean}>}
 */
export function splitCodeBySigns(pattern, keys) {
    if (!pattern) return [];
    const set = new Set(keys || []);
    const out = [];
    for (const ch of pattern) {
        const isSign = set.has(ch);
        const last = out[out.length - 1];
        if (last && last.isSign === isSign) last.text += ch;
        else out.push({ text: ch, isSign });
    }
    return out;
}

/**
 * A short human marker for the signs a variant carries, for display IDs.
 * Uses each sign's `abbrev` (or its key) joined together, e.g. "V" or "Vq".
 * @param {string} pattern
 * @param {Array} customSigns
 */
export function signMarker(pattern, customSigns) {
    const keys = (customSigns || []).map(s => s.key);
    const present = extractSignKeys(pattern, keys);
    if (present.length === 0) return '';
    return present
        .map(k => {
            const def = customSigns.find(s => s.key === k);
            return (def && def.abbrev) ? def.abbrev : k;
        })
        .join('');
}
