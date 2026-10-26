import { renderSvg } from '../utils/svgRenderer.js';
import { resolveSignGlyphs } from '../utils/signs';
import { useSettingsStore } from '../stores/settings';

/**
 * A printable proofreading copy of one custom manuscript (a direct-snippet
 * collection): its title and notes, then for every declared pattern the notation
 * drawn from its code, the code and label, and each snippet image with its Ref ID
 * and caption beside a tick box. Snippets without a pattern follow under "Unassigned".
 *
 * Split in two so the layout can be tested without a browser:
 *  - `layoutCustomManuscriptPdf(doc, model)` draws a prepared model on a jsPDF-like
 *    document (pure drawing, no canvas, no Vue);
 *  - `useCustomManuscriptPdf()` prepares the model in the browser (pattern pictures,
 *    image formats) and saves the file.
 */

const PAGE = { margin: 14, bottom: 285, width: 210 };
const GRID = { perRow: 4, imageW: 42, imageH: 32, gapX: 6, labelH: 17, rowGap: 4 };

/** The pattern groups of a collection in reading order: declared patterns, then unassigned snippets. */
export function groupSnippets(collection) {
    const patterns = collection.patterns || [];
    const known = new Set(patterns.map(p => p.code));
    const groups = patterns.map(p => ({
        code: p.code,
        label: p.label || '',
        notes: p.notes || '',
        snippets: (collection.snippets || []).filter(s => s.pattern === p.code)
    }));
    const orphans = (collection.snippets || []).filter(s => !s.pattern || !known.has(s.pattern));
    if (orphans.length) groups.push({ code: '', label: 'Unassigned', notes: '', snippets: orphans });
    return groups;
}

/** File name for the PDF: siglum and date, safe for any file system. */
export function customManuscriptPdfName(collection, date = new Date().toISOString().slice(0, 10)) {
    const siglum = String(collection.source || 'manuscript').replace(/[^a-z0-9]/gi, '_');
    return `cm-custom-manuscript-${siglum}-${date}.pdf`;
}

/**
 * Draw the proofreading copy.
 *
 * @param {Object} doc a jsPDF document (or a stand-in with the same drawing methods)
 * @param {Object} model
 * @param {string} model.siglum
 * @param {string} [model.title]
 * @param {string} [model.notes]
 * @param {string} model.date            ISO date shown in the header
 * @param {boolean} [model.isPublished]
 * @param {Array<{code: string, label: string, patternImage: ?{dataUrl: string, aspect: number},
 *   snippets: Array<{dataUrl: string, format: string, aspect: number, refId: string, caption: string}>}>} model.groups
 */
export function layoutCustomManuscriptPdf(doc, model) {
    const { margin } = PAGE;
    const textWidth = PAGE.width - margin * 2;
    let y = 20;

    const font = (style, size, gray = 0) => {
        doc.setFont('helvetica', style);
        doc.setFontSize(size);
        doc.setTextColor(gray);
    };
    const newPageIfNeeded = needed => {
        if (y + needed > PAGE.bottom) {
            doc.addPage();
            y = 20;
            return true;
        }
        return false;
    };

    // --- Header ---
    font('bold', 18);
    doc.text(model.siglum || 'Custom manuscript', margin, y);
    y += 7;
    if (model.title) {
        font('normal', 12);
        doc.text(model.title, margin, y);
        y += 6;
    }
    const snippetCount = model.groups.reduce((n, g) => n + g.snippets.length, 0);
    font('normal', 9, 100);
    doc.text(
        `Proofreading copy, ${model.date} · ${model.groups.filter(g => g.code).length} patterns · ${snippetCount} snippets · ${model.isPublished ? 'published' : 'not published'}`,
        margin, y
    );
    y += 5;
    if (model.notes) {
        for (const line of doc.splitTextToSize(model.notes, textWidth)) {
            newPageIfNeeded(5);
            doc.text(line, margin, y);
            y += 4.5;
        }
    }
    font('italic', 8, 100);
    doc.text('Tick each snippet that is filed under the right pattern and write corrections beside it.', margin, y + 2);
    y += 9;

    // --- One block per pattern ---
    for (const group of model.groups) {
        const headH = 16;
        const firstRowH = group.snippets.length ? GRID.imageH + GRID.labelH : 6;
        newPageIfNeeded(headH + firstRowH);

        doc.setDrawColor(200);
        doc.setLineWidth(0.3);
        doc.line(margin, y, margin + textWidth, y);
        y += 3;

        let textX = margin;
        if (group.patternImage) {
            const h = 11;
            const w = Math.min(40, h * group.patternImage.aspect);
            doc.addImage(group.patternImage.dataUrl, 'PNG', margin, y, w, w / group.patternImage.aspect);
            textX = margin + Math.max(w, 14) + 4;
        }
        if (group.code) {
            font('bold', 11);
            doc.setFont('courier', 'bold');
            doc.text(group.code, textX, y + 4);
        }
        font('normal', 10);
        doc.text(`${group.label || ''}${group.label && group.snippets.length ? '  ' : ''}(${group.snippets.length})`,
            textX, y + (group.code ? 9 : 5));
        y += headH - 3;

        if (!group.snippets.length) {
            font('italic', 8, 120);
            doc.text('No snippets filed under this pattern.', margin, y + 1);
            y += 7;
            continue;
        }

        group.snippets.forEach((snip, i) => {
            const col = i % GRID.perRow;
            if (col === 0 && i > 0) y += GRID.imageH + GRID.labelH + GRID.rowGap;
            if (col === 0) newPageIfNeeded(GRID.imageH + GRID.labelH);
            const x = margin + col * (GRID.imageW + GRID.gapX);

            // The image is fitted into its box, keeping its proportions.
            let w = GRID.imageW;
            let h = w / (snip.aspect || 1);
            if (h > GRID.imageH) { h = GRID.imageH; w = h * (snip.aspect || 1); }
            doc.setDrawColor(220);
            doc.rect(x, y, GRID.imageW, GRID.imageH);
            doc.addImage(snip.dataUrl, snip.format, x + (GRID.imageW - w) / 2, y + (GRID.imageH - h) / 2, w, h);

            font('bold', 8);
            doc.text(snip.refId ? `Ref ID: ${snip.refId}` : 'No Ref ID', x, y + GRID.imageH + 4);
            font('normal', 7.5, 60);
            const caption = doc.splitTextToSize(snip.caption || '', GRID.imageW - 6).slice(0, 2);
            caption.forEach((line, k) => doc.text(line, x, y + GRID.imageH + 8 + k * 3.5));
            doc.setDrawColor(120);
            doc.rect(x + GRID.imageW - 4, y + GRID.imageH + 1.2, 3.4, 3.4);
        });
        y += GRID.imageH + GRID.labelH + GRID.rowGap + 4;
    }

    // --- Page numbers ---
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        font('normal', 8, 120);
        doc.text(`${model.siglum || 'Custom manuscript'} · page ${p} of ${pages}`, margin, 292);
    }
}

