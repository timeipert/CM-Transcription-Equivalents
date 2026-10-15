import { describe, it, expect } from 'vitest';
import { planPageKeys, linkedFolios } from './pageKeys';
import { buildPageMap } from './pageMap';
import { parseManifest } from '../iiif/manifestParser';

function pagesOf(labels) {
    return parseManifest({
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        sequences: [{ canvases: labels.map((label, i) => ({ label, images: [{ resource: { service: { '@id': `s${i}` } } }] })) }]
    });
}

const bodleian = pagesOf(['Upper board', 'Inside upper board', 'fol. 18r', 'fol. 18v', 'fol. 19r', 'fol. 19v']);
const munich = pagesOf(Array.from({ length: 400 }, (_, i) => `(${String(i + 1).padStart(4, '0')})`));

describe('planPageKeys', () => {
    it('moves a key written with the canvas label onto the folio, remembering the scan', () => {
        const pageMap = buildPageMap({ pages: bodleian, dataFolios: ['18v', '19v'] });
        const plan = planPageKeys({ source: 'Ox 340', keys: ['Ox 340_fol. 18v', 'Ox 340_19v'], dataFolios: ['18v', '19v'], pageMap });
        expect(plan.moves).toEqual([{ from: 'Ox 340_fol. 18v', to: 'Ox 340_18v', why: 'label', canvas: { index: 3, label: 'fol. 18v' } }]);
        expect(plan.kept).toEqual([]);
    });

    it('leaves keys that already are folios of the transcription alone', () => {
        const pageMap = buildPageMap({ pages: bodleian, dataFolios: ['18v'] });
        expect(planPageKeys({ source: 'Ox 340', keys: ['Ox 340_18v', 'Ox 340_19r'], dataFolios: ['18v'], pageMap }).moves).toEqual([]);
    });

    it('reads a scan counter through the page map: "(0339)" is the scan of 170r', () => {
        const pageMap = buildPageMap({ pages: munich, dataFolios: ['170r', '170v'] });
        const plan = planPageKeys({ source: 'Mü 4101', keys: ['Mü 4101_(0339)'], dataFolios: ['170r', '170v'], pageMap });
        expect(plan.moves).toEqual([{ from: 'Mü 4101_(0339)', to: 'Mü 4101_170r', why: 'canvas-label', canvas: { index: 338, label: '(0339)' } }]);
    });

    it('leaves a key alone when its snippets\' transcription links disagree with the label', () => {
        // An older version showed scan 170 for 170r; lines drawn there are linked to 170r.
        const pageMap = buildPageMap({ pages: munich, dataFolios: ['170r'] });
        const plan = planPageKeys({
            source: 'Mü 4101', keys: ['Mü 4101_(0170)'], dataFolios: ['170r'], pageMap,
            evidence: () => ['170r', '170r']
        });
        expect(plan.moves).toEqual([]);
        expect(plan.kept).toHaveLength(1);
        expect(plan.kept[0].why).toMatch(/linked to 170r/);
    });

    it('uses the links to recognise a label that looks like a folio (an offset manuscript)', () => {
        // Gallica-style labels; a pin says the canvas labelled "19r" really shows 18v.
        // An older version showed that canvas for 18v and keyed its lines "19r".
        const pages = pagesOf(['18r', '18v', '19r', '19v']);
        const alignment = { pins: { 2: '18v' } };
        const pageMap = buildPageMap({ pages, dataFolios: ['18v', '19r'], alignment });
        const withLinks = planPageKeys({
            source: 'Pa 1', keys: ['Pa 1_19r'], dataFolios: ['18v', '19r'], pageMap, alignment, evidence: () => ['18v']
        });
        expect(withLinks.moves).toMatchObject([{ from: 'Pa 1_19r', to: 'Pa 1_18v', why: 'canvas-label', canvas: { index: 2, label: '19r' } }]);
        // without evidence "19r" stays a folio of the transcription: nothing moves on a guess
        const noLinks = planPageKeys({ source: 'Pa 1', keys: ['Pa 1_19r'], dataFolios: ['18v', '19r'], pageMap, alignment });
        expect(noLinks.moves).toEqual([]);
    });

    it('waits for the manifest when there is one but it is not loaded', () => {
        const plan = planPageKeys({ source: 'Ox 340', keys: ['Ox 340_fol. 18v'], dataFolios: ['18v'], pageMap: null, hasManifestLink: true });
        expect(plan).toEqual({ moves: [], kept: [] });
    });

    it('without any manifest only adopts the transcription\'s spelling — and never renames a person\'s page names', () => {
        const plan = planPageKeys({
            source: 'Pa 1107', keys: ['Pa 1107_0145v', 'Pa 1107_Front cover', 'Pa 1107_Guard A', 'Pa 1107_146r'],
            dataFolios: ['145v'], pageMap: null
        });
        expect(plan.moves).toEqual([{ from: 'Pa 1107_0145v', to: 'Pa 1107_145v', why: 'spelling' }]);
        expect(plan.kept).toEqual([]);
    });

    it('reports only keys that look like scan labels, not pages without transcription', () => {
        const pageMap = buildPageMap({ pages: bodleian, dataFolios: ['18v'] });
        const plan = planPageKeys({ source: 'Ox 340', keys: ['Ox 340_42r', 'Ox 340_scan 0042', 'Ox 340_Unassigned'], dataFolios: ['18v'], pageMap });
        expect(plan.moves).toEqual([]);
        expect(plan.kept.map(k => k.key)).toEqual(['Ox 340_scan 0042']);
    });

    it('ignores keys of other sources', () => {
        const pageMap = buildPageMap({ pages: bodleian, dataFolios: [] });
        expect(planPageKeys({ source: 'Ox 340', keys: ['Ox 3401_fol. 18v'], pageMap }).moves).toEqual([]);
    });
});

describe('linkedFolios', () => {
    it('reads the folio out of each snippet\'s transcription link', () => {
        expect(linkedFolios([
            { linkData: { sysId: 'Ox 340-18-14|18v|2|to-|G4-F4' } },
            { linkData: {} },
            { pattern: '*' }
        ])).toEqual(['18v']);
    });
});
