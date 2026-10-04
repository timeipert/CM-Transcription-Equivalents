import { createSource } from '../pipeline/normalizedModel';

/**
 * Translation between the monodi.app database schema and the normalized model.
 *
 * monodi.app is the metadata source of truth. Its repository holds one JSON file
 * per source under `sources/`, one per document under `documents/`, and a global
 * `settings.json`. A source already embeds the equivalents table and the neume
 * annotation regions and items that this app edits, so the mapping is a field
 * rename rather than a reconstruction. Documents contribute the bibliographic
 * axis the overview filters on (initium, feast, genre).
 */

const SOURCE_METADATA_FIELDS = {
    quellensigle: 'siglum',
    herkunftsregion: 'region',
    herkunftsort: 'place',
    herkunftsinstitution: 'institution',
    ordenstradition: 'tradition',
    quellentyp: 'type',
    bibliotheksort: 'libraryPlace',
    bibliothek: 'library',
    bibliothekssignatur: 'shelfmark',
    datierung: 'date',
    kommentar: 'comment'
};

function sourceKey(source) {
    return source.quellensigle || source.id || '';
}

export function monodiSourceToNormalized(source) {
    const id = sourceKey(source);
    const normalized = createSource(id);
    normalized.iiifManifestUrl = source.iiifManifestUrl || '';

    for (const [monodiField, metaKey] of Object.entries(SOURCE_METADATA_FIELDS)) {
        const value = source[monodiField];
        if (value) normalized.metadata[metaKey] = value;
    }
    if (source.custom) {
        for (const [key, value] of Object.entries(source.custom)) {
            if (value) normalized.metadata[key] = value;
        }
    }

    normalized.equivalents = (source.equivalents || []).map(e => ({
        pattern: e.pattern,
        refId: e.refId,
        notes: e.notes || ''
    }));

    normalized.regions = (source.annotationRegions || []).map(r => ({
        id: r.id,
        name: r.name,
        points: r.points,
        folio: r.folio,
        lineUUID: r.lineUUID
    }));

    normalized.items = (source.annotationItems || []).map(i => ({
        id: i.id,
        regionId: i.regionId,
        pattern: i.pattern,
        variant: i.variant || '',
        points: i.points,
        uuid: i.uuid
    }));

    return normalized;
}

export function monodiDocumentToNormalized(doc, sourceIdBySourceId) {
    const sourceId = sourceIdBySourceId.get(doc.quelle_id) || doc.quelle_id || '';
    return {
        id: doc.id,
        sourceId,
        documentId: doc.dokumenten_id || '',
        initium: doc.textinitium || '',
        feast: doc.festtag || '',
        occasion: doc.feier || '',
        genre1: doc.gattung1 || '',
        genre2: doc.gattung2 || '',
        folioStart: doc.foliostart || '',
        lineStart: doc.zeilenstart || '',
        reference: doc.bibliographischerverweis || '',
        edition: doc.druckausgabe || '',
        editionStatus: doc.editionsstatus || '',
        comment: doc.kommentar || ''
    };
}

/**
 * Build the normalized source list from a pulled monodi database
 * `{ sources, documents, notes, settings }`. Documents are attached to their
 * source by `quelle_id`.
 */
export function monodiDatabaseToSources(db) {
    const idByMonodiId = new Map();
    const normalizedById = new Map();

    for (const source of db.sources || []) {
        const normalized = monodiSourceToNormalized(source);
        if (source.id) idByMonodiId.set(source.id, normalized.id);
        normalizedById.set(normalized.id, normalized);
    }

    for (const doc of db.documents || []) {
        const normalizedDoc = monodiDocumentToNormalized(doc, idByMonodiId);
        const owner = normalizedById.get(normalizedDoc.sourceId);
        if (owner) owner.documents.push(normalizedDoc);
    }

    return [...normalizedById.values()];
}

/**
 * Reverse projection: a single normalized source back into the monodi source
 * shape, so this app can push its edits into the shared repository. `existing`
 * lets an earlier pulled record keep the catalogue fields monodi owns and this
 * app never touches.
 */
export function normalizedSourceToMonodi(source, existing = {}) {
    const out = { ...existing };
    out.id = existing.id || source.id;
    out.quellensigle = existing.quellensigle || source.id;

    for (const [monodiField, metaKey] of Object.entries(SOURCE_METADATA_FIELDS)) {
        if (source.metadata[metaKey] !== undefined) out[monodiField] = source.metadata[metaKey];
    }

    if (source.iiifManifestUrl) out.iiifManifestUrl = source.iiifManifestUrl;

    // The arrays below are replaced by this app's version, with two protections
    // so that a push cannot wipe what monodi.app holds and this app never saw:
    // nothing is replaced when this app has nothing for it, and what only
    // monodi.app creates — regions linked to a transcription line (`lineUUID`) and
    // items linked to a note (`uuid`) — is kept even if this app lacks it.
    if (source.equivalents.length) {
        out.equivalents = source.equivalents.map(e => ({
            pattern: e.pattern,
            refId: e.refId,
            notes: e.notes || ''
        }));
    }

    if (source.regions.length || source.items.length) {
        const regions = source.regions.map(r => ({
            id: r.id,
            name: r.name,
            points: r.points,
            folio: r.folio,
            lineUUID: r.lineUUID
        }));
        const regionIds = new Set(regions.map(r => r.id));
        for (const r of existing.annotationRegions || []) {
            if (r.lineUUID && !regionIds.has(r.id)) {
                regions.push(r);
                regionIds.add(r.id);
            }
        }

        const items = source.items.map(i => ({
            id: i.id,
            regionId: i.regionId,
            pattern: i.pattern,
            variant: i.variant || '',
            points: i.points,
            uuid: i.uuid
        }));
        const itemIds = new Set(items.map(i => i.id));
        for (const i of existing.annotationItems || []) {
            if (i.uuid && !itemIds.has(i.id) && regionIds.has(i.regionId)) items.push(i);
        }

        out.annotationRegions = regions;
        out.annotationItems = items;
    }

    return out;
}
