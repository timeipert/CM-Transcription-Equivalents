<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useSaveReminderStore } from '../stores/saveReminder';
import { useWorkspaceStorage } from '../composables/useWorkspaceStorage';
import { useDataManagement } from '../composables/useDataManagement';

const router = useRouter();
const reminder = useSaveReminderStore();
const {
    changeCount, hasUnsavedWork, shouldRemind, neverExported, sinceExportLabel
} = storeToRefs(reminder);
const { snooze, disableReminder } = reminder;

// Read through explicit computeds in the template: a bare destructured ref used
// directly in `v-if` is easy to get wrong (a Ref object is always truthy).
const showToast = computed(() => shouldRemind.value);
const changeCountText = computed(() => changeCount.value);
const sinceText = computed(() => sinceExportLabel.value);
const neverExportedFlag = computed(() => neverExported.value);

const storage = useWorkspaceStorage();
const storageStatus = storage.status;
const folderName = storage.folderName;
/** No folder bound means browser storage is the only copy of the work. */
const isBrowserOnly = computed(() => !folderName.value);

const { exportData } = useDataManagement();

/**
 * Status shown in the nav at all times, so "is my work safe?" never needs guessing.
 *  - folder bound  -> autosaving; the dot reflects the write status
 *  - browser only  -> the dot reflects whether an export exists for current work
 */
const state = computed(() => {
    if (folderName.value) {
        if (storageStatus.value === 'error') return { tone: 'bad', label: 'Save failed', detail: `Folder: ${folderName.value}` };
        if (storageStatus.value === 'saving') return { tone: 'busy', label: 'Saving…', detail: `Folder: ${folderName.value}` };
        return { tone: 'good', label: 'Autosaved', detail: `Folder: ${folderName.value}` };
    }
    if (!hasUnsavedWork.value) {
        // "Backed up" would be a lie when nothing was ever exported — there is simply
        // nothing at risk yet.
        return neverExported.value
            ? { tone: 'idle', label: 'No changes', detail: 'Nothing to back up yet' }
            : { tone: 'good', label: 'Backed up', detail: `Last export ${sinceExportLabel.value}` };
    }
    return {
        tone: shouldRemind.value ? 'bad' : 'warn',
        label: `${changeCount.value} unsaved change${changeCount.value === 1 ? '' : 's'}`,
        detail: neverExported.value ? 'Never exported' : `Last export ${sinceExportLabel.value}`
    };
});

function doExport() {
    // exportData resets the reminder itself, so every export path stays in sync.
    exportData({ includeSettings: true, onlyWithData: true });
}

function goToBackup() {
    router.push('/settings');
}
</script>

<template>
<div class="save-status-wrap">
    <!-- Always-visible status pill -->
    <button class="save-pill" :class="state.tone" @click="goToBackup" :title="state.detail">
        <span class="dot"></span>
        <span class="pill-label">{{ state.label }}</span>
    </button>

    <!-- Nudge: only when there is real work at risk -->
    <Transition name="slide-up">
        <div v-if="showToast" class="reminder-toast" role="status">
            <div class="toast-icon">💾</div>
            <div class="toast-body">
                <strong>Back up your work</strong>
                <p v-if="isBrowserOnly">
                    You have <strong>{{ changeCountText }}</strong> unsaved changes and
                    {{ neverExportedFlag ? 'have never exported' : `last exported ${sinceText}` }}.
                    Your work lives only in this browser — clearing site data would lose it.
                </p>
                <p v-else>
                    You have <strong>{{ changeCountText }}</strong> changes since your last export
                    ({{ sinceText }}). Your folder autosaves, but a JSON backup is a safer second copy.
                </p>
                <div class="toast-actions">
                    <button class="btn-primary" @click="doExport">Export backup now</button>
                    <button class="btn-quiet" @click="snooze">Later</button>
                    <button class="btn-quiet subtle" @click="disableReminder">Don't remind me</button>
                </div>
            </div>
        </div>
    </Transition>
</div>
</template>

<style scoped>
.save-status-wrap { display: contents; }

.save-pill {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 4px 11px; border-radius: 999px; cursor: pointer;
    border: 1px solid var(--color-border); background: var(--color-surface);
    font-size: 12px; font-weight: 600; color: var(--color-text-muted);
    white-space: nowrap; transition: all .15s;
}
.save-pill:hover { border-color: var(--color-border-hover); color: var(--color-text); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: currentColor; }
.save-pill.idle { color: var(--color-text-muted); }
.save-pill.good { color: #15803d; border-color: #bbf7d0; background: #f0fdf4; }
.save-pill.warn { color: #b45309; border-color: #fde68a; background: #fffbeb; }
.save-pill.bad  { color: #b91c1c; border-color: #fecaca; background: #fef2f2; }
.save-pill.busy { color: var(--color-primary-hover); border-color: var(--color-primary-light); background: var(--color-primary-light); }
.save-pill.busy .dot { animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }

.reminder-toast {
    position: fixed; bottom: 24px; right: 24px; z-index: 2000;
    width: 380px; max-width: calc(100vw - 32px);
    display: flex; gap: 14px; padding: 16px 18px;
    background: white; border: 1px solid var(--color-border);
    border-left: 4px solid var(--color-warning, #f59e0b);
    border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.15);
    text-align: left;
}
.toast-icon { font-size: 22px; line-height: 1; }
.toast-body { flex: 1; min-width: 0; }
.toast-body strong { display: block; margin-bottom: 4px; font-size: 14px; color: var(--color-text); }
.toast-body p { margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: var(--color-text-muted); }
.toast-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.btn-primary { background: var(--color-primary); color: white; border: none; padding: 7px 13px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; }
.btn-primary:hover { background: var(--color-primary-hover); }
.btn-quiet { background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 12px; font-weight: 600; padding: 7px 6px; }
.btn-quiet:hover { color: var(--color-text); text-decoration: underline; }
.btn-quiet.subtle { margin-left: auto; opacity: .75; font-weight: 500; }

.slide-up-enter-active, .slide-up-leave-active { transition: all .25s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(16px); }

@media (max-width: 600px) {
    .pill-label { display: none; }
    .save-pill { padding: 6px; }
    .reminder-toast { left: 16px; right: 16px; width: auto; bottom: 16px; }
}
</style>
