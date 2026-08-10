/**
 * Client-side static-site exporter for the public notation viewer.
 *
 * Produces a ZIP that mirrors the `/public` route offline:
 *   - a root directory page (like PublicManuscriptsView)
 *   - one page per published source (like PublicNotationView): pattern table + line gallery
 *   - real IIIF image crops saved as files under snippets/<source>/ so the bundle is
 *     self-contained and the crops double as citation "quotes".
 *
 * It reuses the app's own logic so the output can't drift from the live site:
 *   - buildPatternRefMap / buildManuscriptLines  (usePublicNotation.js — same as the view)
 *   - getIiifRegionUrl / getImageUrl             (useImageManifest.js — same IIIF resolution)
 *   - renderSvg                                  (svgRenderer.js — same pattern glyphs)
 */
import JSZip from 'jszip';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useAnnotationsStore } from '../stores/annotations';
import { useIiifStore } from '../stores/iiif';
import { useSettingsStore } from '../stores/settings';
import { useTranscriptionData } from './useTranscriptionData';
import { useImageManifest } from './useImageManifest';
import { buildPatternRefMap, buildManuscriptLines, pointsBoundingBox } from './usePublicNotation';
import { comparePatternIds } from '../utils/sorting';
import { renderSvg } from '../utils/svgRenderer';

// ---- small utilities -------------------------------------------------------

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function slugify(s) {
    return String(s ?? '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'source';
}

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

/** Run async `fn` over `items` with limited concurrency, preserving order. */
async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

/** Crop a local (same-origin) image to a percent bbox via canvas. Returns a Blob. */
function cropLocalToBlob(imgUrl, bbox) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const iw = img.naturalWidth, ih = img.naturalHeight;
                const sx = (bbox.x / 100) * iw;
                const sy = (bbox.y / 100) * ih;
                const sw = Math.max(1, (bbox.w / 100) * iw);
                const sh = Math.max(1, (bbox.h / 100) * ih);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(sw);
                canvas.height = Math.round(sh);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.9);
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = () => reject(new Error('image load failed'));
        img.src = imgUrl;
    });
}

/**
 * Fetch a cropped snippet for a percent bbox. Prefers the IIIF Image API region
 * request (small, exact, server-side crop); falls back to a local canvas crop.
 * Returns { blob, ext } or null on failure.
 */
async function fetchCrop({ getIiifRegionUrl, getImageUrl }, source, folio, bbox, targetWidth) {
    const region = `pct:${bbox.x.toFixed(3)},${bbox.y.toFixed(3)},${bbox.w.toFixed(3)},${bbox.h.toFixed(3)}`;
    const url = getIiifRegionUrl(source, folio, region, String(Math.max(120, Math.round(targetWidth))));
    if (url) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const blob = await res.blob();
                if (blob && blob.size > 0) return { blob, ext: 'jpg' };
            }
        } catch (e) {
            /* CORS or network — fall through to local crop */
        }
    }
    try {
        const localUrl = getImageUrl(source, folio);
        const blob = await cropLocalToBlob(localUrl, bbox);
        if (blob && blob.size > 0) return { blob, ext: 'jpg' };
    } catch (e) {
        /* give up */
    }
    return null;
}

// ---- pattern rendering (mirrors PatternDisplay.vue) ------------------------

function patternMarkup(pattern, glyphs, displayMode) {
    if (displayMode === 'arrow') {
        const a = String(pattern).replace(/u/g, '↗').replace(/d/g, '↘').replace(/e/g, '→');
        return `<span class="mode-arrow">${esc(a)}</span>`;
    }
    if (displayMode === 'text') {
        return `<span class="mode-text">${esc(pattern)}</span>`;
    }
    // 'svg' (default): renderSvg returns a complete standalone <svg> string
    const r = renderSvg(pattern, glyphs, false);
    return r.content || `<span class="mode-text">${esc(pattern)}</span>`;
}

// ---- occurrences (mirrors PublicNotationView patternOccurrences) -----------

