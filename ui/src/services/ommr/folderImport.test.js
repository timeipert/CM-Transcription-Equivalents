import { describe, it, expect } from 'vitest';
import { readOmmrExport, pickBestColorImage, OmmrImportError } from './folderImport';

const file = (path, content = '') => {
    const name = path.split('/').pop();
    return { name, webkitRelativePath: path, text: async () => (typeof content === 'string' ? content : JSON.stringify(content)) };
};
const pcgts = (w = 2000, h = 3000) => ({ page: { imageWidth: w, imageHeight: h, blocks: [] } });
const noYield = { yieldToUi: async () => {} };

describe('pickBestColorImage', () => {
    const imgs = names => names.map(name => ({ name }));

    it('prefers the full-resolution deskewed colour image', () => {
        const best = pickBestColorImage(imgs(['color_deskewed.jpg', 'color_highres_deskewed.jpg', 'color_lowres.jpg']));
        expect(best.name).toBe('color_highres_deskewed.jpg');
    });

    it('takes a deskewed colour image over a plain colour one', () => {
        expect(pickBestColorImage(imgs(['color.jpg', 'color_deskewed.jpg'])).name).toBe('color_deskewed.jpg');
    });

    it('rejects black-and-white, thumbnails and the original (not deskewed)', () => {
        expect(pickBestColorImage(imgs(['binary.png', 'gray.jpg', 'overlay.png', 'color_thumbnail.jpg', 'color_original.jpg', 'scan.jpg']))).toBeNull();
    });

    it('is null for no images', () => {
        expect(pickBestColorImage([])).toBeNull();
    });
});

describe('readOmmrExport', () => {
    it('reads one entry per page folder, with its image and deskew angle', async () => {
        const files = [
            file('Pa_14819/pages/0001/pcgts.json', pcgts()),
            file('Pa_14819/pages/0001/meta.json', JSON.stringify(JSON.stringify({ preprocessing: { deskewing_degrees: 0.42 } }))),
            file('Pa_14819/pages/0001/color_highres_deskewed.jpg'),
            file('Pa_14819/pages/0001/binary.png'),
            file('Pa_14819/pages/0002/pcgts.json', pcgts(1000, 1500))
        ];
        const { detectedSource, entries } = await readOmmrExport(files, noYield);
        expect(detectedSource).toBe('Pa 14819');
        expect(entries.map(e => e.rawFolio)).toEqual(['0001', '0002']);
        expect(entries[0]).toMatchObject({ angle: 0.42, w: 2000, h: 3000 });
        expect(entries[0].image.name).toBe('color_highres_deskewed.jpg');
        expect(entries[1]).toMatchObject({ angle: 0, image: null, w: 1000, h: 1500 });
    });

    it('also reads a single-encoded meta.json', async () => {
        const files = [file('S/p1/pcgts.json', pcgts()), file('S/p1/meta.json', JSON.stringify({ preprocessing: { deskewing_degrees: 1.5 } }))];
        expect((await readOmmrExport(files, noYield)).entries[0].angle).toBe(1.5);
    });

    it('skips an intermediate "pages" folder when finding the source', async () => {
        const files = [file('Wue_165/pages/12r/pcgts.json', pcgts())];
        expect((await readOmmrExport(files, noYield)).detectedSource).toBe('Wue 165');
    });

    it('works when the page folder sits directly under the source', async () => {
        const files = [file('Lo_4/12r/pcgts.json', pcgts())];
        const res = await readOmmrExport(files, noYield);
        expect(res.detectedSource).toBe('Lo 4');
        expect(res.entries[0].rawFolio).toBe('12r');
    });

    it('takes the folio from the file name when there is no page folder', async () => {
        const res = await readOmmrExport([file('007.pcgts.json', pcgts())], noYield);
        expect(res.entries[0].rawFolio).toBe('007');
        expect(res.detectedSource).toBe('');
    });

    it('skips malformed files but keeps the rest', async () => {
        const files = [file('S/a/pcgts.json', '{broken'), file('S/b/pcgts.json', pcgts())];
        const { entries } = await readOmmrExport(files, noYield);
        expect(entries.map(e => e.rawFolio)).toEqual(['b']);
    });

    it('survives a broken meta.json', async () => {
        const files = [file('S/a/pcgts.json', pcgts()), file('S/a/meta.json', 'nope')];
        expect((await readOmmrExport(files, noYield)).entries[0].angle).toBe(0);
    });

    it('says so when there is no pcgts.json at all', async () => {
        await expect(readOmmrExport([file('S/a/readme.txt')], noYield)).rejects.toThrow(OmmrImportError);
        await expect(readOmmrExport([], noYield)).rejects.toThrow(/No pcgts\.json files found/);
    });

    it('says so when none of them can be read', async () => {
        await expect(readOmmrExport([file('S/a/pcgts.json', 'x')], noYield)).rejects.toThrow(/No readable pcgts\.json/);
    });

    it('reports progress and yields to the page now and then', async () => {
        const files = Array.from({ length: 21 }, (_, i) => file(`S/p${i}/pcgts.json`, pcgts()));
        const messages = [];
        let yields = 0;
        await readOmmrExport(files, { onProgress: m => messages.push(m), yieldToUi: async () => { yields++; } });
        expect(messages[0]).toBe('Reading folio 1 / 21');
        expect(messages.at(-1)).toBe('Reading folio 21 / 21');
        expect(yields).toBe(3); // after files 0, 10 and 20
    });
});
