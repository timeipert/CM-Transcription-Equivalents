/**
 * The real manifests of the corpus, turned into the page lists the app works
 * with: fixtures/iiif/corpus-manifests.json keeps each canvas's raw label and
 * whether it has an image; this rebuilds a minimal manifest of the same version
 * and runs it through the app's own parser and the source's label rule.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseManifest } from '../../services/iiif/manifestParser';
import { labelRuleFor } from '../../config/iiifRules';

const fixturePath = fileURLToPath(new URL('../fixtures/iiif/corpus-manifests.json', import.meta.url));

/** @returns {Object<string, { url: string, version: number, canvases: Array, dataFolios: string[] }>} */
export function loadCorpus() {
    return JSON.parse(readFileSync(fixturePath, 'utf8')).sources;
}

/** A minimal manifest with the given canvases, in the manifest's own version. */
export function minimalManifest(source, { version, canvases }) {
    if (version === 3) {
        return {
            '@context': 'http://iiif.io/api/presentation/3/context.json',
            items: canvases.map(([label, image], i) => ({
                label,
                items: image ? [{ items: [{ body: { service: [{ id: `https://img.test/${encodeURIComponent(source)}/${i}` }] } }] }] : []
            }))
        };
    }
    return {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        sequences: [{
            canvases: canvases.map(([label, image], i) => ({
                label,
                images: image ? [{ resource: { service: { '@id': `https://img.test/${encodeURIComponent(source)}/${i}` } } }] : []
            }))
        }]
    };
}

/** The parsed pages for one corpus manuscript, exactly as the app would have them. */
export function corpusPages(source, entry) {
    return parseManifest(minimalManifest(source, entry), { labelRule: labelRuleFor(source) });
}
