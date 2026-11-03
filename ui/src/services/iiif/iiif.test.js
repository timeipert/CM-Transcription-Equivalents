import { describe, it, expect, vi, afterEach } from 'vitest';
import { iiifImageUrl, pctRegion, sizeParam, iiifPageUrl, iiifRegionUrl } from './imageUrl';
import { parseManifest, manifestVersion } from './manifestParser';
import { fetchManifestJson } from './manifestFetch';
import { iiifParseRules, splitSpreadLabel, labelRuleFor } from '../../config/iiifRules';

describe('image URLs', () => {
    it('assembles the IIIF Image API form', () => {
        expect(iiifImageUrl('https://x/iiif/abc')).toBe('https://x/iiif/abc/full/full/0/default.jpg');
        expect(iiifImageUrl('https://x/iiif/abc', { region: 'pct:1,2,3,4', size: '800,' }))
            .toBe('https://x/iiif/abc/pct:1,2,3,4/800,/0/default.jpg');
    });

    it('does not double the slash when the service id ends with one', () => {
        expect(iiifImageUrl('https://x/iiif/abc/')).toBe('https://x/iiif/abc/full/full/0/default.jpg');
    });

    it('writes percent regions to three decimals', () => {
        expect(pctRegion({ x: 1.23456, y: 2, w: 3.5, h: 4 })).toBe('pct:1.235,2.000,3.500,4.000');
        expect(pctRegion({ x: 1.23456, y: 2, w: 3.5, h: 4 }, 1)).toBe('pct:1.2,2.0,3.5,4.0');
    });

    it('turns a number or digit string into a width, and passes other sizes through', () => {
        expect(sizeParam(800)).toBe('800,');
        expect(sizeParam('800')).toBe('800,');
        expect(sizeParam('full')).toBe('full');
        expect(sizeParam('max')).toBe('max');
        expect(sizeParam('!400,400')).toBe('!400,400');
    });

    it('builds page and region URLs', () => {
        expect(iiifPageUrl('https://x/s', 1600)).toBe('https://x/s/full/1600,/0/default.jpg');
        expect(iiifPageUrl('https://x/s')).toBe('https://x/s/full/full/0/default.jpg');
        expect(iiifRegionUrl('https://x/s', 'pct:0,0,5,5', 80)).toBe('https://x/s/pct:0,0,5,5/80,/0/default.jpg');
        expect(iiifRegionUrl('https://x/s', '10,10,50,50', 'full')).toBe('https://x/s/10,10,50,50/full/0/default.jpg');
    });
});

const v2 = (canvases, context = 'http://iiif.io/api/presentation/2/context.json') => ({
    '@context': context,
    sequences: [{ canvases }]
});
const canvasV2 = (label, service, extra = {}) => ({
    label,
    width: 1000,
    height: 1500,
    images: [{ resource: service ? { '@id': 'https://x/direct.jpg', service: { '@id': service } } : { '@id': 'https://x/direct.jpg' } }],
    ...extra
});

const v3 = (items, context = 'http://iiif.io/api/presentation/3/context.json') => ({ '@context': context, items });
const canvasV3 = (label, serviceId, extra = {}) => ({
    label,
    width: 2000,
    height: 3000,
    items: [{ items: [{ body: serviceId ? { id: 'https://x/body.jpg', service: [{ id: serviceId }] } : { id: 'https://x/body.jpg' } }] }],
    ...extra
});

describe('manifestVersion', () => {
    it('reads the version from a string or a list context', () => {
        expect(manifestVersion({ '@context': 'http://iiif.io/api/presentation/2/context.json' })).toBe(2);
        expect(manifestVersion({ '@context': 'http://iiif.io/api/presentation/3/context.json' })).toBe(3);
        expect(manifestVersion({ '@context': ['http://www.w3.org/ns/anno.jsonld', 'http://iiif.io/api/presentation/3/context.json'] })).toBe(3);
        expect(manifestVersion({ '@context': ['http://iiif.io/api/presentation/2/context.json'] })).toBe(2);
    });

    it('is null when it cannot tell', () => {
        expect(manifestVersion({})).toBeNull();
        expect(manifestVersion({ '@context': 'https://example.org/other' })).toBeNull();
        expect(manifestVersion(null)).toBeNull();
    });
});

