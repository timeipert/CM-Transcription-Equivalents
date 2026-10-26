import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { groupSnippets, customManuscriptPdfName, pdfImageFormat, layoutCustomManuscriptPdf } from './useCustomManuscriptPdf';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** A jsPDF stand-in that records what is drawn and tracks the current page. */
function recordingDoc() {
    const calls = [];
    let page = 1;
    let pages = 1;
    const rec = name => (...args) => { calls.push({ name, page, args }); };
    return {
        calls,
        setFont: rec('setFont'), setFontSize: rec('setFontSize'), setTextColor: rec('setTextColor'),
        setDrawColor: rec('setDrawColor'), setLineWidth: rec('setLineWidth'),
        text: rec('text'), addImage: rec('addImage'), rect: rec('rect'), line: rec('line'),
        splitTextToSize: (t, w) => String(t).match(new RegExp(`.{1,${Math.max(1, Math.floor(w / 2))}}`, 'g')) || [],
        addPage: () => { pages++; page = pages; },
        getNumberOfPages: () => pages,
        setPage: n => { page = n; },
        texts: () => calls.filter(c => c.name === 'text').map(c => c.args[0]),
        images: () => calls.filter(c => c.name === 'addImage')
    };
}

const snippet = (refId, caption = '', aspect = 2) => ({ dataUrl: png, format: 'PNG', aspect, refId, caption });
const model = (groups, over = {}) => ({ siglum: 'Cod. 1', title: 'Gradual', notes: '', date: '2026-10-26', isPublished: false, groups, ...over });

describe('groupSnippets', () => {
    const collection = {
        patterns: [{ code: '*uu', label: 'A' }, { code: '*dd', label: 'B' }],
        snippets: [
            { id: '1', pattern: '*dd' }, { id: '2', pattern: '*uu' }, { id: '3', pattern: '' },
            { id: '4', pattern: '*gone' }, { id: '5', pattern: '*uu' }
        ]
    };

    it('lists declared patterns in order, with their snippets, then the unassigned', () => {
        const groups = groupSnippets(collection);
        expect(groups.map(g => [g.code, g.snippets.map(s => s.id)])).toEqual([
            ['*uu', ['2', '5']], ['*dd', ['1']], ['', ['3', '4']]
        ]);
        expect(groups[2].label).toBe('Unassigned');
    });

    it('keeps a declared pattern that has no snippets, and adds no Unassigned group when nothing is loose', () => {
        const groups = groupSnippets({ patterns: [{ code: '*u' }], snippets: [] });
        expect(groups).toMatchObject([{ code: '*u', snippets: [] }]);
    });

    it('copes with an empty collection', () => {
        expect(groupSnippets({})).toEqual([]);
    });
});

describe('file name and image format', () => {
    it('names the PDF after the siglum and date, safe for file systems', () => {
        expect(customManuscriptPdfName({ source: 'Cod. Sang. 359/2' }, '2026-10-26')).toBe('cm-custom-manuscript-Cod__Sang__359_2-2026-10-26.pdf');
        expect(customManuscriptPdfName({}, '2026-10-26')).toBe('cm-custom-manuscript-manuscript-2026-10-26.pdf');
    });

    it('knows which data URLs the PDF library can embed', () => {
        expect(pdfImageFormat('data:image/png;base64,AA==')).toBe('PNG');
        expect(pdfImageFormat('data:image/jpeg;base64,AA==')).toBe('JPEG');
        expect(pdfImageFormat('data:image/jpg;base64,AA==')).toBe('JPEG');
        expect(pdfImageFormat('data:image/webp;base64,AA==')).toBe('');
        expect(pdfImageFormat('https://example.org/a.png')).toBe('');
        expect(pdfImageFormat(undefined)).toBe('');
    });
});

