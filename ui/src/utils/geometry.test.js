import { describe, it, expect } from 'vitest';
import {
    parsePoints, formatPoints, pointsToRect, rectToPolygon,
    pointsCenter, polygonArea, pointInPolygon
} from './geometry';

describe('parsePoints', () => {
    it('parses a points string', () => {
        expect(parsePoints('1,2 3.5,4')).toEqual([[1, 2], [3.5, 4]]);
    });

    it('tolerates stray whitespace and drops malformed tokens', () => {
        expect(parsePoints('  1,2   bad  3,x  4,5 ')).toEqual([[1, 2], [4, 5]]);
    });

    it('returns [] for empty input', () => {
        expect(parsePoints('')).toEqual([]);
        expect(parsePoints(null)).toEqual([]);
        expect(parsePoints(undefined)).toEqual([]);
    });

    it('round-trips through formatPoints', () => {
        expect(formatPoints(parsePoints('1,2 3,4'))).toBe('1,2 3,4');
    });
});

describe('pointsToRect / pointsCenter', () => {
    it('measures the bounding rectangle', () => {
        expect(pointsToRect('10,20 30,20 30,40 10,40')).toEqual({ x: 10, y: 20, w: 20, h: 20 });
        expect(pointsCenter('10,20 30,20 30,40 10,40')).toEqual({ x: 20, y: 30 });
    });

    it('is a zero rectangle for no usable points', () => {
        expect(pointsToRect('')).toEqual({ x: 0, y: 0, w: 0, h: 0 });
        expect(pointsCenter('')).toBeNull();
    });
});

describe('rectToPolygon', () => {
    it('writes four corners and clamps to the page', () => {
        expect(rectToPolygon({ x: -5, y: 10, w: 120, h: 5 })).toBe('0.00,10.00 100.00,10.00 100.00,15.00 0.00,15.00');
    });

    it('has a degenerate fallback for a missing rect', () => {
        expect(rectToPolygon(null)).toBe('0,0 0,0 0,0 0,0');
    });
});

describe('pointInPolygon / polygonArea', () => {
    const square = parsePoints('0,0 10,0 10,10 0,10');
    const triangle = parsePoints('0,0 10,0 0,10');

    it('tells inside from outside', () => {
        expect(pointInPolygon(5, 5, square)).toBe(true);
        expect(pointInPolygon(15, 5, square)).toBe(false);
        expect(pointInPolygon(2, 2, triangle)).toBe(true);
        expect(pointInPolygon(8, 8, triangle)).toBe(false);
    });

    it('falls back to the bounding box for shapes with no interior', () => {
        expect(pointInPolygon(5, 0, parsePoints('0,0 10,0'))).toBe(true);
        expect(pointInPolygon(5, 1, parsePoints('0,0 10,0'))).toBe(false);
        expect(pointInPolygon(0, 0, [])).toBe(false);
    });

    it('measures area independent of winding direction', () => {
        expect(polygonArea(square)).toBe(100);
        expect(polygonArea([...square].reverse())).toBe(100);
        expect(polygonArea(triangle)).toBe(50);
    });
});