function buildPatternOccurrences(lines) {
    const map = {};
    for (const line of lines) {
        const lineLabel = `${line.folio} / ${line.lineName}`;
        for (const item of line.items || []) {
            if (!item || !item.pattern) continue;
            if (!map[item.pattern]) map[item.pattern] = {};
            const vKey = item.variant || '_base';
            if (!map[item.pattern][vKey]) map[item.pattern][vKey] = new Map();
            // Dedupe identical labels for a cleaner static page
            if (!map[item.pattern][vKey].has(lineLabel)) {
                map[item.pattern][vKey].set(lineLabel, { label: lineLabel, regionId: line.regionId, annId: item.id });
            }
        }
    }
    return map;
}

// ---- HTML/CSS ---------------------------------------------------------------

const DESIGN_TOKENS = `
  --color-bg:#f8fafc; --color-surface:#ffffff; --color-surface-muted:#f1f5f9; --color-nav-bg:#1e293b;
  --color-border:#e2e8f0; --color-border-hover:#cbd5e1;
  --color-text:#1e293b; --color-text-muted:#64748b; --color-text-light:#94a3b8;
  --color-primary:#3b82f6; --color-primary-hover:#2563eb; --color-primary-active:#1d4ed8;
  --color-primary-light:#dbeafe; --color-primary-dark:#1e3a8a;
  --color-danger:#ef4444; --color-warning:#f59e0b; --color-success:#22c55e;
`;

function pageCss() {
    return `:root{${DESIGN_TOKENS}}
*{box-sizing:border-box;}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--color-text);background:var(--color-bg);line-height:1.5;}
a{color:var(--color-primary-hover);text-decoration:none;} a:hover{text-decoration:underline;}
code,.mono{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;}
.header{background:linear-gradient(135deg,var(--color-surface) 0%,var(--color-surface-muted) 100%);border-bottom:1px solid var(--color-border);padding:40px 20px;}
.header-content{max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:12px;}
.back-link{color:var(--color-text-muted);font-weight:600;font-size:.85rem;}
.brand{color:var(--color-primary-hover);font-size:.9rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;}
h1{margin:4px 0 0;font-size:2.6rem;font-weight:800;letter-spacing:-.02em;}
.subtitle{margin:2px 0 0;color:var(--color-text-muted);font-size:1.2rem;font-weight:500;}
.notes-text{margin-top:10px;white-space:pre-wrap;max-width:800px;font-size:1.02rem;}
.main-content{max-width:1200px;margin:40px auto;padding:0 20px;display:flex;flex-direction:column;gap:50px;}
.section-header{display:flex;align-items:center;gap:16px;margin-bottom:20px;border-bottom:1px solid var(--color-border);padding-bottom:12px;flex-wrap:wrap;}
.section-header h2{margin:0;font-size:1.5rem;font-weight:700;}
.badge{background:var(--color-primary-hover);color:#fff;padding:4px 12px;border-radius:20px;font-size:.85rem;font-weight:700;}
.hint{font-size:.8rem;color:var(--color-text-light);font-style:italic;}
.table-columns{display:flex;gap:30px;align-items:flex-start;}
.table-column{flex:1;min-width:0;}
.pattern-table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);font-size:.85rem;border:1px solid var(--color-border);}
.pattern-table th{background:var(--color-bg);font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);padding:10px;text-align:left;}
.pattern-table td{padding:8px 12px;border-bottom:1px solid var(--color-surface-muted);vertical-align:top;}
.ref-id{color:var(--color-primary-hover);font-family:"JetBrains Mono",monospace;font-size:1rem;font-weight:700;}
.pattern-cell{min-width:120px;}
.pattern-cell svg{display:block;margin:0 auto;max-width:100%;height:auto;}
.mode-arrow{font-size:1.1em;color:var(--color-text-muted);} .mode-text{font-family:monospace;font-weight:bold;}
.variant-groups{display:flex;flex-direction:column;gap:6px;}
.variant-header{font-size:.65rem;font-weight:800;text-transform:uppercase;color:var(--color-text-muted);letter-spacing:.05em;}
.loc-list{display:flex;flex-wrap:wrap;gap:6px;}
.loc-tag{background:var(--color-primary-light);padding:1px 8px;border-radius:4px;color:var(--color-primary-dark);font-weight:600;font-size:.75rem;}
.no-data{color:var(--color-text-light);font-style:italic;}
.lines-list{display:flex;flex-direction:column;gap:30px;}
.line-card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);border:1px solid var(--color-border);}
.line-header{padding:10px 15px;background:var(--color-bg);border-bottom:1px solid var(--color-border);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}
.line-header h3{margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;}
.divider{color:var(--color-border-hover);}
.line-tags{display:flex;gap:8px;flex-wrap:wrap;}
.ref-tag{background:var(--color-surface-muted);padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:700;font-family:"JetBrains Mono",monospace;border:1px solid var(--color-border);}
.line-content{padding:12px;}
.cutout{position:relative;width:100%;background:#fff;border:1px solid var(--color-border);border-radius:8px;overflow:hidden;}
.cutout svg.plate{display:block;width:100%;height:auto;background:#fff;}
.labels-layer{position:absolute;inset:0;pointer-events:none;}
.html-label{position:absolute;transform:translate(-50%,-100%) translateY(-2px);background:#fff;border:1px solid #000;color:#000;padding:1px 4px;font-size:10px;font-family:"JetBrains Mono",monospace;font-weight:600;line-height:1;white-space:nowrap;border-radius:2px;box-shadow:0 2px 4px rgba(0,0,0,.1);}
.missing-img{padding:20px;text-align:center;color:var(--color-text-light);font-style:italic;background:var(--color-surface-muted);border-radius:8px;}
/* directory */
.dir-container{max-width:1000px;margin:0 auto;padding:40px 20px;}
.dir-header{text-align:center;margin-bottom:40px;}
.ms-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--color-border);border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,.05);}
.ms-table th{background:var(--color-bg);padding:16px 24px;font-size:.85rem;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.025em;border-bottom:1px solid var(--color-border);text-align:left;}
.ms-table td{padding:16px 24px;border-bottom:1px solid var(--color-surface-muted);}
.ms-table tr:last-child td{border-bottom:none;}
.ms-table .num{text-align:right;}
.pill{background:var(--color-primary-light);color:var(--color-primary-hover);padding:4px 10px;border-radius:20px;font-size:.8rem;font-weight:600;}
@media(max-width:768px){.table-columns{flex-direction:column;} h1{font-size:2rem;}}
`;
}

