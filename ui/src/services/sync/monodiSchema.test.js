import { describe, it, expect } from 'vitest';
import {
    monodiSourceToNormalized,
    monodiDocumentToNormalized,
    monodiDatabaseToSources,
    normalizedSourceToMonodi
} from './monodiSchema';
import { createSource } from '../pipeline/normalizedModel';

const source = {
    id: 'src-1',
    quellensigle: 'Aa 13',
    herkunftsort: 'Reichenau',
    datierung: 's. XI',
    iiifManifestUrl: 'https://example.org/manifest.json',
    equivalents: [{ pattern: '*u', refId: '12', notes: '' }],
    annotationRegions: [{ id: 'r1', name: 'l1', points: '0,0', folio: '1r', lineUUID: 'u1' }],
    annotationItems: [{ id: 'i1', regionId: 'r1', pattern: '*u', variant: 'a', points: '0,0', uuid: 'n1' }],
    custom: { editor: 'TE' }
};

describe('monodiSourceToNormalized', () => {
    it('renames catalogue fields and keeps custom fields', () => {
        const n = monodiSourceToNormalized(source);
        expect(n.id).toBe('Aa 13');
        expect(n.metadata.place).toBe('Reichenau');
        expect(n.metadata.date).toBe('s. XI');
        expect(n.metadata.editor).toBe('TE');
        expect(n.regions[0].lineUUID).toBe('u1');
        expect(n.items[0].uuid).toBe('n1');
    });
});

describe('monodiDocumentToNormalized', () => {
    it('joins a document to its source by quelle_id', () => {
        const map = new Map([['src-1', 'Aa 13']]);
        const doc = monodiDocumentToNormalized(
            { id: 'd1', quelle_id: 'src-1', textinitium: 'Puer', festtag: 'Nat', gattung1: 'Ant' },
            map
        );
        expect(doc.sourceId).toBe('Aa 13');
        expect(doc.initium).toBe('Puer');
        expect(doc.genre1).toBe('Ant');
    });
});

describe('monodiDatabaseToSources', () => {
    it('attaches documents to their owning source', () => {
        const sources = monodiDatabaseToSources({
            sources: [source],
            documents: [{ id: 'd1', quelle_id: 'src-1', textinitium: 'Puer' }]
        });
        expect(sources).toHaveLength(1);
        expect(sources[0].documents).toHaveLength(1);
        expect(sources[0].documents[0].initium).toBe('Puer');
    });
});

describe('round trip', () => {
    it('preserves catalogue fields monodi owns when pushing back', () => {
        const normalized = createSource('Aa 13', {
            metadata: { place: 'Reichenau' },
            iiifManifestUrl: 'https://example.org/manifest.json',
            equivalents: [{ pattern: '*u', refId: '12', notes: '' }],
            regions: [{ id: 'r1', name: 'l1', points: '0,0', folio: '1r' }],
            items: [{ id: 'i1', regionId: 'r1', pattern: '*u', variant: 'a', points: '0,0' }]
        });
        const existing = { id: 'src-1', quellensigle: 'Aa 13', bibliothek: 'Karlsruhe BLB' };
        const back = normalizedSourceToMonodi(normalized, existing);

        expect(back.id).toBe('src-1');
        expect(back.bibliothek).toBe('Karlsruhe BLB');
        expect(back.herkunftsort).toBe('Reichenau');
        expect(back.equivalents[0].refId).toBe('12');
        expect(back.annotationItems[0].variant).toBe('a');
    });
});

describe('pushing onto a record monodi.app already holds', () => {
    const existing = {
        id: 'src-1',
        quellensigle: 'Aa 13',
        equivalents: [{ pattern: '*', refId: '1' }],
        annotationRegions: [
            { id: 'r1', name: 'l1', points: '0,0', folio: '1r', lineUUID: 'u1' },
            { id: 'r-monodi', name: 'l2', points: '0,0', folio: '1r', lineUUID: 'u2' },
            { id: 'r-plain', name: 'l3', points: '0,0', folio: '1r' }
        ],
        annotationItems: [
            { id: 'i-monodi', regionId: 'r-monodi', pattern: '*', points: '0,0', uuid: 'n9' },
            { id: 'i-plain', regionId: 'r-plain', pattern: '*', points: '0,0' }
        ]
    };

    it('leaves equivalents, regions and items alone when this app has none for the source', () => {
        const back = normalizedSourceToMonodi(createSource('Aa 13', { iiifManifestUrl: 'https://x/m.json' }), existing);
        expect(back.equivalents).toEqual(existing.equivalents);
        expect(back.annotationRegions).toEqual(existing.annotationRegions);
        expect(back.annotationItems).toEqual(existing.annotationItems);
        expect(back.iiifManifestUrl).toBe('https://x/m.json');
    });

    it('replaces them with this app\'s version when it has some, keeping what only monodi.app creates', () => {
        const back = normalizedSourceToMonodi(createSource('Aa 13', {
            regions: [{ id: 'r1', name: 'l1', points: '1,1', folio: '1r', lineUUID: 'u1' }],
            items: [{ id: 'i1', regionId: 'r1', pattern: '*u', points: '2,2' }]
        }), existing);
        // r-plain is gone (this app's version wins); the line-linked r-monodi survives
        expect(back.annotationRegions.map(r => r.id)).toEqual(['r1', 'r-monodi']);
        expect(back.annotationRegions[0].points).toBe('1,1');
        // i-plain is gone; the note-linked i-monodi survives because its region does
        expect(back.annotationItems.map(i => i.id)).toEqual(['i1', 'i-monodi']);
    });
});
