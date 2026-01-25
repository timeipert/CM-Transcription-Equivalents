<script setup>
import { computed } from 'vue';
import { useSettingsStore } from '../stores/settings';
import SvgPattern from './SvgPattern.vue';

const settings = useSettingsStore();

const props = defineProps({
  pattern: { type: String, required: true },
  glyphs: { type: Object, required: true },
});

const mode = computed(() => settings.displayMode);

const textRep = computed(() => {
    return props.pattern.replace(/u/g, 'u').replace(/d/g, 'd').replace(/e/g, 'e'); // Raw text
});

const arrowRep = computed(() => {
    return props.pattern.replace(/u/g, '↗').replace(/d/g, '↘').replace(/e/g, '→');
});
</script>

<template>
  <div class="pattern-display">
      <SvgPattern 
        v-if="mode === 'svg'" 
        :pattern="pattern" 
        :glyphs="glyphs" 
        :isGroup="false" 
      />
      <span v-else-if="mode === 'arrow'" class="mode-arrow">{{ arrowRep }}</span>
      <span v-else class="mode-text">{{ textRep }}</span>
  </div>
</template>

<style scoped>
.pattern-display {
    min-width: 40px;
    display: flex;
    justify-content: center;
    align-items: center;
}
.mode-arrow { font-size: 1.1em; color: #555; }
.mode-text { font-family: monospace; font-weight: bold; color: #333; }
</style>