function htmlDoc(title, bodyInner) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>${pageCss()}</style>
</head>
<body>
${bodyInner}
</body>
</html>`;
}

/** Build the static clone of AnnotationCutout for one gallery line. */
function lineCutoutHtml(line, snippetHref) {
    const bbox = pointsBoundingBox(line.points, 0.05);
    if (!bbox) return `<div class="missing-img">No polygon for this line.</div>`;
    if (!snippetHref) {
        return `<div class="missing-img">Image snippet unavailable (folio ${esc(line.folio)}).</div>`;
    }
    const vb = `${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`;

    // Overlay polygons + labels: only real items carry polygon points
    let overlays = '';
    let labels = '';
    for (const item of line.items || []) {
        if (!item.points) continue;
        overlays += `<polygon points="${esc(item.points)}" fill="rgba(0,255,0,0.10)" stroke="var(--color-success)" stroke-width="0.3" vector-effect="non-scaling-stroke"/>`;
        const first = String(item.points).split(' ')[0].split(',');
        const px = parseFloat(first[0]);
        const py = parseFloat(first[1]);
        if (!isNaN(px) && !isNaN(py)) {
            const leftPct = ((px - bbox.x) / bbox.w) * 100;
            const topPct = ((py - bbox.y) / bbox.h) * 100;
            const lbl = item.displayId || (item.id ? String(item.id).substring(0, 4) : '?');
            labels += `<div class="html-label" style="left:${leftPct.toFixed(2)}%;top:${topPct.toFixed(2)}%;">${esc(lbl)}</div>`;
        }
    }

    return `<div class="cutout">
<svg class="plate" viewBox="${vb}" preserveAspectRatio="none">
<image href="${esc(snippetHref)}" x="${bbox.x}" y="${bbox.y}" width="${bbox.w}" height="${bbox.h}" preserveAspectRatio="none"/>
${overlays}
<polygon points="${esc(line.points)}" fill="none" stroke="var(--color-border-hover)" stroke-width="0.5" vector-effect="non-scaling-stroke" opacity="0.8"/>
</svg>
<div class="labels-layer">${labels}</div>
</div>`;
}

function sourcePageHtml({ source, table, patternRefMap, lines, glyphs, displayMode, lineHrefById }) {
    const occ = buildPatternOccurrences(lines);
    const rows = [...(table.rows || [])].sort((a, b) => comparePatternIds(a.customId, b.customId));
    const mid = Math.ceil(rows.length / 2);
    const halves = [rows.slice(0, mid), rows.slice(mid)];

    const columnsHtml = halves.map(half => {
        const body = half.map(row => {
            const refId = patternRefMap[row.pattern] || '-';
            const patCell = patternMarkup(row.pattern, glyphs, displayMode);
            let occCell = '<span class="no-data">None</span>';
            if (occ[row.pattern]) {
                occCell = '<div class="variant-groups">' + Object.entries(occ[row.pattern]).map(([variant, locs]) => {
                    const vh = variant !== '_base' ? `<div class="variant-header">Variant ${esc(variant)}</div>` : '';
                    const tags = Array.from(locs.values()).map(l => `<span class="loc-tag">${esc(l.label)}</span>`).join('');
                    return `<div class="variant-group">${vh}<div class="loc-list">${tags}</div></div>`;
                }).join('') + '</div>';
            }
            return `<tr><td class="ref-id">${esc(refId)}</td><td class="pattern-cell">${patCell}</td><td>${occCell}</td></tr>`;
        }).join('');
        return `<div class="table-column"><table class="pattern-table"><thead><tr><th>Ref ID</th><th>Pattern</th><th>Occurrences</th></tr></thead><tbody>${body}</tbody></table></div>`;
    }).join('');

    const galleryHtml = lines.map(line => {
        const id = line.regionId || (line.folio + line.lineName);
        const tags = (line.items || []).map(i => `<span class="ref-tag">${esc(i.displayId)}</span>`).join('');
        const cutout = lineCutoutHtml(line, lineHrefById[id]);
        return `<div class="line-card" id="line-${esc(id)}">
<div class="line-header">
<h3><span class="fol">${esc(line.folio)}</span><span class="divider">/</span><span class="num">${esc(line.lineName)}</span></h3>
<div class="line-tags">${tags}</div>
</div>
<div class="line-content">${cutout}</div>
</div>`;
    }).join('');

    const notes = table.notes ? `<div class="notes-text">${esc(table.notes)}</div>` : '';

    const body = `<header class="header"><div class="header-content">
<div><a class="back-link" href="../index.html">&larr; Back to Directory</a></div>
<div class="brand">Notationsdokumentation</div>
<h1>${esc(source)}</h1>
<p class="subtitle">${esc(table.name || '')}</p>
${notes}
</div></header>
<main class="main-content">
<section class="section">
<div class="section-header"><h2>Patterns &amp; Equivalents</h2><span class="badge">${(table.rows || []).length} Patterns</span></div>
<div class="table-columns">${columnsHtml}</div>
</section>
<section class="section">
<div class="section-header"><h2>Manuscript Line Gallery</h2><span class="badge">${lines.length} Entries</span><span class="hint">Cropped IIIF snippets</span></div>
<div class="lines-list">${galleryHtml || '<p class="no-data">No annotated manuscript lines found for this source.</p>'}</div>
</section>
</main>`;

    return htmlDoc(`${source} — Notationsdokumentation`, body);
}

function sourcePageMarkdown({ source, table, patternRefMap, lines, snippetPathById }) {
    const occ = buildPatternOccurrences(lines);
    const rows = [...(table.rows || [])].sort((a, b) => comparePatternIds(a.customId, b.customId));
    let md = `# ${source} — Notationsdokumentation\n\n`;
    if (table.name) md += `**${table.name}**\n\n`;
    if (table.notes) md += `${table.notes}\n\n`;

    md += `## Patterns & Equivalents (${rows.length})\n\n`;
    md += `| Ref ID | Pattern | Occurrences |\n| --- | --- | --- |\n`;
    for (const row of rows) {
        const refId = patternRefMap[row.pattern] || '-';
        let occStr = '';
        if (occ[row.pattern]) {
            occStr = Object.entries(occ[row.pattern]).map(([variant, locs]) => {
                const labels = Array.from(locs.values()).map(l => l.label).join('; ');
                return variant !== '_base' ? `[${variant}] ${labels}` : labels;
            }).join(' — ');
        }
        md += `| ${refId} | \`${row.pattern}\` | ${occStr || '—'} |\n`;
    }

    md += `\n## Manuscript Line Gallery (${lines.length})\n\n`;
    for (const line of lines) {
        const id = line.regionId || (line.folio + line.lineName);
        const tags = (line.items || []).map(i => i.displayId).join(', ');
        md += `### ${line.folio} / ${line.lineName}\n\n`;
        if (tags) md += `Ref IDs: ${tags}\n\n`;
        const p = snippetPathById[id];
        if (p) md += `![${line.folio} ${line.lineName}](${p})\n\n`;
    }
    return md;
}

