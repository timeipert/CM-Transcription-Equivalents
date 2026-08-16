<script setup>
import { computed, ref } from 'vue'
import { usePersonalTablesStore } from '../stores/personalTables'
import { useAnnotationsStore } from '../stores/annotations'
import { useIiifStore } from '../stores/iiif'
import { useRouter } from 'vue-router'
import { useTranscriptionData } from '../composables/useTranscriptionData'
import { useImageManifest } from '../composables/useImageManifest'
import { getManuscriptStats } from '../utils/workspaceSharing'
import ManuscriptCleanupModal from '../components/ManuscriptCleanupModal.vue'

const store = usePersonalTablesStore()
const annotStore = useAnnotationsStore()
const iiifStore = useIiifStore()
const { hasImage } = useImageManifest()
const router = useRouter()
const { rawData, loading, sourceFolios } = useTranscriptionData()

const searchQuery = ref("");
const showCleanupModal = ref(false);
const cleanupSource = ref("");

function openCleanup(sourceName) {
    cleanupSource.value = sourceName;
    showCleanupModal.value = true;
}

const manuscripts = computed(() => {
    if (!sourceFolios.value) return [];
    
    // Get all unique source names from index
    let allSources = Object.keys(sourceFolios.value).sort();
    
    // Filter
    if (searchQuery.value.trim()) {
        const lower = searchQuery.value.toLowerCase();
        allSources = allSources.filter(s => s.toLowerCase().includes(lower));
    }
    
    const currentState = {
        personalTables: store.tables,
        annotations: annotStore.annotations,
        regions: annotStore.regions,
        regionItems: annotStore.regionItems,
        manualLines: annotStore.manualLines,
        iiifLinks: iiifStore.links
    };

    return allSources.map(sourceName => {
        const table = store.tables.find(t => t.source === sourceName);
        const stats = getManuscriptStats(currentState, sourceName);
        
        // IIIF connection status
        let hasIiif = !!iiifStore.links[sourceName];
        if (!hasIiif && sourceFolios.value[sourceName]) {
            for (const f of sourceFolios.value[sourceName]) {
                if (hasImage(sourceName, f)) {
                    hasIiif = true;
                    break;
                }
            }
        }
        
        return {
            name: sourceName,
            annotated: !!table && table.rows.length > 0,
            patternCount: table ? table.rows.length : 0,
            hasIiif,
            iiifUrl: iiifStore.links[sourceName] || null,
            regionsCount: stats.regionsCount,
            annotationsCount: stats.annotationsCount,
            foliosCount: stats.foliosCount,
            hasData: stats.hasData
        };
    }).sort((a, b) => {
        // Priority: Has Data -> Has IIIF -> Annotated -> Name
        if (a.hasData && !b.hasData) return -1;
        if (!a.hasData && b.hasData) return 1;
        if (a.hasIiif && !b.hasIiif) return -1;
        if (!a.hasIiif && b.hasIiif) return 1;
        if (a.annotated && !b.annotated) return -1;
        if (!a.annotated && b.annotated) return 1;
        return a.name.localeCompare(b.name);
    });
});

function openManuscript(sourceName) {
    const id = store.getOrCreateTableForSource(sourceName);
    router.push({ name: 'annotations', params: { id } });
}
</script>

