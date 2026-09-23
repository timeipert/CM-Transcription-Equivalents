import { describe, it, expect } from 'vitest';
import {
    defaultNcTemplate,
    normalizeNcTemplate,
    ncToXml,
    ncTemplateToXml,
    patternXmlId,
    customAttributeNames
} from './meiTemplate';

describe('defaultNcTemplate', () => {
    it('creates one nc per note', () => {
        expect(defaultNcTemplate('*')).toHaveLength(1);
        expect(defaultNcTemplate('*u')).toHaveLength(2);
        expect(defaultNcTemplate('*uu')).toHaveLength(3);
        expect(defaultNcTemplate('[*u]')).toHaveLength(2);
    });

    it('does not count a custom sign as a note', () => {
        expect(defaultNcTemplate('*uV', ['V'])).toHaveLength(2);
        expect(defaultNcTemplate('*uVd', ['V'])).toHaveLength(3);
    });
});

describe('normalizeNcTemplate', () => {
    it('pads a short template', () => {
        expect(normalizeNcTemplate('*uu', [{ tilt: 'n' }])).toEqual([{ tilt: 'n' }, {}, {}]);
    });

    it('truncates a long template', () => {
        expect(normalizeNcTemplate('*u', [{ tilt: 'n' }, {}, { tilt: 's' }]))
            .toEqual([{ tilt: 'n' }, {}]);
    });

    it('tolerates missing input', () => {
        expect(normalizeNcTemplate('*u', null)).toEqual([{}, {}]);
        expect(normalizeNcTemplate('*u', undefined)).toEqual([{}, {}]);
    });
});

describe('ncToXml', () => {
    it('renders attributes', () => {
        expect(ncToXml({ tilt: 'n' }, '')).toBe('<nc tilt="n"/>');
    });

    it('omits empty and false values', () => {
        expect(ncToXml({ tilt: '', curve: null, q: false }, '')).toBe('<nc/>');
    });

    it('renders booleans as true', () => {
        expect(ncToXml({ q: true }, '')).toBe('<nc q="true"/>');
    });

    it('escapes attribute values', () => {
        expect(ncToXml({ type: 'a"b&c' }, '')).toBe('<nc type="a&quot;b&amp;c"/>');
    });
});

describe('ncTemplateToXml', () => {
    it('renders the example from the spec', () => {
        const xml = ncTemplateToXml([{ tilt: 'n' }, { tilt: 'n' }]);
        expect(xml).toBe('<neume>\n  <nc tilt="n"/>\n  <nc tilt="n"/>\n</neume>');
    });

    it('adds an xml:id when asked', () => {
        expect(ncTemplateToXml([{}], { xmlId: 'pat-u' }))
            .toBe('<neume xml:id="pat-u">\n  <nc/>\n</neume>');
    });

    it('self-closes an empty template', () => {
        expect(ncTemplateToXml([])).toBe('<neume/>');
    });
});

describe('patternXmlId', () => {
    it('produces an id-safe token', () => {
        expect(patternXmlId('[*u]')).toBe('pat-lig-u');
        expect(patternXmlId('*u')).toBe('pat-u');
        expect(patternXmlId('*uVd')).toBe('pat-uVd');
        expect(patternXmlId('*')).toBe('pat-single');
    });
});

describe('customAttributeNames', () => {
    it('lists only attributes outside the structured set', () => {
        expect(customAttributeNames({ tilt: 'n', q: true, type: 'liquescent' })).toEqual(['type']);
    });
});