function directoryHtml(entries) {
    const rows = entries.map(e => `<tr>
<td><strong>${esc(e.source)}</strong></td>
<td>${esc(e.name || '')}</td>
<td class="num"><span class="pill">${e.patternCount}</span></td>
<td class="num"><a href="${esc(e.href)}">View &rarr;</a></td>
</tr>`).join('');

    const body = `<div class="dir-container">
<div class="dir-header"><div class="brand">Notationsdokumentation</div><h1>Manuscripts</h1><p class="subtitle">Static export — ${todayStr()}</p></div>
<table class="ms-table">
<thead><tr><th>Source</th><th>Manuscript Title</th><th class="num">Patterns</th><th class="num"></th></tr></thead>
<tbody>${rows || '<tr><td colspan="4">No published manuscripts.</td></tr>'}</tbody>
</table>
</div>`;
    return htmlDoc('Notationsdokumentation — Manuscripts', body);
}

function directoryMarkdown(entries) {
    let md = `# Notationsdokumentation — Manuscripts\n\nStatic export — ${todayStr()}\n\n`;
    md += `| Source | Manuscript Title | Patterns |\n| --- | --- | --- |\n`;
    for (const e of entries) {
        md += `| [${e.source}](${e.mdHref}) | ${e.name || ''} | ${e.patternCount} |\n`;
    }
    return md;
}

