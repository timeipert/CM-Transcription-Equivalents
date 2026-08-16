/**
 * Default standard neume names mapping transcription patterns to historical chant neume terminology.
 * In CM transcription notation, brackets [ ] denote graphically connected neumes (e.g. [*u] = Pes).
 */
export const DEFAULT_NEUME_NAMES = {
    "(Start)": "Virga / Punctum",
    "*": "Virga / Punctum",
    
    // Graphically connected (standard neumes)
    "[*u]": "Pes",
    "[*d]": "Clivis",
    "[*uu]": "Scandicus",
    "[*dd]": "Climacus",
    "[*ud]": "Torculus",
    "[*du]": "Porrectus",
    "[*uud]": "Scandicus flexus",
    "[*ddu]": "Climacus resupinus",
    "[*udu]": "Torculus resupinus",
    "[*dud]": "Porrectus flexus",
    "[*e]": "Distropha / Bivirga",
    "[*ee]": "Tristropha / Trivirga",
    "[*ue]": "Pes quassus",
    "[*de]": "Clivis praepunctis",

    // Unconnected / base forms
    "*u": "Pes",
    "*d": "Clivis",
    "*uu": "Scandicus",
    "*dd": "Climacus",
    "*ud": "Torculus",
    "*du": "Porrectus"
};

/**
 * Get human-readable neume name for a pattern.
 * Checks user custom overrides first, then defaults.
 * Tries exact match, base pattern without space, and bracket-normalized variants.
 * @param {string} pattern 
 * @param {Object} [customNames={}] 
 * @returns {string}
 */
export function getNeumeName(pattern, customNames = {}) {
    if (!pattern) return '';
    const base = pattern.split(' ')[0];
    const clean = base.replace(/[\[\]]/g, '');
    const bracketed = `[${clean}]`;

    // 1. User custom overrides
    if (customNames) {
        if (customNames[pattern]) return customNames[pattern];
        if (customNames[base]) return customNames[base];
        if (customNames[bracketed]) return customNames[bracketed];
        if (customNames[clean]) return customNames[clean];
    }

    // 2. Built-in defaults
    if (DEFAULT_NEUME_NAMES[pattern]) return DEFAULT_NEUME_NAMES[pattern];
    if (DEFAULT_NEUME_NAMES[base]) return DEFAULT_NEUME_NAMES[base];
    if (DEFAULT_NEUME_NAMES[bracketed]) return DEFAULT_NEUME_NAMES[bracketed];
    if (DEFAULT_NEUME_NAMES[clean]) return DEFAULT_NEUME_NAMES[clean];

    return '';
}
