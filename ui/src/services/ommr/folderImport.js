/**
 * Reading an OMMR4all export folder chosen with <input webkitdirectory>.
 *
 * An export is a tree of page folders, each holding a `pcgts.json` (the
 * transcription), usually a `meta.json` (with the deskew angle OMMR applied) and
 * several derivative images. This reads such a selection into one entry per page:
 *
 *   { rawFolio, json, image, angle, w, h }
 *
 * where `image` is the best COLOUR image bundled with that page, if any. It works
 * on anything shaped like a `File` (`name`, `webkitRelativePath`, `text()`), so it
 * is testable without a browser.
 */

export class OmmrImportError extends Error {
    constructor(message) {
        super(message);
        this.name = 'OmmrImportError';
    }
}

const IMAGE_FILE = /\.(jpe?g|png)$/i;

const pathParts = file => (file.webkitRelativePath ? file.webkitRelativePath.split('/') : [file.name]);
const directoryOf = file => pathParts(file).slice(0, -1).join('/');

/**
 * Rank the images in a page folder and return the best COLOUR one.
 *
 * The coordinates in pcgts.json are measured on the deskewed colour image, so
 * that is the only image they line up with: black-and-white derivatives and
 * thumbnails are rejected, and so is the original (it is not deskewed, so
 * regions would be misplaced on it).
 * @param {Array<{ name: string }>} images
 */
export function pickBestColorImage(images) {
    const score = name => {
        const n = name.toLowerCase();
        if (/binary|gray|grey|overlay/.test(n)) return -1; // B/W derivatives
        if (/thumbnail|preview|_lowres|lowres|_norm/.test(n)) return -1; // low-res
        if (!/color|colour/.test(n)) return -1; // must be colour
        if (/original/.test(n)) return -1; // NOT deskewed → misaligns
        if (/highres|high_res/.test(n)) return 100; // full-res deskewed
        if (/deskew/.test(n)) return 60; // deskewed (may be preview res)
        return 20; // some other colour image
    };
    let best = null;
    let bestScore = 0;
    for (const image of images) {
        const s = score(image.name);
        if (s > bestScore) { best = image; bestScore = s; }
    }
    return best;
}

/** The deskew angle from a page's meta.json; 0 when there is none or it cannot be read. */
async function readDeskewAngle(metaFile) {
    if (!metaFile) return 0;
    try {
        let meta = JSON.parse(await metaFile.text());
        if (typeof meta === 'string') meta = JSON.parse(meta); // meta.json is double-encoded
        return Number(meta?.preprocessing?.deskewing_degrees) || 0;
    } catch {
        return 0;
    }
}

/**
 * @param {Array} files the selected files
 * @param {Object} [options]
 * @param {(message: string) => void} [options.onProgress]
 * @param {() => Promise<void>} [options.yieldToUi] called every few files so a long read does not freeze the page
 * @returns {Promise<{ detectedSource: string, entries: Array }>}
 * @throws {OmmrImportError} when nothing usable was selected
 */
export async function readOmmrExport(files, { onProgress = () => {}, yieldToUi = () => new Promise(r => setTimeout(r)) } = {}) {
    const pcgtsFiles = files.filter(f => f.name.endsWith('pcgts.json'));
    if (!pcgtsFiles.length) throw new OmmrImportError('No pcgts.json files found in the selected folder.');

    // Index meta.json and the images by the page folder that holds them.
    const metaByDir = {};
    const imagesByDir = {};
    for (const f of files) {
        if (f.name === 'meta.json') metaByDir[directoryOf(f)] = f;
        else if (IMAGE_FILE.test(f.name)) (imagesByDir[directoryOf(f)] ||= []).push(f);
    }

    let detectedSource = '';
    const entries = [];

    for (let i = 0; i < pcgtsFiles.length; i++) {
        const file = pcgtsFiles[i];
        const parts = pathParts(file);

        // The raw folio is the page folder's name, kept verbatim; renaming it is an
        // explicit step in the import dialog.
        let rawFolio = parts.length >= 2 ? parts[parts.length - 2] : file.name;
        if (rawFolio === 'pages' || rawFolio === 'pcgts' || rawFolio.endsWith('.json')) {
            rawFolio = file.name.replace(/\.?pcgts\.json$|\.json$/i, '') || rawFolio;
        }
        // The source is the folder above the page folder (skipping an intermediate "pages").
        if (parts.length >= 3) {
            let srcIdx = parts.length - 3;
            if (parts[srcIdx] === 'pages' && srcIdx > 0) srcIdx -= 1;
            detectedSource = parts[srcIdx].replace(/_/g, ' ');
        }

        onProgress(`Reading folio ${i + 1} / ${pcgtsFiles.length}`);
        let json = null;
        try { json = JSON.parse(await file.text()); } catch { /* skip a malformed file */ }
        if (!json) continue;

        const dir = directoryOf(file);
        const images = imagesByDir[dir] || [];
        entries.push({
            rawFolio,
            json,
            image: images.length ? pickBestColorImage(images) : null,
            angle: await readDeskewAngle(metaByDir[dir]),
            w: json?.page?.imageWidth || 0,
            h: json?.page?.imageHeight || 0
        });

        if (i % 10 === 0) await yieldToUi();
    }

    if (!entries.length) throw new OmmrImportError('No readable pcgts.json files.');
    return { detectedSource, entries };
}
