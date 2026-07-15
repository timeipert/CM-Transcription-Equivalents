<script setup>
import { useRouter, useRoute } from 'vue-router';
import { useWorkspaceStorage } from '../composables/useWorkspaceStorage';

const router = useRouter();
const route = useRoute();
const storage = useWorkspaceStorage();

async function handleChooseFolder() {
    await storage.chooseFolder();
    if (storage.folderName.value) {
        continueToApp();
    }
}

function handleBypass() {
    storage.bypassStorage();
    continueToApp();
}

function continueToApp() {
    const redirect = route.query.redirect || '/';
    router.replace(redirect);
}
</script>

<template>
<div class="setup-view">
    <div class="setup-card">
        <h1>Welcome to CM Transcription</h1>
        <p class="subtitle">Set up your workspace to continue.</p>

        <div v-if="storage.isSupported" class="supported-section">
            <p>This project needs a folder to save your work permanently. All annotations, tables, and settings will automatically sync to a <code>workspace.json</code> file in your chosen folder.</p>
            
            <div class="actions">
                <button @click="handleChooseFolder" class="btn-primary btn-large">Choose Folder</button>
                <button @click="handleBypass" class="btn-text">Continue without a folder</button>
            </div>
            
            <p v-if="storage.lastError" class="error-msg">⚠ {{ storage.lastError }}</p>
        </div>
        
        <div v-else class="unsupported-section">
            <p>Your browser does not support the File System Access API (e.g., Firefox or Safari). We cannot bind a local folder for automatic saving.</p>
            <p>Your data will be saved to your browser's local storage instead. <strong>Please remember to manually export your data regularly via the Settings page!</strong></p>
            
            <div class="actions">
                <button @click="handleBypass" class="btn-primary btn-large">Continue</button>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.setup-view {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
    background: var(--color-bg);
    padding: 20px;
}
.setup-card {
    background: white;
    padding: 40px;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    max-width: 500px;
    text-align: center;
}
h1 { margin-top: 0; color: var(--color-text); margin-bottom: 10px; }
.subtitle { color: var(--color-text-muted); font-size: 1.1em; margin-bottom: 30px; }
p { line-height: 1.5; color: var(--color-text); margin-bottom: 20px; text-align: left; }

.actions { display: flex; flex-direction: column; gap: 15px; margin-top: 30px; }
.btn-large { padding: 12px 24px; font-size: 1.1em; border-radius: 8px; font-weight: 600; cursor: pointer; }
.btn-text { background: transparent; border: none; color: var(--color-text-muted); text-decoration: underline; cursor: pointer; font-size: 1em; }
.btn-text:hover { color: var(--color-text); }
.error-msg { color: var(--color-danger); margin-top: 15px; text-align: center; font-weight: 600; }
</style>
