import { describe, it, expect } from 'vitest';
import {
    pageKey, annotationKey, parsePageKey, parseAnnotationKey,
    isPageKeyOf, isAnnotationKeyOf, renamePageKeySource, renameAnnotationKeySource, folioIdentity
} from './keys';

describe('composite keys', () => {
    it('round-trips plain sources', () => {
        expect(parsePageKey(pageKey('Pa 1107', '145v'))).toEqual({ source: 'Pa 1107', folio: '145v' });
        expect(parseAnnotationKey(annotationKey('Pa 1107', '145v', '[*u]dd')))
            .toEqual({ source: 'Pa 1107', folio: '145v', pattern: '[*u]dd' });
    });

    it('keeps an underscore inside the source siglum', () => {
        expect(parsePageKey('WiSch 4_5_12r')).toEqual({ source: 'WiSch 4_5', folio: '12r' });
        expect(parseAnnotationKey('WiSch 4_5_12r_*dd'))
            .toEqual({ source: 'WiSch 4_5', folio: '12r', pattern: '*dd' });
    });

    it('does not let a source claim the keys of a longer-named source', () => {
        expect(isPageKeyOf('WiSch 4_5_12r', 'WiSch 4')).toBe(false);
        expect(isPageKeyOf('WiSch 4_5_12r', 'WiSch 4_5')).toBe(true);
        expect(isAnnotationKeyOf('WiSch 4_5_12r_*', 'WiSch 4')).toBe(false);
        expect(isAnnotationKeyOf('WiSch 4_5_12r_*', 'WiSch 4_5')).toBe(true);
    });

    it('rejects malformed keys', () => {
        expect(parsePageKey('nounderscore')).toBeNull();
        expect(parseAnnotationKey('Src_12r')).toBeNull();
    });

    it('renames only the source part', () => {
        expect(renamePageKeySource('WiSch 4_5_12r', 'WiSch 4_5 (copy)')).toBe('WiSch 4_5 (copy)_12r');
        expect(renameAnnotationKeySource('A_1r_*', 'A (copy)')).toBe('A (copy)_1r_*');
    });
});

describe('folioIdentity', () => {
    it('treats the spellings of one page as one', () => {
        for (const spelling of ['18v', 'fol. 18v', 'Fol.18v', 'f. 18 v', '018v', '(18v)', '18verso']) {
            expect(folioIdentity(spelling)).toBe('18v');
        }
        expect(folioIdentity('p. 24')).toBe('24');
        expect(folioIdentity('0007r')).toBe('7r');
    });

    it('keeps different pages apart', () => {
        expect(folioIdentity('22')).not.toBe(folioIdentity('22b'));
        expect(folioIdentity('22r')).not.toBe(folioIdentity('22v'));
        expect(folioIdentity('117bv')).not.toBe(folioIdentity('117v'));
    });

    it('tolerates empty input', () => {
        expect(folioIdentity(undefined)).toBe('');
        expect(folioIdentity(null)).toBe('');
    });
});
