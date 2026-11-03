/**
 * Configuration file for applying special rules when parsing IIIF manifests.
 * 
 * Some libraries have incorrect or offset folio/page numbering in their IIIF manifests.
 * This file allows us to define functions that map the library's incorrect label
 * to the correct edition label(s) at parse time, so the rest of the application
 * (Gallery, Editor, Image Loading) functions flawlessly with the correct labels.
 * 
 * Each key is the source identifier (e.g. "Ben 34").
 * The value is a function that takes the original IIIF label (and, as a second
 * argument, the 0-based position of the canvas in the manifest) and returns either:
 * - A string (the corrected label)
 * - An array of strings (if one image represents multiple folios, e.g. an opening spread)
 * - The original label if no changes are needed
 */

/**
 * For a manifest that labels no page ("-" on every canvas) but whose canvases run in
 * page order: names each canvas from its position alone.
 *
 * `firstFolioCanvas` is the 0-based position of the canvas that shows leaf
 * `firstLeaf`, recto; each further canvas is the next side. Canvases before it and
 * canvases past `lastLeaf` keep their label, which the alignment treats as "not a page".
 */
function pagesFromPosition({ firstFolioCanvas, firstLeaf, lastLeaf }) {
  return (label, index) => {
    if (typeof index !== 'number' || index < firstFolioCanvas) return label;
    const side = index - firstFolioCanvas;
    const leaf = firstLeaf + Math.floor(side / 2);
    if (leaf > lastLeaf) return label;
    return `${leaf}${side % 2 === 0 ? 'r' : 'v'}`;
  };
}

/**
 * Libraries whose image server refuses some size requests. The Image API's `full`
 * size means "the original", which a server may refuse: it then answers with an HTML
 * error page and the page shows no image. For a host listed here, `full` and `max`
 * become the best fit inside `maxEdge` x `maxEdge` pixels, and a width above
 * `maxEdge` is lowered to it (see `services/iiif/imageUrl.js`).
 *
 * Key: the host name of the image service. Checked 2026-11-03 on the service of the
 * Lübeck Stadtbibliothek: `full/1900,` and `full/!1800,1800` return an image;
 * `full/full`, `full/max` and `full/2000,` return an error page.
 */
export const iiifServerLimits = {
  "digital-stadtbibliothek.luebeck.de": { maxEdge: 1800 }
};

export const iiifParseRules = {
  // Darmstadt, digitisation 00006738 (colour; replaces the black-and-white Hs-868
  // manifest): every canvas is labelled "-". Compared on the images on 2026-11-03,
  // canvas 6 is leaf 2r (the page whose first line is the chapter list, "2" in the
  // top right corner); the black-and-white manifest has it at canvas 1.
  // 352 canvases: cover, flyleaves, 2r ... 172v, then the back flyleaves and cover.
  "Dar 868": pagesFromPosition({ firstFolioCanvas: 6, firstLeaf: 2, lastLeaf: 172 }),

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

/**
 * Libraries that photograph an opening label the canvas with both pages:
 * "f. 017v - 018r", "010v-011r", "f. 037v - 038" (a bare number is a recto).
 * The canvas shows the verso of one leaf and the recto of the next, so it names
 * two folios. Anything else with a dash — "001v-001r", "10r-10v" — is left alone
 * for a source's own rule (see "Ben 34").
 */
const SPREAD = /^\s*(?:(?:f|fol)\.?\s*)?0*(\d+)\s*v\s*[-\u2013]\s*(?:(?:f|fol)\.?\s*)?0*(\d+)\s*r?\s*$/i;

export function splitSpreadLabel(label) {
    const m = SPREAD.exec(String(label));
    if (!m) return label;
    const verso = parseInt(m[1], 10);
    const recto = parseInt(m[2], 10);
    if (recto !== verso + 1) return label;
    return [`${verso}v`, `${recto}r`];
}

/** The label rule for a source: its own, else the general opening rule. */
export function labelRuleFor(source) {
    return iiifParseRules[source] || splitSpreadLabel;
}
