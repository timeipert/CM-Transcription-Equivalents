#!/usr/bin/env node
/**
 * Snapshot the real IIIF manifests of the corpus for the alignment tests.
 *
 * For every manuscript with a manifest in public/index.json, this downloads the
 * manifest and keeps only what page alignment depends on: each canvas's raw
 * `label` value (exactly as the manifest has it — a string, a list or a language
 * map) and whether the canvas has an image. Together with the transcription's
 * folios for the same manuscript (from index.json) that is written to
 * src/test/fixtures/iiif/corpus-manifests.json, so the tests run offline against
 * what the libraries really publish.
 *
 *   node scripts/fetch-iiif-fixtures.mjs            # all manuscripts
 *   node scripts/fetch-iiif-fixtures.mjs "Ox 340"   # only these (merged into the file)
 *   node scripts/fetch-iiif-fixtures.mjs --delay=8000 …   # slower, for servers that throttle (Gallica)
 *
 * Re-run it when a library changes its manifests, then review the test diff:
 * the golden alignment file shows exactly which pages would move.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const uiDir = dirname(dirname(fileURLToPath(import.meta.url)));
const indexPath = join(uiDir, 'public', 'index.json');
const outPath = join(uiDir, 'src', 'test', 'fixtures', 'iiif', 'corpus-manifests.json');

const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const args = process.argv.slice(2);
const delayArg = args.find(a => a.startsWith('--delay='));
const DELAY_MS = delayArg ? Number(delayArg.slice('--delay='.length)) : 700;
const only = new Set(args.filter(a => !a.startsWith('--')));
const sources = Object.keys(index.manifests || {}).filter(s => !only.size || only.has(s)).sort();

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45000);
        try {
            // Some servers refuse an explicit JSON Accept header (HTTP 406), so the
            // retry asks for anything.
            const accept = attempt === 1 ? 'application/json' : '*/*';
            const res = await fetch(url, {
                signal: controller.signal,
                headers: { Accept: accept, 'User-Agent': 'neume-viewer-test-fixtures (https://neume.monodi.app)' }
            });
            if (res.status === 429) await sleep(15000 * attempt);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            if (attempt === 3) throw e;
            await sleep(2000 * attempt);
        } finally {
            clearTimeout(timer);
        }
    }
}

function contextVersion(data) {
    const ctx = [].concat(data['@context'] || []).map(String).join(' ');
    if (ctx.includes('presentation/3')) return 3;
    if (ctx.includes('presentation/2')) return 2;
    return null;
}

/** [rawLabel, hasImage] per canvas, in manifest order. */
function canvases(data, version) {
    if (version === 2) {
        const list = (data.sequences && data.sequences[0] && data.sequences[0].canvases) || [];
        return list.map(c => {
            const r = c.images && c.images[0] && c.images[0].resource;
            return [c.label ?? null, r ? 1 : 0];
        });
    }
    return (data.items || []).map(c => {
        const body = c.items && c.items[0] && c.items[0].items && c.items[0].items[0] && c.items[0].items[0].body;
        return [c.label ?? null, body ? 1 : 0];
    });
}

const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { sources: {} };
const out = { ...existing, sources: { ...existing.sources } };
const failures = [];

for (const source of sources) {
    const url = index.manifests[source].url;
    process.stdout.write(`${source.padEnd(16)} `);
    try {
        const data = await fetchJson(url);
        const version = contextVersion(data);
        if (!version) throw new Error('unknown manifest version');
        const list = canvases(data, version);
        out.sources[source] = {
            url,
            version,
            canvases: list,
            dataFolios: index.sourceFolios?.[source] || []
        };
        console.log(`v${version}  ${list.length} canvases`);
    } catch (e) {
        failures.push(source);
        console.log(`FAILED: ${e.message}`);
    }
    await sleep(DELAY_MS); // be polite to the libraries' servers
}

out.generated = new Date().toISOString().slice(0, 10);
mkdirSync(dirname(outPath), { recursive: true });
// One manuscript per line keeps the file reviewable in a diff.
const body = Object.keys(out.sources).sort()
    .map(s => `    ${JSON.stringify(s)}: ${JSON.stringify(out.sources[s])}`).join(',\n');
writeFileSync(outPath, `{\n  "generated": ${JSON.stringify(out.generated)},\n  "sources": {\n${body}\n  }\n}\n`);
console.log(`\n${Object.keys(out.sources).length} manuscripts in ${outPath}${failures.length ? `; failed: ${failures.join(', ')}` : ''}`);
