<script setup>
import { ref, computed } from 'vue';
import { useDataManagement } from '../../composables/useDataManagement';
import { getManuscriptStats } from '../../utils/workspaceSharing';
import { exportableSources } from '../../services/persistence/exportBuilder';
import ManuscriptCleanupModal from '../../components/ManuscriptCleanupModal.vue';

/**
 * What the workspace holds, per manuscript, with the one place to clean up or
 * remove its data. Exporting is in Settings → Export.
 */
const { getLocalFullState, clearAllData, takeSnapshot, restoreSnapshot } = useDataManagement();

const manuscripts = computed(() => {
    const state = getLocalFullState();
    return exportableSources(state)
        .map(src => getManuscriptStats(state, src))
        .sort((a, b) => b.annotationsCount - a.annotationsCount || a.source.localeCompare(b.source));
});

const cleanupSource = ref('');
const showCleanup = ref(false);
function openCleanup(source) {
    cleanupSource.value = source;
    showCleanup.value = true;
}

const message = ref('');
const undoSnapshot = ref(null);

async function removeAll() {
    if (!confirm('Remove ALL annotations, line regions, equivalents tables and IIIF links from this workspace? Settings and custom manuscripts stay. You can undo this until you leave this page.')) return;
    undoSnapshot.value = await takeSnapshot();
    clearAllData();
    message.value = 'All manuscript data was removed.';
}

function undoRemoveAll() {
    restoreSnapshot(undoSnapshot.value);
    undoSnapshot.value = null;
    message.value = 'Restored.';
}
</script>

<template>
    <div class="card section settings-card">
        <h2>Workspace contents</h2>
        <p class="desc">The manuscripts that hold annotations, line regions or table rows. To save them to a file, use <router-link :to="{ query: { section: 'export' } }">Export</router-link>.</p>

        <div v-if="manuscripts.length" class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Manuscript</th>
                        <th class="num">Snippets</th>
                        <th class="num">Folios</th>
                        <th class="num">Line regions</th>
                        <th class="num">Table rows</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="ms in manuscripts" :key="ms.source">
                        <td class="fw-bold">{{ ms.source }} <span v-if="ms.isPublished" class="pub">published</span></td>
                        <td class="num">{{ ms.annotationsCount }}</td>
                        <td class="num">{{ ms.foliosCount }}</td>
                        <td class="num">{{ ms.regionsCount }}</td>
                        <td class="num">{{ ms.patternRowsCount }}</td>
                        <td class="actions">
                            <button class="btn-sm btn-secondary" @click="openCleanup(ms.source)" title="Delete some or all of this manuscript's data">Clean up…</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p v-else class="empty">No manuscript in this workspace holds data.</p>

        <div class="danger-zone">
            <div>
                <strong>Remove all manuscript data</strong>
                <p class="text-sm-muted-mt0">Annotations, line regions, equivalents tables and IIIF links of every manuscript. Settings and custom manuscripts stay.</p>
            </div>
            <button class="btn-secondary btn-danger" @click="removeAll">Remove all…</button>
        </div>
        <div v-if="message" class="msg">
            {{ message }}
            <button v-if="undoSnapshot" class="btn-link" @click="undoRemoveAll">Undo</button>
        </div>
    </div>

    <ManuscriptCleanupModal
        :isOpen="showCleanup"
        :source="cleanupSource"
        @close="showCleanup = false"
        @deleted="msg => message = msg"
    />
</template>

<style scoped>
.table-wrap { overflow-x: auto; }
table { font-size: 0.88rem; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.actions { text-align: right; }
.pub { font-size: 0.7rem; font-weight: 600; color: #166534; background: var(--color-success-light); padding: 1px 6px; border-radius: 10px; margin-left: 6px; }
.danger-zone { margin-top: 24px; padding: 14px 16px; border: 1px solid var(--color-danger-muted); border-radius: var(--radius-lg); display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.danger-zone p { margin: 4px 0 0; }
.msg { margin-top: 10px; padding: 10px; border-radius: 4px; font-size: 0.9em; background: var(--color-surface-muted); }
.btn-link { background: none; border: none; color: var(--color-primary-hover); cursor: pointer; font-weight: 600; margin-left: 8px; padding: 0; }
</style>
