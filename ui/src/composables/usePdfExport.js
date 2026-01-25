import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { Canvg } from 'canvg';
import { renderSvg } from '../utils/svgRenderer.js';
import { useAnnotationsStore } from '../stores/annotations';
import { useImageManifest } from './useImageManifest';

export function usePdfExport() {
    const annotStore = useAnnotationsStore();
    const { getImageUrl, getStandardSource } = useImageManifest();

    /**
     * Helper to crop a snippet from a source image using canvas
     */
    async function cropSnippet(imageUrl, points) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const pts = points.split(' ').filter(p => p).map(p => {
                    const [x, y] = p.split(',').map(parseFloat);
                    return { x, y };
                });

                if (pts.length === 0) return resolve(null);

                const xs = pts.map(p => p.x);
                const ys = pts.map(p => p.y);
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);

                const wP = maxX - minX;
                const hP = maxY - minY;

                // Add 30% padding context
                const padX = wP * 0.3;
                const padY = hP * 0.3;

                const vbX = Math.max(0, minX - padX);
                const vbY = Math.max(0, minY - padY);
                const vbW = Math.min(100 - vbX, wP + (padX * 2));
                const vbH = Math.min(100 - vbY, hP + (padY * 2));

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Target width for snippet (e.g. 400px wide)
                const targetW = 400;
                const targetH = (vbH / vbW) * targetW;

                canvas.width = targetW;
                canvas.height = targetH;

                const sourceX = (vbX / 100) * img.width;
                const sourceY = (vbY / 100) * img.height;
                const sourceW = (vbW / 100) * img.width;
                const sourceH = (vbH / 100) * img.height;

                ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, targetW, targetH);

                // Draw polygon outline too
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 2;
                ctx.beginPath();
                pts.forEach((p, i) => {
                    const drawX = ((p.x - vbX) / vbW) * targetW;
                    const drawY = ((p.y - vbY) / vbH) * targetH;
                    if (i === 0) ctx.moveTo(drawX, drawY);
                    else ctx.lineTo(drawX, drawY);
                });
                ctx.closePath();
                ctx.stroke();

                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve(null);
            img.src = imageUrl;
        });
    }

    async function generatePdf(tableConfig, allData, glyphs) {
        if (!tableConfig.name) return;

        // 1. Prepare Doc
        const doc = new jsPDF();

        // 2. Pre-render SVGs to PNGs
        const images = {}; // rowIndex -> { dataUrl, aspect }
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const rows = tableConfig.rows;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const { width, height, content } = renderSvg(row.pattern, glyphs);

            if (width > 0 && height > 0) {
                const scale = 4;
                canvas.width = width * scale;
                canvas.height = height * scale;

                try {
                    const v = await Canvg.from(ctx, content);
                    await v.render();
                    images[i] = {
                        dataUrl: canvas.toDataURL('image/png'),
                        aspect: width / height
                    };
                } catch (e) {
                    console.error("SVG Render Error", e);
                }
            }
        }

        // 2.5 Collect Snippet Images (Evidence)
        const snippetFiles = [];
        const addedAnnots = new Set();
        const sourceData = allData[tableConfig.source];

        for (const row of rows) {
            if (sourceData && sourceData[row.pattern]) {
                const pageSet = new Set();
                sourceData[row.pattern].forEach(o => pageSet.add(JSON.stringify({ d: o[0], f: o[1] })));

                for (const json of pageSet) {
                    const { d, f } = JSON.parse(json);
                    const std = getStandardSource(d, f);
                    const anns = annotStore.getAnnotations(std, f, row.pattern);
                    for (const a of anns) {
                        if (addedAnnots.has(a.id)) continue;

                        const url = getImageUrl(d, f);
                        const dataUrl = await cropSnippet(url, a.points);
                        if (dataUrl) {
                            addedAnnots.add(a.id);
                            snippetFiles.push({ dataUrl, folio: f, customId: row.customId, pattern: row.pattern });
                        }
                    }
                }
            }
        }

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text(tableConfig.name, 14, 20);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Manuscript Signature: ${tableConfig.source}`, 14, 26);
        doc.setTextColor(0);

        // --- SECTION 1: Type Summary Table ---
        const columns = ["Ref ID", "Type / Pattern", "N Tokens"];
        const tableBody = rows.map(row => {
            const count = sourceData && sourceData[row.pattern] ? sourceData[row.pattern].length : 0;
            return [row.customId || '-', "", count];
        });

        autoTable(doc, {
            startY: 32,
            head: [columns],
            body: tableBody,
            headStyles: { fillGray: 240, textColor: 0, fontStyle: 'bold' },
            styles: { cellPadding: 2, fontSize: 9, valign: 'middle' },
            columnStyles: {
                0: { cellWidth: 30 },
                1: { minCellHeight: 14, cellWidth: 35 },
                2: { cellWidth: 15, halign: 'center' }
            },
            didDrawCell: (data) => {
                if (data.section === 'body' && data.column.index === 1) {
                    const rowIndex = data.row.index;
                    const imgInfo = images[rowIndex];
                    if (imgInfo) {
                        const boxH = data.cell.height - 2;
                        const boxW = data.cell.width - 2;
                        let drawW = boxW;
                        let drawH = drawW / imgInfo.aspect;
                        if (drawH > boxH) {
                            drawH = boxH;
                            drawW = drawH * imgInfo.aspect;
                        }
                        const offX = data.cell.x + (data.cell.width - drawW) / 2;
                        const offY = data.cell.y + (data.cell.height - drawH) / 2;
                        doc.addImage(imgInfo.dataUrl, 'PNG', offX, offY, drawW, drawH);
                    }
                }
            }
        });

        // --- SECTION 2: Token Evidence (Fitted on same page if space) ---
        let lastY = doc.lastAutoTable.finalY + 15;

        if (snippetFiles.length > 0) {
            // Check if we need a new page for header
            if (lastY > 260) {
                doc.addPage();
                lastY = 20;
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text("Tokens", 12, lastY);

            // Grid Layout
            let curX = 14;
            let curY = lastY + 8;
            const snippetW = 42; // Tighter
            const snippetH = 32;
            const gapX = 6;
            const gapY = 16;
            const perRow = 4; // 4 columns instead of 3

            for (let i = 0; i < snippetFiles.length; i++) {
                const snip = snippetFiles[i];

                // Page break check
                if (curY + snippetH + 15 > 285) {
                    doc.addPage();
                    curY = 20;
                    curX = 14;
                }

                // Draw Snippet
                doc.addImage(snip.dataUrl, 'PNG', curX, curY, snippetW, snippetH);

                // Labels
                doc.setFont("helvetica", "bold");
                doc.setFontSize(8);
                const label = snip.customId ? `ID: ${snip.customId}` : 'No ID';
                doc.text(label, curX, curY + snippetH + 4);

                doc.setFont("helvetica", "normal");
                doc.text(`Folio: ${snip.folio}`, curX, curY + snippetH + 8);

                // Advance X/Y
                if ((i + 1) % perRow === 0) {
                    curX = 14;
                    curY += snippetH + gapY;
                } else {
                    curX += snippetW + gapX;
                }
            }
        }

        const safeName = (tableConfig.name || 'Table').replace(/[^a-z0-9]/gi, '_');
        const safeSource = (tableConfig.source || 'custom').replace(/[^a-z0-9]/gi, '_');
        doc.save(`${safeName}-${safeSource}.pdf`);
    }

    return {
        generatePdf
    };
}
