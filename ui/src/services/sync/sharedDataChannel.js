import { GithubClient, loadGithubConfig } from './githubClient';
import { monodiDatabaseToSources, normalizedSourceToMonodi } from './monodiSchema';
import { createDefaultPipeline } from '../pipeline/dataPipeline';
import { createDataset } from '../pipeline/normalizedModel';

/**
 * The serverless bridge to monodi.app. Two transports carry the same normalized
 * dataset:
 *
 *   - GithubTransport talks to the shared repository monodi.app already writes,
 *     so edits made here reach every other client that pulls it.
 *   - FileTransport reads and writes the same database as a single JSON file,
 *     for when there is no repository (or no network) — the manual export the
 *     user asked to keep alongside the live sync.
 *
 * Both speak monodi's `{ sources, documents, notes, settings }` database, so a
 * file exported here imports into monodi.app and vice versa.
 */

export class GithubTransport {
    constructor(client) {
        this.client = client;
    }

    get isConfigured() {
        return this.client.isConfigured;
    }

    async pull() {
        const db = await this.client.pullDatabase();
        if (!db) return null;
        const dataset = createDataset('monodi-github');
        dataset.sources = monodiDatabaseToSources(db);
        dataset.settings = db.settings || null;
        dataset.raw = db;
        return dataset;
    }

    /**
     * Write a dataset back, preserving the catalogue fields monodi owns by
     * merging onto the records currently in the repository, in the layout the
     * repository already uses.
     * @returns {Promise<{ sha: string, files: number }>}
     */
    async push(dataset, message = 'Update from neume viewer') {
        const current = await this.client.pullDatabase();
        // Not being able to read the repository is not the same as it being empty:
        // writing on top of an unknown state could put files where nothing reads them.
        if (!current) throw new Error('Could not read the repository, so nothing was pushed.');
        const next = mergeIntoMonodiDatabase(current, dataset);
        return this.client.pushDatabase({ ...next, layout: current.layout, bundles: current.bundles }, message);
    }
}

export class FileTransport {
    parse(json) {
        const db = typeof json === 'string' ? JSON.parse(json) : json;
        const dataset = createDataset('monodi-file');
        dataset.sources = monodiDatabaseToSources(db);
        dataset.settings = db.settings || null;
        dataset.raw = db;
        return dataset;
    }

    serialize(dataset, base = null) {
        const seed = base || { sources: [], documents: [], notes: {}, settings: dataset.settings || null };
        return mergeIntoMonodiDatabase(seed, dataset);
    }
}

/**
 * Fold a normalized dataset into an existing monodi database, keeping records
 * for sources the dataset does not mention and updating the ones it does.
 */
function mergeIntoMonodiDatabase(base, dataset) {
    const bySigle = new Map();
    for (const source of base.sources || []) {
        bySigle.set(source.quellensigle || source.id, source);
    }

    for (const source of dataset.sources || []) {
        const existing = bySigle.get(source.id) || {};
        bySigle.set(source.id, normalizedSourceToMonodi(source, existing));
    }

    return {
        sources: [...bySigle.values()],
        documents: base.documents || [],
        notes: base.notes || {},
        settings: dataset.settings || base.settings || null
    };
}

/**
 * Resolve the live transport for the current environment: the GitHub bridge
 * when a repository is configured, otherwise nothing. File import/export is
 * always available and does not depend on this.
 */
export function resolveSharedTransport() {
    const config = loadGithubConfig();
    if (config) {
        const client = new GithubClient(config);
        const transport = new GithubTransport(client);
        if (transport.isConfigured) return transport;
    }
    return null;
}

export function createFileTransport() {
    return new FileTransport();
}

/** Normalize an imported monodi database file through the shared pipeline. */
export function ingestSharedFile(json) {
    const pipeline = createDefaultPipeline();
    const db = typeof json === 'string' ? JSON.parse(json) : json;
    return pipeline.ingest(db, 'monodi-github');
}
