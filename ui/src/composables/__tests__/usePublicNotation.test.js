import { describe, it, expect } from 'vitest';
import {
    getBasePattern,
    buildPatternRefMap,
    buildManuscriptLines,
    pointsBoundingBox
} from '../usePublicNotation';

describe('getBasePattern', () => {
    it('returns first token', () => {
        expect(getBasePattern('ded var')).toBe('ded');
        expect(getBasePattern('ded')).toBe('ded');
        expect(getBasePattern('')).toBe('');
        expect(getBasePattern(null)).toBe('');
    });
});

describe('buildPatternRefMap', () => {
    it('prefers customId, falls back to global id, then dash', () => {
        const table = { rows: [
            { pattern: 'ded', customId: '101a' },
            { pattern: 'ud', customId: '' },
            { pattern: 'e' }
        ] };
        const getGlobalId = (p) => (p === 'ud' ? 'G7' : '');
        const map = buildPatternRefMap(table, getGlobalId);
        expect(map).toEqual({ ded: '101a', ud: 'G7', e: '-' });
    });

    it('handles undefined table', () => {
        expect(buildPatternRefMap(undefined, () => '')).toEqual({});
    });
});

describe('buildManuscriptLines', () => {
    const source = 'Kön D';
    const patternRefMap = { ded: '101a' };

    it('keeps only lines that have polygon points and items', () => {
        // Transcription seeds a line for 219v/1, but only 219v/1 gets a region polygon.
        const rawDataForSource = {
            ded: [
                ['Kön D-219v-1', '219v', '1', 'Ky-', 'G4'],
                ['Kön D-220r-2', '220r', '2', 'ri-', 'A4'] // no region -> filtered out
            ]
        };
        const regions = {
            'Kön D_219v': [{ id: 'r_1', name: '1', points: '10,20 90,20 90,40 10,40' }]
        };
        const regionItems = {};

        const lines = buildManuscriptLines({ source, rawDataForSource, regions, regionItems, patternRefMap });
        expect(lines).toHaveLength(1);
        expect(lines[0].folio).toBe('219v');
        expect(lines[0].lineName).toBe('1');
        expect(lines[0].regionId).toBe('r_1');
        expect(lines[0].points).toBe('10,20 90,20 90,40 10,40');
        // virtual item carried the displayId from the ref map
        expect(lines[0].items[0].displayId).toBe('101a');
    });

    it('real region items override virtual items on the same line', () => {
        const rawDataForSource = {
            ded: [['Kön D-219v-1', '219v', '1', 'Ky-', 'G4']]
        };
        const regions = {
            'Kön D_219v': [{ id: 'r_1', name: '1', points: '10,20 90,20 90,40 10,40' }]
        };
        const regionItems = {
            r_1: [{ id: 'item_1', pattern: 'ded', points: '20,25 30,25 30,35 20,35' }]
        };
        const lines = buildManuscriptLines({ source, rawDataForSource, regions, regionItems, patternRefMap });
        expect(lines).toHaveLength(1);
        expect(lines[0].items).toHaveLength(1);
        expect(lines[0].items[0].id).toBe('item_1');
        expect(lines[0].items[0].points).toBe('20,25 30,25 30,35 20,35');
        expect(lines[0].items[0].displayId).toBe('101a');
    });

    it('ignores regions from other sources', () => {
        const regions = {
            'Other MS_1r': [{ id: 'r_x', name: '1', points: '0,0 1,1' }]
        };
        const lines = buildManuscriptLines({ source, rawDataForSource: {}, regions, regionItems: {}, patternRefMap });
        expect(lines).toHaveLength(0);
    });
});

describe('pointsBoundingBox', () => {
    it('computes a padded bbox clamped to 0..100', () => {
        const bb = pointsBoundingBox('10,20 90,20 90,40 10,40', 0.05);
        // w=80,h=20; padX=max(4,1)=4; padY=max(1,1)=1
        expect(bb.x).toBeCloseTo(6, 5);
        expect(bb.y).toBeCloseTo(19, 5);
        expect(bb.w).toBeCloseTo(88, 5);
        expect(bb.h).toBeCloseTo(22, 5);
    });

    it('returns null for empty input', () => {
        expect(pointsBoundingBox('')).toBeNull();
        expect(pointsBoundingBox(null)).toBeNull();
    });
});