describe('layoutCustomManuscriptPdf', () => {
    it('writes the header: siglum, title, counts and the proofreading hint', () => {
        const doc = recordingDoc();
        layoutCustomManuscriptPdf(doc, model([{ code: '*uu', label: 'Pes', patternImage: null, snippets: [snippet('1'), snippet('2')] }], { notes: 'Checked against the facsimile.' }));
        const texts = doc.texts();
        expect(texts[0]).toBe('Cod. 1');
        expect(texts).toContain('Gradual');
        expect(texts.some(t => /Proofreading copy, 2026-10-26 · 1 patterns · 2 snippets · not published/.test(t))).toBe(true);
        expect(texts.some(t => /Checked against/.test(t))).toBe(true);
        expect(texts.some(t => /Tick each snippet/.test(t))).toBe(true);
    });

    it('shows every snippet image with its Ref ID, caption and a tick box', () => {
        const doc = recordingDoc();
        layoutCustomManuscriptPdf(doc, model([{ code: '*uu', label: 'Pes', patternImage: null, snippets: [snippet('7', 'f. 12r'), snippet('', '')] }]));
        expect(doc.images()).toHaveLength(2);
        const texts = doc.texts();
        expect(texts).toContain('Ref ID: 7');
        expect(texts).toContain('No Ref ID');
        expect(texts).toContain('f. 12r');
        // image frame + tick box per snippet
        expect(doc.calls.filter(c => c.name === 'rect')).toHaveLength(4);
    });

    it('fits a tall image into its box without stretching it', () => {
        const doc = recordingDoc();
        layoutCustomManuscriptPdf(doc, model([{ code: '*u', label: '', patternImage: null, snippets: [snippet('1', '', 0.25), snippet('2', '', 5)] }]));
        const [tall, wide] = doc.images().map(c => c.args);
        expect(tall[5] / tall[4]).toBeCloseTo(4, 5);   // height 32, width 8
        expect(tall[5]).toBeLessThanOrEqual(32);
        expect(wide[4] / wide[5]).toBeCloseTo(5, 5);   // width 42
        expect(wide[4]).toBeLessThanOrEqual(42);
    });

    it('lays out four snippets to a row and starts the next row below', () => {
        const doc = recordingDoc();
        layoutCustomManuscriptPdf(doc, model([{ code: '*u', label: '', patternImage: null, snippets: Array.from({ length: 5 }, (_, i) => snippet(String(i))) }]));
        const frames = doc.calls.filter(c => c.name === 'rect' && c.args[2] === 42).map(c => c.args);
        expect(frames.map(f => f[0])).toEqual([14, 62, 110, 158, 14]);
        expect(frames[4][1]).toBeGreaterThan(frames[0][1] + 32);
        expect(new Set(frames.slice(0, 4).map(f => f[1])).size).toBe(1);
    });

    it('breaks onto new pages instead of running off the bottom, and numbers them', () => {
        const doc = recordingDoc();
        const many = Array.from({ length: 40 }, (_, i) => snippet(String(i)));
        layoutCustomManuscriptPdf(doc, model([{ code: '*u', label: '', patternImage: null, snippets: many }]));
        expect(doc.getNumberOfPages()).toBeGreaterThan(1);
        for (const c of doc.calls.filter(c => c.name === 'addImage')) {
            expect(c.args[2] + c.args[5]).toBeLessThanOrEqual(285);
        }
        const pages = doc.getNumberOfPages();
        expect(doc.texts()).toContain(`Cod. 1 · page ${pages} of ${pages}`);
        expect(doc.texts()).toContain('Cod. 1 · page 1 of ' + pages);
    });

    it('keeps a pattern heading together with its first row', () => {
        const doc = recordingDoc();
        const fill = Array.from({ length: 16 }, (_, i) => snippet(String(i)));       // four rows: page 1 is nearly full
        layoutCustomManuscriptPdf(doc, model([
            { code: '*uu', label: 'First', patternImage: null, snippets: fill },
            { code: '*dd', label: 'Second', patternImage: null, snippets: [snippet('x')] }
        ]));
        const heading = doc.calls.find(c => c.name === 'text' && c.args[0] === '*dd');
        const image = doc.calls.filter(c => c.name === 'addImage').pop();
        expect(heading.page).toBe(image.page);
        expect(heading.page).toBe(2); // moved to the next page as a whole, not left alone at the bottom
    });

    it('says when a pattern has no snippets, and shows the unassigned ones', () => {
        const doc = recordingDoc();
        layoutCustomManuscriptPdf(doc, model([
            { code: '*uu', label: 'Pes', patternImage: null, snippets: [] },
            { code: '', label: 'Unassigned', patternImage: null, snippets: [snippet('9')] }
        ]));
        const texts = doc.texts();
        expect(texts).toContain('No snippets filed under this pattern.');
        expect(texts).toContain('Unassigned  (1)');
        expect(texts).toContain('Ref ID: 9');
    });

    it('draws the notation picture of a pattern when there is one', () => {
        const doc = recordingDoc();
        layoutCustomManuscriptPdf(doc, model([{ code: '*uu', label: 'Pes', patternImage: { dataUrl: png, aspect: 2 }, snippets: [] }]));
        expect(doc.images()).toHaveLength(1);
        expect(doc.images()[0].args[1]).toBe('PNG');
    });

    it('also draws a manuscript with nothing in it', () => {
        const doc = recordingDoc();
        layoutCustomManuscriptPdf(doc, model([], { title: '' }));
        expect(doc.texts()).toContain('Cod. 1');
        expect(doc.getNumberOfPages()).toBe(1);
    });

    it('produces a real PDF with jsPDF', () => {
        const doc = new jsPDF();
        layoutCustomManuscriptPdf(doc, model([
            { code: '*uudd', label: 'Scandicus', patternImage: { dataUrl: png, aspect: 2 }, snippets: [snippet('1', 'f. 1r'), snippet('2', 'a much longer caption that has to wrap onto a second line')] },
            { code: '', label: 'Unassigned', patternImage: null, snippets: [snippet('3')] }
        ]));
        const bytes = new Uint8Array(doc.output('arraybuffer'));
        expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
        expect(bytes.length).toBeGreaterThan(1000);
    });
});
