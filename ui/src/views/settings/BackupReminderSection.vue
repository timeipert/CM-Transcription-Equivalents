<script setup>
import { useSaveReminderStore } from '../../stores/saveReminder';

const reminder = useSaveReminderStore();
</script>

<template>
    <div class="card section settings-card">
            <h2>Backup Reminder</h2>
            <p class="desc">A reminder appears when you have unsaved work and haven't exported a backup
                in a while. The status pill in the toolbar always shows where your work stands.</p>
            <div class="reminder-row">
                <span v-if="reminder.disabled" class="reminder-state off">Reminders are turned off</span>
                <span v-else class="reminder-state on">Reminders are on</span>
                <button v-if="reminder.disabled" @click="reminder.enableReminder()" class="btn-sm btn-secondary">
                    Turn reminders back on
                </button>
                <button v-else @click="reminder.disableReminder()" class="btn-sm btn-secondary">
                    Turn off reminders
                </button>
                <span class="text-sm-light">
                    {{ reminder.changeCount }} change(s) since last backup ·
                    last backup {{ reminder.sinceExportLabel }}
                </span>
            </div>
        </div>
</template>

<style scoped>
.reminder-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.reminder-state { font-weight: 700; font-size: 13px; }
.reminder-state.on { color: #15803d; }
.reminder-state.off { color: var(--color-text-muted); }
</style>
