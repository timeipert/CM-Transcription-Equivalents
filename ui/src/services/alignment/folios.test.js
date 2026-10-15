import { describe, it, expect } from 'vitest';
import { tidyFolio, folioIdentity, matchName, canonicalFolio, indexFolios, guessDataType } from './folios';

describe('tidyFolio / folioIdentity', () => {
    it('reduces the spellings of one page to one name', () => {
        for (const s of ['18v', 'fol. 18v', 'Fol.18v', 'f. 18 v', '018v', '(18v)', '18verso']) {
            expect(folioIdentity(s)).toBe('18v');
        }
    });

    it('keeps the transcription\'s case when tidying', () => {
        expect(tidyFolio('A1r')).toBe('A1r');
        expect(tidyFolio('fol. 18v')).toBe('18v');
        expect(folioIdentity('A1r')).toBe('a1r');
    });

    it('never merges different pages', () => {
        expect(folioIdentity('22')).not.toBe(folioIdentity('22r'));
        expect(folioIdentity('22')).not.toBe(folioIdentity('22b'));
        expect(folioIdentity('117bv')).not.toBe(folioIdentity('117v'));
        expect(folioIdentity('f.116')).not.toBe(folioIdentity('116r'));
    });
});

describe('matchName (finding a canvas, not identity)', () => {
    it('is forgiving where manifests and transcriptions disagree', () => {
        expect(matchName('12')).toBe('12r');
        expect(matchName('22b')).toBe('22r');
        expect(matchName('p. 10v')).toBe('10v');
        expect(matchName('10 recto')).toBe('10r');
    });
});

describe('canonicalFolio', () => {
    const data = ['18v', '117bv', 'A1r', 'f.116'];

    it('uses the transcription\'s own spelling of the page', () => {
        expect(canonicalFolio('fol. 18v', data)).toBe('18v');
        expect(canonicalFolio('018V', data)).toBe('18v');
        expect(canonicalFolio('a1r', data)).toBe('A1r');
        expect(canonicalFolio('F.116', data)).toBe('f.116');
    });

    it('tidies a folio the transcription does not have, and never consults a manifest', () => {
        expect(canonicalFolio('fol. 19r', data)).toBe('19r');
        expect(canonicalFolio('19r', [])).toBe('19r');
    });

    it('accepts a prepared index', () => {
        expect(canonicalFolio('fol. 18v', indexFolios(data))).toBe('18v');
    });
});

describe('guessDataType', () => {
    it('reads recto/verso folios as foliated', () => {
        expect(guessDataType(['1r', '1v', '2r'])).toBe('foliated');
    });

    it('reads bare numbers as paginated', () => {
        expect(guessDataType(['1', '2', '3'])).toBe('paginated');
    });

    it('reads a long run of "r" only as pagination written with the preprocessing\'s suffix', () => {
        expect(guessDataType(['271r', '272r', '273r', '274r', '275r', '276r'])).toBe('paginated');
        // a few rectos alone are not enough evidence
        expect(guessDataType(['14r', '149r', '162r'])).toBe('foliated');
    });
});
