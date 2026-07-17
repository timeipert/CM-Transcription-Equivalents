<script setup>
import { computed, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute();
const isPublic = computed(() => route.path.startsWith('/public'));
const isSetup = computed(() => route.path === '/setup');
const isMenuOpen = ref(false);
</script>

<template>
  <div class="app-shell">
    <nav v-if="!isPublic && !isSetup" class="top-nav">
      <div class="nav-brand">CM Transcription Equivalents</div>
      <button class="hamburger-btn" @click="isMenuOpen = !isMenuOpen" :aria-expanded="isMenuOpen" aria-controls="nav-links" aria-label="Toggle navigation">
        <span v-if="!isMenuOpen">☰</span>
        <span v-else>✕</span>
      </button>
      <div id="nav-links" class="nav-links" :class="{ 'menu-open': isMenuOpen }" @click="isMenuOpen = false">
        <RouterLink to="/" active-class="active">Overview</RouterLink>
        <RouterLink to="/equivalents" active-class="active">Transcription Equivalents</RouterLink>
        <RouterLink to="/polygons" active-class="active">Manuscripts</RouterLink>
        <RouterLink to="/settings" active-class="active">Settings</RouterLink>
        <a href="manual/index.html" target="_blank" class="manual-link">User Manual</a>
        <a href="#/public" target="_blank" rel="noopener" class="public-ext-link">Public</a>
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
  width: 100%;
  overflow: hidden;
}

.top-nav {
  flex: 0 0 auto;
  min-height: 60px;
  background: var(--color-nav-bg);
  border-bottom: 1px solid rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  padding: 0 var(--space-4);
  justify-content: space-between;
  position: relative;
  z-index: 100;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}

.nav-brand {
  font-weight: 700;
  font-size: 1.25em;
  color: var(--color-surface);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  letter-spacing: -0.02em;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.nav-links a {
  color: var(--color-text-light);
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 500;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
}

.nav-links a:hover {
  color: var(--color-surface);
  background: rgba(255, 255, 255, 0.1);
}

.nav-links a.active {
  color: var(--color-surface);
  background: rgba(255, 255, 255, 0.15);
  font-weight: 600;
}

.public-ext-link {
  margin-left: var(--space-2);
  color: #60a5fa !important;
  background: rgba(96, 165, 250, 0.1);
}
.public-ext-link:hover {
  color: #93c5fd !important;
  background: rgba(96, 165, 250, 0.2) !important;
}

.manual-link {
  color: #4ade80 !important;
  background: rgba(74, 222, 128, 0.1);
}
.manual-link:hover {
  color: #86efac !important;
  background: rgba(74, 222, 128, 0.2) !important;
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

/* Responsive Nav */
.hamburger-btn {
  display: none;
  background: transparent;
  border: none;
  color: var(--color-surface);
  font-size: 1.5rem;
  padding: 0.5rem;
  cursor: pointer;
}

@media (max-width: 900px) {
  .hamburger-btn {
    display: block;
  }
  
  .nav-links {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--color-nav-bg);
    flex-direction: column;
    padding: var(--space-4);
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);
    border-bottom: 1px solid rgba(255,255,255,0.05);
    transform: translateY(-150%);
    opacity: 0;
    pointer-events: none;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .nav-links.menu-open {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }
  
  .nav-links a, .nav-links .public-ext-link {
    width: 100%;
    text-align: center;
    margin: 0;
  }
}
</style>
