import { describe, it, expect } from 'vitest';
import {
    tokenizeCode,
    parsePatternCode,
    noteCount,
    buildPatternHierarchy,
    comparePatternCodes,
    modifierLabel
} from './patternCode';

describe('tokenizeCode', () => {
    it('splits a code into notes', () => {
        expect(tokenizeCode('*ud')).toEqual([
            { move: '*', suffix: '', sign: '', grouped: false },
            { move: 'u', suffix: '', sign: '', grouped: false },
            { move: 'd', suffix: '', sign: '', grouped: false }
        ]);
    });

    it('marks notes inside a group', () => {
        expect(tokenizeCode('[*u]').every(n => n.grouped)).toBe(true);
        expect(tokenizeCode('{*u}').every(n => n.grouped)).toBe(true);
    });

    it('separates custom signs from built-in suffixes', () => {
        const notes = tokenizeCode('*uVQd', ['V']);
        expect(notes[1]).toEqual({ move: 'u', suffix: 'Q', sign: 'V', grouped: false });
    });

    it('treats an unconfigured letter as a built-in suffix', () => {
        expect(tokenizeCode('*uV', [])[1].suffix).toBe('V');
        expect(tokenizeCode('*uV', [])[1].sign).toBe('');
    });

    it('returns nothing for non-shape tokens', () => {
        expect(tokenizeCode('(Start)')).toEqual([]);
        expect(tokenizeCode('')).toEqual([]);
    });
});

describe('parsePatternCode', () => {
    it('counts one nc per note', () => {
        expect(noteCount('*')).toBe(1);
        expect(noteCount('*u')).toBe(2);
        expect(noteCount('*uu')).toBe(3);
        expect(noteCount('*uVd', ['V'])).toBe(3); // the sign adds no note
        expect(noteCount('[*u]')).toBe(2);
    });

    it('derives the direction', () => {
        expect(parsePatternCode('*').direction).toBe('base');
        expect(parsePatternCode('*uu').direction).toBe('up');
        expect(parsePatternCode('*dd').direction).toBe('down');
        expect(parsePatternCode('*ee').direction).toBe('same');
        expect(parsePatternCode('*ud').direction).toBe('mixed');
    });

    it('derives the ligature status', () => {
        expect(parsePatternCode('*u').ligature).toBe('open');
        expect(parsePatternCode('[*u]').ligature).toBe('connected');
        expect(parsePatternCode('*[ud]').ligature).toBe('partial');
    });

    it('collects signs and suffixes', () => {
        const p = parsePatternCode('*uVdQ', ['V']);
        expect(p.signs).toEqual(['V']);
        expect(p.suffixes).toEqual(['Q']);
    });

    it('drops a legacy trailing snippet variant', () => {
        expect(parsePatternCode('*u b').code).toBe('*u');
    });

    it('flags non-shape tokens', () => {
        const p = parsePatternCode('(Start)');
        expect(p.isSpecial).toBe(true);
        expect(p.noteCount).toBe(0);
    });
});

describe('buildPatternHierarchy', () => {
    const codes = ['*', '*u', '[*u]', '*uV', '*d', '*ud', '(Start)'];
    const tree = buildPatternHierarchy(codes, { signKeys: ['V'] });

    it('orders level 1 by direction', () => {
        expect(tree.map(t => t.key)).toEqual(['base', 'up', 'down', 'mixed', 'other']);
    });

    it('groups level 2 by ligature status', () => {
        const up = tree.find(t => t.key === 'up');
        expect(up.groups.map(g => g.key)).toEqual(['open', 'connected']);
    });

    it('groups level 3 by modifier', () => {
        const up = tree.find(t => t.key === 'up');
        const open = up.groups.find(g => g.key === 'open');
        expect(open.groups.map(g => g.key)).toEqual(['_base', 'V']);
        expect(open.groups.find(g => g.key === 'V').codes).toEqual(['*uV']);
    });

    it('counts leaves up the tree', () => {
        const up = tree.find(t => t.key === 'up');
        expect(up.count).toBe(3); // *u, *uV, [*u]
    });

    it('deduplicates codes', () => {
        expect(buildPatternHierarchy(['*u', '*u', '*u b'])[0].count).toBe(1);
    });

    it('puts an unconfigured sign letter in its own group all the same', () => {
        const t = buildPatternHierarchy(['*u', '*uV'], { signKeys: [] });
        const open = t.find(x => x.key === 'up').groups[0];
        expect(open.groups.map(g => g.key)).toEqual(['_base', 'V']);
    });
});

describe('modifierLabel', () => {
    it('uses the configured sign label', () => {
        expect(modifierLabel('V', [{ key: 'V', label: 'Virga' }])).toBe('V (Virga)');
        expect(modifierLabel('')).toBe('Base');
        expect(modifierLabel('V')).toBe('V');
    });
});

describe('comparePatternCodes', () => {
    it('orders shorter shapes first', () => {
        expect(['*uu', '*', '*u'].sort((a, b) => comparePatternCodes(a, b))).toEqual(['*', '*u', '*uu']);
    });

    it('orders plain before modified', () => {
        expect(['*uV', '*u'].sort((a, b) => comparePatternCodes(a, b, ['V']))).toEqual(['*u', '*uV']);
    });
});
