<script setup>
import { ref } from 'vue';
import { useSharedSyncStore } from '../stores/sharedSync';

const sync = useSharedSyncStore();
const showToken = ref(false);
const fileInput = ref(null);

async function onImportFile(event) {
    const file = event.target.files?.[0];
    if (file) await sync.importFile(file);
    event.target.value = '';
}
</script>

<template>
<div class="card section">
    <h2>Shared Sync (monodi.app)</h2>
    <p class="desc">
        Connect the GitHub repository your project shares with monodi.app. Pulling brings in the
        source catalogue, equivalents and annotations; pushing writes your edits back for everyone.
        The fields are the same as in monodi.app, but each app keeps its own copy of the connection, so enter it here once.
    </p>

    <div class="sync-grid">
        <label class="sync-field">
            <span>Owner</span>
            <input v-model="sync.config.owner" class="text-input" placeholder="timeipert" autocomplete="off">
        </label>
        <label class="sync-field">
            <span>Repository</span>
            <input v-model="sync.config.repo" class="text-input" placeholder="corpus-monodicum" autocomplete="off">
        </label>
        <label class="sync-field">
            <span>Branch</span>
            <input v-model="sync.config.branch" class="text-input" placeholder="main" autocomplete="off">
        </label>
        <label class="sync-field">
            <span>Access token</span>
            <span class="token-row">
                <input
                    v-model="sync.config.token"
                    :type="showToken ? 'text' : 'password'"
                    class="text-input"
                    placeholder="github_pat_…"
                    autocomplete="off"
                    spellcheck="false"
                >
                <button type="button" class="btn-secondary btn-reveal" @click="showToken = !showToken">
                    {{ showToken ? 'Hide' : 'Show' }}
                </button>
            </span>
        </label>
    </div>

    <p class="token-hint">
        A fine-grained personal access token with read/write <em>Contents</em> permission on that repository.
        It is stored only in this browser and sent directly to GitHub.
    </p>

    <div class="sync-actions">
        <button class="btn-primary" :disabled="!sync.isConfigured || sync.status === 'testing'" @click="sync.connect()">
            {{ sync.connected ? 'Reconnect' : 'Connect' }}
        </button>
        <button class="btn-secondary" :disabled="!sync.isConfigured || sync.status === 'pulling'" @click="sync.pull()">
            Pull from repository
        </button>
        <button class="btn-secondary" :disabled="!sync.isConfigured || sync.status === 'pushing'" @click="sync.push()">
            Push to repository
        </button>
        <button v-if="sync.connected" class="btn-link" @click="sync.disconnect()">Disconnect</button>
    </div>

    <div class="sync-status-line" :class="sync.status">
        <span v-if="sync.status === 'testing'">Testing connection…</span>
        <span v-else-if="sync.status === 'pulling'">Pulling…</span>
        <span v-else-if="sync.status === 'pushing'">Pushing…</span>
        <span v-else-if="sync.message">{{ sync.message }}</span>
        <span v-else-if="sync.connected" class="ok">Connected.</span>
        <span v-else class="muted">Not connected.</span>
        <span v-if="sync.lastSyncedAt" class="muted"> · last sync {{ sync.lastSyncedAt }}</span>
    </div>

    <div class="sync-file">
        <h3 class="mt-0">Offline file</h3>
        <p class="text-sm-muted-mt0">
            Exchange the same database as a single file when there is no repository — it imports into monodi.app too.
        </p>
        <div class="sync-actions">
            <button class="btn-secondary" @click="sync.exportFile()">Export database file</button>
            <button class="btn-secondary" @click="fileInput.click()">Import database file</button>
            <input ref="fileInput" type="file" accept="application/json,.json" class="hidden-file" @change="onImportFile">
        </div>
    </div>
</div>
</template>

<style scoped>
.sync-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-top: 10px;
}
.sync-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    color: var(--color-text-muted, #666);
}
.text-input {
    width: 100%;
    box-sizing: border-box;
}
.token-row {
    display: flex;
    gap: 6px;
}
.btn-reveal {
    flex: 0 0 auto;
}
.token-hint {
    font-size: 0.8rem;
    color: var(--color-text-muted, #666);
    margin: 10px 0 0;
}
.sync-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
    align-items: center;
}
.btn-link {
    background: none;
    border: none;
    color: var(--color-danger, #c0392b);
    cursor: pointer;
    text-decoration: underline;
    padding: 4px;
}
.sync-status-line {
    margin-top: 12px;
    font-size: 0.88rem;
}
.sync-status-line.error { color: var(--color-danger, #c0392b); }
.sync-status-line.ok { color: var(--color-success, #2e7d32); }
.sync-status-line .ok { color: var(--color-success, #2e7d32); }
.sync-status-line .muted { color: var(--color-text-muted, #888); }
.sync-file {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--color-border, #ddd);
}
.hidden-file {
    display: none;
}
</style>