describe('parseManifest (v2)', () => {
    it('reads label, image, service and size from each canvas', () => {
        const pages = parseManifest(v2([canvasV2('1r', 'https://x/iiif/1'), canvasV2('1v', 'https://x/iiif/2')]));
        expect(pages).toEqual([
            { folio: '1r', imgUrl: 'https://x/iiif/1/full/full/0/default.jpg', serviceUrl: 'https://x/iiif/1', w: 1000, h: 1500, originalFolio: '1r' },
            { folio: '1v', imgUrl: 'https://x/iiif/2/full/full/0/default.jpg', serviceUrl: 'https://x/iiif/2', w: 1000, h: 1500, originalFolio: '1v' }
        ]);
    });

    it('falls back to the resource id when there is no image service', () => {
        const [page] = parseManifest(v2([canvasV2('1r', null)]));
        expect(page.imgUrl).toBe('https://x/direct.jpg');
        expect(page.serviceUrl).toBeNull();
    });

    it('accepts a service given as a list', () => {
        const c = canvasV2('1r', null);
        c.images[0].resource.service = [{ '@id': 'https://x/iiif/listed' }];
        expect(parseManifest(v2([c]))[0].serviceUrl).toBe('https://x/iiif/listed');
    });

    it('cleans a "p." prefix off the label but keeps the original', () => {
        const [a, b] = parseManifest(v2([canvasV2('p. 12', 's'), canvasV2('P12', 's')]));
        expect(a).toMatchObject({ folio: '12', originalFolio: 'p. 12' });
        expect(b.folio).toBe('12');
    });

    it('reads labels given as lists or language values', () => {
        const pages = parseManifest(v2([
            canvasV2(['3r', 'x'], 's'),
            canvasV2({ '@value': '4r', '@language': 'en' }, 's'),
            canvasV2(undefined, 's')
        ]));
        expect(pages.map(p => p.folio)).toEqual(['3r', '4r', 'Unknown']);
    });

    it('skips canvases without an image', () => {
        const none = { label: 'blank', images: [] };
        expect(parseManifest(v2([none, canvasV2('1r', 's')])).map(p => p.folio)).toEqual(['1r']);
    });

    it('applies a label rule: a string, a list, or nothing', () => {
        const rule = label => ({ a: 'A', b: ['B1', 'B2'], c: null })[label];
        const pages = parseManifest(v2([canvasV2('a', 's'), canvasV2('b', 's'), canvasV2('c', 's'), canvasV2('d', 's')]), { labelRule: rule });
        expect(pages.map(p => p.folio)).toEqual(['A', 'B1', 'B2', 'c', 'd']);
        expect(pages[1].originalFolio).toBe('b');
        expect(pages[2].imgUrl).toBe(pages[1].imgUrl);
    });

    it('applies the real rule for a spread-labelled source', () => {
        const pages = parseManifest(v2([canvasV2('122v-122r', 's')]), { labelRule: iiifParseRules['Ben 34'] });
        expect(pages.map(p => p.folio)).toEqual(['121v', '122r']);
    });

    it('reads an opening as the verso of one leaf and the recto of the next', () => {
        expect(splitSpreadLabel('f. 017v - 018r')).toEqual(['17v', '18r']);
        expect(splitSpreadLabel('010v-011r')).toEqual(['10v', '11r']);
        expect(splitSpreadLabel('f. 037v - 038')).toEqual(['37v', '38r']);   // a bare number is a recto
        expect(splitSpreadLabel('000v-001r')).toEqual(['0v', '1r']);
        const pages = parseManifest(v2([canvasV2('f. 002v - 003', 's')]), { labelRule: labelRuleFor('Abb 7') });
        expect(pages.map(p => p.folio)).toEqual(['2v', '3r']);
        expect(pages[1].originalFolio).toBe('f. 002v - 003');
    });

    it('leaves every other dashed label alone', () => {
        for (const label of ['001v-001r', '10r-10v', '5-6', '7v-9r', 'f. 3 - 4', 'plat 1-2', '12r']) {
            expect(splitSpreadLabel(label)).toBe(label);
        }
        expect(labelRuleFor('Ben 34')).toBe(iiifParseRules['Ben 34']);   // a source's own rule wins
    });

    it('copes with a manifest that has no sequences', () => {
        expect(parseManifest({ '@context': 'http://iiif.io/api/presentation/2/context.json' })).toEqual([]);
    });
});

