<script setup>
/**
 * Small cutout thumbnails for a pattern, taken from the polygon annotations,
 * so the library shows what the sign actually looks like on the page.
 */
import { computed } from 'vue';
import AnnotationCutout from '../AnnotationCutout.vue';
import { useImageManifest } from '../../composables/useImageManifest';

const props = defineProps({
    examples: { type: Array, default: () => [] },
    size: { type: Number, default: 58 },
    limit: { type: Number, default: 6 }
});

const { hasImage } = useImageManifest();

const visible = computed(() =>
    props.examples.filter(ex => ex.points && hasImage(ex.source, ex.folio)).slice(0, props.limit)
);

const hiddenCount = computed(() => Math.max(0, props.examples.length - visible.value.length));
</script>

<template>
<div class="examples">
    <div
        v-for="ex in visible"
        :key="ex.id"
        class="example"
        :title="`${ex.source} · ${ex.folio} / ${ex.lineName}`"
    >
        <AnnotationCutout
            :source="ex.source"
            :folio="ex.folio"
            :points="ex.points"
            :width="size"
            :height="Math.round(size * 0.72)"
            :padding="0.1"
            :hideLabel="true"
        />
    </div>
    <span v-if="hiddenCount > 0" class="more">+{{ hiddenCount }}</span>
    <span v-if="visible.length === 0 && hiddenCount === 0" class="no-examples">no image examples</span>
</div>
</template>

<style scoped>
.examples { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.example {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--color-surface);
    line-height: 0;
}
.more { font-size: 0.7rem; color: var(--color-text-muted); font-weight: 600; }
.no-examples { font-size: 0.7rem; color: var(--color-text-light); font-style: italic; }
</style>
