<script setup>
import { computed } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { splitCodeBySigns } from '../utils/signs';

/**
 * Renders a transcription code as a caption (e.g. "*uuVdd"), emphasising any
 * custom-sign letters. With code variants the distinction between two patterns
 * can be a single letter that is easy to miss in the rendered notation, so the
 * code is shown alongside the glyphs.
 */
const props = defineProps({
    pattern: { type: String, required: true }
});

const settings = useSettingsStore();

const segments = computed(() =>
    splitCodeBySigns(props.pattern, settings.customSigns.map(s => s.key))
);
</script>

<template>
  <code class="pattern-code" :title="pattern">
    <span v-for="(seg, i) in segments" :key="i" :class="{ 'sign': seg.isSign }">{{ seg.text }}</span>
  </code>
</template>

<style scoped>
.pattern-code {
    font-family: monospace;
    font-size: 11px;
    color: var(--color-text-muted);
    letter-spacing: 0.02em;
    white-space: nowrap;
}
.pattern-code .sign {
    color: var(--color-primary-hover);
    font-weight: 800;
    background: var(--color-primary-light);
    border-radius: 2px;
    padding: 0 2px;
}
</style>
