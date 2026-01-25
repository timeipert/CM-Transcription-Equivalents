<script setup>
import { ref } from 'vue';
import ManagerSidebar from '../components/manager/ManagerSidebar.vue';
import ManagerWorkspace from '../components/manager/ManagerWorkspace.vue';

const selectedSource = ref(null);
const selectedFolio = ref(null);

function onSelect({ source, folio }) {
    selectedSource.value = source;
    selectedFolio.value = folio;
}
</script>

<template>
<div class="manager-layout">
    <ManagerSidebar 
        :selectedSource="selectedSource" 
        :selectedFolio="selectedFolio" 
        @select="onSelect" 
    />
    <ManagerWorkspace 
        :source="selectedSource" 
        :folio="selectedFolio" 
    />
</div>
</template>

<style scoped>
.manager-layout {
    display: flex;
    height: 100vh;
    overflow: hidden;
    width: 100%;
}
</style>
