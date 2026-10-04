import { createDataset, createSource } from '../normalizedModel';

/**
 * Ingests the statically built `index.json` — the artefact the Python analysis
 * writes into `public/` — into the normalized model.
 *
 * This is the compatibility path: it produces a source directory with IIIF
 * manifests so the app keeps working with no shared repository at all. The
 * pattern-frequency statistics and glyph tables are not part of the normalized
 * model; they are carried verbatim on `dataset.stats`/`dataset.glyphs` so the
 * metadata provider can still surface them.
 */
export const legacyStaticAdapter = {
    id: 'legacy-static',

    detect(input) {
        return !!input
            && typeof input === 'object'
            && ('sourceFolios' in input || 'manifests' in input)
            && 'stats' in input;
    },

    ingest(input) {
        const dataset = createDataset('legacy-static');
        const manifests = input.manifests || {};
        const sourceFolios = input.sourceFolios || {};

        const ids = new Set([...Object.keys(sourceFolios), ...Object.keys(manifests)]);
        for (const id of ids) {
            const source = createSource(id);
            const manifest = manifests[id];
            if (manifest && manifest.url) source.iiifManifestUrl = manifest.url;
            dataset.sources.push(source);
        }

        dataset.stats = input.stats || {};
        dataset.glyphs = input.glyphs || {};
        dataset.overallMax = input.overallMax || 0;
        dataset.sourceFolios = sourceFolios;
        dataset.manifests = manifests;
        return dataset;
    }
};
