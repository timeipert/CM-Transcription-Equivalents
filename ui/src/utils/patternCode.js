/**
 * Structural analysis of a transcription code, for grouping patterns and for
 * deriving MEI neume components.
 *
 * The code grammar is the one `svgRenderer` and `VariantEditorModal` already
 * parse: a sequence of notes, each a movement character (`*` start, `u` up,
 * `d` down, `e` equal) optionally followed by uppercase suffixes — either a
 * built-in note shape (see RESERVED_SUFFIXES in utils/signs.js) or a project
 * custom sign key. `[` / `{` open a graphically connected group, `]` / `}`
 * close it.
 *
 *   *        one note
 *   *u       two notes, upwards
 *   [*u]     the same, graphically connected
 *   *uVd     three notes, the middle one carrying custom sign "V"
 *
 * All functions are pure string math, so stores, components and the static
 * exporter can share them.
 */

import { RESERVED_SUFFIXES } from './signs';

const GROUP_OPEN = ['[', '{'];
const GROUP_CLOSE = [']', '}'];

/** Movement characters and the direction each contributes. */
const MOVEMENT = { u: 'up', d: 'down', e: 'same' };

/** Direction labels, level 1 of the hierarchy. */
export const DIRECTIONS = {
    base: 'Basis',
    up: 'Aufwärts',
    down: 'Abwärts',
    same: 'Gleich',
    mixed: 'Gemischt'
};

/** Ligature labels, level 2 of the hierarchy. */
export const LIGATURES = {
    open: 'Offen',
    partial: 'Teilweise verbunden',
    connected: 'Verbunden'
};

/** First whitespace-delimited token of a pattern (drops a legacy " b" variant). */
export function getBaseCode(pattern) {
    if (!pattern) return '';
    return String(pattern).split(' ')[0];
}

/**
 * Split a code into its notes.
 *
 * @param {string} code
 * @param {string[]} [signKeys] project custom-sign keys (settings.customSigns)
 * @returns {Array<{move: string, suffix: string, sign: string, grouped: boolean}>}
 */
export function tokenizeCode(code, signKeys = []) {
    const notes = [];
    const src = getBaseCode(code);
    if (!src || !src.includes('*')) return notes;

    const keys = new Set(signKeys || []);
    let inGroup = false;
    let i = 0;

    while (i < src.length) {
        const ch = src[i];
        if (GROUP_OPEN.includes(ch)) { inGroup = true; i++; continue; }
        if (GROUP_CLOSE.includes(ch)) { inGroup = false; i++; continue; }
        if (ch === '(' || ch === ')') { i++; continue; }

        const move = ch;
        i++;

        let suffix = '';
        let sign = '';
        while (i < src.length && /[A-Z]/.test(src[i])) {
            if (keys.has(src[i])) sign += src[i];
            else suffix += src[i];
            i++;
        }

        notes.push({ move, suffix, sign, grouped: inGroup });
    }

    return notes;
}

/**
 * Describe a code: note count, direction, ligature status and the signs it carries.
 *
 * @param {string} code
 * @param {string[]} [signKeys]
 * @returns {{
 *   code: string, notes: Array, noteCount: number,
 *   direction: 'base'|'up'|'down'|'same'|'mixed',
 *   ligature: 'open'|'partial'|'connected',
 *   signs: string[], suffixes: string[], isSpecial: boolean
 * }}
 */
export function parsePatternCode(code, signKeys = []) {
    const base = getBaseCode(code).trim();
    const notes = tokenizeCode(base, signKeys);

    if (notes.length === 0) {
        // Markers such as "(Start)" carry no shape.
        return {
            code: base,
            notes: [],
            noteCount: 0,
            direction: 'base',
            ligature: 'open',
            signs: [],
            suffixes: [],
            isSpecial: true
        };
    }

    const moves = notes.map(n => n.move).filter(m => MOVEMENT[m]);
    let direction = 'base';
    if (moves.length > 0) {
        const kinds = new Set(moves.map(m => MOVEMENT[m]));
        direction = kinds.size > 1 ? 'mixed' : [...kinds][0];
    }

    const groupedCount = notes.filter(n => n.grouped).length;
    let ligature = 'open';
    if (groupedCount === notes.length) ligature = 'connected';
    else if (groupedCount > 0) ligature = 'partial';

    const signs = [];
    const suffixes = [];
    for (const n of notes) {
        for (const c of n.sign) if (!signs.includes(c)) signs.push(c);
        for (const c of n.suffix) if (!suffixes.includes(c)) suffixes.push(c);
    }

    return {
        code: base,
        notes,
        noteCount: notes.length,
        direction,
        ligature,
        signs,
        suffixes,
        isSpecial: false
    };
}

