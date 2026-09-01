<script setup>
import { computed } from 'vue';
import { renderSvg } from '../utils/svgRenderer';
import { resolveSignGlyphs } from '../utils/signs';
import { useSettingsStore } from '../stores/settings';

const settings = useSettingsStore();

const props = defineProps({
  pattern: { type: String, required: true },
  glyphs: { type: Object, required: true },
  isGroup: { type: Boolean, default: false }
});

const signGlyphs = computed(() => resolveSignGlyphs(settings.customSigns, props.glyphs));

const rendered = computed(() => {
    return renderSvg(props.pattern, props.glyphs, props.isGroup, signGlyphs.value);
});
</script>

<template>
  <svg 
    class="svg-pattern"
    :width="rendered.width" 
    :height="rendered.height" 
    :viewBox="rendered.viewBox"
    v-html="rendered.content"
  ></svg>
</template>

<style scoped>
.svg-pattern {
    display: block;
    margin: 0 auto;
}
</style>
