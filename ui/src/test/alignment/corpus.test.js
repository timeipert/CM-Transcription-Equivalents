/**
 * Page alignment on the real manifests of the corpus.
 *
 * fixtures/iiif/corpus-manifests.json holds the canvas labels of every manuscript
 * with a manifest (as the libraries publish them; refresh with
 * `node scripts/fetch-iiif-fixtures.mjs`) and the transcription's folios. Each test
 * below runs on every one of them:
 *
 *   - the invariants that keep stored data and images together, and
 *   - a golden file (fixtures/iiif/alignment-golden.json) recording which scan each
 *     transcribed folio resolves to. A change that moves any page fails here and
 *     shows exactly which; if it is intended, regenerate with
 *       UPDATE_GOLDEN=1 npx vitest run src/test/alignment/corpus.test.js
 *     and review the diff like any other change.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCorpus, corpusPages } from './corpusPages';
import { buildPageMap } from '../../services/alignment/pageMap';
import { planPageKeys } from '../../services/alignment/pageKeys';
import { matchName, canonicalFolio, indexFolios, folioIdentity } from '../../services/alignment/folios';
import { pageKey } from '../../utils/keys';

const goldenPath = fileURLToPath(new URL('../fixtures/iiif/alignment-golden.json', import.meta.url));
const corpus = loadCorpus();
const sources = Object.keys(corpus).sort();

const built = new Map();
function mapOf(source) {
    if (!built.has(source)) {
        const entry = corpus[source];
        const pages = corpusPages(source, entry);
        const dataFolios = entry.dataFolios.filter(Boolean);
        built.set(source, { pages, dataFolios, map: buildPageMap({ pages, dataFolios }) });
    }
    return built.get(source);
}

describe('the corpus fixture', () => {
    it('covers the manuscripts the app links to', () => {
        expect(sources.length).toBeGreaterThanOrEqual(70);
        const withData = sources.filter(s => corpus[s].dataFolios.some(Boolean));
        expect(withData.length).toBeGreaterThanOrEqual(30);
    });
});

describe.each(sources)('%s', source => {
    it('parses into pages', () => {
        const { pages } = mapOf(source);
        const withImage = corpus[source].canvases.filter(c => c[1]).length;
        expect(pages.length).toBeGreaterThanOrEqual(withImage ? 1 : 0);
    });

    it('agrees with itself: the folio a canvas shows resolves back to that canvas', () => {
        const { pages, map } = mapOf(source);
        const broken = [];
        pages.forEach((p, i) => {
            const f = map.folioOf(i);
            if (f && map.canvasFor(f)?.index !== i) broken.push(`#${i} "${p.originalFolio}" -> ${f} -> #${map.canvasFor(f)?.index}`);
        });
        expect(broken).toEqual([]);
    });

    it('shows a folio on the one canvas whose label names it', () => {
        const { pages, map, dataFolios } = mapOf(source);
        const wrong = [];
        for (const f of dataFolios) {
            const key = matchName(f);
            const naming = pages.map((p, i) => i).filter(i => map.entries[i].via === 'label' && matchName(pages[i].folio) === key);
            if (naming.length !== 1) continue;
            const hit = map.canvasFor(f);
            if (hit?.index !== naming[0]) wrong.push(`${f}: label "${pages[naming[0]].originalFolio}" (#${naming[0]}) but shown #${hit?.index}`);
        }
        expect(wrong).toEqual([]);
    });

    it('stores each transcribed page under one key — its own folio, whatever the manifest says', () => {
        const { dataFolios } = mapOf(source);
        const index = indexFolios(dataFolios);
        const problems = [];
        for (const f of dataFolios) {
            const stored = canonicalFolio(f, index);
            // the same page, spelled the transcription's way, and the same key from either order
            if (folioIdentity(stored) !== folioIdentity(f)) problems.push(`${f} -> ${stored}`);
            if (canonicalFolio(f, indexFolios([...dataFolios].reverse())) !== stored) problems.push(`${f}: depends on order`);
        }
        expect(problems).toEqual([]);
    });

    it('moves a key an older version wrote with a canvas label onto exactly the folio that canvas shows', () => {
        const { pages, map, dataFolios } = mapOf(source);
        const wrong = [];
        pages.forEach((p, i) => {
            const folio = map.folioOf(i);
            if (!folio || !p.folio || p.folio.includes('_')) return;
            // only labels that name this canvas alone can be read back
            const sameLabel = pages.filter(q => q.folio === p.folio).length;
            if (sameLabel > 1) return;
            // A label that is also a folio of the transcription ("208" is the scan of 104v
            // in Pia 65 and the folio f.208) is read as the folio: the safe reading.
            if (dataFolios.some(f => folioIdentity(f) === folioIdentity(p.folio))) return;
            const key = pageKey(source, p.folio);
            const { moves } = planPageKeys({ source, keys: [key], dataFolios, pageMap: map });
            const to = moves.length ? moves[0].to : key;
            const expected = pageKey(source, folio);
            if (to !== expected && !(to === key && p.folio === folio)) wrong.push(`"${p.folio}" -> ${to}, expected ${expected}`);
            // and planning again changes nothing
            const again = planPageKeys({ source, keys: [to], dataFolios, pageMap: map });
            if (again.moves.length) wrong.push(`"${p.folio}" moves again: ${JSON.stringify(again.moves)}`);
        });
        expect(wrong.slice(0, 10)).toEqual([]);
    });
});

describe('the golden alignment', () => {
    const current = {};
    for (const source of sources) {
        const { pages, map, dataFolios } = mapOf(source);
        if (!dataFolios.length) continue;
        current[source] = {};
        for (const f of [...dataFolios].sort()) {
            const hit = map.canvasFor(f);
            current[source][f] = hit ? `#${hit.index} ${pages[hit.index].originalFolio} (${hit.via})` : null;
        }
    }

    if (process.env.UPDATE_GOLDEN || !existsSync(goldenPath)) {
        const body = Object.keys(current).sort().map(s => `  ${JSON.stringify(s)}: ${JSON.stringify(current[s])}`).join(',\n');
        writeFileSync(goldenPath, `{\n${body}\n}\n`);
    }
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));

    it.each(Object.keys(current).sort())('%s shows the same scans as recorded', source => {
        const moved = Object.keys(current[source])
            .filter(f => current[source][f] !== golden[source]?.[f])
            .map(f => `${f}: was ${golden[source]?.[f] ?? '—'}, now ${current[source][f] ?? '—'}`);
        expect(moved).toEqual([]);
    });
});

describe('the alignments shipped in index.json', () => {
    const shipped = JSON.parse(readFileSync(fileURLToPath(new URL('../../../public/index.json', import.meta.url)), 'utf8')).alignments || {};

    it.each(Object.keys(shipped))('%s: every pin names a scan of its manifest and the folio is shown there', source => {
        expect(corpus[source], `${source} has no manifest fixture`).toBeTruthy();
        const { pages, dataFolios } = mapOf(source);
        const map = buildPageMap({ pages, dataFolios, alignment: shipped[source] });
        for (const [canvas, folio] of Object.entries(shipped[source].pins)) {
            expect(Number(canvas) < pages.length, `scan ${canvas} exists`).toBe(true);
            expect(map.canvasFor(folio)?.index, `${folio}`).toBe(Number(canvas));
        }
    });
});
