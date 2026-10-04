import { describe, it, expect } from 'vitest';
import {
    pageKey, annotationKey, parsePageKey, parseAnnotationKey,
    isPageKeyOf, isAnnotationKeyOf, renamePageKeySource, renameAnnotationKeySource
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
