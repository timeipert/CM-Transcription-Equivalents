<script setup>
import { computed, ref } from 'vue'
import { usePersonalTablesStore } from '../stores/personalTables'
import { useRouter } from 'vue-router'
import { useTranscriptionData } from '../composables/useTranscriptionData'

const store = usePersonalTablesStore()
const router = useRouter()
const { rawData, loading } = useTranscriptionData()

const searchQuery = ref("");

const manuscripts = computed(() => {
    if (!rawData.value) return [];
    
    // Get all unique source names from transcription data
    let allSources = Object.keys(rawData.value).sort();
    
    // Filter
    if (searchQuery.value.trim()) {
        const lower = searchQuery.value.toLowerCase();
        allSources = allSources.filter(s => s.toLowerCase().includes(lower));
    }
    
    return allSources.map(sourceName => {
        // Check if we have a table for this source
        const table = store.tables.find(t => t.source === sourceName);
        return {
            name: sourceName,
            annotated: !!table,
            patternCount: table ? table.rows.length : 0
        };
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
                    <th>Status</th>
                    <th style="width: 100px;">Action</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="ms in manuscripts" :key="ms.name" 
                    @click="openManuscript(ms.name)"
                    class="ms-row">
                    <td>
                        <span class="ms-name">{{ ms.name }}</span>
                    </td>
                    <td>
                        <span v-if="ms.annotated" class="badge active">
                             {{ ms.patternCount }} Patterns
                        </span>
                        <span v-else class="badge new">Not Started</span>
                    </td>
                    <td>
                        <button class="btn-sm">Edit &rarr;</button>
                    </td>
                </tr>
            </tbody>
        </table>
        
        <div v-if="manuscripts.length === 0" class="empty-state">
            No manuscripts found matching your search.
        </div>
    </div>
</div>
</template>

<style scoped>
.container { padding: 40px; max-width: 1200px; margin: 0 auto; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
.subtitle { color: #64748b; margin-top: 5px; }

.search-box input {
    padding: 10px 16px; width: 300px; border: 1px solid #e2e8f0; border-radius: 8px;
    font-size: 0.95rem; outline: none; transition: border-color 0.2s;
}
.search-box input:focus { border-color: #3b82f6; }

.ms-table { width: 100%; border-collapse: separate; border-spacing: 0; }
.ms-table th { 
    text-align: left; padding: 12px 20px; color: #64748b; font-weight: 600; 
    border-bottom: 2px solid #e2e8f0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;
}
.ms-table td { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; background: white; transition: background 0.2s; }

.ms-row { cursor: pointer; }
.ms-row:hover td { background: #f8fafc; }
.ms-row:first-child td:first-child { border-top-left-radius: 12px; }
.ms-row:first-child td:last-child { border-top-right-radius: 12px; }
.ms-row:last-child td:first-child { border-bottom-left-radius: 12px; }
.ms-row:last-child td:last-child { border-bottom-right-radius: 12px; }

.ms-name { font-weight: 600; color: #1e293b; font-size: 1.05rem; }

.badge { font-size: 0.85rem; padding: 4px 10px; border-radius: 20px; font-weight: 600; display: inline-block; }
.badge.active { background: #dbeafe; color: #1e40af; }
.badge.new { background: #f1f5f9; color: #94a3b8; }

.btn-sm { 
    background: white; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; 
    cursor: pointer; color: #64748b; font-weight: 500; transition: all 0.2s;
}
.ms-row:hover .btn-sm { border-color: #3b82f6; color: #3b82f6; }

.loading, .empty-state { padding: 60px; text-align: center; color: #94a3b8; font-style: italic; }
</style>
