/**
 * Converts a folio label into a standard numeric index.
 * Foliated: 1r=1, 1v=2, 2r=3, 2v=4
 * Paginated: 1=1, 2=2, 3=3, 4=4
 * 
 * @param {string} label The folio string (e.g., "170r", "170", "0170")
 * @param {string} type 'foliated' or 'paginated'
 * @returns {number|null} The standard index, or null if unparseable
 */
export function folioToIndex(label, type) {
    if (!label) return null;
    const str = String(label).toLowerCase().trim();
    // Match number and optional alpha suffix, ignoring leading zeros
    const match = str.match(/0*(\d+)([a-z]*)/);
    if (!match) return null;
    
    const num = parseInt(match[1], 10);
    const suffix = match[2];
    
    if (type === 'foliated') {
        // If they omit the suffix but it's foliated, we assume recto 'r'
        const side = suffix.includes('v') ? 1 : 0;
        // Index 1 = 1r, Index 2 = 1v
        return ((num - 1) * 2) + 1 + side;
    } else {
        // Paginated
        return num;
    }
}

/**
 * Converts a numeric index back to a standard folio label.
 * @param {number} index The standard index
 * @param {string} type 'foliated' or 'paginated'
 * @returns {string|null} The label string
 */
export function indexToFolio(index, type) {
    if (index < 1) return null;
    
    if (type === 'foliated') {
        const num = Math.floor((index - 1) / 2) + 1;
        const side = index % 2 === 0 ? 'v' : 'r';
        return `${num}${side}`;
    } else {
        return String(index);
    }
}
