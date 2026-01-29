<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import ManagerSidebar from '../components/manager/ManagerSidebar.vue';
import ManagerWorkspace from '../components/manager/ManagerWorkspace.vue';

const selectedSource = ref(null);
const selectedFolio = ref(null);
const initialRegionId = ref(null); // Added
const route = useRoute();

onMounted(() => {
    if (route.query.source) selectedSource.value = route.query.source;
    if (route.query.folio) selectedFolio.value = route.query.folio;
    if (route.query.region) initialRegionId.value = route.query.region; // Added
});

function onSelect({ source, folio }) {
    selectedSource.value = source;
    selectedFolio.value = folio;
    initialRegionId.value = null; // Reset when manual navigation
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
