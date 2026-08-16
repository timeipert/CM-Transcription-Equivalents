<script setup>
import AnnotationCutout from '../AnnotationCutout.vue';
import SmartImage from '../SmartImage.vue';

const props = defineProps([
    'source', 'folio', 'stdSource', 'stdFolio', 'regions',
    'hasTranscriptionData', 'getIiifThumbnailUrl'
]);

const emit = defineEmits(['openRegionCreator', 'selectRegion', 'editRegion', 'deleteRegion']);
</script>

<template>
<div class="overview-grid">
    <!-- Top Action Bar -->
    <div class="overview-toolbar">
        <div class="toolbar-left">
            <button @click="$emit('openRegionCreator')" class="btn-primary">+ Add Line Region</button>
            <span v-if="hasTranscriptionData(stdSource, stdFolio)" class="data-badge" title="This page has imported transcription data">
                <span class="dot">•</span> Monodi Data Available
            </span>
        </div>
        <div class="toolbar-right">
            <span class="regions-count-badge">{{ regions.length }} {{ regions.length === 1 ? 'Line Region' : 'Line Regions' }}</span>
        </div>
    </div>

    <!-- Case 1: When Line Regions already exist -->
    <div v-if="regions.length > 0" class="layout-with-lines">
        <!-- Prominent Lines Grid -->
        <section class="primary-lines-section">
            <div class="section-title">
                <h3>Defined Line Regions</h3>
                <span class="section-hint">Click a line to annotate snippets or click ✎ to adjust boundaries</span>
            </div>
            
            <div class="regions-list">
                 <div v-for="r in regions" :key="r.id" class="region-card" @click="$emit('selectRegion', r)">
                     <div class="r-preview">
                         <AnnotationCutout 
                             :source="stdSource" 
                             :folio="stdFolio" 
                             :points="r.points"
                             :width="320" 
                             :height="85" 
                             fit="contain"
                             :hideLabel="true"
                         />
                     </div>
                     <div class="r-info">
                         <h4>{{ r.name }}</h4>
                         <div class="card-actions">
                             <button @click.stop="$emit('editRegion', r)" class="btn-xs edit-btn" title="Edit line boundaries & name">✎ Edit</button>
                             <button @click.stop="$emit('deleteRegion', r)" class="btn-xs delete-btn" title="Delete this line">Delete</button>
                         </div>
                     </div>
                 </div>
            </div>
        </section>

        <!-- Compact Page Reference on the side/bottom -->
        <aside class="compact-page-reference" v-if="stdSource && stdFolio">
            <div class="ref-header">
                <h4>Folio Overview</h4>
                <span class="ref-hint">Click to draw new line</span>
            </div>
            <div class="compact-preview" @click="$emit('openRegionCreator')" title="Click image to add a new line region">
                <SmartImage :src="getIiifThumbnailUrl(source, folio, 600)" fit="contain" />
                <div class="compact-overlay">
                    <span>+ Add Line Region</span>
                </div>
            </div>
        </aside>
    </div>

    <!-- Case 2: When NO lines are defined yet -> Full Page prominent -->
    <div v-else class="empty-lines-state">
        <div class="empty-hero">
            <div class="hero-text">
                <h3>No Line Regions Defined Yet</h3>
                <p>Click on the page image below or "+ Add Line Region" to define the first line strip on this folio.</p>
                <button @click="$emit('openRegionCreator')" class="btn-primary btn-large">+ Define First Line Region</button>
            </div>
            
            <div class="full-page-hero-preview" v-if="stdSource && stdFolio" @click="$emit('openRegionCreator')">
                <SmartImage :src="getIiifThumbnailUrl(source, folio, 800)" fit="contain" />
                <div class="hero-overlay">
                    <span class="hero-callout">Click here to draw a line region</span>
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.overview-grid { padding: 20px 24px; height: 100%; overflow-y: auto; box-sizing: border-box; }
.overview-toolbar { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
.toolbar-left { display: flex; align-items: center; gap: 12px; }

.data-badge { background: var(--color-warning-light); color: var(--color-warning-dark); border: 1px solid var(--color-warning-muted); padding: 5px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; }
.data-badge .dot { color: var(--color-warning); font-size: 1.5em; margin-right: 6px; line-height: 0.5; }
.regions-count-badge { font-size: 0.85rem; color: var(--color-text-muted); font-weight: 600; background: var(--color-bg); padding: 4px 10px; border-radius: 12px; border: 1px solid var(--color-border); }

/* Layout with Lines Defined */
.layout-with-lines {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 25px;
    align-items: start;
}

.primary-lines-section {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.section-title h3 {
    margin: 0 0 4px 0;
    font-size: 1.15rem;
    color: var(--color-text);
}

.section-hint {
    font-size: 0.85rem;
    color: var(--color-text-muted);
}

.regions-list { 
    display: grid; 
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); 
    gap: 16px; 
}

.region-card { 
    background: white; 
    border: 1px solid var(--color-border); 
    border-radius: 8px; 
    overflow: hidden; 
    cursor: pointer; 
    transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s; 
    box-shadow: 0 2px 5px rgba(0,0,0,0.03);
}

.region-card:hover { 
    transform: translateY(-2px); 
    box-shadow: 0 6px 16px rgba(0,0,0,0.09); 
    border-color: var(--color-primary);
}

.r-preview { 
    height: 100px; 
    background: #1e293b; 
    display: flex; 
    justify-content: center; 
    align-items: center; 
}

.r-info { 
    padding: 10px 14px; 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    border-top: 1px solid var(--color-surface-muted); 
    gap: 10px; 
}

.r-info h4 { 
    margin: 0; 
    font-size: 14px; 
    font-weight: 600;
    white-space: nowrap; 
    overflow: hidden; 
    text-overflow: ellipsis; 
    flex: 1; 
}

.card-actions { display: flex; gap: 6px; align-items: center; }
.edit-btn { background: var(--color-surface-muted); border: 1px solid var(--color-border); color: var(--color-text); padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: 500; }
.edit-btn:hover { background: var(--color-border); color: var(--color-primary); }
.delete-btn { background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626; padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; }
.delete-btn:hover { background: #fecaca; }

/* Compact Page Reference */
.compact-page-reference {
    background: white;
    padding: 14px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.ref-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 10px;
}

.ref-header h4 {
    margin: 0;
    font-size: 0.95rem;
    color: var(--color-text);
}

.ref-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
}

.compact-preview {
    position: relative;
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid var(--color-border);
}

.compact-preview img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 420px;
    object-fit: contain;
    background: #f8fafc;
}

