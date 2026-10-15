import { describe, it, expect } from 'vitest';
import { buildPageMap } from './pageMap';
import { parseManifest } from '../iiif/manifestParser';

/** Pages as the manifest parser makes them, from plain labels (optionally with a label rule). */
function pagesOf(labels, labelRule = null) {
    const manifest = {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        sequences: [{ canvases: labels.map((label, i) => ({ label, images: [{ resource: { service: { '@id': `s${i}` } } }] })) }]
    };
    return parseManifest(manifest, { labelRule });
}

const labelOf = (map, folio) => map.canvasFor(folio)?.page.originalFolio ?? null;

/** Every canvas that names a folio is the canvas that folio resolves to. */
function expectConsistent(map) {
    map.pages.forEach((p, i) => {
        const f = map.folioOf(i);
        if (f) expect(map.canvasFor(f)?.index, `canvas ${i} "${p.originalFolio}" -> ${f}`).toBe(i);
    });
}

describe('buildPageMap: finding the canvas of a folio', () => {
    it('follows labels that name the page ("fol. 18v")', () => {
        const map = buildPageMap({ pages: pagesOf(['Upper board', 'fol. 1r', 'fol. 1v', 'fol. 2r']), dataFolios: ['1v'] });
        expect(labelOf(map, '1v')).toBe('fol. 1v');
        expect(map.canvasFor('1v').via).toBe('label');
        expect(map.folioOf(2)).toBe('1v');
        expect(map.folioOf(0)).toBe(null); // the binding is not a page
        expectConsistent(map);
    });

    it('never takes a scan counter for a folio: "(0044)" is not 44r', () => {
        const labels = Array.from({ length: 120 }, (_, i) => `(${String(i + 1).padStart(4, '0')})`);
        const map = buildPageMap({ pages: pagesOf(labels), dataFolios: ['44r', '44v', '1r'] });
        // two scans per leaf, counting from the first scan
        expect(labelOf(map, '44r')).toBe('(0087)');
        expect(map.canvasFor('44r').via).toBe('position');
        expect(map.folioOf(43)).not.toBe('44r');
        expectConsistent(map);
    });

    it('prefers the label that is exactly the number over a flyleaf with the same number', () => {
        const labels = ['Front cover', 'V1', 'V2', 'V10', '1', '2', '10', '11'];
        const map = buildPageMap({ pages: pagesOf(labels), dataFolios: ['1r', '2r', '10r', '11r', '12r', '13r'] });
        expect(map.dataType).toBe('paginated');
        expect(labelOf(map, '10r')).toBe('10');
        expect(labelOf(map, '1r')).toBe('1');
        expectConsistent(map);
    });

    it('applies the source\'s label rule (one image showing two folios)', () => {
        const spreads = label => {
            const m = String(label).match(/(\d+)v-(\d+)r/);
            return m ? [`${Number(m[1]) - 1}v`, `${m[2]}r`] : label;
        };
        const map = buildPageMap({ pages: pagesOf(['121v-121r', '122v-122r', '123v-123r'], spreads), dataFolios: ['121v', '122r'] });
        // "122v-122r" really shows 121v and 122r
        expect(labelOf(map, '121v')).toBe('122v-122r');
        expect(labelOf(map, '122r')).toBe('122v-122r');
        expectConsistent(map);
    });

    it('lets a pin override what the label says', () => {
        const pages = pagesOf(['1r', '1v', '2r', '2v', '3r']);
        const map = buildPageMap({ pages, dataFolios: ['1r', '2r'], alignment: { pins: { 3: '2r' } } });
        expect(map.canvasFor('2r')).toMatchObject({ index: 3, via: 'pinned' });
        expect(map.folioOf(3)).toBe('2r');
        expect(map.folioOf(2)).not.toBe('2r'); // the canvas labelled 2r no longer claims it
        expectConsistent(map);
    });

    it('takes a canvas pinned as "not a page" out of the count', () => {
        const pages = pagesOf(['(0001)', '(0002)', 'ruler', '(0003)']);
        const map = buildPageMap({ pages, dataFolios: ['1r', '1v'], alignment: { pins: { 1: '' } } });
        expect(map.folioOf(1)).toBe(null);
        expect(labelOf(map, '1v')).not.toBe('(0002)');
        expectConsistent(map);
    });

    it('keeps honouring the older offset rules', () => {
        const labels = Array.from({ length: 30 }, (_, i) => String(i + 1)); // a paginated manifest
        const map = buildPageMap({
            pages: pagesOf(labels),
            dataFolios: ['1r', '1v', '2r'],
            alignment: { dataType: 'foliated', iiifType: 'paginated', offset: 4 }
        });
        // 1r is index 1, +4 -> page "5"
        expect(map.canvasFor('1r')).toMatchObject({ via: 'offset' });
        expect(labelOf(map, '1r')).toBe('5');
        expect(map.folioOf(4)).toBe('1r');
        expectConsistent(map);
    });

    it('returns nothing when there is nothing to find', () => {
        const empty = buildPageMap({ pages: [], dataFolios: ['1r'] });
        expect(empty.canvasFor('1r')).toBe(null);
        expect(empty.folioOf(0)).toBe(null);
        const np = buildPageMap({ pages: pagesOf(['NP', 'NP', 'NP']), dataFolios: ['145v'] });
        expect(np.canvasFor('145v')).toBe(null); // Gallica's "non paginé": no page names at all
    });
});

describe('buildPageMap: reading older keys written with a canvas label', () => {
    const map = buildPageMap({
        pages: pagesOf(['Upper board', 'fol. 18r', 'fol. 18v', 'page de garde recto', '(0005)', '(0006)']),
        dataFolios: ['18v']
    });

    it('knows the folio a label stands for', () => {
        expect(map.folioForLabel('fol. 18v')).toBe('18v');
        expect(map.folioForLabel('fol. 18r')).toBe('18r');
    });

    it('also reads the spelling an older version made of "page de garde recto"', () => {
        expect(map.folioForLabel('age de garde recto')).toBe(map.folioOf(3));
    });

    it('says nothing for a label it does not have, or one that is not a page', () => {
        expect(map.folioForLabel('fol. 99r')).toBe(null);
        expect(map.folioForLabel('Upper board')).toBe(null);
        expect(map.folioForLabel('')).toBe(null);
    });
});
