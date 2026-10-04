import { resolveSharedTransport } from '../sync/sharedDataChannel';

/**
 * Supplies the overview with its source directory and metadata.
 *
 * The static provider reads the built `index.json` and is always available — it
 * is the guaranteed fallback that keeps the app working with no repository and
 * no network. The shared provider pulls live metadata (bibliographic documents,
 * catalogue fields, IIIF manifests) from monodi.app and, when it succeeds, is
 * layered on top: the frequency statistics stay with the static build, while
 * the filterable metadata comes from the shared source of truth.
 */

export class LegacyStaticProvider {
    async load() {
        const res = await fetch(`index.json?t=${Date.now()}`);
        if (!res.ok) throw new Error('Failed to load data index');
        const json = await res.json();
        return {
            stats: json.stats || {},
            glyphs: json.glyphs || {},
            manifests: json.manifests || {},
            overallMax: json.overallMax || 0,
            sourceFolios: json.sourceFolios || {},
            documents: [],
            sourceMeta: {}
        };
    }
}

export class SharedMetadataProvider {
    constructor(transport) {
        this.transport = transport;
    }

    async load() {
        const dataset = await this.transport.pull();
        if (!dataset) return null;

        const manifests = {};
        const sourceMeta = {};
        const documents = [];

        for (const source of dataset.sources) {
            if (source.iiifManifestUrl) manifests[source.id] = { url: source.iiifManifestUrl };
            if (Object.keys(source.metadata).length > 0) sourceMeta[source.id] = { ...source.metadata };
            documents.push(...source.documents);
        }

        return { manifests, sourceMeta, documents };
    }
}

function mergeMetadata(base, shared) {
    if (!shared) return { ...base, metadataSource: 'static' };
    return {
        ...base,
        manifests: { ...base.manifests, ...shared.manifests },
        sourceMeta: { ...base.sourceMeta, ...shared.sourceMeta },
        documents: shared.documents.length ? shared.documents : base.documents,
        metadataSource: shared.documents.length || Object.keys(shared.sourceMeta).length ? 'shared' : 'static'
    };
}

/**
 * Load the overview metadata, preferring live shared data but always returning
 * a usable result. A failure in the shared layer degrades to the static build
 * rather than surfacing as an error.
 */
export async function loadOverviewMetadata() {
    const base = await new LegacyStaticProvider().load();

    const transport = resolveSharedTransport();
    if (!transport) return mergeMetadata(base, null);

    try {
        const shared = await new SharedMetadataProvider(transport).load();
        return mergeMetadata(base, shared);
    } catch {
        return mergeMetadata(base, null);
    }
}

/**
 * Group documents into the axes the overview filters on. Each axis maps a value
 * to the set of source ids that carry it, so a picked value narrows the visible
 * sources without a second pass over the documents.
 */
export function buildMetadataFacets(documents) {
    const facets = {
        initium: new Map(),
        feast: new Map(),
        genre: new Map(),
        source: new Map()
    };

    const add = (facet, value, sourceId) => {
        if (!value) return;
        if (!facet.has(value)) facet.set(value, new Set());
        facet.get(value).add(sourceId);
    };

    for (const doc of documents || []) {
        add(facets.initium, doc.initium, doc.sourceId);
        add(facets.feast, doc.feast, doc.sourceId);
        add(facets.genre, doc.genre1, doc.sourceId);
        add(facets.source, doc.sourceId, doc.sourceId);
    }

    return facets;
}
