<script setup>
import { computed, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router'
import SaveReminder from './components/SaveReminder.vue';

import { watch, onMounted, onBeforeUnmount } from 'vue';

const route = useRoute();
const isPublic = computed(() => route.path.startsWith('/public'));
const isSetup = computed(() => route.path === '/setup');
const isMenuOpen = ref(false);

/**
 * The three ways a manuscript gets documented, each with the pages that belong
 * to it. `match` lists the route prefixes that should light the group up —
 * broader than the child links, because sub-editors (the region editor, a single
 * manuscript's table) live under the same workflow.
 */
const navGroups = [
    {
        key: 'iiif',
        label: 'IIIF',
        title: 'Manuscripts served over IIIF',
        match: ['/equivalents', '/polygons', '/annotations'],
        children: [
            { to: '/equivalents', label: 'Equivalents', hint: 'Pattern tables per manuscript' },
            { to: '/polygons', label: 'Manuscripts', hint: 'Browse folios and annotate line regions' }
        ]
    },
    {
        key: 'local',
        label: 'Local',
        title: 'Manuscripts documented from your own images — no IIIF',
        match: ['/custom-manuscripts'],
        children: [
            { to: '/custom-manuscripts', label: 'Custom Manuscripts', hint: 'Paste or upload your own snippets' }
        ]
    },
    {
        key: 'ommr',
        label: 'OMMR Import',
        title: 'Import an OMMR4all dataset',
        match: ['/ommr'],
        children: [
            { to: '/ommr', label: 'Import Dataset', hint: 'Load an OMMR4all export' }
        ]
    }
];

const openGroup = ref('');

function isGroupActive(g) {
    return g.match.some(p => route.path.startsWith(p));
}

function toggleGroup(key) {
    openGroup.value = openGroup.value === key ? '' : key;
}

// A dropdown left open over the new page is disorienting, so close on navigation.
watch(() => route.path, () => { openGroup.value = ''; isMenuOpen.value = false; });

function onDocClick(e) {
    if (!e.target.closest('.nav-group')) openGroup.value = '';
}
function onKey(e) {
    if (e.key === 'Escape') openGroup.value = '';
}
onMounted(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKey);
});
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
      <div id="nav-links" class="nav-links" :class="{ 'menu-open': isMenuOpen }">
        <RouterLink to="/" active-class="active" @click="isMenuOpen = false">Overview</RouterLink>

        <span class="nav-sep" aria-hidden="true"></span>

        <!-- One group per workflow; its pages live in the submenu. -->
        <div v-for="g in navGroups" :key="g.key" class="nav-group"
             :class="{ open: openGroup === g.key, active: isGroupActive(g) }">
          <button class="group-btn" :title="g.title"
                  :aria-expanded="openGroup === g.key" aria-haspopup="true"
                  @click.stop="toggleGroup(g.key)">
            {{ g.label }}
            <span class="caret" aria-hidden="true">▾</span>
          </button>
          <div class="submenu" :class="{ open: openGroup === g.key }">
            <RouterLink v-for="c in g.children" :key="c.to" :to="c.to"
                        class="submenu-item" active-class="sub-active"
                        @click="openGroup = ''; isMenuOpen = false">
              <span class="sub-label">{{ c.label }}</span>
              <span class="sub-hint">{{ c.hint }}</span>
            </RouterLink>
          </div>
        </div>

        <span class="nav-sep" aria-hidden="true"></span>

        <RouterLink to="/settings" active-class="active" @click="isMenuOpen = false">Settings</RouterLink>
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

/* --- Workflow groups with submenus --- */
.nav-group { position: relative; }

.group-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: transparent; border: none; cursor: pointer;
  color: var(--color-text-light);
  font-size: 0.9rem; font-weight: 500; font-family: inherit;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  transition: color 0.15s ease, background 0.15s ease;
}
.group-btn:hover { color: var(--color-surface); background: rgba(255,255,255,0.07); }
.nav-group.active .group-btn { color: var(--color-surface); background: rgba(255,255,255,0.1); font-weight: 600; }
.nav-group.open .group-btn { color: var(--color-surface); background: rgba(255,255,255,0.12); }

/* Active underline, matching the plain nav links */
.nav-group.active .group-btn::after {
  content: ""; position: absolute;
  left: 12px; right: 12px; bottom: -1px;
  height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
}

.caret { font-size: 0.65em; opacity: 0.7; transition: transform 0.15s ease; }
.nav-group.open .caret { transform: rotate(180deg); }

.submenu {
  display: none;
  position: absolute; top: calc(100% + 6px); left: 0;
  min-width: 250px; z-index: 200;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 28px rgba(0,0,0,0.22);
  padding: 6px;
  text-align: left;
}
.submenu.open { display: block; }

.submenu-item {
  display: flex; flex-direction: column; gap: 2px;
  padding: 9px 12px; border-radius: 6px;
  color: var(--color-text) !important;
  text-decoration: none;
}
.submenu-item:hover { background: var(--color-bg); }
.submenu-item.sub-active { background: var(--color-primary-light); }
.submenu-item.sub-active .sub-label { color: var(--color-primary-hover); }
.sub-label { font-size: 0.88rem; font-weight: 600; }
.sub-hint { font-size: 0.72rem; color: var(--color-text-muted); line-height: 1.35; }
/* The generic `.nav-links a` rules target the dark bar, not this light panel. */
.submenu-item.sub-active::after { display: none; }

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

  /* In the hamburger column a floating dropdown makes no sense: show each
     group's pages inline, indented under their heading. */
  .nav-group { width: 100%; }
  .group-btn { width: 100%; justify-content: center; }
  .nav-group.active .group-btn::after { display: none; }
  .caret { display: none; }

  .submenu {
    display: block;
    position: static;
    min-width: 0; width: 100%;
    background: transparent;
    border: none; box-shadow: none;
    padding: 0 0 var(--space-2);
  }
  .submenu-item {
    align-items: center; text-align: center;
    color: var(--color-text-light) !important;
    padding: 8px 12px;
  }
  .submenu-item:hover { background: rgba(255,255,255,0.07); }
  .submenu-item.sub-active { background: rgba(255,255,255,0.12); }
  .submenu-item.sub-active .sub-label { color: var(--color-surface); }
  .sub-hint { display: none; }
}
</style>
