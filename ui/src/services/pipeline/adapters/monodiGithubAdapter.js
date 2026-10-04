import { createDataset } from '../normalizedModel';
import { monodiDatabaseToSources } from '../../sync/monodiSchema';

/**
 * Ingests a database pulled from the shared monodi.app repository
 * ({ sources, documents, notes, settings }) into the normalized model.
 */
export const monodiGithubAdapter = {
    id: 'monodi-github',

    detect(input) {
        return !!input
            && typeof input === 'object'
            && Array.isArray(input.sources)
            && Array.isArray(input.documents)
            && 'notes' in input;
    },

    ingest(input) {
        const dataset = createDataset('monodi-github');
        dataset.sources = monodiDatabaseToSources(input);
        dataset.settings = input.settings || null;
        return dataset;
    }
};