describe('parseManifest (v3)', () => {
    it('reads label maps, services and sizes', () => {
        const pages = parseManifest(v3([canvasV3({ en: ['1r'] }, 'https://x/iiif/9'), canvasV3('2r', 'https://x/iiif/10')]));
        expect(pages).toEqual([
            { folio: '1r', imgUrl: 'https://x/iiif/9/full/max/0/default.jpg', serviceUrl: 'https://x/iiif/9', w: 2000, h: 3000, originalFolio: '1r' },
            { folio: '2r', imgUrl: 'https://x/iiif/10/full/max/0/default.jpg', serviceUrl: 'https://x/iiif/10', w: 2000, h: 3000, originalFolio: '2r' }
        ]);
    });

    it('uses the body id when there is no service, and an old-style @id service', () => {
        const [a] = parseManifest(v3([canvasV3('1r', null)]));
        expect(a).toMatchObject({ imgUrl: 'https://x/body.jpg', serviceUrl: null });
        const c = canvasV3('2r', null);
        c.items[0].items[0].body.service = [{ '@id': 'https://x/iiif/old' }];
        expect(parseManifest(v3([c]))[0].serviceUrl).toBe('https://x/iiif/old');
    });

    it('accepts a service that is a single object, not a list', () => {
        const c = canvasV3('1r', null);
        c.items[0].items[0].body.service = { id: 'https://x/iiif/single' };
        expect(parseManifest(v3([c]))[0].serviceUrl).toBe('https://x/iiif/single');
    });

    it('names a label-less canvas "Unknown" and skips one with no painting', () => {
        const empty = { label: 'no image', items: [] };
        const pages = parseManifest(v3([empty, canvasV3(undefined, 's')]));
        expect(pages.map(p => p.folio)).toEqual(['Unknown']);
    });

    it('works with a list @context', () => {
        const manifest = v3([canvasV3('1r', 's')], ['http://www.w3.org/ns/anno.jsonld', 'http://iiif.io/api/presentation/3/context.json']);
        expect(parseManifest(manifest)).toHaveLength(1);
    });
});

