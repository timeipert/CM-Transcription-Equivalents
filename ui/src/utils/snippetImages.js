/**
 * Helpers for "direct snippets" — images pasted, dropped or uploaded straight
 * into the app (e.g. a screenshot cropped out of a manuscript facsimile),
 * without IIIF and without the folio/region/polygon workflow.
 *
 * Images are kept as base64 data URLs so a collection is self-contained and
 * travels inside the JSON export. They are downscaled on the way in, because a
 * raw screenshot is far larger than a neume snippet needs to be.
 */

export const MAX_SNIPPET_WIDTH = 900;
export const MAX_SNIPPET_HEIGHT = 600;
export const SNIPPET_QUALITY = 0.85;

/** Rough byte size of a base64 data URL (for quota warnings). */
export function dataUrlBytes(dataUrl) {
    if (!dataUrl) return 0;
    const comma = dataUrl.indexOf(',');
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    // 4 base64 chars encode 3 bytes; ignore padding for an estimate.
    return Math.round(b64.length * 0.75);
}

export function formatBytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Read a File/Blob into a downscaled base64 data URL.
 * @param {File|Blob} file
 * @param {{maxWidth?: number, maxHeight?: number, quality?: number}} [opts]
 * @returns {Promise<{dataUrl: string, width: number, height: number, bytes: number}>}
 */
export function fileToSnippet(file, opts = {}) {
    const maxW = opts.maxWidth || MAX_SNIPPET_WIDTH;
    const maxH = opts.maxHeight || MAX_SNIPPET_HEIGHT;
    const quality = opts.quality ?? SNIPPET_QUALITY;

    return new Promise((resolve, reject) => {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            reject(new Error('Not an image file.'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read the file.'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('Could not decode the image.'));
            img.onload = () => {
                let { width, height } = img;
                const scale = Math.min(1, maxW / width, maxH / height);
                width = Math.max(1, Math.round(width * scale));
                height = Math.max(1, Math.round(height * scale));

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                // White ground: manuscript scans are opaque, and PNG transparency
                // would otherwise turn black in JPEG output.
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // PNG keeps line art crisp but is large for photos; prefer JPEG
                // unless the source was small enough that PNG stays competitive.
                const jpeg = canvas.toDataURL('image/jpeg', quality);
                const png = canvas.toDataURL('image/png');
                const dataUrl = png.length <= jpeg.length ? png : jpeg;

                resolve({ dataUrl, width, height, bytes: dataUrlBytes(dataUrl) });
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Pull the first image out of a paste event's clipboard, if any.
 * @param {ClipboardEvent} e
 * @returns {File|null}
 */
export function imageFromPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return null;
    for (const it of items) {
        if (it.type && it.type.startsWith('image/')) {
            const f = it.getAsFile();
            if (f) return f;
        }
    }
    return null;
}

/**
 * Pull image files out of a drop event.
 * @param {DragEvent} e
 * @returns {File[]}
 */
export function imagesFromDrop(e) {
    const out = [];
    const dt = e.dataTransfer;
    if (!dt) return out;
    if (dt.files && dt.files.length) {
        for (const f of dt.files) {
            if (f.type && f.type.startsWith('image/')) out.push(f);
        }
    }
    return out;
}