<template>
<div class="container">
    <div class="header">
        <div>
            <h1>Transcription Equivalents</h1>
            <p class="subtitle">Select a manuscript to manage personal annotations.</p>
        </div>
        <div class="search-box">
            <input v-model="searchQuery" placeholder="Search manuscripts..." />
        </div>
    </div>

    <div v-if="loading" class="loading">Loading manuscripts...</div>
    
    <div v-else>
        <table class="ms-table">
            <thead>
                <tr>
                    <th>Manuscript Source</th>
                    <th>IIIF Images</th>
                    <th>Lines &amp; Annotations</th>
                    <th>Table Patterns</th>
                    <th class="w-100">Action</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="ms in manuscripts" :key="ms.name" 
                    @click="openManuscript(ms.name)"
                    class="ms-row"
                    :class="{ 'has-iiif-row': ms.hasIiif, 'greyed-out': !ms.annotated && !ms.hasData }">
                    <td>
                        <div class="ms-title-col">
                            <span class="ms-name">{{ ms.name }}</span>
                        </div>
                    </td>
                    <td>
                        <span v-if="ms.hasIiif" class="badge-iiif" title="IIIF manifest or images connected">
                            ✓ IIIF Connected
                        </span>
                        <span v-else class="text-muted-sm">No IIIF link</span>
                    </td>
                    <td>
                        <div v-if="ms.regionsCount > 0 || ms.annotationsCount > 0" class="badge-lines" title="Annotated line regions and snippet items">
                            <strong>{{ ms.regionsCount }}</strong> lines <span class="divider">/</span> <strong>{{ ms.annotationsCount }}</strong> snips <span class="divider">/</span> <strong>{{ ms.foliosCount }}</strong> fols
                        </div>
                        <span v-else class="text-muted-sm">—</span>
                    </td>
                    <td>
                        <span v-if="ms.annotated" class="badge active">
                             {{ ms.patternCount }} Patterns
                        </span>
                        <span v-else class="badge new">Not Started</span>
                    </td>
                    <td>
                        <div class="row-actions" @click.stop>
                            <button class="btn-sm" @click="openManuscript(ms.name)">Edit &rarr;</button>
                            <button 
                                v-if="ms.hasData" 
                                class="btn-sm btn-icon-danger" 
                                @click="openCleanup(ms.name)"
                                title="Manage / Delete annotations for this manuscript"
                            >
                                🗑
                            </button>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
        
        <div v-if="manuscripts.length === 0" class="empty-state">
            No manuscripts found matching your search.
        </div>
    </div>

    <!-- Manuscript Cleanup Modal -->
    <ManuscriptCleanupModal
        :isOpen="showCleanupModal"
        :source="cleanupSource"
        @close="showCleanupModal = false"
    />
</div>
</template>

<style scoped>
.container { padding: 40px; max-width: 1200px; margin: 0 auto; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
.subtitle { color: var(--color-text-muted); margin-top: 5px; }

.search-box input {
    padding: 10px 16px; width: 300px; border: 1px solid var(--color-border); border-radius: 8px;
    font-size: 0.95rem; outline: none; transition: border-color 0.2s;
}
.search-box input:focus { border-color: var(--color-primary); }

.ms-table { width: 100%; border-collapse: separate; border-spacing: 0; }
.ms-table th { 
    text-align: left; padding: 12px 20px; color: var(--color-text-muted); font-weight: 600; 
    border-bottom: 2px solid var(--color-border); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;
}
.ms-table td { padding: 16px 20px; border-bottom: 1px solid var(--color-surface-muted); background: white; transition: background 0.2s; }

.ms-row { cursor: pointer; }
.ms-row:hover td { background: var(--color-bg); }
.ms-row:first-child td:first-child { border-top-left-radius: 12px; }
.ms-row:first-child td:last-child { border-top-right-radius: 12px; }
.ms-row:last-child td:first-child { border-bottom-left-radius: 12px; }
.ms-row:last-child td:last-child { border-bottom-right-radius: 12px; }

.ms-name { font-weight: 600; color: var(--color-text); font-size: 1.05rem; }

.badge { font-size: 0.85rem; padding: 4px 10px; border-radius: 20px; font-weight: 600; display: inline-block; }
.badge.active { background: var(--color-primary-light); color: var(--color-primary-dark); }
.badge.new { background: var(--color-surface-muted); color: var(--color-text-light); }

.badge-iiif { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; font-size: 0.8rem; padding: 3px 8px; border-radius: 12px; font-weight: 600; display: inline-flex; align-items: center; }
.badge-lines { background: var(--color-surface-muted); color: var(--color-text); border: 1px solid var(--color-border); font-size: 0.8rem; padding: 4px 10px; border-radius: 6px; display: inline-block; }
.badge-lines .divider { color: var(--color-text-light); margin: 0 3px; }
.text-muted-sm { color: var(--color-text-light); font-size: 0.85rem; font-style: italic; }

.btn-sm { 
    background: white; border: 1px solid var(--color-border); padding: 6px 12px; border-radius: 6px; 
    cursor: pointer; color: var(--color-text-muted); font-weight: 500; transition: all 0.2s;
}
.ms-row:hover .btn-sm { border-color: var(--color-primary); color: var(--color-primary); }

.row-actions { display: flex; align-items: center; gap: 6px; }
.btn-icon-danger {
    padding: 6px 8px; font-size: 0.85rem; background: transparent; border: 1px solid transparent; border-radius: 6px;
    cursor: pointer; opacity: 0.6; transition: all 0.15s ease;
}
.btn-icon-danger:hover {
    opacity: 1; border-color: var(--color-danger, #ef4444); background: rgba(239, 68, 68, 0.1); color: var(--color-danger, #ef4444);
}

.loading, .empty-state { padding: 60px; text-align: center; color: var(--color-text-light); font-style: italic; }
.greyed-out { opacity: 0.6; }

.w-100 { width: 100px; }
</style>
