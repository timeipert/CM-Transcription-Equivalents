<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import ManagerSidebar from '../components/manager/ManagerSidebar.vue';
import ManagerWorkspace from '../components/manager/ManagerWorkspace.vue';

const selectedSource = ref(null);
const selectedFolio = ref(null);
const initialRegionId = ref(null);
const highlightPattern = ref(null);
const route = useRoute();

const updateFromQuery = () => {
    selectedSource.value = route.query.source || null;
    selectedFolio.value = route.query.folio || null;
    initialRegionId.value = route.query.region || null;
    highlightPattern.value = route.query.highlight || null;
};

onMounted(updateFromQuery);
watch(() => route.query, updateFromQuery, { deep: true });

function onSelect({ source, folio }) {
    selectedSource.value = source;
    selectedFolio.value = folio;
    initialRegionId.value = null;
    highlightPattern.value = null; // Clear when navigating away
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
        :initialRegionId="initialRegionId" 
        :highlightPattern="highlightPattern"
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
