<script setup>
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute();
const isPublic = computed(() => route.path.startsWith('/public'));
</script>

<template>
  <div class="app-shell">
    <nav v-if="!isPublic" class="top-nav">
      <div class="nav-brand">CM Transcription Equivalents</div>
      <div class="nav-links">
        <RouterLink to="/" active-class="active">Overview</RouterLink>
        <RouterLink to="/equivalents" active-class="active">Transcription Equivalents</RouterLink>
        <RouterLink to="/polygons" active-class="active">Manuscript Annotations</RouterLink>
        <RouterLink to="/settings" active-class="active">Settings</RouterLink>
        <a href="/manual/index.html" target="_blank" class="manual-link">User Manual</a>
        <RouterLink to="/public" target="_blank" class="public-ext-link">Public</RouterLink>
      </div>
    </nav>
    
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.top-nav {
  flex: 0 0 50px;
  background: var(--color-nav-bg);
  color: var(--color-surface);
  display: flex;
  align-items: center;
  padding: 0 20px;
  justify-content: space-between;
}

.nav-brand {
  font-weight: 700;
  font-size: 1.1em;
}

.nav-links a {
  color: rgb(177, 177, 177);
  text-decoration: none;
  margin-left: 20px;
  font-size: 0.95em;
  padding: 5px 10px;
  border-radius: 4px;
  transition: all 0.2s;
}

.nav-links a.active, .nav-links a:hover {
  color: rgb(244, 244, 244);
  background: rgba(255, 255, 255, 0.2);
  font-weight: 600;
}

.public-ext-link {
  margin-left: 40px !important;
  color: #60a5fa !important;
  font-weight: 700 !important;
}
.public-ext-link:hover {
  color: var(--color-primary-light) !important;
  background: rgba(96, 165, 250, 0.1) !important;
}

.manual-link {
  color: #4ade80 !important;
  font-weight: 600 !important;
}
.manual-link:hover {
  color: var(--color-success-muted) !important;
  background: rgba(74, 222, 128, 0.1) !important;
}

.main-content {
  flex: 1;
  overflow: auto; /* Allow scrolling */
  background: var(--color-bg);
  width: 100%;
}

/* Scrollbar styling for Webkit */
.main-content::-webkit-scrollbar { width: 8px; height: 8px; }
.main-content::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
</style>
