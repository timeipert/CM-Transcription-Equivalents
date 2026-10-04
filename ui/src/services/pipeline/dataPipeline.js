import { mergeDatasets, toWorkspaceState } from './normalizedModel';
import { ommr4allAdapter } from './adapters/ommr4allAdapter';
import { monodiBackupAdapter } from './adapters/monodiBackupAdapter';
import { monodiGithubAdapter } from './adapters/monodiGithubAdapter';
import { legacyStaticAdapter } from './adapters/legacyStaticAdapter';

/**
 * A single entry point for every data stream the app ingests.
 *
 * Each adapter declares what it recognizes (`detect`) and how it maps its input
 * into the normalized model (`ingest`). The service picks the first adapter
 * that claims an input, so callers hand over a payload without needing to know
 * which format it is. Adapter order is precedence: the more specific formats
 * are registered ahead of the more permissive backup envelope.
 */
export class DataPipelineService {
    constructor(adapters = []) {
        this.adapters = [...adapters];
    }

    register(adapter) {
        this.adapters.push(adapter);
        return this;
    }

    adapterFor(input) {
        return this.adapters.find(adapter => {
            try {
                return adapter.detect(input);
            } catch {
                return false;
            }
        }) || null;
    }

    /**
     * Normalize one payload. `hint` forces a specific adapter by id, bypassing
     * detection for callers that already know the format.
     */
    async ingest(input, hint = null) {
        const adapter = hint
            ? this.adapters.find(a => a.id === hint)
            : this.adapterFor(input);
        if (!adapter) throw new Error('No pipeline adapter accepted the input.');
        const dataset = await adapter.ingest(input);
        dataset.origin = adapter.id;
        return dataset;
    }

    /** Normalize and combine several payloads into one dataset. */
    async ingestMany(inputs) {
        const datasets = [];
        for (const entry of inputs) {
            const { input, hint } = normalizeEntry(entry);
            datasets.push(await this.ingest(input, hint));
        }
        return mergeDatasets(datasets);
    }
}

function normalizeEntry(entry) {
    if (entry && typeof entry === 'object' && 'input' in entry) {
        return { input: entry.input, hint: entry.hint || null };
    }
    return { input: entry, hint: null };
}

export function createDefaultPipeline() {
    return new DataPipelineService([
        ommr4allAdapter,
        monodiGithubAdapter,
        legacyStaticAdapter,
        monodiBackupAdapter
    ]);
}

export { toWorkspaceState, mergeDatasets };
