import { describe, it, expect } from 'vitest';
import { parseFolioLabel, isDividerLabel, detectScheme, inferAlignment, applyOffsetAlignment } from './folioAlignment';

describe('parseFolioLabel', () => {
    it('reads an explicit folio marker', () => {
        expect(parseFolioLabel('f. 13')).toMatchObject({ num: 13, side: null, markerKind: 'folio', confident: true });
        expect(parseFolioLabel('fol. 7v')).toMatchObject({ num: 7, side: 'v', markerKind: 'folio', confident: true });
    });

    it('reads a fused recto/verso folio', () => {
        expect(parseFolioLabel('12v')).toMatchObject({ num: 12, side: 'v', markerKind: 'fused', confident: true });
        expect(parseFolioLabel('7R')).toMatchObject({ num: 7, side: 'r', markerKind: 'fused', confident: true });
    });

    it('reads an explicit page/scan marker separately from a folio marker', () => {
        expect(parseFolioLabel('Seite (0005)')).toMatchObject({ num: 5, markerKind: 'page', padded: true, confident: true });
        expect(parseFolioLabel('page 24')).toMatchObject({ num: 24, markerKind: 'page', confident: true });
    });

    it('strips brackets and leading zeros from a sequence label', () => {
        expect(parseFolioLabel('(0001)')).toMatchObject({ num: 1, markerKind: 'plain', padded: true, confident: true });
    });

    it('drops an arbitrary filename prefix and takes the running number', () => {
        expect(parseFolioLabel('phys_Chorbuch_00001')).toMatchObject({ num: 1, markerKind: 'plain', padded: true });
        expect(parseFolioLabel('phys_Chorbu_0025')).toMatchObject({ num: 25, markerKind: 'plain' });
    });

    it('reads the folio from a marker and ignores a sub-image counter', () => {
        expect(parseFolioLabel('f. 011v – vue 3')).toMatchObject({ num: 11, side: 'v', markerKind: 'folio', confident: true });
    });

    it('prefers the folio marker over a shelfmark number', () => {
        expect(parseFolioLabel('clm 14322, f. 7v')).toMatchObject({ num: 7, side: 'v', markerKind: 'folio', confident: true });
    });

    it('returns no number for a pure structural marker', () => {
        for (const label of ['gedr. Bd. CM', 'Handschrift *', 'CM Transcription Equivalents', 'Fehlende Zeilen']) {
            expect(parseFolioLabel(label)).toMatchObject({ num: null, markerKind: null, confident: false });
        }
    });
});

describe('isDividerLabel', () => {
    it('flags labels with no digits as dividers', () => {
        expect(isDividerLabel('Handschrift *')).toBe(true);
        expect(isDividerLabel('Fehlende Zeilen')).toBe(true);
    });

    it('does not flag a labelled or noisy page as a divider', () => {
        expect(isDividerLabel('f. 13')).toBe(false);
        expect(isDividerLabel('phys_Chorbuch_00001')).toBe(false);
    });
});

describe('detectScheme', () => {
    it('recognizes foliated manifests', () => {
        expect(detectScheme(['1r', '1v', '2r', '2v']).scheme).toBe('foliated');
    });

    it('recognizes zero-padded sequential index manifests', () => {
        expect(detectScheme(['0001', '0002', '0003', '0004']).scheme).toBe('index');
    });

    it('recognizes pagination', () => {
        expect(detectScheme(['12', '15', '18', '21']).scheme).toBe('paginated');
    });
});

describe('inferAlignment — the default: count up automatically, forever', () => {
    it('matches clean foliated labels by identity', () => {
        const res = inferAlignment({ canvasLabels: ['1r', '1v', '2r'], dataType: 'foliated' });
        expect(res.entries.map(e => e.resolvedFolio)).toEqual(['1r', '1v', '2r']);
        expect(res.entries.every(e => e.via === 'label')).toBe(true);
    });

    it('counts a padded scan sequence onto foliated data with zero configuration', () => {
        const res = inferAlignment({ canvasLabels: ['0001', '0002', '0003', '0004'], dataType: 'foliated' });
        expect(res.entries.map(e => e.resolvedFolio)).toEqual(['1r', '1v', '2r', '2v']);
        expect(res.entries.every(e => e.via === 'position')).toBe(true);
    });

    it('counts a noisy filename sequence onto foliated data, dropping the prefix', () => {
        const res = inferAlignment({
            canvasLabels: ['phys_Chorbuch_00001', 'phys_Chorbuch_00002', 'phys_Chorbuch_00003', 'phys_Chorbuch_00004'],
            dataType: 'foliated'
        });
        expect(res.entries.map(e => e.resolvedFolio)).toEqual(['1r', '1v', '2r', '2v']);
        expect(res.entries.every(e => e.via === 'position')).toBe(true);
    });

    it('does not require every page to carry a folio marker — a mix of labelled and unlabelled pages still counts through', () => {
        const res = inferAlignment({ canvasLabels: ['f. 1r', 'phys_0002', 'phys_0003', 'f. 2v'], dataType: 'foliated' });
        expect(res.entries.map(e => e.resolvedFolio)).toEqual(['1r', '1v', '2r', '2v']);
        expect(res.entries.map(e => e.via)).toEqual(['label', 'position', 'position', 'label']);
    });

    it('keeps counting for as many pages as the manifest has — not just as far as any known data reaches', () => {
        // The real-world case this guards: a manuscript transcribed only in a
        // couple of small, non-contiguous clusters of folios must not make the
        // engine stop resolving once it runs past however many folios happen to
        // have transcription rows — most of a manifest's pages have none.
        const labels = Array.from({ length: 40 }, (_, i) => `phys_Chorbuch_${String(i + 1).padStart(4, '0')}`);
        const res = inferAlignment({ canvasLabels: labels, dataType: 'foliated' });
        expect(res.entries.every(e => e.resolvedFolio !== null)).toBe(true);
        expect(res.entries[0].resolvedFolio).toBe('1r');
        expect(res.entries[39].resolvedFolio).toBe('20v');
        expect(res.matched).toBe(40);
    });
});

