#!/usr/bin/env node
/**
 * Which transcribed folios have a scan, per manuscript.
 *
 * Reads the two test fixtures (corpus-manifests.json: the canvas labels of every
 * manuscript with a manifest and the transcription's folios; alignment-golden.json:
 * which scan each folio resolves to) and the shipped index.json, and prints a
 * Markdown report:
 *
 *   - folios with no scan (a gap in the library's digitisation, a different
 *     manifest than the one the transcription describes, or a label the app cannot read),
 *   - manuscripts whose pages are placed only by counting scans ("position") —
 *     right if the scans run on without gaps, worth checking against one known page,
 *   - manuscripts that have transcription but no manifest at all.
 *
 *   node scripts/coverage-report.mjs > coverage.md
 *
 * Refresh the fixtures first (node scripts/fetch-iiif-fixtures.mjs; then
 * UPDATE_GOLDEN=1 npx vitest run src/test/alignment/corpus.test.js).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const uiDir = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtures = join(uiDir, 'src', 'test', 'fixtures', 'iiif');
const corpus = JSON.parse(readFileSync(join(fixtures, 'corpus-manifests.json'), 'utf8')).sources;
const golden = JSON.parse(readFileSync(join(fixtures, 'alignment-golden.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(uiDir, 'public', 'index.json'), 'utf8'));

// "f.18v" and "18v" are one page; list each page once, in the transcription's most common spelling.
const identity = f => String(f).toLowerCase().replace(/^f\.?\s*/, '').replace(/^0+(?=\d)/, '');
function pagesOf(entries) {
    const byPage = new Map();
    for (const [folio, hit] of Object.entries(entries)) {
        const key = identity(folio);
        const prev = byPage.get(key);
        if (!prev) byPage.set(key, { folio: key, hit });
        else if (!prev.hit && hit) prev.hit = hit; // found under the other spelling
    }
    return [...byPage.values()];
}
const sortFolios = (a, b) => a.localeCompare(b, 'en', { numeric: true });

const rows = [];
for (const source of Object.keys(golden).sort()) {
    const pages = pagesOf(golden[source]);
    const missing = pages.filter(p => !p.hit).map(p => p.folio).sort(sortFolios);
    const via = { label: 0, position: 0, fuzzy: 0, other: 0 };
    for (const p of pages) {
        if (!p.hit) continue;
        const m = /\((\w+)\)$/.exec(p.hit);
        via[m && via[m[1]] !== undefined ? m[1] : 'other']++;
    }
    rows.push({ source, canvases: corpus[source]?.canvases.length ?? 0, total: pages.length, missing, via });
}

const out = [];
const gaps = rows.filter(r => r.missing.length);
out.push(`## Transcribed folios without a scan (${gaps.length} manuscripts)\n`);
out.push('| Manuscript | Scans | Pages transcribed | Without scan | Which |');
out.push('|---|---:|---:|---:|---|');
for (const r of gaps) {
    const list = r.missing.length > 24 ? `${r.missing.slice(0, 24).join(', ')}, … (${r.missing.length - 24} more)` : r.missing.join(', ');
    out.push(`| ${r.source} | ${r.canvases} | ${r.total} | ${r.missing.length} | ${list} |`);
}

const counted = rows.filter(r => r.total && (r.via.position + r.via.fuzzy) / r.total >= 0.5);
out.push(`\n## Placed by counting scans, not by their labels (${counted.length} manuscripts)\n`);
out.push('| Manuscript | Pages | By label | By counting | Approximate |');
out.push('|---|---:|---:|---:|---:|');
for (const r of counted) out.push(`| ${r.source} | ${r.total} | ${r.via.label} | ${r.via.position} | ${r.via.fuzzy} |`);

const withManifest = new Set(Object.keys(index.manifests || {}));
const bare = (index.sources || [])
    .filter(s => !withManifest.has(s))
    .map(s => ({ source: s, pages: pagesOf(Object.fromEntries((index.sourceFolios?.[s] || []).map(f => [f, null]))).length }))
    .sort((a, b) => b.pages - a.pages);
out.push(`\n## Transcribed but without a manifest (${bare.length} manuscripts)\n`);
out.push('| Manuscript | Pages transcribed |');
out.push('|---|---:|');
for (const b of bare) out.push(`| ${b.source} | ${b.pages} |`);

console.log(out.join('\n'));
