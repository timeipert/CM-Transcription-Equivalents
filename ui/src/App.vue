<script setup>
import { computed, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute();
const isPublic = computed(() => route.path.startsWith('/public'));
const isMenuOpen = ref(false);
</script>

<template>
  <div class="app-shell">
    <nav v-if="!isPublic" class="top-nav">
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

/* Responsive Nav */
.hamburger-btn {
  display: none;
  background: transparent;
  border: none;
  color: var(--color-surface);
  font-size: 1.5rem;
  padding: 0.5rem;
  cursor: pointer;
  z-index: 100;
}

@media (max-width: 768px) {
  .hamburger-btn {
    display: block;
  }
  
  .nav-links {
    position: fixed;
    top: 50px;
    left: 0;
    right: 0;
    background: var(--color-nav-bg);
    flex-direction: column;
    padding: 1rem;
    gap: 1rem;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    transform: translateY(-150%);
    opacity: 0;
    transition: all 0.3s ease-in-out;
    z-index: 99;
  }
  
  .nav-links.menu-open {
    transform: translateY(0);
    opacity: 1;
  }
  
  .nav-links a, .nav-links .public-ext-link {
    margin: 0 !important;
    text-align: center;
    padding: 0.75rem;
    width: 100%;
    box-sizing: border-box;
  }
}
</style>