describe('inferAlignment — structural dividers are skipped, not miscounted', () => {
    it('does not let a divider consume a folio position', () => {
        const res = inferAlignment({
            canvasLabels: ['Handschrift *', 'f. 1r', 'f. 1v', 'Fehlende Zeilen', 'f. 2r', 'f. 2v'],
            dataType: 'foliated'
        });
        const byLabel = Object.fromEntries(res.entries.map(e => [e.originalLabel, e.resolvedFolio]));
        expect(byLabel['Handschrift *']).toBeNull();
        expect(byLabel['Fehlende Zeilen']).toBeNull();
        expect(byLabel['f. 1r']).toBe('1r');
        expect(byLabel['f. 2v']).toBe('2v');
        expect(res.dividerCount).toBe(2);
        expect(res.entries.filter(e => e.isDivider).every(e => e.via === 'divider')).toBe(true);
    });

    it('resyncs the count correctly after a divider even without a marker right after it', () => {
        const res = inferAlignment({
            canvasLabels: ['f. 1r', 'divider text with no digits', 'phys_0002', 'phys_0003'],
            dataType: 'foliated'
        });
        expect(res.entries.map(e => e.resolvedFolio)).toEqual(['1r', null, '1v', '2r']);
    });
});

describe('inferAlignment — drifted fronts self-correct at the first real label', () => {
    it('lets an unrelated leading run get miscounted, but never corrupts the real section once a label resyncs it', () => {
        const res = inferAlignment({ canvasLabels: ['1', '2', '3', 'f. 1r', 'f. 1v', 'f. 2r'], dataType: 'foliated' });
        const byLabel = Object.fromEntries(res.entries.map(e => [e.originalLabel, e.resolvedFolio]));
        expect(byLabel['f. 1r']).toBe('1r');
        expect(byLabel['f. 1v']).toBe('1v');
        expect(byLabel['f. 2r']).toBe('2r');
    });
});

describe('inferAlignment — pins', () => {
    it('lets one pin fix an offset for every page after it, indefinitely', () => {
        const res = inferAlignment({
            canvasLabels: ['scan_1', 'scan_2', 'scan_3', 'scan_4'],
            dataType: 'foliated',
            pins: { 0: '10v' }
        });
        expect(res.entries.map(e => e.resolvedFolio)).toEqual(['10v', '11r', '11v', '12r']);
        expect(res.entries[0].via).toBe('pinned');
    });

    it('lets a pin correct a wrongly auto-resolved page mid-sequence and resync the rest', () => {
        const res = inferAlignment({
            canvasLabels: ['phys_0001', 'phys_0002', 'phys_0003', 'phys_0004'],
            dataType: 'foliated',
            pins: { 1: '2r' } // canvas 1 is actually folio 2r, not 1v as auto-count would guess
        });
        expect(res.entries.map(e => e.resolvedFolio)).toEqual(['1r', '2r', '2v', '3r']);
    });

    it('an empty-string pin forces a stray page out of the count like a divider', () => {
        const res = inferAlignment({
            canvasLabels: ['phys_0001', 'ColorChart_9', 'phys_0002', 'phys_0003'],
            dataType: 'foliated',
            pins: { 1: '' }
        });
        expect(res.entries.map(e => e.resolvedFolio)).toEqual(['1r', null, '1v', '2r']);
        expect(res.entries[1]).toMatchObject({ via: 'skipped', isDivider: true });
    });
});

describe('inferAlignment — ambiguous "Seite" scan numbering', () => {
    it('does not treat a page/scan marker as folio identity for foliated data, but still counts it', () => {
        const res = inferAlignment({
            canvasLabels: ['Seite (0001)', 'Seite (0002)', 'Seite (0003)', 'Seite (0004)'],
            dataType: 'foliated'
        });
        expect(res.entries.map(e => e.resolvedFolio)).toEqual(['1r', '1v', '2r', '2v']);
        expect(res.entries.every(e => e.via === 'position')).toBe(true);
    });

    it('trusts an explicit page marker directly for paginated data', () => {
        const res = inferAlignment({ canvasLabels: ['Seite 12', 'Seite 13', 'Seite 14'], dataType: 'paginated' });
        expect(res.entries.map(e => e.resolvedFolio)).toEqual(['12', '13', '14']);
        expect(res.entries.every(e => e.via === 'label')).toBe(true);
    });
});

describe('applyOffsetAlignment', () => {
    it('applies a base offset and a jump rule', () => {
        const label = applyOffsetAlignment('170r', {
            dataType: 'foliated',
            iiifType: 'paginated',
            offset: 0,
            adjustments: [{ fromFolio: '170r', adjust: 2 }]
        });
        expect(label).toBe('341');
    });

    it('returns null without a config', () => {
        expect(applyOffsetAlignment('1r', null)).toBeNull();
    });
});
