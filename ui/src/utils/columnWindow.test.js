import { describe, it, expect } from 'vitest';
import { MIN_COLUMN_WIDTH, estimateColumnWidth, buildColumnLayout, visibleColumnRange } from './columnWindow';

describe('estimateColumnWidth', () => {
    it('never goes below the minimum', () => {
        expect(estimateColumnWidth('*')).toBe(MIN_COLUMN_WIDTH);
    });

    it('adds room for the expand arrow of a group header', () => {
        expect(estimateColumnWidth('*uudd', true)).toBeGreaterThan(estimateColumnWidth('*uudd'));
    });

    it('grows with the length of the pattern code', () => {
        expect(estimateColumnWidth('[*udud]eOdd')).toBeGreaterThan(estimateColumnWidth('*dd'));
    });
});

describe('buildColumnLayout', () => {
    it('returns prefix sums and the total', () => {
        const { offsets, total } = buildColumnLayout([10, 20, 30]);
        expect(offsets).toEqual([0, 10, 30, 60]);
        expect(total).toBe(60);
    });

    it('handles no columns', () => {
        expect(buildColumnLayout([])).toEqual({ offsets: [0], total: 0 });
    });
});

describe('visibleColumnRange', () => {
    // 100 columns of 100 px each: column i spans [100 i, 100 i + 100).
    const { offsets } = buildColumnLayout(new Array(100).fill(100));

    it('starts at column 0 when not scrolled', () => {
        expect(visibleColumnRange(offsets, 0, 500, 0)).toEqual({ start: 0, end: 5 });
    });

    it('selects the columns overlapping the viewport', () => {
        // viewport [250, 750): columns 2 (200-300) .. 7 (700-800)
        expect(visibleColumnRange(offsets, 250, 500, 0)).toEqual({ start: 2, end: 8 });
    });

    it('adds the overscan on both sides', () => {
        expect(visibleColumnRange(offsets, 5000, 500, 200)).toEqual({ start: 48, end: 57 });
    });

    it('clamps at the end of the table', () => {
        const range = visibleColumnRange(offsets, 9900, 500, 600);
        expect(range.end).toBe(100);
        expect(range.start).toBeLessThan(100);
    });

    it('returns an empty range for no columns', () => {
        expect(visibleColumnRange([0], 0, 500)).toEqual({ start: 0, end: 0 });
    });

    it('works for uneven widths', () => {
        const { offsets: o } = buildColumnLayout([50, 300, 50, 50]);
        // viewport [60, 100) lies inside the second column only
        expect(visibleColumnRange(o, 60, 40, 0)).toEqual({ start: 1, end: 2 });
    });
});
