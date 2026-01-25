<script setup>
import { computed } from 'vue';
import { renderSvg } from '../utils/svgRenderer';

const props = defineProps({
  pattern: { type: String, required: true },
  glyphs: { type: Object, required: true },
  isGroup: { type: Boolean, default: false }
});

const rendered = computed(() => {
    return renderSvg(props.pattern, props.glyphs, props.isGroup);
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
