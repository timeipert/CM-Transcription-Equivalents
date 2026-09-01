<script setup>
import { computed, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router'
import SaveReminder from './components/SaveReminder.vue';

const route = useRoute();
const isPublic = computed(() => route.path.startsWith('/public'));
const isSetup = computed(() => route.path === '/setup');
const isMenuOpen = ref(false);
</script>

<template>
  <div class="app-shell">
    <nav v-if="!isPublic && !isSetup" class="top-nav">
      <RouterLink to="/" class="nav-brand" aria-label="Neume Viewer home">
        <span class="brand-text">Neume Viewer</span>
      </RouterLink>
      <button class="hamburger-btn" @click="isMenuOpen = !isMenuOpen" :aria-expanded="isMenuOpen" aria-controls="nav-links" aria-label="Toggle navigation">
        <span v-if="!isMenuOpen">☰</span>
        <span v-else>✕</span>
      </button>
      <div id="nav-links" class="nav-links" :class="{ 'menu-open': isMenuOpen }" @click="isMenuOpen = false">
        <RouterLink to="/" active-class="active">Overview</RouterLink>
        <RouterLink to="/equivalents" active-class="active">Equivalents</RouterLink>
        <RouterLink to="/polygons" active-class="active">Manuscripts</RouterLink>
        <RouterLink to="/ommr" active-class="active">Import</RouterLink>
        <RouterLink to="/custom-manuscripts" active-class="active">Custom MSS</RouterLink>
        <RouterLink to="/settings" active-class="active">Settings</RouterLink>
        <span class="nav-sep" aria-hidden="true"></span>
        <SaveReminder />
        <a href="manual/index.html" target="_blank" class="nav-util manual-link">Manual</a>
        <a href="#/public" target="_blank" rel="noopener" class="nav-util public-ext-link">Public&nbsp;↗</a>
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
  min-height: 58px;
  background: linear-gradient(180deg, #263449 0%, var(--color-nav-bg) 100%);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex;
  align-items: center;
  padding: 0 var(--space-5);
  gap: var(--space-5);
  justify-content: space-between;
  position: relative;
  z-index: 100;
  box-shadow: 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.18);
}

.nav-brand {
  font-weight: 700;
  font-size: 1.12rem;
  color: var(--color-surface) !important;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  letter-spacing: -0.01em;
  text-decoration: none;
  white-space: nowrap;
}
.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(59,130,246,0.35);
}
.nav-brand:hover .brand-mark { transform: translateY(-1px); }
.brand-mark, .nav-brand:hover .brand-mark { transition: transform 0.2s ease; }

.nav-links {
  display: flex;
  align-items: center;
  gap: 2px;
}

.nav-links a {
  position: relative;
  color: var(--color-text-light);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  transition: color 0.15s ease, background 0.15s ease;
}

.nav-links a:hover {
  color: var(--color-surface);
  background: rgba(255, 255, 255, 0.07);
}

.nav-links a.active {
  color: var(--color-surface);
  background: rgba(255, 255, 255, 0.1);
  font-weight: 600;
}
/* Active underline indicator */
.nav-links a.active::after {
  content: "";
  position: absolute;
  left: 12px; right: 12px; bottom: -1px;
  height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
}

.nav-sep {
  width: 1px; height: 22px;
  background: rgba(255,255,255,0.12);
  margin: 0 var(--space-2);
}

.nav-util {
  color: var(--color-text-light) !important;
  font-size: 0.85rem;
}
.nav-util:hover { color: var(--color-surface) !important; background: rgba(255,255,255,0.07); }

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
