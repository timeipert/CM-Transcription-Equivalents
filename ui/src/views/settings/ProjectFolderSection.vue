<script setup>
import { useWorkspaceStorage } from '../../composables/useWorkspaceStorage';

const storage = useWorkspaceStorage();
// Refs must be top-level bindings for the template to unwrap them.
const { folderName, status: saveStatus, lastError: saveError, lastSavedAt, notice: saveNotice, readOnly: saveReadOnly } = storage;
</script>

<template>
    <div class="card section settings-card" v-if="storage.isSupported">
            <h2>Project Folder (Permanent Storage)</h2>
            <p class="desc">Save your workspace permanently to a local folder. Changes will autosave automatically.</p>
        
            <div class="folder-status-panel">
                <div class="folder-info">
                    <strong>Current Folder:</strong> 
                    <span v-if="folderName" class="folder-name">{{ folderName }}</span>
                    <span v-else class="text-muted">None selected</span>
                </div>
            
                <div class="sync-status" v-if="folderName">
                    <span v-if="saveStatus === 'saving'" class="status-saving">Saving...</span>
                    <span v-else-if="saveStatus === 'saved'" class="status-saved">✓ Saved {{ lastSavedAt }}</span>
                    <span v-else-if="saveStatus === 'error'" class="status-error">⚠ {{ saveError }}</span>
                </div>
            </div>

            <p v-if="saveNotice" class="folder-notice">
                {{ saveNotice }}
                <button class="btn-text" @click="storage.dismissNotice()">Dismiss</button>
            </p>

            <div class="folder-actions mt-10">
                <button @click="storage.chooseFolder()" class="btn-primary">
                    {{ folderName ? 'Change Folder' : 'Select Folder' }}
                </button>
                <button v-if="saveStatus === 'error' && folderName && !saveReadOnly" @click="storage.reGrantPermission()" class="btn-secondary">
                    Re-grant Permission
                </button>
                <button v-if="folderName && !saveReadOnly" @click="storage.saveWorkspace()" class="btn-secondary">
                    Save Now
                </button>
            </div>
        </div>
</template>

<style scoped>
.folder-status-panel { background: var(--color-bg); padding: 15px; border-radius: 8px; border: 1px solid var(--color-border); margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
.folder-name { font-family: monospace; background: var(--color-surface); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border); font-size: 13px; }
.sync-status { font-size: 13px; font-weight: 500; }
.status-saving { color: var(--color-text-muted); }
.status-saved { color: var(--color-primary); }
.status-error { color: var(--color-danger); }
.folder-notice { margin: 10px 0 0; padding: 8px 12px; border-radius: 6px; font-size: 12px; line-height: 1.5; background: var(--color-primary-light); color: var(--color-text); }
.folder-notice .btn-text { margin-left: 8px; background: none; border: none; color: var(--color-primary-hover); cursor: pointer; font-size: 12px; font-weight: 600; }
.folder-actions { display: flex; gap: 10px; }
</style>