.compact-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0);
    display: flex;
    justify-content: center;
    align-items: center;
    transition: background 0.2s;
}

.compact-preview:hover .compact-overlay {
    background: rgba(15, 23, 42, 0.4);
}

.compact-overlay span {
    opacity: 0;
    color: white;
    font-weight: 600;
    font-size: 13px;
    background: rgba(0,0,0,0.8);
    padding: 6px 12px;
    border-radius: 14px;
    transition: opacity 0.2s;
}

.compact-preview:hover .compact-overlay span {
    opacity: 1;
}

/* Empty Lines State */
.empty-lines-state {
    max-width: 750px;
    margin: 20px auto 40px auto;
}

.empty-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 20px;
}

.hero-text h3 {
    margin: 0 0 8px 0;
    font-size: 1.3rem;
    color: var(--color-text);
}

.hero-text p {
    margin: 0 0 16px 0;
    color: var(--color-text-muted);
    font-size: 0.95rem;
}

.btn-large {
    padding: 10px 20px;
    font-size: 0.95rem;
}

.full-page-hero-preview {
    position: relative;
    max-width: 580px;
    width: 100%;
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(0,0,0,0.12);
    border: 1px solid var(--color-border);
    transition: transform 0.2s, box-shadow 0.2s;
}

.full-page-hero-preview:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 25px rgba(0,0,0,0.18);
}

.full-page-hero-preview img {
    display: block;
    width: 100%;
    height: auto;
}

.hero-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.05);
    display: flex;
    justify-content: center;
    align-items: center;
    transition: background 0.2s;
}

.full-page-hero-preview:hover .hero-overlay {
    background: rgba(15, 23, 42, 0.45);
}

.hero-callout {
    color: white;
    font-weight: 600;
    font-size: 16px;
    background: rgba(15, 23, 42, 0.85);
    padding: 10px 20px;
    border-radius: 24px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: transform 0.2s;
}

.full-page-hero-preview:hover .hero-callout {
    transform: scale(1.05);
}

@media (max-width: 900px) {
    .layout-with-lines {
        grid-template-columns: 1fr;
    }
    .compact-page-reference {
        order: 2;
    }
}
</style>
