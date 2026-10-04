import { createDataset, createSource } from '../normalizedModel';
import { parseOmmrPcgts } from '../../../utils/ommrParser';

/**
 * Ingests an OMMR4all export into the normalized model. The input is one
 * source's folios, each holding a parsed pcgts.json:
 *
 *   { source: string, folios: { [folio]: pcgtsJson } }
 *
 * A staff line becomes a region and every extracted neume becomes an item
 * inside it, so an OMMR import lands in the same structure as a manual
 * annotation or a monodi pull.
 */
export const ommr4allAdapter = {
    id: 'ommr4all',

    detect(input) {
        return !!input
            && typeof input === 'object'
            && typeof input.source === 'string'
            && !!input.folios
            && typeof input.folios === 'object';
    },

    ingest(input) {
        const dataset = createDataset('ommr4all');
        const source = createSource(input.source);
        dataset.sources.push(source);

        for (const [folio, pcgts] of Object.entries(input.folios)) {
            const { snippets, lines } = parseOmmrPcgts(input.source, folio, pcgts);

            for (const line of lines) {
                source.regions.push({
                    id: line.id,
                    name: '',
                    points: bboxToPolygon(line.bbox),
                    folio,
                    lineUUID: undefined
                });
            }

            for (const snippet of snippets) {
                source.items.push({
                    id: snippet.id,
                    regionId: snippet.lineId,
                    pattern: snippet.pattern,
                    variant: '',
                    points: snippet.points,
                    uuid: undefined
                });
            }
        }

        return dataset;
    }
};

function bboxToPolygon(bbox) {
    if (!bbox) return '';
    const { x, y, w, h } = bbox;
    const round = n => (+n).toFixed(2);
    return `${round(x)},${round(y)} ${round(x + w)},${round(y)} ${round(x + w)},${round(y + h)} ${round(x)},${round(y + h)}`;
}
