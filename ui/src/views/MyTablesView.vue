<script setup>
import { ref } from 'vue'
import { usePersonalTablesStore } from '../stores/personalTables'
import { useRouter } from 'vue-router'

const store = usePersonalTablesStore()
const router = useRouter()

const newTableName = ref("");

function createNew() {
    if (newTableName.value.trim()) {
        const id = store.createTable(newTableName.value);
        newTableName.value = "";
        router.push({ name: 'edit-table', params: { id } });
    }
}
</script>

<template>
<div class="container">
    <div class="header">
        <h1>My Transcription Tables</h1>
        <div class="create-form">
            <input v-model="newTableName" placeholder="New Table Name" @keyup.enter="createNew" />
            <button @click="createNew" class="btn-primary" :disabled="!newTableName.trim()">Create New Table</button>
        </div>
    </div>

    <div v-if="store.tables.length === 0" class="empty-state">
        No tables yet. Create one to start managing your personal collection.
    </div>

    <div v-else class="grid">
        <div v-for="table in store.tables" :key="table.id" class="card">
            <h3>{{ table.name }}</h3>
            <p>{{ table.source ? `Source: ${table.source}` : 'No source selected' }}</p>
            <p>{{ table.rows.length }} patterns</p>
            <div class="actions">
                <button @click="router.push({ name: 'edit-table', params: { id: table.id } })">Edit</button>
                <button @click="store.deleteTable(table.id)" class="btn-danger">Delete</button>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.container { padding: 40px; max-width: 1200px; margin: 0 auto; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
.create-form { display: flex; gap: 10px; }
.create-form input { padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 1em; }
.btn-primary { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
.btn-primary:disabled { background: #ccc; cursor: not-allowed; }
.btn-danger { background: #dc3545; color: white; border:1px solid #dc3545; }
.grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.card { border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.actions { margin-top: 15px; display: flex; gap: 10px; }
button { padding: 5px 10px; cursor: pointer; }
</style>
