import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { expandImportFiles } from './importFiles';

const jsonFile = name => ({ name, type: 'application/json', text: async () => '{}' });

async function zipFile(name, entries) {
    const zip = new JSZip();
    for (const [path, content] of Object.entries(entries)) zip.file(path, content);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    return { name, type: 'application/zip', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

describe('expandImportFiles', () => {
    it('passes JSON files through and opens ZIPs into one entry per .json file', async () => {
        const zip = await zipFile('export.zip', {
            'manuscripts/B.json': '{"b":1}',
            'manuscripts/A.json': '{"a":1}',
            'readme.txt': 'not data',
            '__MACOSX/manuscripts/._A.json': 'junk'
        });
        const { files, skipped } = await expandImportFiles([jsonFile('one.json'), zip]);
        expect(files.map(f => f.name)).toEqual(['one.json', 'export.zip › manuscripts/A.json', 'export.zip › manuscripts/B.json']);
        expect(await files[1].text()).toBe('{"a":1}');
        expect(skipped).toEqual([]);
    });

    it('reports files it cannot use instead of failing', async () => {
        const empty = await zipFile('empty.zip', { 'x.txt': 'x' });
        const broken = { name: 'broken.zip', type: 'application/zip', arrayBuffer: async () => new ArrayBuffer(4) };
        const { files, skipped } = await expandImportFiles([{ name: 'scan.png', type: 'image/png' }, empty, broken]);
        expect(files).toEqual([]);
        expect(skipped.map(s => s.name)).toEqual(['scan.png', 'empty.zip', 'broken.zip']);
    });
});
