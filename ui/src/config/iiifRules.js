/**
 * Configuration file for applying special rules when parsing IIIF manifests.
 * 
 * Some libraries have incorrect or offset folio/page numbering in their IIIF manifests.
 * This file allows us to define functions that map the library's incorrect label
 * to the correct edition label(s) at parse time, so the rest of the application
 * (Gallery, Editor, Image Loading) functions flawlessly with the correct labels.
 * 
 * Each key is the source identifier (e.g. "Ben 34").
 * The value is a function that takes the original IIIF label and returns either:
 * - A string (the corrected label)
 * - An array of strings (if one image represents multiple folios, e.g. an opening spread)
 * - The original label if no changes are needed
 */
export const iiifParseRules = {
  "Ben 34": (label) => {
    // The library incorrectly labels spreads as Xv-Xr (e.g. 122v-122r)
    // But the image actually shows the opening of (X-1)v and Xr!
    const match = String(label).match(/(\d+)v-(\d+)r/i);
    if (match) {
        const vNum = parseInt(match[1], 10);
        const rNum = parseInt(match[2], 10);
        // If it's labeled 122v-122r, return 121v and 122r
        if (vNum === rNum) {
            return [`${vNum - 1}v`, `${rNum}r`];
        }
        // If it's correctly labeled 121v-122r, split it nicely
        if (vNum + 1 === rNum) {
            return [`${vNum}v`, `${rNum}r`];
        }
        // Fallback for any other spread format
        return [`${vNum}v`, `${rNum}r`];
    }
    return label;
  },

  "Tri 2254": (label) => {
    // Solesmes has faulty page counting, jumps from 331 to 334.
    // So starting from 334, the actual page is 2 less in the edition.
    const match = String(label).match(/(\d+)/);
    if (match) {
        const num = parseInt(match[1], 10);
        if (num >= 334) {
            return String(num - 2);
        }
    }
    return label;
  }
};
