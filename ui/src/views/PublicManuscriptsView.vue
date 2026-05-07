<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useAnnotationsStore } from '../stores/annotations';

const tableStore = usePersonalTablesStore();
const annotStore = useAnnotationsStore();
const router = useRouter();

const sortBy = ref('source');
const sortOrder = ref(1); // 1 for asc, -1 for desc

const sortedTables = computed(() => {
    const list = [...tableStore.tables.filter(t => {
        if (!t.isPublished) return false;
        // Only show if there are ANY real annotations for this source
        const prefix = t.source + '_';
        return Object.keys(annotStore.regions).some(k => 
            k.startsWith(prefix) && annotStore.regions[k].length > 0
        );
    })];
    list.sort((a, b) => {
        let valA, valB;
        if (sortBy.value === 'source') {
            valA = a.source;
            valB = b.source;
        } else if (sortBy.value === 'name') {
            valA = a.name;
            valB = b.name;
        } else if (sortBy.value === 'patterns') {
            valA = a.rows.length;
            valB = b.rows.length;
        }
        
        if (typeof valA === 'string') {
            return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * sortOrder.value;
        }
        return (valA - valB) * sortOrder.value;
    });
    return list;
});

function toggleSort(field) {
    if (sortBy.value === field) {
        sortOrder.value *= -1;
    } else {
        sortBy.value = field;
        sortOrder.value = 1;
    }
}

function goToOverview(source) {
    router.push(`/public/${encodeURIComponent(source)}`);
}
</script>

<template>
<div class="public-container">
    <div class="header-section">
        <h1>Notationsdokumentation</h1>
        <p class="subtitle">Index of manuscripts with notation transcriptions and cross-referenced pattern IDs.</p>
    </div>

    <div class="content-section">
        <div v-if="sortedTables.length === 0" class="empty-state">
            <div class="icon">📚</div>
            <h3>No Published Manuscripts</h3>
            <p>Manuscripts must be marked as 'Published' in the editor before they appear here.</p>
        </div>

        <div v-else class="table-container">
            <table class="ms-table">
                <thead>
                    <tr>
                        <th @click="toggleSort('source')" :class="{ active: sortBy === 'source' }">
                            Source 
                            <span class="sort-icon" v-if="sortBy === 'source'">{{ sortOrder === 1 ? '↑' : '↓' }}</span>
                        </th>
                        <th @click="toggleSort('name')" :class="{ active: sortBy === 'name' }">
                            Manuscript Title
                            <span class="sort-icon" v-if="sortBy === 'name'">{{ sortOrder === 1 ? '↑' : '↓' }}</span>
                        </th>
                        <th @click="toggleSort('patterns')" :class="{ active: sortBy === 'patterns' }" style="text-align: right;">
                            Patterns
                            <span class="sort-icon" v-if="sortBy === 'patterns'">{{ sortOrder === 1 ? '↑' : '↓' }}</span>
                        </th>
                        <th style="text-align: right; width: 100px;"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="table in sortedTables" :key="table.id" @click="goToOverview(table.source)">
                        <td class="font-bold">{{ table.source }}</td>
                        <td class="text-secondary">{{ table.name }}</td>
                        <td style="text-align: right;">
                            <span class="badge">{{ table.rows.length }}</span>
                        </td>
                        <td style="text-align: right;">
                            <button class="btn-view-sm">View &rarr;</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
</template>

<style scoped>
.public-container {
    max-width: 1000px;
    margin: 0 auto;
    padding: 40px 20px;
}

.header-section {
    text-align: center;
    margin-bottom: 50px;
}

h1 {
    font-size: 2.5rem;
    color: #1e293b;
    margin-bottom: 10px;
    font-weight: 800;
}

.subtitle {
    font-size: 1.1rem;
    color: #64748b;
}

.empty-state {
    text-align: center;
    padding: 80px 20px;
    background: white;
    border-radius: 12px;
    border: 1px dashed #cbd5e1;
}

.empty-state .icon {
    font-size: 3rem;
    margin-bottom: 20px;
    opacity: 0.5;
}

.empty-state h3 {
    color: #334155;
    margin-bottom: 10px;
}

.empty-state p {
    color: #94a3b8;
}

.manuscript-grid {
    display: none;
}

.table-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    border: 1px solid #e2e8f0;
    overflow: hidden;
}

.ms-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
}

.ms-table th {
    background: #f8fafc;
    padding: 16px 24px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    border-bottom: 1px solid #e2e8f0;
    cursor: pointer;
    user-select: none;
}

.ms-table th:hover {
    background: #f1f5f9;
    color: #1e293b;
}

.ms-table th.active {
    color: #2563eb;
}

.sort-icon {
    display: inline-block;
    margin-left: 4px;
}

.ms-table td {
    padding: 16px 24px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 0.95rem;
    color: #334155;
    transition: background 0.2s;
}

.ms-table tr {
    cursor: pointer;
}

.ms-table tr:hover td {
    background: #f8fafc;
}

.ms-table tr:last-child td {
    border-bottom: none;
}

.font-bold {
    font-weight: 700;
    color: #0f172a;
}

.text-secondary {
    color: #64748b;
}

.badge {
    background: #eff6ff;
    color: #2563eb;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
}

.btn-view-sm {
    background: transparent;
    color: #3b82f6;
    border: none;
    padding: 0;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
}

.ms-table tr:hover .btn-view-sm {
    color: #2563eb;
}
</style>
