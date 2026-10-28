<script setup>
import { ref } from 'vue';

const exporting = ref(false);
const message = ref('');
const status = ref(''); // 'success' | 'error' | 'progress'

async function run() {
    if (exporting.value) return;
    exporting.value = true;
    status.value = 'progress';
    message.value = 'Starting export…';
    try {
        // Loaded on demand: the exporter (and the ZIP library) is only needed here.
        const { exportStaticSite } = await import('../../composables/useStaticExport');
        const res = await exportStaticSite(p => { message.value = p.message; });
        status.value = 'success';
        message.value = `Exported ${res.sources} manuscript(s) with ${res.snippets} snippet(s)`
            + (res.failures ? ` — ${res.failures} snippet(s) could not be fetched (IIIF/CORS).` : '.');
    } catch (e) {
        status.value = 'error';
        message.value = e?.message || 'Static export failed.';
    } finally {
        exporting.value = false;
    }
}
</script>

<template>
    <div class="card section settings-card">
        <h2>Static public site (HTML &amp; Markdown)</h2>
        <p class="desc">
            A standalone ZIP that mirrors the public viewer offline: one HTML + Markdown page per published manuscript,
            plus cropped IIIF image snippets saved as files (usable as citation "quotes"). Snippets are fetched live from the
            IIIF servers, so keep this tab connected while it runs. This is a publication, not a backup: it cannot be imported.
        </p>
        <button @click="run" class="btn-primary" :disabled="exporting">
            {{ exporting ? 'Exporting…' : 'Download static site' }}
        </button>
        <div v-if="message" :class="['msg', status === 'error' ? 'error' : 'success']">{{ message }}</div>
    </div>
</template>

<style scoped>
.msg { margin-top: 10px; padding: 10px; border-radius: 4px; font-size: 0.9em; }
.msg.success { background: var(--color-success-light); color: #166534; }
.msg.error { background: var(--color-danger-light); color: var(--color-danger); }
</style>