// ---- main entry point ------------------------------------------------------

/**
 * Build and download the static site ZIP.
 * @param {(p: {phase:string, message:string, done?:number, total?:number}) => void} [onProgress]
 * @returns {Promise<{sources:number, snippets:number, failures:number}>}
 */
export async function exportStaticSite(onProgress = () => {}) {
    const tablesStore = usePersonalTablesStore();
    const annotStore = useAnnotationsStore();
    const iiifStore = useIiifStore();
    const settings = useSettingsStore();
    const { rawData, loadSource, loading } = useTranscriptionData();
    const imageManifest = useImageManifest();

    const report = (phase, message, done, total) => onProgress({ phase, message, done, total });

    // 1. Ensure the transcription index is ready
    report('init', 'Loading transcription index…');
    let guard = 0;
    while (loading.value && guard < 300) { // up to ~30s
        await new Promise(r => setTimeout(r, 100));
        guard++;
    }

    // 2. Published sources: same predicate as PublicManuscriptsView
    const published = tablesStore.tables.filter(t => {
        if (!t.isPublished) return false;
        const prefix = t.source + '_';
        return Object.keys(annotStore.regions).some(k => k.startsWith(prefix) && annotStore.regions[k].length > 0);
    });

    if (published.length === 0) {
        throw new Error('No published manuscripts with annotations found. Mark a manuscript as "Published" and add at least one annotated line first.');
    }

    const zip = new JSZip();
    const displayMode = settings.displayMode || 'svg';
    const directoryEntries = [];
    const usedSlugs = new Set();
    let totalSnippets = 0;
    let totalFailures = 0;

    for (let si = 0; si < published.length; si++) {
        const table = published[si];
        const source = table.source;
        report('source', `Processing "${source}" (${si + 1}/${published.length})…`, si, published.length);

        // Load this source's transcription + IIIF manifest (same as the live view)
        await loadSource(source);
        await iiifStore.ensureLoaded(source);

        const glyphs = useTranscriptionData().glyphs.value;
        const patternRefMap = buildPatternRefMap(table, settings.getGlobalId);
        const lines = buildManuscriptLines({
            source,
            rawDataForSource: rawData.value[source],
            regions: annotStore.regions,
            regionItems: annotStore.regionItems,
            patternRefMap
        });

        // Unique folder per source
        let folder = slugify(source);
        let n = 2;
        while (usedSlugs.has(folder)) folder = `${slugify(source)}-${n++}`;
        usedSlugs.add(folder);

        // Fetch a snippet crop per gallery line (with limited concurrency)
        const lineHrefById = {};       // for HTML (relative to the source page)
        const snippetPathRelById = {}; // for markdown (relative to the source page)
        report('snippets', `Cropping ${lines.length} line snippet(s) for "${source}"…`, si, published.length);

        await mapLimit(lines, 4, async (line) => {
            const id = line.regionId || (line.folio + line.lineName);
            const bbox = pointsBoundingBox(line.points, 0.05);
            if (!bbox) return;
            const targetWidth = Math.max(400, Math.round(1600 * (bbox.w / 100)));
            const crop = await fetchCrop(imageManifest, source, line.folio, bbox, targetWidth);
            if (!crop) { totalFailures++; return; }
            const fname = `line-${slugify(String(id))}.${crop.ext}`;
            zip.file(`${folder}/snippets/${fname}`, crop.blob);
            lineHrefById[id] = `snippets/${fname}`;
            snippetPathRelById[id] = `snippets/${fname}`;
            totalSnippets++;

            // Also save exact per-item citation crops (tight bbox, higher res)
            for (const item of line.items || []) {
                if (!item.points) continue;
                const ib = pointsBoundingBox(item.points, 0.02);
                if (!ib) continue;
                const iw = Math.max(300, Math.round(2400 * (ib.w / 100)));
                const icrop = await fetchCrop(imageManifest, source, line.folio, ib, iw);
                if (!icrop) { totalFailures++; continue; }
                zip.file(`${folder}/snippets/item-${slugify(String(item.id))}.${icrop.ext}`, icrop.blob);
                totalSnippets++;
            }
        });

        // Generate pages
        const html = sourcePageHtml({ source, table, patternRefMap, lines, glyphs, displayMode, lineHrefById });
        const md = sourcePageMarkdown({ source, table, patternRefMap, lines, snippetPathById: snippetPathRelById });
        zip.file(`${folder}/index.html`, html);
        zip.file(`${folder}/index.md`, md);

        directoryEntries.push({
            source,
            name: table.name,
            patternCount: (table.rows || []).length,
            href: `${encodeURI(folder)}/index.html`,
            mdHref: `${encodeURI(folder)}/index.md`
        });
    }

    // 3. Root directory + README
    report('bundle', 'Building directory and packaging ZIP…');
    directoryEntries.sort((a, b) => String(a.source).localeCompare(String(b.source), undefined, { numeric: true }));
    zip.file('index.html', directoryHtml(directoryEntries));
    zip.file('README.md', directoryMarkdown(directoryEntries));

    // 4. Generate + download
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cm-public-site-${todayStr()}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    report('done', `Done — ${published.length} source(s), ${totalSnippets} snippet(s)` + (totalFailures ? `, ${totalFailures} failed` : ''));
    return { sources: published.length, snippets: totalSnippets, failures: totalFailures };
}
