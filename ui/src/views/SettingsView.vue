<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import './settings/settingsShared.css';
import ProjectFolderSection from './settings/ProjectFolderSection.vue';
import GithubSyncPanel from '../components/GithubSyncPanel.vue';
import ImportSection from './settings/ImportSection.vue';
import ExportSection from './settings/ExportSection.vue';
import StaticSiteSection from './settings/StaticSiteSection.vue';
import WorkspaceContentsSection from './settings/WorkspaceContentsSection.vue';
import AppDefaultsSection from './settings/AppDefaultsSection.vue';
import PreferredIdsSection from './settings/PreferredIdsSection.vue';
import BackupReminderSection from './settings/BackupReminderSection.vue';
import SourceMetadataSection from './settings/SourceMetadataSection.vue';
import CustomSignsSection from './settings/CustomSignsSection.vue';
import AlignmentSection from './settings/AlignmentSection.vue';

/**
 * Settings, one topic at a time. The topic is in the address
 * (`#/settings?section=import`), so other views link straight to it and a
 * reload keeps the place. Each topic is a list of section components.
 */
const SECTIONS = [
    { group: 'Your data', items: [
        { id: 'storage', label: 'Storage', hint: 'project folder, backup reminder', components: [ProjectFolderSection, BackupReminderSection] },
        { id: 'import', label: 'Import', hint: 'load backups and exports', components: [ImportSection] },
        { id: 'export', label: 'Export', hint: 'backups, selections, static site', components: [ExportSection, StaticSiteSection] },
        { id: 'contents', label: 'Workspace contents', hint: 'clean up or remove manuscripts', components: [WorkspaceContentsSection] },
        { id: 'sync', label: 'Shared sync', hint: 'monodi.app repository', components: [GithubSyncPanel] }
    ] },
    { group: 'Project settings', items: [
        { id: 'display', label: 'Display & IDs', hint: 'pattern view, preferred IDs', components: [AppDefaultsSection, PreferredIdsSection] },
        { id: 'signs', label: 'Signs & variants', hint: 'custom signs, code variants', components: [CustomSignsSection] },
        { id: 'metadata', label: 'Source metadata', hint: 'attributes of manuscripts', components: [SourceMetadataSection] },
        { id: 'alignment', label: 'Folio alignment', hint: 'folios onto IIIF pages', components: [AlignmentSection] }
    ] }
];
const ALL = SECTIONS.flatMap(g => g.items);

const route = useRoute();
const router = useRouter();
const current = computed(() => ALL.find(s => s.id === route.query.section) || ALL[0]);

function open(id) {
    router.replace({ query: { ...route.query, section: id } });
}
</script>

<template>
<div class="settings-layout">
    <nav class="settings-nav" aria-label="Settings topics">
        <h1>Settings</h1>
        <div v-for="g in SECTIONS" :key="g.group" class="nav-group">
            <div class="nav-group-label">{{ g.group }}</div>
            <button
                v-for="s in g.items"
                :key="s.id"
                type="button"
                :class="['nav-item', { active: current.id === s.id }]"
                :aria-current="current.id === s.id ? 'page' : undefined"
                @click="open(s.id)"
            >
                <span class="nav-label">{{ s.label }}</span>
                <span class="nav-hint">{{ s.hint }}</span>
            </button>
        </div>
    </nav>

    <main class="settings-main">
        <component :is="c" v-for="(c, i) in current.components" :key="current.id + i" />
    </main>
</div>
</template>

<style scoped>
.settings-layout { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 28px; max-width: 1180px; margin: 0 auto; padding: 24px; align-items: start; }
.settings-nav { position: sticky; top: 16px; text-align: left; }
.settings-nav h1 { font-size: 1.4rem; margin: 0 0 16px; }
.nav-group { margin-bottom: 18px; }
.nav-group-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-light); font-weight: 600; margin: 0 0 6px 10px; }
.nav-item { display: flex; flex-direction: column; align-items: flex-start; width: 100%; padding: 7px 10px; border: none; border-radius: var(--radius-md); background: none; cursor: pointer; text-align: left; color: var(--color-text); }
.nav-item:hover { background: var(--color-surface-muted); }
.nav-item.active { background: var(--color-primary-light); color: var(--color-primary-dark); }
.nav-label { font-weight: 600; font-size: 0.92rem; }
.nav-hint { font-size: 0.75rem; color: var(--color-text-muted); }
.settings-main { min-width: 0; text-align: left; }
/* The panel that comes from outside the settings sections is still a card on this page. */
.settings-main :deep(.section) { margin-bottom: 24px; text-align: left; }

@media (max-width: 820px) {
    .settings-layout { grid-template-columns: 1fr; padding: 16px; gap: 12px; }
    .settings-nav { position: static; }
    .nav-group { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
    .nav-group-label { width: 100%; margin-left: 0; }
    .nav-item { width: auto; }
    .nav-hint { display: none; }
}
</style>
