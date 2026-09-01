import { describe, it, expect } from 'vitest';
import {
    parseDateRange, parseCentury, centuryLabel, yearLabel,
    rangesOverlap, isMetaType
} from './sourceMeta';

const r = (v) => parseDateRange(v);

describe('parseDateRange — centuries', () => {
    it('reads arabic centuries', () => {
        expect(r('11th c.')).toEqual({ start: 1001, end: 1100 });
        expect(r('9th century')).toEqual({ start: 801, end: 900 });
        expect(r('11. Jh.')).toEqual({ start: 1001, end: 1100 });
    });

    it('reads roman centuries with and without a saec. prefix', () => {
        expect(r('s. XI')).toEqual({ start: 1001, end: 1100 });
        expect(r('saec. IX')).toEqual({ start: 801, end: 900 });
        expect(r('XI')).toEqual({ start: 1001, end: 1100 });
    });

    it('spans a dashed century range', () => {
        expect(r('11th-12th c.')).toEqual({ start: 1001, end: 1200 });
        expect(r('s. XI-XII')).toEqual({ start: 1001, end: 1200 });
    });

    it('treats a slashed pair as the turn of the century', () => {
        // Straddles the 1100 boundary rather than covering both centuries whole.
        expect(r('s. XI/XII')).toEqual({ start: 1076, end: 1125 });
    });
});

describe('parseDateRange — qualifiers within a century', () => {
    it('reads beginning / middle / end', () => {
        expect(r('s. XI in.')).toEqual({ start: 1001, end: 1033 });
        expect(r('s. XI med.')).toEqual({ start: 1034, end: 1067 });
        expect(r('s. XI ex.')).toEqual({ start: 1068, end: 1100 });
    });

    it('reads halves and quarters', () => {
        expect(r('11th c., 1st half')).toEqual({ start: 1001, end: 1050 });
        expect(r('s. XI 2/2')).toEqual({ start: 1051, end: 1100 });
        expect(r('11th c. 4/4')).toEqual({ start: 1076, end: 1100 });
    });

    it('understands German qualifiers', () => {
        expect(r('11. Jh., Anfang')).toEqual({ start: 1001, end: 1033 });
        expect(r('11. Jh., 2. Hälfte')).toEqual({ start: 1051, end: 1100 });
    });
});

describe('parseDateRange — years', () => {
    it('reads a single year', () => {
        expect(r('1050')).toEqual({ start: 1050, end: 1050 });
    });

    it('widens a circa year', () => {
        expect(r('c. 1100')).toEqual({ start: 1075, end: 1125 });
        expect(r('ca. 1100')).toEqual({ start: 1075, end: 1125 });
        expect(r('um 1100')).toEqual({ start: 1075, end: 1125 });
    });

    it('reads an explicit year range, including the abbreviated form', () => {
        expect(r('1050-1075')).toEqual({ start: 1050, end: 1075 });
        expect(r('1050–1075')).toEqual({ start: 1050, end: 1075 });
        expect(r('1050/75')).toEqual({ start: 1050, end: 1075 });
    });

    it('reads open-ended datings', () => {
        expect(r('before 1100')).toEqual({ start: -Infinity, end: 1100 });
        expect(r('ante 1100')).toEqual({ start: -Infinity, end: 1100 });
        expect(r('after 1100')).toEqual({ start: 1100, end: Infinity });
        expect(r('post 1100')).toEqual({ start: 1100, end: Infinity });
    });
});

describe('parseDateRange — unreadable input', () => {
    it('returns null rather than guessing', () => {
        expect(r('')).toBe(null);
        expect(r(null)).toBe(null);
        expect(r('undated')).toBe(null);
        expect(r('unknown')).toBe(null);
    });
});

describe('rangesOverlap', () => {
    it('detects overlap, touching and disjoint ranges', () => {
        expect(rangesOverlap({start:1000,end:1200}, {start:1100,end:1300})).toBe(true);
        expect(rangesOverlap({start:1000,end:1100}, {start:1100,end:1200})).toBe(true); // touching
        expect(rangesOverlap({start:1000,end:1099}, {start:1100,end:1200})).toBe(false);
    });

    it('works with open-ended ranges', () => {
        expect(rangesOverlap({start:-Infinity,end:1100}, {start:1000,end:1200})).toBe(true);
        expect(rangesOverlap({start:1200,end:Infinity}, {start:1000,end:1100})).toBe(false);
    });
});

describe('parseCentury / labels', () => {
    it('derives a century from the range start', () => {
        expect(parseCentury('s. XI')).toBe(11);
        expect(parseCentury('1150')).toBe(12);
        expect(parseCentury('undated')).toBe(null);
    });

    it('formats ordinals and years', () => {
        expect(centuryLabel(1)).toBe('1st c.');
        expect(centuryLabel(11)).toBe('11th c.');
        expect(centuryLabel(21)).toBe('21st c.');
        expect(yearLabel(1100)).toBe('1100');
        expect(yearLabel(-Infinity)).toBe('earliest');
        expect(yearLabel(Infinity)).toBe('latest');
    });
});

describe('isMetaType', () => {
    it('accepts known types only', () => {
        expect(isMetaType('text')).toBe(true);
        expect(isMetaType('century')).toBe(true);
        expect(isMetaType('location')).toBe(true);
        expect(isMetaType('nonsense')).toBe(false);
    });
});