/** The image format name jsPDF needs for a data URL, or '' if it must be re-encoded first. */
export function pdfImageFormat(dataUrl) {
    const m = /^data:image\/([a-z0-9.+-]+)[;,]/i.exec(dataUrl || '');
    if (!m) return '';
    const type = m[1].toLowerCase();
    if (type === 'png') return 'PNG';
    if (type === 'jpeg' || type === 'jpg') return 'JPEG';
    return '';
}

export function useCustomManuscriptPdf() {
    const settings = useSettingsStore();

    /** Load an image to learn its proportions; re-encode formats the PDF library cannot embed. */
    function readImage(dataUrl) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                let url = dataUrl;
                let format = pdfImageFormat(dataUrl);
                if (!format) {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, img.width, img.height);
                    ctx.drawImage(img, 0, 0);
                    url = canvas.toDataURL('image/png');
                    format = 'PNG';
                }
                resolve({ dataUrl: url, format, aspect: img.width / Math.max(1, img.height) });
            };
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    /**
     * Save a printable proofreading copy of a custom manuscript.
     * @param {Object} collection a direct-snippet collection
     * @param {Object} glyphs the built-in glyph map (`useTranscriptionData().glyphs`)
     * @returns {Promise<{ fileName: string, skipped: number }>} `skipped`: images that could not be read
     */
    async function generateCustomManuscriptPdf(collection, glyphs) {
        // Loaded on demand, like the other PDF export: the libraries are large.
        const [{ jsPDF }, { Canvg }] = await Promise.all([import('jspdf'), import('canvg')]);
        const signGlyphs = resolveSignGlyphs(settings.customSigns, glyphs);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        async function patternPicture(code) {
            if (!code || !glyphs) return null;
            const { width, height, content } = renderSvg(code, glyphs, false, signGlyphs);
            if (!(width > 0 && height > 0)) return null;
            const scale = 4;
            canvas.width = width * scale;
            canvas.height = height * scale;
            try {
                const v = await Canvg.from(ctx, content);
                await v.render();
                return { dataUrl: canvas.toDataURL('image/png'), aspect: width / height };
            } catch (e) {
                console.error('Could not draw pattern', code, e);
                return null;
            }
        }

        let skipped = 0;
        const groups = [];
        for (const g of groupSnippets(collection)) {
            const snippets = [];
            for (const s of g.snippets) {
                const img = await readImage(s.image);
                if (!img) { skipped++; continue; }
                snippets.push({ ...img, refId: s.refId || '', caption: s.caption || '' });
            }
            groups.push({ code: g.code, label: g.label, patternImage: await patternPicture(g.code), snippets });
        }

        const doc = new jsPDF();
        layoutCustomManuscriptPdf(doc, {
            siglum: collection.source,
            title: collection.name,
            notes: collection.notes,
            isPublished: !!collection.isPublished,
            date: new Date().toISOString().slice(0, 10),
            groups
        });
        const fileName = customManuscriptPdfName(collection);
        doc.save(fileName);
        return { fileName, skipped };
    }

    return { generateCustomManuscriptPdf };
}
