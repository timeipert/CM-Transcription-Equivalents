/**
 * MEI neume templates.
 *
 * In MEI a neume is a <neume> element holding one <nc> (neume component) per
 * single tone. A pattern's template is therefore an array with one plain object
 * per nc, each object holding that nc's attributes:
 *
 *   [*uV]  ->  [ { tilt: 'n' }, { tilt: 'n', curve: 'a' } ]
 *
 *   <neume>
 *     <nc tilt="n"/>
 *     <nc tilt="n" curve="a"/>
 *   </neume>
 *
 * Pitches (pname/oct) are intentionally NOT part of the template — Monodi Zero
 * fills those in from the position in the staff.
 */

import { parsePatternCode, noteCount } from './patternCode.js';

/**
 * The attributes offered as structured controls in the editor.
 * Anything else can still be added as a free key/value row.
 */
export const NC_ATTRIBUTES = [
    {
        name: 'tilt',
        label: 'Tilt',
        type: 'select',
        title: 'Neigungsrichtung des Zeichens',
        options: [
            { value: '', label: '—' },
            { value: 'n', label: 'n (Nord)' },
            { value: 'ne', label: 'ne (Nordost)' },
            { value: 'e', label: 'e (Ost)' },
            { value: 'se', label: 'se (Südost)' },
            { value: 's', label: 's (Süd)' },
            { value: 'sw', label: 'sw (Südwest)' },
            { value: 'w', label: 'w (West)' },
            { value: 'nw', label: 'nw (Nordwest)' }
        ]
    },
    {
        name: 'curve',
        label: 'Curve',
        type: 'select',
        title: 'Bogenrichtung',
        options: [
            { value: '', label: '—' },
            { value: 'a', label: 'a (aufwärts)' },
            { value: 'c', label: 'c (abwärts)' }
        ]
    },
    {
        name: 'con',
        label: 'Con',
        type: 'select',
        title: 'Verbindung zum nächsten nc',
        options: [
            { value: '', label: '—' },
            { value: 'g', label: 'g (gapped)' },
            { value: 'l', label: 'l (looped)' }
        ]
    },
    {
        name: 'q',
        label: 'Quilisma',
        type: 'boolean',
        title: 'Quilisma (q="true")'
    },
    {
        name: 'ho',
        label: 'Horizontal',
        type: 'boolean',
        title: 'Horizontale Form (ho="true")'
    }
];

const KNOWN_NAMES = new Set(NC_ATTRIBUTES.map(a => a.name));

/** Attribute names that are not part of the structured controls. */
export function customAttributeNames(nc) {
    return Object.keys(nc || {}).filter(k => !KNOWN_NAMES.has(k));
}

/**
 * Default (empty) template for a pattern: one nc per note.
 * @param {string} code pattern code, e.g. "*uVd"
 * @param {string[]} [signKeys] project custom-sign keys, so a sign letter is not
 *        mistaken for a note
 */
export function defaultNcTemplate(code, signKeys = []) {
    const count = Math.max(noteCount(code, signKeys), 0);
    return Array.from({ length: count }, () => ({}));
}

/**
 * Bring a stored template to the nc count the pattern code requires.
 * Extra ncs are dropped, missing ones appended empty — so editing a pattern
 * code never leaves a template out of sync with its shape.
 */
export function normalizeNcTemplate(code, template, signKeys = []) {
    const target = defaultNcTemplate(code, signKeys).length;
    const list = Array.isArray(template) ? template : [];
    const out = [];
    for (let i = 0; i < target; i++) {
        const nc = list[i];
        out.push(nc && typeof nc === 'object' ? { ...nc } : {});
    }
    return out;
}

function escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Serialize one nc object to `<nc a="b"/>`. Empty values are omitted. */
export function ncToXml(nc, indent = '  ') {
    const attrs = Object.entries(nc || {})
        .filter(([k, v]) => k && v !== '' && v !== null && v !== undefined && v !== false)
        .map(([k, v]) => `${k}="${escapeAttr(v === true ? 'true' : v)}"`);
    return `${indent}<nc${attrs.length ? ' ' + attrs.join(' ') : ''}/>`;
}

/**
 * Serialize a whole template to a `<neume>` element.
 *
 * @param {Array<Object>} template
 * @param {{xmlId?: string, indent?: string}} [options]
 * @returns {string}
 */
export function ncTemplateToXml(template, options = {}) {
    const { xmlId = '', indent = '' } = options;
    const list = Array.isArray(template) ? template : [];
    if (list.length === 0) return `${indent}<neume${xmlId ? ` xml:id="${escapeAttr(xmlId)}"` : ''}/>`;

    const open = `${indent}<neume${xmlId ? ` xml:id="${escapeAttr(xmlId)}"` : ''}>`;
    const body = list.map(nc => ncToXml(nc, indent + '  ')).join('\n');
    return `${open}\n${body}\n${indent}</neume>`;
}

/** Turn a pattern code into an xml:id-safe token, e.g. "[*uV]" -> "pat-lig-uV". */
export function patternXmlId(code) {
    const parsed = parsePatternCode(code);
    const body = parsed.notes
        .map(n => `${n.move}${n.suffix}${n.sign}`)
        .join('')
        .replace(/[^A-Za-z0-9._-]/g, '');
    const prefix = parsed.ligature === 'connected' ? 'lig-' : '';
    return `pat-${prefix}${body || 'single'}`;
}

/**
 * Standalone MEI snippet for a single pattern, ready to paste into Monodi Zero.
 * Kept minimal on purpose: the pattern's shape, nothing else.
 */
export function patternToMeiDocument(code, template, meta = {}) {
    const xml = ncTemplateToXml(template, { xmlId: patternXmlId(code), indent: '      ' });
    const label = [code, meta.name, meta.refId ? `Ref ${meta.refId}` : '']
        .filter(Boolean)
        .join(' — ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <meiHead>
    <fileDesc>
      <titleStmt><title>${escapeAttr(label)}</title></titleStmt>
      <pubStmt/>
    </fileDesc>
  </meiHead>
  <music>
    <body>
${xml}
    </body>
  </music>
</mei>
`;
}