/** How many <nc> elements a pattern needs: one per note. */
export function noteCount(code, signKeys = []) {
    return parsePatternCode(code, signKeys).noteCount;
}

/** Stable key for the modifier level of the hierarchy ('' = plain). */
export function modifierKey(parsed) {
    return [...(parsed.signs || []), ...(parsed.suffixes || [])].join('');
}

/**
 * Label for a modifier key, preferring each sign's configured label.
 * @param {string} key
 * @param {Array<{key: string, label: string}>} [customSigns]
 */
export function modifierLabel(key, customSigns = []) {
    if (!key) return 'Basis';
    return [...key]
        .map(ch => {
            const def = (customSigns || []).find(s => s.key === ch);
            return def && def.label ? `${ch} (${def.label})` : ch;
        })
        .join(' + ');
}

/**
 * Group codes into the three-level hierarchy used by the pattern library and
 * the public views: direction -> ligature -> modifiers.
 *
 * @param {string[]} codes
 * @param {{signKeys?: string[], customSigns?: Array}} [options]
 */
export function buildPatternHierarchy(codes, options = {}) {
    const { signKeys = [], customSigns = [] } = options;
    const order = ['base', 'up', 'down', 'same', 'mixed'];
    const ligOrder = ['open', 'partial', 'connected'];

    const byDirection = new Map();
    const seen = new Set();

    for (const raw of codes || []) {
        const parsed = parsePatternCode(raw, signKeys);
        if (!parsed.code || seen.has(parsed.code)) continue;
        seen.add(parsed.code);

        const dirKey = parsed.isSpecial ? 'other' : parsed.direction;
        if (!byDirection.has(dirKey)) byDirection.set(dirKey, new Map());
        const ligMap = byDirection.get(dirKey);

        const ligKey = parsed.ligature;
        if (!ligMap.has(ligKey)) ligMap.set(ligKey, new Map());
        const modMap = ligMap.get(ligKey);

        const modKey = modifierKey(parsed);
        if (!modMap.has(modKey)) modMap.set(modKey, []);
        modMap.get(modKey).push(parsed.code);
    }

    const dirKeys = [...order, 'other'].filter(k => byDirection.has(k));

    return dirKeys.map(dirKey => {
        const ligMap = byDirection.get(dirKey);
        const groups = ligOrder.filter(k => ligMap.has(k)).map(ligKey => {
            const modMap = ligMap.get(ligKey);
            const modKeys = Array.from(modMap.keys()).sort((a, b) => {
                if (!a) return -1;
                if (!b) return 1;
                return a.localeCompare(b);
            });

            const modGroups = modKeys.map(modKey => {
                const list = modMap.get(modKey).slice()
                    .sort((a, b) => comparePatternCodes(a, b, signKeys));
                return {
                    key: modKey || '_base',
                    label: modifierLabel(modKey, customSigns),
                    count: list.length,
                    codes: list
                };
            });

            return {
                key: ligKey,
                label: LIGATURES[ligKey],
                count: modGroups.reduce((s, g) => s + g.count, 0),
                groups: modGroups
            };
        });

        return {
            key: dirKey,
            label: dirKey === 'other' ? 'Sonstige' : DIRECTIONS[dirKey],
            count: groups.reduce((s, g) => s + g.count, 0),
            groups
        };
    });
}

/** Sort codes: fewer notes first, then plainer, then alphabetically. */
export function comparePatternCodes(a, b, signKeys = []) {
    const pa = parsePatternCode(a, signKeys);
    const pb = parsePatternCode(b, signKeys);
    if (pa.noteCount !== pb.noteCount) return pa.noteCount - pb.noteCount;
    const ma = modifierKey(pa).length;
    const mb = modifierKey(pb).length;
    if (ma !== mb) return ma - mb;
    return pa.code.localeCompare(pb.code, undefined, { numeric: true });
}

/** Re-exported so callers do not need two imports to know the built-in suffixes. */
export { RESERVED_SUFFIXES };
