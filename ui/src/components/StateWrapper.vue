<script setup>
import { computed, useAttrs } from 'vue';

const props = defineProps({
  loading: { type: Boolean, default: false },
  error: { type: [String, Error, null], default: null },
  empty: { type: Boolean, default: false },
  loadingText: { type: String, default: 'Loading...' },
  emptyText: { type: String, default: 'No data available.' },
  emptyHint: { type: String, default: '' },
  errorMessage: { type: String, default: '' } // Override to stringify Error object
});

const emits = defineEmits(['retry']);
const attrs = useAttrs();

const errorText = computed(() => {
  if (props.errorMessage) return props.errorMessage;
  if (props.error instanceof Error) return props.error.message;
  return props.error;
});

const hasRetryEvent = computed(() => {
  return !!attrs.onRetry;
});
</script>

<template>
  <div v-if="loading" class="state-container loading-state">
    <div class="spinner"></div>
    <p>{{ loadingText }}</p>
  </div>
  
  <div v-else-if="error" class="state-container error-state">
    <div class="icon-danger">⚠️</div>
    <h4>Something went wrong</h4>
    <p class="error-msg">{{ errorText }}</p>
    <button v-if="hasRetryEvent" class="btn-primary retry-btn" @click="$emit('retry')">
      Try Again
    </button>
  </div>
  
  <div v-else-if="empty" class="state-container empty-state">
    <div class="icon-muted">📄</div>
    <h4>{{ emptyText }}</h4>
    <p v-if="emptyHint" class="empty-hint">{{ emptyHint }}</p>
  </div>
  
  <slot v-else></slot>
</template>

<style scoped>
.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.loading-state {
  color: var(--color-text-muted);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-surface-muted);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state {
  background: var(--color-danger-light);
  border: 1px solid var(--color-danger-muted);
  border-radius: 12px;
  color: var(--color-danger);
  max-width: 500px;
  margin: 40px auto;
}

.error-state h4 { margin: 10px 0; color: var(--color-danger-dark); }
.error-msg { font-family: monospace; font-size: 0.9em; opacity: 0.8; margin-bottom: 20px; }

.empty-state {
  color: var(--color-text-muted);
}
.empty-state h4 { margin: 10px 0; color: var(--color-text); font-size: 1.2rem; }
.empty-hint { font-size: 0.9rem; max-width: 400px; margin: 0 auto; }

.icon-danger, .icon-muted {
  font-size: 3rem;
  margin-bottom: 10px;
}
.icon-muted { opacity: 0.5; filter: grayscale(1); }

.retry-btn {
  background: var(--color-danger);
  color: white;
  border: none;
  padding: 8px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.retry-btn:hover {
  background: var(--color-danger-dark);
}
</style>
