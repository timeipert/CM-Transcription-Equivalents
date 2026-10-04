<script setup>
import { ref } from 'vue';
import { useSettingsStore } from '../../stores/settings';

const store = useSettingsStore();

// UI State for adding new ID mapping
const newPattern = ref("");
const newId = ref("");

function addMapping() {
    if (newPattern.value && newId.value) {
        store.setGlobalId(newPattern.value, newId.value);
        newPattern.value = "";
        newId.value = "";
    }
}
</script>

<template>
    <div class="card section settings-card">
            <h2>Preferred Custom IDs</h2>
            <p class="desc">Define default IDs for specific patterns (e.g., "*dd" -> "Type A"). These will be auto-filled in the editor.</p>

            <div class="add-row">
                <input v-model="newPattern" placeholder="Pattern (e.g. *dd)" />
                <input v-model="newId" placeholder="Default ID (e.g. Type A)" />
                <button @click="addMapping" :disabled="!newPattern || !newId">Add Preference</button>
            </div>

            <div class="ids-list">
                <table v-if="Object.keys(store.globalDisplayIds).length > 0">
                    <thead>
                        <tr>
                            <th>Pattern</th>
                            <th>Preferred ID</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(id, pat) in store.globalDisplayIds" :key="pat">
                            <td class="code-font">{{ pat }}</td>
                            <td>{{ id }}</td>
                            <td>
                                <button @click="store.removeGlobalId(pat)" class="btn-sm btn-danger">Remove</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div v-else class="empty">No global ID preferences set</div>
            </div>
        </div>
</template>
