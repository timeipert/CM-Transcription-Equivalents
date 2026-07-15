<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ManagerSidebar from '../components/manager/ManagerSidebar.vue';
import ManagerWorkspace from '../components/manager/ManagerWorkspace.vue';

const selectedSource = ref(null);
const selectedFolio = ref(null);
const initialRegionId = ref(null);
const highlightPattern = ref(null);
const returnTo = ref(null);
const returnId = ref(null);
const route = useRoute();
const router = useRouter();

const updateFromQuery = () => {
    selectedSource.value = route.query.source || null;
    selectedFolio.value = route.query.folio || null;
    initialRegionId.value = route.query.region || null;
    highlightPattern.value = route.query.highlight || null;
    returnTo.value = route.query.return_to || null;
    returnId.value = route.query.return_id || null;
};

onMounted(updateFromQuery);
watch(() => route.query, updateFromQuery, { deep: true });

function onSelect({ source, folio }) {
    router.push({ 
        query: { 
            ...route.query, 
            source, 
            folio, 
            region: undefined, 
            highlight: undefined 
        } 
    });
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
        :returnTo="returnTo"
        :returnId="returnId"
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
