<script setup>
import AnnotationCutout from '../AnnotationCutout.vue';

const props = defineProps([
    'source', 'folio', 'stdSource', 'stdFolio', 'regions',
    'hasTranscriptionData', 'getIiifThumbnailUrl'
]);

const emit = defineEmits(['openRegionCreator', 'selectRegion', 'deleteRegion']);
</script>

<template>
<div class="overview-grid">
    <div class="overview-toolbar">
        <button @click="$emit('openRegionCreator')" class="btn-primary">+ Add Line Region</button>
        <span v-if="hasTranscriptionData(stdSource, stdFolio)" class="data-badge" title="This page has imported transcription data">
            <span class="dot">•</span> Monodi Data Available
        </span>
    </div>
    
    <div class="page-preview-container" v-if="stdSource && stdFolio">
        <div class="page-preview" @click="$emit('openRegionCreator')">
            <img :src="getIiifThumbnailUrl(source, folio, 600)" />
            <div class="preview-overlay">
                <span>Click anywhere to add a new line region</span>
            </div>
        </div>
    </div>

    <div class="regions-list">
         <div v-if="regions.length === 0" class="empty-msg">No line regions defined.</div>
         <div v-for="r in regions" :key="r.id" class="region-card" @click="$emit('selectRegion', r)">
             <div class="r-preview">
                 <AnnotationCutout 
                     :source="stdSource" 
                     :folio="stdFolio" 
                     :points="r.points"
                     :width="300" 
                     :height="80" 
                     fit="contain"
                     :hideLabel="true"
                 />
             </div>
             <div class="r-info">
                 <h4>{{ r.name }}</h4>
                 <button @click.stop="$emit('deleteRegion', r)" class="btn-xs delete-btn">Delete</button>
             </div>
         </div>
    </div>
</div>
</template>

<style scoped>
.overview-grid { padding: 20px; height: 100%; overflow-y: auto; }
.overview-toolbar { margin-bottom: 20px; display: flex; align-items: center; }

.data-badge { margin-left: 15px; background: var(--color-warning-light); color: var(--color-warning-dark); border: 1px solid var(--color-warning-muted); padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; }
.data-badge .dot { color: var(--color-warning); font-size: 1.5em; margin-right: 6px; line-height: 0.5; }

.page-preview-container { margin-bottom: 25px; }
.page-preview { position: relative; max-width: 600px; border-radius: 8px; overflow: hidden; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: transform 0.2s; }
.page-preview:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.2); }
.page-preview img { display: block; width: 100%; height: auto; }
.preview-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0); display: flex; justify-content: center; align-items: center; transition: background 0.2s; }
.page-preview:hover .preview-overlay { background: rgba(0,0,0,0.4); }
.preview-overlay span { opacity: 0; color: white; font-weight: 600; font-size: 16px; background: rgba(0,0,0,0.7); padding: 8px 16px; border-radius: 20px; transition: opacity 0.2s; }
.page-preview:hover .preview-overlay span { opacity: 1; }

.regions-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 15px; }
.region-card { background: white; border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
.region-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.r-preview { height: 100px; background: var(--color-text); display: flex; justify-content: center; align-items: center; }
.r-info { padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--color-surface-muted); gap: 10px; }
.r-info h4 { margin: 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
</style>
