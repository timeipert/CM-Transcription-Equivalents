<script setup>
import './settings/settingsShared.css';
import ProjectFolderSection from './settings/ProjectFolderSection.vue';
import GithubSyncPanel from '../components/GithubSyncPanel.vue';
import BackupSection from './settings/BackupSection.vue';
import AppDefaultsSection from './settings/AppDefaultsSection.vue';
import PreferredIdsSection from './settings/PreferredIdsSection.vue';
import BackupReminderSection from './settings/BackupReminderSection.vue';
import SourceMetadataSection from './settings/SourceMetadataSection.vue';
import CustomSignsSection from './settings/CustomSignsSection.vue';
import AlignmentSection from './settings/AlignmentSection.vue';
</script>

<template>
<div class="settings-container">
    <h1>Global Settings</h1>

    <ProjectFolderSection />
    <GithubSyncPanel />
    <BackupSection />
    <AppDefaultsSection />
    <PreferredIdsSection />
    <BackupReminderSection />
    <SourceMetadataSection />
    <CustomSignsSection />
    <AlignmentSection />
</div>
</template>

<style scoped>
.settings-container { padding: 30px; max-width: 800px; margin: 0 auto; }
h1 { margin-bottom: 30px; }
/* The panel that comes from outside the settings sections is still a card on this page. */
.section { margin-bottom: 30px; text-align: left; }
</style>
