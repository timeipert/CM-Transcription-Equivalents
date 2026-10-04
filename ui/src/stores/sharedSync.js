import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { GithubClient, loadGithubConfig, saveGithubConfig } from '../services/sync/githubClient';
import { GithubTransport, FileTransport } from '../services/sync/sharedDataChannel';
import { createDefaultPipeline } from '../services/pipeline/dataPipeline';
import { toWorkspaceState } from '../services/pipeline/normalizedModel';
import { useDataManagement } from '../composables/useDataManagement';
import { useSettingsStore } from './settings';
import { SCHEMA_VERSION } from '../services/persistence/workspaceSchema';
import { listSources } from '../utils/workspaceSharing';

const CONNECT_STORAGE_KEY = 'monodi_github_connected';

/**
 * Orchestrates the shared-repository bridge for the settings UI: holds the
 * connection form, runs pull/push against monodi.app's repository, and offers
 * the same database as a downloadable file. Pulled data is applied through the
 * existing import/merge machinery so it follows the same conflict rules as a
 * manual backup import.
 */
export const useSharedSyncStore = defineStore('sharedSync', () => {
    const stored = loadGithubConfig();
    const config = ref(stored || { token: '', owner: '', repo: '', branch: 'main' });
    const connected = ref(sessionStorage.getItem(CONNECT_STORAGE_KEY) === 'true');
    const status = ref('idle'); // 'idle' | 'testing' | 'pulling' | 'pushing' | 'ok' | 'error'
    const message = ref('');
    const lastSyncedAt = ref(null);

    const isConfigured = computed(() =>
        !!(config.value.token && config.value.owner && config.value.repo && config.value.branch));

    function transport() {
        return new GithubTransport(new GithubClient({ ...config.value }));
    }

    function persistConfig() {
        saveGithubConfig({ ...config.value });
    }

    function markConnected(value) {
        connected.value = value;
        if (value) sessionStorage.setItem(CONNECT_STORAGE_KEY, 'true');
        else sessionStorage.removeItem(CONNECT_STORAGE_KEY);
    }

    async function connect() {
        status.value = 'testing';
        message.value = '';
        persistConfig();
        try {
            const ok = await transport().client.testConnection();
            markConnected(ok);
            status.value = ok ? 'ok' : 'error';
            message.value = ok
                ? 'Connected to the shared repository.'
                : 'Connection failed — check the token, owner, repository and branch.';
            return ok;
        } catch (e) {
            markConnected(false);
            status.value = 'error';
            message.value = e.message || 'Connection failed.';
            return false;
        }
    }

    function disconnect() {
        markConnected(false);
        status.value = 'idle';
        message.value = '';
    }

    function currentDatasetInput() {
        const settings = useSettingsStore();
        const local = useDataManagement().getLocalFullState();
        return {
            schemaVersion: SCHEMA_VERSION,
            data: { ...local, settings: { sourceMeta: settings.sourceMeta } }
        };
    }

    function applyDataset(dataset) {
        const workspace = toWorkspaceState(dataset);
        const settings = useSettingsStore();
        // Per source, the repository's values win key by key; keys only this app has stay.
        const meta = { ...settings.sourceMeta };
        for (const [source, values] of Object.entries(workspace.sourceMeta)) {
            meta[source] = { ...meta[source], ...values };
        }
        settings.sourceMeta = meta;

        // 'merge': a pull adds to and updates what is here, and removes nothing (the
        // push is the same the other way round, so neither direction deletes work).
        const data = {
            personalTables: workspace.personalTables,
            regions: workspace.regions,
            regionItems: workspace.regionItems,
            manualLines: workspace.manualLines,
            iiifLinks: workspace.iiifLinks
        };
        const choices = Object.fromEntries(listSources(data).map(source => [source, 'merge']));
        useDataManagement().executeImport(
            { schemaVersion: SCHEMA_VERSION, data },
            choices,
            { importSettings: false }
        );
        return workspace;
    }

    async function pull() {
        if (!isConfigured.value) return false;
        status.value = 'pulling';
        message.value = '';
        try {
            const dataset = await transport().pull();
            if (!dataset) throw new Error('Could not read the repository.');
            const workspace = applyDataset(dataset);
            markConnected(true);
            status.value = 'ok';
            lastSyncedAt.value = new Date().toLocaleTimeString();
            message.value = `Pulled ${dataset.sources.length} source(s), ${workspace.documents.length} document(s).`;
            return true;
        } catch (e) {
            status.value = 'error';
            message.value = e.message || 'Pull failed.';
            return false;
        }
    }

    async function push() {
        if (!isConfigured.value) return false;
        status.value = 'pushing';
        message.value = '';
        try {
            const pipeline = createDefaultPipeline();
            const dataset = await pipeline.ingest(currentDatasetInput(), 'monodi-backup');
            const { files } = await transport().push(dataset, 'Update from neume viewer');
            markConnected(true);
            status.value = 'ok';
            lastSyncedAt.value = new Date().toLocaleTimeString();
            message.value = files
                ? `Pushed ${files} changed file(s) (${dataset.sources.length} source(s) checked).`
                : 'Nothing to push: the repository already has these edits.';
            return true;
        } catch (e) {
            status.value = 'error';
            message.value = e.message || 'Push failed.';
            return false;
        }
    }

    async function exportFile() {
        const pipeline = createDefaultPipeline();
        const dataset = await pipeline.ingest(currentDatasetInput(), 'monodi-backup');
        const db = new FileTransport().serialize(dataset);
        const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `monodi-database-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function importFile(file) {
        status.value = 'pulling';
        message.value = '';
        try {
            const text = await file.text();
            const dataset = await createDefaultPipeline().ingest(JSON.parse(text), 'monodi-github');
            const workspace = applyDataset(dataset);
            status.value = 'ok';
            message.value = `Imported ${dataset.sources.length} source(s), ${workspace.documents.length} document(s).`;
            return true;
        } catch (e) {
            status.value = 'error';
            message.value = e.message || 'Import failed — is this a monodi database file?';
            return false;
        }
    }

    return {
        config,
        connected,
        status,
        message,
        lastSyncedAt,
        isConfigured,
        connect,
        disconnect,
        pull,
        push,
        exportFile,
        importFile
    };
});