describe('parseManifest (unknown)', () => {
    it('returns no pages and warns', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(parseManifest({ '@context': 'https://example.org/x', items: [canvasV3('1r', 's')] })).toEqual([]);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe('fetchManifestJson', () => {
    afterEach(() => vi.useRealTimers());

    const ok = body => ({ ok: true, status: 200, json: async () => body });
    const status = code => ({ ok: false, status: code, json: async () => ({}) });

    it('returns the parsed body', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(ok({ a: 1 }));
        expect(await fetchManifestJson('u', { fetchImpl })).toEqual({ a: 1 });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('retries a server error and then succeeds', async () => {
        vi.useFakeTimers();
        const fetchImpl = vi.fn().mockResolvedValueOnce(status(500)).mockResolvedValueOnce(ok({ a: 2 }));
        const p = fetchManifestJson('u', { fetchImpl });
        await vi.advanceTimersByTimeAsync(5000);
        expect(await p).toEqual({ a: 2 });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('gives up after the retries and reports the last status', async () => {
        vi.useFakeTimers();
        const fetchImpl = vi.fn().mockResolvedValue(status(503));
        const p = fetchManifestJson('u', { fetchImpl, retries: 3 }).catch(e => e);
        await vi.advanceTimersByTimeAsync(60000);
        const err = await p;
        expect(err.message).toBe('HTTP 503');
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it.each([401, 403, 404])('does not retry a definite %i', async code => {
        const fetchImpl = vi.fn().mockResolvedValue(status(code));
        await expect(fetchManifestJson('u', { fetchImpl })).rejects.toThrow(`Failed to load manifest: HTTP ${code}`);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('reports a timeout as such', async () => {
        vi.useFakeTimers();
        const fetchImpl = vi.fn((url, { signal }) => new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }));
        const p = fetchManifestJson('u', { fetchImpl, retries: 1, timeoutMs: 1000 }).catch(e => e);
        await vi.advanceTimersByTimeAsync(1500);
        expect((await p).message).toBe('Manifest fetch timed out after 1s');
    });

    it('lets a network error through once the retries are used up', async () => {
        vi.useFakeTimers();
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        const p = fetchManifestJson('u', { fetchImpl, retries: 2 }).catch(e => e);
        await vi.advanceTimersByTimeAsync(60000);
        expect((await p).message).toBe('Failed to fetch');
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
});

describe('servers that refuse some sizes (iiifServerLimits)', () => {
    const luebeck = 'https://digital-stadtbibliothek.luebeck.de/viewer/api/v1/records/Mstheollat211/files/images/00000020.tif';

    it('asks such a server for the best fit instead of `full` or `max`', () => {
        expect(iiifImageUrl(luebeck)).toBe(`${luebeck}/full/!1800,1800/0/default.jpg`);
        expect(iiifImageUrl(luebeck, { size: 'max' })).toBe(`${luebeck}/full/!1800,1800/0/default.jpg`);
        expect(iiifRegionUrl(luebeck, 'pct:10,10,30,10', 'full')).toBe(`${luebeck}/pct:10,10,30,10/!1800,1800/0/default.jpg`);
    });

    it('lowers a width above the limit and keeps a smaller one', () => {
        expect(iiifPageUrl(luebeck, 2400)).toBe(`${luebeck}/full/1800,/0/default.jpg`);
        expect(iiifPageUrl(luebeck, 1000)).toBe(`${luebeck}/full/1000,/0/default.jpg`);
    });

    it('leaves every other server alone', () => {
        expect(iiifImageUrl('https://x/iiif/abc')).toBe('https://x/iiif/abc/full/full/0/default.jpg');
        expect(iiifPageUrl('https://x/s', 2400)).toBe('https://x/s/full/2400,/0/default.jpg');
    });

    it('gives a v2 manifest of such a server a usable page image', () => {
        const pages = parseManifest(v2([canvasV2('1r', luebeck)]));
        expect(pages[0].imgUrl).toBe(`${luebeck}/full/!1800,1800/0/default.jpg`);
    });
});

describe('Dar 868: a manifest whose canvases are all labelled "-"', () => {
    const labelled = n => parseManifest(v2(Array.from({ length: n }, () => canvasV2('-', 's'))), { labelRule: labelRuleFor('Dar 868') }).map(p => p.folio);

    it('names the pages from the canvas position: canvas 6 is 2r, then each side in turn', () => {
        const folios = labelled(352);
        expect(folios.slice(0, 6)).toEqual(['-', '-', '-', '-', '-', '-']);   // cover, flyleaves
        expect(folios.slice(6, 10)).toEqual(['2r', '2v', '3r', '3v']);
        expect(folios[345]).toBe('171v');
        expect(folios[346]).toBe('172r');
        expect(folios[347]).toBe('172v');
    });

    it('leaves the back flyleaves and cover unnamed', () => {
        expect(labelled(352).slice(348)).toEqual(['-', '-', '-', '-']);
    });

    it('hands a rule the canvas position, counting canvases that have no image', () => {
        const seen = [];
        parseManifest(v2([canvasV2('a', 's', { images: [] }), canvasV2('b', 's')]), { labelRule: (label, index) => { seen.push([label, index]); return label; } });
        expect(seen).toEqual([['b', 1]]);
    });
});
